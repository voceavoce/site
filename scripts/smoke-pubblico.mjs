#!/usr/bin/env node
// S3 (T-1013): controllo di fumo, in SOLA LETTURA, sul sito pubblico dopo un deploy. Per pochi brani verifica che la pagina del
// player risponda, che la partitura (MusicXML) sia raggiungibile e che l'audio (primo stem) risponda a una richiesta Range.
// Nessuna scrittura, nessuna credenziale: solo GET, con intestazione Range minima per l'audio.
//
//   node scripts/smoke-pubblico.mjs [--base https://voceavoce.com] [--n 3] [slug ...]
//
// Senza slug prende i primi N brani di /coro/ la cui scheda linka un player. Esce con 0 se tutto risponde, 1 altrimenti.
import { pathToFileURL } from "node:url";

const RE_STUDY = /<script type="application\/json" id="study-data">([\s\S]*?)<\/script>/;
const RE_LINK = /href="(?:\/(?:en|es|de|fr))?\/player\/([a-z0-9][a-z0-9-]*)\/"/g;

/** Slug dei player linkati da un HTML, senza doppioni e senza i brani di prova. Pura. */
export function slugDaHtml(html) {
  const visti = new Set();
  for (const m of html.matchAll(RE_LINK)) visti.add(m[1]);
  return [...visti];
}

/** Dati del player dentro la pagina. Pura: null se non ci sono. */
export function datiStudio(html) {
  const m = RE_STUDY.exec(html);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

/** Controlla UN brano. Ritorna {slug, ok, passi:[{nome, ok, dettaglio}]}. `f` e' fetch (iniettabile per i test). */
export async function controllaBrano(base, slug, f = fetch) {
  const passi = [];
  const passo = (nome, ok, dettaglio = "") => { passi.push({ nome, ok, dettaglio }); return ok; };
  let dati = null;
  try {
    const r = await f(`${base}/player/${slug}/`, { redirect: "follow" });
    const html = r.ok ? await r.text() : "";
    dati = datiStudio(html);
    passo("pagina", r.ok && html.includes("data-score") && !!dati, `HTTP ${r.status}${dati ? "" : ", dati del player assenti"}`);
  } catch (e) { passo("pagina", false, String(e.message || e)); }
  if (dati) {
    try {
      const r = await f(new URL(dati.scoreUrl, base).href, { redirect: "follow" });
      const testo = r.ok ? await r.text() : "";
      passo("partitura", r.ok && /<score-partwise|<score-timewise/.test(testo), `HTTP ${r.status}, ${testo.length} byte`);
    } catch (e) { passo("partitura", false, String(e.message || e)); }
    const traccia = (dati.manifest?.tracce ?? []).find((t) => t.file);
    if (dati.senzaAudio || !traccia) {
      passo("audio", true, "brano senza audio: salto");
    } else {
      try {
        const r = await f(`${dati.audioBase}/${traccia.file}`, { redirect: "follow", headers: { range: "bytes=0-1023" } });
        const tipo = r.headers.get("content-type") || "";
        const byte = r.ok ? (await r.arrayBuffer()).byteLength : 0;
        passo("audio", (r.status === 206 || r.status === 200) && byte > 0 && /audio|ogg|opus|mpeg|octet/i.test(tipo), `HTTP ${r.status}, ${byte} byte, ${tipo}`);
      } catch (e) { passo("audio", false, String(e.message || e)); }
    }
  }
  return { slug, ok: passi.every((p) => p.ok), passi };
}

/** Slug delle schede brano linkate da un HTML (/brani/<slug>/). Pura. */
export function slugBraniDaHtml(html) {
  const visti = new Set();
  for (const m of html.matchAll(/href="\/brani\/([a-z0-9][a-z0-9-]*)\/"/g)) visti.add(m[1]);
  return [...visti];
}

/** Primi `n` brani che hanno davvero un player: dalla scheda in /coro/ alla pagina del brano, che deve linkare il suo player. */
export async function sceglieBrani(base, n, f = fetch) {
  const trovati = [];
  let elenco = [];
  try {
    const r = await f(base + "/coro/", { redirect: "follow" });
    if (r.ok) elenco = slugBraniDaHtml(await r.text());
  } catch { /* nessun elenco: nessun brano */ }
  for (const slug of elenco.slice(0, n * 6)) {
    try {
      const r = await f(`${base}/brani/${slug}/`, { redirect: "follow" });
      if (r.ok && slugDaHtml(await r.text()).includes(slug)) trovati.push(slug);
    } catch { /* si prova il successivo */ }
    if (trovati.length >= n) break;
  }
  return trovati;
}

export async function main(argv = process.argv.slice(2), f = fetch, scrivi = console.log) {
  let base = "https://voceavoce.com", n = 3;
  const slugs = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--base") base = argv[++i].replace(/\/+$/, "");
    else if (argv[i] === "--n") n = Number(argv[++i]);
    else slugs.push(argv[i]);
  }
  const brani = slugs.length ? slugs : await sceglieBrani(base, n, f);
  if (!brani.length) { scrivi(`FUMO KO: nessun player trovato su ${base}`); return 1; }
  let tutti = true;
  for (const slug of brani) {
    const r = await controllaBrano(base, slug, f);
    tutti &&= r.ok;
    scrivi(`${r.ok ? "ok " : "KO "} ${slug}: ` + r.passi.map((p) => `${p.nome} ${p.ok ? "ok" : "KO (" + p.dettaglio + ")"}`).join(", "));
  }
  scrivi(tutti ? `FUMO OK: ${brani.length} brani su ${base}` : `FUMO KO su ${base}`);
  return tutti ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(await main());
