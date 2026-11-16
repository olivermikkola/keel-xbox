"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { XboxGlyph } from "@/components/keel/xbox-glyph";
import { useGamepadNavigation } from "@/hooks/use-gamepad-focus";
import { streamReply } from "@/lib/inference";
import {
  PROMPT_PRESETS,
  getPreset,
  runtimeModeLabel,
  type KeelModel,
  type RuntimeMode,
} from "@/lib/models";
import type { ChatMessage, ChatThread } from "@/lib/settings";
import { cn } from "@/lib/utils";

type Props = {
  active: boolean;
  model: KeelModel;
  runtimeMode: RuntimeMode;
  loadedWasmLabel: string | null;
  serverUrl: string;
  serverModel: string;
  temperature: number;
  maxTokens: number;
  threads: ChatThread[];
  activeThread: ChatThread;
  onSelectThread: (threadId: string) => void;
  onCreateThread: (presetId?: string) => void;
  onDeleteThread: (threadId: string) => void;
  onUpdateThread: (thread: ChatThread) => void;
  onChangePreset: (presetId: string) => void;
  onSwitchToPreview: () => void;
  onReportOutput: (msg: ChatMessage) => void;
  onBack: () => void;
  onOpenModels: () => void;
  onPrevTab: () => void;
  onNextTab: () => void;
  onStats: (stats: { tps: number | null; generating: boolean }) => void;
};

function nowMs(): number {
  return Date.now();
}

function createChatPair(
  prompt: string,
  runtimeLabel: string,
): { userMsg: ChatMessage; assistantStub: ChatMessage; now: number } {
  const now = nowMs();
  return {
    now,
    userMsg: {
      id: `u-${now}`,
      role: "user",
      content: prompt,
      createdAt: now,
    },
    assistantStub: {
      id: `a-${now + 1}`,
      role: "assistant",
      content: "",
      runtimeLabel,
      createdAt: now + 1,
    },
  };
}

export function ConsoleView({
  active,
  model,
  runtimeMode,
  loadedWasmLabel,
  serverUrl,
  serverModel,
  temperature,
  maxTokens,
  threads,
  activeThread,
  onSelectThread,
  onCreateThread,
  onDeleteThread,
  onUpdateThread,
  onChangePreset,
  onSwitchToPreview,
  onReportOutput,
  onBack,
  onOpenModels,
  onPrevTab,
  onNextTab,
  onStats,
}: Props) {
  const containerRef = useRef<HTMLElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [reportedId, setReportedId] = useState<string | null>(null);
  const [showSidebar, setShowSidebar] = useState(false);

  const preset = getPreset(activeThread.presetId);

  const needsSetup =
    (runtimeMode === "browser-wasm" && !loadedWasmLabel) ||
    (runtimeMode === "local-server" && !serverModel.trim());

  const activeEngineName =
    runtimeMode === "browser-wasm"
      ? loadedWasmLabel ?? `${model.name} (not loaded)`
      : runtimeMode === "local-server"
        ? serverModel || "No server model"
        : runtimeMode === "uwp-native"
          ? `${model.name} (UWP)`
          : `${model.name} (Preview)`;

  useEffect(() => {
    scrollerRef.current?.scrollTo({
      top: scrollerRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [activeThread.messages.length, generating]);

  useGamepadNavigation({
    containerRef,
    enabled: active,
    onBack: () => {
      if (generating) {
        abortRef.current?.abort();
        return;
      }
      if (showSidebar) {
        setShowSidebar(false);
        return;
      }
      onBack();
    },
    onActionX: () => {
      if (generating) {
        abortRef.current?.abort();
      } else {
        onCreateThread(activeThread.presetId);
      }
    },
    onActionY: onOpenModels,
    onPrevTab,
    onNextTab,
  });

  async function sendPrompt(prompt: string, baseMessages?: ChatMessage[]) {
    const trimmed = prompt.trim();
    if (!trimmed || generating) return;

    setError(null);
    setInput("");

    const prior = baseMessages ?? activeThread.messages;
    const { now, userMsg, assistantStub } = createChatPair(
      trimmed,
      runtimeModeLabel(runtimeMode),
    );
    const assistantId = assistantStub.id;

    const nextTitle =
      prior.length === 0
        ? trimmed.slice(0, 42) + (trimmed.length > 42 ? "…" : "")
        : activeThread.title;

    let workingMessages = [...prior, userMsg, assistantStub];
    onUpdateThread({
      ...activeThread,
      title: nextTitle,
      messages: workingMessages,
      updatedAt: now,
    });

    setGenerating(true);
    onStats({ tps: 0, generating: true });

    const controller = new AbortController();
    abortRef.current = controller;

    const apiMessages = [
      { role: "system" as const, content: preset.systemPrompt },
      ...prior
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      { role: "user" as const, content: trimmed },
    ];

    try {
      await streamReply({
        runtimeMode,
        model,
        messages: apiMessages,
        temperature,
        maxTokens,
        serverUrl,
        serverModel,
        signal: controller.signal,
        onToken: (token, stats) => {
          workingMessages = workingMessages.map((m) =>
            m.id === assistantId
              ? { ...m, content: m.content + token, tps: stats.tps }
              : m,
          );
          onUpdateThread({
            ...activeThread,
            title: nextTitle,
            messages: workingMessages,
            updatedAt: nowMs(),
          });
          onStats({ tps: stats.tps, generating: true });
        },
        onDone: (stats) => {
          onStats({ tps: stats.tps, generating: false });
        },
      });
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError(
          err instanceof Error
            ? err.message
            : "Inference failed. Check your selected runtime in Models.",
        );
        // Remove empty assistant stub if nothing streamed
        workingMessages = workingMessages.filter(
          (m) => !(m.id === assistantId && !m.content),
        );
        onUpdateThread({
          ...activeThread,
          title: nextTitle,
          messages: workingMessages,
          updatedAt: nowMs(),
        });
        onStats({ tps: null, generating: false });
      }
    } finally {
      setGenerating(false);
      abortRef.current = null;
    }
  }

  function handleRegenerate() {
    if (generating) return;
    const msgs = activeThread.messages;
    const lastUserIdx = [...msgs].reverse().findIndex((m) => m.role === "user");
    if (lastUserIdx === -1) return;
    const realIdx = msgs.length - 1 - lastUserIdx;
    const lastUser = msgs[realIdx]!;
    void sendPrompt(lastUser.content, msgs.slice(0, realIdx));
  }

  async function handleCopy(msg: ChatMessage) {
    try {
      await navigator.clipboard.writeText(msg.content);
      setCopiedId(msg.id);
      window.setTimeout(() => setCopiedId(null), 1600);
    } catch {
      // Clipboard may be restricted in headless contexts
    }
  }

  return (
    <section
      ref={containerRef}
      className="keel-safe-x flex min-h-0 flex-1 flex-col py-4 sm:py-5"
    >
      {/* Top Bar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] tracking-[0.26em] text-[color:var(--keel-rust)] uppercase">
              Console
            </span>
            <span className="text-xs text-[color:var(--keel-muted)]">·</span>
            <span className="font-mono text-[11px] text-[color:var(--keel-accent)]">
              {runtimeModeLabel(runtimeMode)}
            </span>
          </div>
          <h2 className="mt-0.5 font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight text-[color:var(--keel-paper)] sm:text-3xl">
            {activeEngineName}
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-keel-focus
            onClick={() => setShowSidebar((s) => !s)}
            className="keel-card rounded-full px-4 py-2 font-mono text-xs text-[color:var(--keel-foam)]"
          >
            {showSidebar ? "Hide sessions" : `Sessions (${threads.length})`}
          </button>
          <button
            type="button"
            data-keel-focus
            onClick={() => onCreateThread(activeThread.presetId)}
            disabled={generating}
            className="keel-card flex items-center gap-2 rounded-full px-4 py-2 font-mono text-xs text-[color:var(--keel-foam)] disabled:opacity-40"
          >
            <XboxGlyph button="X" />
            <span>New chat</span>
          </button>
          <button
            type="button"
            data-keel-focus
            onClick={onOpenModels}
            className="keel-card flex items-center gap-2 rounded-full px-4 py-2 font-mono text-xs text-[color:var(--keel-foam)]"
          >
            <XboxGlyph button="Y" />
            <span>Models</span>
          </button>
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
      </div>

      {/* Prompt Presets Strip */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {PROMPT_PRESETS.map((p) => {
          const selected = p.id === activeThread.presetId;
          return (
            <button
              key={p.id}
              type="button"
              data-keel-focus
              disabled={generating}
              onClick={() => onChangePreset(p.id)}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
                selected
                  ? "border-[color:var(--keel-accent)] bg-[color:var(--keel-accent)]/15 text-[color:var(--keel-paper)]"
                  : "border-white/10 bg-black/20 text-[color:var(--keel-muted)] hover:text-[color:var(--keel-foam)]",
              )}
            >
              {p.label}
            </button>
          );
        })}
        <span className="ml-1 hidden text-xs text-[color:var(--keel-muted)] md:inline">
          {preset.summary}
        </span>
      </div>

      {/* Explicit Setup Notice if chosen runtime has no model ready */}
      {needsSetup && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[color:var(--keel-rust)]/45 bg-[color:var(--keel-surface)] px-4 py-3 text-sm">
          <div>
            <span className="font-semibold text-[color:var(--keel-paper)]">
              {runtimeMode === "browser-wasm"
                ? "No on-device GGUF loaded yet."
                : "No local server model selected."}
            </span>{" "}
            <span className="text-[color:var(--keel-muted)]">
              Load real weights in Models, or test the couch cadence with Preview Simulator.
            </span>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              data-keel-focus
              onClick={onOpenModels}
              className="rounded-full bg-[color:var(--keel-paper)] px-4 py-1.5 text-xs font-semibold text-[color:var(--keel-ink)]"
            >
              Open Models
            </button>
            <button
              type="button"
              data-keel-focus
              onClick={onSwitchToPreview}
              className="rounded-full border border-white/20 px-4 py-1.5 text-xs font-medium text-[color:var(--keel-foam)]"
            >
              Use Preview Simulator
            </button>
          </div>
        </div>
      )}

      {/* Main Split: Optional Sessions Drawer + Chat Transcript */}
      <div className="flex min-h-0 flex-1 gap-4">
        {showSidebar && (
          <aside className="keel-card flex w-64 shrink-0 flex-col p-3">
            <div className="mb-2 flex items-center justify-between px-2">
              <span className="font-mono text-[10px] tracking-[0.2em] text-[color:var(--keel-muted)] uppercase">
                Saved sessions
              </span>
            </div>
            <ul className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
              {threads.map((t) => {
                const isCurrent = t.id === activeThread.id;
                return (
                  <li key={t.id} className="flex items-center gap-1">
                    <button
                      type="button"
                      data-keel-focus
                      onClick={() => onSelectThread(t.id)}
                      className={cn(
                        "min-w-0 flex-1 truncate rounded-lg px-3 py-2 text-left text-xs",
                        isCurrent
                          ? "bg-[color:var(--keel-surface-raised)] font-medium text-[color:var(--keel-paper)]"
                          : "text-[color:var(--keel-muted)] hover:text-[color:var(--keel-foam)]",
                      )}
                    >
                      {t.title}
                    </button>
                    {threads.length > 1 && (
                      <button
                        type="button"
                        data-keel-focus
                        aria-label={`Delete ${t.title}`}
                        onClick={() => onDeleteThread(t.id)}
                        className="rounded-lg px-2 py-2 font-mono text-[10px] text-[color:var(--keel-muted)] hover:text-[#f3a6a0]"
                      >
                        ×
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </aside>
        )}

        <div
          ref={scrollerRef}
          data-keel-scroll
          className="keel-card min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7"
        >
          {activeThread.messages.length === 0 ? (
            <div className="flex h-full flex-col justify-between gap-6 py-2">
              <div className="max-w-2xl">
                <p className="font-mono text-[11px] tracking-[0.22em] text-[color:var(--keel-accent)] uppercase">
                  AI-generated output · {preset.label}
                </p>
                <p className="mt-2 text-lg leading-relaxed text-[color:var(--keel-foam)]">
                  Pick a quick prompt with <span className="font-semibold">D-Pad + A</span>{" "}
                  below, or enter your own prompt for{" "}
                  <span className="text-[color:var(--keel-paper)]">
                    {activeEngineName}
                  </span>
                  .
                </p>
                <p className="mt-2 text-xs text-[color:var(--keel-muted)]">
                  Store Policy 11.16 notice: replies are generated by an AI language
                  model and may be inaccurate. Use Flag on any reply to log an issue.
                </p>
              </div>

              <div className="grid gap-2.5 sm:grid-cols-3">
                {preset.quickPrompts.map((qp, idx) => (
                  <button
                    key={qp}
                    type="button"
                    data-keel-focus
                    data-keel-default-focus={idx === 0 ? "true" : undefined}
                    onClick={() => void sendPrompt(qp)}
                    className="keel-card-raised flex min-h-24 flex-col justify-between p-4 text-left hover:border-white/30"
                  >
                    <span className="text-sm leading-snug text-[color:var(--keel-foam)]">
                      {qp}
                    </span>
                    <span className="mt-3 font-mono text-[10px] tracking-[0.18em] text-[color:var(--keel-accent)] uppercase">
                      Ask · A
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <ul className="flex flex-col gap-5">
              {activeThread.messages.map((m, idx) => {
                const isLastAssistant =
                  m.role === "assistant" &&
                  idx === activeThread.messages.length - 1;

                return (
                  <li key={m.id}>
                    <motion.div
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={cn(
                        "max-w-3xl rounded-2xl px-4 py-3.5",
                        m.role === "user"
                          ? "ml-auto border border-white/10 bg-[color:var(--keel-surface-raised)]"
                          : "border border-transparent bg-black/20",
                      )}
                    >
                      <div className="mb-1.5 flex items-center justify-between gap-3">
                        <span className="font-mono text-[10px] tracking-[0.22em] text-[color:var(--keel-muted)] uppercase">
                          {m.role === "assistant"
                            ? `Keel${m.runtimeLabel ? ` · ${m.runtimeLabel}` : ""}`
                            : "You"}
                        </span>
                        {m.role === "assistant" && m.tps ? (
                          <span className="font-mono text-[10px] text-[color:var(--keel-accent)]">
                            {m.tps.toFixed(1)} tok/s
                          </span>
                        ) : null}
                      </div>

                      <p className="whitespace-pre-wrap text-[16px] leading-relaxed text-[color:var(--keel-foam)]">
                        {m.content || (generating ? "▍" : "")}
                        {m.role === "assistant" && generating && isLastAssistant && (
                          <span className="keel-caret ml-1 inline-block h-4 w-2 align-middle" />
                        )}
                      </p>

                      {m.role === "assistant" && m.content && !generating && (
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            data-keel-focus
                            onClick={() => void handleCopy(m)}
                            className="rounded-full border border-white/12 px-3 py-1 font-mono text-[10px] text-[color:var(--keel-muted)] hover:text-[color:var(--keel-foam)]"
                          >
                            {copiedId === m.id ? "Copied" : "Copy"}
                          </button>
                          {isLastAssistant && (
                            <button
                              type="button"
                              data-keel-focus
                              onClick={handleRegenerate}
                              className="rounded-full border border-white/12 px-3 py-1 font-mono text-[10px] text-[color:var(--keel-muted)] hover:text-[color:var(--keel-foam)]"
                            >
                              Retry
                            </button>
                          )}
                          <button
                            type="button"
                            data-keel-focus
                            onClick={() => {
                              onReportOutput(m);
                              setReportedId(m.id);
                            }}
                            className="rounded-full border border-white/12 px-3 py-1 font-mono text-[10px] text-[color:var(--keel-muted)] hover:border-[color:var(--keel-rust)]/60 hover:text-[color:var(--keel-rust)]"
                          >
                            {reportedId === m.id ? "Logged (11.16)" : "Flag output"}
                          </button>
                        </div>
                      )}
                    </motion.div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="mt-2.5 rounded-xl border border-[#e06c64]/45 bg-[#e06c64]/10 px-4 py-2 text-sm text-[#f3a6a0]"
        >
          {error}
        </p>
      )}

      {/* Composer */}
      <form
        className="mt-3 flex flex-col gap-2.5 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          void sendPrompt(input);
        }}
      >
        <Textarea
          ref={inputRef}
          data-keel-focus
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={`Message ${activeEngineName}…`}
          rows={2}
          disabled={generating}
          className="min-h-14 flex-1 resize-none rounded-2xl border-white/15 bg-[color:var(--keel-surface)] px-4 py-3 text-base text-[color:var(--keel-foam)] placeholder:text-[color:var(--keel-muted)]"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void sendPrompt(input);
            }
          }}
        />
        <div className="flex gap-2">
          {generating ? (
            <Button
              type="button"
              data-keel-focus
              variant="outline"
              onClick={() => abortRef.current?.abort()}
              className="h-14 min-w-28 rounded-2xl border-[color:var(--keel-rust)]/60 bg-[color:var(--keel-rust)]/15 text-[color:var(--keel-paper)] hover:bg-[color:var(--keel-rust)]/25"
            >
              Stop · B
            </Button>
          ) : (
            <Button
              type="submit"
              data-keel-focus
              disabled={!input.trim()}
              className="h-14 min-w-28 rounded-2xl bg-[color:var(--keel-paper)] text-sm font-semibold text-[color:var(--keel-ink)] hover:opacity-95 disabled:opacity-40"
            >
              Send
            </Button>
          )}
        </div>
      </form>
    </section>
  );
}
