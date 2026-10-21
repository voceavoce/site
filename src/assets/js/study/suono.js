// Pannello «Suono»: per ogni traccia si sceglie fra lo stem cantato e uno strumento (note.json + campioni). I due
// pulsanti «Cantato» / «Strumenti» impostano tutte le tracce insieme; scegliendo voce per voce si puo' mescolare
// (per esempio la propria voce suonata dal pianoforte e le altre cantate).
// Tutto e' caricato su richiesta: note.json e i campioni si scaricano solo quando si sceglie uno strumento.
import { caricaCatalogo, Campioni, scegliStrumenti, leggiPreferenze, salvaPreferenze } from "./strumenti.js";

const $ = (sel, root = document) => root.querySelector(sel);
const CANTATO = "cantato";

/**
 * @param {object} o  { data (study-data), engine, manifest, say, labels, onMode }
 */
export function creaSuono({ data, engine, manifest, say, labels: L, onMode }) {
  const root = $("[data-sound]");
  const attivo = !!(root && data.noteUrl);
  let campioni = null, note = null, preparato = null, catalogoPromise = null;
  let scelte = {}; // strumento per traccia (l'ultimo scelto o il predefinito)
  const menu = () => (root ? [...root.querySelectorAll("[data-instr]")] : []);

  function catalogo() {
    if (!catalogoPromise) {
      catalogoPromise = caricaCatalogo().then((cat) => {
        campioni = new Campioni(cat);
        scelte = scegliStrumenti(manifest.tracce, data.linea, campioni.ids(), leggiPreferenze());
        riempiMenu();
        return cat;
      });
      catalogoPromise.catch(() => { catalogoPromise = null; });
    }
    return catalogoPromise;
  }

  function riempiMenu() {
    const ids = campioni.ids();
    for (const sel of menu()) {
      const opzioni = [];
      if (engine.hasAudio()) opzioni.push(opzione(CANTATO, L.soundSungOpt));
      for (const id of ids) opzioni.push(opzione(id, campioni.def(id).nome[data.lang] || campioni.def(id).nome.it || id));
      sel.replaceChildren(...opzioni);
      sel.value = engine.tracks.get(sel.dataset.instr)?.mode === "midi" ? scelte[sel.dataset.instr] : (engine.hasAudio() ? CANTATO : scelte[sel.dataset.instr]);
      sel.addEventListener("change", () => cambia(sel));
    }
  }
  const opzione = (value, testo) => { const o = document.createElement("option"); o.value = value; o.textContent = testo; return o; };

  /** note.json e campioni degli strumenti scelti (una volta; le richieste ripetute si uniscono). */
  async function prepara(ids) {
    await catalogo();
    if (!ids) ids = new Set(Object.values(scelte)); // null = gli strumenti di tutte le tracce
    if (!preparato) {
      preparato = (async () => {
        const r = await fetch(data.noteUrl);
        if (!r.ok) throw new Error(`note.json: HTTP ${r.status}`);
        note = await r.json();
        engine.prepareMidi(note, campioni, scelte, manifest.tracce);
      })();
      preparato.catch(() => { preparato = null; });
    }
    await preparato;
    say(L.soundLoading);
    try { await Promise.all([...ids].map((id) => campioni.carica(id))); } catch (e) { console.error(e); say(L.errInstr); throw e; }
  }

  async function cambia(sel) {
    const chiave = sel.dataset.instr;
    if (sel.value === CANTATO) { engine.setTrackModes({ [chiave]: "audio" }); aggiorna(); say(L.soundSungOn); return; }
    const id = sel.value;
    try { await prepara(new Set([id])); } catch { sel.value = CANTATO; aggiorna(); return; }
    scelte[chiave] = id;
    const pref = leggiPreferenze();
    pref[chiave] = id; // per traccia; in mancanza vale il predefinito del tipo (scegliStrumenti)
    salvaPreferenze(pref);
    engine.setStrumento(chiave, id);
    engine.setTrackModes({ [chiave]: "midi" });
    aggiorna();
    say(L.soundInstrOn);
  }

  /** Allinea pulsanti, menu e interfaccia al modo attuale del motore. */
  function aggiorna() {
    const modo = engine.mode;
    for (const r of root.querySelectorAll("[data-sound-mode]")) r.checked = r.value === modo;
    for (const sel of menu()) {
      const tr = engine.tracks.get(sel.dataset.instr);
      if (tr?.mode === "midi") sel.value = scelte[sel.dataset.instr];
      else if (engine.hasAudio()) sel.value = CANTATO;
    }
    onMode?.(modo);
  }

  /** Tutte le tracce agli strumenti (ultima scelta o predefinito). Ritorna true se riuscito. */
  async function passaAStrumenti() {
    try { await prepara(null); } catch { return false; }
    for (const [k, v] of Object.entries(scelte)) engine.setStrumento(k, v);
    engine.setMode("midi");
    aggiorna();
    return true;
  }

  function passaACantato() { engine.setMode("audio"); aggiorna(); }

  if (attivo) {
    for (const r of root.querySelectorAll("[data-sound-mode]")) {
      r.addEventListener("change", async () => {
        if (!r.checked) return;
        if (r.value === "midi") {
          if (await passaAStrumenti()) say(L.soundInstrOn); else aggiorna();
        } else { passaACantato(); say(L.soundSungOn); }
      });
    }
  }

  return {
    attivo,
    /** Mostra il pannello (audio cantato pronto) e prepara i menu: il catalogo e' piccolo, il resto si scarica alla scelta. */
    async mostra() {
      if (!attivo) return;
      try { await catalogo(); } catch { return; } // senza catalogo il pannello resta nascosto
      root.hidden = false;
    },
    passaAStrumenti,
    /** L'audio cantato non c'e': si va agli strumenti e non si puo' tornare indietro (l'opzione «Cantato» si toglie). */
    async fallback() {
      if (!attivo) return false;
      const ok = await passaAStrumenti();
      if (!ok) return false;
      root.hidden = false;
      root.querySelector('[data-sound-mode][value="audio"]').disabled = true;
      for (const o of root.querySelectorAll(`option[value="${CANTATO}"]`)) o.remove();
      return true;
    },
  };
}
