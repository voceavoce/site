// S2 (T-1012): il player come lo vive un telefono. Senza il flag che libera l'autoplay (il browser parte con il contesto audio
// SOSPESO fino al primo tocco), con schermo a tocco e a 390 px. In locale gira su Chromium con emulazione mobile; con
// PW_WEBKIT=1 (WebKit installato, come in CI: `npx playwright install --with-deps webkit`) gira anche su WebKit/iPhone.
//   PW_WEBKIT=1 npm run e2e -- --project=webkit mobile
import { expect } from "@playwright/test";
import config from "../../playwright.config.mjs";
import { test, apriPlayer, intercettaAudio, raccogliErrori } from "./helpers.mjs";

test.use({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
  // niente --autoplay-policy=no-user-gesture-required: e' la regola vera dei telefoni
  launchOptions: { ...config.use.launchOptions, args: [] },   // (WebKit ignora executablePath/args: usa il suo browser)
});

test.beforeEach(async ({ context }) => { await intercettaAudio(context); });

const stato = (page) => page.evaluate(() => window.__study.engine.ctx.state);
const posizione = (page) => page.evaluate(() => window.__study.engine.audiblePosition());

test("autoplay: il contesto audio parte sospeso e il primo tocco su Riproduci lo avvia", async ({ page }) => {
  const errori = raccogliErrori(page);
  await apriPlayer(page);
  expect(await stato(page)).not.toBe("running");                     // nessun suono prima del gesto dell'utente
  await page.locator("[data-play]").tap();
  await expect(page.locator("[data-play]")).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => stato(page), { timeout: 10_000 }).toBe("running");
  const p0 = await posizione(page);
  await page.waitForTimeout(1500);
  expect(await posizione(page)).toBeGreaterThan(p0 + 0.8);           // il tempo avanza davvero
  expect(errori).toEqual([]);
});

test("sospensione: se il sistema ferma l'audio (telefono in tasca, chiamata) Riproduci lo fa ripartire", async ({ page }) => {
  await apriPlayer(page);
  await page.locator("[data-play]").tap();
  await expect.poll(() => stato(page), { timeout: 10_000 }).toBe("running");
  // il sistema sospende il contesto audio, non l'utente: lo stato dell'app non cambia da solo
  await page.evaluate(() => window.__study.engine.ctx.suspend());
  await expect.poll(() => stato(page)).toBe("suspended");
  const ferma = await posizione(page);
  await page.waitForTimeout(800);
  expect(Math.abs((await posizione(page)) - ferma)).toBeLessThan(0.05);   // senza audio la posizione non corre via
  // il pulsante deve poter riportare il suono: dopo al massimo due tocchi (pausa e riproduci) l'audio e' di nuovo in marcia
  for (let i = 0; i < 2 && (await stato(page)) !== "running"; i++) await page.locator("[data-play]").tap();
  await expect.poll(() => stato(page), { timeout: 10_000 }).toBe("running");
  const p1 = await posizione(page);
  await page.waitForTimeout(1200);
  expect(await posizione(page)).toBeGreaterThan(p1 + 0.6);
});

test("tab in secondo piano e ritorno: il tempo non salta e il suono continua", async ({ page }) => {
  await apriPlayer(page);
  await page.locator("[data-play]").tap();
  await expect.poll(() => stato(page), { timeout: 10_000 }).toBe("running");
  await page.waitForTimeout(800);
  const prima = await posizione(page);
  await page.evaluate(() => { Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true }); document.dispatchEvent(new Event("visibilitychange")); });
  await page.waitForTimeout(1000);
  await page.evaluate(() => { Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true }); document.dispatchEvent(new Event("visibilitychange")); });
  await page.waitForTimeout(500);
  const dopo = await posizione(page);
  expect(dopo - prima).toBeGreaterThan(1.0);
  expect(dopo - prima).toBeLessThan(4.0);                            // niente salti in avanti
  expect(await stato(page)).toBe("running");
});

test("schermo: a 390 px non si scorre in orizzontale e i comandi sono a portata di pollice", async ({ page }) => {
  await apriPlayer(page);
  const r = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    piccoli: [...document.querySelectorAll("[data-play], [data-seek], [data-speed], [data-mute], [data-solo]")]
      .map((e) => { const b = e.getBoundingClientRect(); return { id: e.dataset.play !== undefined ? "play" : Object.keys(e.dataset)[0], w: Math.round(b.width), h: Math.round(b.height) }; })
      .filter((x) => x.w > 0 && (x.h < 30 || x.w < 30)),
  }));
  expect(r.scroll).toBeLessThanOrEqual(1);
  expect(r.piccoli, "comandi troppo piccoli per un dito (sotto 30 px)").toEqual([]);
});
