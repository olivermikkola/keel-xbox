import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const filesRaw = execFileSync("git", ["ls-files", "-z"], {
  cwd: root,
  encoding: "utf8",
});
const files = filesRaw.split("\0").filter(Boolean);

const FORBIDDEN_EXTENSIONS = new Set([
  ".pfx",
  ".snk",
  ".cer",
  ".p12",
  ".key",
  ".pem",
  ".gguf",
  ".onnx",
  ".msix",
  ".appx",
  ".appxbundle",
]);

const SECRET_PATTERNS = [
  { name: "Private key block", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: "GitHub PAT", re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b/ },
  { name: "GitHub fine-grained PAT", re: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/ },
  { name: "OpenAI-style secret", re: /\bsk-(?:proj-|live-)?[A-Za-z0-9]{24,}\b/ },
  { name: "AWS Access Key", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "Google API key", re: /\bAIza[0-9A-Za-z\-_]{35}\b/ },
  { name: "Local home path", re: /\/home\/olivermikkola\b|C:\\Users\\oliver/i },
];

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const errors = [];

for (const rel of files) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) continue;
  const stat = fs.statSync(full);
  if (!stat.isFile()) continue;

  const base = path.basename(rel);
  const ext = path.extname(rel).toLowerCase();

  if (base.startsWith(".env") && base !== ".env.example") {
    errors.push(`${rel}: tracked .env file is forbidden`);
  }
  if (FORBIDDEN_EXTENSIONS.has(ext)) {
    errors.push(`${rel}: forbidden binary/certificate/model extension (${ext})`);
  }
  if (stat.size > MAX_FILE_BYTES) {
    errors.push(`${rel}: exceeds 5 MiB tracked file limit (${stat.size} bytes)`);
  }

  if (ext === ".png" || ext === ".ico" || rel === "package-lock.json") {
    continue;
  }

  const text = fs.readFileSync(full, "utf8");
  for (const { name, re } of SECRET_PATTERNS) {
    if (re.test(text) && rel !== "scripts/check-public-hygiene.mjs") {
      errors.push(`${rel}: matched ${name}`);
    }
  }
}

if (errors.length > 0) {
  console.error("Public hygiene check failed:");
  for (const err of errors) console.error(`  - ${err}`);
  process.exit(1);
}

console.log(`Public hygiene check passed (${files.length} tracked files).`);
