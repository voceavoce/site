// Pannello di anteprima del brano (T-924): cartella di prova content/player/_anteprima-prova (dossier.json + player a strumenti).
import fs from "node:fs";
import path from "node:path";
import { expect } from "@playwright/test";
import { test, intercettaAudio, raccogliErrori, RADICE } from "./helpers.mjs";

const AXE = fs.readFileSync(path.join(RADICE, "node_modules/axe-core/axe.min.js"), "utf8");
const URL_ANT = "/player/_anteprima-prova/?debug";

test.beforeEach(async ({ context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await intercettaAudio(context);
});

async function apri(page) {
  await page.goto(URL_ANT);
  await page.waitForFunction(() => window.__study?.engine.mode === "midi" && !document.querySelector("[data-play]").disabled, null, { timeout: 90_000 });
  await page.waitForSelector("[data-anteprima-body] h3", { timeout: 15_000 });
}

test("anteprima: il pannello mostra tempo, sezioni, opzioni, segnalazioni e i testi da copiare", async ({ page }) => {
  const errori = raccogliErrori(page);
  await apri(page);
  const titoli = await page.$$eval("[data-anteprima-body] h3", (l) => l.map((h) => h.textContent));
  expect(titoli).toEqual(["Tempo", "Sezioni proposte", "Scelte già nel contratto", "Segnalazioni sulla partitura", "Per Gemini", "Osservazioni", "Risposta per Claude"]);
  await expect(page.locator("[data-anteprima] .anteprima__tag")).toHaveText("solo sviluppo");
  expect(await page.locator("[data-anteprima] tbody tr").count()).toBe(6);
  expect(await page.locator("#ant-prompt").inputValue()).toMatch(/Prova/);
  expect(await page.locator(".anteprima__live").textContent()).toMatch(/100% = 80 BPM/);
  expect(await page.locator(".anteprima__anom li").count()).toBe(2);
  expect(errori).toEqual([]);
});

test("anteprima: «Vai alla battuta» porta il player alla battuta; una battuta fuori dal brano ha il pulsante spento", async ({ page }) => {
  await apri(page);
  const bottoni = page.locator(".anteprima__anom li button");
  await expect(bottoni.nth(1)).toBeDisabled();
  const t3 = await page.evaluate(() => window.__study.sync.battute.find((b) => b.numero === "3").t);
  await bottoni.nth(0).click();
  await page.waitForFunction((t) => Math.abs(window.__study.engine.position() - t) < 0.2, t3, { timeout: 5_000 });
});

test("anteprima: il tempo si prova con lo slider; oltre il tempo di prova dice di rigenerare", async ({ page }) => {
  await apri(page);
  await page.fill("#ant-tempo", "64");
  await page.getByRole("button", { name: "Prova questo tempo" }).click();
  await expect(page.locator("[data-speed]")).toHaveValue("80");
  await expect(page.locator(".anteprima__live")).toContainText("80% = 64 BPM");
  await page.fill("#ant-tempo", "100");
  await page.getByRole("button", { name: "Prova questo tempo" }).click();
  await expect(page.locator("[data-speed]")).toHaveValue("100");
  await expect(page.locator("[data-anteprima-body] .study__hint[aria-live]")).toContainText("--tempo 100");
  await page.fill("#ant-tempo", "abc");
  await page.getByRole("button", { name: "Prova questo tempo" }).click();
  await expect(page.locator("[data-anteprima-body] .study__hint[aria-live]")).toContainText("numero");
});

test("anteprima: il blocco di risposta segue i campi e si copia negli appunti", async ({ page }) => {
  await apri(page);
  await page.fill("#ant-tempo", "66");
  await page.fill("#ant-note", "il basso e' troppo alto");
  await page.selectOption("#ant-an-0", "vera");
  const uscita = page.locator("#ant-uscita");
  await expect(uscita).toHaveValue(/Tempo deciso: 66/);
  await expect(uscita).toHaveValue(/Osservazioni: il basso e' troppo alto/);
  await expect(uscita).toHaveValue(/Segnalazioni confermate \(battute\): 3/);
  await page.getByRole("button", { name: "Copia la risposta" }).click();
  await expect(page.locator(".anteprima__stato")).toHaveText("Copiato.");
  const copiato = await page.evaluate(() => navigator.clipboard.readText());
  expect(copiato).toBe(await uscita.inputValue());
  expect(JSON.parse(copiato.slice(copiato.indexOf("{"))).segnalazioni_vere).toEqual(["3"]);
  await page.getByRole("button", { name: "Copia il testo per Gemini" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(await page.locator("#ant-prompt").inputValue());
});

test("anteprima: accessibilita' del pannello (axe, WCAG 2.2 AA)", async ({ page }) => {
  await apri(page);
  await page.addScriptTag({ content: AXE });
  const violazioni = await page.evaluate(async () => {
    const r = await window.axe.run(document.querySelector("[data-anteprima]"), { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa", "best-practice"] } });
    return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`);
  });
  expect(violazioni).toEqual([]);
});
