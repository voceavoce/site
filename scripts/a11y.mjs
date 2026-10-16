// Serve _site in locale, genera le pagine campione e lancia pa11y-ci (runner axe).
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const port = process.env.A11Y_PORT || "8080";
const base = `http://127.0.0.1:${port}`;
const gen = spawnSync("node", ["scripts/a11y-urls.mjs", base, "_site"], { stdio: "inherit" });
if (gen.status !== 0) process.exit(gen.status ?? 1);

// http-server lanciato direttamente con node (non via npx): cosi' kill() ferma davvero il server
// e lo script termina (con npx restava vivo il processo figlio e il comando non finiva mai).
const server = spawn(process.execPath, ["node_modules/http-server/bin/http-server", "_site", "-p", port, "-a", "127.0.0.1", "-s"], { stdio: "inherit" });
let code = 1;
try {
  for (let i = 0; i < 30; i++) {
    try { if ((await fetch(base + "/")).ok) break; } catch {}
    await sleep(500);
  }
  code = spawnSync("npx", ["pa11y-ci", "--config", "node_modules/.cache/pa11yci.json"], { stdio: "inherit" }).status ?? 1;
} finally {
  server.kill();
}
process.exit(code);
