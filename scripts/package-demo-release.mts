#!/usr/bin/env node
/** Build optional small demo release ZIP — docs, QA logs, manifest; no binaries or weights. */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { buildDemoPackageFileList } from "../src/domain/releasePackaging.ts";
import { requiredRightsNotice } from "../src/lib/legal.ts";

const root = process.cwd();
const outDir = join(root, "qa/full-local-workflow/phase-35");
const zipPath = join(outDir, "mashlab-local-mvp-demo-package.zip");

function collectPaths(): string[] {
  const explicit = buildDemoPackageFileList();
  const logDirs = [
    "qa/full-local-workflow/phase-32/logs",
    "qa/full-local-workflow/phase-34/logs",
    "qa/full-local-workflow/phase-35/logs",
  ];
  const screenshotDir = "qa/full-local-workflow/phase-34/screenshots";
  const paths = new Set<string>(explicit);

  for (const dir of logDirs) {
    const abs = join(root, dir);
    if (!existsSync(abs)) {
      continue;
    }
    for (const name of readdirSync(abs)) {
      if (/\.(json|txt|csv|md)$/i.test(name)) {
        paths.add(`${dir}/${name}`.replace(/\\/g, "/"));
      }
    }
  }

  if (existsSync(join(root, screenshotDir))) {
    for (const name of readdirSync(join(root, screenshotDir))) {
      if (/\.(png|md)$/i.test(name)) {
        paths.add(`${screenshotDir}/${name}`);
      }
    }
  }

  paths.add("qa/full-local-workflow/phase-35/PACKAGE_RECIPE.md");
  return [...paths].filter((p) => existsSync(join(root, p)));
}

function main() {
  mkdirSync(outDir, { recursive: true });
  const staging = mkdtempSync(join(tmpdir(), "mashlab-demo-pack-"));
  const rightsPath = join(staging, "RIGHTS_NOTICE.txt");
  const startPath = join(staging, "START_INSTRUCTIONS.txt");

  writeFileSync(
    rightsPath,
    `${requiredRightsNotice}\n\nNo copyrighted audio, model weights, or tool binaries are included in this demo package.\n`
  );
  writeFileSync(
    startPath,
    [
      "Generate synthetic test audio (non-copyright):",
      "  powershell -ExecutionPolicy Bypass -File qa/full-local-workflow/phase-32/run-phase32-api-qa.ps1",
      "",
      "Start local demo:",
      "  npm run start:local:windows",
      "",
      requiredRightsNotice,
    ].join("\n")
  );

  const files = collectPaths();
  let totalBytes = statSync(rightsPath).size + statSync(startPath).size;
  for (const file of files) {
    const src = join(root, file);
    const dest = join(staging, file);
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(src, dest);
    totalBytes += statSync(src).size;
  }

  if (totalBytes > 5 * 1024 * 1024) {
    console.error(`Demo package would exceed 5MB (${totalBytes} bytes). Aborting zip — see PACKAGE_RECIPE.md`);
    rmSync(staging, { recursive: true, force: true });
    process.exit(1);
  }

  if (existsSync(zipPath)) {
    rmSync(zipPath, { force: true });
  }

  if (process.platform === "win32") {
    execFileSync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        `Compress-Archive -Path '${staging.replace(/'/g, "''")}\\*' -DestinationPath '${zipPath.replace(/'/g, "''")}' -Force`,
      ],
      { stdio: "inherit" }
    );
  } else {
    execFileSync("zip", ["-r", zipPath, "."], { cwd: staging, stdio: "inherit" });
  }

  rmSync(staging, { recursive: true, force: true });
  console.log(`Created ${zipPath} (${statSync(zipPath).size} bytes, ${files.length + 2} entries)`);
}

main();
