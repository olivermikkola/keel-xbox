import { NextRequest } from "next/server";
import { validateLocalServerUrl } from "@/lib/server-url";

type ChatPayload = {
  baseUrl?: string;
  model?: string;
  messages?: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  temperature?: number;
  maxTokens?: number;
};

export async function POST(req: NextRequest) {
  let payload: ChatPayload;
  try {
    payload = (await req.json()) as ChatPayload;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  let origin: string;
  try {
    origin = validateLocalServerUrl(payload.baseUrl ?? "")
      .toString()
      .replace(/\/+$/, "");
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Invalid server URL.",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const messages = payload.messages ?? [];
  const model = payload.model?.trim() || "default";
  const temperature = payload.temperature ?? 0.6;
  const maxTokens = payload.maxTokens ?? 384;

  // Prefer OpenAI-compatible /v1/chat/completions (works with llama-server, Ollama >=0.1.24, LM Studio)
  let upstream: Response | null = null;
  let mode: "openai" | "ollama" = "openai";

  try {
    const res = await fetch(`${origin}/v1/chat/completions`, {
      method: "POST",
      redirect: "manual",
      signal: req.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
        stream: true,
      }),
    });
    if (res.ok && res.body) {
      upstream = res;
      mode = "openai";
    }
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      return new Response(null, { status: 499 });
    }
  }

  if (!upstream) {
    try {
      const res = await fetch(`${origin}/api/chat`, {
        method: "POST",
        redirect: "manual",
        signal: req.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages,
          stream: true,
          options: { temperature, num_predict: maxTokens },
        }),
      });
      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => "");
        return new Response(
          JSON.stringify({
            error: errText || `Upstream returned HTTP ${res.status}.`,
          }),
          { status: 502, headers: { "Content-Type": "application/json" } },
        );
      }
      upstream = res;
      mode = "ollama";
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        return new Response(null, { status: 499 });
      }
      return new Response(
        JSON.stringify({
          error:
            err instanceof Error
              ? err.message
              : "Could not connect to local model server.",
        }),
        { status: 502, headers: { "Content-Type": "application/json" } },
      );
    }
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const body = upstream.body!;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = body.getReader();
      let buffer = "";

      const emit = (obj: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line) continue;

            if (mode === "openai") {
              if (!line.startsWith("data:")) continue;
              const data = line.slice(5).trim();
              if (data === "[DONE]") {
                emit({ done: true });
                continue;
              }
              try {
                const parsed = JSON.parse(data) as {
                  choices?: Array<{ delta?: { content?: string } }>;
                };
                const token = parsed.choices?.[0]?.delta?.content;
                if (token) emit({ token });
              } catch {
                // Ignore partial/malformed SSE frames
              }
            } else {
              try {
                const parsed = JSON.parse(line) as {
                  message?: { content?: string };
                  done?: boolean;
                };
                if (parsed.message?.content) {
                  emit({ token: parsed.message.content });
                }
                if (parsed.done) {
                  emit({ done: true });
                }
              } catch {
                // Ignore malformed NDJSON lines
              }
            }
          }
        }
        emit({ done: true });
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          emit({
            error: err instanceof Error ? err.message : "Stream failed.",
          });
        }
      } finally {
        reader.releaseLock();
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
