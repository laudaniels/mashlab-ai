import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const strict = process.argv.includes("--strict");
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const py = path.join(root, "backend", "venv", "Scripts", "python.exe");

function which(name) {
  return spawnSync("where", [name], { shell: true, encoding: "utf8" }).status === 0;
}

const required = [
  ["Node.js", spawnSync("node", ["--version"], { encoding: "utf8" }).status === 0],
  ["Python venv", spawnSync(py, ["--version"], { encoding: "utf8" }).status === 0],
  ["ffmpeg", which("ffmpeg")],
];
const optional = [["rubberband", which("rubberband")]];

let fail = false;
for (const [name, pass] of required) {
  console.log(`${pass ? "OK" : "FAIL"} — ${name}`);
  if (!pass) fail = true;
}
for (const [name, pass] of optional) {
  console.log(`${pass ? "OK" : "WARN"} — ${name}${strict && !pass ? " (required in strict)" : ""}`);
  if (strict && !pass) fail = true;
}
if (fail) process.exit(1);
console.log("PASS — Windows setup check");
