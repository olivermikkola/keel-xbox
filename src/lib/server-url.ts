export function validateLocalServerUrl(raw: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    throw new Error("Enter a valid http:// or https:// server URL.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http:// and https:// endpoints are supported.");
  }

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (host === "169.254.169.254" || host.startsWith("169.254.")) {
    throw new Error("Link-local metadata addresses are blocked.");
  }

  const isLoopback =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host.endsWith(".localhost");

  const isMdns = host.endsWith(".local");

  const isRfc1918 =
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) ||
    /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(host);

  if (!isLoopback && !isMdns && !isRfc1918) {
    throw new Error(
      "Server URL must be localhost, .local, or a private LAN IP (10.x, 172.16-31.x, 192.168.x).",
    );
  }

  return parsed;
}
