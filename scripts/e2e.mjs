#!/usr/bin/env node
// `npm run e2e`: costruisce il sito di prova in _site-e2e e lancia Playwright (argomenti passati cosi' come sono:
// `npm run e2e -- --grep mixer`). La build e' NON di produzione, cosi' c'e' il brano di prova content/player/_prova,
// e usa la base audio di sviluppo (http://localhost:8787), che i test intercettano con audio sintetici.
import { spawnSync } from "node:child_process";

const env = { ...process.env, VOCEAVOCE_AUDIO_BASE: "http://localhost:8787" };
delete env.ELEVENTY_ENV;

const run = (args) => spawnSync(process.execPath, args, { stdio: "inherit", env }).status ?? 1;

if (!process.env.E2E_SKIP_BUILD) {
  const b = run(["node_modules/@11ty/eleventy/cmd.cjs", "--output=_site-e2e", "--quiet"]);
  if (b !== 0) process.exit(b);
}
process.exit(run(["node_modules/@playwright/test/cli.js", "test", ...process.argv.slice(2)]));
