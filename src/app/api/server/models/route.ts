import { NextRequest, NextResponse } from "next/server";
import { validateLocalServerUrl } from "@/lib/server-url";

export type DiscoveredServerModel = {
  id: string;
  sizeBytes?: number;
  flavor: "ollama" | "openai";
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { baseUrl?: string; pairingCode?: string };
    const base = validateLocalServerUrl(body.baseUrl ?? "");
    const origin = base.toString().replace(/\/+$/, "");
    const pairingCode = body.pairingCode?.trim();
    const headers: Record<string, string> = {};
    if (pairingCode) {
      headers["X-Keel-Pairing-Code"] = pairingCode;
      headers["Authorization"] = `Bearer ${pairingCode}`;
    }

    const started = performance.now();

    // Try OpenAI-compatible /v1/models first (works for Keel Desktop, llama-server, LM Studio, Ollama /v1)
    try {
      const res = await fetch(`${origin}/v1/models`, {
        method: "GET",
        headers,
        redirect: "manual",
        signal: AbortSignal.timeout(4500),
      });
      if (res.status === 401) {
        return NextResponse.json(
          {
            ok: false,
            requiresPin: true,
            error: "Pairing PIN required or invalid — check the PIN in Keel Desktop.",
          },
          { status: 401 },
        );
      }
      if (res.status === 503) {
        const errJson = (await res.json().catch(() => ({}))) as { error?: string };
        return NextResponse.json(
          {
            ok: false,
            error:
              errJson.error ??
              "Keel Desktop is reachable, but no model is running there yet.",
          },
          { status: 503 },
        );
      }
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
      headers,
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
