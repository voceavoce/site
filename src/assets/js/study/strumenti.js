// Catalogo e campioni degli strumenti (docs/midi-player.md). I campioni stanno in src/assets/strumenti/ (in git,
// generati da tools/strumenti/genera.py): per strumento UN file MP3 con una nota ogni 3 semitoni, in "slot" di
// durata fissa, e strumenti.json con l'indice. Il browser decodifica il file una volta sola.

const BASE = new URL("../../strumenti/", import.meta.url);
const DECODE_RATE = 32000; // la frequenza con cui sono stati resi i campioni
const PREF_KEY = "va-strumenti";

/** Strumento di partenza per tipo di traccia ("voce" | "accompagnamento") e linea ("coro" | "arie" | "metodi"). */
const PREDEFINITI = {
  coro: { voce: "pianoforte", accompagnamento: "organo" },
  arie: { voce: "flauto", accompagnamento: "pianoforte" },
  metodi: { voce: "flauto", accompagnamento: "pianoforte" },
};

/**
 * Strumento per ogni traccia: la preferenza salvata (se esiste ancora nel catalogo) oppure il predefinito della linea.
 * `salvate` = { <chiave|tipo>: id } (le preferenze valgono per tipo: "voce" e "accompagnamento").
 */
export function scegliStrumenti(tracce, linea, ids, salvate = {}) {
  const base = PREDEFINITI[linea] || PREDEFINITI.coro;
  const out = {};
  for (const t of tracce) {
    const tipo = t.tipo === "accompagnamento" ? "accompagnamento" : "voce";
    const wanted = salvate[t.chiave] ?? salvate[tipo];
    out[t.chiave] = ids.includes(wanted) ? wanted : (ids.includes(base[tipo]) ? base[tipo] : ids[0]);
  }
  return out;
}

export function leggiPreferenze() {
  try { return JSON.parse(localStorage.getItem(PREF_KEY) || "{}") || {}; } catch { return {}; }
}
export function salvaPreferenze(p) {
  try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch { /* storage non disponibile */ }
}

export async function caricaCatalogo() {
  const res = await fetch(new URL("strumenti.json", BASE));
  if (!res.ok) throw new Error(`strumenti.json: HTTP ${res.status}`);
  const cat = await res.json();
  if (cat.schema !== 1 || !Array.isArray(cat.strumenti)) throw new Error("strumenti.json fuori contratto");
  return cat;
}

/** Campioni decodificati, uno strumento alla volta (con le richieste in corso condivise). */
export class Campioni {
  constructor(catalogo) {
    this.catalogo = catalogo;
    this.pronti = new Map(); // id -> { def, buffer }
    this.inCorso = new Map(); // id -> Promise
  }
  get(id) { return this.pronti.get(id) || null; }
  def(id) { return this.catalogo.strumenti.find((s) => s.id === id) || null; }
  ids() { return this.catalogo.strumenti.map((s) => s.id); }
  carica(id) {
    if (this.pronti.has(id)) return Promise.resolve(this.pronti.get(id));
    if (!this.inCorso.has(id)) {
      const def = this.def(id);
      if (!def) return Promise.reject(new Error(`Strumento sconosciuto: ${id}`));
      this.inCorso.set(id, (async () => {
        const res = await fetch(new URL(def.file, BASE));
        if (!res.ok) throw new Error(`${def.file}: HTTP ${res.status}`);
        const data = await res.arrayBuffer();
        const buffer = await new OfflineAudioContext(1, 1, DECODE_RATE).decodeAudioData(data);
        const v = { def, buffer };
        this.pronti.set(id, v);
        return v;
      })().finally(() => this.inCorso.delete(id)));
    }
    return this.inCorso.get(id);
  }
}
