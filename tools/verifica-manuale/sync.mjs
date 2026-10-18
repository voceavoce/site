import { chromium } from "/opt/node-tools/node_modules/playwright/index.mjs";
import { execSync } from "node:child_process";
const URL = "http://127.0.0.1:8080/player/locus-iste-bruckner/?debug";
const out = {};
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--autoplay-policy=no-user-gesture-required", "--enable-precise-memory-info"] });
const bpid = +execSync("ps -eo pid,args | grep chrome-linux/chrome | grep -v -e grep -e \"--type=\" | head -1").toString().trim().split(/\s+/)[0];
const rss = () => { // somma RSS (MB) dei processi discendenti del browser
  const all = execSync("ps -eo pid,ppid,rss,comm").toString().trim().split("\n").slice(1).map(l => l.trim().split(/\s+/));
  const kids = new Set([String(bpid)]); let ch = true;
  while (ch) { ch = false; for (const [p, pp] of all) if (kids.has(pp) && !kids.has(p)) { kids.add(p); ch = true; } }
  return Math.round(all.filter(([p]) => kids.has(p)).reduce((s, r) => s + +r[2], 0) / 1024);
};
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
const logs = []; page.on("console", m => { if (m.type() === "error" || m.type() === "warning") logs.push(m.text().slice(0, 200)); });
page.on("pageerror", e => logs.push("PAGEERR " + e.message));
await page.goto(URL);
await page.waitForFunction(() => window.__study && window.__study.engine.tracks.size === 4 && window.__study.score, null, { timeout: 90000 });
await page.waitForFunction(() => !document.querySelector("[data-play]").disabled, null, { timeout: 30000 });
await page.waitForTimeout(1500);
out.caricamento = await page.evaluate(() => {
  const c = document.querySelector("[data-score]");
  const ms = [...c.querySelectorAll("g.measure")].length;
  const maxM = Math.max(...window.__study.sync.battute.map(b => b.m));
  const e = window.__study.engine;
  return { battuteSVG: ms, maxMplus1: maxM + 1, battuteSync: window.__study.sync.battute.length, pagineSVG: c.querySelectorAll(":scope > svg").length,
    stretchOk: e.stretchOk, durata: e.duration, sr: e.ctx.sampleRate, bufSr: [...e.tracks.values()].map(t => t.buffer.sampleRate + "/" + t.buffer.numberOfChannels + "ch/" + t.buffer.duration.toFixed(2)),
    jsHeapMB: Math.round(performance.memory.usedJSHeapSize / 1048576), heapTotMB: Math.round(performance.memory.totalJSHeapSize / 1048576) };
});
out.rss_dopo_caricamento_MB = rss();
// strumenti nel browser
await page.evaluate(() => {
  const S = window.__study, e = S.engine, c = document.querySelector("[data-score]");
  window.__rec = { hl: [], on: [], on0: [] };
  new MutationObserver(() => {
    const els = [...c.querySelectorAll("g.measure")]; const i = els.findIndex(x => x.classList.contains("is-current"));
    const last = window.__rec.hl[window.__rec.hl.length - 1];
    if (i >= 0 && (!last || last.m !== i)) window.__rec.hl.push({ m: i, ct: e.ctx.currentTime, pos: e.position(), rate: e.rate });
  }).observe(c, { attributes: true, subtree: true, attributeFilter: ["class"] });
  const sp = e.ctx.createScriptProcessor(512, 1, 1);
  let quiet = 0;
  sp.onaudioprocess = (ev) => {
    const d = ev.inputBuffer.getChannelData(0), sr = e.ctx.sampleRate;
    for (let i = 0; i < d.length; i++) {
      const a = Math.abs(d[i]);
      if (a > 0.2 && quiet > 0.12 * sr) { window.__rec.on.push(ev.playbackTime + i / sr); quiet = 0; }
      else if (a < 0.2) quiet++; else quiet = 0;
    }
  };
  (e.stretcher || e.bus).connect(sp); sp.connect(e.ctx.destination);
  const sp0 = e.ctx.createScriptProcessor(512, 1, 1); let q0 = 0;
  sp0.onaudioprocess = (ev) => { const d = ev.inputBuffer.getChannelData(0), sr = e.ctx.sampleRate;
    for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > 0.2 && q0 > 0.12 * sr) { window.__rec.on0.push(ev.playbackTime + i / sr); q0 = 0; } else if (a < 0.2) q0++; else q0 = 0; } };
  e.bus.connect(sp0); sp0.connect(e.ctx.destination);
  const z = e.ctx.createGain(); z.gain.value = 0; // il processor deve essere pilotato: uscita muta gia' sul destination via sp
});
async function run(label, setup, ms) {
  await page.evaluate(() => { window.__rec.hl.length = 0; window.__rec.on.length = 0; window.__rec.on0.length = 0; });
  await setup();
  await page.waitForTimeout(ms);
  await play(); const r = await page.evaluate(() => { const S = window.__study; return { rec: window.__rec, sync: S.sync.battute, rate: S.engine.rate, loop: S.engine.loop }; });
  // confronto 1: posizione-orologio al cambio evidenziazione vs t di sync della battuta evidenziata (loop: indice m = indice battuta, no ritornelli)
  r.rec.hl.shift(); const errPos = r.rec.hl.filter(h => h.pos != null).map(h => (h.pos - r.sync[h.m].t) * 1000);
  // confronto 2: primo click udibile dopo/intorno al cambio
  const errAud = [];
  for (const h of r.rec.hl) {
    let best = null; for (const o of r.rec.on) if (best === null || Math.abs(o - h.ct) < Math.abs(best - h.ct)) best = o;
    if (best !== null && Math.abs(best - h.ct) < 0.5) errAud.push((h.ct - best) * 1000);
  }
  const near = (arr) => { const e2 = []; for (const h of r.rec.hl) { let b = null; for (const o of arr) if (b === null || Math.abs(o - h.ct) < Math.abs(b - h.ct)) b = o; if (b !== null && Math.abs(b - h.ct) < 0.6) e2.push((h.ct - b) * 1000); } return e2; };
  const errBus = near(r.rec.on0);
  const lat = []; for (const o of r.rec.on) { let b = null; for (const o0 of r.rec.on0) if (b === null || Math.abs(o - o0 - 0.12) < Math.abs(o - b - 0.12)) b = o0; if (b !== null && o - b > 0 && o - b < 0.4) lat.push((o - b) * 1000); }
  const st = (a) => a.length ? { n: a.length, min: Math.round(Math.min(...a)), max: Math.round(Math.max(...a)), media: Math.round(a.reduce((x, y) => x + y, 0) / a.length), maxAbs: Math.round(Math.max(...a.map(Math.abs))) } : null;
  out[label] = { evidenziate: r.rec.hl.length, clickUdibili: r.rec.on.length, clock_vs_sync_ms: st(errPos), highlight_meno_click_ms: st(errAud), highlight_meno_bus_ms: st(errBus), latenza_soundtouch_ms: st(lat), sequenzaM: r.rec.hl.map(h => h.m).join(",") };
}
const play = () => page.click("[data-play]");
const setRate = async (pct) => { await page.evaluate((p) => { const s = document.querySelector("[data-speed]"); s.value = p; s.dispatchEvent(new Event("input", { bubbles: true })); }, pct); };
await run("1x_da_zero", async () => { await setRate(100); await play(); }, 24000);
await run("1x_dopo_seek_battuta20", async () => { await page.evaluate(() => { const S = window.__study; S.engine.seek(S.sync.battute[20].t - 0.3); }); await play(); }, 20000);
await run("0.75x_da_zero", async () => { await setRate(75); await page.evaluate(() => { window.__study.engine.seek(0); }); await play(); }, 30000);
await run("0.75x_dopo_seek_battuta30", async () => { await page.evaluate(() => { const S = window.__study; S.engine.seek(S.sync.battute[30].t - 0.3); }); await play(); }, 24000);
// loop battute 10..13 a 1x e 0.75x
for (const [pct, ms] of [[100, 30000], [75, 36000]]) {
  await run(`loop_b10-13_${pct}%`, async () => {
    await page.evaluate((p) => { const S = window.__study; const s = document.querySelector("[data-speed]"); s.value = p; s.dispatchEvent(new Event("input", { bubbles: true }));
      S.engine.setLoop({ start: S.sync.battute[10].t, end: S.sync.battute[14].t }); S.engine.seek(S.sync.battute[10].t - 0.2); }, pct); await play();
  }, ms);
}
out.rss_dopo_prove_MB = rss();
out.processi = execSync("ps -eo pid,rss,args | grep chrome-linux/chrome | grep -v grep | sed -E 's/^ *([0-9]+) +([0-9]+) .*--type=([a-z-]+).*/\\1 \\2 \\3/' | awk '{printf \"%s:%dMB \", $3, $2/1024}'").toString();
out.outputLatency = await page.evaluate(() => [window.__study.engine.ctx.baseLatency, window.__study.engine.ctx.outputLatency]);
out.mem_finale = await page.evaluate(() => ({ jsHeapMB: Math.round(performance.memory.usedJSHeapSize / 1048576) }));
out.log = logs.slice(0, 8);
console.log(JSON.stringify(out, null, 1));
await browser.close();
