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

const NOMI_NOTA = {
  do: { C: "Do", D: "Re", E: "Mi", F: "Fa", G: "Sol", A: "La", B: "Si" },
  abc: { C: "C", D: "D", E: "E", F: "F", G: "G", A: "A", B: "B" },
};

/** Nome di una nota ("Do", "Fa♯", "B♭") dal suo <pitch>; null se manca lo step. L'alterazione e' quella esplicita del file, non l'armatura. */
export function nomeNota(pitch, sistema) {
  const tabella = NOMI_NOTA[sistema];
  const base = tabella?.[pitch.querySelector("step")?.textContent.trim()];
  if (!base) return null;
  const alt = Math.round(parseFloat(pitch.querySelector("alter")?.textContent));
  if (!Number.isFinite(alt) || alt === 0) return base;
  return base + (alt > 0 ? "\u266F" : "\u266D").repeat(Math.min(2, Math.abs(alt)));
}

/**
 * Al posto delle parole mette il nome di ogni nota (`sistema`: "do" = Do Re Mi, "abc" = C D E), per esercitarsi nel
 * solfeggio. Toglie TUTTI i versi e scrive un solo <lyric> "single" per nota (cosi' Verovio non disegna trattini ne'
 * linee di melisma). Regole:
 *  - solo le voci cantate: le parti che avevano il testo. Il pianoforte o l'organo dell'accompagnamento restano senza
 *    nomi. Se nessuna parte ha testo si nominano le prime `nVoci` (le voci del manifest, dall'alto), altrimenti niente;
 *  - la nota legata a quella prima (<tie type="stop">) non ripete il nome; le note di un accordo stanno sotto la prima
 *    ("Do/Mi"); pause e abbellimenti restano senza nome;
 *  - piu' voci sullo stesso rigo: la seconda scrive sulla riga 2, la terza sulla 3 (altrimenti i nomi si sovrapporrebbero);
 *  - solo le coloriture: semicrome (o piu' brevi) in fila in un rigo a voce sola alternano i nomi fra la riga 1 e la 2,
 *    cosi' le note fitte non allargano la battuta; crome e valori piu' lunghi stanno sempre sulla riga 1.
 * Ritorna quanti nomi ha scritto (0 = sistema sconosciuto o nessuna nota: il documento non e' stato toccato).
 */
export function nomiNote(doc, sistema, nVoci = 0) {
  if (!NOMI_NOTA[sistema]) return 0;
  const parti = [...doc.querySelectorAll("part")];
  if (!parti.some((p) => p.querySelector("note > pitch"))) return 0;
  const conTesto = parti.filter((p) => p.querySelector("note > lyric"));
  const daNominare = conTesto.length ? conTesto : parti.slice(0, nVoci); // senza testo: le prime `nVoci` parti, dall'alto (le voci)
  if (!daNominare.length) return 0;
  for (const l of doc.querySelectorAll("note > lyric")) l.remove();
  let scritti = 0;
  for (const parte of daNominare) {
    let divisioni = 1;
    const voci = new Map(); // "rigo|voce" -> posizione della voce nel rigo (1, 2, 3)
    const perRigo = new Map();
    for (const n of parte.querySelectorAll("note")) {
      if (n.querySelector(":scope > rest")) continue;
      const rigo = n.querySelector(":scope > staff")?.textContent.trim() ?? "1";
      const v = n.querySelector(":scope > voice")?.textContent.trim() ?? "1";
      const k = `${rigo}|${v}`;
      if (!voci.has(k)) { const n0 = perRigo.get(rigo) ?? 0; perRigo.set(rigo, n0 + 1); voci.set(k, n0 + 1); }
    }
    let ultima = null;      // l'ultimo <text> scritto: li' si accodano le note dell'accordo
    const veloce = new Map(); // "rigo|voce" -> true se la nota nominata prima era veloce e sulla riga 1
    for (const el of parte.querySelectorAll("measure > attributes > divisions, measure > note")) {
      if (el.localName === "divisions") { divisioni = parseFloat(el.textContent) || divisioni; continue; }
      const n = el;
      const pitch = n.querySelector(":scope > pitch");
      const accordo = !!n.querySelector(":scope > chord");
      if (!pitch || n.querySelector(":scope > grace")) { if (!accordo) ultima = null; continue; }
      const nome = nomeNota(pitch, sistema);
      if (!nome) continue;
      if (accordo) {
        if (ultima) ultima.textContent += `/${nome}`;
        continue;
      }
      ultima = null;
      if ([...n.querySelectorAll(":scope > tie")].some((t) => t.getAttribute("type") === "stop")) continue;
      const rigo = n.querySelector(":scope > staff")?.textContent.trim() ?? "1";
      const k = `${rigo}|${n.querySelector(":scope > voice")?.textContent.trim() ?? "1"}`;
      let riga = voci.get(k) ?? 1;
      if (perRigo.get(rigo) === 1) { // rigo a voce sola: le coloriture (semicrome in fila) si alternano su due righe
        const dur = parseFloat(n.querySelector(":scope > duration")?.textContent);
        const breve = Number.isFinite(dur) && dur / divisioni <= 0.25; // semicroma o piu' breve
        const prima = veloce.get(k);            // undefined = la nota prima non era veloce; 1 o 2 = riga che ha usato
        riga = breve && prima === 1 ? 2 : 1;
        if (breve) veloce.set(k, riga); else veloce.delete(k);
      }
      const lyric = doc.createElement("lyric");
      lyric.setAttribute("number", String(riga));
      const sill = doc.createElement("syllabic");
      sill.textContent = "single";
      const testo = doc.createElement("text");
      testo.textContent = nome;
      lyric.append(sill, testo);
      n.append(lyric);
      ultima = testo;
      scritti++;
    }
  }
  return scritti;
}

/**
 * Il MusicXML pronto per Verovio: tempi non ripetuti e righi etichettati con la sigla della voce (S, A, T, B, S1...).
 * Le sigle sono quelle del manifest (`voci`, dall'alto) se sono tante quante le parti; altrimenti l'iniziale del nome
 * della parte, ma solo quando le abbreviazioni del file non sono gia' tutte diverse. Vale sia sul primo rigo (dove il
 * file puo' nascondere il nome: si toglie print-object) sia dai successivi.
 * `testo`: "parole" (default, le parole del brano), "do" (Do Re Mi) o "abc" (C D E): vedi nomiNote.
 */
export function abbreviaParti(xml, voci = [], { testo = "parole" } = {}) {
  try {
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    if (doc.querySelector("parsererror")) return xml;
    const tolti = senzaTempiRipetuti(doc) + tempiRadi(doc) + senzaTestiLunghi(doc) + chiaviOttavate(doc) + nomiNote(doc, testo, Array.isArray(voci) ? voci.length : 0);
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
