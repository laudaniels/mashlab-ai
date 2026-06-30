#!/usr/bin/env node
/** Check WSL availability for optional rhythm sidecar profile. */
import { spawnSync } from "node:child_process";
import { wslSidecarCheckFromAvailability, formatWindowsFallbackMessage } from "../src/domain/wslSidecarProfile.ts";

function detectWslAvailable(): boolean {
  const result = spawnSync("wsl", ["--status"], { encoding: "utf8", shell: process.platform === "win32" });
  if (result.error) {
    return false;
  }
  const combined = `${result.stdout ?? ""}${result.stderr ?? ""}`.toLowerCase();
  if (combined.includes("not installed")) {
    return false;
  }
  return result.status === 0;
}

const wslAvailable = process.platform === "win32" ? detectWslAvailable() : true;
const check = wslSidecarCheckFromAvailability(wslAvailable);

console.log("MashLab WSL sidecar check");
console.log(check.message);
console.log(formatWindowsFallbackMessage(wslAvailable));

if (check.suggestedCommand) {
  console.log(`Suggested: ${check.suggestedCommand}`);
  console.log("Then: npm run sidecar:wsl:selftest");
}

process.exit(0);
