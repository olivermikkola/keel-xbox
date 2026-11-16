# Keel Console

On-device language models for Xbox — a **10-foot living-room console app** aimed at the Microsoft Store.

Built with the canonical **Keel** visual identity (Ink, Jade, Rust, Paper, and the Sail mark), spatial Xbox controller navigation (`navigator.getGamepads()` + keyboard arrows), and three real inference paths:

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
