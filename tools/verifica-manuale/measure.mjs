import { chromium } from "/opt/node-tools/node_modules/playwright/index.mjs";
const label = process.argv[2] || "run";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const logs = []; page.on("pageerror", e => logs.push("PAGEERR " + e.message));
await page.goto("http://127.0.0.1:8080/player/locus-iste-bruckner/?debug");
await page.waitForFunction(() => window.__study && window.__study.engine.tracks.size === 4 && window.__study.score, null, { timeout: 90000 });
await page.waitForFunction(() => !document.querySelector("[data-play]").disabled, null, { timeout: 30000 });
await page.waitForTimeout(1000);
await page.evaluate(() => {
  const S = window.__study, e = S.engine, c = document.querySelector("[data-score]");
  window.__rec = { hl: [], on: [] };
  new MutationObserver(() => {
    const els = [...c.querySelectorAll("g.measure")]; const i = els.findIndex(x => x.classList.contains("is-current"));
    const last = window.__rec.hl[window.__rec.hl.length - 1];
    if (i >= 0 && (!last || last.m !== i)) window.__rec.hl.push({ m: i, ct: e.ctx.currentTime, pos: e.position(), rate: e.rate });
  }).observe(c, { attributes: true, subtree: true, attributeFilter: ["class"] });
  // tap sul mix finale (dopo lo stretcher oppure dal ramo diretto), prima dell'uscita del dispositivo
  const sp = e.ctx.createScriptProcessor(512, 1, 1); let quiet = 0;
  sp.onaudioprocess = (ev) => { const d = ev.inputBuffer.getChannelData(0), sr = e.ctx.sampleRate;
    for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]);
      if (a > 0.2 && quiet > 0.12 * sr) { window.__rec.on.push(ev.playbackTime + i / sr); quiet = 0; } else if (a < 0.2) quiet++; else quiet = 0; } };
  const tap = e.ctx.createGain(); tap.connect(sp); sp.connect(e.ctx.destination);
  const srcs = e.dry ? [e.dry, e.wet] : [e.stretcher || e.bus];
  for (const n of srcs) n.connect(tap);
});
const play = () => page.click("[data-play]");
const setRate = async (pct) => { await page.evaluate((p) => { const s = document.querySelector("[data-speed]"); s.value = p; s.dispatchEvent(new Event("input", { bubbles: true })); }, pct); };
const out = {};
const dev = await page.evaluate(() => { const c = window.__study.engine.ctx; return c.outputLatency || c.baseLatency || 0; });
out.deviceLatencyMs = Math.round(dev * 1000);
const st = (a) => a.length ? { n: a.length, min: Math.round(Math.min(...a)), max: Math.round(Math.max(...a)), media: Math.round(a.reduce((x, y) => x + y, 0) / a.length), maxAbs: Math.round(Math.max(...a.map(Math.abs))) } : null;
async function run(name, setup, ms, mid) {
  await page.evaluate(() => { window.__rec.hl.length = 0; window.__rec.on.length = 0; });
  await setup(); await page.waitForTimeout(ms); if (mid) { await mid(); }
  await play();
  const r = await page.evaluate(() => ({ rec: window.__rec, sync: window.__study.sync.battute }));
  const hl = r.rec.hl.slice(1), on = r.rec.on; // il primo cambio e' il salto alla battuta di partenza: nessun clic da confrontare
  const err = [], errNoDev = [], det = [];
  for (const h of hl) { let b = null; for (const o of on) if (b === null || Math.abs(o - h.ct) < Math.abs(b - h.ct)) b = o;
    if (b !== null && Math.abs(b - h.ct) < 0.4) { err.push((h.ct - (b + dev)) * 1000); errNoDev.push((h.ct - b) * 1000); det.push(`${h.m}@${h.rate}:${Math.round((h.ct - (b + dev)) * 1000)}`); } }
  out[name] = { n: err.length, udibile_ms: st(err), senza_dispositivo_ms: st(errNoDev), seq: r.rec.hl.map(h => h.m).join(",") };
  if (name.startsWith("cambio")) out[name].dettaglio = det.join(" ");
}
await run("1x_da_zero", async () => { await setRate(100); await play(); }, 14000);
await run("1x_dopo_seek_b20", async () => { await page.evaluate(() => { const S = window.__study; S.engine.seek(S.sync.battute[20].t - 0.3); }); await play(); }, 12000);
await run("0.75x_da_zero", async () => { await setRate(75); await page.evaluate(() => window.__study.engine.seek(0)); await play(); }, 18000);
await run("0.75x_dopo_seek_b30", async () => { await page.evaluate(() => { const S = window.__study; S.engine.seek(S.sync.battute[30].t - 0.3); }); await play(); }, 15000);
for (const [pct, ms] of [[100, 24000], [75, 30000]]) {
  await run(`loop_b10-13_${pct}%`, async () => {
    await page.evaluate((p) => { const S = window.__study; const s = document.querySelector("[data-speed]"); s.value = p; s.dispatchEvent(new Event("input", { bubbles: true }));
      S.engine.setLoop({ start: S.sync.battute[10].t, end: S.sync.battute[14].t }); S.engine.seek(S.sync.battute[10].t - 0.2); }, pct); await play(); }, ms);
  await page.evaluate(() => window.__study.engine.setLoop(null));
}
await run("cambio_100_75_100", async () => { await setRate(100); await page.evaluate(() => window.__study.engine.seek(window.__study.sync.battute[5].t - 0.2)); await play();
  setTimeout(async () => { await setRate(75); }, 9000); setTimeout(async () => { await setRate(100); }, 24000); }, 36000);
console.log(label, JSON.stringify(out), logs);
await browser.close();
