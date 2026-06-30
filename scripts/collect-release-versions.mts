#!/usr/bin/env node
/** Collect pinned dependency versions for Windows MVP release manifest. */
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { findExistingSidecarVenvPython } from "../src/domain/pythonRuntime.ts";

const execFileAsync = promisify(execFile);
const root = process.cwd();
const outDir = join(root, "qa/full-local-workflow/phase-35/logs");
const venvPython = findExistingSidecarVenvPython(root, existsSync);

async function run(command: string, args: string[]): Promise<string | null> {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      timeout: 20000,
      shell: process.platform === "win32",
    });
    const line = `${stdout}\n${stderr}`.split("\n").find((v) => v.trim()) ?? null;
    return line?.trim() ?? null;
  } catch {
    return null;
  }
}

async function pythonVersion(moduleName: string): Promise<string | null> {
  if (!venvPython) {
    return null;
  }
  try {
    const { stdout } = await execFileAsync(
      venvPython,
      ["-c", `import ${moduleName}; print(getattr(${moduleName}, '__version__', 'installed'))`],
      { timeout: 20000 }
    );
    return stdout.trim();
  } catch {
    return null;
  }
}

async function whereOnPath(name: string): Promise<string | null> {
  if (process.platform !== "win32") {
    return await run("which", [name]);
  }
  try {
    const { stdout } = await execFileAsync("where.exe", [name], { timeout: 10000 });
    return stdout.split("\n")[0]?.trim() ?? null;
  } catch {
    return null;
  }
}

const snapshot = {
  collectedAt: new Date().toISOString(),
  platform: process.platform,
  node: await run("node", ["-v"]),
  npm: await run("npm", ["-v"]),
  sidecarVenvPython: venvPython,
  pythonVersion: venvPython ? await run(venvPython, ["--version"]) : null,
  ffmpegPath: await whereOnPath("ffmpeg"),
  ffmpegVersion: await run("ffmpeg", ["-version"]),
  ffprobePath: await whereOnPath("ffprobe"),
  ffprobeVersion: await run("ffprobe", ["-version"]),
  rubberbandPath: await whereOnPath("rubberband"),
  rubberbandVersion: await run("rubberband", ["--version"]),
  torch: await pythonVersion("torch"),
  demucs: await pythonVersion("demucs"),
  librosa: await pythonVersion("librosa"),
  numpy: await pythonVersion("numpy"),
  soundfile: await pythonVersion("soundfile"),
};

mkdirSync(outDir, { recursive: true });
const jsonPath = join(outDir, "release-versions.json");
const txtPath = join(outDir, "release-versions.txt");
writeFileSync(jsonPath, JSON.stringify(snapshot, null, 2));

const lines = [
  `Release version snapshot (${snapshot.collectedAt})`,
  `Node: ${snapshot.node ?? "unknown"}`,
  `npm: ${snapshot.npm ?? "unknown"}`,
  `Python (venv): ${snapshot.pythonVersion ?? "missing"}`,
  `Venv path: ${snapshot.sidecarVenvPython ?? "missing"}`,
  `FFmpeg: ${snapshot.ffmpegVersion ?? "missing"}`,
  `FFmpeg path: ${snapshot.ffmpegPath ?? "missing"}`,
  `ffprobe path: ${snapshot.ffprobePath ?? "missing"}`,
  `Rubber Band: ${snapshot.rubberbandVersion ?? "missing"}`,
  `Rubber Band path: ${snapshot.rubberbandPath ?? "missing"}`,
  `PyTorch: ${snapshot.torch ?? "missing"}`,
  `Demucs: ${snapshot.demucs ?? "missing"}`,
  `librosa: ${snapshot.librosa ?? "missing"}`,
  `numpy: ${snapshot.numpy ?? "missing"}`,
  `soundfile: ${snapshot.soundfile ?? "missing"}`,
];
writeFileSync(txtPath, `${lines.join("\n")}\n`);
console.log(lines.join("\n"));
console.log(`\nWrote ${jsonPath}`);
