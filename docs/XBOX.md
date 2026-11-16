# Keel on Xbox — packaging notes

Keel Console is intended as a **non-game Microsoft Store app** for Xbox Series S|X, with on-device inference for compact models.

## Why an app, not a game

- Living-room AI chat is an app experience (catalogue, settings, focus UI), not a title that needs ID@Xbox networking.
- UWP / WinUI-style Xbox apps can be submitted through Partner Center without treating Keel as a Creators Program game — confirm the current Xbox app category checklist before submission.

## Near-term hardware path (Dev Mode)

Today, the most proven way to run local LLMs on a retail Xbox is **Developer Mode UWP** with:

- **ONNX Runtime GenAI** (+ DirectML for prefill / vision workloads)
- **llama.cpp / GGUF** for some sub-1B models
- Models stored under `LocalState`, respecting AppContainer limits

Measured Series S class ballparks (community benchmarks, same class of hardware Keel targets):

| Model class        | Decode ballpark | Notes                          |
| ------------------ | --------------- | ------------------------------ |
| ~350M INT4 / Q4    | ~60–95 tok/s    | Best couch UX                  |
| ~0.8B Q4           | ~30–40 tok/s    | Still conversational           |
| ~3–4B ONNX INT4    | often blocked   | ~2 GB per-file / OOM history   |

Constraints that shape Keel’s catalogue:

- AppContainer: no arbitrary paths, limited mmap / `dlopen`
- Practical **~2 GB single-file ONNX** ceiling
- Unified memory + per-process GPU budget
- DirectML helps **prefill**; Zen 2 CPU often wins **decode** at small sizes

## Microsoft Store goal

Target: retail Xbox + Windows Store listing for Keel Console.

Checklist to track:

1. **WACK-clean** native binaries (release build, supported UWP API surface).
2. **Generative AI disclosure** — Store policy **11.16** (metadata + Partner Center flag + in-app report path).
3. Keep Keel clearly an **app** (not a game shell) to avoid ID@Xbox requirements unless we later add Xbox network features.
4. Prefer Store-distributable inference stacks (WinML / certified ORT packaging) once Dev Mode proves UX + model set.

## Repo layout for the native port (next)

```
native/xbox/   # future UWP / C++|C# project (Visual Studio on Windows)
src/           # this 10-foot UI prototype (iterate UX here first)
```

Dev Mode sideload remains the proving ground; Store submission is the product north star.
