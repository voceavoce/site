// «Testo dello spartito» (M12, docs/midi-player.md §11): al posto delle parole il nome delle note, Do Re Mi o C D E.
// Brano di prova _prova: 4 voci, 24 sillabe. Si legge il testo che Verovio ha davvero disegnato nell'SVG.
import fs from "node:fs";
import path from "node:path";
import { expect } from "@playwright/test";
import { test, apriPlayer, intercettaAudio, raccogliErrori, RADICE } from "./helpers.mjs";

const AXE = fs.readFileSync(path.join(RADICE, "node_modules/axe-core/axe.min.js"), "utf8");
const NOME_DO = /^(Do|Re|Mi|Fa|Sol|La|Si)[♯♭]*(\/(Do|Re|Mi|Fa|Sol|La|Si)[♯♭]*)*$/;
const NOME_ABC = /^[A-G][♯♭]*(\/[A-G][♯♭]*)*$/;

test.beforeEach(async ({ context }) => {
  await intercettaAudio(context);
});

/** Il testo di ogni sillaba disegnata sotto le note. */
const sillabe = (page) => page.$$eval("[data-score] svg g.syl", (l) => l.map((g) => g.textContent.replace(/\s+/g, " ").trim()).filter(Boolean));

async function scegli(page, valore) {
  await page.waitForSelector("[data-sound]:not([hidden])", { timeout: 20_000 });
  await page.check(`[data-score-text] input[value="${valore}"]`);
  await page.waitForFunction((v) => window.__study.score.testo === v, valore, { timeout: 10_000 });
}

test("testo dello spartito: parole, Do Re Mi, C D E e di nuovo parole", async ({ page }) => {
  const errori = raccogliErrori(page);
  await apriPlayer(page);
  const parole = await sillabe(page);
  expect(parole.length).toBeGreaterThan(10);
  expect(parole.some((t) => NOME_DO.test(t) || NOME_ABC.test(t)), "all'inizio ci sono le parole").toBe(false);

  await scegli(page, "do");
  const doRe = await sillabe(page);
  expect(doRe.length).toBeGreaterThan(10);
  for (const t of doRe) expect(t, `nome «${t}»`).toMatch(NOME_DO);

  await scegli(page, "abc");
  const abc = await sillabe(page);
  for (const t of abc) expect(t, `nome «${t}»`).toMatch(NOME_ABC);

  await scegli(page, "parole");
  expect(await sillabe(page)).toEqual(parole);
  expect(errori).toEqual([]);
});

test("testo dello spartito: la scelta resta dopo il ricaricamento", async ({ page }) => {
  await apriPlayer(page);
  await scegli(page, "do");
  await page.reload();
  await page.waitForFunction(() => window.__study?.score, null, { timeout: 90_000 });
  await expect(page.locator('[data-score-text] input[value="do"]')).toBeChecked();
  expect(await page.evaluate(() => window.__study.score.testo)).toBe("do");
  for (const t of await sillabe(page)) expect(t).toMatch(NOME_DO);
});

test("testo dello spartito: cambiato mentre suona, battuta evidenziata e cursore restano", async ({ page }) => {
  await apriPlayer(page);
  await page.waitForSelector("[data-sound]:not([hidden])", { timeout: 20_000 });
  await page.click("[data-play]");
  await page.waitForFunction(() => window.__study.engine.ctx.currentTime > 1.2, null, { timeout: 10_000 });
  await scegli(page, "abc");
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => window.__study.engine.playing)).toBe(true);
  await expect(page.locator("[data-score] g.measure.is-current")).toHaveCount(1);
  await expect(page.locator("[data-score] .score-cursor")).toBeVisible();
  await page.click("[data-play]");
});

test("testo dello spartito: accessibilita' del gruppo (axe, WCAG 2.2 AA)", async ({ page }) => {
  await apriPlayer(page);
  await page.waitForSelector("[data-sound]:not([hidden])");
  await page.addScriptTag({ content: AXE });
  const violazioni = await page.evaluate(async () => {
    const r = await window.axe.run(document.querySelector("[data-score-text]"), { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa", "best-practice"] } });
    return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`);
  });
  expect(violazioni).toEqual([]);
  expect(await page.locator("[data-score-text] legend").textContent()).toMatch(/\S/);
  expect(await page.locator("[data-score-text] input").count()).toBe(3);
});

// Coloriture barocche (For unto us a child is born, Haendel): semicrome in fila su un rigo, accompagnamento d'organo.
// I nomi non devono toccarsi (tolleranza 3 px: i riquadri di due righe adiacenti si sfiorano di 1-2 px senza vedersi) e
// l'organo non deve avere nomi (solo le voci cantate).
for (const [larghezza, altezza] of [[1280, 800], [375, 800]]) {
  test(`testo dello spartito: coloriture (For unto us) senza nomi sovrapposti a ${larghezza}px, organo senza nomi`, async ({ page }) => {
    await page.setViewportSize({ width: larghezza, height: altezza });
    await page.goto("/player/for-unto-us-a-child-is-born-handel/?debug");
    await page.waitForFunction(() => window.__study?.score && document.querySelector("[data-score] g.measure"), null, { timeout: 90_000 });
    const parole = await page.$$eval("[data-score] svg g.syl", (l) => l.length);
    await page.evaluate(() => window.__study.score.setTesto("do"));
    await page.waitForFunction(() => window.__study.score.testo === "do");
    const r = await page.evaluate(() => {
      let sovrapposti = 0, nomi = 0;
      for (const sys of document.querySelectorAll("[data-score] g.system")) {
        const q = [...sys.querySelectorAll("g.syl")].map((g) => g.getBoundingClientRect()).filter((b) => b.right > b.left);
        nomi += q.length;
        for (let i = 0; i < q.length; i++) for (let j = i + 1; j < q.length; j++) {
          const a = q[i], c = q[j];
          if (a.left < c.right - 3 && c.left < a.right - 3 && a.top < c.bottom - 3 && c.top < a.bottom - 3) sovrapposti++;
        }
      }
      // nomi sotto l'ultimo rigo di ogni sistema (l'organo e' l'ultima parte): non ce ne devono essere
      const sottoOrgano = [...document.querySelectorAll("[data-score] g.system")].filter((sys) => {
        const righi = [...sys.querySelector("g.measure").querySelectorAll(":scope > g.staff")];
        if (righi.length < 2) return false;
        const fondo = Math.max(...righi.map((s) => s.getBoundingClientRect().bottom));
        return [...sys.querySelectorAll("g.syl")].some((g) => g.getBoundingClientRect().top > fondo - 4);
      }).length;
      return { sovrapposti, nomi, sottoOrgano };
    });
    expect(r.nomi).toBeGreaterThan(parole * 0.9);
    expect(r.sovrapposti, "nomi che si sovrappongono").toBe(0);
    expect(r.sottoOrgano, "sistemi con nomi sotto il pianoforte/organo").toBe(0);
  });
}
