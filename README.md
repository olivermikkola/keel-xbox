# Keel Console

**Chat with a local AI on your TV.** Keel Console is a living-room app for
Xbox Series S|X — the model runs on the console itself or on a PC in your
home. No cloud, no account.

A **10-foot console app** aimed at the Microsoft Store, built with the canonical
**Keel** visual identity (Ink, Jade, Rust, Paper, and the Sail mark) and spatial
Xbox controller navigation (`navigator.getGamepads()` + keyboard arrows).

## How the model runs (three real paths)

1. **On-Device Browser WASM (`@wllama/wllama`)** — runs compact `.gguf` weights (`LFM2.5 350M`, `SmolLM2 360M`, `Qwen2.5 0.5B`, `Qwen3.5 0.8B`, or your own local `.gguf` file) directly in Edge / WebView2 with local `/wllama/wllama.wasm` and OPFS caching.
2. **Local / LAN Server** — connects to Ollama, `llama-server`, or Keel Desktop over loopback or private LAN via `/api/server/models` and `/api/server/chat` SSE streaming.
3. **Native UWP Bridge (`native/xbox/`)** — Visual Studio UWP Xbox shell (`KeelConsole.Xbox.sln`) using WebView2, `ApplicationViewScaling` opt-out, pointer-free XY navigation, and the `keelBridge` WinRT interface for `LocalState` ONNX Runtime GenAI / `llama.cpp`.

## Run locally

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:3847](http://127.0.0.1:3847).

- **Xbox controller**: D-Pad / Left Stick moves spatial focus, `A` selects, `B` goes back / stops generation, `X` starts a new chat, `Y` jumps to Models, `LB`/`RB` switch tabs, Right Stick scrolls.
- **Keyboard**: Arrow keys, `Enter`, `Esc`, `[` / `]`.

## Verify

```bash
npm run lint
npm run build
```

See [`docs/XBOX.md`](docs/XBOX.md) and [`native/xbox/README.md`](native/xbox/README.md) for Xbox Dev Mode sideloading and Store Policy 11.16 packaging details.

## The Keel family

One engine, focused surfaces — the canonical positioning is the
[Keel product vision](https://github.com/olivermikkola/keel/blob/main/docs/VISION.md).

| Product | What it is |
| --- | --- |
| [Keel](https://github.com/olivermikkola/keel) | CLI + TUI coding agent for small local models |
| [Keel Desktop](https://github.com/olivermikkola/keel-desktop) | Everyday local-AI app: Chat, Work, Images, Code — can share its model with this app over LAN |
| [Keel Mobile](https://github.com/olivermikkola/keel-mobile) | Standalone on-device iPhone agent |
| **Keel Console** (this repo) | Living-room app for Xbox / TV |
| [Keel Arena](https://github.com/olivermikkola/keel-arena) | Public benchmarks and scorecards — the proof layer |
