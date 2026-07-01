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
const DEFAULT_APP_URLS = [
  "http://127.0.0.1:5173/",
  "http://127.0.0.1:5174/",
  "http://127.0.0.1:5175/",
  "http://127.0.0.1:5176/",
];
const AUDIO_DIR = join(ROOT, "qa/full-local-workflow/phase-32/test-audio");
const SYNTHETIC_TRACK_A = join(AUDIO_DIR, "track-a-vocal-like-15s.wav");
const SYNTHETIC_TRACK_B = join(AUDIO_DIR, "track-b-instrumental-15s.wav");

// Real-file operator QA: point at local files WITHOUT committing their names.
// Filenames are never written to the log (redacted as Track A / Track B).
const REAL_TRACK_A = process.env.MASHLAB_QM_VOCAL?.trim() || null;
const REAL_TRACK_B = process.env.MASHLAB_QM_BEAT?.trim() || null;
const USING_REAL_FILES = Boolean(REAL_TRACK_A && REAL_TRACK_B);
const TRACK_A = REAL_TRACK_A ?? SYNTHETIC_TRACK_A;
const TRACK_B = REAL_TRACK_B ?? SYNTHETIC_TRACK_B;

const OUT_DIR = join(
  ROOT,
  USING_REAL_FILES ? "qa/full-local-workflow/phase-39" : "qa/full-local-workflow/phase-39"
);
const OUT_LOG = join(
  OUT_DIR,
  USING_REAL_FILES ? "quick-mix-real-audio-browser-log.json" : "quick-mix-browser-smoke-log.json"
);
const OUT_SCREENSHOT = join(
  OUT_DIR,
  USING_REAL_FILES ? "quick-mix-real-audio-browser.png" : "quick-mix-browser-smoke.png"
);

function ensureSyntheticAudio(): void {
  if (USING_REAL_FILES) {
    if (!existsSync(TRACK_A) || !existsSync(TRACK_B)) {
      throw new Error("Provided MASHLAB_QM_VOCAL/MASHLAB_QM_BEAT file(s) not found.");
    }
    return;
  }
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
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  const mixDeadlineMs = USING_REAL_FILES ? 1_800_000 : 600_000;
  const result: Record<string, unknown> = {
    startedAt: new Date().toISOString(),
    appUrl,
    phase: "phase-39-listening-polish",
    usingRealFiles: USING_REAL_FILES,
    // Filenames intentionally redacted — only neutral track labels are recorded.
    trackA: "Track A (vocal source)",
    trackB: "Track B (instrumental source)",
    ok: false,
  };
  const stepTimings: Record<string, number> = {};
  const startedMs = Date.now();

  try {
    await page.goto(appUrl, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForSelector(".quick-mix-shell", { timeout: 30000 });

    const vocalInput = page.locator('input[type="file"]').nth(0);
    const beatInput = page.locator('input[type="file"]').nth(1);
    await vocalInput.setInputFiles(TRACK_A);
    await beatInput.setInputFiles(TRACK_B);

    const mixButton = page.getByRole("button", { name: "Mix", exact: true });
    // Wait for readiness (engine reachable + deps ready) to enable the button.
    await mixButton.waitFor({ state: "visible", timeout: 30000 });
    const enabledDeadline = Date.now() + 60_000;
    while ((await mixButton.isDisabled()) && Date.now() < enabledDeadline) {
      await page.waitForTimeout(1000);
    }
    if (await mixButton.isDisabled()) {
      result.outcome = "blocked_not_ready";
      result.errorDetail =
        "Mix button never enabled — engine readiness not satisfied (check sidecar/CORS/deps).";
      const banner = await page.locator(".quick-mix-readiness").first().textContent();
      result.readinessBanner = banner?.replace(/\s+/g, " ").trim() ?? null;
      throw new Error("Mix button disabled");
    }

    await mixButton.click();
    await page.waitForSelector(".quick-mix-progress-panel", { timeout: 15000 });

    const output = page.locator(".quick-mix-output-panel");
    const errorPanel = page.locator(".quick-mix-error-panel");
    const seenSteps = new Set<string>();
    let lastHeartbeat: string | null = null;

    while (Date.now() < startedMs + mixDeadlineMs) {
      // Record when each step first becomes active/complete (redacted timing evidence).
      const completed = await page
        .locator(".quick-mix-progress-item.quick-mix-progress-complete span")
        .allTextContents();
      for (const label of completed) {
        if (!seenSteps.has(label)) {
          seenSteps.add(label);
          stepTimings[label] = Math.round((Date.now() - startedMs) / 1000);
        }
      }
      const heartbeat = await page.locator(".quick-mix-progress-heartbeat").first();
      if (await heartbeat.isVisible()) {
        lastHeartbeat = (await heartbeat.textContent())?.trim() ?? lastHeartbeat;
      }

      if (await output.isVisible()) {
        result.ok = true;
        result.outcome = "completed";
        result.hasWavDownload = await page.getByRole("link", { name: /Download WAV/i }).isVisible();
        result.hasMp3Download = await page.getByRole("link", { name: /Download MP3/i }).isVisible();

        const mixProfileText =
          (await page.locator(".quick-mix-mix-profile-note").textContent())?.trim() ?? "";
        result.mixProfileVisible = mixProfileText.length > 0;
        result.mixProfileText = mixProfileText;
        result.mixProfileHasPhase39Gains =
          /vocal \+1\.5 dB/i.test(mixProfileText) &&
          /bed -3(\.0)? dB/i.test(mixProfileText) &&
          /bed duck/i.test(mixProfileText);

        const loudnessNote =
          (await page.locator(".quick-mix-loudness-note").textContent())?.trim() ?? null;
        const loudnessWarnings = await page
          .locator(".quick-mix-loudness-warnings li")
          .allTextContents();
        result.loudnessNoticeVisible = Boolean(loudnessNote && loudnessNote.length > 0);
        result.loudnessNotice = loudnessNote;
        result.loudnessWarningsVisible = loudnessWarnings.length > 0;
        result.loudnessWarnings = loudnessWarnings;

        const comparisonNotes = await page
          .locator(".quick-mix-listening-comparison li")
          .allTextContents();
        result.listeningComparisonVisible = comparisonNotes.length >= 2;
        result.listeningComparisonNotes = comparisonNotes;

        const falseDoneVisible = await page
          .locator(".quick-mix-progress-item.quick-mix-progress-complete")
          .filter({ hasText: /^Done$/i })
          .isVisible()
          .catch(() => false);
        result.falseDoneBeforeOutput = falseDoneVisible && !(await output.isVisible());
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
      result.errorDetail = `Browser Quick Mix did not finish within ${Math.round(mixDeadlineMs / 60000)} minutes.`;
    }

    result.stepCompletionSeconds = stepTimings;
    result.totalSeconds = Math.round((Date.now() - startedMs) / 1000);
    result.lastHeartbeat = lastHeartbeat;

    await page.screenshot({ path: OUT_SCREENSHOT, fullPage: true });
  } finally {
    result.consoleErrors = consoleErrors;
    result.pageErrors = pageErrors;
    result.finishedAt = new Date().toISOString();
    writeFileSync(OUT_LOG, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    await browser.close();
  }

  const uiChecks =
    result.ok === true &&
    result.hasWavDownload === true &&
    result.hasMp3Download === true &&
    result.mixProfileHasPhase39Gains === true &&
    (result.loudnessNoticeVisible === true || result.loudnessWarningsVisible === true) &&
    result.listeningComparisonVisible === true &&
    result.falseDoneBeforeOutput !== true &&
    consoleErrors.length === 0 &&
    pageErrors.length === 0;

  result.uiChecksPass = uiChecks;

  console.log(JSON.stringify(result, null, 2));
  console.log("Log:", OUT_LOG);
  console.log("Screenshot:", OUT_SCREENSHOT);
  if (!result.ok || !uiChecks) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
