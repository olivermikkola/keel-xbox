# Keel Console — Xbox UWP Shell (`native/xbox`)

This folder holds the UWP Xbox host project (`KeelConsole.Xbox.sln`) for sideloading on **Xbox Developer Mode** and packaging toward the **Microsoft Store**.

## What is included

- `KeelConsole.Xbox.sln` & `KeelConsole.Xbox/KeelConsole.Xbox.csproj` — UWP (`10.0.19041.0`+) app project targeting `x64` (`Windows.Universal` + `Windows.Xbox`).
- `Package.appxmanifest` — Non-game Xbox app declaration (`internetClient` + `privateNetworkClientServer` for LAN `llama-server` / Ollama, Keel Ink `#0A1112` background, rendered Keel Sail tile assets).
- `App.xaml.cs` — Disables Xbox 200% layout scaling (`ApplicationViewScaling.TrySetDisableLayoutScaling(true)`) and pointer mouse-emulation (`ApplicationRequiresPointerMode.WhenRequested`) so controller D-pad / Left Stick drive crisp 10-foot XY navigation.
- `MainPage.xaml.cs` — Hosts the Keel Console UI in `Microsoft.UI.Xaml.Controls.WebView2` (from the packaged `ui\` folder via `https://keel.local`) and flags `window.__keelUwpHost` for the page.
- `Services/KeelNativeBridge.cs` & `Services/LocalInferenceService.cs` — native bridge the UI calls over WebView2 web messages (`{kind:"keel-rpc"}` → `{kind:"keel-rpc-result"}`; UWP can't project a plain C# host object without wv2winrt). It runs GGUF models through `KeelLlama.dll` (llama.cpp, `../KeelLlama`), enumerating `ApplicationData.Current.LocalFolder\models` (`.gguf`, `.onnx`, and ORT GenAI folders containing `genai_config.json`, respecting the ~2 GiB single-file ceiling), optionally wiring `Microsoft.ML.OnnxRuntimeGenAI.DirectML` (off by default: `/p:KeelEnableOrtGenAI=true`; its DLLs are desktop Win32 builds), and providing UDP LAN discovery + PIN-gated SSE proxying for packaged `.msix` sessions.
- `scripts/build-and-sideload.ps1` — PowerShell script for Windows Release|x64 build, optional WACK `appcert.exe` test, and Xbox Device Portal sideloading.

## Build & Sideload on Windows + Xbox Dev Mode

1. Open `native/xbox/KeelConsole.Xbox.sln` in **Visual Studio 2022+** on Windows with the **Universal Windows Platform development** workload (or run `native/xbox/scripts/build-and-sideload.ps1` from a Developer PowerShell for VS).
2. NuGet restore pulls `Microsoft.NETCore.UniversalWindowsPlatform`, `Microsoft.UI.Xaml`, `Microsoft.Web.WebView2`, and `Microsoft.ML.OnnxRuntimeGenAI.DirectML` (ONNX Runtime GenAI only with `-EnableOrtGenAI $true`).
3. Optional bundled UI: export static UI into `KeelConsole.Xbox\ui\` (or run `npm run dev` on your dev PC while debugging).
4. Set target to **Remote Machine** (`x64`), enter your Xbox Dev Mode IP + PIN, and deploy (`F5` or run `.\native\xbox\scripts\build-and-sideload.ps1 -RunWack -XboxIp <xbox-ip>`).

See [`../../docs/XBOX.md`](../../docs/XBOX.md) for WACK and Store Policy 11.16 notes.
