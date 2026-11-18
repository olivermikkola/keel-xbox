"use client";

import { useRef } from "react";
import { motion } from "motion/react";
import { KeelSailBackdrop } from "@/components/keel/keel-mark";
import { XboxGlyph } from "@/components/keel/xbox-glyph";
import { useGamepadNavigation } from "@/hooks/use-gamepad-focus";
import { runtimeModeLabel, type KeelModel, type RuntimeMode } from "@/lib/models";
import { cn } from "@/lib/utils";

type Props = {
  active: boolean;
  model: KeelModel;
  runtimeMode: RuntimeMode;
  loadedLabel: string | null;
  serverConnectedLabel: string | null;
  onOpenConsole: () => void;
  onOpenModels: () => void;
  onOpenSettings: () => void;
  onOpenPath: () => void;
  onPrevTab: () => void;
  onNextTab: () => void;
};

export function HomeView({
  active,
  model,
  runtimeMode,
  loadedLabel,
  serverConnectedLabel,
  onOpenConsole,
  onOpenModels,
  onOpenSettings,
  onOpenPath,
  onPrevTab,
  onNextTab,
}: Props) {
  const containerRef = useRef<HTMLElement>(null);

  useGamepadNavigation({
    containerRef,
    enabled: active,
    onActionY: onOpenModels,
    onPrevTab,
    onNextTab,
    onMenu: onOpenSettings,
  });

  const readinessDetail =
    runtimeMode === "browser-wasm"
      ? loadedLabel
        ? `Loaded in memory · ${loadedLabel}`
        : `Ready to cache ${model.name} (${model.sizeLabel}) in Models`
      : runtimeMode === "local-server"
        ? serverConnectedLabel
          ? `Server ready · ${serverConnectedLabel}`
          : "Configure Ollama or llama-server in Models"
        : runtimeMode === "uwp-native"
          ? "WebView2 WinRT LocalState bridge active"
          : `Simulated Series S timing (~${model.tokensPerSec} tok/s)`;

  return (
    <section
      ref={containerRef}
      className="relative flex min-h-0 flex-1 flex-col overflow-hidden"
    >
      {/* Signature Keel architectural Sail geometry anchored lower-right */}
      <KeelSailBackdrop className="absolute -bottom-8 -right-8 h-[82%] w-[78%] max-w-[920px] opacity-95 sm:h-[92%] sm:w-[68%]" />

      <div className="keel-safe-x relative z-10 flex flex-1 flex-col justify-between py-8 sm:py-12">
        <div className="mt-auto max-w-3xl pb-4 pt-8 sm:pt-14">
          <motion.p
            className="font-mono text-xs font-medium tracking-[0.28em] text-[color:var(--keel-rust)] uppercase"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
          >
            Keel · Xbox Console
          </motion.p>

          <motion.h1
            className="mt-4 max-w-[14ch] font-[family-name:var(--font-display)] text-[clamp(2.6rem,7.2vw,5.4rem)] font-bold leading-[0.98] tracking-[-0.035em] text-[color:var(--keel-paper)]"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.05 }}
          >
            Local models that actually run on Xbox.
          </motion.h1>

          <motion.p
            className="mt-5 max-w-xl text-base leading-relaxed text-[color:var(--keel-muted)] sm:text-lg"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.12 }}
          >
            Chat from the couch with on-device GGUF weights, a LAN{" "}
            <span className="text-[color:var(--keel-foam)]">llama-server</span>{" "}
            or Ollama host, or the native UWP LocalState runtime — built for a
            10-foot TV and Xbox controller.
          </motion.p>

          <motion.div
            className="mt-8 flex flex-wrap items-center gap-3"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.18 }}
          >
            <button
              type="button"
              data-keel-focus
              data-keel-default-focus="true"
              onClick={onOpenConsole}
              className={cn(
                "flex min-h-13 items-center gap-3 rounded-full border border-transparent bg-[color:var(--keel-paper)] px-7 py-3 text-base font-semibold text-[color:var(--keel-ink)] hover:opacity-95",
              )}
            >
              <span>Open console</span>
              <XboxGlyph button="A" className="opacity-80" />
            </button>

            <button
              type="button"
              data-keel-focus
              onClick={onOpenModels}
              className="keel-card-raised flex min-h-13 items-center gap-3 rounded-full px-6 py-3 text-base font-medium text-[color:var(--keel-foam)] hover:border-white/30"
            >
              <span>Models &amp; runtime</span>
              <XboxGlyph button="Y" />
            </button>

            <button
              type="button"
              data-keel-focus
              onClick={onOpenSettings}
              className="keel-card flex min-h-13 items-center gap-2 rounded-full px-5 py-3 text-sm font-medium text-[color:var(--keel-muted)] hover:text-[color:var(--keel-foam)]"
            >
              <span>Appearance</span>
            </button>

            <button
              type="button"
              data-keel-focus
              onClick={onOpenPath}
              className="keel-card flex min-h-13 items-center gap-2 rounded-full px-5 py-3 text-sm font-medium text-[color:var(--keel-muted)] hover:text-[color:var(--keel-foam)]"
            >
              <span>Roadmap</span>
            </button>
          </motion.div>

          <motion.div
            className="keel-card mt-8 flex flex-wrap items-center justify-between gap-4 px-5 py-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.45, delay: 0.24 }}
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="inline-block size-2 rounded-full bg-[color:var(--keel-accent)]" />
                <span className="font-mono text-[11px] tracking-[0.2em] text-[color:var(--keel-accent)] uppercase">
                  {runtimeModeLabel(runtimeMode)}
                </span>
              </div>
              <p className="mt-1 truncate text-sm text-[color:var(--keel-foam)]">
                {readinessDetail}
              </p>
            </div>
            <span className="font-mono text-xs text-[color:var(--keel-muted)]">
              Nothing leaves your console or LAN
            </span>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
