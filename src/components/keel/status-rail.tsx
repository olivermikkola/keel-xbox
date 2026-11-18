"use client";

import { XboxGlyph } from "@/components/keel/xbox-glyph";
import type { GamepadStatus } from "@/lib/gamepad";
import { runtimeModeLabel, type KeelModel, type RuntimeMode } from "@/lib/models";
import { cn } from "@/lib/utils";

type Props = {
  model: KeelModel;
  runtimeMode: RuntimeMode;
  loadedLabel: string | null;
  serverModel: string;
  viewLabel: string;
  tps?: number | null;
  generating?: boolean;
  gamepadStatus: GamepadStatus;
};

export function StatusRail({
  model,
  runtimeMode,
  loadedLabel,
  serverModel,
  viewLabel,
  tps,
  generating,
  gamepadStatus,
}: Props) {
  const activeName =
    runtimeMode === "browser-wasm"
      ? loadedLabel ?? model.name
      : runtimeMode === "local-server"
        ? serverModel || "No server model"
        : model.name;

  return (
    <footer className="keel-rail keel-safe-x relative z-20 flex flex-wrap items-center justify-between gap-3 py-3 text-sm text-[color:var(--keel-muted)]">
      <div className="flex flex-wrap items-center gap-4">
        <span className="inline-flex items-center gap-2 font-mono text-sm">
          <span
            className={cn(
              "inline-block size-2 rounded-full",
              gamepadStatus.connected
                ? "bg-[color:var(--keel-accent)]"
                : "bg-white/25",
            )}
          />
          <span className="text-[color:var(--keel-foam)]">
            {gamepadStatus.connected ? gamepadStatus.label : "Keyboard · Arrows"}
          </span>
        </span>

        <div className="hidden items-center gap-3 md:flex">
          <XboxGlyph button="A" label="Select" />
          <XboxGlyph button="B" label="Back" />
          <XboxGlyph button="LB" />
          <XboxGlyph button="RB" label="Tabs" />
          <XboxGlyph button="Y" label="Models" />
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3 font-mono text-sm">
        <span className="hidden sm:inline text-[color:var(--keel-muted)]">
          {viewLabel}
        </span>
        <span className="text-[color:var(--keel-foam)]">{activeName}</span>
        <span className="hidden md:inline text-[color:var(--keel-muted)]">
          {runtimeModeLabel(runtimeMode)}
        </span>
        <span
          className={cn(
            "rounded-full border border-white/10 px-2.5 py-0.5",
            generating
              ? "border-[color:var(--keel-accent)]/50 text-[color:var(--keel-accent)]"
              : "text-[color:var(--keel-muted)]",
          )}
        >
          {tps != null ? `${tps.toFixed(1)} tok/s` : `~${model.tokensPerSec} tok/s`}
        </span>
      </div>
    </footer>
  );
}
