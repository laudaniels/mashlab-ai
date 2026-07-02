#!/usr/bin/env node
/**
 * Phase 43 Arrangement Brain — interactive browser operator QA (real audio, redacted).
 * Run: npm run smoke:quick-mix:arrangement-browser
 * Env: MASHLAB_QM_VOCAL, MASHLAB_QM_BEAT (required), MASHLAB_DEV_URL optional
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const DEFAULT_APP_URLS = [
  "http://127.0.0.1:5173/",
  "http://127.0.0.1:5174/",
  "http://127.0.0.1:5175/",
  "http://127.0.0.1:5176/",
];
const REAL_VOCAL = process.env.MASHLAB_QM_VOCAL?.trim() || "";
const REAL_BEAT = process.env.MASHLAB_QM_BEAT?.trim() || "";
const OUT_DIR = join(ROOT, "qa/full-local-workflow/phase-43");
const OUT_LOG = join(OUT_DIR, "arrangement-brain-browser-qa.json");
const OUT_SCREENSHOT = join(OUT_DIR, "arrangement-brain-browser-qa.png");

const STYLES = [
  { id: "clean_blend", label: "Clean Blend" },
  { id: "hook_remix", label: "Hook Remix" },
  { id: "dj_edit", label: "DJ Edit" },
] as const;

function isHarmlessConsoleError(text: string): boolean {
  return /favicon\.ico/i.test(text);
}

async function resolveAppUrl(): Promise<string> {
  const fromEnv = process.env.MASHLAB_DEV_URL?.trim();
  if (fromEnv) {
    return fromEnv.endsWith("/") ? fromEnv : `${fromEnv}/`;
  }
  for (const url of DEFAULT_APP_URLS) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (response.ok) return url;
    } catch {
      // try next
    }
  }
  throw new Error("Vite dev server not reachable. Run npm run dev first.");
}

async function sidecarHealth(): Promise<boolean> {
  try {
    const response = await fetch("http://127.0.0.1:47831/health", { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return false;
    const payload = (await response.json()) as { ok?: boolean };
    return Boolean(payload.ok);
  } catch {
    return false;
  }
}

async function waitForMixReady(page: import("playwright").Page): Promise<void> {
  const mixButton = page.getByRole("button", { name: "Mix", exact: true });
  const deadline = Date.now() + 120_000;
  while ((await mixButton.isDisabled()) && Date.now() < deadline) {
    await page.waitForTimeout(1000);
  }
  if (await mixButton.isDisabled()) {
    throw new Error("Mix button never enabled.");
  }
}

async function runStyleCase(
  page: import("playwright").Page,
  appUrl: string,
  style: (typeof STYLES)[number],
  consoleErrors: string[],
  failedRequests: Array<{ url: string; status?: number }>
): Promise<Record<string, unknown>> {
  const startedMs = Date.now();
  await page.goto(appUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector(".quick-mix-shell", { timeout: 30000 });

  await page.locator('input[type="file"]').nth(0).setInputFiles(REAL_VOCAL);
  await page.locator('input[type="file"]').nth(1).setInputFiles(REAL_BEAT);
  await page.waitForSelector(".quick-mix-style-picker", { timeout: 30000 });

  const stylePickerVisible = await page.locator(".quick-mix-style-picker").isVisible();
  await page.locator(`.quick-mix-style-option:has-text("${style.label}") input`).check({ force: true });

  await waitForMixReady(page);
  await page.getByRole("button", { name: "Mix", exact: true }).click();
  await page.waitForSelector(".quick-mix-progress-panel", { timeout: 15000 });

  const output = page.locator(".quick-mix-output-panel");
  const errorPanel = page.locator(".quick-mix-error-panel");
  const deadline = Date.now() + 1_800_000;

  while (Date.now() < deadline) {
    if (await output.isVisible().catch(() => false)) break;
    if (await errorPanel.isVisible().catch(() => false)) break;
    await page.waitForTimeout(3000);
  }

  const result: Record<string, unknown> = {
    style: style.id,
    styleLabel: style.label,
    trackA: "Track A (vocal source)",
    trackB: "Track B (instrumental source)",
    stylePickerVisible,
    totalSeconds: Math.round((Date.now() - startedMs) / 1000),
  };

  if (await errorPanel.isVisible().catch(() => false)) {
    result.ok = false;
    result.outcome = "failed";
    result.errorHeadline = await errorPanel.locator("h2").textContent();
    result.errorDetail = await errorPanel.locator("p").first().textContent();
    return result;
  }

  if (!(await output.isVisible().catch(() => false))) {
    result.ok = false;
    result.outcome = "timeout";
    return result;
  }

  const arrangementStyleText =
    (await page.locator(".quick-mix-arrangement-style").textContent())?.trim() ?? null;
  const arrangementSummaryText =
    (await page.locator(".quick-mix-arrangement-card strong").textContent())?.trim() ?? null;
  const arrangementWarnings = await page.locator(".quick-mix-arrangement-warnings li").allTextContents();
  const rightsNotice = await page.locator(".quick-mix-rights-note").textContent().catch(() => null);

  const falseDone = await page
    .locator(".quick-mix-progress-item.quick-mix-progress-complete")
    .filter({ hasText: /^Done$/i })
    .isVisible()
    .catch(() => false);

  await page.locator(".quick-mix-technical-details summary").click();
  const technical = await page.locator(".quick-mix-technical-details li").allTextContents();
  const wavLine = technical.find((line) => line.startsWith("WAV export:"));
  const mp3Line = technical.find((line) => line.startsWith("MP3 export:"));
  const wavMatch = wavLine?.match(/WAV export:\s*([a-f0-9]+)/i);
  const mp3Match = mp3Line?.match(/MP3 export:\s*([a-f0-9]+)/i);

  const hasWav = await page.getByRole("link", { name: /Download WAV/i }).isVisible();
  const hasMp3 = await page.getByRole("link", { name: /Download MP3/i }).isVisible();
  const mp3Skipped = await page.locator(".quick-mix-mp3-skipped-note").textContent().catch(() => null);
  const playable = (await page.locator(".quick-mix-output-panel audio").count()) > 0;

  const materialFailedRequests = failedRequests.filter((entry) => {
    try {
      return new URL(entry.url).pathname !== "/favicon.ico";
    } catch {
      return true;
    }
  });

  result.ok =
    hasWav &&
    playable &&
    !falseDone &&
    Boolean(arrangementStyleText) &&
    Boolean(arrangementSummaryText) &&
    consoleErrors.length === 0 &&
    materialFailedRequests.length === 0;
  result.outcome = "completed";
  result.arrangementStyleText = arrangementStyleText;
  result.arrangementSummaryText = arrangementSummaryText;
  result.arrangementWarnings = arrangementWarnings;
  result.rightsNoticeVisible = Boolean(rightsNotice?.trim());
  result.hasWavDownload = hasWav;
  result.hasMp3Download = hasMp3;
  result.mp3SkippedReason = mp3Skipped?.trim() ?? null;
  result.wavArtifactId = wavMatch?.[1] ?? null;
  result.mp3ArtifactId = mp3Match?.[1] ?? null;
  result.playableOutput = playable;
  result.falseDone = falseDone;
  result.consoleErrors = [...consoleErrors];
  result.failedRequests = [...failedRequests];
  return result;
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  if (!REAL_VOCAL || !REAL_BEAT || !existsSync(REAL_VOCAL) || !existsSync(REAL_BEAT)) {
    console.error("Set MASHLAB_QM_VOCAL and MASHLAB_QM_BEAT to existing local audio files.");
    process.exit(1);
  }
  if (!(await sidecarHealth())) {
    console.error("Sidecar not healthy — npm run sidecar:start");
    process.exit(1);
  }

  const appUrl = await resolveAppUrl();
  const { chromium } = await import("playwright");
  const launchOptions: Parameters<typeof chromium.launch>[0] = { headless: true };
  if (process.platform === "win32") {
    launchOptions.channel = "msedge";
  }

  const browser = await chromium.launch(launchOptions);
  const page = await browser.newPage();
  const consoleErrors: string[] = [];
  const failedRequests: Array<{ url: string; status?: number }> = [];

  page.on("response", (response) => {
    if (response.status() === 404) {
      failedRequests.push({ url: response.url(), status: 404 });
    }
  });
  page.on("console", (msg) => {
    if (msg.type() === "error" && !isHarmlessConsoleError(msg.text())) {
      consoleErrors.push(msg.text());
    }
  });

  const cases: Record<string, unknown>[] = [];
  let allOk = true;

  try {
    for (const style of STYLES) {
      consoleErrors.length = 0;
      failedRequests.length = 0;
      console.log(`Browser QA — ${style.label}…`);
      const caseResult = await runStyleCase(page, appUrl, style, consoleErrors, failedRequests);
      cases.push(caseResult);
      if (!caseResult.ok) allOk = false;
      await page.screenshot({
        path: join(OUT_DIR, `arrangement-brain-browser-${style.id}.png`),
        fullPage: true,
      });
    }
    await page.screenshot({ path: OUT_SCREENSHOT, fullPage: true });
  } finally {
    await browser.close();
  }

  const report = {
    label: "Track A × Track B",
    appUrl,
    usingRealAudio: true,
    cases,
    passed: allOk,
    finishedAt: new Date().toISOString(),
  };
  writeFileSync(OUT_LOG, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
  console.log("Log:", OUT_LOG);

  if (!allOk) process.exit(1);
  console.log("Arrangement Brain browser QA PASS");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
