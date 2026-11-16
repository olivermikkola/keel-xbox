export type ModelBackend = "cpu-int4" | "directml-fp16" | "gguf-cpu";
export type ModelStatus = "ready" | "available" | "coming-soon";

export type KeelModel = {
  id: string;
  name: string;
  family: string;
  params: string;
  sizeLabel: string;
  sizeMb: number;
  backend: ModelBackend;
  /** Measured / estimated decode tokens per second on Xbox Series S class hardware */
  tokensPerSec: number;
  prefillTokPerSec?: number;
  status: ModelStatus;
  blurb: string;
  xboxNote: string;
};

export const KEEL_MODELS: KeelModel[] = [
  {
    id: "smollm2-360m-int4",
    name: "SmolLM2 360M",
    family: "Instruct",
    params: "360M",
    sizeLabel: "417 MB",
    sizeMb: 417,
    backend: "cpu-int4",
    tokensPerSec: 66,
    prefillTokPerSec: 180,
    status: "ready",
    blurb: "Fast default for couch chat. Fits comfortably in AppContainer limits.",
    xboxNote: "Series S decode ~66 tok/s (CPU INT4).",
  },
  {
    id: "lfm25-350m-q4",
    name: "LFM2.5 350M",
    family: "Instruct",
    params: "350M",
    sizeLabel: "219 MB",
    sizeMb: 219,
    backend: "gguf-cpu",
    tokensPerSec: 94,
    status: "ready",
    blurb: "Smallest footprint in the catalogue. Best for snappy A/B replies.",
    xboxNote: "GGUF Q4_K_M path; ~94 tok/s on Series S class CPU.",
  },
  {
    id: "qwen35-08b-q4",
    name: "Qwen3.5 0.8B",
    family: "Instruct",
    params: "0.8B",
    sizeLabel: "508 MB",
    sizeMb: 508,
    backend: "gguf-cpu",
    tokensPerSec: 35,
    status: "ready",
    blurb: "More headroom for reasoning without leaving the living room.",
    xboxNote: "Still under the Xbox per-file ceiling; decode ~35 tok/s.",
  },
  {
    id: "smollm2-360m-dml",
    name: "SmolLM2 360M GPU",
    family: "Prefill boost",
    params: "360M",
    sizeLabel: "~700 MB",
    sizeMb: 700,
    backend: "directml-fp16",
    tokensPerSec: 58,
    prefillTokPerSec: 354,
    status: "available",
    blurb: "Routes long prompts to DirectML for faster first token.",
    xboxNote: "GPU wins prefill; CPU often still wins token-by-token decode.",
  },
  {
    id: "phi35-mini-int4",
    name: "Phi-3.5 Mini",
    family: "Borderline",
    params: "3.8B",
    sizeLabel: "~2.7 GB",
    sizeMb: 2700,
    backend: "cpu-int4",
    tokensPerSec: 12,
    status: "coming-soon",
    blurb: "Hits Xbox single-file ONNX limits today. Tracked for later packaging.",
    xboxNote: "Blocked by ~2 GB ONNX / AppContainer constraints on current UWP path.",
  },
];

export function getModel(id: string): KeelModel | undefined {
  return KEEL_MODELS.find((m) => m.id === id);
}

export function backendLabel(backend: ModelBackend): string {
  switch (backend) {
    case "cpu-int4":
      return "CPU INT4";
    case "directml-fp16":
      return "DirectML FP16";
    case "gguf-cpu":
      return "GGUF CPU";
  }
}
