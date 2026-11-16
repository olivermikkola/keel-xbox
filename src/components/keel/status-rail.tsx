"use client";

import { backendLabel, type KeelModel } from "@/lib/models";

type Props = {
  model: KeelModel;
  viewLabel: string;
  tps?: number | null;
  generating?: boolean;
};

export function StatusRail({ model, viewLabel, tps, generating }: Props) {
  return (
    <footer className="keel-rail flex items-center justify-between gap-4 px-6 py-3 text-[11px] tracking-[0.18em] uppercase text-[color:var(--keel-muted)] sm:px-10">
      <div className="flex min-w-0 items-center gap-3">
        <span className="font-mono text-[color:var(--keel-water)]">KEEL</span>
        <span className="truncate">{viewLabel}</span>
      </div>
      <div className="flex shrink-0 items-center gap-4 font-mono normal-case tracking-normal">
        <span className="hidden sm:inline">{model.name}</span>
        <span>{backendLabel(model.backend)}</span>
        <span className={generating ? "text-[color:var(--keel-water)]" : undefined}>
          {tps != null ? `${tps.toFixed(1)} tok/s` : `~${model.tokensPerSec} tok/s`}
        </span>
      </div>
    </footer>
  );
}
