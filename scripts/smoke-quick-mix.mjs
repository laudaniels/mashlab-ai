import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const py = path.join(root, "backend", "venv", "Scripts", "python.exe");
const r = spawnSync(py, ["-m", "tests.smoke_test"], {
  cwd: path.join(root, "backend"),
  stdio: "inherit",
});
if (r.status !== 0) process.exit(r.status ?? 1);
console.log("PASS — Quick Mix smoke (synthetic pipeline)");
