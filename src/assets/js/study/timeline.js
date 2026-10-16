// Funzioni PURE sul tempo (nessun DOM, nessun Web Audio): testate con node:test.
// `sync` e' il contenuto di sync.json: { battute: [{ m, numero, t }], fine }.

/**
 * Indice (nell'elenco `sync.battute`, cioe' in ordine di esecuzione) della battuta che suona al tempo `t`.
 * Ricerca binaria. Prima della prima battuta (lead-in) ritorna -1; dopo l'ultima, l'ultima.
 */
export function measureIndexAt(sync, t) {
  const b = sync.battute;
  if (!b.length || !(t >= b[0].t)) return -1;
  let lo = 0, hi = b.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (b[mid].t <= t) lo = mid; else hi = mid - 1;
  }
  return lo;
}

/** Tempo (s) di inizio della battuta di indice `i` (fuori intervallo: viene riportato ai limiti). */
export function timeOfMeasure(sync, i) {
  const b = sync.battute;
  if (!b.length) return 0;
  return b[Math.min(Math.max(0, Math.trunc(i)), b.length - 1)].t;
}

/** Tempo di fine della battuta `i`: inizio della successiva, per l'ultima `sync.fine`. */
export function endOfMeasure(sync, i) {
  const b = sync.battute;
  return i + 1 < b.length ? b[i + 1].t : sync.fine;
}

/**
 * Limiti di un loop dalla battuta `from` alla battuta `to` (indici inclusi, in qualsiasi ordine).
 * Ritorna { from, to, start, end } con gli indici ordinati e limitati, o null se non c'e' nessuna battuta.
 */
export function loopBounds(sync, from, to) {
  const n = sync.battute.length;
  if (!n) return null;
  const clamp = (x) => Math.min(Math.max(0, Math.trunc(Number.isFinite(+x) ? +x : 0)), n - 1);
  const a = clamp(from), b = clamp(to);
  const lo = Math.min(a, b), hi = Math.max(a, b);
  return { from: lo, to: hi, start: timeOfMeasure(sync, lo), end: endOfMeasure(sync, hi) };
}

/**
 * Prima occorrenza (o la piu' vicina a `near`) della battuta di partitura `m` nell'elenco di esecuzione.
 * Serve al tocco sulla partitura: con i ritornelli la stessa `m` compare piu' volte.
 */
export function indexOfScoreMeasure(sync, m, near = 0) {
  let best = -1;
  sync.battute.forEach((x, i) => {
    if (x.m !== m) return;
    if (best < 0 || Math.abs(i - near) < Math.abs(best - near)) best = i;
  });
  return best;
}

/**
 * Orologio unico. Dato l'ancoraggio (posizione `anchorPos` all'istante `anchorTime` dell'AudioContext), la velocita'
 * `rate` e l'eventuale loop {start,end}, ritorna la posizione in secondi al tempo `now`.
 * Con il loop, se all'ancoraggio la posizione era prima di `end`, quando la testina supera `end` rientra da `start`.
 */
export function computePosition({ anchorPos, anchorTime, now, rate, loop = null, duration = Infinity }) {
  const raw = anchorPos + Math.max(0, now - anchorTime) * rate;
  if (loop && loop.end > loop.start && anchorPos < loop.end && raw >= loop.end) {
    const len = loop.end - loop.start;
    return loop.start + ((raw - loop.start) % len);
  }
  return Math.min(raw, duration);
}

/** Formatta i secondi come m:ss (arrotondato per difetto). */
export function formatClock(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Etichette delle battute per i menu: il numero scritto in partitura; se si ripete (ritornelli) aggiunge " (2)". */
export function measureLabels(sync) {
  const seen = new Map();
  return sync.battute.map((b) => {
    const n = (seen.get(b.numero) || 0) + 1;
    seen.set(b.numero, n);
    return n > 1 ? `${b.numero} (${n})` : String(b.numero);
  });
}
