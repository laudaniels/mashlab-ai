import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const backend = path.join(root, "backend");
const py = path.join(backend, "venv", "Scripts", "python.exe");
const tests = [
  "tests.phrase_test",
  "tests.remix_brain_test",
  "tests.validate_test",
  "tests.beatgrid_test",
  "tests.smoke_test",
];

let failed = 0;
for (const mod of tests) {
  const r = spawnSync(py, ["-m", mod], {
    cwd: backend,
    stdio: "inherit",
    shell: false,
    env: { ...process.env, PYTHONIOENCODING: "utf-8" },
  });
  if (r.status !== 0) failed += 1;
}
if (failed) process.exit(1);
console.log(`PASS — ${tests.length} python test modules`);
