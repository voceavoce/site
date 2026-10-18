// Dati del player di studio: legge content/player/<slug>/{manifest.json, sync.json, score.musicxml}.
// Gli slug che iniziano con "_" sono dati di PROVA (content/player/_prova): in produzione
// (ELEVENTY_ENV=production) vengono ignorati; altrove la pagina e' noindex e nessun link la raggiunge.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { isSafeRelativePath } from "../assets/js/study/config.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const PLAYER_DIR = path.join(root, "content/player");

export const isTestSlug = (slug) => slug.startsWith("_");

/** Controlla il contratto di docs/player.md: errori in build se un percorso non e' relativo o mancano i campi. */
export function checkManifest(slug, m, sync) {
  const fail = (msg) => { throw new Error(`content/player/${slug}: ${msg}`); };
  if (m.schema !== 1) fail(`schema ${m.schema} non supportato`);
  if (m.slug !== slug) fail(`slug "${m.slug}" diverso dalla cartella`);
  if (!Array.isArray(m.tracce) || !m.tracce.length) fail("nessuna traccia");
  for (const t of m.tracce) {
    for (const k of ["voce", "chiave", "file"]) if (!t[k]) fail(`traccia senza "${k}"`);
    for (const k of ["file", "riserva"]) if (t[k] != null && !isSafeRelativePath(t[k])) fail(`percorso non relativo in tracce[].${k}: ${t[k]}`);
  }
  if (!Array.isArray(sync.battute) || !sync.battute.length || typeof sync.fine !== "number") fail("sync.json non valido");
  let prev = -1;
  for (const b of sync.battute) { if (!(b.t >= prev)) fail("sync.json: tempi non crescenti"); prev = b.t; }
}

/**
 * Il player di OGNI brano con i dati pronti viene costruito, pubblicato o no: la pagina e' sempre noindex e il suo
 * indirizzo e' prevedibile, cosi' il link nella descrizione del video funziona dal primo minuto. Resta "nascosto" finche'
 * il brano non e' uscito: nessun link lo raggiunge (`linked`), non e' in sitemap ne' nella ricerca.
 * `pubblicati`: insieme degli slug con almeno una voce gia' visibile (video pubblicato); solo questi hanno il link dalla
 * scheda del brano (alla build dopo la data di uscita). Senza `pubblicati` (sviluppo) tutti i brani veri sono linkati.
 */
export function loadStudio({ dir = PLAYER_DIR, production = process.env.ELEVENTY_ENV === "production", langs = ["it", "en", "es", "de", "fr"], pubblicati = null } = {}) {
  const items = {};
  if (existsSync(dir)) {
    for (const d of readdirSync(dir, { withFileTypes: true })) {
      if (!d.isDirectory() || (production && isTestSlug(d.name))) continue;
      const mp = path.join(dir, d.name, "manifest.json");
      if (!existsSync(mp)) continue;
      const manifest = JSON.parse(readFileSync(mp, "utf8"));
      const sync = JSON.parse(readFileSync(path.join(dir, d.name, manifest.sync || "sync.json"), "utf8"));
      const scoreFile = manifest.partitura || "score.musicxml";
      checkManifest(d.name, manifest, sync);
      if (!existsSync(path.join(dir, d.name, scoreFile))) throw new Error(`content/player/${d.name}: manca ${scoreFile}`);
      items[d.name] = { slug: d.name, manifest, sync, scoreFile, test: isTestSlug(d.name), pubblicato: !pubblicati || pubblicati.has(d.name) };
    }
  }
  const slugs = Object.keys(items).sort();
  return {
    items,
    slugs,
    /** Slug con link dalla scheda del brano: solo i brani veri e gia' usciti, mai quelli di prova ne' le anteprime. */
    linked: Object.fromEntries(slugs.filter((s) => !items[s].test && items[s].pubblicato).map((s) => [s, true])),
    schede: slugs.flatMap((slug) => langs.map((lang) => ({ slug, lang }))),
  };
}
