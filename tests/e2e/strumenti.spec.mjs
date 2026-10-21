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

/** Fa partire e ferma il contesto una volta: nei primi istanti l'orologio d'uscita del browser non e' ancora stabile. */
async function riscalda(page) {
  await page.click("[data-play]");
  await page.waitForFunction(() => window.__study.engine.ctx.currentTime > 0.8, null, { timeout: 10_000 });
  await page.click("[data-play]");
  await page.waitForFunction(() => !window.__study.engine.playing);
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
    e.midiDelay.connect(spia); // gli strumenti hanno un bus proprio, in uscita diretta
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
    for (const m of r.menu) { expect(m.opzioni).toBe(7); // «Cantato» + 6 strumenti
     expect(m.valore).toBe("pianoforte"); }
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

  test("tornare a «Cantato» ripristina gli stem e i menu mostrano «Cantato»", async ({ page }) => {
    await apriPlayer(page);
    await passaAStrumenti(page);
    await page.check('[data-sound-mode][value="audio"]');
    await page.waitForFunction(() => window.__study.engine.mode === "audio");
    const valori = await page.$$eval("[data-instr]", (l) => l.map((s) => s.value));
    expect(valori).toEqual(["cantato", "cantato", "cantato", "cantato"]);
  });

  test("scegliere uno strumento per una sola voce mescola cantato e strumento; i due pulsanti non ne scelgono nessuno", async ({ page }) => {
    const errori = raccogliErrori(page);
    await apriPlayer(page);
    await page.waitForSelector("[data-sound]:not([hidden])");
    await page.selectOption('[data-instr="soprano"]', "pianoforte");
    await page.waitForFunction(() => window.__study.engine.mode === "mixed", null, { timeout: 30_000 });
    const r = await page.evaluate(() => ({
      modi: Object.fromEntries([...window.__study.engine.tracks].map(([k, t]) => [k, t.mode])),
      radio: [...document.querySelectorAll("[data-sound-mode]")].map((x) => x.checked),
      menu: [...document.querySelectorAll("[data-instr]")].map((x) => x.value),
    }));
    expect(r.modi).toEqual({ soprano: "midi", alto: "audio", tenore: "audio", basso: "audio" });
    expect(r.radio).toEqual([false, false]);
    expect(r.menu).toEqual(["pianoforte", "cantato", "cantato", "cantato"]);
    // la voce tornata al canto riporta tutto a «Cantato»
    await page.selectOption('[data-instr="soprano"]', "cantato");
    await page.waitForFunction(() => window.__study.engine.mode === "audio");
    expect(errori).toEqual([]);
  });
});

for (const { pct, da } of [{ pct: 100, da: 1 }, { pct: 75, da: 1 }, { pct: 50, da: 2 }]) {
  test(`strumenti: evidenziazione contro attacco udibile a ${pct}%`, async ({ page }) => {
    await apriPlayer(page);
    await passaAStrumenti(page);
    await riscalda(page);
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

// Mix: soprano da strumento, le altre voci da stem. Le note passano dal bus a parte (niente stretcher) con un ritardo pari
// alla latenza dello stretcher: attacco dello strumento e clic dello stem devono uscire insieme, anche rallentando.
for (const pct of [100, 75, 50]) {
  test(`mix cantato + strumento: stem e strumento escono insieme a ${pct}%`, async ({ page }) => {
    await apriPlayer(page);
    await page.waitForSelector("[data-sound]:not([hidden])");
    await page.selectOption('[data-instr="soprano"]', "pianoforte");
    await page.waitForFunction(() => window.__study.engine.mode === "mixed", null, { timeout: 30_000 });
    await page.evaluate(async () => {
      const e = window.__study.engine;
      const codice = (nome, soglia) => `
        class ${nome} extends AudioWorkletProcessor {
          constructor() { super(); this.quieto = 1e9; }
          process(inputs) {
            const ch = inputs[0] && inputs[0][0];
            if (ch) for (let i = 0; i < ch.length; i++) {
              const a = Math.abs(ch[i]);
              if (a > ${soglia}) { if (this.quieto > 0.5 * sampleRate) this.port.postMessage(currentFrame + i); this.quieto = 0; }
              else this.quieto++;
            }
            return true;
          }
        }
        registerProcessor("${nome.toLowerCase()}", ${nome});`;
      for (const [nome, soglia] of [["SpiaStem", 0.1], ["SpiaNote", 0.05]]) {
        await e.ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([codice(nome, soglia)], { type: "text/javascript" })));
      }
      const mk = (nome, chiave, daNodi) => {
        const n = new AudioWorkletNode(e.ctx, nome.toLowerCase(), { numberOfInputs: 1, numberOfOutputs: 1 });
        window[chiave] = [];
        n.port.onmessage = (ev) => window[chiave].push(ev.data / e.ctx.sampleRate);
        n.connect(e.ctx.destination);
        for (const d of daNodi) d.connect(n);
      };
      // stem: bus diretto e uscita dello stretcher; strumenti: dopo il ritardo di compensazione
      mk("SpiaStem", "__stem", [e.dry, e.wet]);
      mk("SpiaNote", "__note", [e.midiDelay]);
    });
    await page.evaluate(({ pct, t }) => {
      const sl = document.querySelector("[data-speed]");
      sl.value = pct;
      sl.dispatchEvent(new Event("input", { bubbles: true }));
      window.__study.engine.seek(t);
    }, { pct, t: SYNC.battute[1].t - 0.3 });
    await page.waitForTimeout(300);
    await page.evaluate(() => { window.__stem.length = 0; window.__note.length = 0; });
    await page.click("[data-play]");
    const n = SYNC.battute.length - 1;
    await page.waitForFunction((n) => window.__stem.length >= n && window.__note.length >= n, n, { timeout: 60_000 });
    const r = await page.evaluate(() => ({ stem: window.__stem.slice(0, 4), note: window.__note.slice(0, 4) }));
    const diff = r.stem.map((t, i) => (t - r.note[i]) * 1000);
    console.log(`mix ${pct}%: stem-strumento = [${diff.map((x) => x.toFixed(0)).join(", ")}] ms`);
    for (const d of diff) expect(Math.abs(d), `scarto ${d.toFixed(1)} ms`).toBeLessThanOrEqual(35);
  });
}

test("brano in lavorazione (senza_audio): niente richieste di audio, si suonano subito gli strumenti, con avviso", async ({ page, context }) => {
  await context.unrouteAll();
  const richieste = [];
  await context.route((u) => u.host === HOST_AUDIO || /(^|\.)workers\.dev$/.test(u.hostname), (route) => { richieste.push(route.request().url()); return route.fulfill({ status: 404, body: "no" }); });
  const errori = raccogliErrori(page);
  await page.goto("/player/_prova-senza-audio/?debug");
  await page.waitForFunction(() => window.__study?.engine.mode === "midi" && !document.querySelector("[data-play]").disabled, null, { timeout: 90_000 });
  const r = await page.evaluate(() => ({
    stato: document.querySelector("[data-status]").textContent,
    audioDisattivato: document.querySelector('[data-sound-mode][value="audio"]').disabled,
    errore: !document.querySelector("[data-error]").hidden,
    opzioni: [...document.querySelector('[data-instr="soprano"]').options].map((o) => o.value),
  }));
  expect(richieste, "nessuna richiesta di stem").toEqual([]);
  expect(r.errore).toBe(false);
  expect(r.audioDisattivato).toBe(true);
  expect(r.opzioni).not.toContain("cantato");
  expect(r.stato).toMatch(/non .* disponibile|not available yet/i);
  await page.click("[data-play]");
  await page.waitForFunction(() => window.__study.engine.position() > 1, null, { timeout: 15_000 });
  expect(errori).toEqual([]);
});
