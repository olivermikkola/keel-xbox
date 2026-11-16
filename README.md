# Keel Console

On-device language models for Xbox — a **10-foot console app** aimed at the Microsoft Store.

This repo ships the first slice: a couch-scale UI prototype with a model catalogue sized for Xbox AppContainer limits, gamepad-style focus, and decode timing calibrated to Series S class speeds. Inference in the web preview is simulated; the Xbox path is documented in [`docs/XBOX.md`](docs/XBOX.md).

## Run locally

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:3847](http://127.0.0.1:3847).

Arrow keys / Enter mirror D-pad + A for focus. Esc returns from the console.

## What’s in this slice

- **Home** — brand-first living-room entry
- **Models** — SmolLM2 / LFM / Qwen-class packs with Xbox-oriented size & tok/s notes
- **Console** — streaming chat preview at the selected model’s target decode rate
- **Path** — Dev Mode → Microsoft Store ship outline

## Stack

Next.js, TypeScript, Tailwind, shadcn/ui. Native UWP Xbox packaging comes next (Windows + Visual Studio); see `docs/XBOX.md`.
