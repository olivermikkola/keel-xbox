import type { RuntimeMode } from "@/lib/models";

export type KeelAccent = "sage" | "copper" | "ice";
export type KeelTone = "ink" | "slate";
export type SafeZoneMode = "standard" | "overscan";
export type TextScaleMode = "large" | "compact";

export type KeelSettings = {
  accent: KeelAccent;
  tone: KeelTone;
  safeZone: SafeZoneMode;
  textScale: TextScaleMode;
  runtimeMode: RuntimeMode;
  selectedModelId: string;
  presetId: string;
  serverUrl: string;
  serverModel: string;
  temperature: number;
  maxTokens: number;
  contextSize: number;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  tps?: number;
  runtimeLabel?: string;
  createdAt: number;
};

export type ChatThread = {
  id: string;
  title: string;
  presetId: string;
  modelId: string;
  messages: ChatMessage[];
  updatedAt: number;
};

export type OutputReport = {
  id: string;
  threadId: string;
  messageId: string;
  modelName: string;
  reason: string;
  excerpt: string;
  createdAt: number;
};

const SETTINGS_KEY = "keel.xbox.settings.v1";
const THREADS_KEY = "keel.xbox.threads.v1";
const REPORTS_KEY = "keel.xbox.reports.v1";

export const DEFAULT_SETTINGS: KeelSettings = {
  accent: "sage",
  tone: "ink",
  safeZone: "standard",
  textScale: "large",
  runtimeMode: "browser-wasm",
  selectedModelId: "lfm25-350m-q4",
  presetId: "general",
  serverUrl: "http://127.0.0.1:11434",
  serverModel: "",
  temperature: 0.6,
  maxTokens: 384,
  contextSize: 2048,
};

export function loadSettings(): KeelSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<KeelSettings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: KeelSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage quota errors in restricted frames
  }
}

export function applyThemeAttributes(settings: KeelSettings): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.accent = settings.accent;
  root.dataset.tone = settings.tone;
  root.dataset.safeZone = settings.safeZone;
  root.dataset.textScale = settings.textScale;
}

export function loadThreads(): ChatThread[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(THREADS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChatThread[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveThreads(threads: ChatThread[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(THREADS_KEY, JSON.stringify(threads.slice(0, 24)));
  } catch {
    // Ignore storage quota errors
  }
}

export function loadReports(): OutputReport[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(REPORTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as OutputReport[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveReport(report: OutputReport): OutputReport[] {
  const next = [report, ...loadReports()].slice(0, 50);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(REPORTS_KEY, JSON.stringify(next));
    } catch {
      // Ignore storage errors
    }
  }
  return next;
}

export const SSR_INITIAL_THREAD: ChatThread = {
  id: "t-initial",
  title: "New console session",
  presetId: "general",
  modelId: "lfm25-350m-q4",
  messages: [],
  updatedAt: 0,
};

export function createNewThread(presetId: string, modelId: string): ChatThread {
  const now = Date.now();
  return {
    id: `t-${now}-${Math.random().toString(36).slice(2, 7)}`,
    title: "New console session",
    presetId,
    modelId,
    messages: [],
    updatedAt: now,
  };
}
