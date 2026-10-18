// Traduzioni dei testi comuni (Kyrie, Ave Maria, ...), allineate per frase.
// content/curated/_comuni/<comune>.yaml elenca frasi {la, it, en, es, de, fr}: a build, il testo
// cantato di un brano (parziale, con ripetizioni o a capo diversi) si abbina alle frasi e la
// traduzione si compone solo con quelle trovate. Le traduzioni per brano (curated/<slug>.yaml) vincono.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

export const LINGUE = ["it", "en", "es", "de", "fr"];
export const COPERTURA_MINIMA = 0.7;

/** Parole normalizzate: minuscole, senza accenti e punteggiatura, ae/oe sciolti, j=i, v=u. */
export function parole(s) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/œ/g, "oe")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/j/g, "i")
    .replace(/v/g, "u")
    .split(/[^a-z]+/)
    .filter(Boolean);
}

/** Legge content/curated/_comuni/*.yaml -> { comune: { credit, license, righe[] } } (con le parole precalcolate). */
export function caricaComuni(dir) {
  const out = {};
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir).filter((n) => /\.ya?ml$/.test(n)).sort()) {
    const d = yaml.load(readFileSync(path.join(dir, f), "utf8")) || {};
    const chiave = d.comune || f.replace(/\.ya?ml$/, "");
    out[chiave] = {
      credit: d.credit,
      license: d.license,
      righe: (d.righe || []).map((r) => ({
        ...r,
        chiavi: [r.la, ...(r.alt || [])].map(parole).filter((w) => w.length),
      })),
    };
  }
  return out;
}

/**
 * Compone le traduzioni di un testo cantato. Ritorna { it: {testo, credit, license, reviewed:false}, ... }
 * oppure {} se la copertura delle parole e' sotto la soglia.
 */
export function traduciComune(testo, comune, soglia = COPERTURA_MINIMA) {
  const w = parole(testo);
  if (!w.length || !comune?.righe?.length) return {};
  const cand = comune.righe
    .flatMap((r) => r.chiavi.map((k) => ({ r, k })))
    .sort((a, b) => b.k.length - a.k.length);
  const trovate = [];
  let coperte = 0;
  for (let i = 0; i < w.length; ) {
    const m = cand.find(({ k }) => k.every((x, j) => w[i + j] === x));
    if (m) {
      trovate.push(m.r);
      coperte += m.k.length;
      i += m.k.length;
    } else i++;
  }
  if (!trovate.length || coperte / w.length < soglia) return {};
  const out = {};
  for (const lingua of LINGUE) {
    if (trovate.some((r) => !r[lingua])) continue;
    out[lingua] = {
      testo: trovate.map((r) => r[lingua]).join("\n"),
      credit: comune.credit,
      license: comune.license,
      reviewed: false,
    };
  }
  return out;
}
