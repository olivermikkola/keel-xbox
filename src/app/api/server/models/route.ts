import { NextRequest, NextResponse } from "next/server";
import { validateLocalServerUrl } from "@/lib/server-url";

export type DiscoveredServerModel = {
  id: string;
  sizeBytes?: number;
  flavor: "ollama" | "openai";
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { baseUrl?: string };
    const base = validateLocalServerUrl(body.baseUrl ?? "");
    const origin = base.toString().replace(/\/+$/, "");

    const started = performance.now();

    // Try OpenAI-compatible /v1/models first (works for llama-server, LM Studio, Ollama /v1)
    try {
      const res = await fetch(`${origin}/v1/models`, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(4500),
      });
      if (res.ok) {
        const json = (await res.json()) as {
          data?: Array<{ id?: string }>;
        };
        const models: DiscoveredServerModel[] = (json.data ?? [])
          .map((m) => m.id)
          .filter((id): id is string => Boolean(id))
          .map((id) => ({ id, flavor: "openai" as const }));

        if (models.length > 0) {
          return NextResponse.json({
            ok: true,
            flavor: "openai",
            latencyMs: Math.round(performance.now() - started),
            models,
          });
        }
      }
    } catch {
      // Fall through to Ollama /api/tags probe
    }

    // Probe Ollama /api/tags
    const ollamaRes = await fetch(`${origin}/api/tags`, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(4500),
    });

    if (!ollamaRes.ok) {
      return NextResponse.json(
        { ok: false, error: `Server responded with HTTP ${ollamaRes.status}.` },
        { status: 502 },
      );
    }

    const ollamaJson = (await ollamaRes.json()) as {
      models?: Array<{ name?: string; size?: number }>;
    };

    const models: DiscoveredServerModel[] = (ollamaJson.models ?? [])
      .filter((m): m is { name: string; size?: number } => Boolean(m.name))
      .map((m) => ({
        id: m.name,
        sizeBytes: m.size,
        flavor: "ollama" as const,
      }));

    return NextResponse.json({
      ok: true,
      flavor: "ollama",
      latencyMs: Math.round(performance.now() - started),
      models,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not reach local server.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
