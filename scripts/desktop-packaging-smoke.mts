#!/usr/bin/env node
/** Packaging smoke — verifies desktop build artifacts and runtime probe. */
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  DESKTOP_BUILD_OUTPUT_DIR,
  DESKTOP_PORTABLE_EXE_NAME,
  DESKTOP_PORTABLE_ZIP,
  DESKTOP_PRODUCT_NAME,
  DESKTOP_UNPACKED_DIR,
} from "../src/domain/desktopPackaging.ts";

const root = process.cwd();
const unpackedDir = join(root, DESKTOP_UNPACKED_DIR);
const portableExe = join(root, DESKTOP_BUILD_OUTPUT_DIR, DESKTOP_PORTABLE_EXE_NAME);
const zipPath = join(root, DESKTOP_PORTABLE_ZIP);
const appExe = join(unpackedDir, `${DESKTOP_PRODUCT_NAME}.exe`);
const mashlabAppDist = join(unpackedDir, "mashlab-app", "dist", "index.html");
const serviceMain = join(unpackedDir, "mashlab-app", "local-engine", "service", "main.py");

const required = [
  { label: "win-unpacked folder", path: unpackedDir, type: "dir" as const },
  { label: "MashLab AI.exe", path: appExe, type: "file" as const },
  { label: "built UI index.html", path: mashlabAppDist, type: "file" as const },
  { label: "sidecar main.py", path: serviceMain, type: "file" as const },
  { label: "portable zip", path: zipPath, type: "file" as const },
];

let failed = false;
console.log("MashLab desktop packaging smoke");

for (const item of required) {
  const ok =
    item.type === "dir"
      ? existsSync(item.path)
      : existsSync(item.path);
  console.log(`${ok ? "PASS" : "FAIL"} ${item.label}: ${item.path}`);
  if (!ok) {
    failed = true;
  }
}

if (existsSync(portableExe)) {
  console.log(`PASS optional portable exe: ${portableExe}`);
} else {
  console.log(`WARN optional portable exe missing: ${portableExe}`);
}

if (failed) {
  console.error("\nDesktop packaging smoke failed — run npm run build:windows:desktop first.");
  process.exit(1);
}

console.log("\nDesktop packaging smoke passed.");
