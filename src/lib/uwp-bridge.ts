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
  DownloadLocalModel?: (requestJson: string) => Promise<void> | void;
  CancelDownload?: () => Promise<void> | void;
  DeleteLocalModel?: (fileName: string) => Promise<string> | string;
};

type WebViewMessageListener = (event: { data: unknown }) => void;

declare global {
  interface Window {
    /** Set by the UWP shell (MainPage.xaml.cs) before any page script runs. */
    __keelUwpHost?: number;
    chrome?: {
      webview?: {
        postMessage?: (message: unknown) => void;
        addEventListener?: (type: string, listener: WebViewMessageListener) => void;
        removeEventListener?: (type: string, listener: WebViewMessageListener) => void;
      };
    };
  }
}

/**
 * UWP cannot expose a C# object to script via AddHostObjectToScript (that needs a
 * wv2winrt C++/WinRT projection), so the shell speaks a tiny RPC over WebView2 web
 * messages instead. This builds an object with the same method names on top of it.
 */
let cachedBridge: KeelNativeHostObject | null = null;

function createRpcBridge(): KeelNativeHostObject {
  const webview = window.chrome!.webview!;
  const pending = new Map<
    string,
    { resolve: (value: string) => void; reject: (err: Error) => void }
  >();
  let seq = 0;

  webview.addEventListener?.("message", (event) => {
    let msg: Record<string, unknown> | null = null;
    try {
      msg =
        typeof event.data === "string"
          ? (JSON.parse(event.data) as Record<string, unknown>)
          : (event.data as Record<string, unknown>);
    } catch {
      return;
    }
    if (!msg || msg.kind !== "keel-rpc-result" || typeof msg.id !== "string") return;
    const entry = pending.get(msg.id);
    if (!entry) return;
    pending.delete(msg.id);
    if (msg.ok) {
      entry.resolve(typeof msg.result === "string" ? msg.result : "");
    } else {
      entry.reject(new Error(String(msg.error ?? "Keel bridge call failed")));
    }
  });

  const call = (method: string, ...args: string[]) =>
    new Promise<string>((resolve, reject) => {
      seq += 1;
      const id = `rpc-${Date.now()}-${seq}`;
      pending.set(id, { resolve, reject });
      try {
        webview.postMessage!(JSON.stringify({ kind: "keel-rpc", id, method, args }));
      } catch (err) {
        pending.delete(id);
        reject(err instanceof Error ? err : new Error("postMessage failed"));
      }
    });

  return {
    GetSystemInfoJson: () => call("GetSystemInfoJson"),
    ListLocalModelsJson: () => call("ListLocalModelsJson"),
    StreamChat: (requestJson) => call("StreamChat", requestJson),
    CancelChat: () => call("CancelChat").then(() => undefined),
    DiscoverLanHostsJson: () => call("DiscoverLanHostsJson"),
    ProbeLocalServerJson: (baseUrl, pairingCode) =>
      call("ProbeLocalServerJson", baseUrl, pairingCode),
    StreamServerChat: (requestJson) => call("StreamServerChat", requestJson),
    DownloadLocalModel: (requestJson) =>
      call("DownloadLocalModel", requestJson).then(() => undefined),
    CancelDownload: () => call("CancelDownload").then(() => undefined),
    DeleteLocalModel: (fileName) => call("DeleteLocalModel", fileName),
  };
}

function getBridge(): KeelNativeHostObject | null {
  if (!isUwpHostAvailable()) return null;
  if (!cachedBridge) cachedBridge = createRpcBridge();
  return cachedBridge;
}

export function isUwpHostAvailable(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(window.__keelUwpHost && window.chrome?.webview?.postMessage);
}

export async function getUwpSystemInfo(): Promise<UwpSystemInfo | null> {
  const bridge = getBridge();
  if (!bridge?.GetSystemInfoJson) return null;
  try {
    const raw = await bridge.GetSystemInfoJson();
    return JSON.parse(raw) as UwpSystemInfo;
  } catch {
    return null;
  }
}

export async function listUwpLocalModels(): Promise<UwpLocalModelEntry[]> {
  const bridge = getBridge();
  if (!bridge?.ListLocalModelsJson) return [];
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
  const bridge = getBridge();
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
  const bridge = getBridge();
  if (!bridge?.DiscoverLanHostsJson) return [];
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
  const bridge = getBridge();
  if (!bridge?.ProbeLocalServerJson) return null;
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
  const bridge = getBridge();
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

export async function downloadUwpLocalModel(
  url: string,
  fileName: string,
  onProgress: (loaded: number, total: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  const webview = window.chrome?.webview;
  const bridge = getBridge();
  if (!bridge?.DownloadLocalModel) {
    throw new Error("UWP download bridge is unavailable.");
  }

  const requestId = `dl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  await new Promise<void>((resolve, reject) => {
    const onMessage = (event: { data: unknown }) => {
      try {
        const msg =
          typeof event.data === "string"
            ? (JSON.parse(event.data) as Record<string, unknown>)
            : (event.data as Record<string, unknown>);
        if (!msg || msg.requestId !== requestId) return;
        if (msg.type === "progress") {
          onProgress(Number(msg.loaded ?? 0), Number(msg.total ?? -1));
        } else if (msg.type === "done") {
          cleanup();
          resolve();
        } else if (msg.type === "error") {
          cleanup();
          reject(new Error(String(msg.error ?? "UWP download failed")));
        }
      } catch (err) {
        cleanup();
        reject(err instanceof Error ? err : new Error("Invalid bridge message"));
      }
    };

    const onAbort = () => {
      void bridge.CancelDownload?.();
      cleanup();
      reject(new DOMException("Aborted", "AbortError"));
    };

    const cleanup = () => {
      webview?.removeEventListener?.("message", onMessage);
      signal?.removeEventListener("abort", onAbort);
    };

    webview?.addEventListener?.("message", onMessage);
    signal?.addEventListener("abort", onAbort, { once: true });

    Promise.resolve(
      bridge.DownloadLocalModel!(JSON.stringify({ requestId, url, fileName })),
    ).catch((err: unknown) => {
      cleanup();
      reject(err instanceof Error ? err : new Error("Download call failed"));
    });
  });
}

export async function deleteUwpLocalModel(fileName: string): Promise<void> {
  const bridge = getBridge();
  if (!bridge?.DeleteLocalModel) return;
  const raw = await bridge.DeleteLocalModel(fileName);
  const parsed = JSON.parse(raw) as { ok?: boolean; error?: string };
  if (!parsed.ok) {
    throw new Error(parsed.error ?? "Failed to remove model.");
  }
}
