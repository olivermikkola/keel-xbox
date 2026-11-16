"use client";

import { motion } from "motion/react";

type Props = {
  onBack: () => void;
};

const STEPS = [
  {
    title: "UX slice (now)",
    body: "This web console proves the 10-foot experience: catalogue, focus, and Xbox-class tok/s timing without needing a Dev Mode kit yet.",
  },
  {
    title: "UWP Dev Mode",
    body: "Port the shell to a UWP Xbox app with ONNX Runtime GenAI and/or llama.cpp. Sideload via Partner Center Developer Mode — real weights on Series S|X.",
  },
  {
    title: "Microsoft Store",
    body: "Ship as a non-game Xbox app: WACK-clean binaries, generative AI disclosure (Store policy 11.16), Partner Center submission. Retail path is the product goal; Dev Mode is the hardware proving ground.",
  },
];

export function PathView({ onBack }: Props) {
  return (
    <section className="flex min-h-0 flex-1 flex-col px-6 py-8 sm:px-10 lg:px-14">
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] tracking-[0.3em] text-[color:var(--keel-water)] uppercase">
            Ship path
          </p>
          <h2 className="mt-2 font-[family-name:var(--font-display)] text-4xl tracking-tight text-[color:var(--keel-foam)]">
            Xbox app, Store-bound
          </h2>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="border border-white/15 px-4 py-2 font-mono text-[11px] tracking-[0.2em] text-[color:var(--keel-muted)] uppercase hover:border-white/40 hover:text-[color:var(--keel-foam)]"
        >
          Back
        </button>
      </div>

      <ol className="flex max-w-3xl flex-col gap-4">
        {STEPS.map((step, i) => (
          <motion.li
            key={step.title}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.08 }}
            className="border border-white/10 bg-black/25 px-5 py-5"
          >
            <div className="font-mono text-[11px] tracking-[0.25em] text-[color:var(--keel-water)] uppercase">
              0{i + 1}
            </div>
            <h3 className="mt-2 text-xl text-[color:var(--keel-foam)]">{step.title}</h3>
            <p className="mt-2 text-[color:var(--keel-muted)] leading-relaxed">{step.body}</p>
          </motion.li>
        ))}
      </ol>
    </section>
  );
}
