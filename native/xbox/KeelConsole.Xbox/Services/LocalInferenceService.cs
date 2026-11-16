using System;
using System.Collections.Generic;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using Windows.Storage;

namespace KeelConsole.Xbox.Services
{
    public sealed class LocalModelEntry
    {
        public string FileName { get; set; }
        public ulong SizeBytes { get; set; }
        public string Backend { get; set; }
    }

    /// <summary>
    /// Native AppContainer model enumeration + inference adapter.
    /// Wire <c>Microsoft.ML.OnnxRuntimeGenAI</c> (with DirectML EP) or
    /// <c>llama.cpp</c> WinRT/PInvoke into <see cref="StreamCompletionAsync"/>
    /// when building on Windows with Visual Studio.
    /// </summary>
    public sealed class LocalInferenceService
    {
        private const ulong SingleFileCeilingBytes = 2048UL * 1024UL * 1024UL;

        public bool IsEngineAttached => false;
        public string EngineName => "ONNX Runtime GenAI / llama.cpp (pending native NuGet link)";

        public IReadOnlyList<LocalModelEntry> EnumerateLocalStateModels()
        {
            var results = new List<LocalModelEntry>();
            string modelsDir = Path.Combine(ApplicationData.Current.LocalFolder.Path, "models");
            if (!Directory.Exists(modelsDir)) return results;

            foreach (string path in Directory.EnumerateFiles(modelsDir))
            {
                var info = new FileInfo(path);
                if (info.Length <= 0 || (ulong)info.Length > SingleFileCeilingBytes)
                {
                    continue;
                }

                string ext = info.Extension.ToLowerInvariant();
                if (ext == ".gguf")
                {
                    results.Add(new LocalModelEntry
                    {
                        FileName = info.Name,
                        SizeBytes = (ulong)info.Length,
                        Backend = "llama-cpp",
                    });
                }
                else if (ext == ".onnx")
                {
                    results.Add(new LocalModelEntry
                    {
                        FileName = info.Name,
                        SizeBytes = (ulong)info.Length,
                        Backend = "uwp-ort",
                    });
                }
            }

            return results;
        }

        public Task StreamCompletionAsync(
            string requestJson,
            Action<string> onToken,
            CancellationToken ct)
        {
            ct.ThrowIfCancellationRequested();
            throw new InvalidOperationException(
                "Native ORT GenAI / llama.cpp engine DLL is not yet linked in this UWP build. Use On-Device WASM or Local Server mode, or link Microsoft.ML.OnnxRuntimeGenAI in KeelConsole.Xbox.csproj.");
        }
    }
}
