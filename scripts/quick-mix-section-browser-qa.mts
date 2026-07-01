#!/usr/bin/env node
/**
 * Phase 41 Quick Mix section picker — real-audio browser QA (filenames redacted in logs).
 * Run: npm run smoke:quick-mix:section-qa
 * Env: MASHLAB_QM_VOCAL, MASHLAB_QM_BEAT (required for real-audio cases), MASHLAB_DEV_URL optional.
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
const SYNTH_DIR = join(ROOT, "qa/full-local-workflow/phase-32/test-audio");
const SYNTH_VOCAL = join(SYNTH_DIR, "track-a-vocal-like-15s.wav");
const SYNTH_BEAT = join(SYNTH_DIR, "track-b-instrumental-15s.wav");

const REAL_VOCAL = process.env.MASHLAB_QM_VOCAL?.trim() || "";
const REAL_BEAT = process.env.MASHLAB_QM_BEAT?.trim() || "";
const OUT_DIR = join(ROOT, "qa/full-local-workflow/phase-41");
const OUT_LOG = join(OUT_DIR, "quick-mix-section-browser-qa.json");

type CaseId =
  | "default_first_180"
  | "custom_vocal_1_05"
  | "custom_instrumental_0_42"
  | "different_starts"
  | "shorter_synthetic"
  | "invalid_start"
  | "mp3_optional"
  | "sidecar_health";

interface SectionConfig {
  vocal?: { mode: "first_180" } | { mode: "custom_start"; minutes: string; seconds: string };
  instrumental?: { mode: "first_180" } | { mode: "custom_start"; minutes: string; seconds: string };
  sameStart?: boolean;
}

interface CaseSpec {
  id: CaseId;
  label: string;
  useReal: boolean;
  section: SectionConfig;
  expectSuccess: boolean;
}

function ensureSynth(): void {
  mkdirSync(SYNTH_DIR, { recursive: true });
  if (!existsSync(SYNTH_VOCAL)) {
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
        SYNTH_VOCAL,
      ],
      { stdio: "ignore" }
    );
  }
  if (!existsSync(SYNTH_BEAT)) {
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
        SYNTH_BEAT,
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
      // next
    }
  }
  throw new Error("Vite dev server not reachable. Run npm run dev.");
}

async function sidecarHealth(): Promise<{ ok: boolean; detail: unknown }> {
  try {
    const response = await fetch("http://127.0.0.1:47831/health", { signal: AbortSignal.timeout(8000) });
    if (!response.ok) {
      return { ok: false, detail: { status: response.status } };
    }
    return { ok: true, detail: await response.json() };
  } catch (error) {
    return { ok: false, detail: String(error) };
  }
}

function buildCases(): CaseSpec[] {
  if (!REAL_VOCAL || !REAL_BEAT || !existsSync(REAL_VOCAL) || !existsSync(REAL_BEAT)) {
    throw new Error("Set MASHLAB_QM_VOCAL and MASHLAB_QM_BEAT to local audio files.");
  }
  return [
    { id: "default_first_180", label: "Default First 3:00", useReal: true, section: {}, expectSuccess: true },
    {
      id: "custom_vocal_1_05",
      label: "Custom vocal 1:05",
      useReal: true,
      section: { vocal: { mode: "custom_start", minutes: "1", seconds: "5" } },
      expectSuccess: true,
    },
    {
      id: "custom_instrumental_0_42",
      label: "Custom instrumental 0:42",
      useReal: true,
      section: { instrumental: { mode: "custom_start", minutes: "0", seconds: "42" } },
      expectSuccess: true,
    },
    {
      id: "different_starts",
      label: "Different vocal/instrumental starts",
      useReal: true,
      section: {
        vocal: { mode: "custom_start", minutes: "1", seconds: "5" },
        instrumental: { mode: "custom_start", minutes: "0", seconds: "42" },
      },
      expectSuccess: true,
    },
    { id: "shorter_synthetic", label: "Shorter 15s synthetic pair", useReal: false, section: {}, expectSuccess: true },
    {
      id: "invalid_start",
      label: "Invalid start past file end",
      useReal: true,
      section: { vocal: { mode: "custom_start", minutes: "10", seconds: "0" } },
      expectSuccess: false,
    },
    {
      id: "mp3_optional",
      label: "MP3 optional (WAV required)",
      useReal: true,
      section: {},
      expectSuccess: true,
    },
    {
      id: "sidecar_health",
      label: "Sidecar health during processing",
      useReal: true,
      section: { vocal: { mode: "custom_start", minutes: "0", seconds: "30" } },
      expectSuccess: true,
    },
  ];
}


async function waitForUploadsReady(page: import("playwright").Page): Promise<void> {
  await page.waitForFunction(() => document.querySelectorAll(".quick-mix-file-name").length >= 2, null, {
    timeout: 60000,
  });
  await page.waitForTimeout(4000);
}
async function applySection(
  page: import("playwright").Page,
  slot: "vocal" | "instrumental",
  config: NonNullable<SectionConfig["vocal"]>
): Promise<void> {
  const pickers = page.locator(".quick-mix-section-picker");
  const fieldset = slot === "vocal" ? pickers.first() : pickers.last();
  await fieldset.scrollIntoViewIfNeeded();
  if (config.mode === "first_180") {
    await fieldset.locator('input[type="radio"]').first().check({ force: true });
    return;
  }
  await fieldset.locator('input[type="radio"]').nth(1).check({ force: true });
  const custom = fieldset.locator(".quick-mix-section-custom");
  await custom.waitFor({ state: "visible", timeout: 10000 });
  await custom.locator('label:has-text("Minutes") input').fill(config.minutes);
  await custom.locator('label:has-text("Seconds") input').fill(config.seconds);
}

async function resetUi(page: import("playwright").Page): Promise<void> {
  const startAnother = page.getByRole("button", { name: "Start another mix" });
  if (await startAnother.isVisible().catch(() => false)) {
    await startAnother.click();
  }
}

async function runCase(
  page: import("playwright").Page,
  spec: CaseSpec,
  appUrl: string,
  consoleErrors: string[]
): Promise<Record<string, unknown>> {
  const vocalPath = spec.useReal ? REAL_VOCAL : SYNTH_VOCAL;
  const beatPath = spec.useReal ? REAL_BEAT : SYNTH_BEAT;
  const startedMs = Date.now();
  const healthSamples: Array<{ tSec: number; ok: boolean }> = [];

  await page.goto(appUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector(".quick-mix-shell", { timeout: 30000 });

  const vocalInput = page.locator('input[type="file"]').nth(0);
  const beatInput = page.locator('input[type="file"]').nth(1);
  await vocalInput.setInputFiles(vocalPath);
  await beatInput.setInputFiles(beatPath);
  await waitForUploadsReady(page);

  if (spec.section.sameStart) {
    await page.getByLabel("Use the same start time for both sources").check();
  } else if (spec.section.sameStart === false) {
    await page.getByLabel("Use the same start time for both sources").uncheck().catch(() => undefined);
  }

  const vocalCfg = spec.section.vocal ?? { mode: "first_180" as const };
  const instrumentalCfg = spec.section.instrumental ?? { mode: "first_180" as const };

  if (vocalCfg.mode === "custom_start" || instrumentalCfg.mode === "custom_start") {
    await page.waitForSelector(".quick-mix-section-picker", { timeout: 15000 });
  }

  if (vocalCfg.mode === "custom_start") {
    await applySection(page, "vocal", vocalCfg);
  }
  if (instrumentalCfg.mode === "custom_start") {
    const sameStart = await page.getByLabel("Use the same start time for both sources").isChecked();
    if (!sameStart) {
      await applySection(page, "instrumental", instrumentalCfg);
    }
  }

  const mixButton = page.getByRole("button", { name: "Mix", exact: true });
  const enabledDeadline = Date.now() + 90_000;
  while ((await mixButton.isDisabled()) && Date.now() < enabledDeadline) {
    await page.waitForTimeout(1000);
  }

  const pollHealth = spec.id === "sidecar_health";
  let healthTimer: NodeJS.Timeout | null = null;
  if (pollHealth) {
    healthTimer = setInterval(async () => {
      const h = await sidecarHealth();
      healthSamples.push({ tSec: Math.round((Date.now() - startedMs) / 1000), ok: h.ok });
    }, 5000);
  }

  await mixButton.click();

  const result: Record<string, unknown> = {
    caseId: spec.id,
    label: spec.label,
    trackA: "Track A (vocal source)",
    trackB: "Track B (instrumental source)",
    useRealAudio: spec.useReal,
    section: spec.section,
    expectSuccess: spec.expectSuccess,
    vocalStart: vocalCfg.mode === "custom_start" ? `${vocalCfg.minutes}:${vocalCfg.seconds.padStart(2, "0")}` : "0:00 (First 3:00)",
    instrumentalStart:
      instrumentalCfg.mode === "custom_start"
        ? `${instrumentalCfg.minutes}:${instrumentalCfg.seconds.padStart(2, "0")}`
        : "0:00 (First 3:00)",
  };

  if (!spec.expectSuccess) {
    const dropError = page.locator(".quick-mix-drop-error").first();
        await page.waitForTimeout(1500);
    const errorText =
      (await page.locator(".quick-mix-drop-error").first().textContent({ timeout: 5000 }).catch(() => null))?.trim() ??
      null;
    const mixingVisible = await page.locator(".quick-mix-progress-panel").isVisible().catch(() => false);
    const outputVisible = await page.locator(".quick-mix-output-panel").isVisible().catch(() => false);
    const falseDone = await page
      .locator(".quick-mix-progress-item.quick-mix-progress-complete")
      .filter({ hasText: /^Done$/i })
      .isVisible()
      .catch(() => false);
    if (healthTimer) {
      clearInterval(healthTimer);
    }
    result.ok = Boolean(errorText) && !outputVisible && !falseDone && !mixingVisible;
    result.errorText = errorText;
    result.falseDone = falseDone;
    result.mixingStarted = mixingVisible;
    result.totalSeconds = Math.round((Date.now() - startedMs) / 1000);
    return result;
  }

  const mixDeadlineMs = spec.useReal ? 1_800_000 : 600_000;
  const output = page.locator(".quick-mix-output-panel");
  const errorPanel = page.locator(".quick-mix-error-panel");

  while (Date.now() < startedMs + mixDeadlineMs) {
    if (await output.isVisible().catch(() => false)) {
      break;
    }
    if (await errorPanel.isVisible().catch(() => false)) {
      break;
    }
    await page.waitForTimeout(2000);
  }

  if (healthTimer) {
    clearInterval(healthTimer);
  }

  result.totalSeconds = Math.round((Date.now() - startedMs) / 1000);
  result.sidecarHealthSamples = healthSamples;
  result.sidecarHealthyDuringMix =
    healthSamples.length === 0 ? null : healthSamples.every((sample) => sample.ok);

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

  await page.locator(".quick-mix-technical-details summary").click();
  const technical = await page.locator(".quick-mix-technical-details li").allTextContents();
  const wavLine = technical.find((line) => line.startsWith("WAV export:"));
  const mp3Line = technical.find((line) => line.startsWith("MP3 export:"));
  const wavMatch = wavLine?.match(/WAV export:\s*([a-f0-9]+)/i);
  const mp3Match = mp3Line?.match(/MP3 export:\s*([a-f0-9]+)/i);

  const sectionLines = await page.locator(".quick-mix-section-summary li").allTextContents();
  const falseDone = await page
    .locator(".quick-mix-progress-item.quick-mix-progress-complete")
    .filter({ hasText: /^Done$/i })
    .isVisible()
    .catch(() => false);

  const hasWav = await page.getByRole("link", { name: /Download WAV/i }).isVisible();
  const hasMp3 = await page.getByRole("link", { name: /Download MP3/i }).isVisible();
  const mp3Skipped = await page.locator(".quick-mix-mp3-skipped-note").textContent().catch(() => null);
  const audioEl = page.locator(".quick-mix-output-panel audio");
  const playable = (await audioEl.count()) > 0;

  result.ok = hasWav && playable && !falseDone;
  result.outcome = "completed";
  result.sectionSummaryLines = sectionLines;
  result.wavArtifactId = wavMatch?.[1] ?? null;
  result.mp3ArtifactId = mp3Match?.[1] ?? null;
  result.hasWavDownload = hasWav;
  result.hasMp3Download = hasMp3;
  result.mp3SkippedReason = mp3Skipped?.trim() ?? null;
  result.playableOutput = playable;
  result.falseDone = falseDone;
    result.mixingStarted = mixingVisible;
  result.consoleErrors = [...consoleErrors];
  return result;
}

async function main(): Promise<void> {
  ensureSynth();
  mkdirSync(OUT_DIR, { recursive: true });
  const health = await sidecarHealth();
  if (!health.ok) {
    console.error("Sidecar not healthy", health.detail);
    process.exit(1);
  }

  const appUrl = await resolveAppUrl();
  const cases = buildCases();
  const { chromium } = await import("playwright");
  const launchOptions: Parameters<typeof chromium.launch>[0] = { headless: true };
  if (process.platform === "win32") {
    launchOptions.channel = "msedge";
  }

  const browser = await chromium.launch(launchOptions);
  const page = await browser.newPage();
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });

  const only = process.env.MASHLAB_QM_CASE?.trim();
  const selected = only ? cases.filter((c) => c.id === only) : cases;
  if (selected.length === 0) {
    throw new Error(`Unknown MASHLAB_QM_CASE=${only}`);
  }

  const report: Record<string, unknown> = {
    startedAt: new Date().toISOString(),
    appUrl,
    phase: "phase-41-section-picker",
    trackA: "Track A (vocal source)",
    trackB: "Track B (instrumental source)",
    cases: [] as Record<string, unknown>[],
  };

  for (const spec of selected) {
    consoleErrors.length = 0;
    console.log(`Running case: ${spec.id}`);
    const caseResult = await runCase(page, spec, appUrl, consoleErrors);
    (report.cases as Record<string, unknown>[]).push(caseResult);
    console.log(JSON.stringify(caseResult, null, 2));
    if (spec.expectSuccess) {
      await resetUi(page);
    }
  }

  const allOk = (report.cases as Array<{ ok?: boolean; expectSuccess?: boolean }>).every((c) => c.ok === true);
  report.allOk = allOk;
  report.finishedAt = new Date().toISOString();
  writeFileSync(OUT_LOG, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await browser.close();
  console.log("Log:", OUT_LOG);
  if (!allOk) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
