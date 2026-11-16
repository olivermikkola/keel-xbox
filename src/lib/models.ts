export type ModelBackend = "wasm-gguf" | "uwp-ort" | "directml-fp16" | "server-api";
export type ModelStatus = "ready" | "available" | "blocked";
export type RuntimeMode = "browser-wasm" | "local-server" | "uwp-native" | "preview";

export const XBOX_SINGLE_FILE_LIMIT_MB = 2048;

export type KeelModel = {
  id: string;
  name: string;
  family: string;
  params: string;
  sizeLabel: string;
  sizeMb: number;
  exactBytes?: number;
  ggufUrl?: string;
  ggufFileName?: string;
  backend: ModelBackend;
  /** Measured / estimated decode tokens per second on Xbox Series S class hardware */
  tokensPerSec: number;
  prefillTokPerSec?: number;
  status: ModelStatus;
  blurb: string;
  xboxNote: string;
  defaultTemp?: number;
};

export type PromptPreset = {
  id: string;
  label: string;
  summary: string;
  systemPrompt: string;
  quickPrompts: string[];
};

export const PROMPT_PRESETS: PromptPreset[] = [
  {
    id: "general",
    label: "Living room",
    summary: "Clear, concise replies sized for a TV screen.",
    systemPrompt:
      "You are Keel Console, a concise, helpful on-device AI assistant running on Xbox. Keep answers crisp, readable from a couch at 10 feet, and well-structured without unnecessary filler.",
    quickPrompts: [
      "Summarize how on-device LLMs work on Xbox Series S.",
      "Give me a 5-bullet checklist for a cozy indie game night.",
      "Explain why small quantized models beat giant ones in memory.",
    ],
  },
  {
    id: "companion",
    label: "Game companion",
    summary: "Quick mechanics help, build ideas, and spoiler-free hints.",
    systemPrompt:
      "You are Keel Console in Game Companion mode. Give spoiler-free hints first, clear step-by-step mechanics breakdowns, and keep paragraphs short for easy reading on a TV.",
    quickPrompts: [
      "Give me spoiler-free tips for starting a Soulslike build.",
      "How do I balance DPS vs survivability in an action RPG?",
      "Help me plan a 2-hour co-op couch session.",
    ],
  },
  {
    id: "explain",
    label: "Explain simply",
    summary: "Plain-language breakdowns with analogies and zero jargon.",
    systemPrompt:
      "You are Keel Console in Plain Language mode. Explain concepts simply in 2-4 short paragraphs with concrete everyday analogies suitable for reading from across the room.",
    quickPrompts: [
      "What does Q4_K_M quantization mean in plain English?",
      "Why does DirectML help prefill while CPU often wins decode?",
      "Explain unified memory on a console like I am new to hardware.",
    ],
  },
  {
    id: "dev",
    label: "Code & UWP",
    summary: "Xbox Dev Mode, UWP AppContainer, and local runtime notes.",
    systemPrompt:
      "You are Keel Console in Dev mode. Provide accurate, practical guidance for UWP Xbox apps, WebView2 bridges, ONNX Runtime GenAI, llama.cpp, and Microsoft Store packaging.",
    quickPrompts: [
      "What triggers Store Policy 11.16 for Generative AI apps?",
      "How does WebView2 talk to C# WinRT LocalState on Xbox?",
      "List WACK pitfalls when packaging native inference DLLs.",
    ],
  },
];

export const KEEL_MODELS: KeelModel[] = [
  {
    id: "lfm25-350m-q4",
    name: "LFM2.5 350M",
    family: "Instruct · GGUF",
    params: "350M",
    sizeLabel: "219 MiB",
    sizeMb: 219,
    exactBytes: 229312224,
    ggufUrl:
      "https://huggingface.co/LiquidAI/LFM2.5-350M-GGUF/resolve/main/LFM2.5-350M-Q4_K_M.gguf",
    ggufFileName: "LFM2.5-350M-Q4_K_M.gguf",
    backend: "wasm-gguf",
    tokensPerSec: 94,
    status: "ready",
    blurb: "Smallest footprint in the catalogue. Downloads quickly and runs well in browser WASM or Series S CPU.",
    xboxNote: "GGUF Q4_K_M · 219 MiB · ~94 tok/s on Series S class Zen 2 CPU.",
    defaultTemp: 0.5,
  },
  {
    id: "smollm2-360m-q4",
    name: "SmolLM2 360M",
    family: "Instruct · GGUF",
    params: "360M",
    sizeLabel: "258 MiB",
    sizeMb: 258,
    exactBytes: 270590880,
    ggufUrl:
      "https://huggingface.co/bartowski/SmolLM2-360M-Instruct-GGUF/resolve/main/SmolLM2-360M-Instruct-Q4_K_M.gguf",
    ggufFileName: "SmolLM2-360M-Instruct-Q4_K_M.gguf",
    backend: "wasm-gguf",
    tokensPerSec: 66,
    prefillTokPerSec: 180,
    status: "ready",
    blurb: "Balanced fast default for couch chat. Fits comfortably in browser cache and Xbox LocalState.",
    xboxNote: "Q4_K_M / INT4 · ~66 tok/s decode on Series S class hardware.",
    defaultTemp: 0.6,
  },
  {
    id: "qwen25-05b-q4",
    name: "Qwen2.5 0.5B",
    family: "Instruct · GGUF",
    params: "0.5B",
    sizeLabel: "469 MiB",
    sizeMb: 469,
    exactBytes: 491400032,
    ggufUrl:
      "https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf",
    ggufFileName: "qwen2.5-0.5b-instruct-q4_k_m.gguf",
    backend: "wasm-gguf",
    tokensPerSec: 46,
    status: "ready",
    blurb: "Sharper instruction following and structured lists while staying well under AppContainer ceilings.",
    xboxNote: "GGUF Q4_K_M · 469 MiB · fits cleanly in Edge WASM & UWP LocalState.",
    defaultTemp: 0.6,
  },
  {
    id: "qwen35-08b-q4",
    name: "Qwen3.5 0.8B",
    family: "Instruct · GGUF",
    params: "0.8B",
    sizeLabel: "508 MiB",
    sizeMb: 508,
    exactBytes: 532517120,
    ggufUrl:
      "https://huggingface.co/unsloth/Qwen3.5-0.8B-GGUF/resolve/main/Qwen3.5-0.8B-Q4_K_M.gguf",
    ggufFileName: "Qwen3.5-0.8B-Q4_K_M.gguf",
    backend: "wasm-gguf",
    tokensPerSec: 35,
    status: "available",
    blurb: "More reasoning headroom without leaving the living room. Best on native UWP or high-RAM Edge tabs.",
    xboxNote: "Under Xbox per-file ceiling; ~35 tok/s native decode.",
    defaultTemp: 0.6,
  },
  {
    id: "smollm2-360m-dml",
    name: "SmolLM2 360M DirectML",
    family: "UWP Native · ONNX",
    params: "360M",
    sizeLabel: "~700 MiB",
    sizeMb: 700,
    backend: "directml-fp16",
    tokensPerSec: 58,
    prefillTokPerSec: 354,
    status: "available",
    blurb: "UWP Dev Mode target: routes long prompts to DirectML FP16 for faster first-token prefill.",
    xboxNote: "Requires native UWP ORT GenAI package (`native/xbox/`); GPU wins prefill.",
  },
  {
    id: "phi35-mini-int4",
    name: "Phi-3.5 Mini",
    family: "Borderline · 3.8B",
    params: "3.8B",
    sizeLabel: "~2.7 GB",
    sizeMb: 2700,
    backend: "uwp-ort",
    tokensPerSec: 12,
    status: "blocked",
    blurb: "Exceeds Xbox ~2 GB single-file ONNX & browser ArrayBuffer limits today. Tracked for sharded UWP.",
    xboxNote: "Blocked by 2 GB per-file ceiling on current AppContainer / WASM32 paths.",
  },
];

export function getModel(id: string): KeelModel | undefined {
  return KEEL_MODELS.find((m) => m.id === id);
}

export function getPreset(id: string): PromptPreset {
  return PROMPT_PRESETS.find((p) => p.id === id) ?? PROMPT_PRESETS[0]!;
}

export function backendLabel(backend: ModelBackend): string {
  switch (backend) {
    case "wasm-gguf":
      return "WASM GGUF";
    case "uwp-ort":
      return "UWP ORT";
    case "directml-fp16":
      return "DirectML FP16";
    case "server-api":
      return "Local Server";
  }
}

export function runtimeModeLabel(mode: RuntimeMode): string {
  switch (mode) {
    case "browser-wasm":
      return "On-Device WASM";
    case "local-server":
      return "Local / LAN Server";
    case "uwp-native":
      return "UWP Native Bridge";
    case "preview":
      return "Preview Simulator";
  }
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KiB", "MiB", "GiB"];
  let idx = 0;
  let value = bytes;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  return `${value.toFixed(idx >= 2 ? 1 : 0)} ${units[idx]}`;
}
