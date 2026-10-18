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
// Si lancia il binario locale con node invece di "npx" (su Windows è npx.cmd e spawnSync non
// lo trova) e i file vanno a gruppi per restare sotto il limite di ~32k caratteri della riga
// di comando di Windows. Così funziona uguale su Windows, Linux e CI.
const bin = path.join("node_modules", "html-validate", "bin", "html-validate.mjs");
const BATCH = 100;
let status = 0;
for (let i = 0; i < files.length; i += BATCH) {
  const r = spawnSync(process.execPath, [bin, "--config", ".htmlvalidate.json", ...files.slice(i, i + BATCH)], { stdio: "inherit" });
  if (r.error) console.error(`lint:html: ${r.error.message}`);
  if (r.status !== 0) status = r.status ?? 1;
}
if (status === 0) console.log(`lint:html: OK (${files.length} file)`);
process.exit(status);
