export type UwpSystemInfo = {
  deviceFamily: string;
  localStatePath: string;
  availableMemoryMb: number;
  singleFileLimitMb: number;
  runtimeAvailable: boolean;
  engineName: string;
};

export type UwpLocalModelEntry = {
  fileName: string;
  sizeBytes: number;
  backend: "uwp-ort" | "directml-fp16" | "llama-cpp";
};

type KeelNativeHostObject = {
  GetSystemInfoJson?: () => Promise<string> | string;
  ListLocalModelsJson?: () => Promise<string> | string;
  StreamChat?: (requestJson: string) => Promise<string> | string;
  CancelChat?: () => Promise<void> | void;
  DiscoverLanHostsJson?: () => Promise<string> | string;
  ProbeLocalServerJson?: (
    baseUrl: string,
    pairingCode: string,
  ) => Promise<string> | string;
  StreamServerChat?: (requestJson: string) => Promise<string> | string;
};

declare global {
  interface Window {
    chrome?: {
      webview?: {
        hostObjects?: {
          keelBridge?: KeelNativeHostObject;
        };
        addEventListener?: (
          type: string,
          listener: (event: { data: unknown }) => void,
        ) => void;
        removeEventListener?: (
          type: string,
          listener: (event: { data: unknown }) => void,
        ) => void;
      };
    };
  }
}

export function isUwpHostAvailable(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(window.chrome?.webview?.hostObjects?.keelBridge);
}

export async function getUwpSystemInfo(): Promise<UwpSystemInfo | null> {
  if (!isUwpHostAvailable()) return null;
  const bridge = window.chrome!.webview!.hostObjects!.keelBridge!;
  if (!bridge.GetSystemInfoJson) return null;
  try {
    const raw = await bridge.GetSystemInfoJson();
    return JSON.parse(raw) as UwpSystemInfo;
  } catch {
    return null;
  }
}

export async function listUwpLocalModels(): Promise<UwpLocalModelEntry[]> {
  if (!isUwpHostAvailable()) return [];
  const bridge = window.chrome!.webview!.hostObjects!.keelBridge!;
  if (!bridge.ListLocalModelsJson) return [];
  try {
    const raw = await bridge.ListLocalModelsJson();
    const parsed = JSON.parse(raw) as UwpLocalModelEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function streamUwpInference(
  payload: {
    modelFile: string;
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
    temperature: number;
    maxTokens: number;
  },
  handlers: {
    onToken: (token: string) => void;
    signal?: AbortSignal;
  },
): Promise<void> {
  const webview = window.chrome?.webview;
  const bridge = webview?.hostObjects?.keelBridge;
  if (!bridge?.StreamChat) {
    throw new Error("UWP native bridge is not attached in this browser session.");
  }

  const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  await new Promise<void>((resolve, reject) => {
    const onMessage = (event: { data: unknown }) => {
      try {
        const msg =
          typeof event.data === "string"
            ? (JSON.parse(event.data) as Record<string, unknown>)
            : (event.data as Record<string, unknown>);
        if (!msg || msg.requestId !== requestId) return;
        if (msg.type === "token" && typeof msg.token === "string") {
          handlers.onToken(msg.token);
        } else if (msg.type === "done") {
          cleanup();
          resolve();
        } else if (msg.type === "error") {
          cleanup();
          reject(new Error(String(msg.error ?? "UWP inference error")));
        }
      } catch (err) {
        cleanup();
        reject(err instanceof Error ? err : new Error("Invalid bridge message"));
      }
    };

    const onAbort = () => {
      void bridge.CancelChat?.();
      cleanup();
      reject(new DOMException("Aborted", "AbortError"));
    };

    const cleanup = () => {
      webview?.removeEventListener?.("message", onMessage);
      handlers.signal?.removeEventListener("abort", onAbort);
    };

    webview?.addEventListener?.("message", onMessage);
    handlers.signal?.addEventListener("abort", onAbort, { once: true });

    Promise.resolve(
      bridge.StreamChat!(JSON.stringify({ requestId, ...payload })),
    ).catch((err: unknown) => {
      cleanup();
      reject(err instanceof Error ? err : new Error("Bridge call failed"));
    });
  });
}

export async function discoverUwpLanHosts(): Promise<unknown[]> {
  if (!isUwpHostAvailable()) return [];
  const bridge = window.chrome!.webview!.hostObjects!.keelBridge!;
  if (!bridge.DiscoverLanHostsJson) return [];
  try {
    const raw = await bridge.DiscoverLanHostsJson();
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function probeUwpLocalServer(
  baseUrl: string,
  pairingCode = "",
): Promise<{
  ok: boolean;
  flavor?: "ollama" | "openai";
  latencyMs?: number;
  models?: Array<{ id: string; sizeBytes?: number; flavor: "ollama" | "openai" }>;
  requiresPin?: boolean;
  error?: string;
} | null> {
  if (!isUwpHostAvailable()) return null;
  const bridge = window.chrome!.webview!.hostObjects!.keelBridge!;
  if (!bridge.ProbeLocalServerJson) return null;
  try {
    const raw = await bridge.ProbeLocalServerJson(baseUrl, pairingCode);
    return JSON.parse(raw);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "UWP server probe failed.",
    };
  }
}

export async function streamUwpServerChat(
  payload: {
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
  const webview = window.chrome?.webview;
  const bridge = webview?.hostObjects?.keelBridge;
  if (!bridge?.StreamServerChat) {
    throw new Error("UWP LAN chat bridge is unavailable.");
  }

  const requestId = `lan-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  await new Promise<void>((resolve, reject) => {
    const onMessage = (event: { data: unknown }) => {
      try {
        const msg =
          typeof event.data === "string"
            ? (JSON.parse(event.data) as Record<string, unknown>)
            : (event.data as Record<string, unknown>);
        if (!msg || msg.requestId !== requestId) return;
        if (msg.type === "token" && typeof msg.token === "string") {
          handlers.onToken(msg.token);
        } else if (msg.type === "done") {
          cleanup();
          resolve();
        } else if (msg.type === "error") {
          cleanup();
          reject(new Error(String(msg.error ?? "UWP LAN chat error")));
        }
      } catch (err) {
        cleanup();
        reject(err instanceof Error ? err : new Error("Invalid bridge message"));
      }
    };

    const onAbort = () => {
      void bridge.CancelChat?.();
      cleanup();
      reject(new DOMException("Aborted", "AbortError"));
    };

    const cleanup = () => {
      webview?.removeEventListener?.("message", onMessage);
      handlers.signal?.removeEventListener("abort", onAbort);
    };

    webview?.addEventListener?.("message", onMessage);
    handlers.signal?.addEventListener("abort", onAbort, { once: true });

    Promise.resolve(
      bridge.StreamServerChat!(JSON.stringify({ requestId, ...payload })),
    ).catch((err: unknown) => {
      cleanup();
      reject(err instanceof Error ? err : new Error("UWP LAN bridge call failed"));
    });
  });
}
