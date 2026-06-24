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
    const { stdout } = await execFileAsync(name, ["-version"], { timeout: 5000 });
    const versionLine = stdout.split("\n").find((line) => line.trim().length > 0) ?? null;

    return {
      name,
      available: true,
      version: versionLine,
      message: `${name} is available.`,
    };
  } catch {
    return {
      name,
      available: false,
      version: null,
      message: `${name} was not found on PATH. Install FFmpeg and ensure ${name} is available for the future local engine service.`,
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
  console.log("The browser MVP still works without FFmpeg.");
  console.log("FFmpeg/ffprobe will be required for the future local processing service.");
  process.exitCode = 1;
}
