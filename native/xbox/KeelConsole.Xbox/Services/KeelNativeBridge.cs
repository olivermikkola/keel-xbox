using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Web.WebView2.Core;
using Windows.Foundation.Metadata;
using Windows.Storage;
using Windows.System;
using Windows.System.Profile;

namespace KeelConsole.Xbox.Services
{
    /// <summary>
    /// WinRT host object exposed to the WebView2 UI as
    /// <c>window.chrome.webview.hostObjects.keelBridge</c>.
    /// </summary>
    [AllowForWeb]
    [ComVisible(true)]
    public sealed class KeelNativeBridge
    {
        private readonly LocalInferenceService _inference = new LocalInferenceService();
        private CoreWebView2 _coreWebView;
        private CancellationTokenSource _activeCts;

        internal void AttachWebView(CoreWebView2 core)
        {
            _coreWebView = core;
        }

        public string GetSystemInfoJson()
        {
            ulong memLimitMb = MemoryManager.AppMemoryUsageLimit / (1024UL * 1024UL);
            string localPath = ApplicationData.Current.LocalFolder.Path.Replace("\\", "\\\\");
            string family = AnalyticsInfo.VersionInfo.DeviceFamily;

            return $"{{\"deviceFamily\":\"{family}\",\"localStatePath\":\"{localPath}\",\"availableMemoryMb\":{memLimitMb},\"singleFileLimitMb\":2048,\"runtimeAvailable\":{_inference.IsEngineAttached.ToString().ToLowerInvariant()},\"engineName\":\"{_inference.EngineName}\"}}";
        }

        public string ListLocalModelsJson()
        {
            var models = _inference.EnumerateLocalStateModels();
            var sb = new StringBuilder("[");
            for (int i = 0; i < models.Count; i++)
            {
                if (i > 0) sb.Append(",");
                var m = models[i];
                sb.Append($"{{\"fileName\":\"{Escape(m.FileName)}\",\"sizeBytes\":{m.SizeBytes},\"backend\":\"{m.Backend}\"}}");
            }
            sb.Append("]");
            return sb.ToString();
        }

        public void StreamChat(string requestJson)
        {
            _activeCts?.Cancel();
            _activeCts = new CancellationTokenSource();
            var ct = _activeCts.Token;

            _ = Task.Run(async () =>
            {
                string requestId = ExtractJsonField(requestJson, "requestId") ?? "req";
                try
                {
                    await _inference.StreamCompletionAsync(
                        requestJson,
                        token => PostToWeb($"{{\"requestId\":\"{Escape(requestId)}\",\"type\":\"token\",\"token\":\"{Escape(token)}\"}}"),
                        ct);

                    PostToWeb($"{{\"requestId\":\"{Escape(requestId)}\",\"type\":\"done\"}}");
                }
                catch (OperationCanceledException)
                {
                    PostToWeb($"{{\"requestId\":\"{Escape(requestId)}\",\"type\":\"done\"}}");
                }
                catch (Exception ex)
                {
                    PostToWeb($"{{\"requestId\":\"{Escape(requestId)}\",\"type\":\"error\",\"error\":\"{Escape(ex.Message)}\"}}");
                }
            }, ct);
        }

        public void CancelChat()
        {
            _activeCts?.Cancel();
        }

        private void PostToWeb(string json)
        {
            var web = _coreWebView;
            if (web == null) return;
            _ = Windows.ApplicationModel.Core.CoreApplication.MainView.CoreWindow.Dispatcher.RunAsync(
                Windows.UI.Core.CoreDispatcherPriority.Normal,
                () => web.PostWebMessageAsJson(json));
        }

        private static string Escape(string s)
        {
            return (s ?? string.Empty)
                .Replace("\\", "\\\\")
                .Replace("\"", "\\\"")
                .Replace("\n", "\\n")
                .Replace("\r", "\\r");
        }

        private static string ExtractJsonField(string json, string key)
        {
            string needle = $"\"{key}\":\"";
            int idx = json?.IndexOf(needle, StringComparison.Ordinal) ?? -1;
            if (idx < 0) return null;
            int start = idx + needle.Length;
            int end = json.IndexOf('"', start);
            return end > start ? json.Substring(start, end - start) : null;
        }
    }
}
