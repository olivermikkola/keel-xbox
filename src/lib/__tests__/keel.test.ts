import assert from "node:assert/strict";
import test from "node:test";
import { validateLocalServerUrl } from "../server-url.ts";
import {
  KEEL_MODELS,
  XBOX_SINGLE_FILE_LIMIT_MB,
  formatBytes,
  getModel,
  getPreset,
  runtimeModeLabel,
} from "../models.ts";

test("validateLocalServerUrl accepts loopback, RFC1918 LAN, and mDNS", () => {
  assert.equal(validateLocalServerUrl("http://127.0.0.1:11434").hostname, "127.0.0.1");
  assert.equal(validateLocalServerUrl("http://localhost:8080").hostname, "localhost");
  assert.equal(validateLocalServerUrl("http://192.168.1.42:8080").hostname, "192.168.1.42");
  assert.equal(validateLocalServerUrl("http://10.0.0.5:11434").hostname, "10.0.0.5");
  assert.equal(validateLocalServerUrl("http://172.16.10.4:8080").hostname, "172.16.10.4");
  assert.equal(validateLocalServerUrl("http://gaming-pc.local:8080").hostname, "gaming-pc.local");
});

test("validateLocalServerUrl rejects cloud metadata, public hosts, and non-HTTP", () => {
  assert.throws(() => validateLocalServerUrl("http://169.254.169.254/latest"));
  assert.throws(() => validateLocalServerUrl("https://example.com"));
  assert.throws(() => validateLocalServerUrl("file:///etc/passwd"));
  assert.throws(() => validateLocalServerUrl("not a url"));
});

test("model catalogue enforces Xbox 2 GB ceiling flags and presets", () => {
  const ready = KEEL_MODELS.filter((m) => m.status !== "blocked");
  for (const m of ready) {
    assert.ok(m.sizeMb <= XBOX_SINGLE_FILE_LIMIT_MB, `${m.id} exceeds 2 GB`);
  }
  const blocked = getModel("phi35-mini-int4");
  assert.equal(blocked?.status, "blocked");
  assert.equal(getPreset("unknown-id").id, "general");
  assert.equal(formatBytes(229312224), "218.7 MiB");
  assert.equal(runtimeModeLabel("browser-wasm"), "On-Device WASM");
});
