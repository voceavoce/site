// Funzioni di formattazione condivise tra filtri Nunjucks e dati delle pagine.
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../_data/i18n");
const i18n = {};
for (const f of readdirSync(dir).filter((n) => n.endsWith(".json"))) {
  i18n[f.replace(/\.json$/, "")] = JSON.parse(readFileSync(path.join(dir, f), "utf8"));
}

export function t(key, lang, vars) {
  const get = (l) => key.split(".").reduce((o, k) => (o == null ? o : o[k]), i18n[l]);
  let s = get(lang) ?? get("it") ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v);
  return s;
}

const cap = (s) => (s ? s[0].toLocaleUpperCase() + s.slice(1) : s);
const ROMAN = ["", "I", "II", "III", "IV", "V", "VI"];

/** Nome esteso di una voce: S -> Soprano; T1 -> Tenore I; alta -> Voce alta. */
export function voiceName(code, lang) {
  const m = /^([SATB])(\d)?(')?$/.exec(code);
  if (!m) return t(`voice.${code}`, lang);
  const base = t(`voice.${m[1]}`, lang);
  return m[2] ? `${base} ${ROMAN[+m[2]] || m[2]}${m[3] ? "′" : ""}` : base;
}

export function langLabel(code, lang) {
  try {
    return cap(new Intl.DisplayNames([lang], { type: "language" }).of(code) || code);
  } catch {
    return code;
  }
}

export function dateLong(iso, lang) {
  return new Intl.DateTimeFormat(lang, { dateStyle: "long", timeZone: "UTC" }).format(new Date(iso));
}
export const isoDay = (iso) => new Date(iso).toISOString().slice(0, 10);

const SOL = { C: "Do", D: "Re", E: "Mi", F: "Fa", G: "Sol", A: "La", B: "Si" };
const SOL_FR = { ...SOL, D: "Ré" };
export function tonality(ton, lang) {
  if (!ton?.tonica) return "";
  const letter = ton.tonica[0];
  const acc = ton.tonica.slice(1).replace("b", "♭").replace("#", "♯");
  if (lang === "de") {
    // Notazione tedesca: B naturale = H, Si bemolle = B.
    const flatB = letter === "B" && acc === "♭";
    const name = letter === "B" ? (flatB ? "B" : "H") : letter;
    return `${name}${flatB ? "" : acc}-${t(`mode.${ton.modo}`, lang)}`;
  }
  const name = lang === "en" ? letter : (lang === "fr" ? SOL_FR : SOL)[letter] || letter;
  return `${name}${acc} ${t(`mode.${ton.modo}`, lang)}`;
}

/** Testo cantato -> strofe (righe vuote) -> versi. */
export function stanzas(text) {
  return String(text || "").trim().split(/\n\s*\n/).map((s) => s.split("\n").map((l) => l.trimEnd()));
}

export function clock(sec) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const p = (n) => String(n).padStart(2, "0");
  return h ? `${h}:${p(m)}:${p(s)}` : `${m}:${p(s)}`;
}
export const isoDuration = (sec) => `PT${Math.floor(sec / 60)}M${sec % 60}S`;

export function pieceTitle(piece) {
  return piece.titolo_breve ? `${piece.titolo} (${piece.titolo_breve})` : piece.titolo;
}
export function composerName(piece, lang) {
  return piece.compositore ? piece.compositore.nome : t("card.anon", lang);
}

export function pieceDescription(piece, lang) {
  const parts = [t("piece.descr.base", lang, { title: piece.titolo, composer: composerName(piece, lang) })];
  if (piece.organico) parts.push(t("piece.descr.org", lang, { org: piece.organico }));
  if (piece.voci.length) parts.push(t("piece.descr.voices", lang, { voices: piece.voci.map((v) => voiceName(v.voce, lang)).join(", ") }));
  else parts.push(t("piece.descr.soon", lang));
  return parts.join(" ");
}

/** "1 brano" / "12 brani" (chiavi lists.count.one / other). */
export function countLabel(n, lang) {
  return t(n === 1 ? "lists.count.one" : "lists.count.other", lang, { n });
}

/** Nome tradotto di un'entita' di elenco (genere, stagione). */
export function genreName(id, lang) { return t(`genres.${id}`, lang); }
export function seasonName(id, lang) { return t(`seasons.${id}`, lang); }
