"use client";

import { motion } from "motion/react";
import { useGamepadFocus } from "@/hooks/use-gamepad-focus";
import { cn } from "@/lib/utils";

type Props = {
  onOpenModels: () => void;
  onOpenConsole: () => void;
  active: boolean;
};

const ACTIONS = [
  { id: "console", label: "Open console", hint: "A / Enter" },
  { id: "models", label: "Browse models", hint: "Catalogue" },
] as const;

export function HomeView({ onOpenModels, onOpenConsole, active }: Props) {
  const { index, setIndex } = useGamepadFocus({
    count: ACTIONS.length,
    enabled: active,
    onActivate: (i) => {
      if (i === 0) onOpenConsole();
      else onOpenModels();
    },
  });

  return (
    <section className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="keel-hull pointer-events-none absolute inset-0" aria-hidden />
      <div className="keel-waterline pointer-events-none absolute inset-x-0 bottom-[28%] h-px" aria-hidden />

      <div className="relative z-10 flex flex-1 flex-col justify-end px-6 pb-16 pt-24 sm:px-12 sm:pb-20 lg:px-16">
        <motion.p
          className="font-mono text-xs tracking-[0.35em] text-[color:var(--keel-water)] uppercase"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          On-device · Xbox-first
        </motion.p>

        <motion.h1
          className="mt-4 max-w-[12ch] font-[family-name:var(--font-display)] text-[clamp(3.5rem,12vw,8rem)] leading-[0.9] tracking-[-0.04em] text-[color:var(--keel-foam)]"
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.75, delay: 0.08 }}
        >
          Keel
          <span className="block text-[color:var(--keel-water)]">Console</span>
        </motion.h1>

        <motion.p
          className="mt-6 max-w-md text-base leading-relaxed text-[color:var(--keel-muted)] sm:text-lg"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.18 }}
        >
          Run compact language models on your Xbox — as an app, from the couch,
          with inference that stays on the console.
        </motion.p>

        <motion.div
          className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.28 }}
        >
          {ACTIONS.map((action, i) => {
            const focused = index === i;
            return (
              <button
                key={action.id}
                type="button"
                data-keel-focus
                onMouseEnter={() => setIndex(i)}
                onFocus={() => setIndex(i)}
                onClick={() => (i === 0 ? onOpenConsole() : onOpenModels())}
                className={cn(
                  "group flex min-h-14 min-w-[12rem] items-center justify-between gap-6 border px-5 text-left transition-colors duration-200",
                  focused
                    ? "border-[color:var(--keel-water)] bg-[color:var(--keel-water)] text-[color:var(--keel-ink)]"
                    : "border-white/15 bg-white/5 text-[color:var(--keel-foam)] hover:border-white/35",
                )}
              >
                <span className="text-base font-medium tracking-wide">{action.label}</span>
                <span
                  className={cn(
                    "font-mono text-[10px] tracking-[0.2em] uppercase",
                    focused ? "text-[color:var(--keel-ink)]/70" : "text-[color:var(--keel-muted)]",
                  )}
                >
                  {action.hint}
                </span>
              </button>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
