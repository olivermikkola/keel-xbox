"use client";

import type { Wllama as WllamaType, WllamaChatMessage } from "@wllama/wllama";
import type { Model as WllamaModelEntry } from "@wllama/wllama/esm/model-manager.js";

export type CachedBrowserModel = {
  url: string;
  sizeBytes: number;
  valid: boolean;
};

export type BrowserRuntimeState = {
  loadedKey: string | null;
  loadedLabel: string | null;
  loading: boolean;
  downloadingUrl: string | null;
  downloadProgress: number; // 0..1
  downloadLoadedBytes: number;
  downloadTotalBytes: number;
  multithread: boolean;
  webgpuSupported: boolean;
  nCtx: number;
};

const WLLAMA_ASSETS = {
  default: "/wllama/wllama.wasm",
};

class WllamaRuntimeManager {
  private instance: WllamaType | null = null;
  private loadedKey: string | null = null;
  private loadedLabel: string | null = null;
  private loading = false;
  private downloadingUrl: string | null = null;
  private downloadProgress = 0;
  private downloadLoadedBytes = 0;
  private downloadTotalBytes = 0;
  private multithread = false;
  private webgpuSupported = false;
  private nCtx = 2048;
  private listeners = new Set<() => void>();
  private snapshot: BrowserRuntimeState = {
    loadedKey: null,
    loadedLabel: null,
    loading: false,
    downloadingUrl: null,
    downloadProgress: 0,
    downloadLoadedBytes: 0,
    downloadTotalBytes: 0,
    multithread: false,
    webgpuSupported: false,
    nCtx: 2048,
  };

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private notify() {
    this.snapshot = {
      loadedKey: this.loadedKey,
      loadedLabel: this.loadedLabel,
      loading: this.loading,
      downloadingUrl: this.downloadingUrl,
      downloadProgress: this.downloadProgress,
      downloadLoadedBytes: this.downloadLoadedBytes,
      downloadTotalBytes: this.downloadTotalBytes,
      multithread: this.multithread,
      webgpuSupported: this.webgpuSupported,
      nCtx: this.nCtx,
    };
    for (const fn of this.listeners) fn();
  }

  getState(): BrowserRuntimeState {
    return this.snapshot;
  }

  private async ensureInstance(): Promise<WllamaType> {
    if (this.instance) return this.instance;
    const { Wllama, LoggerWithoutDebug } = await import("@wllama/wllama");
    const inst = new Wllama(WLLAMA_ASSETS, {
      allowOffline: true,
      suppressNativeLog: true,
      logger: LoggerWithoutDebug,
    });
    this.instance = inst;
    return inst;
  }

  async listCachedModels(): Promise<CachedBrowserModel[]> {
    if (typeof window === "undefined") return [];
    try {
      const inst = await this.ensureInstance();
      const entries = await inst.modelManager.getModels({ includeInvalid: false });
      return entries.map((m: WllamaModelEntry) => ({
        url: m.url,
        sizeBytes: m.size,
        valid: m.size > 0,
      }));
    } catch {
      return [];
    }
  }

  async downloadModel(
    url: string,
    signal?: AbortSignal,
  ): Promise<void> {
    const inst = await this.ensureInstance();
    this.downloadingUrl = url;
    this.downloadProgress = 0;
    this.downloadLoadedBytes = 0;
    this.downloadTotalBytes = 0;
    this.notify();

    try {
      await inst.modelManager.downloadModel(url, {
        signal,
        progressCallback: ({ loaded, total }) => {
          this.downloadLoadedBytes = loaded;
          this.downloadTotalBytes = total;
          this.downloadProgress = total > 0 ? Math.min(1, loaded / total) : 0;
          this.notify();
        },
      });
    } finally {
      this.downloadingUrl = null;
      this.notify();
    }
  }

  async deleteCachedModel(url: string): Promise<void> {
    const inst = await this.ensureInstance();
    const entries = await inst.modelManager.getModels({ includeInvalid: true });
    const match = entries.find((m) => m.url === url);
    if (match) {
      await match.remove();
    }
    if (this.loadedKey === url) {
      await this.unload();
    }
    this.notify();
  }

  async loadFromUrl(
    url: string,
    label: string,
    opts?: { nCtx?: number; signal?: AbortSignal },
  ): Promise<void> {
    if (this.loadedKey === url && this.instance?.isModelLoaded()) {
      return;
    }

    const nCtx = opts?.nCtx ?? 2048;
    const inst = await this.ensureInstance();

    if (inst.isModelLoaded()) {
      await inst.exit();
    }

    this.loading = true;
    this.downloadingUrl = url;
    this.downloadProgress = 0;
    this.notify();

    try {
      await inst.loadModelFromUrl(url, {
        n_ctx: nCtx,
        useCache: true,
        signal: opts?.signal,
        progressCallback: ({ loaded, total }) => {
          this.downloadLoadedBytes = loaded;
          this.downloadTotalBytes = total;
          this.downloadProgress = total > 0 ? Math.min(1, loaded / total) : 0;
          this.notify();
        },
      });
      this.loadedKey = url;
      this.loadedLabel = label;
      this.nCtx = nCtx;
      this.multithread = inst.isMultithread();
      this.webgpuSupported = inst.isSupportWebGPU();
    } finally {
      this.loading = false;
      this.downloadingUrl = null;
      this.notify();
    }
  }

  async loadFromLocalFiles(
    files: File[],
    opts?: { nCtx?: number },
  ): Promise<void> {
    if (files.length === 0) {
      throw new Error("Select at least one .gguf file.");
    }
    const nCtx = opts?.nCtx ?? 2048;
    const inst = await this.ensureInstance();
    if (inst.isModelLoaded()) {
      await inst.exit();
    }

    this.loading = true;
    this.notify();
    try {
      await inst.loadModel(files, { n_ctx: nCtx });
      const label = files[0]!.name;
      this.loadedKey = `local:${label}`;
      this.loadedLabel = label;
      this.nCtx = nCtx;
      this.multithread = inst.isMultithread();
      this.webgpuSupported = inst.isSupportWebGPU();
    } finally {
      this.loading = false;
      this.notify();
    }
  }

  async unload(): Promise<void> {
    if (this.instance?.isModelLoaded()) {
      await this.instance.exit();
    }
    this.loadedKey = null;
    this.loadedLabel = null;
    this.notify();
  }

  isLoaded(): boolean {
    return Boolean(this.instance?.isModelLoaded() && this.loadedKey);
  }

  async streamChat(
    messages: WllamaChatMessage[],
    opts: {
      temperature: number;
      maxTokens: number;
      signal?: AbortSignal;
      onToken: (token: string) => void;
    },
  ): Promise<void> {
    if (!this.instance || !this.instance.isModelLoaded()) {
      throw new Error("No GGUF model is loaded in browser memory yet.");
    }

    const stream = await this.instance.createChatCompletion({
      messages,
      stream: true,
      temperature: opts.temperature,
      max_tokens: opts.maxTokens,
      abortSignal: opts.signal,
    });

    for await (const chunk of stream) {
      if (opts.signal?.aborted) break;
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) {
        opts.onToken(delta);
      }
    }
  }
}

export const wllamaRuntime = new WllamaRuntimeManager();
