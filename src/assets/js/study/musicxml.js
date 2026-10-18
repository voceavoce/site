// Correzioni al MusicXML PRIMA che Verovio lo disegni. Usano DOMParser/XMLSerializer del browser (nei test, jsdom).
// I file arrivano dal catalogo (PDMX/MuseScore) e hanno difetti noti che sulla partitura si vedono:
//   - lo stesso segno di tempo scritto piu' volte nella stessa battuta, o in ogni parte;
//   - etichette dei righi inutili: abbreviazioni uguali per tutte le voci ("Ch"), nome dello strumento di sintesi
//     ("ARIA Player"), nomi nascosti.
// Ogni funzione, se qualcosa non torna (XML non valido, struttura inattesa), restituisce il testo originale.

/** "Soprano 2" -> "S2", "tenor" -> "T"; null se il nome non comincia con una lettera. */
export function siglaDaNome(nome) {
  const m = String(nome ?? "").trim().match(/^(\p{L})\p{L}*\s*(\d+)?/u);
  return m ? m[1].toUpperCase() + (m[2] || "") : null;
}

/**
 * Tiene un solo segno di tempo (♩ = 120) per battuta, sulla prima parte che lo ha: Verovio disegna tutti quelli che
 * trova, uno sopra l'altro. Toglie solo il segno visibile (il <direction-type> col metronomo): un eventuale
 * <sound tempo> resta, non si disegna. Ritorna quanti segni ha tolto.
 */
export function senzaTempiRipetuti(doc) {
  const visti = new Set();
  let tolti = 0;
  for (const parte of doc.querySelectorAll("part")) {
    for (const m of parte.querySelectorAll(":scope > measure")) {
      for (const d of m.querySelectorAll(":scope > direction")) {
        const met = d.querySelector("metronome");
        if (!met) continue;
        const chiave = `${m.getAttribute("number")}|${met.textContent.replace(/\s+/g, " ").trim()}`;
        if (!visti.has(chiave)) { visti.add(chiave); continue; }
        togliTipo(d, met.closest("direction-type"));
        tolti++;
      }
    }
  }
  return tolti;
}

/**
 * Ripulisce i segni di metronomo (= 90): il valore si arrotonda all'intero (nei file nati da un'esportazione escono
 * cose come 91.9998) e si tiene il primo segno e poi solo i cambi di tempo veri, cioe' di almeno `soglia` (10%) e a
 * `distanza` battute dall'ultimo segno mostrato. Con un rallentando scritto battuta per battuta (90, 85.0002, 82...)
 * restano pochi segni leggibili invece di una pila sovrapposta. Il <sound tempo> non si tocca: la riproduzione e' un'altra.
 * Le decisioni si prendono sulla prima parte che ha metronomi e valgono per tutte (per numero di battuta).
 * Ritorna quanti segni ha tolto.
 */
export function tempiRadi(doc, { soglia = 0.1, distanza = 4 } = {}) {
  const decisioni = new Map(); // numero di battuta -> true (si tiene) / false (si toglie)
  let ultimo = null, tolti = 0;
  for (const parte of doc.querySelectorAll("part")) {
    let n = 0;
    for (const m of parte.querySelectorAll(":scope > measure")) {
      n++;
      const chiaveM = m.getAttribute("number") ?? String(n);
      for (const d of m.querySelectorAll(":scope > direction")) {
        const met = d.querySelector("metronome");
        const pm = met?.querySelector("per-minute");
        if (!met || !pm) continue;
        const bpm = parseFloat(pm.textContent);
        if (!Number.isFinite(bpm)) continue;
        if (!decisioni.has(chiaveM)) {
          const tieni = !ultimo || (Math.abs(bpm - ultimo.bpm) / ultimo.bpm >= soglia && n - ultimo.n >= distanza);
          decisioni.set(chiaveM, tieni);
          if (tieni) ultimo = { bpm, n };
        }
        if (decisioni.get(chiaveM)) pm.textContent = String(Math.round(bpm));
        else { togliTipo(d, met.closest("direction-type")); tolti++; }
      }
    }
  }
  return tolti;
}

/**
 * Una parte scritta in chiave di violino ma che canta quasi tutta sotto il do centrale (il tenore: mi3-fa4) si
 * disegnerebbe sotto il rigo, su tagli addizionali. Si usa la chiave di violino «ottavata» (8 sotto), come si
 * scrive il tenore: le altezze nel file restano quelle vere (l'audio non cambia), cambia solo dove si disegnano.
 * Si tocca solo con almeno 8 note e la mediana sotto il do4; chiavi che hanno gia' un'ottava non si toccano.
 * Ritorna quante chiavi ha cambiato.
 */
export function chiaviOttavate(doc) {
  const NOTE = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };
  const DO4 = 4 * 7;
  let cambiate = 0;
  for (const parte of doc.querySelectorAll("part")) {
    const alt = [];
    for (const p of parte.querySelectorAll("note > pitch")) {
      const step = NOTE[p.querySelector("step")?.textContent.trim()], ott = parseInt(p.querySelector("octave")?.textContent, 10);
      if (step !== undefined && Number.isFinite(ott)) alt.push(ott * 7 + step);
    }
    if (alt.length < 8) continue;
    alt.sort((a, b) => a - b);
    if (alt[Math.floor(alt.length / 2)] >= DO4) continue;
    for (const c of parte.querySelectorAll("clef")) {
      if (c.querySelector("sign")?.textContent.trim() !== "G" || c.querySelector("clef-octave-change")) continue;
      const o = doc.createElement("clef-octave-change");
      o.textContent = "-1";
      (c.querySelector("line") ?? c.querySelector("sign")).after(o);
      cambiate++;
    }
  }
  return cambiate;
}

/** Toglie dal MusicXML l'elemento visibile `tipo` (un <direction-type>) lasciando il resto della <direction> se serve. */
function togliTipo(d, tipo) {
  if (tipo && (d.querySelectorAll("direction-type").length > 1 || d.querySelector("sound"))) tipo.remove();
  else d.remove();
}

/**
 * Toglie le scritte (<words>) piu' lunghe di `max` caratteri: sono traduzioni o note editoriali ("Translation: ...") che
 * Verovio disegna su una riga sola e che escono dalla pagina, facendo scorrere la partitura di lato. Le indicazioni
 * normali (Allegro, dolce, con espressione) sono molto piu' corte. Ritorna quante ne ha tolte.
 */
export function senzaTestiLunghi(doc, max = 60) {
  let tolti = 0;
  for (const w of [...doc.querySelectorAll("direction > direction-type > words")]) {
    if (w.textContent.replace(/\s+/g, " ").trim().length <= max) continue;
    const tipo = w.parentElement;
    const d = tipo.parentElement;
    if (tipo.children.length > 1) w.remove();
    else togliTipo(d, tipo);
    tolti++;
  }
  return tolti;
}

/**
 * Il MusicXML pronto per Verovio: tempi non ripetuti e righi etichettati con la sigla della voce (S, A, T, B, S1...).
 * Le sigle sono quelle del manifest (`voci`, dall'alto) se sono tante quante le parti; altrimenti l'iniziale del nome
 * della parte, ma solo quando le abbreviazioni del file non sono gia' tutte diverse. Vale sia sul primo rigo (dove il
 * file puo' nascondere il nome: si toglie print-object) sia dai successivi.
 */
export function abbreviaParti(xml, voci = []) {
  try {
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    if (doc.querySelector("parsererror")) return xml;
    const tolti = senzaTempiRipetuti(doc) + tempiRadi(doc) + senzaTestiLunghi(doc) + chiaviOttavate(doc);
    const fuori = () => (tolti ? new XMLSerializer().serializeToString(doc) : xml);
    const parti = [...doc.querySelectorAll("score-part")];
    if (parti.length < 2) return fuori();
    const dalManifest = Array.isArray(voci) && voci.length === parti.length;
    let sigle;
    if (dalManifest) sigle = voci.map((v) => (v == null ? "" : String(v).trim()));
    else {
      const ab = parti.map((p) => p.querySelector("part-abbreviation")?.textContent.trim() ?? "");
      if (ab.every(Boolean) && new Set(ab).size === ab.length) return fuori();
      sigle = parti.map((p) => siglaDaNome(p.querySelector("part-name")?.textContent));
    }
    parti.forEach((p, i) => {
      if (!sigle[i]) return;
      let nome = p.querySelector("part-name");
      if (!nome) { nome = doc.createElement("part-name"); p.prepend(nome); }
      let ab = p.querySelector("part-abbreviation");
      if (!ab) { ab = doc.createElement("part-abbreviation"); nome.after(ab); }
      nome.textContent = ab.textContent = sigle[i];
      nome.removeAttribute("print-object");
    });
    return new XMLSerializer().serializeToString(doc);
  } catch {
    return xml;
  }
}
