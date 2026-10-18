// Test end-to-end (Playwright) del player di studio e della PWA. Si lanciano con `npm run e2e` (costruisce il sito
// in _site-e2e e poi esegue questa configurazione). Non c'entrano con `npm test`, che esegue solo gli unit test
// (tests/**/*.test.mjs): qui i file si chiamano *.spec.mjs.
import fs from "node:fs";
import { defineConfig } from "@playwright/test";

export const PORTA = Number(process.env.E2E_PORT || 8090);
export const BASE = `http://127.0.0.1:${PORTA}`;

// Browser: in CI e' il Chromium scaricato da `npx playwright install --with-deps chromium` (nessun percorso da
// indicare). In locale, se esiste, si usa il Chromium di sistema: PW_CHROMIUM lo indica, altrimenti il percorso
// dell'ambiente di sviluppo. Mai `playwright install` fuori dalla CI.
const CHROMIUM_LOCALE = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const executablePath = process.env.PW_CHROMIUM || (fs.existsSync(CHROMIUM_LOCALE) ? CHROMIUM_LOCALE : undefined);

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "**/*.spec.mjs",
  outputDir: "test-results",
  // Verovio (WASM) e la decodifica di 4 tracce sono lenti su una CI fredda; i tempi dei test sono comunque brevi.
  timeout: 120_000,
  expect: { timeout: 15_000 },
  // Un solo worker: i test misurano tempi di riproduzione, due browser in parallelo li renderebbero instabili.
  workers: 1,
  // In CI i test si dividono tra piu' job (--shard) test per test; restano indipendenti e ogni job usa un solo worker.
  fullyParallel: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: BASE,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: {
      executablePath,
      args: ["--autoplay-policy=no-user-gesture-required"],
    },
  },
  // Il server del sito appartiene a Playwright: parte prima dei test e si ferma alla fine.
  // Serve _site-e2e (costruito da scripts/e2e.mjs, senza ELEVENTY_ENV=production, quindi con il brano di prova).
  webServer: {
    command: `node node_modules/http-server/bin/http-server _site-e2e -p ${PORTA} -a 127.0.0.1 -s -c-1`,
    url: `${BASE}/`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
