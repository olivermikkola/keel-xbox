import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const apiDir = path.join(root, "src", "app", "api");
const stashDir = path.join(root, ".next-api-stash");
const outDir = path.join(root, "out");
const uiDest = path.join(root, "native", "xbox", "KeelConsole.Xbox", "ui");

if (fs.existsSync(stashDir)) {
  throw new Error("Found leftover .next-api-stash; clean it up before exporting.");
}

fs.rmSync(outDir, { recursive: true, force: true });

let movedApi = false;
try {
  if (fs.existsSync(apiDir)) {
    fs.renameSync(apiDir, stashDir);
    movedApi = true;
  }

  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  execFileSync(npmCmd, ["run", "build"], {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: {
      ...process.env,
      KEEL_STATIC_EXPORT: "1",
    },
  });

  if (!fs.existsSync(path.join(outDir, "index.html"))) {
    throw new Error("Static export did not produce out/index.html.");
  }

  fs.rmSync(uiDest, { recursive: true, force: true });
  fs.cpSync(outDir, uiDest, { recursive: true });
  console.log("Exported static UWP UI to native/xbox/KeelConsole.Xbox/ui");
} finally {
  if (movedApi && fs.existsSync(stashDir)) {
    fs.renameSync(stashDir, apiDir);
  }
  fs.rmSync(outDir, { recursive: true, force: true });
}
