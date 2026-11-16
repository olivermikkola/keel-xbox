"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { streamLocalReply } from "@/lib/inference";
import { backendLabel, type KeelModel } from "@/lib/models";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Message = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
};

type Props = {
  model: KeelModel;
  active: boolean;
  onBack: () => void;
  onOpenModels: () => void;
  onStats: (stats: { tps: number | null; generating: boolean }) => void;
};

const STARTERS = [
  "How fast can small models run on Xbox?",
  "Why keep inference on the console?",
  "What’s the Microsoft Store path for Keel?",
];

export function ConsoleView({
  model,
  active,
  onBack,
  onOpenModels,
  onStats,
}: Props) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "sys",
      role: "system",
      content: `Loaded ${model.name} · ${backendLabel(model.backend)} · target ~${model.tokensPerSec} tok/s (Xbox Series S class estimate). This preview simulates local decode timing.`,
    },
  ]);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const nextIdRef = useRef(0);

  useEffect(() => {
    scrollerRef.current?.scrollTo({
      top: scrollerRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, generating]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key.toLowerCase() === "b") {
        if (document.activeElement === inputRef.current && input.length > 0) return;
        onBack();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, onBack, input.length]);

  async function send(prompt: string) {
    const trimmed = prompt.trim();
    if (!trimmed || generating) return;

    setError(null);
    setInput("");
    const seq = ++nextIdRef.current;
    const userMsg: Message = {
      id: `u-${seq}`,
      role: "user",
      content: trimmed,
    };
    const assistantId = `a-${seq}`;
    setMessages((prev) => [
      ...prev,
      userMsg,
      { id: assistantId, role: "assistant", content: "" },
    ]);
    setGenerating(true);
    onStats({ tps: 0, generating: true });

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await streamLocalReply(model, trimmed, {
        signal: controller.signal,
        onToken: (token, stats) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: m.content + token } : m,
            ),
          );
          onStats({ tps: stats.tps, generating: true });
        },
        onDone: (stats) => {
          onStats({ tps: stats.tps, generating: false });
        },
      });
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError("Inference preview failed. Try again.");
        onStats({ tps: null, generating: false });
      }
    } finally {
      setGenerating(false);
      abortRef.current = null;
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col px-6 py-6 sm:px-10 lg:px-14">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] tracking-[0.3em] text-[color:var(--keel-water)] uppercase">
            Console
          </p>
          <h2 className="font-[family-name:var(--font-display)] text-3xl tracking-tight text-[color:var(--keel-foam)] sm:text-4xl">
            {model.name}
          </h2>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onOpenModels}
            className="border border-white/15 px-4 py-2 font-mono text-[11px] tracking-[0.18em] text-[color:var(--keel-muted)] uppercase hover:border-white/40 hover:text-[color:var(--keel-foam)]"
          >
            Models
          </button>
          <button
            type="button"
            onClick={onBack}
            className="border border-white/15 px-4 py-2 font-mono text-[11px] tracking-[0.18em] text-[color:var(--keel-muted)] uppercase hover:border-white/40 hover:text-[color:var(--keel-foam)]"
          >
            Home · Esc
          </button>
        </div>
      </div>

      <div
        ref={scrollerRef}
        className="keel-panel min-h-0 flex-1 overflow-y-auto border border-white/10 px-4 py-4 sm:px-6"
      >
        <ul className="flex flex-col gap-4">
          {messages.map((m) => (
            <li key={m.id}>
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "max-w-3xl",
                  m.role === "user" && "ml-auto text-right",
                )}
              >
                <div className="mb-1 font-mono text-[10px] tracking-[0.22em] text-[color:var(--keel-muted)] uppercase">
                  {m.role === "assistant"
                    ? "Keel"
                    : m.role === "user"
                      ? "You"
                      : "System"}
                </div>
                <p
                  className={cn(
                    "whitespace-pre-wrap text-[15px] leading-relaxed sm:text-base",
                    m.role === "system"
                      ? "text-[color:var(--keel-muted)]"
                      : "text-[color:var(--keel-foam)]",
                    m.role === "user" && "text-[color:var(--keel-sand)]",
                  )}
                >
                  {m.content || (generating ? "▍" : "")}
                  {m.role === "assistant" &&
                    generating &&
                    messages[messages.length - 1]?.id === m.id && (
                      <span className="keel-caret ml-0.5 inline-block h-4 w-2 align-middle" />
                    )}
                </p>
              </motion.div>
            </li>
          ))}
        </ul>

        {!generating && messages.length <= 1 && (
          <div className="mt-8 flex flex-wrap gap-2">
            {STARTERS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => send(s)}
                className="border border-white/12 px-3 py-2 text-left text-sm text-[color:var(--keel-muted)] hover:border-[color:var(--keel-water)]/60 hover:text-[color:var(--keel-foam)]"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && (
        <p className="mt-3 text-sm text-red-300" role="alert">
          {error}
        </p>
      )}

      <form
        className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <Textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask Keel — local preview, couch-scale replies"
          rows={2}
          disabled={generating}
          className="min-h-16 flex-1 resize-none rounded-none border-white/15 bg-black/30 text-base text-[color:var(--keel-foam)] placeholder:text-[color:var(--keel-muted)]"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(input);
            }
          }}
        />
        <div className="flex gap-2">
          {generating ? (
            <Button
              type="button"
              variant="outline"
              onClick={stop}
              className="h-12 min-w-28 rounded-none border-white/20 bg-transparent"
            >
              Stop
            </Button>
          ) : (
            <Button
              type="submit"
              disabled={!input.trim()}
              className="h-12 min-w-28 rounded-none bg-[color:var(--keel-water)] text-[color:var(--keel-ink)] hover:bg-[color:var(--keel-water)]/90"
            >
              Send
            </Button>
          )}
        </div>
      </form>
    </section>
  );
}
