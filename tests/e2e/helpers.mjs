// Utilita' comuni dei test end-to-end: audio sintetico, server del sito controllabile, apertura del player.
// Nessun file audio nel repo: i WAV nascono in memoria al momento del test e si servono con route.fulfill().
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const QUI = path.dirname(fileURLToPath(import.meta.url));
export const RADICE = path.resolve(QUI, "../..");
export const SITO = path.join(RADICE, "_site-e2e");
export const SYNC = JSON.parse(fs.readFileSync(path.join(RADICE, "content/player/_prova/sync.json"), "utf8"));
export const MANIFEST = JSON.parse(fs.readFileSync(path.join(RADICE, "content/player/_prova/manifest.json"), "utf8"));
export const PLAYER_URL = "/player/_prova/?debug";
export const CHIAVI = MANIFEST.tracce.map((t) => t.chiave); // soprano, alto, tenore, basso
export const HOST_AUDIO = "localhost:8787"; // site.audioBase della build di sviluppo

const FREQ = { soprano: 1500, alto: 1200, tenore: 900, basso: 700 };
const SR = 24000;

/**
 * WAV PCM 16 bit mono a 24 kHz: un tono debole di fondo piu' un clic (sinusoide smorzata) all'istante di ogni battuta
 * di sync.json. Cosi' il suono ha un evento udibile preciso a ogni battuta, come negli audio veri.
 */
export function creaWav(chiave, sync = SYNC) {
  const f = FREQ[chiave] ?? 1000;
  const n = Math.round(sync.fine * SR);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = 0.03 * Math.sin((2 * Math.PI * (f / 4) * i) / SR);
  for (const b of sync.battute) {
    const i0 = Math.round(b.t * SR);
    for (let k = 0; k < 0.04 * SR && i0 + k < n; k++) {
      const t = k / SR;
      x[i0 + k] += 0.22 * Math.sin(2 * Math.PI * f * t) * Math.exp(-t / 0.012);
    }
  }
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, x[i])) * 32767), 44 + i * 2);
  return buf;
}

const wavCache = new Map();
const wavDi = (chiave) => { if (!wavCache.has(chiave)) wavCache.set(chiave, creaWav(chiave)); return wavCache.get(chiave); };

const CORS = { "access-control-allow-origin": "*", "access-control-expose-headers": "Content-Length, Content-Range" };

/**
 * Intercetta gli audio del player (base di sviluppo localhost:8787) e qualunque host *.workers.dev e li serve dalla
 * memoria. Ritorna l'elenco delle richieste audio viste (url, header Range) per le verifiche.
 * Il contenuto non dipende dall'estensione (.opus/.mp3): decodeAudioData riconosce il formato dai byte.
 */
export async function intercettaAudio(context) {
  const viste = [];
  await context.route((u) => u.host === HOST_AUDIO || /(^|\.)workers\.dev$/.test(u.hostname), async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    viste.push({ url: req.url(), range: req.headers().range ?? null });
    const chiave = CHIAVI.find((c) => url.pathname.includes(`/${c}.`));
    if (!chiave) return route.fulfill({ status: 200, headers: { ...CORS, "content-type": "application/octet-stream" }, body: Buffer.from("x") });
    const wav = wavDi(chiave);
    const m = /^bytes=(\d+)-(\d*)$/.exec(req.headers().range ?? "");
    if (m) {
      const a = Number(m[1]), b = m[2] ? Math.min(Number(m[2]), wav.length - 1) : wav.length - 1;
      return route.fulfill({ status: 206, headers: { ...CORS, "content-type": "audio/wav", "content-range": `bytes ${a}-${b}/${wav.length}` }, body: wav.subarray(a, b + 1) });
    }
    return route.fulfill({ status: 200, headers: { ...CORS, "content-type": "audio/wav" }, body: wav });
  });
  return viste;
}

/** Raccoglie errori di console e pageerror: i test verificano che l'elenco resti vuoto. */
export function raccogliErrori(page) {
  const errori = [];
  page.on("console", (m) => { if (m.type() === "error") errori.push(`console: ${m.text()}`); });
  page.on("pageerror", (e) => errori.push(`pageerror: ${e.message}`));
  return errori;
}

/** Apre il player e aspetta tracce decodificate, partitura disegnata e tasto Play abilitato (Verovio WASM e' lento). */
export async function apriPlayer(page, url = PLAYER_URL) {
  await page.goto(url);
  await page.waitForFunction(() => window.__study?.engine.tracks.size === 4 && window.__study.score, null, { timeout: 90_000 });
  await page.waitForFunction(() => !document.querySelector("[data-play]").disabled, null, { timeout: 30_000 });
}

/**
 * Piccolo server statico di _site-e2e, controllabile dal test: si puo' FERMARE (per simulare l'assenza di rete
 * anche per le richieste del service worker, che context.setOffline non tocca) e puo' servire /sw.js con una
 * VERSION diversa (per simulare un nuovo deploy). Porta casuale: ogni test ha un'origine nuova, quindi un SW nuovo.
 */
export async function avviaSito({ swVersion } = {}) {
  let versione = swVersion;
  const TIPI = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml", ".wasm": "application/wasm", ".xml": "application/xml", ".musicxml": "application/xml", ".txt": "text/plain" };
  const connessioni = new Set();
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    let p = decodeURIComponent(u.pathname);
    if (p.includes("..")) { res.writeHead(400).end(); return; }
    let file = path.join(SITO, p);
    if (p.endsWith("/")) file = path.join(file, "index.html");
    else if (!path.extname(file) && fs.existsSync(path.join(file, "index.html"))) { res.writeHead(301, { location: `${p}/${u.search}` }).end(); return; }
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404, { "content-type": "text/plain" }).end("404"); return; }
    let body = fs.readFileSync(file);
    if (p === "/sw.js" && versione) {
      const src = body.toString("utf8");
      const out = src.replace(/const VERSION = "[^"]*";/, `const VERSION = "${versione}";`);
      if (out === src && !src.includes(`"${versione}"`)) throw new Error("sw.js: riga VERSION non trovata, il test dell'aggiornamento non e' valido");
      body = Buffer.from(out);
    }
    res.writeHead(200, { "content-type": TIPI[path.extname(file)] ?? "application/octet-stream", "cache-control": "no-cache" });
    res.end(body);
  });
  server.on("connection", (s) => { connessioni.add(s); s.on("close", () => connessioni.delete(s)); });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  const porta = server.address().port;
  return {
    url: `http://127.0.0.1:${porta}`,
    porta,
    setSwVersion(v) { versione = v; },
    async ferma() {
      for (const s of connessioni) s.destroy();
      await new Promise((ok) => server.close(ok));
    },
  };
}

/** Nomi e URL contenuti in TUTTE le cache del browser (Cache Storage), letti dalla pagina. */
export async function leggiCache(page) {
  return page.evaluate(async () => {
    const out = {};
    for (const nome of await caches.keys()) out[nome] = (await (await caches.open(nome)).keys()).map((r) => r.url);
    return out;
  });
}

/** Vero se un URL e' audio secondo la regola del progetto (estensione, host audio, workers.dev). */
export function eAudio(url) {
  const u = new URL(url);
  return /\.(opus|mp3|wav|flac|ogg|oga|m4a|aac|weba)$/i.test(u.pathname) || u.host === HOST_AUDIO || /(^|\.)workers\.dev$/.test(u.hostname);
}
