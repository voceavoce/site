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
        const tipo = met.closest("direction-type");
        if (tipo && (d.querySelectorAll("direction-type").length > 1 || d.querySelector("sound"))) tipo.remove();
        else d.remove();
        tolti++;
      }
    }
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
    const tolti = senzaTempiRipetuti(doc);
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
