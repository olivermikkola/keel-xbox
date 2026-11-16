"use client";

import { useRef } from "react";
import { XboxGlyph } from "@/components/keel/xbox-glyph";
import { useGamepadNavigation } from "@/hooks/use-gamepad-focus";
import {
  exportPolicy1116ReportsJson,
  type KeelAccent,
  type KeelSettings,
  type KeelTone,
  type OutputReport,
  type SafeZoneMode,
  type TextScaleMode,
} from "@/lib/settings";
import { cn } from "@/lib/utils";

type Props = {
  active: boolean;
  settings: KeelSettings;
  reports: OutputReport[];
  onUpdateSettings: (patch: Partial<KeelSettings>) => void;
  onClearReports: () => void;
  onBack: () => void;
  onPrevTab: () => void;
  onNextTab: () => void;
};

function SegmentedRow<T extends string | number>({
  label,
  value,
  options,
  onChange,
  defaultFocusFirst = false,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (next: T) => void;
  defaultFocusFirst?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 py-3">
      <span className="text-sm font-medium text-[color:var(--keel-muted)]">
        {label}
      </span>
      <div className="keel-card inline-flex flex-wrap gap-1 rounded-full p-1">
        {options.map((opt, idx) => {
          const selected = opt.value === value;
          return (
            <button
              key={String(opt.value)}
              type="button"
              data-keel-focus
              data-keel-default-focus={
                defaultFocusFirst && idx === 0 ? "true" : undefined
              }
              onClick={() => onChange(opt.value)}
              className={cn(
                "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                selected
                  ? "bg-[color:var(--keel-paper)] text-[color:var(--keel-ink)]"
                  : "text-[color:var(--keel-muted)] hover:text-[color:var(--keel-foam)]",
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function SettingsView({
  active,
  settings,
  reports,
  onUpdateSettings,
  onClearReports,
  onBack,
  onPrevTab,
  onNextTab,
}: Props) {
  const containerRef = useRef<HTMLElement>(null);

  useGamepadNavigation({
    containerRef,
    enabled: active,
    onBack,
    onPrevTab,
    onNextTab,
  });

  return (
    <section
      ref={containerRef}
      className="keel-safe-x flex min-h-0 flex-1 flex-col py-6"
    >
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] tracking-[0.28em] text-[color:var(--keel-rust)] uppercase">
            Settings &amp; Brand
          </p>
          <h2 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight text-[color:var(--keel-paper)] sm:text-4xl">
            Keel appearance &amp; TV tuning
          </h2>
        </div>

        <button
          type="button"
          data-keel-focus
          onClick={onBack}
          className="keel-card flex items-center gap-2 rounded-full px-4 py-2 font-mono text-xs text-[color:var(--keel-muted)] hover:text-[color:var(--keel-foam)]"
        >
          <XboxGlyph button="B" />
          <span>Home</span>
        </button>
      </div>

      <div
        data-keel-scroll
        className="grid min-h-0 flex-1 gap-5 overflow-y-auto pb-6 lg:grid-cols-2"
      >
        <div className="keel-card flex flex-col divide-y divide-white/8 p-5">
          <h3 className="pb-3 font-mono text-xs tracking-[0.2em] text-[color:var(--keel-accent)] uppercase">
            Keel Brand &amp; 10-Foot Display
          </h3>

          <SegmentedRow<KeelAccent>
            label="Accent"
            value={settings.accent}
            defaultFocusFirst
            options={[
              { value: "sage", label: "Sage" },
              { value: "copper", label: "Copper" },
              { value: "ice", label: "Ice" },
            ]}
            onChange={(accent) => onUpdateSettings({ accent })}
          />

          <SegmentedRow<KeelTone>
            label="Tone"
            value={settings.tone}
            options={[
              { value: "ink", label: "Ink" },
              { value: "slate", label: "Slate" },
            ]}
            onChange={(tone) => onUpdateSettings({ tone })}
          />

          <SegmentedRow<SafeZoneMode>
            label="TV Safe Zone"
            value={settings.safeZone}
            options={[
              { value: "standard", label: "Standard" },
              { value: "overscan", label: "Overscan 5%" },
            ]}
            onChange={(safeZone) => onUpdateSettings({ safeZone })}
          />

          <SegmentedRow<TextScaleMode>
            label="Type Scale"
            value={settings.textScale}
            options={[
              { value: "large", label: "10-ft Large" },
              { value: "compact", label: "Compact" },
            ]}
            onChange={(textScale) => onUpdateSettings({ textScale })}
          />
        </div>

        <div className="flex flex-col gap-5">
          <div className="keel-card flex flex-col divide-y divide-white/8 p-5">
            <h3 className="pb-3 font-mono text-xs tracking-[0.2em] text-[color:var(--keel-accent)] uppercase">
              Inference Sampling
            </h3>

            <SegmentedRow<number>
              label="Temperature"
              value={settings.temperature}
              options={[
                { value: 0.2, label: "Focused (0.2)" },
                { value: 0.6, label: "Balanced (0.6)" },
                { value: 0.9, label: "Creative (0.9)" },
              ]}
              onChange={(temperature) => onUpdateSettings({ temperature })}
            />

            <SegmentedRow<number>
              label="Max Reply Tokens"
              value={settings.maxTokens}
              options={[
                { value: 256, label: "256" },
                { value: 384, label: "384" },
                { value: 768, label: "768" },
              ]}
              onChange={(maxTokens) => onUpdateSettings({ maxTokens })}
            />

            <SegmentedRow<number>
              label="Context Window"
              value={settings.contextSize}
              options={[
                { value: 1024, label: "1024" },
                { value: 2048, label: "2048" },
                { value: 4096, label: "4096" },
              ]}
              onChange={(contextSize) => onUpdateSettings({ contextSize })}
            />
          </div>

          <div className="keel-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-mono text-xs tracking-[0.2em] text-[color:var(--keel-rust)] uppercase">
                Store Policy 11.16 · AI Output Log
              </h3>
              <div className="flex items-center gap-3">
                {reports.length > 0 && (
                  <button
                    type="button"
                    data-keel-focus
                    onClick={() => {
                      const json = exportPolicy1116ReportsJson(reports);
                      const blob = new Blob([json], {
                        type: "application/json",
                      });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `keel-policy-11-16-reports-${Date.now()}.json`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    className="font-mono text-xs text-[color:var(--keel-accent)] hover:underline"
                  >
                    Export JSON
                  </button>
                )}
                {reports.length > 0 && (
                  <button
                    type="button"
                    data-keel-focus
                    onClick={onClearReports}
                    className="font-mono text-xs text-[color:var(--keel-muted)] hover:text-[color:var(--keel-foam)]"
                  >
                    Clear ({reports.length})
                  </button>
                )}
              </div>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-[color:var(--keel-muted)]">
              Keel discloses AI-generated responses and provides an in-app output
              reporting path per Microsoft Store Policy 11.16. Flagged snippets stay
              local to this device and exports omit server URLs and pairing PINs.
            </p>
            {reports.length > 0 ? (
              <ul className="mt-3 flex flex-col gap-2">
                {reports.slice(0, 4).map((r) => (
                  <li
                    key={r.id}
                    className="rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-xs"
                  >
                    <div className="font-mono text-[10px] text-[color:var(--keel-rust)]">
                      {r.reason} · {r.modelName} ·{" "}
                      {new Date(r.createdAt).toLocaleString()}
                    </div>
                    {r.note && (
                      <div className="mt-0.5 text-[11px] text-[color:var(--keel-accent)]">
                        Note: {r.note}
                      </div>
                    )}
                    <div className="mt-1 truncate text-[color:var(--keel-foam)]">
                      {r.excerpt}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 font-mono text-xs text-[color:var(--keel-muted)]">
                No outputs flagged yet.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
