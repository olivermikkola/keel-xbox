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
  serverPin: string;
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

export type ReportCategory =
  | "inaccurate"
  | "harmful"
  | "privacy"
  | "garbled"
  | "other";

export const REPORT_CATEGORY_LABELS: Record<ReportCategory, string> = {
  inaccurate: "Inaccurate / hallucinated",
  harmful: "Harmful or unsafe",
  privacy: "Privacy / personal info",
  garbled: "Broken / garbled text",
  other: "Other issue",
};

export type OutputReport = {
  id: string;
  threadId: string;
  messageId: string;
  modelName: string;
  runtimeMode?: RuntimeMode;
  category: ReportCategory;
  reason: string;
  note?: string;
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
  serverPin: "",
  temperature: 0.6,
  maxTokens: 384,
  contextSize: 2048,
};

export function loadSettings(): KeelSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  const hasUwpBridge = Boolean(
    (window as { __keelUwpHost?: number }).__keelUwpHost,
  );
  const fallback: KeelSettings = hasUwpBridge
    ? { ...DEFAULT_SETTINGS, runtimeMode: "uwp-native" }
    : DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<KeelSettings>;
    return { ...fallback, ...parsed };
  } catch {
    return fallback;
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
    const parsed = JSON.parse(raw) as Array<Partial<OutputReport>>;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((r) => ({
      id: r.id ?? `rep-${Date.now()}`,
      threadId: r.threadId ?? "",
      messageId: r.messageId ?? "",
      modelName: r.modelName ?? "Unknown model",
      runtimeMode: r.runtimeMode,
      category: r.category ?? "other",
      reason: r.reason ?? REPORT_CATEGORY_LABELS[r.category ?? "other"],
      note: r.note,
      excerpt: r.excerpt ?? "",
      createdAt: r.createdAt ?? 0,
    }));
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

export function exportPolicy1116ReportsJson(reports: OutputReport[]): string {
  return JSON.stringify(
    {
      policy: "Microsoft Store Policy 11.16 — Generative AI Output Reports",
      app: "Keel Console",
      exportedAt: new Date().toISOString(),
      count: reports.length,
      reports: reports.map((r) => ({
        id: r.id,
        category: r.category,
        reason: r.reason,
        note: r.note ?? null,
        modelName: r.modelName,
        runtimeMode: r.runtimeMode ?? null,
        excerpt: r.excerpt.slice(0, 240),
        createdAt: new Date(r.createdAt).toISOString(),
      })),
    },
    null,
    2,
  );
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
