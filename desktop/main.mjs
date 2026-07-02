/**
 * MashLab AI — Windows desktop shell (Electron).
 * Starts local static UI, optional Python sidecar, and opens a desktop window.
 */
import { app, BrowserWindow, dialog } from "electron";
import { spawn, execFile } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const moduleDir = dirname(fileURLToPath(import.meta.url));
const devRoot = join(moduleDir, "..");
const isPackaged = app.isPackaged;
const appRoot = isPackaged ? join(dirname(process.execPath), "mashlab-app") : devRoot;
const distDir = join(appRoot, "dist");
const serviceDir = join(appRoot, "local-engine", "service");
const venvPython = join(serviceDir, ".venv", "Scripts", "python.exe");
const statusPath = join(serviceDir, ".work", "sidecar-status.json");

const DESKTOP_UI_HOST = "127.0.0.1";
const DESKTOP_UI_PORT = 47830;
const DESKTOP_UI_URL = `http://${DESKTOP_UI_HOST}:${DESKTOP_UI_PORT}/`;
const SIDECAR_HOST = "127.0.0.1";
const SIDECAR_PORT = 47831;
const SIDECAR_HEALTH_URL = `http://${SIDECAR_HOST}:${SIDECAR_PORT}/health`;

/** @type {import("node:http").Server | null} */
let staticServer = null;
/** @type {import("electron").BrowserWindow | null} */
let mainWindow = null;
let sidecarStartedByShell = false;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".map": "application/json; charset=utf-8",
};

async function commandOk(command, args = ["-version"]) {
  try {
    await execFileAsync(command, args, { timeout: 8000, shell: process.platform === "win32" });
    return true;
  } catch {
    return false;
  }
}

async function findRubberBand() {
  const names =
    process.platform === "win32"
      ? ["rubberband.exe", "rubberband-cli.exe", "rubberband", "rubberband-cli"]
      : ["rubberband", "rubberband-cli"];
  for (const name of names) {
    if (await commandOk(name, ["--version"])) {
      return true;
    }
  }
  return false;
}

async function pythonImportOk(moduleName) {
  if (!existsSync(venvPython)) {
    return false;
  }
  try {
    await execFileAsync(venvPython, ["-c", `import ${moduleName}`], { timeout: 20000 });
    return true;
  } catch {
    return false;
  }
}

async function fetchSidecarHealthy() {
  try {
    const response = await fetch(SIDECAR_HEALTH_URL, { signal: AbortSignal.timeout(4000) });
    if (!response.ok) {
      return false;
    }
    const payload = await response.json();
    return payload?.ok === true && payload?.service === "mashlab-local-engine";
  } catch {
    return false;
  }
}

async function probeRuntime() {
  return {
    venvPythonExists: existsSync(venvPython),
    ffmpegAvailable: await commandOk("ffmpeg"),
    ffprobeAvailable: await commandOk("ffprobe"),
    rubberBandAvailable: await findRubberBand(),
    sidecarHealthy: await fetchSidecarHealthy(),
    torchAvailable: await pythonImportOk("torch"),
    demucsAvailable: await pythonImportOk("demucs"),
  };
}

function evaluateRuntime(probe) {
  const checks = [
    {
      id: "venv",
      label: "Python sidecar venv",
      pass: probe.venvPythonExists,
      blocking: true,
      message: probe.venvPythonExists
        ? "local-engine/service/.venv python found beside the app."
        : "Sidecar venv missing — Quick Mix processing cannot start.",
      setupGuidance: probe.venvPythonExists
        ? null
        : "Open PowerShell in the MashLab app folder and run: cd local-engine\\service && python -m venv .venv && .venv\\Scripts\\pip install -r requirements.txt",
    },
    {
      id: "ffmpeg",
      label: "FFmpeg / ffprobe",
      pass: probe.ffmpegAvailable && probe.ffprobeAvailable,
      blocking: true,
      message:
        probe.ffmpegAvailable && probe.ffprobeAvailable
          ? "ffmpeg and ffprobe detected on PATH."
          : `Missing: ${[!probe.ffmpegAvailable ? "ffmpeg" : null, !probe.ffprobeAvailable ? "ffprobe" : null]
              .filter(Boolean)
              .join(", ")}`,
      setupGuidance:
        probe.ffmpegAvailable && probe.ffprobeAvailable
          ? null
          : "Install FFmpeg for Windows, add its bin folder to PATH, then restart MashLab AI.",
    },
    {
      id: "rubberband",
      label: "Rubber Band CLI",
      pass: probe.rubberBandAvailable,
      blocking: false,
      message: probe.rubberBandAvailable
        ? "Rubber Band CLI detected on PATH."
        : "Rubber Band missing — pitch/time stretch may be limited.",
      setupGuidance: probe.rubberBandAvailable
        ? null
        : "Add Breakfast Quay rubberband.exe + sndfile.dll folder to PATH.",
    },
    {
      id: "demucs",
      label: "Demucs / PyTorch",
      pass: probe.torchAvailable && probe.demucsAvailable,
      blocking: false,
      message:
        probe.torchAvailable && probe.demucsAvailable
          ? "Demucs and PyTorch importable in the sidecar venv."
          : "Demucs or PyTorch missing — stem preview blocked; Quick Mix may still run.",
      setupGuidance:
        probe.torchAvailable && probe.demucsAvailable
          ? null
          : "In local-engine\\service venv: pip install torch CPU wheels and requirements-stems.txt",
    },
  ];

  const blocking = checks.filter((check) => check.blocking && !check.pass);
  return { checks, blocking, canLaunchUi: true };
}

async function showRuntimeGuidance(evaluation) {
  const lines = evaluation.checks.map((check) => {
    const tag = check.pass ? "OK" : check.blocking ? "BLOCKED" : "WARN";
    return `[${tag}] ${check.label} — ${check.message}`;
  });
  const guidance = evaluation.checks
    .filter((check) => !check.pass && check.setupGuidance)
    .map((check) => `${check.label}:\n${check.setupGuidance}`)
    .join("\n\n");

  const detail = `${lines.join("\n")}\n\n${guidance}\n\nAll processing stays on your machine. No cloud upload or public sharing.`;

  if (evaluation.blocking.length > 0) {
    await dialog.showMessageBox({
      type: "warning",
      title: "MashLab AI — setup required",
      message: "Some runtime dependencies are missing.",
      detail,
      buttons: ["Open setup guide", "Continue anyway"],
      defaultId: 0,
      cancelId: 1,
    });
    return;
  }

  const warnings = evaluation.checks.filter((check) => !check.pass && !check.blocking);
  if (warnings.length > 0) {
    await dialog.showMessageBox({
      type: "info",
      title: "MashLab AI — optional setup",
      message: "MashLab can launch, but some lanes are not fully configured.",
      detail,
      buttons: ["Continue"],
    });
  }
}

function writeStatusFile(payload) {
  mkdirSync(dirname(statusPath), { recursive: true });
  writeFileSync(statusPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function clearStatusFile() {
  if (existsSync(statusPath)) {
    unlinkSync(statusPath);
  }
}

async function waitForHealthy(timeoutMs = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await fetchSidecarHealthy()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

async function startSidecar() {
  if (await fetchSidecarHealthy()) {
    return true;
  }
  if (!existsSync(venvPython)) {
    return false;
  }

  const child = spawn(
    venvPython,
    ["-m", "uvicorn", "main:app", "--host", SIDECAR_HOST, "--port", String(SIDECAR_PORT), "--timeout-keep-alive", "3600"],
    {
      cwd: serviceDir,
      detached: true,
      stdio: "ignore",
      env: process.env,
    }
  );
  child.unref();

  if (!child.pid) {
    return false;
  }

  sidecarStartedByShell = true;
  writeStatusFile({
    pid: child.pid,
    bind: `http://${SIDECAR_HOST}:${SIDECAR_PORT}`,
    started_at: new Date().toISOString(),
    python: venvPython,
  });

  return waitForHealthy();
}

async function stopSidecar() {
  if (!sidecarStartedByShell || !existsSync(statusPath)) {
    return;
  }
  try {
    const recorded = JSON.parse(readFileSync(statusPath, "utf8"));
    if (recorded?.pid) {
      await execFileAsync("taskkill", ["/PID", String(recorded.pid), "/T", "/F"], { timeout: 10000 });
    }
  } catch {
    // Best-effort shutdown on app exit.
  } finally {
    clearStatusFile();
    sidecarStartedByShell = false;
  }
}

function resolveStaticPath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0] ?? "/");
  const relative = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const candidate = normalize(join(distDir, relative));
  if (!candidate.startsWith(normalize(distDir))) {
    return join(distDir, "index.html");
  }
  if (existsSync(candidate) && statSync(candidate).isFile()) {
    return candidate;
  }
  return join(distDir, "index.html");
}

async function startStaticServer() {
  if (staticServer) {
    return;
  }

  await new Promise((resolve, reject) => {
    staticServer = createServer((req, res) => {
      const filePath = resolveStaticPath(req.url ?? "/");
      const ext = extname(filePath).toLowerCase();
      res.setHeader("Content-Type", MIME_TYPES[ext] ?? "application/octet-stream");
      createReadStream(filePath)
        .on("error", () => {
          res.statusCode = 500;
          res.end("Failed to read asset");
        })
        .pipe(res);
    });
    staticServer.listen(DESKTOP_UI_PORT, DESKTOP_UI_HOST, () => resolve());
    staticServer.on("error", reject);
  });
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 960,
    minHeight: 720,
    title: "MashLab AI",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.loadURL(DESKTOP_UI_URL);
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

async function bootstrap() {
  if (!existsSync(join(distDir, "index.html"))) {
    await dialog.showErrorBox(
      "MashLab AI",
      `Built UI not found at ${distDir}.\nRun npm run build:windows:desktop from the repo first.`
    );
    app.quit();
    return;
  }

  const probe = await probeRuntime();
  const evaluation = evaluateRuntime(probe);
  await showRuntimeGuidance(evaluation);

  await startStaticServer();
  if (probe.venvPythonExists) {
    const sidecarOk = await startSidecar();
    if (!sidecarOk) {
      await dialog.showMessageBox({
        type: "warning",
        title: "MashLab AI — sidecar",
        message: "Could not start the Python sidecar.",
        detail:
          "Upload and planning may work, but Quick Mix processing needs the sidecar at 127.0.0.1:47831.\nSee docs/WINDOWS_RUNTIME_SETUP.md.",
        buttons: ["Continue"],
      });
    }
  }

  createMainWindow();
}

app.whenReady().then(bootstrap);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", async () => {
  await stopSidecar();
  if (staticServer) {
    staticServer.close();
    staticServer = null;
  }
});
