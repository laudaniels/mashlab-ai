#!/usr/bin/env node
/** Print step-by-step local start checklist. */
import { buildLocalStartChecklist } from "../src/domain/windowsRuntimeSetup.ts";

console.log("Start MashLab locally — checklist");
console.log("=================================");
for (const line of buildLocalStartChecklist()) {
  console.log(line);
}
console.log("");
console.log("Run npm run setup:windows:check to verify PATH before processing steps.");
