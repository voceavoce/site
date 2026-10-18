#!/usr/bin/env node
// Misura, in Chrome, quanto Opus e MP3 differiscono dall'originale quando il player li decodifica (Web Audio, 24 kHz):
//   - durata e inizio del suono (il ritardo di codifica dell'MP3 sposta tutto di qualche decina di ms);
//   - sfasamento rispetto al riferimento (correlazione incrociata, in ms);
//   - rapporto segnale/errore (SNR, in dB) dopo aver allineato e livellato: piu' alto = piu' fedele.
// Non e' un test automatico (servono gli audio, che non sono nel repo): e' una misura da ripetere se si decide di
// togliere l'MP3 o l'Opus. Risultati e interpretazione: docs/misure-opus-mp3.md.
//
//   node scripts/misura-opus-mp3.mjs --audio-dir C:\source\repos\audio-sito --rif rif.json [--out risultati.md] slug:chiave ...
//   rif.json = { "slug:chiave": "percorso del FLAC/WAV originale" }   (facoltativo: senza, il riferimento e' l'Opus)
// Chrome: PW_CHROMIUM=percorso di chrome.exe (come per gli e2e). Solo Chrome: Safari e Firefox vanno provati a mano.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { chromium } from "@playwright/test";

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args.splice(i, 2)[1] : null; };
const audioDir = opt("--audio-dir"), rifFile = opt("--rif"), outFile = opt("--out");
const SR = Number(opt("--sr") || 24000);
const voci = args.filter((a) => a.includes(":"));
if (!audioDir || !voci.length) { console.error("Uso: node scripts/misura-opus-mp3.mjs --audio-dir DIR [--rif rif.json] [--out file.md] slug:chiave ..."); process.exit(2); }
const rif = rifFile ? JSON.parse(fs.readFileSync(rifFile, "utf8")) : {};

const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  if (u.pathname === "/") { res.writeHead(200, { "content-type": "text/html" }); return res.end("<!doctype html><title>m</title>"); }
  const p = u.searchParams.get("p");
  if (!p || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": "application/octet-stream", "access-control-allow-origin": "*" });
  fs.createReadStream(p).pipe(res);
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage();
await page.goto(base + "/");

// Tutto il calcolo gira nella pagina: il browser decodifica come farebbe il player.
const misura = (percorsi, sr) => page.evaluate(async ({ percorsi, sr, base }) => {
  const decodifica = async (p) => {
    const ab = await (await fetch(`${base}/f?p=${encodeURIComponent(p)}`)).arrayBuffer();
    const ctx = new AudioContext({ sampleRate: sr });
    const b = await ctx.decodeAudioData(ab);
    await ctx.close();
    return b.getChannelData(0);
  };
  const inizio = (x) => { let pk = 0; for (let i = 0; i < x.length; i++) pk = Math.max(pk, Math.abs(x[i])); const s = 0.05 * pk; let i = 0; while (i < x.length && Math.abs(x[i]) < s) i++; return i; };
  const ref = await decodifica(percorsi.rif);
  const onRif = inizio(ref);
  const ini = onRif + sr, fin = Math.min(ref.length, ini + 6 * sr), L = Math.round(0.1 * sr);
  const out = { sr, rif: { durata_ms: ref.length / sr * 1000, inizio_ms: onRif / sr * 1000 } };
  for (const nome of ["opus", "mp3"]) {
    if (!percorsi[nome]) continue;
    const x = await decodifica(percorsi[nome]);
    let best = -Infinity, lag = 0;
    for (let l = -L; l <= L; l++) {
      let s = 0;
      for (let i = ini; i < fin; i++) { const j = i + l; if (j >= 0 && j < x.length) s += ref[i] * x[j]; }
      if (s > best) { best = s; lag = l; }
    }
    // SNR dopo l'allineamento e con il guadagno ottimo (il livello non conta, conta la forma d'onda)
    let rx = 0, xx = 0, rr = 0;
    for (let i = ini; i < fin; i++) { const v = x[i + lag] ?? 0; rx += ref[i] * v; xx += v * v; rr += ref[i] * ref[i]; }
    const g = xx ? rx / xx : 0;
    let err = 0;
    for (let i = ini; i < fin; i++) { const d = ref[i] - g * (x[i + lag] ?? 0); err += d * d; }
    out[nome] = { durata_ms: x.length / sr * 1000, inizio_ms: inizio(x) / sr * 1000, sfasamento_ms: lag / sr * 1000, snr_db: 10 * Math.log10(rr / Math.max(err, 1e-20)) };
  }
  return out;
}, { percorsi, sr, base });

const righe = [];
for (const v of voci) {
  const [slug, chiave] = v.split(":");
  const d = path.join(audioDir, slug, "v1");
  const opus = path.join(d, `${chiave}.opus`), mp3 = path.join(d, `${chiave}.mp3`);
  const origine = rif[v] && fs.existsSync(rif[v]) ? rif[v] : null;
  try {
    const r = await misura({ rif: origine ?? opus, opus: origine ? opus : null, mp3 }, SR);
    righe.push({ v, origine: Boolean(origine), r });
    console.error(`ok ${v}`);
  } catch (e) { console.error(`ERRORE ${v}: ${e.message}`); }
}
await browser.close();
server.close();

const f = (n, d = 2) => (n == null ? "-" : Number(n).toFixed(d));
let md = `| brano:voce | riferimento | Opus: sfasamento ms | Opus: SNR dB | MP3: sfasamento ms | MP3: SNR dB | MP3 durata − rif. ms |\n|---|---|---|---|---|---|---|\n`;
for (const { v, origine, r } of righe) {
  const o = r.opus, m = r.mp3;
  md += `| ${v} | ${origine ? "originale" : "Opus"} | ${f(o?.sfasamento_ms)} | ${f(o?.snr_db, 1)} | ${f(m?.sfasamento_ms)} | ${f(m?.snr_db, 1)} | ${f(m ? m.durata_ms - r.rif.durata_ms : null, 1)} |\n`;
}
console.log(md);
if (outFile) fs.writeFileSync(outFile, md);
