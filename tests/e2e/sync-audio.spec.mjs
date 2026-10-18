// Sincronia battuta evidenziata <-> clic UDIBILE, misurata sul segnale che esce dal grafo Web Audio, indipendentemente
// da engine.audiblePosition() (che e' il modello da verificare, non lo strumento di misura).
//
// Strumento: un AudioWorklet "spia" collegato SOLO in ascolto alle uscite dei due rami (diretto e stretcher), cioe' al
// mix finale prima del dispositivo. Rileva l'inizio di ogni clic sul frame esatto (currentFrame) dell'orologio
// dell'AudioContext. Il tempo di contesto si converte in tempo di pagina (performance.now) con getOutputTimestamp()
// e il momento in cui il suono esce dall'altoparlante e' quello piu' la latenza d'uscita (outputLatency).
// L'evidenziazione si legge con un MutationObserver sulla partitura (performance.now() nel callback).
// Errore = istante di evidenziazione - istante udibile del clic della stessa battuta (positivo = la battuta si accende DOPO).
import { expect } from "@playwright/test";
import { test, apriPlayer, intercettaAudio, SYNC } from "./helpers.mjs";

// Soglie (ms). Obiettivo di P11: ~ +-25 ms. In headless si aggiungono il fotogramma di rAF (fino a ~17 ms, in media 8),
// il ritardo del main thread e l'incertezza di getOutputTimestamp: mediana <= 40, massimo <= 80 lasciano margine
// contro il rumore ma restano ben sotto l'errore senza compensazione (stretcher 94-133 ms + dispositivo).
const MEDIANA_MAX_MS = 40;
const MASSIMO_MAX_MS = 80;

const PROVE = [
  { pct: 100, da: 1 }, // 1x: ramo diretto
  { pct: 75, da: 1 }, // stretcher
  { pct: 50, da: 2 }, // stretcher, il piu' lento: meno battute per limitare la durata
];

test.beforeEach(async ({ context }) => {
  await intercettaAudio(context);
});

/** Installa nella pagina la spia sul mix finale e l'osservatore delle evidenziazioni. */
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
            if (a > 0.15) { if (this.quieto > 0.12 * sampleRate) this.port.postMessage(currentFrame + i); this.quieto = 0; }
            else this.quieto++;
          }
          return true;
        }
      }
      registerProcessor("spia-clic", Spia);`;
    await e.ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([codice], { type: "text/javascript" })));
    const spia = new AudioWorkletNode(e.ctx, "spia-clic", { numberOfInputs: 1, numberOfOutputs: 1 });
    window.__clic = []; // { frame, perf }: perf = istante di pagina (ms) di uscita dal grafo, senza latenza del dispositivo
    spia.port.onmessage = (ev) => {
      const ts = e.ctx.getOutputTimestamp();
      const sr = e.ctx.sampleRate;
      // contesto -> pagina: ancorando la coppia (contextTime, performanceTime) e scorrendo con l'orologio del contesto
      window.__clic.push({ ctx: ev.data / sr, ancora: { c: ts.contextTime, p: ts.performanceTime } });
    };
    spia.connect(e.ctx.destination); // uscita silenziosa: serve solo a farlo "tirare" dal grafo
    e.dry.connect(spia);
    e.wet.connect(spia);
    const c = document.querySelector("[data-score]");
    window.__hl = [];
    new MutationObserver(() => {
      const i = [...c.querySelectorAll("g.measure")].findIndex((x) => x.classList.contains("is-current"));
      const ultimo = window.__hl.at(-1);
      if (i >= 0 && (!ultimo || ultimo.m !== i)) window.__hl.push({ m: i, perf: performance.now() });
    }).observe(c, { attributes: true, subtree: true, attributeFilter: ["class"] });
  });
}

const mediana = (a) => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };

for (const { pct, da } of PROVE) {
  test(`evidenziazione contro clic udibile a ${pct}%`, async ({ page }) => {
    await apriPlayer(page);
    await installaStrumenti(page);
    await page.evaluate(({ pct, t }) => {
      const s = document.querySelector("[data-speed]");
      s.value = pct;
      s.dispatchEvent(new Event("input", { bubbles: true }));
      window.__study.engine.seek(t);
    }, { pct, t: SYNC.battute[da].t - 0.3 });
    await page.waitForTimeout(500);
    await page.evaluate(() => { window.__hl.length = 0; window.__clic.length = 0; });
    await page.click("[data-play]");
    const ultima = SYNC.battute.length - 1;
    await page.waitForFunction((n) => window.__hl.some((h) => h.m === n), ultima, { timeout: 60_000 });
    await page.waitForFunction((n) => window.__clic.length >= n, ultima - da + 1, { timeout: 15_000 });
    const r = await page.evaluate(() => ({ hl: window.__hl, clic: window.__clic, out: window.__study.engine.ctx.outputLatency }));
    // getOutputTimestamp(): il campione al tempo di contesto `contextTime` esce dall'altoparlante all'istante di pagina
    // `performanceTime` (Chrome: la coppia comprende gia' la latenza d'uscita, contextTime resta ~90 ms dietro currentTime).
    // Lo scarto (performanceTime - contextTime) e' costante: se ne prende la mediana su tutti i campioni per annullare
    // il ritardo con cui il messaggio del worklet arriva alla pagina.
    const scarto = mediana(r.clic.map((c) => c.ancora.p - c.ancora.c * 1000));
    const udibile = r.clic.map((c) => c.ctx * 1000 + scarto); // ms di pagina in cui il clic esce dall'altoparlante
    expect(r.clic.length, "un clic rilevato per battuta, nessuno in piu'").toBe(ultima - da + 1);
    const hl = r.hl.filter((h) => h.m >= da);
    expect(hl.map((h) => h.m), "battute evidenziate in ordine, senza salti").toEqual(Array.from({ length: ultima - da + 1 }, (_, k) => da + k));
    const err = hl.map((h, k) => h.perf - udibile[k]); // positivo = la battuta si accende dopo il clic
    const med = mediana(err), mass = Math.max(...err.map(Math.abs));
    test.info().annotations.push({ type: "errori", description: `${pct}%: n=${err.length} mediana=${med.toFixed(1)} ms max|e|=${mass.toFixed(1)} ms [${err.map((x) => x.toFixed(0)).join(", ")}] outputLatency=${(r.out * 1000).toFixed(0)} ms` });
    console.log(`sync-audio ${pct}%: n=${err.length} mediana=${med.toFixed(1)} ms max|e|=${mass.toFixed(1)} ms [${err.map((x) => x.toFixed(0)).join(", ")}] outputLatency=${(r.out * 1000).toFixed(0)} ms`);
    expect(Math.abs(med), "errore mediano").toBeLessThanOrEqual(MEDIANA_MAX_MS);
    expect(mass, "errore massimo").toBeLessThanOrEqual(MASSIMO_MAX_MS);
  });
}
