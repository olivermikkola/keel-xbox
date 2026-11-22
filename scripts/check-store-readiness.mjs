import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

// 1. Package.appxmanifest checks (non-game Xbox UWP app, WACK-safe capabilities, real assets)
const manifest = read("native/xbox/KeelConsole.Xbox/Package.appxmanifest");
assert.match(manifest, /TargetDeviceFamily\s+Name="Windows\.Universal"/, "Missing Windows.Universal");
assert.match(manifest, /TargetDeviceFamily\s+Name="Windows\.Xbox"/, "Missing Windows.Xbox");
assert.match(manifest, /Capability\s+Name="internetClient"/, "Missing internetClient");
assert.match(manifest, /Capability\s+Name="privateNetworkClientServer"/, "Missing privateNetworkClientServer");

const restrictedCaps = ["broadFileSystemAccess", "runFullTrust", "enterpriseAuthentication", "sharedUserCertificates"];
for (const cap of restrictedCaps) {
  assert.ok(!manifest.includes(cap), `Restricted capability found in manifest: ${cap}`);
}

const assetMatches = [...manifest.matchAll(/Assets\\([A-Za-z0-9_.-]+\.png)/g)].map((m) => m[1]);
assert.ok(assetMatches.length >= 4, "Expected UWP logo and splash assets in Package.appxmanifest");
for (const fileName of assetMatches) {
  const full = path.join(root, "native/xbox/KeelConsole.Xbox/Assets", fileName);
  assert.ok(fs.existsSync(full), `Missing manifest asset: ${fileName}`);
  assert.ok(fs.statSync(full).size > 0, `Empty manifest asset: ${fileName}`);
}

// 2. Xbox 10-foot scaling & pointer opt-out + WebView2 hardening
const appCs = read("native/xbox/KeelConsole.Xbox/App.xaml.cs");
assert.match(appCs, /ApplicationViewScaling\.TrySetDisableLayoutScaling\(true\)/);
assert.match(appCs, /ApplicationRequiresPointerMode\.WhenRequested/);

const mainCs = read("native/xbox/KeelConsole.Xbox/MainPage.xaml.cs");
assert.match(mainCs, /AreDevToolsEnabled\s*=\s*false/);
assert.match(mainCs, /AreDefaultContextMenusEnabled\s*=\s*false/);
// UWP cannot project a plain C# object via AddHostObjectToScript (needs wv2winrt);
// the UI must talk to native code over WebView2 web messages instead.
assert.ok(!/AddHostObjectToScript/.test(mainCs), "MainPage must not use AddHostObjectToScript on UWP");
assert.match(mainCs, /__keelUwpHost/, "MainPage must flag the UWP host for the UI");
const bridgeCs = read("native/xbox/KeelConsole.Xbox/Services/KeelNativeBridge.cs");
assert.match(bridgeCs, /WebMessageReceived/, "Native bridge must listen for WebView2 web messages");
for (const method of ["GetSystemInfoJson", "ListLocalModelsJson", "StreamChat", "DownloadLocalModel", "DeleteLocalModel"]) {
  assert.match(bridgeCs, new RegExp(`case "${method}"`), `Bridge RPC dispatch is missing ${method}`);
}

// 3. Native UWP ORT GenAI + DirectML + 2 GiB ceiling checks
const csproj = read("native/xbox/KeelConsole.Xbox/KeelConsole.Xbox.csproj");
assert.match(csproj, /Microsoft\.ML\.OnnxRuntimeGenAI\.DirectML/);
assert.match(csproj, /UseDotNetNativeToolchain>true<\/UseDotNetNativeToolchain>/);
// Release packages are llama.cpp-only; ORT GenAI (desktop Win32 DLLs) stays opt-in.
assert.match(csproj, /KeelEnableOrtGenAI Condition="[^"]*">false</, "ORT GenAI must be off by default");
assert.match(csproj, /Content Include="KeelLlama\.dll"/, "KeelLlama.dll must be packaged");

const infCs = read("native/xbox/KeelConsole.Xbox/Services/LocalInferenceService.cs");
assert.match(infCs, /SingleFileCeilingBytes\s*=\s*2048UL\s*\*\s*1024UL\s*\*\s*1024UL/);
assert.match(infCs, /using Microsoft\.ML\.OnnxRuntimeGenAI;/);
assert.match(infCs, /config\.AppendProvider\("dml"\)/);

// 4. Store Policy 11.16 disclosure & structured reporting UI
const consoleTsx = read("src/components/keel/console-view.tsx");
assert.match(consoleTsx, /Policy 11\.16/);
assert.match(consoleTsx, /Report AI Output/);

const settingsTsx = read("src/components/keel/settings-view.tsx");
assert.match(settingsTsx, /Store Policy 11\.16/);
assert.match(settingsTsx, /exportPolicy1116ReportsJson/);

console.log(
  "Store Policy 11.16 & WACK static preflight passed (Linux host: actual .msix compile, appcert.exe WACK run, and Xbox Dev Mode sideloading require Windows + Xbox hardware).",
);
