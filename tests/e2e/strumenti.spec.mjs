// Modalita' strumenti (docs/midi-player.md): note.json + campioni, sincronizzate al cursore. Brano di prova _prova:
// una nota per voce all'inizio di ogni battuta di sync.json. I campioni sono quelli veri (assets/strumenti, in git);
// gli stem sono sintetici (helpers.mjs). La sincronia si misura come in sync-audio.spec.mjs: una spia in ascolto sul
// mix finale rileva l'inizio di ogni nota sul frame esatto e lo si confronta con l'evidenziazione della battuta.
import fs from "node:fs";
import path from "node:path";
import { expect } from "@playwright/test";
import { test, apriPlayer, avviaSito, leggiCache, intercettaAudio, raccogliErrori, SYNC, HOST_AUDIO, RADICE } from "./helpers.mjs";

const AXE = fs.readFileSync(path.join(RADICE, "node_modules/axe-core/axe.min.js"), "utf8");

const MEDIANA_MAX_MS = 45;
const MASSIMO_MAX_MS = 90;

test.beforeEach(async ({ context }) => {
  await intercettaAudio(context);
});

const mediana = (a) => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };

async function passaAStrumenti(page) {
  await page.waitForSelector("[data-sound]:not([hidden])", { timeout: 20_000 });
  await page.check('[data-sound-mode][value="midi"]');
  await page.waitForFunction(() => window.__study.engine.mode === "midi", null, { timeout: 30_000 });
}

/** Spia sul mix finale (rileva l'inizio di ogni nota) e osservatore delle evidenziazioni. */
async function installaStrumenti(page) {
  await page.evaluate(async () => {
    const e = window.__study.engine;
    const codice = `
      class Spia extends AudioWorkletProcessor {
        constructor() { super(); this.quieto = 1e9; }
        process(inputs) {
          const ch = inputs[0] && inputs[0][0];
          if (ch) for (let i = 0; i < ch.length; i++) {
            const a = Math.abs(ch[i]);
            if (a > 0.08) { if (this.quieto > 0.5 * sampleRate) this.port.postMessage(currentFrame + i); this.quieto = 0; }
            else this.quieto++;
          }
          return true;
        }
      }
      registerProcessor("spia-note", Spia);`;
    await e.ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([codice], { type: "text/javascript" })));
    const spia = new AudioWorkletNode(e.ctx, "spia-note", { numberOfInputs: 1, numberOfOutputs: 1 });
    window.__clic = [];
    spia.port.onmessage = (ev) => {
      const ts = e.ctx.getOutputTimestamp();
      window.__clic.push({ ctx: ev.data / e.ctx.sampleRate, ancora: { c: ts.contextTime, p: ts.performanceTime } });
    };
    spia.connect(e.ctx.destination);
    e.dry.connect(spia);
    e.wet?.connect(spia);
    const c = document.querySelector("[data-score]");
    window.__hl = [];
    new MutationObserver(() => {
      const i = [...c.querySelectorAll("g.measure")].findIndex((x) => x.classList.contains("is-current"));
      const ultimo = window.__hl.at(-1);
      if (i >= 0 && (!ultimo || ultimo.m !== i)) window.__hl.push({ m: i, perf: performance.now() });
    }).observe(c, { attributes: true, subtree: true, attributeFilter: ["class"] });
  });
}

test.describe("pannello e scelta degli strumenti", () => {
  test("il pannello compare, i menu hanno i 6 strumenti e i predefiniti per il coro sono il pianoforte", async ({ page }) => {
    const errori = raccogliErrori(page);
    await apriPlayer(page);
    await passaAStrumenti(page);
    const r = await page.evaluate(() => ({
      menu: [...document.querySelectorAll("[data-instr]")].map((s) => ({ chiave: s.dataset.instr, valore: s.value, opzioni: s.options.length })),
      modo: window.__study.engine.mode,
      sel: Object.fromEntries(window.__study.engine.synth.strum),
    }));
    expect(r.menu).toHaveLength(4);
    for (const m of r.menu) { expect(m.opzioni).toBe(6); expect(m.valore).toBe("pianoforte"); }
    expect(r.sel.soprano).toBe("pianoforte");
    expect(await page.locator("[data-sound-instr]").isVisible()).toBe(true);
    expect(errori).toEqual([]);
  });

  test("cambiare strumento a una voce vale subito e si ricorda nel browser", async ({ page }) => {
    const errori = raccogliErrori(page);
    await apriPlayer(page);
    await passaAStrumenti(page);
    await page.selectOption('[data-instr="soprano"]', "organo");
    await page.waitForFunction(() => window.__study.engine.synth.campioni.get("organo"), null, { timeout: 30_000 });
    const r = await page.evaluate(() => ({ s: window.__study.engine.synth.strum.get("soprano"), a: window.__study.engine.synth.strum.get("alto"), pref: localStorage.getItem("va-strumenti") }));
    expect(r.s).toBe("organo");
    expect(r.a).toBe("pianoforte");
    expect(JSON.parse(r.pref).soprano).toBe("organo");
    // alla riapertura la preferenza e' usata
    await page.reload();
    await apriPlayer(page);
    await passaAStrumenti(page);
    expect(await page.evaluate(() => window.__study.engine.synth.strum.get("soprano"))).toBe("organo");
    expect(errori).toEqual([]);
  });

  test("tornare a «Cantato» ripristina gli stem e nascosti i menu", async ({ page }) => {
    await apriPlayer(page);
    await passaAStrumenti(page);
    await page.check('[data-sound-mode][value="audio"]');
    await page.waitForFunction(() => window.__study.engine.mode === "audio");
    expect(await page.locator("[data-sound-instr]").isVisible()).toBe(false);
  });
});

for (const { pct, da } of [{ pct: 100, da: 1 }, { pct: 75, da: 1 }, { pct: 50, da: 2 }]) {
  test(`strumenti: evidenziazione contro attacco udibile a ${pct}%`, async ({ page }) => {
    await apriPlayer(page);
    await passaAStrumenti(page);
    await installaStrumenti(page);
    await page.evaluate(({ pct, t }) => {
      const s = document.querySelector("[data-speed]");
      s.value = pct;
      s.dispatchEvent(new Event("input", { bubbles: true }));
      window.__study.engine.seek(t);
    }, { pct, t: SYNC.battute[da].t - 0.3 });
    await page.waitForTimeout(300);
    await page.evaluate(() => { window.__hl.length = 0; window.__clic.length = 0; });
    await page.click("[data-play]");
    const ultima = SYNC.battute.length - 1;
    await page.waitForFunction((n) => window.__hl.some((h) => h.m === n), ultima, { timeout: 60_000 });
    await page.waitForFunction((n) => window.__clic.length >= n, ultima - da + 1, { timeout: 15_000 });
    const r = await page.evaluate(() => ({ hl: window.__hl, clic: window.__clic }));
    const scarto = mediana(r.clic.map((c) => c.ancora.p - c.ancora.c * 1000));
    const udibile = r.clic.map((c) => c.ctx * 1000 + scarto);
    expect(r.clic.length, "un attacco per battuta").toBe(ultima - da + 1);
    const hl = r.hl.filter((h) => h.m >= da);
    expect(hl.map((h) => h.m)).toEqual(Array.from({ length: ultima - da + 1 }, (_, k) => da + k));
    const err = hl.map((h, k) => h.perf - udibile[k]);
    const med = mediana(err), mass = Math.max(...err.map(Math.abs));
    console.log(`strumenti ${pct}%: n=${err.length} mediana=${med.toFixed(1)} ms max|e|=${mass.toFixed(1)} ms [${err.map((x) => x.toFixed(0)).join(", ")}]`);
    expect(Math.abs(med), "errore mediano").toBeLessThanOrEqual(MEDIANA_MAX_MS);
    expect(mass, "errore massimo").toBeLessThanOrEqual(MASSIMO_MAX_MS);
  });
}

test("strumenti: il loop ripete il passaggio senza vuoti e la pausa spegne le note", async ({ page }) => {
  await apriPlayer(page);
  await passaAStrumenti(page);
  await installaStrumenti(page);
  const a = SYNC.battute[1].t, b = SYNC.battute[2].t;
  await page.evaluate(({ a, b }) => { const e = window.__study.engine; e.setLoop({ start: a, end: b }); e.seek(a - 0.2); }, { a, b });
  await page.waitForTimeout(200);
  await page.evaluate(() => { window.__clic.length = 0; });
  await page.click("[data-play]");
  await page.waitForFunction(() => window.__clic.length >= 3, null, { timeout: 20_000 });
  const clic = await page.evaluate(() => window.__clic.map((c) => c.ctx));
  const giri = clic.slice(1).map((t, i) => t - clic[i]);
  for (const g of giri) expect(Math.abs(g - (b - a)), `intervallo fra i giri ${g}`).toBeLessThan(0.08);
  const pos = await page.evaluate(() => window.__study.engine.position());
  expect(pos).toBeGreaterThanOrEqual(a - 0.1);
  expect(pos).toBeLessThanOrEqual(b + 0.1);
  await page.click("[data-play]"); // pausa
  await page.waitForFunction(() => window.__study.engine.synth.attive.size === 0, null, { timeout: 3_000 });
});

test("strumenti: la velocita' cambiata mentre suona non perde ne' raddoppia le note", async ({ page }) => {
  await apriPlayer(page);
  await passaAStrumenti(page);
  await installaStrumenti(page);
  await page.evaluate((t) => window.__study.engine.seek(t), SYNC.battute[0].t - 0.3);
  await page.waitForTimeout(200);
  await page.evaluate(() => { window.__clic.length = 0; });
  await page.click("[data-play]");
  await page.waitForFunction(() => window.__clic.length >= 1, null, { timeout: 10_000 });
  await page.evaluate(() => { const s = document.querySelector("[data-speed]"); s.value = 50; s.dispatchEvent(new Event("input", { bubbles: true })); });
  await page.waitForFunction(() => window.__clic.length >= 3, null, { timeout: 30_000 });
  const clic = await page.evaluate(() => window.__clic.map((c) => c.ctx));
  // dalla seconda nota in poi, a meta' velocita': intervallo ~ 2 x la durata di una battuta
  const att = clic[2] - clic[1];
  expect(att).toBeGreaterThan(2 * (SYNC.battute[2].t - SYNC.battute[1].t) - 0.2);
  expect(att).toBeLessThan(2 * (SYNC.battute[2].t - SYNC.battute[1].t) + 0.2);
});

test("fallback: se gli stem non si scaricano si suonano gli strumenti, con avviso", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  await context.route((u) => u.host === HOST_AUDIO || /(^|\.)workers\.dev$/.test(u.hostname), (route) => route.fulfill({ status: 404, headers: { "access-control-allow-origin": "*" }, body: "no" }));
  await page.goto("/player/_prova/?debug");
  await page.waitForFunction(() => window.__study?.engine.mode === "midi" && !document.querySelector("[data-play]").disabled, null, { timeout: 90_000 });
  const r = await page.evaluate(() => ({
    stato: document.querySelector("[data-status]").textContent,
    errore: !document.querySelector("[data-error]").hidden,
    audioDisattivato: document.querySelector('[data-sound-mode][value="audio"]').disabled,
    pannello: !document.querySelector("[data-sound]").hidden,
    durata: window.__study.engine.duration,
  }));
  expect(r.errore).toBe(false);
  expect(r.pannello).toBe(true);
  expect(r.audioDisattivato).toBe(true);
  expect(r.stato).toMatch(/strument|instrument/i);
  expect(r.durata).toBeGreaterThan(10);
  await page.click("[data-play]");
  await page.waitForFunction(() => window.__study.engine.position() > 1, null, { timeout: 15_000 });
  await context.close();
});

test("offline: gli strumenti suonano dalla cache del service worker, anche senza stem e senza rete", async ({ page, context }) => {
  const errori = raccogliErrori(page);
  const sito = await avviaSito();
  try {
    // 1) con la rete: il SW prende il controllo, si passa agli strumenti e i campioni finiscono nella cache
    await page.goto(`${sito.url}/`);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    await apriPlayer(page, `${sito.url}/player/_prova/?debug`);
    await passaAStrumenti(page);
    await expect.poll(async () => Object.values(await leggiCache(page)).flat().some((u) => u.endsWith("/assets/strumenti/pianoforte.mp3")), { timeout: 20_000 }).toBe(true);
    const cache = Object.values(await leggiCache(page)).flat();
    expect(cache.some((u) => u.endsWith("/player-data/_prova/note.json")), "note.json in cache").toBe(true);
    expect(cache.some((u) => /\.(opus|mp3|wav)$/.test(u) && !u.includes("/assets/strumenti/")), "gli stem restano fuori dalla cache").toBe(false);
    // 2) senza rete e senza stem: la pagina si riapre dalla cache e va in modalita' strumenti da sola
    await context.unrouteAll();
    await context.route((u) => u.host === HOST_AUDIO || /(^|\.)workers\.dev$/.test(u.hostname), (route) => route.fulfill({ status: 404, headers: { "access-control-allow-origin": "*" }, body: "no" }));
    await sito.ferma();
    await page.reload();
    await page.waitForFunction(() => window.__study?.engine.mode === "midi" && !document.querySelector("[data-play]").disabled, null, { timeout: 90_000 });
    await page.click("[data-play]");
    await page.waitForFunction(() => window.__study.engine.position() > 1, null, { timeout: 15_000 });
    // le note hanno davvero suonato: qualche voce e' stata creata (i campioni arrivano dalla cache)
    const campioni = await page.evaluate(() => window.__study.engine.synth.campioni.pronti.size);
    expect(campioni).toBeGreaterThan(0);
  } finally {
    await sito.ferma().catch(() => {});
  }
  expect(errori.filter((e) => !/Failed to load resource|net::ERR|StudyError: HTTP 404/.test(e))).toEqual([]);
});

// Accessibilita' del pannello «Suono» (pa11y non lo vede: compare solo ad audio caricato). axe-core su WCAG 2.2 AA,
// in tema chiaro e scuro, con i menu degli strumenti aperti e con gli stati attivati.
for (const tema of ["light", "dark"]) {
  test(`accessibilita' del pannello Suono (axe, WCAG 2.2 AA, tema ${tema})`, async ({ page }) => {
    await apriPlayer(page);
    await page.waitForSelector("[data-sound]:not([hidden])");
    await page.addScriptTag({ content: AXE });
    await page.evaluate((t) => { document.documentElement.dataset.theme = t; }, tema);
    const esegui = () => page.evaluate(async () => {
      const r = await window.axe.run(document.querySelector("[data-sound]"), { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] } });
      if (r.passes.length < 5) return [`axe ha controllato solo ${r.passes.length} regole`];
      return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`);
    });
    expect(await esegui(), "modalita' cantato").toEqual([]);
    await passaAStrumenti(page);
    expect(await esegui(), "modalita' strumenti").toEqual([]);
    // ogni menu ha un nome accessibile con la voce, e i due pulsanti radio sono nello stesso gruppo con legenda
    const nomi = await page.$$eval("[data-instr]", (l) => l.map((s) => s.labels[0]?.textContent.trim()));
    expect(nomi.every((n) => n && n.length > 3)).toBe(true);
    expect(await page.locator('fieldset.sound-pick legend').count()).toBe(1);
  });
}

test("tastiera: il gruppo Cantato/Strumenti si governa con le frecce e il menu con la tastiera", async ({ page }) => {
  await apriPlayer(page);
  await page.waitForSelector("[data-sound]:not([hidden])");
  await page.focus('[data-sound-mode][value="audio"]');
  await page.keyboard.press("ArrowRight");
  await page.waitForFunction(() => window.__study.engine.mode === "midi", null, { timeout: 30_000 });
  await page.focus('[data-instr="soprano"]');
  await page.keyboard.press("ArrowDown");
  const v = await page.$eval('[data-instr="soprano"]', (s) => s.value);
  expect(v).not.toBe("pianoforte");
});
