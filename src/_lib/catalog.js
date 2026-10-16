// Catalogo: unisce content/generated (pipeline) e content/curated (editoriale) e filtra per data.
// I campi curati vincono. La visibilita' delle voci dipende dall'ora della build (site.buildTime).
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import yaml from "js-yaml";
import site from "../_data/site.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const genDir = path.join(root, "content/generated");
const curDir = path.join(root, "content/curated");

/** Una voce e' visibile se `pubblica` e' true oppure `pubblica_dal` <= now. */
export function isVoiceVisible(voce, now) {
  if (voce.pubblica === true) return true;
  if (!voce.pubblica_dal) return false;
  const d = new Date(voce.pubblica_dal);
  return !Number.isNaN(d.getTime()) && d.getTime() <= new Date(now).getTime();
}

/** Funzione pura: separa le voci in visibili e "in arrivo" (data futura). */
export function splitVoices(voci = [], now = new Date()) {
  const visibili = [];
  const inArrivo = [];
  for (const v of voci) {
    if (isVoiceVisible(v, now)) visibili.push(v);
    else if (v.pubblica_dal) inArrivo.push(v);
  }
  inArrivo.sort((a, b) => new Date(a.pubblica_dal) - new Date(b.pubblica_dal));
  return { visibili, inArrivo };
}

const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const fold = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// "1:23" | 83 | "83" -> secondi
function toSeconds(t) {
  if (typeof t === "number") return Math.max(0, Math.floor(t));
  const parts = String(t ?? "").split(":").map(Number);
  if (!parts.length || parts.some(Number.isNaN)) return null;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}
function normChapters(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((c) => ({ sec: toSeconds(c.t ?? c.tempo ?? c.start ?? c.sec ?? c.secondi), label: c.titolo ?? c.title ?? c.nome ?? c.label ?? "" }))
    .filter((c) => c.sec != null && c.label);
}

function group(pieces, keysOf) {
  const out = {};
  for (const p of pieces) for (const k of keysOf(p)) (out[k] ??= []).push(p);
  return out;
}

export function buildCatalog(now = site.buildTime) {
  const compositori = readJson(path.join(genDir, "compositori.json"));
  const opere = readJson(path.join(genDir, "opere.json"));
  const files = readdirSync(path.join(genDir, "brani")).filter((f) => f.endsWith(".json"));

  const pieces = files.map((f) => {
    const g = readJson(path.join(genDir, "brani", f));
    const cp = path.join(curDir, `${g.slug}.yaml`);
    const c = existsSync(cp) ? yaml.load(readFileSync(cp, "utf8")) || {} : {};
    const { visibili, inArrivo } = splitVoices(g.voci, now);
    const mapVoice = (v) => ({ ...v, capitoli: normChapters(v.capitoli) });
    const dates = visibili.map((v) => new Date(v.pubblica_dal || g.prima_uscita).getTime()).filter((n) => !Number.isNaN(n));
    return {
      ...g,
      generi: c.generi ?? g.generi ?? [],
      nota: { ...(g.nota || {}), ...(c.nota || {}) },
      traduzioni: c.traduzioni || {},
      affiliazioni: (c.affiliazioni || []).filter((a) => a && a.enabled === true),
      percorsi: c.percorsi || [],
      voci: visibili.map(mapVoice), // solo le visibili (cosi' anche card.njk e' corretto)
      vociInArrivo: inArrivo.map(mapVoice),
      noindex: visibili.length === 0,
      ultimaUscita: dates.length ? new Date(Math.max(...dates)).toISOString() : null,
    };
  });

  pieces.sort((a, b) => fold(a.titolo).localeCompare(fold(b.titolo)) || a.slug.localeCompare(b.slug));
  const perSlug = Object.fromEntries(pieces.map((p) => [p.slug, p]));

  const perCompositore = group(pieces, (p) => (p.compositore ? [p.compositore.id] : []));
  const perOpera = group(pieces, (p) => [p.opera?.id, p.raccolta?.id].filter(Boolean));
  const perGenere = group(pieces, (p) => p.generi);
  const perStagione = group(pieces, (p) => p.stagioni || []);
  const perLinea = group(pieces, (p) => [p.linea]);
  for (const list of Object.values(perOpera)) list.sort((a, b) => (a.raccolta?.numero ?? 0) - (b.raccolta?.numero ?? 0));

  const ultimi = pieces.filter((p) => p.ultimaUscita).sort((a, b) => b.ultimaUscita.localeCompare(a.ultimaUscita));
  const inArrivo = pieces
    .filter((p) => p.vociInArrivo.length)
    .map((p) => ({ slug: p.slug, data: p.vociInArrivo[0].pubblica_dal }))
    .sort((a, b) => new Date(a.data) - new Date(b.data))
    .map((x) => perSlug[x.slug]);

  // Brani correlati (stesso compositore / stessa opera o raccolta), max 6, prima quelli con video.
  for (const p of pieces) {
    const score = (q) => (p.opera && q.opera?.id === p.opera.id ? 2 : 0) + (p.raccolta && q.raccolta?.id === p.raccolta.id ? 2 : 0) + (p.compositore && q.compositore?.id === p.compositore.id ? 1 : 0);
    p.correlati = pieces
      .filter((q) => q.slug !== p.slug && score(q) > 0)
      .sort((a, b) => score(b) - score(a) || (b.voci.length > 0) - (a.voci.length > 0))
      .slice(0, 6)
      .map((q) => q.slug);
  }

  // Una voce per (brano x lingua): serve alla paginazione della scheda.
  const schede = pieces.flatMap((piece) => site.langs.map((lang) => ({ slug: piece.slug, lang })));

  return { now, brani: pieces, perSlug, compositori, opere, perCompositore, perOpera, perGenere, perStagione, perLinea, ultimi, inArrivo, schede };
}

