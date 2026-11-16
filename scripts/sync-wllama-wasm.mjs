import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "node_modules", "@wllama", "wllama", "esm", "wasm", "wllama.wasm");
const destDir = path.join(root, "public", "wllama");
const dest = path.join(destDir, "wllama.wasm");

if (!fs.existsSync(src)) {
  console.warn("sync-wllama-wasm: @wllama/wllama wasm not found, skipping copy.");
  process.exit(0);
}

fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, dest);
console.log("Synced wllama.wasm to public/wllama/wllama.wasm");
