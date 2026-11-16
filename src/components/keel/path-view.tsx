"use client";

import { useRef } from "react";
import { motion } from "motion/react";
import { XboxGlyph } from "@/components/keel/xbox-glyph";
import { useGamepadNavigation } from "@/hooks/use-gamepad-focus";

type Props = {
  active: boolean;
  onBack: () => void;
  onOpenModels: () => void;
  onPrevTab: () => void;
  onNextTab: () => void;
};

const STEPS = [
  {
    code: "01 · LIVE NOW",
    title: "10-Foot App + Real Inference",
    body: "Keel Console runs real GGUF models in browser WASM (@wllama/wllama), connects to Ollama or llama-server on your LAN, and persists threads with full Xbox controller D-pad/stick navigation.",
  },
  {
    code: "02 · NATIVE/XBOX",
    title: "UWP Dev Mode Shell",
    body: "native/xbox/KeelConsole.Xbox hosts this exact UI in WebView2 with ApplicationViewScaling disabled for crisp 1080p/4K TV rendering, XY mouse-mode off, and a WinRT keelBridge for LocalState ONNX Runtime GenAI & llama.cpp.",
  },
  {
    code: "03 · MICROSOFT STORE",
    title: "Retail Xbox App Submission",
    body: "Shipped as a non-game Windows.Xbox app (no ID@Xbox networking needed): WACK-clean binaries, Store Policy 11.16 generative AI disclosure + output flagging, and sub-2 GB LocalState model budgets.",
  },
];

export function PathView({
  active,
  onBack,
  onOpenModels,
  onPrevTab,
  onNextTab,
}: Props) {
  const containerRef = useRef<HTMLElement>(null);

  useGamepadNavigation({
    containerRef,
    enabled: active,
    onBack,
    onActionY: onOpenModels,
    onPrevTab,
    onNextTab,
  });

  return (
    <section
      ref={containerRef}
      className="keel-safe-x flex min-h-0 flex-1 flex-col py-6"
    >
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] tracking-[0.28em] text-[color:var(--keel-rust)] uppercase">
            UWP &amp; Store Path
          </p>
          <h2 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight text-[color:var(--keel-paper)] sm:text-4xl">
            From web console to retail Xbox app
          </h2>
        </div>

        <button
          type="button"
          data-keel-focus
          data-keel-default-focus="true"
          onClick={onBack}
          className="keel-card flex items-center gap-2 rounded-full px-4 py-2 font-mono text-xs text-[color:var(--keel-muted)] hover:text-[color:var(--keel-foam)]"
        >
          <XboxGlyph button="B" />
          <span>Home</span>
        </button>
      </div>

      <div
        data-keel-scroll
        className="grid min-h-0 flex-1 gap-4 overflow-y-auto pb-6 lg:grid-cols-3"
      >
        {STEPS.map((step, i) => (
          <motion.div
            key={step.code}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="keel-card flex flex-col justify-between p-6"
          >
            <div>
              <div className="font-mono text-[11px] tracking-[0.22em] text-[color:var(--keel-accent)] uppercase">
                {step.code}
              </div>
              <h3 className="mt-3 text-xl font-semibold text-[color:var(--keel-paper)]">
                {step.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-[color:var(--keel-muted)]">
                {step.body}
              </p>
            </div>
          </motion.div>
        ))}

        <div className="keel-card col-span-full flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <div className="font-mono text-xs text-[color:var(--keel-paper)]">
              native/xbox/KeelConsole.Xbox
            </div>
            <p className="mt-1 text-xs text-[color:var(--keel-muted)]">
              Open <code className="font-mono">KeelConsole.Xbox.sln</code> in
              Visual Studio on Windows with the UWP / Xbox Dev Mode workload to
              build and sideload the <code className="font-mono">.msix</code>{" "}
              package onto Series S|X.
            </p>
          </div>
          <button
            type="button"
            data-keel-focus
            onClick={onOpenModels}
            className="rounded-full bg-[color:var(--keel-paper)] px-5 py-2.5 text-xs font-semibold text-[color:var(--keel-ink)]"
          >
            Browse model catalogue
          </button>
        </div>
      </div>
    </section>
  );
}
