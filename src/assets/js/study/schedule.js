// Pianificazione delle note per gli strumenti: funzioni PURE (nessun DOM, nessun Web Audio), testate con node:test.
//
// `notes` e' l'elenco di una parte di note.json: [[inizio_ms, durata_ms, altezza, velocita'?], ...] ordinato per inizio.
// La velocita' (1-127, come in MIDI) e' facoltativa: senza, vale VEL_PREDEFINITA (mf).
// Il tempo di partitura e' quello del sync (s); il tempo del contesto audio (`ctx`) e' quello di AudioContext.
// Relazione: ctx = ctxCursor + (tempoPartitura - scoreCursor) / velocita'.

export const VEL_PREDEFINITA = 80;

/**
 * Guadagno (moltiplicatore, 1 = mf) per una velocita' MIDI: curva (v/80)^0.9, limitata fra 0,3 e 1,5 (escursione
 * moderata: gran parte dei brani ha dinamiche fra p e mf e non deve suonare troppo piano). pp (33) ~0,45,
 * p (49) ~0,64, mf (80) = 1, f (96) ~1,18, ff (112) ~1,36.
 */
export function guadagnoVelocita(vel) {
  const v = Number.isFinite(+vel) && vel > 0 ? +vel : VEL_PREDEFINITA;
  return Math.min(1.5, Math.max(0.3, Math.pow(v / VEL_PREDEFINITA, 0.9)));
}

/** Indice della prima nota che inizia a `t` secondi o dopo (ricerca binaria). */
export function firstAtOrAfter(notes, t) {
  const ms = t * 1000;
  let lo = 0, hi = notes.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (notes[mid][0] < ms) lo = mid + 1; else hi = mid;
  }
  return lo;
}

/**
 * Note da programmare con inizio in [a, b) secondi. Se c'e' un loop, la durata e' tagliata alla fine del loop
 * (la nota non deve sconfinare oltre il punto in cui si torna indietro).
 * Ritorna { start, dur, midi } in secondi.
 */
export function inRange(notes, a, b, loopEnd = Infinity) {
  const out = [];
  for (let i = firstAtOrAfter(notes, a); i < notes.length && notes[i][0] < b * 1000; i++) {
    const start = notes[i][0] / 1000;
    out.push({ start, dur: Math.min(notes[i][1] / 1000, loopEnd - start), midi: notes[i][2], vel: notes[i][3] ?? VEL_PREDEFINITA });
  }
  return out;
}

/**
 * Note che stanno gia' suonando alla posizione `pos` (iniziate prima, non ancora finite): dopo un seek o un salto di
 * loop si risentono dalla posizione, con la sola durata che resta. `dur` e' il residuo.
 */
export function soundingAt(notes, pos, loopEnd = Infinity) {
  const out = [];
  const posMs = pos * 1000;
  for (let i = firstAtOrAfter(notes, pos) - 1; i >= 0; i--) {
    const [t, d, midi, vel = VEL_PREDEFINITA] = notes[i];
    if (t + d > posMs + 1) out.push({ start: pos, dur: Math.min((t + d) / 1000, loopEnd) - pos, midi, vel, catchUp: true });
    else if (posMs - t > 30000) break; // note piu' lunghe di 30 s non esistono: si smette di cercare indietro
  }
  return out.filter((n) => n.dur > 0.001).reverse();
}

/**
 * Stato iniziale dello scheduler: si parte da `pos` (tempo di partitura) all'istante `when` del contesto.
 * Le note gia' in corso si riprogrammano subito (catch-up).
 */
export function begin(parti, pos, when, rate, loop) {
  const loopEnd = loop ? loop.end : Infinity;
  const events = [];
  for (const p of parti) {
    for (const n of soundingAt(p.notes, pos, loopEnd)) events.push({ ...n, parte: p.chiave, ctxStart: when, ctxEnd: when + n.dur / rate });
  }
  return { events, state: { scoreCursor: pos, ctxCursor: when } };
}

/**
 * Fa avanzare lo scheduler fino all'istante `horizon` del contesto: ritorna gli eventi con i loro istanti
 * (`ctxStart`, `ctxEnd`) e il nuovo stato. Il loop e' {start, end} in tempo di partitura oppure null.
 * Non programma mai due volte la stessa nota: ogni tratto di partitura e' coperto una volta sola.
 */
export function advance(parti, state, horizon, rate, loop, duration) {
  let { scoreCursor, ctxCursor } = state;
  const events = [];
  let guard = 0;
  while (ctxCursor < horizon && guard++ < 64) {
    const loopEnd = loop && scoreCursor < loop.end ? loop.end : Infinity;
    const limit = Math.min(loopEnd, duration);
    const want = scoreCursor + (horizon - ctxCursor) * rate;
    const segEnd = Math.min(want, limit);
    if (segEnd > scoreCursor) {
      for (const p of parti) {
        for (const n of inRange(p.notes, scoreCursor, segEnd, loopEnd)) {
          const ctxStart = ctxCursor + (n.start - scoreCursor) / rate;
          events.push({ ...n, parte: p.chiave, ctxStart, ctxEnd: ctxStart + n.dur / rate });
        }
      }
      ctxCursor += (segEnd - scoreCursor) / rate;
      scoreCursor = segEnd;
    }
    if (loop && scoreCursor >= loop.end) {
      // giro del loop: si riparte dall'inizio del passaggio, con le note che vi erano gia' in corso
      scoreCursor = loop.start;
      for (const p of parti) {
        for (const n of soundingAt(p.notes, loop.start, loop.end)) events.push({ ...n, parte: p.chiave, ctxStart: ctxCursor, ctxEnd: ctxCursor + n.dur / rate });
      }
    } else if (scoreCursor >= duration) {
      break; // fine del brano: nessuna nota oltre
    } else if (segEnd >= want) {
      break; // finestra riempita
    }
  }
  events.sort((a, b) => a.ctxStart - b.ctxStart);
  return { events, state: { scoreCursor, ctxCursor } };
}

/**
 * Quanto puo' durare, nel tempo del contesto, un campione NON ciclico partendo da `pad` (s): il suo slot nel file ha `slot` - `pad`
 * secondi di contenuto e suona alla velocita' `rate` (intonazione). Oltre, il buffer passa allo slot SUCCESSIVO e si sente un'altra
 * nota (quella tre semitoni sopra) poco prima dell'attacco seguente: succede quando la nota dura piu' dello slot, cioe' a velocita' basse.
 */
export function durataMassimaCampione(def, rate) {
  const r = Number.isFinite(+rate) && rate > 0 ? +rate : 1;
  const contenuto = Math.max(0.05, (Number(def.slot) || 0) - (Number(def.pad) || 0) - 0.02); // margine: 20 ms prima dello slot dopo
  return contenuto / r;
}

/** Numero MIDI -> indice del campione piu' vicino e rapporto di velocita' (playbackRate) per intonare. */
export function campioneVicino(strumento, midi) {
  const note = strumento.note;
  let best = 0;
  for (let i = 1; i < note.length; i++) if (Math.abs(note[i] - midi) < Math.abs(note[best] - midi)) best = i;
  return { indice: best, rate: Math.pow(2, (midi - note[best]) / 12) };
}
