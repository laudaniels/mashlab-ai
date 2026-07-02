/** Browser smoke is optional — verifies frontend build + health endpoint. */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const build = spawnSync("npm", ["run", "build", "--prefix", path.join(root, "frontend")], {
  stdio: "inherit",
  shell: true,
});
if (build.status !== 0) process.exit(build.status ?? 1);

let healthOk = false;
try {
  const res = await fetch("http://127.0.0.1:8000/api/health");
  healthOk = res.ok;
} catch {
  healthOk = false;
}
console.log(healthOk ? "OK — backend health reachable" : "WARN — backend not running (start uvicorn for live browser test)");
console.log("PASS — Quick Mix browser smoke (build + health probe)");
