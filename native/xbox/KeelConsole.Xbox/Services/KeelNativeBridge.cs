using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Web.WebView2.Core;
using Windows.Data.Json;
using Windows.Foundation.Metadata;
using Windows.Storage;
using Windows.System;
using Windows.System.Profile;

namespace KeelConsole.Xbox.Services
{
    /// <summary>
    /// Native side of the Keel Console UI bridge. The WebView2 page calls it with
    /// <c>window.chrome.webview.postMessage({ kind: "keel-rpc", id, method, args })</c>
    /// and receives <c>{ kind: "keel-rpc-result", id, ok, result | error }</c> back.
    /// (UWP cannot expose a plain C# object through AddHostObjectToScript; that needs
    /// a wv2winrt C++/WinRT projection. Web messages work on Xbox without one.)
    /// Handles LocalState llama.cpp / ONNX Runtime GenAI inference, UDP/HTTP LAN
    /// discovery, and private-LAN SSE proxying when running packaged in UWP.
    /// </summary>
    public sealed class KeelNativeBridge
    {
        private const string DiscoveryMagic = "KEEL_DISCOVER_V1";
        private const int DefaultDiscoveryPort = 18182;

        private readonly LocalInferenceService _inference = new LocalInferenceService();
        private readonly HttpClient _http = new HttpClient { Timeout = TimeSpan.FromMinutes(3) };
        private readonly HttpClient _downloadHttp = new HttpClient { Timeout = Timeout.InfiniteTimeSpan };
        private CoreWebView2 _coreWebView;
        private CancellationTokenSource _activeCts;
        private CancellationTokenSource _downloadCts;

        internal void AttachWebView(CoreWebView2 core)
        {
            _coreWebView = core;
            core.WebMessageReceived += OnWebMessageReceived;
        }

        private void OnWebMessageReceived(CoreWebView2 sender, CoreWebView2WebMessageReceivedEventArgs args)
        {
            string raw;
            try
            {
                raw = args.TryGetWebMessageAsString();
            }
            catch
            {
                return;
            }
            if (!JsonObject.TryParse(raw ?? string.Empty, out JsonObject msg)) return;
            if (msg.GetNamedString("kind", "") != "keel-rpc") return;

            string id = msg.GetNamedString("id", "");
            string method = msg.GetNamedString("method", "");
            JsonArray argsArr = msg.ContainsKey("args") && msg["args"].ValueType == JsonValueType.Array
                ? msg.GetNamedArray("args")
                : new JsonArray();

            // Run off the UI thread: some calls (LAN discovery, probes) block briefly.
            _ = Task.Run(() =>
            {
                var reply = new JsonObject
                {
                    ["kind"] = JsonValue.CreateStringValue("keel-rpc-result"),
                    ["id"] = JsonValue.CreateStringValue(id),
                };
                try
                {
                    string result = Dispatch(method, argsArr);
                    reply["ok"] = JsonValue.CreateBooleanValue(true);
                    reply["result"] = result == null ? JsonValue.CreateNullValue() : JsonValue.CreateStringValue(result);
                }
                catch (Exception ex)
                {
                    reply["ok"] = JsonValue.CreateBooleanValue(false);
                    reply["error"] = JsonValue.CreateStringValue(ex.Message);
                }
                PostToWeb(reply.Stringify());
            });
        }

        private string Dispatch(string method, JsonArray args)
        {
            string Arg(uint i) => i < args.Count && args[(int)i].ValueType == JsonValueType.String
                ? args.GetStringAt(i)
                : string.Empty;

            switch (method)
            {
                case "GetSystemInfoJson": return GetSystemInfoJson();
                case "ListLocalModelsJson": return ListLocalModelsJson();
                case "DiscoverLanHostsJson": return DiscoverLanHostsJson();
                case "ProbeLocalServerJson": return ProbeLocalServerJson(Arg(0), Arg(1));
                case "StreamServerChat": StreamServerChat(Arg(0)); return null;
                case "StreamChat": StreamChat(Arg(0)); return null;
                case "CancelChat": CancelChat(); return null;
                case "CancelDownload": CancelDownload(); return null;
                case "DeleteLocalModel": return DeleteLocalModel(Arg(0));
                case "DownloadLocalModel": DownloadLocalModel(Arg(0)); return null;
                default: throw new InvalidOperationException($"Unknown bridge method: {method}");
            }
        }

        public string GetSystemInfoJson()
        {
            ulong memLimitMb = MemoryManager.AppMemoryUsageLimit / (1024UL * 1024UL);
            string family = AnalyticsInfo.VersionInfo.DeviceFamily;

            var obj = new JsonObject
            {
                ["deviceFamily"] = JsonValue.CreateStringValue(family),
                ["localStatePath"] = JsonValue.CreateStringValue(ApplicationData.Current.LocalFolder.Path),
                ["availableMemoryMb"] = JsonValue.CreateNumberValue(memLimitMb),
                ["singleFileLimitMb"] = JsonValue.CreateNumberValue(2048),
                ["runtimeAvailable"] = JsonValue.CreateBooleanValue(_inference.IsEngineAttached),
                ["engineName"] = JsonValue.CreateStringValue(_inference.EngineName),
            };
            return obj.Stringify();
        }

        public string ListLocalModelsJson()
        {
            var models = _inference.EnumerateLocalStateModels();
            var arr = new JsonArray();
            foreach (var m in models)
            {
                arr.Add(new JsonObject
                {
                    ["fileName"] = JsonValue.CreateStringValue(m.FileName),
                    ["sizeBytes"] = JsonValue.CreateNumberValue(m.SizeBytes),
                    ["backend"] = JsonValue.CreateStringValue(m.Backend),
                });
            }
            return arr.Stringify();
        }

        public string DiscoverLanHostsJson()
        {
            return Task.Run(async () =>
            {
                var byUrl = new Dictionary<string, JsonObject>(StringComparer.OrdinalIgnoreCase);
                var sw = Stopwatch.StartNew();

                try
                {
                    using (var udp = new UdpClient())
                    {
                        udp.EnableBroadcast = true;
                        byte[] probeBytes = Encoding.UTF8.GetBytes(DiscoveryMagic);
                        await udp.SendAsync(probeBytes, probeBytes.Length, new IPEndPoint(IPAddress.Broadcast, DefaultDiscoveryPort));
                        await udp.SendAsync(probeBytes, probeBytes.Length, new IPEndPoint(IPAddress.Loopback, DefaultDiscoveryPort));

                        DateTime deadline = DateTime.UtcNow.AddMilliseconds(750);
                        while (DateTime.UtcNow < deadline)
                        {
                            int remainingMs = Math.Max(50, (int)(deadline - DateTime.UtcNow).TotalMilliseconds);
                            var recvTask = udp.ReceiveAsync();
                            var completed = await Task.WhenAny(recvTask, Task.Delay(remainingMs));
                            if (completed != recvTask) break;

                            var res = recvTask.Result;
                            string text = Encoding.UTF8.GetString(res.Buffer);
                            if (!JsonObject.TryParse(text, out JsonObject beacon)) continue;
                            if (!string.Equals(beacon.GetNamedString("service", ""), "keel-desktop", StringComparison.Ordinal)) continue;

                            int port = (int)beacon.GetNamedNumber("httpPort", 18181);
                            string candidateUrl = beacon.GetNamedString("lanUrl", $"http://{res.RemoteEndPoint.Address}:{port}").TrimEnd('/');
                            if (!TryValidatePrivateLanUri(candidateUrl, out Uri validUri))
                            {
                                candidateUrl = $"http://{res.RemoteEndPoint.Address}:{port}";
                                if (!TryValidatePrivateLanUri(candidateUrl, out validUri)) continue;
                            }

                            string origin = validUri.GetLeftPart(UriPartial.Authority);
                            byUrl[origin] = new JsonObject
                            {
                                ["id"] = JsonValue.CreateStringValue($"udp-{origin}"),
                                ["name"] = JsonValue.CreateStringValue(beacon.GetNamedString("hostName", res.RemoteEndPoint.Address.ToString())),
                                ["url"] = JsonValue.CreateStringValue(origin),
                                ["kind"] = JsonValue.CreateStringValue("keel-desktop"),
                                ["activeModel"] = beacon.ContainsKey("activeModel") && beacon["activeModel"].ValueType == JsonValueType.String
                                    ? JsonValue.CreateStringValue(beacon.GetNamedString("activeModel", ""))
                                    : JsonValue.CreateNullValue(),
                                ["runtimeState"] = JsonValue.CreateStringValue(beacon.GetNamedString("runtimeState", "unknown")),
                                ["pairingRequired"] = JsonValue.CreateBooleanValue(beacon.GetNamedBoolean("pairingRequired", false)),
                                ["latencyMs"] = JsonValue.CreateNumberValue((int)sw.ElapsedMilliseconds),
                            };
                        }
                    }
                }
                catch
                {
                    // Return any discovered entries or fall back cleanly
                }

                var arr = new JsonArray();
                foreach (var item in byUrl.Values) arr.Add(item);
                return arr.Stringify();
            }).GetAwaiter().GetResult();
        }

        public string ProbeLocalServerJson(string baseUrl, string pairingCode)
        {
            return Task.Run(async () =>
            {
                if (!TryValidatePrivateLanUri(baseUrl, out Uri validUri))
                {
                    return new JsonObject
                    {
                        ["ok"] = JsonValue.CreateBooleanValue(false),
                        ["error"] = JsonValue.CreateStringValue("Server URL must be localhost, .local, or a private LAN IP."),
                    }.Stringify();
                }

                string origin = validUri.GetLeftPart(UriPartial.Authority);
                var sw = Stopwatch.StartNew();

                try
                {
                    using (var req = new HttpRequestMessage(HttpMethod.Get, $"{origin}/v1/models"))
                    {
                        ApplyPairingHeader(req, pairingCode);
                        using (var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5)))
                        using (var res = await _http.SendAsync(req, cts.Token))
                        {
                            if (res.StatusCode == HttpStatusCode.Unauthorized)
                            {
                                return new JsonObject
                                {
                                    ["ok"] = JsonValue.CreateBooleanValue(false),
                                    ["requiresPin"] = JsonValue.CreateBooleanValue(true),
                                    ["error"] = JsonValue.CreateStringValue("Pairing PIN required or invalid — check the PIN in Keel Desktop."),
                                }.Stringify();
                            }

                            if (res.IsSuccessStatusCode)
                            {
                                string body = await res.Content.ReadAsStringAsync();
                                JsonObject parsed = JsonObject.Parse(body);
                                JsonArray data = parsed.ContainsKey("data") ? parsed.GetNamedArray("data") : new JsonArray();
                                var models = new JsonArray();
                                for (uint i = 0; i < data.Count; i++)
                                {
                                    string id = data.GetObjectAt(i).GetNamedString("id", "");
                                    if (string.IsNullOrEmpty(id)) continue;
                                    models.Add(new JsonObject
                                    {
                                        ["id"] = JsonValue.CreateStringValue(id),
                                        ["flavor"] = JsonValue.CreateStringValue("openai"),
                                    });
                                }

                                return new JsonObject
                                {
                                    ["ok"] = JsonValue.CreateBooleanValue(true),
                                    ["flavor"] = JsonValue.CreateStringValue("openai"),
                                    ["latencyMs"] = JsonValue.CreateNumberValue((int)sw.ElapsedMilliseconds),
                                    ["models"] = models,
                                }.Stringify();
                            }
                        }
                    }

                    using (var req = new HttpRequestMessage(HttpMethod.Get, $"{origin}/api/tags"))
                    using (var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5)))
                    using (var res = await _http.SendAsync(req, cts.Token))
                    {
                        if (!res.IsSuccessStatusCode)
                        {
                            return new JsonObject
                            {
                                ["ok"] = JsonValue.CreateBooleanValue(false),
                                ["error"] = JsonValue.CreateStringValue($"Server responded with HTTP {(int)res.StatusCode}."),
                            }.Stringify();
                        }

                        string body = await res.Content.ReadAsStringAsync();
                        JsonObject parsed = JsonObject.Parse(body);
                        JsonArray list = parsed.ContainsKey("models") ? parsed.GetNamedArray("models") : new JsonArray();
                        var models = new JsonArray();
                        for (uint i = 0; i < list.Count; i++)
                        {
                            var m = list.GetObjectAt(i);
                            string name = m.GetNamedString("name", "");
                            if (string.IsNullOrEmpty(name)) continue;
                            var entry = new JsonObject
                            {
                                ["id"] = JsonValue.CreateStringValue(name),
                                ["flavor"] = JsonValue.CreateStringValue("ollama"),
                            };
                            if (m.ContainsKey("size")) entry["sizeBytes"] = m["size"];
                            models.Add(entry);
                        }

                        return new JsonObject
                        {
                            ["ok"] = JsonValue.CreateBooleanValue(true),
                            ["flavor"] = JsonValue.CreateStringValue("ollama"),
                            ["latencyMs"] = JsonValue.CreateNumberValue((int)sw.ElapsedMilliseconds),
                            ["models"] = models,
                        }.Stringify();
                    }
                }
                catch (Exception ex)
                {
                    return new JsonObject
                    {
                        ["ok"] = JsonValue.CreateBooleanValue(false),
                        ["error"] = JsonValue.CreateStringValue(ex.Message),
                    }.Stringify();
                }
            }).GetAwaiter().GetResult();
        }

        public void StreamServerChat(string requestJson)
        {
            _activeCts?.Cancel();
            _activeCts = new CancellationTokenSource();
            var ct = _activeCts.Token;

            _ = Task.Run(async () =>
            {
                string requestId = "lan";
                try
                {
                    JsonObject reqObj = JsonObject.Parse(requestJson);
                    requestId = reqObj.GetNamedString("requestId", "lan");
                    string baseUrl = reqObj.GetNamedString("baseUrl", "");
                    string pairingCode = reqObj.GetNamedString("pairingCode", "");
                    string model = reqObj.GetNamedString("model", "default");
                    double temperature = reqObj.GetNamedNumber("temperature", 0.6);
                    double maxTokens = reqObj.GetNamedNumber("maxTokens", 384);
                    JsonArray messages = reqObj.ContainsKey("messages")
                        ? reqObj.GetNamedArray("messages")
                        : new JsonArray();

                    if (!TryValidatePrivateLanUri(baseUrl, out Uri validUri))
                    {
                        PostEvent(requestId, "error", error: "Server URL must be localhost, .local, or a private LAN IP.");
                        return;
                    }

                    string origin = validUri.GetLeftPart(UriPartial.Authority);
                    var bodyObj = new JsonObject
                    {
                        ["model"] = JsonValue.CreateStringValue(model),
                        ["messages"] = messages,
                        ["temperature"] = JsonValue.CreateNumberValue(temperature),
                        ["max_tokens"] = JsonValue.CreateNumberValue(maxTokens),
                        ["stream"] = JsonValue.CreateBooleanValue(true),
                    };

                    using (var msg = new HttpRequestMessage(HttpMethod.Post, $"{origin}/v1/chat/completions"))
                    {
                        ApplyPairingHeader(msg, pairingCode);
                        msg.Content = new StringContent(bodyObj.Stringify(), Encoding.UTF8, "application/json");
                        using (var res = await _http.SendAsync(msg, HttpCompletionOption.ResponseHeadersRead, ct))
                        {
                            if (res.StatusCode == HttpStatusCode.Unauthorized)
                            {
                                PostEvent(requestId, "error", error: "Keel Desktop pairing PIN required or invalid.");
                                return;
                            }
                            if (!res.IsSuccessStatusCode)
                            {
                                PostEvent(requestId, "error", error: $"LAN server returned HTTP {(int)res.StatusCode}.");
                                return;
                            }

                            using (var stream = await res.Content.ReadAsStreamAsync())
                            using (var reader = new StreamReader(stream))
                            {
                                while (!reader.EndOfStream)
                                {
                                    ct.ThrowIfCancellationRequested();
                                    string line = await reader.ReadLineAsync();
                                    if (string.IsNullOrWhiteSpace(line)) continue;
                                    string trimmed = line.Trim();
                                    if (!trimmed.StartsWith("data:", StringComparison.Ordinal)) continue;
                                    string data = trimmed.Substring(5).Trim();
                                    if (data == "[DONE]") break;

                                    if (!JsonObject.TryParse(data, out JsonObject frame)) continue;
                                    if (!frame.ContainsKey("choices")) continue;
                                    var choices = frame.GetNamedArray("choices");
                                    if (choices.Count == 0) continue;
                                    var c0 = choices.GetObjectAt(0);
                                    if (!c0.ContainsKey("delta")) continue;
                                    var delta = c0.GetNamedObject("delta");
                                    string tok = delta.GetNamedString("content", "");
                                    if (!string.IsNullOrEmpty(tok))
                                    {
                                        PostEvent(requestId, "token", token: tok);
                                    }
                                }
                            }
                        }
                    }

                    PostEvent(requestId, "done");
                }
                catch (OperationCanceledException)
                {
                    PostEvent(requestId, "done");
                }
                catch (Exception ex)
                {
                    PostEvent(requestId, "error", error: ex.Message);
                }
            }, ct);
        }

        public void StreamChat(string requestJson)
        {
            _activeCts?.Cancel();
            _activeCts = new CancellationTokenSource();
            var ct = _activeCts.Token;

            _ = Task.Run(async () =>
            {
                string requestId = "req";
                try
                {
                    if (JsonObject.TryParse(requestJson, out JsonObject parsed))
                    {
                        requestId = parsed.GetNamedString("requestId", "req");
                    }

                    await _inference.StreamCompletionAsync(
                        requestJson,
                        token => PostEvent(requestId, "token", token: token),
                        ct);

                    PostEvent(requestId, "done");
                }
                catch (OperationCanceledException)
                {
                    PostEvent(requestId, "done");
                }
                catch (Exception ex)
                {
                    PostEvent(requestId, "error", error: ex.Message);
                }
            }, ct);
        }

        public void CancelChat()
        {
            _activeCts?.Cancel();
        }

        public void CancelDownload()
        {
            _downloadCts?.Cancel();
        }

        public string DeleteLocalModel(string fileName)
        {
            string safeName = Path.GetFileName((fileName ?? string.Empty).Trim());
            if (string.IsNullOrEmpty(safeName))
            {
                return "{\"ok\":false,\"error\":\"Invalid file name.\"}";
            }

            string modelsDir = Path.Combine(ApplicationData.Current.LocalFolder.Path, "models");
            string target = Path.Combine(modelsDir, safeName);
            try
            {
                if (File.Exists(target))
                {
                    KeelLlamaInterop.Unload();
                    File.Delete(target);
                }
                return "{\"ok\":true}";
            }
            catch (Exception ex)
            {
                return new JsonObject
                {
                    ["ok"] = JsonValue.CreateBooleanValue(false),
                    ["error"] = JsonValue.CreateStringValue(ex.Message),
                }.Stringify();
            }
        }

        public void DownloadLocalModel(string requestJson)
        {
            _downloadCts?.Cancel();
            _downloadCts = new CancellationTokenSource();
            var ct = _downloadCts.Token;

            _ = Task.Run(async () =>
            {
                string requestId = "dl";
                string partPath = null;
                try
                {
                    JsonObject reqObj = JsonObject.Parse(requestJson);
                    requestId = reqObj.GetNamedString("requestId", "dl");
                    string url = reqObj.GetNamedString("url", "").Trim();
                    string rawName = reqObj.GetNamedString("fileName", "").Trim();
                    string safeName = Path.GetFileName(rawName);

                    if (!Uri.TryCreate(url, UriKind.Absolute, out Uri parsed) ||
                        (parsed.Scheme != Uri.UriSchemeHttps && parsed.Scheme != Uri.UriSchemeHttp))
                    {
                        PostEvent(requestId, "error", error: "Enter a valid http:// or https:// model URL.");
                        return;
                    }
                    if (string.IsNullOrEmpty(safeName) || !safeName.EndsWith(".gguf", StringComparison.OrdinalIgnoreCase))
                    {
                        safeName = "model.gguf";
                    }

                    string modelsDir = Path.Combine(ApplicationData.Current.LocalFolder.Path, "models");
                    Directory.CreateDirectory(modelsDir);
                    string finalPath = Path.Combine(modelsDir, safeName);
                    partPath = finalPath + ".part";

                    using (var res = await _downloadHttp.GetAsync(parsed, HttpCompletionOption.ResponseHeadersRead, ct))
                    {
                        if (!res.IsSuccessStatusCode)
                        {
                            PostEvent(requestId, "error", error: $"Download returned HTTP {(int)res.StatusCode}.");
                            return;
                        }

                        long totalBytes = res.Content.Headers.ContentLength ?? -1;
                        if (totalBytes > (long)LocalInferenceService.SingleFileCeilingBytes)
                        {
                            PostEvent(requestId, "error", error: "Model exceeds the 2 GiB Xbox AppContainer single-file limit.");
                            return;
                        }

                        using (var src = await res.Content.ReadAsStreamAsync())
                        using (var dst = new FileStream(partPath, FileMode.Create, FileAccess.Write, FileShare.None, 65536, true))
                        {
                            byte[] buffer = new byte[65536];
                            long loaded = 0;
                            long lastReportAt = 0;
                            int read;
                            while ((read = await src.ReadAsync(buffer, 0, buffer.Length, ct)) > 0)
                            {
                                loaded += read;
                                if (loaded > (long)LocalInferenceService.SingleFileCeilingBytes)
                                {
                                    throw new InvalidOperationException("Download exceeded the 2 GiB Xbox AppContainer file limit.");
                                }
                                await dst.WriteAsync(buffer, 0, read, ct);

                                if (loaded - lastReportAt >= 512 * 1024 || (totalBytes > 0 && loaded >= totalBytes))
                                {
                                    lastReportAt = loaded;
                                    PostProgress(requestId, loaded, totalBytes);
                                }
                            }
                        }
                    }

                    if (File.Exists(finalPath))
                    {
                        File.Delete(finalPath);
                    }
                    File.Move(partPath, finalPath);
                    partPath = null;
                    PostEvent(requestId, "done");
                }
                catch (OperationCanceledException)
                {
                    PostEvent(requestId, "error", error: "Download cancelled.");
                }
                catch (Exception ex)
                {
                    PostEvent(requestId, "error", error: ex.Message);
                }
                finally
                {
                    if (partPath != null && File.Exists(partPath))
                    {
                        try { File.Delete(partPath); } catch { }
                    }
                }
            }, ct);
        }

        private void PostProgress(string requestId, long loaded, long total)
        {
            var obj = new JsonObject
            {
                ["requestId"] = JsonValue.CreateStringValue(requestId ?? "dl"),
                ["type"] = JsonValue.CreateStringValue("progress"),
                ["loaded"] = JsonValue.CreateNumberValue(loaded),
                ["total"] = JsonValue.CreateNumberValue(total),
            };
            PostToWeb(obj.Stringify());
        }

        private void PostEvent(string requestId, string type, string token = null, string error = null)
        {
            var obj = new JsonObject
            {
                ["requestId"] = JsonValue.CreateStringValue(requestId ?? "req"),
                ["type"] = JsonValue.CreateStringValue(type),
            };
            if (token != null) obj["token"] = JsonValue.CreateStringValue(token);
            if (error != null) obj["error"] = JsonValue.CreateStringValue(error);
            PostToWeb(obj.Stringify());
        }

        private void PostToWeb(string json)
        {
            var web = _coreWebView;
            if (web == null) return;
            _ = Windows.ApplicationModel.Core.CoreApplication.MainView.CoreWindow.Dispatcher.RunAsync(
                Windows.UI.Core.CoreDispatcherPriority.Normal,
                () => web.PostWebMessageAsJson(json));
        }

        private static void ApplyPairingHeader(HttpRequestMessage req, string pairingCode)
        {
            if (!string.IsNullOrWhiteSpace(pairingCode))
            {
                string trimmed = pairingCode.Trim();
                req.Headers.TryAddWithoutValidation("X-Keel-Pairing-Code", trimmed);
                req.Headers.TryAddWithoutValidation("Authorization", $"Bearer {trimmed}");
            }
        }

        private static bool TryValidatePrivateLanUri(string raw, out Uri validUri)
        {
            validUri = null;
            if (string.IsNullOrWhiteSpace(raw) || !Uri.TryCreate(raw.Trim(), UriKind.Absolute, out Uri parsed))
            {
                return false;
            }
            if (parsed.Scheme != Uri.UriSchemeHttp && parsed.Scheme != Uri.UriSchemeHttps)
            {
                return false;
            }
            string host = parsed.DnsSafeHost.ToLowerInvariant();
            if (host == "169.254.169.254" || host.StartsWith("169.254.", StringComparison.Ordinal))
            {
                return false;
            }
            bool isLoopback = host == "localhost" || host == "127.0.0.1" || host == "::1" || host.EndsWith(".localhost", StringComparison.Ordinal);
            bool isMdns = host.EndsWith(".local", StringComparison.Ordinal);
            bool isRfc1918 = Regex.IsMatch(host, @"^(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})$");
            if (!isLoopback && !isMdns && !isRfc1918)
            {
                return false;
            }
            validUri = parsed;
            return true;
        }
    }
}
