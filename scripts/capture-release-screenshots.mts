#!/usr/bin/env node
/**
 * Capture Phase 34/35 release UI screenshots with Playwright (real Chromium render).
 * Run: npm run capture:release-screenshots
 * Requires: sidecar healthy, Vite dev server on 127.0.0.1:5173
 */
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { FIRST_RUN_DISMISS_KEY } from "../src/domain/windowsRuntimeSetup.ts";

const APP_URL = "http://127.0.0.1:5173/";
const OUT_DIR = join(process.cwd(), "qa/full-local-workflow/phase-34/screenshots");
const TRACK_A = join(process.cwd(), "qa/full-local-workflow/phase-32/test-audio/track-a-vocal-like-15s.wav");
const TRACK_B = join(process.cwd(), "qa/full-local-workflow/phase-32/test-audio/track-b-instrumental-15s.wav");
const REGISTRY_KEY = "mashlab-preview-artifacts-v1";

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    console.error("Playwright not available. Run: npx --yes -p playwright@1.49.1 playwright install chromium");
    process.exit(1);
  }
}

async function waitForApp(page: import("playwright").Page) {
  await page.waitForSelector("h1", { timeout: 60000 });
  await page.waitForSelector(".local-engine-status", { timeout: 15000 });
  await page.waitForTimeout(2000);
}

async function clickNav(page: import("playwright").Page, label: string) {
  await page.getByRole("button", { name: label, exact: true }).click();
  await page.waitForTimeout(400);
}

async function main() {
  if (!existsSync(TRACK_A) || !existsSync(TRACK_B)) {
    console.error("Missing synthetic test audio. Run qa/full-local-workflow/phase-32/run-phase32-api-qa.ps1 first.");
    process.exit(1);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const { chromium } = await loadPlaywright();
  const launchOptions: Parameters<typeof chromium.launch>[0] = { headless: true };
  if (process.platform === "win32") {
    launchOptions.channel = "msedge";
  }
  const browser = await chromium.launch(launchOptions);
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  try {
    await page.goto(APP_URL, { waitUntil: "networkidle", timeout: 60000 });
    await page.evaluate((dismissKey) => {
      sessionStorage.removeItem(dismissKey);
    }, FIRST_RUN_DISMISS_KEY);
    await page.reload({ waitUntil: "networkidle" });
    await waitForApp(page);
    await page.screenshot({ path: join(OUT_DIR, "01-first-run-guidance.png"), fullPage: true });

    await clickNav(page, "Upload");
    const inputs = page.locator('input[type="file"]');
    await inputs.nth(0).setInputFiles(TRACK_A);
    await inputs.nth(1).setInputFiles(TRACK_B);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: join(OUT_DIR, "02-upload-two-tracks.png"), fullPage: true });

    await page.locator(".local-engine-status").screenshot({
      path: join(OUT_DIR, "03-local-engine-status.png"),
    });
    await page.locator(".workflow-readiness-panel").screenshot({
      path: join(OUT_DIR, "04-workflow-checklist.png"),
    });

    await clickNav(page, "Analysis");
    await page.waitForTimeout(2000);
    await page.screenshot({ path: join(OUT_DIR, "05-analysis-screen.png"), fullPage: true });

    await clickNav(page, "Stems");
    await page.screenshot({ path: join(OUT_DIR, "06-stems-screen.png"), fullPage: true });

    await clickNav(page, "Timeline");
    await page.screenshot({ path: join(OUT_DIR, "07-combined-preview.png"), fullPage: true });

    await clickNav(page, "Export");
    await page.screenshot({ path: join(OUT_DIR, "08-export-screen.png"), fullPage: true });

    const listResp = await page.request.get("http://127.0.0.1:47831/v1/artifacts");
    const listJson = (await listResp.json()) as {
      artifacts?: Array<{ artifact_id: string; artifact_type: string; preview_label?: string }>;
    };
    const registry = (listJson.artifacts ?? []).slice(0, 12).map((artifact) => ({
      artifactId: artifact.artifact_id,
      artifactType: artifact.artifact_type === "package" ? "package" : artifact.artifact_type,
      createdAt: new Date().toISOString(),
      sourceTrackSlot: null,
      targetTrackSlot: null,
      mashIntent: null,
      label: artifact.preview_label ?? artifact.artifact_type,
      isPreviewOnly: true,
      finalExport: false,
    }));
    await page.evaluate(
      ({ key, entries }) => {
        sessionStorage.setItem(key, JSON.stringify(entries));
      },
      { key: REGISTRY_KEY, entries: registry }
    );
    await page.reload({ waitUntil: "networkidle" });
    await clickNav(page, "Export");
    await page.waitForTimeout(1500);
    await page.locator(".preview-artifact-browser").screenshot({
      path: join(OUT_DIR, "09-artifact-browser.png"),
    }).catch(async () => {
      await page.screenshot({ path: join(OUT_DIR, "09-artifact-browser.png"), fullPage: true });
    });

    const packageArtifact = (listJson.artifacts ?? []).find((a) => a.artifact_type === "package");
    if (packageArtifact) {
      await page.screenshot({ path: join(OUT_DIR, "10-package-result.png"), fullPage: true });
    } else {
      console.warn("No package artifact on sidecar — 10-package-result.png shows export screen state");
      await page.screenshot({ path: join(OUT_DIR, "10-package-result.png"), fullPage: true });
    }

    console.log(`Screenshots written to ${OUT_DIR}`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
