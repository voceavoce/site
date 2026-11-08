// S1 (T-1011): il player sugli STEM VERI. Gli altri spec usano audio sintetici; qui si serve l'audio di produzione da una
// cartella locale e si controlla quello che i test sintetici non possono: durata reale, cursore contro sync.json con voci vere,
// e soprattutto il SEGNALE in uscita di Muta e Solo (non solo il guadagno del motore) e la velocita' ridotta.
//
// Si attiva solo con AUDIO_SITO=<cartella con <slug>/v1/<voce>.opus>, per esempio C:\source\repos\audio-sito:
// senza (CI, altre macchine) tutti i test saltano. Nessuna scrittura, nessuna rete: l'audio e' letto da disco.
import fs from "node:fs";
import path from "node:path";
import { expect } from "@playwright/test";
import { test, raccogliErrori, RADICE, HOST_AUDIO } from "./helpers.mjs";

const AUDIO = process.env.AUDIO_SITO || "";
const BRANI = ["agnus-dei-josquin", "a-d-una-fresca-riva-marenzio"]; // 3 voci distinte / 3 voci con soprano doppio, 43 s e 68 s
const TOLLERANZA_S = 0.25; // voci vere, headless: un po' piu' larga del brano di prova (0,15)
const SOGLIA_SILENZIO = 1e-4; // RMS sotto cui una voce e' muta
const SOGLIA_SEGNALE = 2e-3; // RMS sopra cui una voce suona

const TIPI = { ".opus": "audio/ogg; codecs=opus", ".mp3": "audio/mpeg" };
const CORS = { "access-control-allow-origin": "*", "access-control-expose-headers": "Content-Length, Content-Range" };

test.skip(!AUDIO || !fs.existsSync(AUDIO), "AUDIO_SITO non impostata o cartella assente: prova sugli stem veri saltata");

const dati = (slug) => ({
  sync: JSON.parse(fs.readFileSync(path.join(RADICE, "content/player", slug, "sync.json"), "utf8")),
  manifest: JSON.parse(fs.readFileSync(path.join(RADICE, "content/player", slug, "manifest.json"), "utf8")),
});

/** Serve dal disco i file audio che il player chiede alla base di sviluppo (localhost:8787), con Range. */
async function serviAudioVero(context) {
  await context.route((u) => u.host === HOST_AUDIO, async (route) => {
    const req = route.request();
    const rel = decodeURIComponent(new URL(req.url()).pathname).replace(/^\/+/, "");
    const file = path.resolve(AUDIO, rel);
    if (!file.startsWith(path.resolve(AUDIO) + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      return route.fulfill({ status: 404, headers: CORS, body: "no" });
    }
    const corpo = fs.readFileSync(file);
    const tipo = TIPI[path.extname(file)] ?? "application/octet-stream";
    const m = /^bytes=(\d+)-(\d*)$/.exec(req.headers().range ?? "");
    if (m) {
      const a = Number(m[1]), b = m[2] ? Math.min(Number(m[2]), corpo.length - 1) : corpo.length - 1;
      return route.fulfill({ status: 206, headers: { ...CORS, "content-type": tipo, "content-range": `bytes ${a}-${b}/${corpo.length}` }, body: corpo.subarray(a, b + 1) });
    }
    return route.fulfill({ status: 200, headers: { ...CORS, "content-type": tipo }, body: corpo });
  });
}

async function apri(page, slug, n) {
  await page.goto(`/player/${slug}/?debug`);
  await page.waitForFunction((k) => window.__study?.engine.tracks.size === k && window.__study.score, n, { timeout: 120_000 });
  await page.waitForFunction(() => !document.querySelector("[data-play]").disabled, null, { timeout: 60_000 });
  // una presa d'ascolto per ogni voce, DOPO il suo guadagno (Muta/Solo agiscono sul guadagno): misura il segnale che esce davvero
  await page.evaluate(() => {
    const e = window.__study.engine;
    window.__tap = {};
    for (const [k, t] of e.tracks) {
      const an = e.ctx.createAnalyser();
      an.fftSize = 2048;
      t.gain.connect(an);
      window.__tap[k] = an;
    }
  });
}

/** Per `ms` millisecondi, ogni 40 ms, l'RMS massimo visto su ogni voce. */
async function misura(page, ms) {
  return page.evaluate(async (durata) => {
    const buf = new Float32Array(2048);
    const max = Object.fromEntries(Object.keys(window.__tap).map((k) => [k, 0]));
    const fine = performance.now() + durata;
    while (performance.now() < fine) {
      for (const [k, an] of Object.entries(window.__tap)) {
        an.getFloatTimeDomainData(buf);
        let s = 0;
        for (const v of buf) s += v * v;
        max[k] = Math.max(max[k], Math.sqrt(s / buf.length));
      }
      await new Promise((r) => setTimeout(r, 40));
    }
    return max;
  }, ms);
}

/** Posiziona il motore poco prima della battuta `m` e avvia la riproduzione. */
async function suonaDa(page, sync, m) {
  await page.evaluate((t) => window.__study.engine.seek(t), sync.battute[m].t - 0.2);
  await page.click("[data-play]");
  await expect(page.locator("[data-play]")).toHaveAttribute("aria-pressed", "true");
}

for (const slug of BRANI) {
  const { sync, manifest } = dati(slug);
  const chiavi = manifest.tracce.map((t) => t.chiave);
  const n = chiavi.length;

  test.describe(slug, () => {
    test.beforeEach(async ({ context }) => { await serviAudioVero(context); });

    test("stem veri: tutte le voci decodificate, durata coerente con sync.json, nessun errore", async ({ page }) => {
      const errori = raccogliErrori(page);
      await apri(page, slug, n);
      const r = await page.evaluate(() => ({
        durate: Object.fromEntries([...window.__study.engine.tracks].map(([k, t]) => [k, t.buffer.duration])),
        motore: window.__study.engine.duration,
      }));
      expect(Object.keys(r.durate).sort()).toEqual([...chiavi].sort());
      // Misurato l'8/11/2026: gli stem veri finiscono 1,1 s (Agnus Dei) e 1,5 s (Marenzio) PRIMA di `sync.fine` (il silenzio finale e'
      // tagliato; il cursore resta allineato, vedi il test sul cursore). Cio' che conta: l'audio copre l'inizio dell'ultima battuta,
      // non e' di piu' di 3 s diverso da sync.json, e tutte le voci hanno la stessa lunghezza (se no non sono allineate fra loro).
      const durate = Object.values(r.durate);
      const inizioUltima = sync.battute[sync.battute.length - 1].t;
      for (const [k, d] of Object.entries(r.durate)) {
        expect(d, `durata di ${k}`).toBeGreaterThan(inizioUltima);
        expect(Math.abs(d - sync.fine), `durata di ${k} contro sync.json`).toBeLessThan(3.0);
      }
      expect(Math.max(...durate) - Math.min(...durate), `scarto fra le voci: ${JSON.stringify(r.durate)}`).toBeLessThan(0.25);
      expect(Math.abs(r.motore - Math.max(...durate))).toBeLessThan(0.05);
      await expect(page.locator("[data-error]")).toBeHidden();
      expect(errori).toEqual([]);
    });

    test("cursore: la battuta evidenziata segue sync.json con le voci vere", async ({ page }) => {
      await apri(page, slug, n);
      await page.evaluate(() => {
        const c = document.querySelector("[data-score]");
        const e = window.__study.engine;
        window.__hl = [];
        new MutationObserver(() => {
          const i = [...c.querySelectorAll("g.measure")].findIndex((x) => x.classList.contains("is-current"));
          const ultimo = window.__hl.at(-1);
          if (i >= 0 && (!ultimo || ultimo.m !== i)) window.__hl.push({ m: i, pos: e.audiblePosition() });
        }).observe(c, { attributes: true, subtree: true, attributeFilter: ["class"] });
      });
      const da = 2, fino = Math.min(da + 6, sync.battute.length - 1);
      await suonaDa(page, sync, da);
      await page.waitForFunction((k) => window.__hl.some((h) => h.m === k), fino, { timeout: 60_000 });
      const hl = (await page.evaluate(() => window.__hl)).filter((h) => h.m >= da && h.m <= fino);
      expect(hl.map((h) => h.m)).toEqual(Array.from({ length: fino - da + 1 }, (_, k) => da + k));
      for (const h of hl) expect(Math.abs(h.pos - sync.battute[h.m].t), `battuta ${h.m}`).toBeLessThan(TOLLERANZA_S);
    });

    test("segnale: le voci suonano davvero, e Muta zittisce SOLO quella voce nell'uscita", async ({ page }) => {
      await apri(page, slug, n);
      await suonaDa(page, sync, 3);
      const prima = await misura(page, 3000);
      const suonano = Object.entries(prima).filter(([, v]) => v > SOGLIA_SEGNALE).map(([k]) => k);
      expect(suonano.length, `voci udibili: ${JSON.stringify(prima)}`).toBeGreaterThanOrEqual(2);
      const bersaglio = suonano[0];
      await page.click(`[data-track=${bersaglio}] [data-mute]`);
      await page.waitForTimeout(400); // la rampa del guadagno
      const dopo = await misura(page, 2500);
      expect(dopo[bersaglio], `${bersaglio} dopo Muta: ${JSON.stringify(dopo)}`).toBeLessThan(SOGLIA_SILENZIO);
      const altre = suonano.filter((k) => k !== bersaglio);
      expect(Math.max(...altre.map((k) => dopo[k])), "le altre voci continuano a suonare").toBeGreaterThan(SOGLIA_SEGNALE / 2);
      await page.click(`[data-track=${bersaglio}] [data-mute]`);
      await page.waitForTimeout(400);
      const ripresa = await misura(page, 2500);
      expect(ripresa[bersaglio], `${bersaglio} dopo aver tolto Muta`).toBeGreaterThan(SOGLIA_SILENZIO);
    });

    test("segnale: Solo lascia nell'uscita soltanto la voce scelta", async ({ page }) => {
      await apri(page, slug, n);
      await suonaDa(page, sync, 3);
      const prima = await misura(page, 3000);
      const suonano = Object.entries(prima).filter(([, v]) => v > SOGLIA_SEGNALE).map(([k]) => k);
      expect(suonano.length, JSON.stringify(prima)).toBeGreaterThanOrEqual(2);
      const scelta = suonano[suonano.length - 1];
      await page.click(`[data-track=${scelta}] [data-solo]`);
      await page.waitForTimeout(400);
      const dopo = await misura(page, 2500);
      for (const k of chiavi.filter((x) => x !== scelta)) expect(dopo[k], `${k} con Solo su ${scelta}: ${JSON.stringify(dopo)}`).toBeLessThan(SOGLIA_SILENZIO);
      expect(dopo[scelta], `${scelta} con Solo`).toBeGreaterThan(SOGLIA_SEGNALE / 2);
    });

    test("velocita' ridotta (75%): la posizione avanza al ritmo giusto e il segnale c'e' senza esplodere", async ({ page }) => {
      const errori = raccogliErrori(page);
      await apri(page, slug, n);
      await page.evaluate(() => {
        const s = document.querySelector("[data-speed]");
        s.value = 75;
        s.dispatchEvent(new Event("input", { bubbles: true }));
      });
      expect(await page.evaluate(() => window.__study.engine.rate)).toBeCloseTo(0.75, 5);
      await suonaDa(page, sync, 3);
      const p0 = await page.evaluate(() => ({ pos: window.__study.engine.audiblePosition(), t: performance.now() }));
      const livelli = await misura(page, 4000);
      const p1 = await page.evaluate(() => ({ pos: window.__study.engine.audiblePosition(), t: performance.now() }));
      const avanzato = p1.pos - p0.pos, trascorso = (p1.t - p0.t) / 1000;
      expect(avanzato / trascorso, `rapporto posizione/tempo: ${avanzato.toFixed(2)} s su ${trascorso.toFixed(2)} s`).toBeGreaterThan(0.75 * 0.85);
      expect(avanzato / trascorso).toBeLessThan(0.75 * 1.15);
      const picco = Math.max(...Object.values(livelli));
      expect(picco, JSON.stringify(livelli)).toBeGreaterThan(SOGLIA_SEGNALE);
      expect(picco, "nessun clipping o esplosione dello stretcher").toBeLessThan(1.0);
      expect(errori).toEqual([]);
    });
  });
}
