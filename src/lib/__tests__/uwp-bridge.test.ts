import assert from "node:assert/strict";
import test from "node:test";

// Fake WebView2 that answers like KeelNativeBridge.cs: every
// { kind: "keel-rpc", id, method, args } gets { kind: "keel-rpc-result", id, ok, result },
// and StreamChat additionally pushes token/done events tagged with the request id.
type Listener = (event: { data: unknown }) => void;
const listeners = new Set<Listener>();
const calls: Array<{ method: string; args: string[] }> = [];

function emit(data: unknown) {
  // C# uses PostWebMessageAsJson, so the page receives parsed objects.
  for (const l of [...listeners]) l({ data });
}

(globalThis as unknown as { window: unknown }).window = {
  __keelUwpHost: 1,
  chrome: {
    webview: {
      addEventListener: (_type: string, l: Listener) => listeners.add(l),
      removeEventListener: (_type: string, l: Listener) => listeners.delete(l),
      postMessage: (raw: unknown) => {
        const msg = JSON.parse(String(raw)) as {
          kind: string;
          id: string;
          method: string;
          args: string[];
        };
        assert.equal(msg.kind, "keel-rpc");
        calls.push({ method: msg.method, args: msg.args });
        queueMicrotask(() => {
          if (msg.method === "GetSystemInfoJson") {
            emit({
              kind: "keel-rpc-result",
              id: msg.id,
              ok: true,
              result: JSON.stringify({ deviceFamily: "Windows.Xbox", engineName: "xllama" }),
            });
          } else if (msg.method === "StreamChat") {
            const req = JSON.parse(msg.args[0]) as { requestId: string };
            emit({ kind: "keel-rpc-result", id: msg.id, ok: true, result: null });
            emit({ requestId: req.requestId, type: "token", token: "Hel" });
            emit({ requestId: req.requestId, type: "token", token: "lo" });
            emit({ requestId: req.requestId, type: "done" });
          } else if (msg.method === "DeleteLocalModel") {
            emit({ kind: "keel-rpc-result", id: msg.id, ok: false, error: "locked" });
          }
        });
      },
    },
  },
};

const bridge = await import("../uwp-bridge.ts");

test("UWP host is detected from the shell flag + postMessage", () => {
  assert.equal(bridge.isUwpHostAvailable(), true);
});

test("RPC call round-trips through web messages", async () => {
  const info = await bridge.getUwpSystemInfo();
  assert.equal(info?.deviceFamily, "Windows.Xbox");
  assert.deepEqual(calls.at(-1), { method: "GetSystemInfoJson", args: [] });
});

test("StreamChat streams tokens from native events", async () => {
  let text = "";
  await bridge.streamUwpInference(
    {
      modelFile: "LFM2.5-350M-Q4_K_M.gguf",
      messages: [{ role: "user", content: "hi" }],
      temperature: 0.6,
      maxTokens: 32,
    },
    { onToken: (t) => (text += t) },
  );
  assert.equal(text, "Hello");
  const sent = JSON.parse(calls.at(-1)!.args[0]) as { modelFile: string };
  assert.equal(sent.modelFile, "LFM2.5-350M-Q4_K_M.gguf");
});

test("native errors reject the promise", async () => {
  await assert.rejects(bridge.deleteUwpLocalModel("x.gguf"), /locked/);
});
