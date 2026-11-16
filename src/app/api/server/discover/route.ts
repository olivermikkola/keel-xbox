import dgram from "node:dgram";
import os from "node:os";
import { NextRequest, NextResponse } from "next/server";
import { validateLocalServerUrl } from "@/lib/server-url";

export type DiscoveredLanHost = {
  id: string;
  name: string;
  url: string;
  kind: "keel-desktop" | "ollama" | "llama-server";
  activeModel?: string | null;
  runtimeState?: string;
  pairingRequired: boolean;
  latencyMs: number;
};

const DISCOVERY_MAGIC = "KEEL_DISCOVER_V1";
const DEFAULT_DISCOVERY_PORT = 18182;

function ipv4BroadcastAddresses(): string[] {
  const targets = new Set<string>(["255.255.255.255", "127.0.0.1"]);
  const ifaces = os.networkInterfaces();
  for (const entries of Object.values(ifaces)) {
    for (const addr of entries ?? []) {
      if (addr.family !== "IPv4" || addr.internal) continue;
      const ipParts = addr.address.split(".").map(Number);
      const maskParts = addr.netmask.split(".").map(Number);
      if (ipParts.length !== 4 || maskParts.length !== 4) continue;
      const bcast = ipParts
        .map((oct, idx) => (oct | (~maskParts[idx]! & 255)) & 255)
        .join(".");
      targets.add(bcast);
    }
  }
  return [...targets];
}

async function discoverUdpBeacons(
  discoveryPort: number,
  timeoutMs = 700,
): Promise<DiscoveredLanHost[]> {
  return await new Promise((resolve) => {
    const found = new Map<string, DiscoveredLanHost>();
    const socket = dgram.createSocket("udp4");
    const started = performance.now();
    let closed = false;

    const finish = () => {
      if (closed) return;
      closed = true;
      try {
        socket.close();
      } catch {
        // Ignore close errors
      }
      resolve([...found.values()]);
    };

    const timer = setTimeout(finish, timeoutMs);

    socket.on("error", () => {
      clearTimeout(timer);
      finish();
    });

    socket.on("message", (msg, rinfo) => {
      try {
        const parsed = JSON.parse(msg.toString("utf8")) as {
          service?: string;
          hostName?: string;
          lanUrl?: string;
          httpPort?: number;
          runtimeState?: string;
          activeModel?: string | null;
          pairingRequired?: boolean;
        };
        if (parsed.service !== "keel-desktop") return;
        const fallbackUrl = `http://${rinfo.address}:${parsed.httpPort ?? 18181}`;
        const rawUrl = parsed.lanUrl || fallbackUrl;
        let safeUrl: string;
        try {
          safeUrl = validateLocalServerUrl(rawUrl).toString().replace(/\/+$/, "");
        } catch {
          safeUrl = validateLocalServerUrl(fallbackUrl).toString().replace(/\/+$/, "");
        }
        found.set(safeUrl, {
          id: `udp-${safeUrl}`,
          name: parsed.hostName?.trim() || rinfo.address,
          url: safeUrl,
          kind: "keel-desktop",
          activeModel: parsed.activeModel ?? null,
          runtimeState: parsed.runtimeState ?? "unknown",
          pairingRequired: Boolean(parsed.pairingRequired),
          latencyMs: Math.round(performance.now() - started),
        });
      } catch {
        // Ignore malformed UDP replies
      }
    });

    socket.bind(0, "0.0.0.0", () => {
      try {
        socket.setBroadcast(true);
        const payload = Buffer.from(DISCOVERY_MAGIC, "utf8");
        for (const target of ipv4BroadcastAddresses()) {
          socket.send(payload, 0, payload.length, discoveryPort, target);
        }
      } catch {
        clearTimeout(timer);
        finish();
      }
    });
  });
}

async function probeHttpCandidate(rawUrl: string): Promise<DiscoveredLanHost | null> {
  let origin: string;
  try {
    origin = validateLocalServerUrl(rawUrl).toString().replace(/\/+$/, "");
  } catch {
    return null;
  }

  const started = performance.now();

  // Check Keel Desktop /keel/discover first
  try {
    const res = await fetch(`${origin}/keel/discover`, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(800),
    });
    if (res.ok) {
      const json = (await res.json()) as {
        service?: string;
        hostName?: string;
        runtimeState?: string;
        activeModel?: string | null;
        pairingRequired?: boolean;
      };
      if (json.service === "keel-desktop") {
        return {
          id: `http-${origin}`,
          name: json.hostName?.trim() || new URL(origin).hostname,
          url: origin,
          kind: "keel-desktop",
          activeModel: json.activeModel ?? null,
          runtimeState: json.runtimeState ?? "unknown",
          pairingRequired: Boolean(json.pairingRequired),
          latencyMs: Math.round(performance.now() - started),
        };
      }
    }
  } catch {
    // Fall through to standard Ollama / OpenAI checks
  }

  // Check Ollama /api/tags
  try {
    const res = await fetch(`${origin}/api/tags`, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(700),
    });
    if (res.ok) {
      const json = (await res.json()) as { models?: Array<{ name?: string }> };
      return {
        id: `ollama-${origin}`,
        name: `Ollama (${new URL(origin).hostname})`,
        url: origin,
        kind: "ollama",
        activeModel: json.models?.[0]?.name ?? null,
        runtimeState: "running",
        pairingRequired: false,
        latencyMs: Math.round(performance.now() - started),
      };
    }
  } catch {
    // Fall through
  }

  // Check OpenAI /v1/models (llama-server)
  try {
    const res = await fetch(`${origin}/v1/models`, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(700),
    });
    if (res.ok) {
      const json = (await res.json()) as { data?: Array<{ id?: string }> };
      return {
        id: `llama-${origin}`,
        name: `llama-server (${new URL(origin).hostname})`,
        url: origin,
        kind: "llama-server",
        activeModel: json.data?.[0]?.id ?? null,
        runtimeState: "running",
        pairingRequired: false,
        latencyMs: Math.round(performance.now() - started),
      };
    }
  } catch {
    // Unreachable
  }

  return null;
}

export async function POST(req: NextRequest) {
  let body: { extraHost?: string; discoveryPort?: number } = {};
  try {
    body = (await req.json()) as { extraHost?: string; discoveryPort?: number };
  } catch {
    // Empty body is fine
  }

  const discoveryPort =
    typeof body.discoveryPort === "number" &&
    body.discoveryPort > 0 &&
    body.discoveryPort <= 65535
      ? body.discoveryPort
      : DEFAULT_DISCOVERY_PORT;

  const httpCandidates = [
    "http://127.0.0.1:18181",
    "http://127.0.0.1:11434",
    "http://127.0.0.1:8080",
  ];
  if (body.extraHost?.trim()) {
    httpCandidates.unshift(body.extraHost.trim());
  }

  const [udpHosts, httpHosts] = await Promise.all([
    discoverUdpBeacons(discoveryPort),
    Promise.all(httpCandidates.map((u) => probeHttpCandidate(u))),
  ]);

  const byUrl = new Map<string, DiscoveredLanHost>();
  for (const h of [...udpHosts, ...httpHosts.filter((x): x is DiscoveredLanHost => x !== null)]) {
    if (!byUrl.has(h.url) || h.kind === "keel-desktop") {
      byUrl.set(h.url, h);
    }
  }

  const hosts = [...byUrl.values()].sort((a, b) => {
    if (a.kind === "keel-desktop" && b.kind !== "keel-desktop") return -1;
    if (a.kind !== "keel-desktop" && b.kind === "keel-desktop") return 1;
    return a.latencyMs - b.latencyMs;
  });

  return NextResponse.json({ hosts });
}
