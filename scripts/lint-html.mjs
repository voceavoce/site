// html-validate su _site escludendo _site/classic/** (backup della vecchia landing).
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const root = "_site";
const files = readdirSync(root, { recursive: true })
  .map((f) => f.split(path.sep).join("/"))
  .filter((f) => f.endsWith(".html") && !f.startsWith("classic/"))
  .map((f) => `${root}/${f}`);
if (!files.length) {
  console.error("lint:html: nessun file in _site (esegui prima npm run build)");
  process.exit(1);
}
const r = spawnSync("npx", ["html-validate", "--config", ".htmlvalidate.json", ...files], { stdio: "inherit" });
if (r.status === 0) console.log(`lint:html: OK (${files.length} file)`);
process.exit(r.status ?? 1);
