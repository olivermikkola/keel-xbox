# Keel Console

**Chat with a local AI on your TV.** Keel Console is a living-room app for
Xbox Series X|S. The model runs on the console itself with llama.cpp, or on a
PC in your home. No cloud, no account.

> **Beta.** Every merge to `main` is built, packaged and published as a
> download automatically. It installs through Xbox Developer Mode today; a
> Microsoft Store listing is the goal.

## Install on Xbox

**[⬇ Download the latest build](https://github.com/olivermikkola/keel-xbox/releases/latest)**
(`KeelConsole-Xbox-x64-<version>.zip`)

1. **Developer Mode (one time).** Install *Xbox Dev Mode* from the Store on the
   console and activate it with a Partner Center account
   ([Microsoft's guide](https://learn.microsoft.com/windows/uwp/xbox-apps/devkit-activation)).
2. **Remote Access.** In Dev Home, enable Device Portal and set a username and
   password. Note the address it shows, e.g. `https://192.168.1.50:11443`.
3. **Upload.** Open that address in a browser on your PC → *My games & apps* →
   *Add* → pick `KeelConsole.msixbundle`, then add every file in
   `Dependencies/` → *Start*.
4. **Run.** Open Keel Console from Dev Home, press **Y** for Models, download
   **LFM2.5 350M** (~230 MB, once), and start chatting.

The full step-by-step guide, with troubleshooting, is
[`docs/INSTALL-XBOX.txt`](docs/INSTALL-XBOX.txt). The same file is
`INSTALL.txt` inside the zip.

### Controller

| Button | Action |
| --- | --- |
| D-pad / left stick | Move |
| A | Select |
| B | Back / stop generating |
| X | New chat |
| Y | Models |
| LB / RB | Switch tabs |
| Right stick | Scroll |

Keyboard works too: arrow keys, `Enter`, `Esc`, `[` / `]`.

## How the model runs

| Path | Where it runs | Used for |
| --- | --- | --- |
| **On the console** (default on Xbox) | `KeelLlama.dll`, llama.cpp built for UWP and shipped in the package | GGUF models downloaded in-app into the app's own storage |
| **PC on your network** | Keel Desktop, Ollama or `llama-server` on a PC on your home network | Bigger models than the console can hold |
| **In the browser** | `@wllama/wllama` (WebAssembly) | Trying the UI on a PC without an Xbox |

Built-in models (all small enough for the ~1 GB an Xbox app gets):
LFM2.5 350M, SmolLM2 360M, Qwen2.5 0.5B, Qwen3.5 0.8B, all Q4 GGUF.

## Build from source

### UI (any OS)

```bash
npm install
npm run dev        # http://127.0.0.1:3847
npm run check      # hygiene, tests, lint, Store preflight, build
```

### Xbox package (Windows)

CI does this on every push (`.github/workflows/ci.yml`). To do it by hand
from a Developer PowerShell for Visual Studio with the UWP workload:

```powershell
node scripts/export-uwp-ui.mjs                       # UI → native/xbox/KeelConsole.Xbox/ui
cmake -S native/xbox/KeelLlama -B native/xbox/KeelLlama/build -A x64 `
  "-DCMAKE_SYSTEM_NAME=WindowsStore" "-DCMAKE_SYSTEM_VERSION=10.0"
cmake --build native/xbox/KeelLlama/build --config Release
Copy-Item native/xbox/KeelLlama/build/Release/KeelLlama.dll native/xbox/KeelConsole.Xbox/
.\native\xbox\scripts\build-and-sideload.ps1 -XboxIp <xbox-ip>
```

### llama.cpp engine test (Linux / macOS)

Builds the same `KeelLlama` wrapper against the pinned llama.cpp and chats
with a real model through the exact API the Xbox app calls:

```bash
cmake -S native/xbox/KeelLlama -B build-smoke -DCMAKE_BUILD_TYPE=Release \
  -DKEEL_LLAMA_SMOKE=ON -DCMAKE_POSITION_INDEPENDENT_CODE=ON
cmake --build build-smoke -j
curl -L -o model.gguf https://huggingface.co/LiquidAI/LFM2.5-350M-GGUF/resolve/main/LFM2.5-350M-Q4_K_M.gguf
./build-smoke/keel_llama_smoke model.gguf
```

More detail: [`native/xbox/README.md`](native/xbox/README.md) (the UWP shell)
and [`docs/XBOX.md`](docs/XBOX.md) (hardware limits and the Store plan).

## The Keel family

One engine, focused surfaces. The canonical positioning is the
[Keel product vision](https://github.com/olivermikkola/keel/blob/main/docs/VISION.md).

| Product | What it is |
| --- | --- |
| [Keel](https://github.com/olivermikkola/keel) | CLI + TUI coding agent for small local models |
| [Keel Desktop](https://github.com/olivermikkola/keel-desktop) | Everyday local-AI app: Chat, Work, Images, Code. Can share its model with this app over your home network |
| [Keel Mobile](https://github.com/olivermikkola/keel-mobile) | Standalone on-device iPhone agent |
| **Keel Console** (this repo) | Living-room app for Xbox / TV |
| [Keel Arena](https://github.com/olivermikkola/keel-arena) | Public benchmarks and scorecards, the proof layer |
