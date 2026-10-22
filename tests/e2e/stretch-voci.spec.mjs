// Misura della prova ?stretch=voci (uno stretcher per voce) contro lo stretcher unico sul mix.
// Per ogni clic (un clic per battuta in ogni traccia, stesso istante) si legge, sul frame esatto dell'orologio del
// contesto, quando esce dallo/dagli stretcher. Due numeri per velocita':
//  - sfasamento tra voci: per ogni battuta, massimo - minimo dell'istante del clic nelle 4 voci (0 per costruzione col mix);
//  - latenza: istante del clic meno l'istante ideale (anchorTime + (t - anchorPos) / velocita'), da confrontare con
//    la tabella STRETCH_LATENCY (0,123 s a 0,75x) su cui si basa la compensazione dell'evidenziazione.
import { expect } from "@playwright/test";
import { test, apriPlayer, intercettaAudio, SYNC } from "./helpers.mjs";

const mediana = (a) => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
const PROVE = [75, 50];

test.beforeEach(async ({ context }) => { await intercettaAudio(context); });

async function misura(page, { voci, pct }) {
  await apriPlayer(page, `/player/_prova/?debug${voci ? "&stretch=voci" : ""}`);
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
      registerProcessor("spia-voce", Spia);`;
    await e.ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([codice], { type: "text/javascript" })));
    // una spia per ogni uscita di stretcher; nel modo normale una sola, sull'uscita dello stretcher unico
    const uscite = e.stretchers.length ? e.stretchers : [e.stretcher];
    window.__voci = uscite.map(() => []);
    uscite.forEach((st, i) => {
      const spia = new AudioWorkletNode(e.ctx, "spia-voce", { numberOfInputs: 1, numberOfOutputs: 1 });
      spia.port.onmessage = (ev) => window.__voci[i].push(ev.data / e.ctx.sampleRate);
      spia.connect(e.ctx.destination);
      st.connect(spia);
    });
  });
  const da = 1, ultima = SYNC.battute.length - 1, attesi = ultima - da + 1;
  await page.evaluate(({ pct, t }) => {
    const s = document.querySelector("[data-speed]");
    s.value = pct;
    s.dispatchEvent(new Event("input", { bubbles: true }));
    window.__study.engine.seek(t);
  }, { pct, t: SYNC.battute[da].t - 0.3 });
  await page.waitForTimeout(500);
  await page.evaluate(() => window.__voci.forEach((v) => (v.length = 0)));
  await page.click("[data-play]");
  await page.waitForFunction((n) => window.__voci.every((v) => v.length >= n), attesi, { timeout: 60_000 });
  return page.evaluate(({ da, attesi }) => {
    const e = window.__study.engine;
    return { voci: window.__voci.map((v) => v.slice(0, attesi)), anchorTime: e.anchorTime, anchorPos: e.anchorPos, rate: e.rate };
  }, { da, attesi });
}

for (const voci of [false, true]) {
  for (const pct of PROVE) {
    test(`${voci ? "uno stretcher per voce" : "stretcher unico"} a ${pct}%`, async ({ page }) => {
      const r = await misura(page, { voci, pct });
      const da = 1;
      const ideale = r.voci[0].map((_, k) => r.anchorTime + (SYNC.battute[da + k].t - r.anchorPos) / r.rate);
      const sfasamento = r.voci[0].map((_, k) => 1000 * (Math.max(...r.voci.map((v) => v[k])) - Math.min(...r.voci.map((v) => v[k]))));
      const latenza = r.voci.map((v) => v.map((x, k) => 1000 * (x - ideale[k])));
      const msg = `stretch ${voci ? "voci" : "mix"} ${pct}%: voci=${r.voci.length} sfasamento tra voci (ms, per battuta) [${sfasamento.map((x) => x.toFixed(1)).join(", ")}]; latenza mediana per voce (ms) [${latenza.map((l) => mediana(l).toFixed(0)).join(", ")}]`;
      test.info().annotations.push({ type: "misura", description: msg });
      console.log(msg);
      // soglia larga: documenta il limite noto (con i clic sintetici lo sfasamento misurato va da 0 a ~40 ms), non lo rende un obiettivo
      expect(Math.max(...sfasamento), "sfasamento massimo tra voci").toBeLessThanOrEqual(voci ? 80 : 1);
    });
  }
}
