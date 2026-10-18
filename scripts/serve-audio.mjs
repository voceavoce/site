#!/usr/bin/env node
// Server di sviluppo degli audio del player: serve VOCEAVOCE_AUDIO_DIR su localhost (porta VOCEAVOCE_AUDIO_PORT, default 8787).
// Node puro, nessuna dipendenza. Supporta HEAD, Range (206) e CORS solo per le origini di eleventy --serve.
// Non e' un server di produzione: in produzione gli audio stanno su R2 (vedi docs/player.md).

import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { caricaEnv, REPO_ROOT, TIPI_AUDIO } from "./upload-audio.mjs";

export const ORIGINI_CORS = ["http://localhost:8080", "http://127.0.0.1:8080"];

// Intervallo Range singolo. Restituisce null (ignora, risposta 200), "unsatisfiable" (416) o {start, end}.
export function parseRange(header, size) {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(header).trim());
  if (!m) return null; // unita' diversa o piu' intervalli: si ignora, come da RFC 9110
  const [, a, b] = m;
  if (a === "" && b === "") return null;
  if (size === 0) return "unsatisfiable";
  if (a === "") {
    const n = Number(b);
    if (n === 0) return "unsatisfiable";
    return { start: Math.max(0, size - n), end: size - 1 };
  }
  const start = Number(a);
  if (start >= size) return "unsatisfiable";
  const end = b === "" ? size - 1 : Math.min(Number(b), size - 1);
  if (end < start) return null;
  return { start, end };
}

// Risolve il percorso URL dentro root. Ritorna {ok:true, file} oppure {ok:false, stato}.
// 400 = codifica non valida, 403 = tentativo di uscire dalla root, 404 = file nascosto o inesistente.
export function risolviPercorso(root, urlPath) {
  let p;
  try {
    p = decodeURIComponent(String(urlPath).split("?")[0]);
  } catch {
    return { ok: false, stato: 400 };
  }
  if (p.includes("\0") || p.includes("\\")) return { ok: false, stato: 403 };
  const segmenti = p.split("/").filter((s) => s !== "");
  if (segmenti.some((s) => s === "..")) return { ok: false, stato: 403 };
  if (segmenti.some((s) => s.startsWith("."))) return { ok: false, stato: 404 };
  const radice = path.resolve(root);
  const file = path.resolve(radice, ...segmenti);
  if (file !== radice && !file.startsWith(radice + path.sep)) return { ok: false, stato: 403 };
  return { ok: true, file };
}

function invia(res, stato, testo) {
  res.writeHead(stato, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
  res.end(testo + "\n");
}

export function creaServer({ root, origini = ORIGINI_CORS }) {
  const radiceReale = fs.realpathSync(path.resolve(root));
  return http.createServer((req, res) => {
    const origin = req.headers.origin;
    const consentita = origin !== undefined && origini.includes(origin);
    if (consentita) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Expose-Headers", "Accept-Ranges, Content-Range, Content-Length, Content-Type");
    }

    if (req.method === "OPTIONS") {
      if (consentita) {
        res.setHeader("Access-Control-Allow-Methods", "GET, HEAD");
        res.setHeader("Access-Control-Allow-Headers", "Range");
        res.setHeader("Access-Control-Max-Age", "600");
      }
      res.writeHead(204);
      return res.end();
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.setHeader("Allow", "GET, HEAD, OPTIONS");
      return invia(res, 405, "Metodo non consentito");
    }

    const r = risolviPercorso(radiceReale, req.url || "/");
    if (!r.ok) return invia(res, r.stato, r.stato === 403 ? "Vietato" : r.stato === 400 ? "Richiesta non valida" : "Non trovato");

    let st;
    let reale;
    try {
      reale = fs.realpathSync(r.file);
      st = fs.statSync(reale);
    } catch {
      return invia(res, 404, "Non trovato");
    }
    if (!st.isFile() || (reale !== radiceReale && !reale.startsWith(radiceReale + path.sep))) {
      return invia(res, 404, "Non trovato");
    }

    const size = st.size;
    const tipo = TIPI_AUDIO[path.extname(reale)] || "application/octet-stream";
    const intervallo = parseRange(req.headers.range, size);
    const base = {
      "Content-Type": tipo,
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-cache",
    };

    if (intervallo === "unsatisfiable") {
      res.writeHead(416, { ...base, "Content-Range": `bytes */${size}` });
      return res.end();
    }
    if (intervallo) {
      const { start, end } = intervallo;
      res.writeHead(206, { ...base, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": end - start + 1 });
      if (req.method === "HEAD") return res.end();
      return fs.createReadStream(reale, { start, end }).on("error", () => res.destroy()).pipe(res);
    }
    res.writeHead(200, { ...base, "Content-Length": size });
    if (req.method === "HEAD") return res.end();
    return fs.createReadStream(reale).on("error", () => res.destroy()).pipe(res);
  });
}

export function main() {
  const env = caricaEnv();
  const dirGrezza = env.VOCEAVOCE_AUDIO_DIR;
  if (!dirGrezza) {
    console.error("VOCEAVOCE_AUDIO_DIR non impostata (vedi .env.example).");
    return 1;
  }
  const dir = path.resolve(REPO_ROOT, dirGrezza);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    console.error(`Cartella degli audio inesistente: ${dir}`);
    return 1;
  }
  const porta = Number(env.VOCEAVOCE_AUDIO_PORT || 8787);
  if (!Number.isInteger(porta) || porta < 1 || porta > 65535) {
    console.error(`VOCEAVOCE_AUDIO_PORT non valida: ${env.VOCEAVOCE_AUDIO_PORT}`);
    return 1;
  }
  const server = creaServer({ root: dir });
  // Ascolta solo in locale: gli audio non sono esposti alla rete.
  server.listen(porta, "127.0.0.1", () => {
    console.log(`Audio di sviluppo: http://localhost:${porta}  (da ${dir})`);
    console.log(`CORS consentito per: ${ORIGINI_CORS.join(", ")}`);
  });
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const code = main();
  if (code !== 0) process.exitCode = code;
}
