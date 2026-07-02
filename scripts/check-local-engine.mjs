import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const py = path.join(root, "backend", "venv", "Scripts", "python.exe");

function which(name) {
  const r = spawnSync("where", [name], { shell: true, encoding: "utf8" });
  return r.status === 0;
}

const checks = [
  ["ffmpeg", which("ffmpeg")],
  ["rubberband", which("rubberband")],
  ["python venv", spawnSync(py, ["--version"], { encoding: "utf8" }).status === 0],
];

let ok = true;
for (const [name, pass] of checks) {
  console.log(`${pass ? "OK" : "MISSING"} — ${name}`);
  if (!pass) ok = false;
}
if (!ok) process.exit(1);
console.log("PASS — local engine prerequisites");
