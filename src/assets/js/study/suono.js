// Pannello «Suono»: sceglie fra gli stem cantati e gli strumenti (note.json + campioni) e lo strumento di ogni traccia.
// Tutto e' caricato su richiesta: chi non usa gli strumenti non scarica nulla (ne' note.json, ne' i campioni).
import { caricaCatalogo, Campioni, scegliStrumenti, leggiPreferenze, salvaPreferenze } from "./strumenti.js";

const $ = (sel, root = document) => root.querySelector(sel);

/**
 * @param {object} o  { data (study-data), engine, manifest, say, labels, onMode }
 * @returns {{ pronto: boolean, passaAStrumenti(): Promise<boolean>, mostra(): void }}
 */
export function creaSuono({ data, engine, manifest, say, labels: L, onMode }) {
  const root = $("[data-sound]");
  const attivo = !!(root && data.noteUrl);
  let catalogo = null, campioni = null, note = null, preparato = null;
  let scelte = {};

  async function prepara() {
    if (preparato) return preparato;
    preparato = (async () => {
      const [cat, res] = await Promise.all([caricaCatalogo(), fetch(data.noteUrl).then((r) => { if (!r.ok) throw new Error(`note.json: HTTP ${r.status}`); return r.json(); })]);
      catalogo = cat;
      note = res;
      campioni = new Campioni(cat);
      const ids = campioni.ids();
      scelte = scegliStrumenti(manifest.tracce, data.linea, ids, leggiPreferenze());
      riempiMenu(ids);
      engine.prepareMidi(note, campioni, scelte, manifest.tracce);
      await carica(new Set(Object.values(scelte)));
    })();
    preparato.catch(() => { preparato = null; }); // un errore (rete) non blocca un nuovo tentativo
    return preparato;
  }

  function riempiMenu(ids) {
    const lang = data.lang;
    for (const sel of root.querySelectorAll("[data-instr]")) {
      sel.replaceChildren(...ids.map((id) => {
        const o = document.createElement("option");
        o.value = id;
        o.textContent = campioni.def(id).nome[lang] || campioni.def(id).nome.it || id;
        return o;
      }));
      sel.value = scelte[sel.dataset.instr];
      sel.addEventListener("change", async () => {
        const chiave = sel.dataset.instr, id = sel.value;
        const pref = leggiPreferenze();
        pref[chiave] = id; // per traccia; in mancanza vale lo strumento predefinito del tipo (scegliStrumenti)
        salvaPreferenze(pref);
        scelte[chiave] = id;
        await caricaSceglie(id);
      });
    }
  }

  async function carica(idSet) {
    say(L.soundLoading);
    try {
      await Promise.all([...idSet].map((id) => campioni.carica(id)));
    } catch (e) {
      console.error(e);
      say(L.errInstr);
      throw e;
    }
  }
  async function caricaSceglie(id) {
    try { await carica(new Set([id])); } catch { return; }
    for (const [k, v] of Object.entries(scelte)) engine.setStrumento(k, v);
    say(L.soundInstrOn);
  }

  /** Passa alla modalita' strumenti (carica quel che serve). Ritorna true se riuscito. */
  async function passaAStrumenti() {
    try { await prepara(); } catch { return false; }
    for (const [k, v] of Object.entries(scelte)) engine.setStrumento(k, v);
    engine.setMode("midi");
    root.querySelector("[data-sound-instr]").hidden = false;
    const r = root.querySelector('[data-sound-mode][value="midi"]');
    if (r) r.checked = true;
    onMode?.("midi");
    return true;
  }

  function passaACantato() {
    engine.setMode("audio");
    root.querySelector("[data-sound-instr]").hidden = true;
    onMode?.("audio");
  }

  if (attivo) {
    for (const r of root.querySelectorAll("[data-sound-mode]")) {
      r.addEventListener("change", async () => {
        if (!r.checked) return;
        if (r.value === "midi") {
          if (await passaAStrumenti()) say(L.soundInstrOn);
          else root.querySelector('[data-sound-mode][value="audio"]').checked = true;
        } else { passaACantato(); say(L.soundSungOn); }
      });
    }
  }

  return {
    attivo,
    /** Mostra il pannello (audio cantato pronto). */
    mostra() { if (attivo) root.hidden = false; },
    passaAStrumenti,
    /** L'audio cantato non c'e': si va agli strumenti e non si puo' tornare indietro (la scelta «Cantato» si disattiva). */
    async fallback() {
      if (!attivo) return false;
      const ok = await passaAStrumenti();
      if (!ok) return false;
      root.hidden = false;
      root.querySelector('[data-sound-mode][value="audio"]').disabled = true;
      return true;
    },
  };
}
