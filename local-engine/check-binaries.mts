import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

interface BinaryCheck {
  name: string;
  available: boolean;
  version: string | null;
  message: string;
}

async function checkBinary(name: string): Promise<BinaryCheck> {
  try {
    const { stdout } = await execFileAsync(name, ["-version"], {
      timeout: 5000,
      shell: process.platform === "win32",
    });
    const versionLine = stdout.split("\n").find((line) => line.trim().length > 0) ?? null;

    return {
      name,
      available: true,
      version: versionLine,
      message: `${name} is available on PATH.`,
    };
  } catch {
    return {
      name,
      available: false,
      version: null,
      message: `${name} was not found on PATH. Install FFmpeg and add its bin directory to PATH.`,
    };
  }
}

const ffmpeg = await checkBinary("ffmpeg");
const ffprobe = await checkBinary("ffprobe");

console.log("MashLab local engine binary check");
console.log("---------------------------------");

for (const result of [ffmpeg, ffprobe]) {
  console.log(`${result.name}: ${result.available ? "OK" : "MISSING"}`);
  console.log(`  ${result.message}`);
  if (result.version) {
    console.log(`  ${result.version}`);
  }
}

if (!ffmpeg.available || !ffprobe.available) {
  console.log("");
  console.log("Browser MVP upload and planning still work without FFmpeg.");
  console.log("FFmpeg and ffprobe are required for stem preview, combined preview, export, and loudness readout.");
  console.log("Setup: npm run setup:windows:check");
  console.log("Guide: npm run setup:windows:guide");
  console.log("Docs:  docs/WINDOWS_RUNTIME_SETUP.md");
  process.exitCode = 1;
}
