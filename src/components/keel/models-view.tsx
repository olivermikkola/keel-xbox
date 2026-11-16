"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Badge } from "@/components/ui/badge";
import { XboxGlyph } from "@/components/keel/xbox-glyph";
import { useGamepadNavigation } from "@/hooks/use-gamepad-focus";
import {
  KEEL_MODELS,
  XBOX_SINGLE_FILE_LIMIT_MB,
  backendLabel,
  formatBytes,
  runtimeModeLabel,
  type KeelModel,
  type RuntimeMode,
} from "@/lib/models";
import {
  discoverLanHosts,
  probeLocalServer,
  type DiscoveredLanHost,
  type ServerModelInfo,
} from "@/lib/server-runtime";
import {
  getUwpSystemInfo,
  isUwpHostAvailable,
  listUwpLocalModels,
  type UwpLocalModelEntry,
  type UwpSystemInfo,
} from "@/lib/uwp-bridge";
import {
  wllamaRuntime,
  type BrowserRuntimeState,
  type CachedBrowserModel,
} from "@/lib/wllama-runtime";
import { cn } from "@/lib/utils";

type Props = {
  active: boolean;
  selectedModelId: string;
  runtimeMode: RuntimeMode;
  serverUrl: string;
  serverModel: string;
  serverPin: string;
  contextSize: number;
  onChangeRuntimeMode: (mode: RuntimeMode) => void;
  onSelectModel: (model: KeelModel) => void;
  onUpdateServer: (url: string, model: string, pin?: string) => void;
  onOpenConsole: () => void;
  onBack: () => void;
  onPrevTab: () => void;
  onNextTab: () => void;
};

const STATUS_LABEL: Record<KeelModel["status"], string> = {
  ready: "Xbox Ready",
  available: "Installable",
  blocked: "Over 2 GB Limit",
};

const RUNTIME_MODES: RuntimeMode[] = [
  "browser-wasm",
  "local-server",
  "uwp-native",
  "preview",
];

export function ModelsView({
  active,
  selectedModelId,
  runtimeMode,
  serverUrl,
  serverModel,
  serverPin,
  contextSize,
  onChangeRuntimeMode,
  onSelectModel,
  onUpdateServer,
  onOpenConsole,
  onBack,
  onPrevTab,
  onNextTab,
}: Props) {
  const containerRef = useRef<HTMLElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [runtimeState, setRuntimeState] = useState<BrowserRuntimeState>(() =>
    wllamaRuntime.getState(),
  );
  const [cachedModels, setCachedModels] = useState<CachedBrowserModel[]>([]);
  const [customUrl, setCustomUrl] = useState("");
  const [busyMessage, setBusyMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [draftServerUrl, setDraftServerUrl] = useState(serverUrl);
  const [draftServerPin, setDraftServerPin] = useState(serverPin);
  const [serverModels, setServerModels] = useState<ServerModelInfo[]>([]);
  const [serverProbeNote, setServerProbeNote] = useState<string | null>(null);
  const [probingServer, setProbingServer] = useState(false);
  const [discoveredHosts, setDiscoveredHosts] = useState<DiscoveredLanHost[]>([]);
  const [scanningLan, setScanningLan] = useState(false);

  const [uwpInfo, setUwpInfo] = useState<UwpSystemInfo | null>(null);
  const [uwpModels, setUwpModels] = useState<UwpLocalModelEntry[]>([]);
  const uwpAttached = isUwpHostAvailable();

  const refreshCache = useCallback(async () => {
    const list = await wllamaRuntime.listCachedModels();
    setCachedModels(list);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const unsub = wllamaRuntime.subscribe(() => {
      setRuntimeState(wllamaRuntime.getState());
    });
    void wllamaRuntime.listCachedModels().then((list) => {
      if (!cancelled) setCachedModels(list);
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  useEffect(() => {
    if (!uwpAttached) return;
    void (async () => {
      const [info, models] = await Promise.all([
        getUwpSystemInfo(),
        listUwpLocalModels(),
      ]);
      setUwpInfo(info);
      setUwpModels(models);
    })();
  }, [uwpAttached]);

  useGamepadNavigation({
    containerRef,
    enabled: active,
    onBack,
    onPrevTab,
    onNextTab,
  });

  async function handleLoadCatalogueModel(model: KeelModel) {
    if (model.status === "blocked") return;
    setErrorMsg(null);
    onSelectModel(model);

    if (runtimeMode === "preview") {
      onOpenConsole();
      return;
    }

    if (!model.ggufUrl) {
      onChangeRuntimeMode("uwp-native");
      setBusyMessage(
        `${model.name} uses the native UWP ONNX/DirectML stack in native/xbox/.`,
      );
      return;
    }

    try {
      setBusyMessage(`Loading ${model.name} into WASM runtime…`);
      await wllamaRuntime.loadFromUrl(model.ggufUrl, model.name, {
        nCtx: contextSize,
      });
      await refreshCache();
      setBusyMessage(`${model.name} is loaded and ready.`);
      onChangeRuntimeMode("browser-wasm");
      onOpenConsole();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Failed to download or load GGUF.",
      );
      setBusyMessage(null);
    }
  }

  async function handleDownloadOnly(model: KeelModel) {
    if (!model.ggufUrl) return;
    setErrorMsg(null);
    try {
      setBusyMessage(`Downloading ${model.name} (${model.sizeLabel})…`);
      await wllamaRuntime.downloadModel(model.ggufUrl);
      await refreshCache();
      setBusyMessage(`${model.name} cached in browser storage.`);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Download failed or cancelled.",
      );
      setBusyMessage(null);
    }
  }

  async function handleDeleteCached(url: string) {
    setErrorMsg(null);
    await wllamaRuntime.deleteCachedModel(url);
    await refreshCache();
  }

  async function handleLocalFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setErrorMsg(null);
    try {
      setBusyMessage(`Loading ${files[0]!.name} from disk…`);
      await wllamaRuntime.loadFromLocalFiles(Array.from(files), {
        nCtx: contextSize,
      });
      onChangeRuntimeMode("browser-wasm");
      setBusyMessage(`Loaded ${files[0]!.name}.`);
      onOpenConsole();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Could not load local GGUF file.",
      );
      setBusyMessage(null);
    }
  }

  async function handleCustomUrlLoad() {
    const trimmed = customUrl.trim();
    if (!trimmed) return;
    setErrorMsg(null);
    try {
      const label = trimmed.split("/").pop() || "Custom GGUF";
      setBusyMessage(`Fetching ${label}…`);
      await wllamaRuntime.loadFromUrl(trimmed, label, { nCtx: contextSize });
      await refreshCache();
      onChangeRuntimeMode("browser-wasm");
      onOpenConsole();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Failed to load custom GGUF URL.",
      );
      setBusyMessage(null);
    }
  }

  async function handleProbeServer(
    targetUrl?: string,
    overridePin?: string,
    openOnSuccess = false,
  ) {
    const url = (targetUrl ?? draftServerUrl).trim();
    const pin = (overridePin ?? draftServerPin).trim();
    setDraftServerUrl(url);
    setDraftServerPin(pin);
    setProbingServer(true);
    setErrorMsg(null);
    setServerProbeNote(null);

    try {
      const result = await probeLocalServer(url, pin);
      if (!result.ok) {
        setServerModels([]);
        setErrorMsg(result.error ?? "Server probe failed.");
        return;
      }
      const list = result.models ?? [];
      setServerModels(list);
      setServerProbeNote(
        `Connected (${result.flavor?.toUpperCase()} · ${result.latencyMs ?? 0} ms · ${list.length} model${list.length === 1 ? "" : "s"})`,
      );
      const nextModel =
        list.find((m) => m.id === serverModel)?.id ?? list[0]?.id ?? "";
      onUpdateServer(url, nextModel, pin);
      if (openOnSuccess && nextModel) {
        onChangeRuntimeMode("local-server");
        onOpenConsole();
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Could not reach server.",
      );
    } finally {
      setProbingServer(false);
    }
  }

  async function handleScanLan() {
    setScanningLan(true);
    setErrorMsg(null);
    try {
      const hosts = await discoverLanHosts({
        extraHost: draftServerUrl.trim() || undefined,
      });
      setDiscoveredHosts(hosts);
      if (hosts.length === 0) {
        setServerProbeNote(
          "No Keel Desktop or local runners responded on LAN. Check that Share on LAN is enabled in Keel Desktop, or enter its IP below.",
        );
      } else {
        setServerProbeNote(
          `Found ${hosts.length} local host${hosts.length === 1 ? "" : "s"} on your LAN.`,
        );
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "LAN discovery failed.",
      );
    } finally {
      setScanningLan(false);
    }
  }

  return (
    <section
      ref={containerRef}
      className="keel-safe-x flex min-h-0 flex-1 flex-col py-6"
    >
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] tracking-[0.28em] text-[color:var(--keel-rust)] uppercase">
            Models &amp; Runtime
          </p>
          <h2 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight text-[color:var(--keel-paper)] sm:text-4xl">
            Weights sized for Xbox
          </h2>
          <p className="mt-1.5 max-w-2xl text-sm text-[color:var(--keel-muted)]">
            Run GGUF models directly in browser WASM, connect Ollama or{" "}
            <span className="text-[color:var(--keel-foam)]">llama-server</span>{" "}
            on your LAN, or hand off to native UWP LocalState.
          </p>
        </div>

        <button
          type="button"
          data-keel-focus
          onClick={onBack}
          className="keel-card flex items-center gap-2 rounded-full px-4 py-2 font-mono text-xs text-[color:var(--keel-muted)] hover:text-[color:var(--keel-foam)]"
        >
          <XboxGlyph button="B" />
          <span>Home</span>
        </button>
      </div>

      {/* Runtime Mode Switcher */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="keel-card inline-flex flex-wrap gap-1.5 p-1.5">
          {RUNTIME_MODES.map((mode) => {
            const activeMode = runtimeMode === mode;
            return (
              <button
                key={mode}
                type="button"
                data-keel-focus
                data-keel-default-focus={activeMode ? "true" : undefined}
                onClick={() => onChangeRuntimeMode(mode)}
                className={cn(
                  "rounded-full px-4 py-2 text-sm font-medium transition-colors",
                  activeMode
                    ? "bg-[color:var(--keel-paper)] text-[color:var(--keel-ink)]"
                    : "text-[color:var(--keel-muted)] hover:text-[color:var(--keel-foam)]",
                )}
              >
                {runtimeModeLabel(mode)}
              </button>
            );
          })}
        </div>

        <div className="font-mono text-xs text-[color:var(--keel-muted)]">
          {runtimeState.loadedLabel ? (
            <span className="text-[color:var(--keel-accent)]">
              In memory: {runtimeState.loadedLabel} (
              {runtimeState.multithread ? "Multi-thread" : "Single-thread"}
              {runtimeState.webgpuSupported ? " · WebGPU ready" : ""})
            </span>
          ) : (
            <span>AppContainer single-file cap: ~{XBOX_SINGLE_FILE_LIMIT_MB} MiB</span>
          )}
        </div>
      </div>

      {/* Live Progress / Error Banner */}
      {(runtimeState.loading ||
        runtimeState.downloadingUrl ||
        busyMessage ||
        errorMsg) && (
        <div
          className={cn(
            "mb-4 rounded-xl border px-4 py-3 text-sm",
            errorMsg
              ? "border-[#e06c64]/45 bg-[#e06c64]/10 text-[#f3a6a0]"
              : "border-[color:var(--keel-accent)]/35 bg-[color:var(--keel-surface)] text-[color:var(--keel-foam)]",
          )}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>{errorMsg ?? busyMessage}</span>
            {runtimeState.downloadingUrl && runtimeState.downloadTotalBytes > 0 && (
              <span className="font-mono text-xs text-[color:var(--keel-accent)]">
                {Math.round(runtimeState.downloadProgress * 100)}% ·{" "}
                {formatBytes(runtimeState.downloadLoadedBytes)} /{" "}
                {formatBytes(runtimeState.downloadTotalBytes)}
              </span>
            )}
          </div>
          {runtimeState.downloadingUrl && (
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full bg-[color:var(--keel-accent)] transition-all"
                style={{
                  width: `${Math.max(4, Math.round(runtimeState.downloadProgress * 100))}%`,
                }}
              />
            </div>
          )}
        </div>
      )}

      <div data-keel-scroll className="min-h-0 flex-1 overflow-y-auto pr-1">
        {runtimeMode === "local-server" ? (
          <div className="flex flex-col gap-4 pb-6">
            <div className="keel-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-[color:var(--keel-paper)]">
                    Pair with Keel Desktop or LAN Server
                  </h3>
                  <p className="mt-1 text-sm text-[color:var(--keel-muted)]">
                    Discover a PC running <span className="text-[color:var(--keel-foam)]">Keel Desktop</span> (e.g.{" "}
                    <code className="font-mono text-[color:var(--keel-foam)]">Bonsai 2 9B / 27B</code>) on your home Wi-Fi or Ethernet, or connect directly to Ollama /{" "}
                    <code className="font-mono text-[color:var(--keel-foam)]">llama-server</code>.
                  </p>
                </div>
                <button
                  type="button"
                  data-keel-focus
                  disabled={scanningLan}
                  onClick={() => void handleScanLan()}
                  className="h-11 rounded-full bg-[color:var(--keel-accent)] px-5 text-xs font-semibold text-[color:var(--keel-accent-ink)] disabled:opacity-50"
                >
                  {scanningLan ? "Scanning LAN…" : "Scan home LAN"}
                </button>
              </div>

              {discoveredHosts.length > 0 && (
                <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
                  {discoveredHosts.map((host) => (
                    <li key={host.id}>
                      <button
                        type="button"
                        data-keel-focus
                        onClick={() => {
                          setDraftServerUrl(host.url);
                          if (host.pairingRequired && !draftServerPin.trim()) {
                            setErrorMsg(
                              `Enter the 6-digit pairing PIN shown in ${host.name} below, then select Pair.`,
                            );
                            return;
                          }
                          void handleProbeServer(host.url, draftServerPin, true);
                        }}
                        className="keel-card-raised flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left hover:border-[color:var(--keel-accent)]"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate text-sm font-semibold text-[color:var(--keel-paper)]">
                              {host.name}
                            </span>
                            <Badge variant="outline" className="font-mono text-[10px]">
                              {host.kind}
                            </Badge>
                            {host.pairingRequired && (
                              <Badge className="bg-[color:var(--keel-rust)]/20 font-mono text-[10px] text-[color:var(--keel-rust)]">
                                PIN
                              </Badge>
                            )}
                          </div>
                          <p className="mt-1 truncate font-mono text-xs text-[color:var(--keel-muted)]">
                            {host.url}
                            {host.activeModel ? ` · ${host.activeModel}` : ""}
                            {` · ${host.latencyMs} ms`}
                          </p>
                        </div>
                        <span className="shrink-0 font-mono text-[11px] text-[color:var(--keel-accent)] uppercase">
                          Pair · A
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <input
                  type="url"
                  data-keel-focus
                  value={draftServerUrl}
                  onChange={(e) => setDraftServerUrl(e.target.value)}
                  placeholder="http://192.168.1.20:18181"
                  className="h-12 flex-1 rounded-xl border border-white/15 bg-black/25 px-4 font-mono text-sm text-[color:var(--keel-foam)]"
                />
                <input
                  type="text"
                  inputMode="numeric"
                  data-keel-focus
                  value={draftServerPin}
                  onChange={(e) => setDraftServerPin(e.target.value)}
                  placeholder="Pairing PIN (if set)"
                  className="h-12 w-full rounded-xl border border-white/15 bg-black/25 px-4 font-mono text-sm text-[color:var(--keel-foam)] sm:w-44"
                />
                <button
                  type="button"
                  data-keel-focus
                  disabled={probingServer}
                  onClick={() => void handleProbeServer()}
                  className="h-12 rounded-xl bg-[color:var(--keel-paper)] px-6 text-sm font-semibold text-[color:var(--keel-ink)] disabled:opacity-50"
                >
                  {probingServer ? "Probing…" : "Test & pair"}
                </button>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {[
                  ["Keel Desktop (18181)", "http://127.0.0.1:18181"],
                  ["Ollama (11434)", "http://127.0.0.1:11434"],
                  ["llama-server (8080)", "http://127.0.0.1:8080"],
                ].map(([label, presetUrl]) => (
                  <button
                    key={presetUrl}
                    type="button"
                    data-keel-focus
                    onClick={() => void handleProbeServer(presetUrl)}
                    className="rounded-full border border-white/15 px-3.5 py-1.5 font-mono text-xs text-[color:var(--keel-muted)] hover:text-[color:var(--keel-foam)]"
                  >
                    {label}
                  </button>
                ))}
              </div>

              {serverProbeNote && (
                <p className="mt-3 font-mono text-xs text-[color:var(--keel-accent)]">
                  {serverProbeNote}
                </p>
              )}
            </div>

            {serverModels.length > 0 && (
              <ul className="flex flex-col gap-2.5">
                {serverModels.map((sm) => {
                  const selected = serverModel === sm.id;
                  return (
                    <li key={sm.id}>
                      <button
                        type="button"
                        data-keel-focus
                        onClick={() => {
                          onUpdateServer(draftServerUrl, sm.id, draftServerPin.trim());
                          onChangeRuntimeMode("local-server");
                          onOpenConsole();
                        }}
                        className={cn(
                          "keel-card flex w-full items-center justify-between gap-4 px-5 py-4 text-left",
                          selected &&
                            "border-[color:var(--keel-accent)] bg-[color:var(--keel-surface-raised)]",
                        )}
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-base font-medium text-[color:var(--keel-paper)]">
                              {sm.id}
                            </span>
                            <Badge variant="outline" className="font-mono text-[10px]">
                              {sm.flavor}
                            </Badge>
                            {selected && (
                              <Badge className="bg-[color:var(--keel-accent)] text-[color:var(--keel-accent-ink)]">
                                Active
                              </Badge>
                            )}
                          </div>
                          {sm.sizeBytes ? (
                            <p className="mt-1 font-mono text-xs text-[color:var(--keel-muted)]">
                              {formatBytes(sm.sizeBytes)}
                            </p>
                          ) : null}
                        </div>
                        <span className="font-mono text-xs text-[color:var(--keel-accent)] uppercase">
                          Open in console
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : runtimeMode === "uwp-native" ? (
          <div className="flex flex-col gap-4 pb-6">
            <div className="keel-card p-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-base font-semibold text-[color:var(--keel-paper)]">
                  UWP WebView2 Native Bridge
                </h3>
                <Badge
                  variant="outline"
                  className={cn(
                    "font-mono text-[10px]",
                    uwpAttached
                      ? "border-[color:var(--keel-accent)] text-[color:var(--keel-accent)]"
                      : "border-white/20 text-[color:var(--keel-muted)]",
                  )}
                >
                  {uwpAttached ? "Bridge Attached" : "Browser Preview"}
                </Badge>
              </div>
              <p className="mt-2 text-sm text-[color:var(--keel-muted)]">
                When Keel Console runs inside the UWP Xbox shell (
                <code className="font-mono text-[color:var(--keel-foam)]">
                  native/xbox/KeelConsole.Xbox
                </code>
                ), <code className="font-mono">keelBridge</code> enumerates ONNX /
                GGUF weights under <code className="font-mono">LocalState</code>{" "}
                and runs native C# / C++ inference with DirectML prefill.
              </p>
              {uwpInfo && (
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl bg-black/25 p-3 font-mono text-xs">
                    <div className="text-[color:var(--keel-muted)]">Device</div>
                    <div className="mt-1 text-[color:var(--keel-foam)]">
                      {uwpInfo.deviceFamily}
                    </div>
                  </div>
                  <div className="rounded-xl bg-black/25 p-3 font-mono text-xs">
                    <div className="text-[color:var(--keel-muted)]">Engine</div>
                    <div className="mt-1 text-[color:var(--keel-foam)]">
                      {uwpInfo.engineName}
                    </div>
                  </div>
                  <div className="rounded-xl bg-black/25 p-3 font-mono text-xs">
                    <div className="text-[color:var(--keel-muted)]">LocalState</div>
                    <div className="mt-1 truncate text-[color:var(--keel-foam)]">
                      {uwpInfo.localStatePath}
                    </div>
                  </div>
                </div>
              )}
              {uwpModels.length > 0 && (
                <ul className="mt-4 flex flex-col gap-2">
                  {uwpModels.map((um) => (
                    <li
                      key={um.fileName}
                      className="flex items-center justify-between rounded-xl border border-white/10 px-4 py-2.5 font-mono text-xs"
                    >
                      <span>{um.fileName}</span>
                      <span className="text-[color:var(--keel-muted)]">
                        {formatBytes(um.sizeBytes)} · {um.backend}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4 pb-6">
            {/* Local GGUF Picker & Custom URL */}
            {runtimeMode === "browser-wasm" && (
              <div className="keel-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".gguf"
                  multiple
                  className="hidden"
                  onChange={(e) => void handleLocalFiles(e.target.files)}
                />
                <button
                  type="button"
                  data-keel-focus
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-medium text-[color:var(--keel-foam)] hover:border-white/35"
                >
                  Load local .gguf file
                </button>

                <div className="flex flex-1 gap-2">
                  <input
                    type="url"
                    data-keel-focus
                    value={customUrl}
                    onChange={(e) => setCustomUrl(e.target.value)}
                    placeholder="Or paste any Hugging Face .gguf URL…"
                    className="h-10 flex-1 rounded-xl border border-white/15 bg-black/25 px-3 font-mono text-xs text-[color:var(--keel-foam)]"
                  />
                  <button
                    type="button"
                    data-keel-focus
                    disabled={!customUrl.trim() || runtimeState.loading}
                    onClick={() => void handleCustomUrlLoad()}
                    className="rounded-xl bg-[color:var(--keel-accent)] px-4 text-xs font-semibold text-[color:var(--keel-accent-ink)] disabled:opacity-40"
                  >
                    Load URL
                  </button>
                </div>
              </div>
            )}

            {/* Xbox Curated Catalogue */}
            <ul className="flex flex-col gap-3">
              {KEEL_MODELS.map((model, i) => {
                const selected = selectedModelId === model.id;
                const locked = model.status === "blocked";
                const cached = model.ggufUrl
                  ? cachedModels.find((c) => c.url === model.ggufUrl)
                  : undefined;
                const isLoadedInWasm =
                  Boolean(model.ggufUrl) &&
                  runtimeState.loadedKey === model.ggufUrl;
                const pctOfLimit = Math.min(
                  100,
                  Math.round((model.sizeMb / XBOX_SINGLE_FILE_LIMIT_MB) * 100),
                );

                return (
                  <motion.li
                    key={model.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className={cn(
                      "keel-card p-5 transition-colors",
                      (selected || isLoadedInWasm) &&
                        "border-[color:var(--keel-accent)]/60 bg-[color:var(--keel-surface-raised)]",
                      locked && "opacity-60",
                    )}
                  >
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.35fr_0.9fr_auto] lg:items-center">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-lg font-semibold text-[color:var(--keel-paper)]">
                            {model.name}
                          </span>
                          <Badge
                            variant="outline"
                            className="border-white/15 font-mono text-[10px] uppercase"
                          >
                            {STATUS_LABEL[model.status]}
                          </Badge>
                          {isLoadedInWasm && (
                            <Badge className="bg-[color:var(--keel-accent)] text-[color:var(--keel-accent-ink)]">
                              Loaded in RAM
                            </Badge>
                          )}
                          {cached && !isLoadedInWasm && (
                            <Badge
                              variant="outline"
                              className="border-[color:var(--keel-accent)]/50 font-mono text-[10px] text-[color:var(--keel-accent)]"
                            >
                              Cached
                            </Badge>
                          )}
                        </div>
                        <p className="mt-1.5 text-sm text-[color:var(--keel-muted)]">
                          {model.blurb}
                        </p>
                      </div>

                      <div className="font-mono text-xs text-[color:var(--keel-muted)]">
                        <div className="text-[color:var(--keel-foam)]">
                          {model.params} · {model.sizeLabel} ·{" "}
                          {backendLabel(model.backend)}
                        </div>
                        <div className="mt-1 text-[color:var(--keel-accent)]">
                          ~{model.tokensPerSec} tok/s decode
                          {model.prefillTokPerSec
                            ? ` · ~${model.prefillTokPerSec} prefill`
                            : ""}
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                            <div
                              className={cn(
                                "h-full rounded-full",
                                locked
                                  ? "bg-[#e06c64]"
                                  : "bg-[color:var(--keel-jade)]",
                              )}
                              style={{ width: `${pctOfLimit}%` }}
                            />
                          </div>
                          <span className="text-[10px]">
                            {pctOfLimit}% of 2 GB cap
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {!locked && model.ggufUrl && runtimeMode === "browser-wasm" && !cached && (
                          <button
                            type="button"
                            data-keel-focus
                            disabled={runtimeState.loading || Boolean(runtimeState.downloadingUrl)}
                            onClick={() => void handleDownloadOnly(model)}
                            className="rounded-full border border-white/20 px-4 py-2 font-mono text-xs text-[color:var(--keel-foam)] hover:border-white/40 disabled:opacity-40"
                          >
                            Cache GGUF
                          </button>
                        )}
                        {cached && (
                          <button
                            type="button"
                            data-keel-focus
                            onClick={() => void handleDeleteCached(cached.url)}
                            className="rounded-full border border-white/15 px-3 py-2 font-mono text-xs text-[color:var(--keel-muted)] hover:border-[#e06c64]/50 hover:text-[#f3a6a0]"
                          >
                            Remove
                          </button>
                        )}
                        <button
                          type="button"
                          data-keel-focus
                          disabled={locked || runtimeState.loading}
                          onClick={() => void handleLoadCatalogueModel(model)}
                          className={cn(
                            "rounded-full px-5 py-2 text-xs font-semibold uppercase tracking-wider disabled:opacity-40",
                            isLoadedInWasm
                              ? "bg-[color:var(--keel-accent)] text-[color:var(--keel-accent-ink)]"
                              : "bg-[color:var(--keel-paper)] text-[color:var(--keel-ink)]",
                          )}
                        >
                          {locked
                            ? "Blocked"
                            : isLoadedInWasm
                              ? "Open"
                              : runtimeMode === "preview"
                                ? "Use preview"
                                : "Load & chat"}
                        </button>
                      </div>
                    </div>
                  </motion.li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
