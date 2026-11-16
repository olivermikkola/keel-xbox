"use client";

import type { KeelModel, RuntimeMode } from "@/lib/models";
import { streamLocalServerChat } from "@/lib/server-runtime";
import { streamUwpInference } from "@/lib/uwp-bridge";
import { wllamaRuntime } from "@/lib/wllama-runtime";

const PREVIEW_REPLIES = [
  "Keel keeps inference on the console — no cloud round-trip. In Preview Simulator mode, token cadence mirrors Series S class decode; download a GGUF in Models or connect Ollama / llama-server to run real weights.",
  "Think of Keel Console as an Xbox app first: 10-foot safe zones, real gamepad D-pad & trigger navigation, and compact sub-1B models sized for AppContainer LocalState.",
  "Prefill can ride DirectML on UWP, while token-by-token decode at 350M–0.8B often wins on Zen 2 CPU. Load a cached GGUF in Models to benchmark real WASM tokens/sec right here.",
  "Ship path: iterate the 10-foot experience here, sideload the UWP WebView2 + ONNX Runtime GenAI shell in native/xbox/ on Xbox Dev Mode, and submit under Microsoft Store Policy 11.16.",
];

export type InferenceStats = {
  tokens: number;
  elapsedMs: number;
  tps: number;
};

export type StreamReplyParams = {
  runtimeMode: RuntimeMode;
  model: KeelModel;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  temperature: number;
  maxTokens: number;
  serverUrl: string;
  serverModel: string;
  onToken: (token: string, stats: InferenceStats) => void;
  onDone: (stats: InferenceStats) => void;
  signal?: AbortSignal;
};

function tokenizePreview(text: string): string[] {
  return text.match(/\S+\s*/g) ?? [text];
}

function pickPreviewReply(prompt: string): string {
  const idx =
    Math.abs(
      Array.from(prompt).reduce((acc, ch) => acc + ch.charCodeAt(0), 0),
    ) % PREVIEW_REPLIES.length;
  return PREVIEW_REPLIES[idx]!;
}

export async function streamReply(params: StreamReplyParams): Promise<void> {
  const started = performance.now();
  let count = 0;

  const emitToken = (token: string) => {
    count += 1;
    const elapsedMs = Math.max(performance.now() - started, 1);
    const tps = count / (elapsedMs / 1000);
    params.onToken(token, { tokens: count, elapsedMs, tps });
  };

  if (params.runtimeMode === "browser-wasm") {
    if (!wllamaRuntime.isLoaded()) {
      throw new Error(
        "No GGUF model is loaded in browser memory. Download or load a model in Models, or switch to Local Server / Preview Simulator.",
      );
    }
    await wllamaRuntime.streamChat(params.messages, {
      temperature: params.temperature,
      maxTokens: params.maxTokens,
      signal: params.signal,
      onToken: emitToken,
    });
  } else if (params.runtimeMode === "local-server") {
    if (!params.serverModel.trim()) {
      throw new Error(
        "Select a model on your Local / LAN server in Models before sending.",
      );
    }
    await streamLocalServerChat(
      {
        baseUrl: params.serverUrl,
        model: params.serverModel,
        messages: params.messages,
        temperature: params.temperature,
        maxTokens: params.maxTokens,
      },
      {
        signal: params.signal,
        onToken: emitToken,
      },
    );
  } else if (params.runtimeMode === "uwp-native") {
    await streamUwpInference(
      {
        modelFile: params.model.ggufFileName ?? `${params.model.id}.onnx`,
        messages: params.messages,
        temperature: params.temperature,
        maxTokens: params.maxTokens,
      },
      {
        signal: params.signal,
        onToken: emitToken,
      },
    );
  } else {
    // Explicit Preview Simulator mode
    const lastUser =
      [...params.messages].reverse().find((m) => m.role === "user")?.content ??
      "keel";
    const tokens = tokenizePreview(pickPreviewReply(lastUser));
    const msPerToken = 1000 / Math.max(params.model.tokensPerSec, 1);
    for (const token of tokens) {
      if (params.signal?.aborted) break;
      await sleep(msPerToken, params.signal);
      if (params.signal?.aborted) break;
      emitToken(token);
    }
  }

  const elapsedMs = Math.max(performance.now() - started, 1);
  const tps = count / (elapsedMs / 1000);
  params.onDone({ tokens: count, elapsedMs, tps });
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const id = window.setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        window.clearTimeout(id);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}
