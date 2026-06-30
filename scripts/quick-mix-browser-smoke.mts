#!/usr/bin/env node
/**
 * Browser Quick Mix operator validation — synthetic audio only.
 * Run: npm run smoke:quick-mix:browser
 * Requires: sidecar healthy, Vite dev server on 127.0.0.1:5173 or 5174
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const DEFAULT_APP_URLS = ["http://127.0.0.1:5173/", "http://127.0.0.1:5174/"];
const AUDIO_DIR = join(ROOT, "qa/full-local-workflow/phase-32/test-audio");
const TRACK_A = join(AUDIO_DIR, "track-a-vocal-like-15s.wav");
const TRACK_B = join(AUDIO_DIR, "track-b-instrumental-15s.wav");
const OUT_DIR = join(ROOT, "qa/full-local-workflow/phase-37");
const OUT_LOG = join(OUT_DIR, "quick-mix-browser-smoke-log.json");

function ensureSyntheticAudio(): void {
  mkdirSync(AUDIO_DIR, { recursive: true });
  if (!existsSync(TRACK_A)) {
    execFileSync(
      "ffmpeg",
      [
        "-y",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:duration=15",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=220:duration=15",
        "-filter_complex",
        "[0]volume=0.75[a];[1]volume=0.2[b];[a][b]amix=inputs=2:duration=first",
        "-ac",
        "2",
        "-ar",
        "44100",
        TRACK_A,
      ],
      { stdio: "ignore" }
    );
  }
  if (!existsSync(TRACK_B)) {
    execFileSync(
      "ffmpeg",
      [
        "-y",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=110:duration=15",
        "-f",
        "lavfi",
        "-i",
        "anoisesrc=d=15:c=pink:a=0.015",
        "-filter_complex",
        "[0]volume=0.6[a];[1]volume=0.4[b];[a][b]amix=inputs=2:duration=first",
        "-ac",
        "2",
        "-ar",
        "44100",
        TRACK_B,
      ],
      { stdio: "ignore" }
    );
  }
}

async function resolveAppUrl(): Promise<string> {
  const fromEnv = process.env.MASHLAB_DEV_URL?.trim();
  if (fromEnv) {
    return fromEnv.endsWith("/") ? fromEnv : `${fromEnv}/`;
  }
  for (const url of DEFAULT_APP_URLS) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (response.ok) {
        return url;
      }
    } catch {
      // try next
    }
  }
  throw new Error("Vite dev server not reachable on 5173 or 5174. Run npm run dev first.");
}

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    console.error("Playwright not available.");
    process.exit(1);
  }
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  ensureSyntheticAudio();

  const health = await fetch("http://127.0.0.1:47831/health", { signal: AbortSignal.timeout(5000) });
  if (!health.ok) {
    console.error("Sidecar not healthy.");
    process.exit(1);
  }

  const appUrl = await resolveAppUrl();
  const { chromium } = await loadPlaywright();
  const launchOptions: Parameters<typeof chromium.launch>[0] = { headless: true };
  if (process.platform === "win32") {
    launchOptions.channel = "msedge";
  }

  const browser = await chromium.launch(launchOptions);
  const context = await browser.newContext();
  const page = await context.newPage();

  const result: Record<string, unknown> = {
    startedAt: new Date().toISOString(),
    appUrl,
    ok: false,
  };

  try {
    await page.goto(appUrl, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForSelector(".quick-mix-shell", { timeout: 30000 });

    const vocalInput = page.locator('input[type="file"]').nth(0);
    const beatInput = page.locator('input[type="file"]').nth(1);
    await vocalInput.setInputFiles(TRACK_A);
    await beatInput.setInputFiles(TRACK_B);

    const mixButton = page.getByRole("button", { name: "Mix", exact: true });
    await page.waitForTimeout(1000);
    await mixButton.click();

    await page.waitForSelector(".quick-mix-progress-panel", { timeout: 15000 });

    const output = page.locator(".quick-mix-output-panel");
    const errorPanel = page.locator(".quick-mix-error-panel");

    const deadline = Date.now() + 600_000;
    while (Date.now() < deadline) {
      if (await output.isVisible()) {
        result.ok = true;
        result.outcome = "completed";
        result.hasWavDownload = await page.getByRole("link", { name: /Download WAV/i }).isVisible();
        result.hasMp3Download = await page.getByRole("link", { name: /Download MP3/i }).isVisible();
        break;
      }
      if (await errorPanel.isVisible()) {
        result.ok = false;
        result.outcome = "failed";
        result.errorHeadline = await errorPanel.locator("h2").textContent();
        result.errorDetail = await errorPanel.locator("p").first().textContent();
        break;
      }
      await page.waitForTimeout(2000);
    }

    if (!result.outcome) {
      result.ok = false;
      result.outcome = "timeout";
      result.errorDetail = "Browser Quick Mix did not finish within 10 minutes.";
    }

    await page.screenshot({
      path: join(OUT_DIR, "quick-mix-browser-smoke.png"),
      fullPage: true,
    });
  } finally {
    result.finishedAt = new Date().toISOString();
    writeFileSync(OUT_LOG, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    await browser.close();
  }

  console.log(JSON.stringify(result, null, 2));
  console.log("Log:", OUT_LOG);
  if (!result.ok) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
