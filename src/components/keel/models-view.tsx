"use client";

import { motion } from "motion/react";
import { useGamepadFocus } from "@/hooks/use-gamepad-focus";
import {
  KEEL_MODELS,
  backendLabel,
  type KeelModel,
} from "@/lib/models";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

type Props = {
  active: boolean;
  selectedId: string;
  onSelect: (model: KeelModel) => void;
  onBack: () => void;
  onOpenConsole: () => void;
};

const STATUS_LABEL: Record<KeelModel["status"], string> = {
  ready: "Ready",
  available: "Installable",
  "coming-soon": "Blocked",
};

export function ModelsView({
  active,
  selectedId,
  onSelect,
  onBack,
  onOpenConsole,
}: Props) {
  const { index, setIndex } = useGamepadFocus({
    count: KEEL_MODELS.length,
    enabled: active,
    columns: 1,
    onActivate: (i) => {
      const model = KEEL_MODELS[i];
      if (!model || model.status === "coming-soon") return;
      onSelect(model);
      onOpenConsole();
    },
  });

  return (
    <section className="flex min-h-0 flex-1 flex-col px-6 py-8 sm:px-10 lg:px-14">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] tracking-[0.3em] text-[color:var(--keel-water)] uppercase">
            Catalogue
          </p>
          <h2 className="mt-2 font-[family-name:var(--font-display)] text-4xl tracking-tight text-[color:var(--keel-foam)] sm:text-5xl">
            Models that fit the console
          </h2>
          <p className="mt-3 max-w-xl text-[color:var(--keel-muted)]">
            Sized for Xbox AppContainer limits — sub-1B packs first, measured Series S
            class speeds.
          </p>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="border border-white/15 px-4 py-2 font-mono text-[11px] tracking-[0.2em] text-[color:var(--keel-muted)] uppercase hover:border-white/40 hover:text-[color:var(--keel-foam)]"
        >
          Back · B
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <ul className="flex flex-col gap-3">
          {KEEL_MODELS.map((model, i) => {
            const focused = index === i;
            const selected = selectedId === model.id;
            const locked = model.status === "coming-soon";

            return (
              <motion.li
                key={model.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <button
                  type="button"
                  disabled={locked}
                  onMouseEnter={() => setIndex(i)}
                  onFocus={() => setIndex(i)}
                  onClick={() => {
                    if (locked) return;
                    onSelect(model);
                    onOpenConsole();
                  }}
                  className={cn(
                    "grid w-full grid-cols-1 gap-3 border px-5 py-5 text-left transition-colors duration-200 sm:grid-cols-[1.2fr_0.8fr_auto] sm:items-center",
                    focused
                      ? "border-[color:var(--keel-water)] bg-[color:var(--keel-water)]/10"
                      : "border-white/10 bg-black/20 hover:border-white/25",
                    locked && "opacity-55",
                  )}
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-lg text-[color:var(--keel-foam)]">
                        {model.name}
                      </span>
                      <Badge
                        variant="outline"
                        className="rounded-none border-white/20 font-mono text-[10px] tracking-wider uppercase"
                      >
                        {STATUS_LABEL[model.status]}
                      </Badge>
                      {selected && (
                        <Badge className="rounded-none bg-[color:var(--keel-water)] text-[color:var(--keel-ink)]">
                          Active
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-[color:var(--keel-muted)]">
                      {model.blurb}
                    </p>
                  </div>

                  <div className="font-mono text-xs text-[color:var(--keel-muted)]">
                    <div>
                      {model.params} · {model.sizeLabel} · {backendLabel(model.backend)}
                    </div>
                    <div className="mt-1 text-[color:var(--keel-water)]">
                      ~{model.tokensPerSec} tok/s decode
                      {model.prefillTokPerSec
                        ? ` · ~${model.prefillTokPerSec} prefill`
                        : ""}
                    </div>
                    <div className="mt-1 hidden lg:block">{model.xboxNote}</div>
                  </div>

                  <div className="font-mono text-[11px] tracking-[0.18em] text-[color:var(--keel-foam)] uppercase">
                    {locked ? "Later" : "Load"}
                  </div>
                </button>
              </motion.li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
