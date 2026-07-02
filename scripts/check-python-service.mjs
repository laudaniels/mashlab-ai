import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const runTests = process.argv.includes("--test");
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const backend = path.join(root, "backend");
const py = path.join(backend, "venv", "Scripts", "python.exe");

const health = spawnSync(py, ["-c", "import fastapi, librosa, numpy; print('imports ok')"], {
  cwd: backend,
  encoding: "utf8",
});
if (health.status !== 0) {
  console.error(health.stderr || health.stdout);
  process.exit(1);
}
console.log("OK — python service imports");

if (runTests) {
  const r = spawnSync(py, ["-m", "tests.api_test"], { cwd: backend, stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
  console.log("PASS — python service HTTP test");
} else {
  console.log("PASS — python service check (use --test for HTTP integration)");
}
