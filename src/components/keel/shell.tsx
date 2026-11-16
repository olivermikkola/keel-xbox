"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { ConsoleView } from "@/components/keel/console-view";
import { HomeView } from "@/components/keel/home-view";
import { KeelMark } from "@/components/keel/keel-mark";
import { ModelsView } from "@/components/keel/models-view";
import { PathView } from "@/components/keel/path-view";
import { SettingsView } from "@/components/keel/settings-view";
import { StatusRail } from "@/components/keel/status-rail";
import { XboxGlyph } from "@/components/keel/xbox-glyph";
import { getActiveGamepadStatus, type GamepadStatus } from "@/lib/gamepad";
import { KEEL_MODELS, getModel, type KeelModel, type RuntimeMode } from "@/lib/models";
import {
  DEFAULT_SETTINGS,
  SSR_INITIAL_THREAD,
  applyThemeAttributes,
  createNewThread,
  loadReports,
  loadSettings,
  loadThreads,
  saveReport,
  saveSettings,
  saveThreads,
  type ChatMessage,
  type ChatThread,
  type KeelSettings,
  type OutputReport,
} from "@/lib/settings";
import { cn } from "@/lib/utils";
import { wllamaRuntime, type BrowserRuntimeState } from "@/lib/wllama-runtime";

type View = "home" | "console" | "models" | "settings" | "path";

const VIEW_ORDER: View[] = ["home", "console", "models", "settings", "path"];

const VIEW_LABEL: Record<View, string> = {
  home: "Home",
  console: "Console",
  models: "Models",
  settings: "Settings",
  path: "UWP",
};

const EMPTY_SERVER_WLLAMA: BrowserRuntimeState = {
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

function subscribeNoop() {
  return () => {};
}

function useIsClient(): boolean {
  return useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );
}

export function KeelShell() {
  const isClient = useIsClient();
  const [view, setView] = useState<View>("home");
  const [settings, setSettings] = useState<KeelSettings>(() =>
    typeof window !== "undefined" ? loadSettings() : DEFAULT_SETTINGS,
  );
  const [threads, setThreads] = useState<ChatThread[]>(() => {
    if (typeof window === "undefined") {
      return [SSR_INITIAL_THREAD];
    }
    const existing = loadThreads();
    return existing.length > 0
      ? existing
      : [createNewThread(DEFAULT_SETTINGS.presetId, DEFAULT_SETTINGS.selectedModelId)];
  });
  const [activeThreadId, setActiveThreadId] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return loadThreads()[0]?.id ?? "";
  });
  const [reports, setReports] = useState<OutputReport[]>(() =>
    typeof window !== "undefined" ? loadReports() : [],
  );

  const [tps, setTps] = useState<number | null>(null);
  const [generating, setGenerating] = useState(false);
  const [gamepadStatus, setGamepadStatus] = useState<GamepadStatus>({
    connected: false,
    label: "Keyboard / Mouse",
  });

  const wllamaState = useSyncExternalStore(
    useCallback((cb) => wllamaRuntime.subscribe(cb), []),
    () => wllamaRuntime.getState(),
    () => EMPTY_SERVER_WLLAMA,
  );

  useEffect(() => {
    applyThemeAttributes(settings);
    saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    saveThreads(threads);
  }, [threads]);

  useEffect(() => {
    const syncPad = () => setGamepadStatus(getActiveGamepadStatus());
    syncPad();
    const id = window.setInterval(syncPad, 1200);
    window.addEventListener("gamepadconnected", syncPad);
    window.addEventListener("gamepaddisconnected", syncPad);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("gamepadconnected", syncPad);
      window.removeEventListener("gamepaddisconnected", syncPad);
    };
  }, []);

  const currentModel: KeelModel =
    getModel(settings.selectedModelId) ?? KEEL_MODELS[0]!;

  const activeThread =
    threads.find((t) => t.id === activeThreadId) ?? threads[0]!;

  const updateSettings = useCallback((patch: Partial<KeelSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const cycleView = useCallback((delta: number) => {
    setView((cur) => {
      const idx = VIEW_ORDER.indexOf(cur);
      const next = (idx + delta + VIEW_ORDER.length) % VIEW_ORDER.length;
      return VIEW_ORDER[next]!;
    });
  }, []);

  const handleCreateThread = useCallback(
    (presetId?: string) => {
      const next = createNewThread(
        presetId ?? settings.presetId,
        settings.selectedModelId,
      );
      setThreads((prev) => [next, ...prev]);
      setActiveThreadId(next.id);
      setTps(null);
    },
    [settings.presetId, settings.selectedModelId],
  );

  const handleUpdateThread = useCallback((updated: ChatThread) => {
    setThreads((prev) =>
      prev.map((t) => (t.id === updated.id ? updated : t)),
    );
  }, []);

  const handleDeleteThread = useCallback(
    (id: string) => {
      setThreads((prev) => {
        const filtered = prev.filter((t) => t.id !== id);
        if (filtered.length === 0) {
          const fallback = createNewThread(
            settings.presetId,
            settings.selectedModelId,
          );
          setActiveThreadId(fallback.id);
          return [fallback];
        }
        if (activeThreadId === id) {
          setActiveThreadId(filtered[0]!.id);
        }
        return filtered;
      });
    },
    [activeThreadId, settings.presetId, settings.selectedModelId],
  );

  const handleReportOutput = useCallback(
    (msg: ChatMessage) => {
      const modelLabel =
        settings.runtimeMode === "local-server" && settings.serverModel
          ? settings.serverModel
          : wllamaState.loadedLabel ?? currentModel.name;
      const next = saveReport({
        id: `rep-${Date.now()}`,
        threadId: activeThread.id,
        messageId: msg.id,
        modelName: modelLabel,
        reason: "User flagged via Console",
        excerpt: msg.content.slice(0, 160),
        createdAt: Date.now(),
      });
      setReports(next);
    },
    [
      activeThread.id,
      currentModel.name,
      settings.runtimeMode,
      settings.serverModel,
      wllamaState.loadedLabel,
    ],
  );

  const handleStats = useCallback(
    (stats: { tps: number | null; generating: boolean }) => {
      setTps(stats.tps);
      setGenerating(stats.generating);
    },
    [],
  );

  if (!isClient) {
    return (
      <div className="flex min-h-dvh flex-col bg-[color:var(--keel-ink)] text-[color:var(--keel-foam)]" />
    );
  }

  return (
    <div className="keel-safe-frame relative flex h-dvh flex-col overflow-hidden bg-[color:var(--keel-ink)] text-[color:var(--keel-foam)]">
      {/* Top Console Navigation */}
      <header className="keel-safe-x relative z-20 flex flex-wrap items-center justify-between gap-4 py-3">
        <button
          type="button"
          onClick={() => setView("home")}
          className="group flex items-center gap-3 rounded-full py-1 pr-3 text-left focus-visible:outline-none"
        >
          <KeelMark className="size-7" />
          <div className="flex items-baseline gap-2">
            <span className="font-[family-name:var(--font-display)] text-xl font-bold tracking-tight text-[color:var(--keel-paper)]">
              Keel
            </span>
            <span className="font-mono text-[10px] tracking-[0.26em] text-[color:var(--keel-rust)] uppercase">
              Console
            </span>
          </div>
        </button>

        <nav className="keel-card flex items-center gap-1 rounded-full p-1">
          <XboxGlyph button="LB" className="hidden pl-2 sm:inline-flex" />
          {VIEW_ORDER.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setView(id)}
              className={cn(
                "rounded-full px-3.5 py-1.5 font-mono text-[11px] tracking-[0.16em] uppercase transition-colors",
                view === id
                  ? "bg-[color:var(--keel-paper)] font-semibold text-[color:var(--keel-ink)]"
                  : "text-[color:var(--keel-muted)] hover:text-[color:var(--keel-foam)]",
              )}
            >
              {VIEW_LABEL[id]}
            </button>
          ))}
          <XboxGlyph button="RB" className="hidden pr-2 sm:inline-flex" />
        </nav>
      </header>

      <main className="relative z-10 flex min-h-0 flex-1 flex-col">
        {view === "home" && (
          <HomeView
            active={view === "home"}
            model={currentModel}
            runtimeMode={settings.runtimeMode}
            loadedLabel={wllamaState.loadedLabel}
            serverConnectedLabel={
              settings.serverModel
                ? `${settings.serverModel} @ ${settings.serverUrl}`
                : null
            }
            onOpenConsole={() => setView("console")}
            onOpenModels={() => setView("models")}
            onOpenSettings={() => setView("settings")}
            onOpenPath={() => setView("path")}
            onPrevTab={() => cycleView(-1)}
            onNextTab={() => cycleView(1)}
          />
        )}

        {view === "models" && (
          <ModelsView
            active={view === "models"}
            selectedModelId={currentModel.id}
            runtimeMode={settings.runtimeMode}
            serverUrl={settings.serverUrl}
            serverModel={settings.serverModel}
            contextSize={settings.contextSize}
            onChangeRuntimeMode={(runtimeMode: RuntimeMode) =>
              updateSettings({ runtimeMode })
            }
            onSelectModel={(next) => {
              updateSettings({ selectedModelId: next.id });
              setTps(null);
            }}
            onUpdateServer={(serverUrl, serverModel) =>
              updateSettings({ serverUrl, serverModel })
            }
            onOpenConsole={() => setView("console")}
            onBack={() => setView("home")}
            onPrevTab={() => cycleView(-1)}
            onNextTab={() => cycleView(1)}
          />
        )}

        {view === "console" && (
          <ConsoleView
            active={view === "console"}
            model={currentModel}
            runtimeMode={settings.runtimeMode}
            loadedWasmLabel={wllamaState.loadedLabel}
            serverUrl={settings.serverUrl}
            serverModel={settings.serverModel}
            temperature={settings.temperature}
            maxTokens={settings.maxTokens}
            threads={threads}
            activeThread={activeThread}
            onSelectThread={setActiveThreadId}
            onCreateThread={handleCreateThread}
            onDeleteThread={handleDeleteThread}
            onUpdateThread={handleUpdateThread}
            onChangePreset={(presetId) => {
              updateSettings({ presetId });
              handleUpdateThread({ ...activeThread, presetId });
            }}
            onSwitchToPreview={() => updateSettings({ runtimeMode: "preview" })}
            onReportOutput={handleReportOutput}
            onBack={() => setView("home")}
            onOpenModels={() => setView("models")}
            onPrevTab={() => cycleView(-1)}
            onNextTab={() => cycleView(1)}
            onStats={handleStats}
          />
        )}

        {view === "settings" && (
          <SettingsView
            active={view === "settings"}
            settings={settings}
            reports={reports}
            onUpdateSettings={updateSettings}
            onClearReports={() => {
              if (typeof window !== "undefined") {
                window.localStorage.removeItem("keel.xbox.reports.v1");
              }
              setReports([]);
            }}
            onBack={() => setView("home")}
            onPrevTab={() => cycleView(-1)}
            onNextTab={() => cycleView(1)}
          />
        )}

        {view === "path" && (
          <PathView
            active={view === "path"}
            onBack={() => setView("home")}
            onOpenModels={() => setView("models")}
            onPrevTab={() => cycleView(-1)}
            onNextTab={() => cycleView(1)}
          />
        )}
      </main>

      <StatusRail
        model={currentModel}
        runtimeMode={settings.runtimeMode}
        loadedLabel={wllamaState.loadedLabel}
        serverModel={settings.serverModel}
        viewLabel={VIEW_LABEL[view]}
        tps={tps}
        generating={generating}
        gamepadStatus={gamepadStatus}
      />
    </div>
  );
}
