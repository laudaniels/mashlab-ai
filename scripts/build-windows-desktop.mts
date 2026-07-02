#!/usr/bin/env node
/** Build MashLab AI Windows portable desktop package (Electron). */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  DESKTOP_BUILD_OUTPUT_DIR,
  DESKTOP_PORTABLE_EXE_NAME,
  DESKTOP_PORTABLE_ZIP,
  DESKTOP_PRODUCT_NAME,
} from "../src/domain/desktopPackaging.ts";

const root = process.cwd();
const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
const npxCmd = process.platform === "win32" ? "npx.cmd" : "npx";

function run(command: string, args: string[], label: string): void {
  console.log(`\n==> ${label}`);
  execFileSync(command, args, { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
}

function zipPortableFolder(sourceDir: string, zipPath: string): void {
  const parent = join(sourceDir, "..");
  const folderName = sourceDir.split(/[/\\]/).pop() ?? "win-unpacked";
  if (process.platform === "win32") {
    if (existsSync(zipPath)) {
      rmSync(zipPath, { force: true });
    }
    execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        `Compress-Archive -Path '${sourceDir.replace(/'/g, "''")}' -DestinationPath '${zipPath.replace(/'/g, "''")}' -Force`,
      ],
      { cwd: parent, stdio: "inherit" }
    );
    return;
  }
  execFileSync("zip", ["-r", zipPath, folderName], { cwd: parent, stdio: "inherit" });
}

function resetOutputDir(outputDir: string): void {
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
    return;
  }
  try {
    rmSync(outputDir, { recursive: true, force: true });
  } catch {
    const backup = `${outputDir}.bak-${Date.now()}`;
    renameSync(outputDir, backup);
  }
  mkdirSync(outputDir, { recursive: true });
}

function resolveOutputDir(rootDir: string): string {
  const preferred = join(rootDir, DESKTOP_BUILD_OUTPUT_DIR);
  try {
    resetOutputDir(preferred);
    return preferred;
  } catch {
    const alternate = join(rootDir, `${DESKTOP_BUILD_OUTPUT_DIR}-fresh`);
    resetOutputDir(alternate);
    console.log(`Using alternate desktop output dir: ${alternate}`);
    return alternate;
  }
}

function main(): void {
  console.log("MashLab AI — Windows desktop packaging");
  console.log("Approach: Electron portable folder + optional single-file portable exe");

  run(npmCmd, ["run", "build"], "Vite production build");
  run(npmCmd, ["run", "desktop:check"], "Desktop runtime preflight");

  const outputDir = resolveOutputDir(root);
  const unpackedDir = join(outputDir, "win-unpacked");
  const portableExe = join(outputDir, DESKTOP_PORTABLE_EXE_NAME);
  const zipPath = join(outputDir, DESKTOP_PORTABLE_ZIP.split("/").pop() ?? "MashLabAI-Windows-Portable.zip");

  run(
    npxCmd,
    [
      "electron-builder",
      "--win",
      "dir",
      "portable",
      "-c.electronVersion=33.2.1",
      `--config.directories.output=${outputDir.replace(/\\/g, "/")}`,
    ],
    "electron-builder (win-unpacked + portable exe)"
  );

  if (!existsSync(unpackedDir)) {
    throw new Error(`Expected unpacked build at ${unpackedDir}`);
  }

  const launcherReadme = join(unpackedDir, "README-FIRST.txt");
  const guideDest = join(unpackedDir, "docs-WINDOWS_USER_RUN_GUIDE.md");
  cpSync(join(root, "docs/WINDOWS_USER_RUN_GUIDE.md"), guideDest);
  const readmeLines = [
    `${DESKTOP_PRODUCT_NAME} — Windows portable build`,
    "",
    "Double-click MashLab AI.exe in this folder.",
    "First launch may prompt for sidecar venv, FFmpeg, and Rubber Band setup.",
    "See docs-WINDOWS_USER_RUN_GUIDE.md for full instructions.",
    "",
    "Local-only processing. No cloud upload or public sharing.",
  ];
  writeFileSync(launcherReadme, `${readmeLines.join("\n")}\n`, "utf8");

  zipPortableFolder(unpackedDir, zipPath);

  console.log("\nBuild complete.");
  console.log(`Portable folder: ${unpackedDir}`);
  if (existsSync(portableExe)) {
    console.log(`Portable exe:    ${portableExe} (${Math.round(statSync(portableExe).size / 1024 / 1024)} MB)`);
  }
  console.log(`Zip archive:     ${zipPath}`);
  console.log(`Click to launch: ${join(unpackedDir, `${DESKTOP_PRODUCT_NAME}.exe`)}`);
}

main();
