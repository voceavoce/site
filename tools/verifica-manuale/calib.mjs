import { chromium } from "/opt/node-tools/node_modules/playwright/index.mjs";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await (await browser.newContext()).newPage();
await page.goto("http://127.0.0.1:8080/chi-siamo/");
const res = await page.evaluate(async () => {
  const V = new URL("/assets/vendor/soundtouch/", location.href);
  const { SoundTouchNode } = await import(new URL("index.js", V).href);
  const out = [];
  for (const sr of [44100, 48000]) for (const rate of [1, 0.95, 0.9, 0.85, 0.8, 0.75, 0.7, 0.65, 0.6, 0.55, 0.5]) {
    const srcSr = 24000, srcDur = 10, nClicks = 9;
    const ctx = new OfflineAudioContext(1, Math.ceil(sr * (srcDur / rate + 1)), sr);
    await SoundTouchNode.register(ctx, new URL("soundtouch-processor.js", V).href);
    const st = new SoundTouchNode({ context: ctx });
    st.playbackRate.value = rate;
    const buf = ctx.createBuffer(1, srcSr * srcDur, srcSr); const d = buf.getChannelData(0);
    const tClick = []; for (let k = 1; k <= nClicks; k++) { const t = k + 0.37 * (k % 3); tClick.push(t); const i = Math.round(t * srcSr);
      for (let j = 0; j < 0.04 * srcSr; j++) d[i + j] += 0.5 * Math.sin(2 * Math.PI * 1500 * j / srcSr) * Math.exp(-j / srcSr / 0.012); }
    const s = ctx.createBufferSource(); s.buffer = buf; s.playbackRate.value = rate; s.connect(st); st.connect(ctx.destination); s.start(0);
    const r = await ctx.startRendering(); const y = r.getChannelData(0);
    const on = [], cen = [];
    for (const t of tClick) {
      const exp = t / rate; const a = Math.floor((exp - 0.1) * sr), b = Math.floor((exp + 0.4) * sr);
      let pk = 0; for (let i = a; i < b; i++) pk = Math.max(pk, Math.abs(y[i]));
      let o = null; for (let i = a; i < b; i++) if (Math.abs(y[i]) > 0.25 * pk) { o = i; break; }
      let e = 0, et = 0; for (let i = a; i < b; i++) { const w = y[i] * y[i]; e += w; et += w * i; }
      on.push((o / sr - exp) * 1000); cen.push((et / e / sr - exp) * 1000);
    }
    // centroide atteso del segnale ideale (decadimento esponenziale seno^2): ~ misurato su ingresso a rate 1 -> sottrarre offset del sorgente
    out.push({ sr, rate, on: on.map(Math.round), cen: cen.map(Math.round) });
  }
  return out;
});
for (const r of res) { const m = (a) => Math.round(a.reduce((x, y) => x + y, 0) / a.length); console.log(r.sr, r.rate, "onset", m(r.on), Math.min(...r.on), Math.max(...r.on), "| centroid", m(r.cen), Math.min(...r.cen), Math.max(...r.cen)); }
await browser.close();
