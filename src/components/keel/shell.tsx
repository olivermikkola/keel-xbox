"use client";

import { useCallback, useState } from "react";
import { HomeView } from "@/components/keel/home-view";
import { ModelsView } from "@/components/keel/models-view";
import { ConsoleView } from "@/components/keel/console-view";
import { PathView } from "@/components/keel/path-view";
import { StatusRail } from "@/components/keel/status-rail";
import { KEEL_MODELS, type KeelModel } from "@/lib/models";
import { cn } from "@/lib/utils";

type View = "home" | "models" | "console" | "path";

const VIEW_LABEL: Record<View, string> = {
  home: "Home",
  models: "Models",
  console: "Console",
  path: "Ship path",
};

export function KeelShell() {
  const [view, setView] = useState<View>("home");
  const [model, setModel] = useState<KeelModel>(KEEL_MODELS[0]!);
  const [tps, setTps] = useState<number | null>(null);
  const [generating, setGenerating] = useState(false);

  const onStats = useCallback(
    (stats: { tps: number | null; generating: boolean }) => {
      setTps(stats.tps);
      setGenerating(stats.generating);
    },
    [],
  );

  return (
    <div className="relative flex min-h-dvh flex-col bg-[color:var(--keel-ink)] text-[color:var(--keel-foam)]">
      <header className="relative z-20 flex items-center justify-between gap-4 px-6 py-4 sm:px-10">
        <button
          type="button"
          onClick={() => setView("home")}
          className="group flex items-baseline gap-2"
        >
          <span className="font-[family-name:var(--font-display)] text-xl tracking-tight">
            Keel
          </span>
          <span className="font-mono text-[10px] tracking-[0.28em] text-[color:var(--keel-water)] uppercase">
            Console
          </span>
        </button>

        <nav className="flex items-center gap-1 sm:gap-2">
          {(
            [
              ["home", "Home"],
              ["models", "Models"],
              ["console", "Console"],
              ["path", "Path"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setView(id)}
              className={cn(
                "px-3 py-2 font-mono text-[10px] tracking-[0.2em] uppercase transition-colors",
                view === id
                  ? "text-[color:var(--keel-water)]"
                  : "text-[color:var(--keel-muted)] hover:text-[color:var(--keel-foam)]",
              )}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>

      <main className="relative z-10 flex min-h-0 flex-1 flex-col">
        {view === "home" && (
          <HomeView
            active={view === "home"}
            onOpenConsole={() => setView("console")}
            onOpenModels={() => setView("models")}
          />
        )}
        {view === "models" && (
          <ModelsView
            active={view === "models"}
            selectedId={model.id}
            onSelect={setModel}
            onBack={() => setView("home")}
            onOpenConsole={() => setView("console")}
          />
        )}
        {view === "console" && (
          <ConsoleView
            model={model}
            active={view === "console"}
            onBack={() => setView("home")}
            onOpenModels={() => setView("models")}
            onStats={onStats}
          />
        )}
        {view === "path" && <PathView onBack={() => setView("home")} />}
      </main>

      <StatusRail
        model={model}
        viewLabel={VIEW_LABEL[view]}
        tps={tps}
        generating={generating}
      />
    </div>
  );
}
