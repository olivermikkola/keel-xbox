"use client";

import {
  discoverUwpLanHosts,
  isUwpHostAvailable,
  probeUwpLocalServer,
  streamUwpServerChat,
} from "@/lib/uwp-bridge";

export type ServerModelInfo = {
  id: string;
  sizeBytes?: number;
  flavor: "ollama" | "openai";
};

export type ServerProbeResult = {
  ok: boolean;
  flavor?: "ollama" | "openai";
  latencyMs?: number;
  models?: ServerModelInfo[];
  requiresPin?: boolean;
  error?: string;
};

export type DiscoveredLanHost = {
  id: string;
  name: string;
  url: string;
  kind: "keel-desktop" | "ollama" | "llama-server";
  activeModel?: string | null;
  runtimeState?: string;
  pairingRequired: boolean;
  latencyMs: number;
};

export async function discoverLanHosts(opts?: {
  extraHost?: string;
}): Promise<DiscoveredLanHost[]> {
  if (isUwpHostAvailable()) {
    const hosts = await discoverUwpLanHosts();
    if (hosts.length > 0) {
      return hosts as DiscoveredLanHost[];
    }
  }
  const res = await fetch("/api/server/discover", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts ?? {}),
  });
  if (!res.ok) {
    return [];
  }
  const json = (await res.json()) as { hosts?: DiscoveredLanHost[] };
  return Array.isArray(json.hosts) ? json.hosts : [];
}

export async function probeLocalServer(
  baseUrl: string,
  pairingCode = "",
): Promise<ServerProbeResult> {
  if (isUwpHostAvailable()) {
    const uwpRes = await probeUwpLocalServer(baseUrl, pairingCode);
    if (uwpRes) return uwpRes;
  }
  const res = await fetch("/api/server/models", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ baseUrl, pairingCode }),
  });
  return (await res.json()) as ServerProbeResult;
}

export async function streamLocalServerChat(
  params: {
    baseUrl: string;
    pairingCode?: string;
    model: string;
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
    temperature: number;
    maxTokens: number;
  },
  handlers: {
    onToken: (token: string) => void;
    signal?: AbortSignal;
  },
): Promise<void> {
  if (isUwpHostAvailable()) {
    await streamUwpServerChat(params, handlers);
    return;
  }

  const res = await fetch("/api/server/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: handlers.signal,
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    let errMsg = `Local server returned HTTP ${res.status}.`;
    try {
      const json = (await res.json()) as { error?: string };
      if (json.error) errMsg = json.error;
    } catch {
      // Ignore parse failure
    }
    throw new Error(errMsg);
  }

  if (!res.body) {
    throw new Error("Server returned an empty response body.");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line.startsWith("data:")) continue;
        const payloadStr = line.slice(5).trim();
        if (!payloadStr) continue;
        const evt = JSON.parse(payloadStr) as {
          token?: string;
          error?: string;
          done?: boolean;
        };
        if (evt.error) {
          throw new Error(evt.error);
        }
        if (evt.token) {
          handlers.onToken(evt.token);
        }
        if (evt.done) {
          return;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
