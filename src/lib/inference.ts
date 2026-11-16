import type { KeelModel } from "@/lib/models";

const REPLIES = [
  "Keel keeps inference on the console — no cloud round-trip for this turn. On Xbox Series S class hardware, compact instruct models land in a usable living-room cadence when we stay under the AppContainer file ceilings.",
  "Think of Keel as a console app, not a game package. Gamepad focus, large type, and a model catalogue sized for unified memory. Prefill can ride DirectML; decode often stays on Zen 2 CPU at these sizes.",
  "Ship path: iterate the 10-foot UX here, then port the shell to UWP with ONNX Runtime GenAI / llama.cpp for Dev Mode, targeting Microsoft Store packaging once the binary set clears WACK and Xbox app policies.",
  "Smaller models win on Xbox. Sub-1B INT4 or Q4 packs fit LocalState, respect the ~2 GB per-file ONNX limit, and still feel conversational from the couch.",
];

function tokenize(text: string): string[] {
  return text.match(/\S+\s*/g) ?? [text];
}

function pickReply(prompt: string): string {
  const idx =
    Math.abs(
      Array.from(prompt).reduce((acc, ch) => acc + ch.charCodeAt(0), 0),
    ) % REPLIES.length;
  return REPLIES[idx]!;
}

export type StreamHandlers = {
  onToken: (token: string, stats: { tokens: number; elapsedMs: number; tps: number }) => void;
  onDone: (stats: { tokens: number; elapsedMs: number; tps: number }) => void;
  signal?: AbortSignal;
};

/** Simulates local decode at the selected model's Xbox-class tokens/sec. */
export async function streamLocalReply(
  model: KeelModel,
  prompt: string,
  handlers: StreamHandlers,
): Promise<void> {
  const reply = pickReply(prompt.trim() || "keel");
  const tokens = tokenize(reply);
  const msPerToken = 1000 / Math.max(model.tokensPerSec, 1);
  const started = performance.now();
  let count = 0;

  for (const token of tokens) {
    if (handlers.signal?.aborted) break;
    await sleep(msPerToken, handlers.signal);
    if (handlers.signal?.aborted) break;
    count += 1;
    const elapsedMs = performance.now() - started;
    const tps = count / (elapsedMs / 1000);
    handlers.onToken(token, { tokens: count, elapsedMs, tps });
  }

  const elapsedMs = performance.now() - started;
  const tps = count / Math.max(elapsedMs / 1000, 0.001);
  handlers.onDone({ tokens: count, elapsedMs, tps });
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const id = window.setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        window.clearTimeout(id);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}
