using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Windows.Data.Json;
using Windows.Storage;
#if KEEL_ORT_GENAI
using Microsoft.ML.OnnxRuntimeGenAI;
#endif

namespace KeelConsole.Xbox.Services
{
    public sealed class LocalModelEntry
    {
        public string FileName { get; set; }
        public ulong SizeBytes { get; set; }
        public string Backend { get; set; }
    }

    /// <summary>
    /// Native AppContainer model enumeration + ONNX Runtime GenAI (DirectML) inference service.
    /// Models live under <c>ApplicationData.Current.LocalFolder\models</c> and respect the
    /// Xbox ~2 GiB per-file AppContainer ceiling.
    /// </summary>
    public sealed class LocalInferenceService : IDisposable
    {
        public const ulong SingleFileCeilingBytes = 2048UL * 1024UL * 1024UL;

        private readonly object _modelLock = new object();

#if KEEL_ORT_GENAI
        private string _loadedModelDir;
        private Model _model;
        private Tokenizer _tokenizer;

        public bool IsEngineAttached => true;
        public string EngineName => "ONNX Runtime GenAI (DirectML)";
#else
        public bool IsEngineAttached => false;
        public string EngineName => "UWP Shell Only (build with KeelEnableOrtGenAI=true)";
#endif

        public IReadOnlyList<LocalModelEntry> EnumerateLocalStateModels()
        {
            var results = new List<LocalModelEntry>();
            string modelsDir = Path.Combine(ApplicationData.Current.LocalFolder.Path, "models");
            if (!Directory.Exists(modelsDir)) return results;

            // 1. Directory-based ONNX Runtime GenAI packages (genai_config.json + .onnx + .onnx.data)
            foreach (string dir in Directory.EnumerateDirectories(modelsDir))
            {
                string configPath = Path.Combine(dir, "genai_config.json");
                if (!File.Exists(configPath)) continue;

                ulong totalBytes = 0;
                bool exceedsSingleFileLimit = false;
                foreach (string file in Directory.EnumerateFiles(dir, "*", SearchOption.AllDirectories))
                {
                    var fi = new FileInfo(file);
                    if (fi.Length <= 0) continue;
                    ulong len = (ulong)fi.Length;
                    if (len > SingleFileCeilingBytes)
                    {
                        exceedsSingleFileLimit = true;
                        break;
                    }
                    totalBytes += len;
                }

                if (exceedsSingleFileLimit || totalBytes == 0) continue;

                string dirName = Path.GetFileName(dir);
                string cfgText = File.ReadAllText(configPath);
                string backend = cfgText.IndexOf("dml", StringComparison.OrdinalIgnoreCase) >= 0
                    ? "directml-fp16"
                    : "uwp-ort";

                results.Add(new LocalModelEntry
                {
                    FileName = dirName,
                    SizeBytes = totalBytes,
                    Backend = backend,
                });
            }

            // 2. Single-file GGUF / ONNX artifacts
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

#if KEEL_ORT_GENAI
            return Task.Run(() =>
            {
                JsonObject req = JsonObject.Parse(requestJson);
                string modelRef = req.GetNamedString("modelFile", string.Empty).Trim();
                double temperature = req.ContainsKey("temperature")
                    ? req.GetNamedNumber("temperature", 0.6)
                    : 0.6;
                int maxNewTokens = req.ContainsKey("maxTokens")
                    ? (int)req.GetNamedNumber("maxTokens", 384)
                    : 384;
                if (maxNewTokens < 16) maxNewTokens = 16;
                if (maxNewTokens > 2048) maxNewTokens = 2048;

                string modelDir = ResolveOrtModelDirectory(modelRef);
                string prompt = FormatChatPrompt(req.ContainsKey("messages")
                    ? req.GetNamedArray("messages")
                    : new JsonArray());

                lock (_modelLock)
                {
                    EnsureModelLoaded(modelDir);

                    using (var sequences = _tokenizer.Encode(prompt))
                    using (var stream = _tokenizer.CreateStream())
                    using (var genParams = new GeneratorParams(_model))
                    {
                        int inputLen = (int)sequences[0].Length;
                        genParams.SetSearchOption("max_length", inputLen + maxNewTokens);
                        genParams.SetSearchOption("temperature", temperature);
                        genParams.SetSearchOption("do_sample", temperature > 0.05);
                        genParams.SetInputSequences(sequences);

                        using (var generator = new Generator(_model, genParams))
                        {
                            while (!generator.IsDone())
                            {
                                ct.ThrowIfCancellationRequested();
                                generator.ComputeLogits();
                                generator.GenerateNextToken();

                                var seq = generator.GetSequence(0);
                                int nextToken = seq[seq.Length - 1];
                                string delta = stream.Decode(nextToken);
                                if (!string.IsNullOrEmpty(delta))
                                {
                                    onToken(delta);
                                }
                            }
                        }
                    }
                }
            }, ct);
#else
            throw new InvalidOperationException(
                "Microsoft.ML.OnnxRuntimeGenAI.DirectML is not linked in this build (KeelEnableOrtGenAI=false). Build with KeelEnableOrtGenAI=true in Visual Studio on Windows, or use On-Device WASM / Local Server mode.");
#endif
        }

#if KEEL_ORT_GENAI
        private string ResolveOrtModelDirectory(string modelRef)
        {
            string modelsDir = Path.Combine(ApplicationData.Current.LocalFolder.Path, "models");
            if (!Directory.Exists(modelsDir))
            {
                throw new DirectoryNotFoundException(
                    $"No LocalState\\models directory found at {modelsDir}. Copy an ONNX Runtime GenAI model folder (with genai_config.json) there first.");
            }

            if (!string.IsNullOrEmpty(modelRef))
            {
                string safeName = Path.GetFileName(modelRef.TrimEnd('/', '\\'));
                string exactDir = Path.Combine(modelsDir, safeName);
                if (Directory.Exists(exactDir) && File.Exists(Path.Combine(exactDir, "genai_config.json")))
                {
                    return exactDir;
                }

                string stem = Path.GetFileNameWithoutExtension(safeName);
                string stemDir = Path.Combine(modelsDir, stem);
                if (Directory.Exists(stemDir) && File.Exists(Path.Combine(stemDir, "genai_config.json")))
                {
                    return stemDir;
                }
            }

            foreach (string dir in Directory.EnumerateDirectories(modelsDir))
            {
                if (File.Exists(Path.Combine(dir, "genai_config.json")))
                {
                    return dir;
                }
            }

            throw new FileNotFoundException(
                $"No ONNX Runtime GenAI model directory (containing genai_config.json) found under {modelsDir}.");
        }

        private void EnsureModelLoaded(string modelDir)
        {
            if (string.Equals(_loadedModelDir, modelDir, StringComparison.OrdinalIgnoreCase)
                && _model != null
                && _tokenizer != null)
            {
                return;
            }

            _tokenizer?.Dispose();
            _tokenizer = null;
            _model?.Dispose();
            _model = null;
            _loadedModelDir = null;

            using (var config = new Config(modelDir))
            {
                // Prefer DirectML prefill/execution when available on Xbox/Windows.
                config.ClearProviders();
                config.AppendProvider("dml");
                _model = new Model(config);
            }
            _tokenizer = new Tokenizer(_model);
            _loadedModelDir = modelDir;
        }

        private static string FormatChatPrompt(JsonArray messages)
        {
            var sb = new StringBuilder();
            for (uint i = 0; i < messages.Count; i++)
            {
                var obj = messages.GetObjectAt(i);
                string role = obj.GetNamedString("role", "user");
                string content = obj.GetNamedString("content", string.Empty);
                sb.Append("<|im_start|>").Append(role).Append('\n')
                  .Append(content).Append("<|im_end|>\n");
            }
            sb.Append("<|im_start|>assistant\n");
            return sb.ToString();
        }
#endif

        public void Dispose()
        {
            lock (_modelLock)
            {
#if KEEL_ORT_GENAI
                _tokenizer?.Dispose();
                _tokenizer = null;
                _model?.Dispose();
                _model = null;
                _loadedModelDir = null;
#endif
            }
        }
    }
}
