// Cursore, fascia della propria voce e opzioni della partitura: calcoli PURI (nessun DOM, nessun Verovio), testati con
// node:test in tests/cursore.test.mjs. score.js li usa con gli elementi della pagina; qui ogni valore strano
// (NaN, elenchi vuoti, dati mancanti) ha un comportamento definito invece di far fallire il player.

const clamp01 = (x) => Math.min(1, Math.max(0, Number.isFinite(x) ? x : 0));

/**
 * Frazione (0..1) del tempo trascorsa nella battuta `i` di sync.battute al tempo `pos` (s).
 * Prima della prima battuta (i < 0, lead-in), con dati non validi o durata nulla ritorna 0. Per l'ultima battuta la
 * durata e' quella della precedente: dopo di lei c'e' solo la coda di silenzio, che non si disegna (R-11); con una
 * sola battuta si usa `sync.fine`.
 */
export function frazioneInBattuta(sync, i, pos) {
  const b = sync?.battute;
  if (!Array.isArray(b) || !b.length || !(i >= 0) || !Number.isFinite(pos)) return 0;
  const k = Math.min(Math.trunc(i), b.length - 1);
  const t0 = b[k].t;
  const t1 = k + 1 < b.length ? b[k + 1].t : k > 0 ? t0 + (t0 - b[k - 1].t) : Number(sync.fine);
  const durata = t1 - t0;
  return durata > 0 ? clamp01((pos - t0) / durata) : 0;
}

/**
 * Posizioni orizzontali delle note per battuta, dalla mappa dei tempi di Verovio (`timemap`: elenco di
 * { qstamp, on, restsOn, measureOn }, qstamp = quarti dall'inizio).
 *   indiceDi(idBattuta) -> indice della battuta nella pagina (o undefined/-1 se non la conosce)
 *   xDi(idNota)         -> x del centro della nota nel contenitore (o null se l'elemento non c'e')
 * Ritorna un array indicizzato per battuta: { q0, p: [{ q, x }] } con i punti ordinati per q e, se piu' note cadono
 * nello stesso istante (righi diversi), una sola posizione (la media delle note; le pause contano solo se non c'e' nessuna nota). Le battute senza punti restano {q0, p: []}.
 */
export function puntiPerBattuta(timemap, indiceDi, xDi) {
  const geo = [];
  if (!Array.isArray(timemap)) return geo;
  let cur = -1;
  for (const e of timemap) {
    if (!e || !Number.isFinite(e.qstamp)) continue;
    if (e.measureOn !== undefined) {
      const i = indiceDi(e.measureOn);
      if (Number.isInteger(i) && i >= 0) {
        cur = i;
        geo[cur] ||= { q0: e.qstamp, p: [] };
      }
    }
    if (cur < 0) continue;
    for (const id of e.on || []) {
      const x = xDi(id);
      if (Number.isFinite(x)) geo[cur].p.push({ q: e.qstamp, x });
    }
    for (const id of e.restsOn || []) {
      const x = xDi(id);
      if (Number.isFinite(x)) geo[cur].p.push({ q: e.qstamp, x, pausa: true });
    }
  }
  for (const g of geo) {
    if (!g) continue;
    const perQ = new Map();
    for (const { q, x, pausa } of g.p) (perQ.get(q) || perQ.set(q, { note: [], pause: [] }).get(q))[pausa ? "pause" : "note"].push(x);
    // dove c'e' una nota conta lei: una pausa di battuta intera sta al CENTRO della battuta e, mediata con le note
    // delle altre voci, porterebbe il cursore a meta' battuta invece che sulla prima nota
    g.p = [...perQ].map(([q, v]) => {
      const xs = v.note.length ? v.note : v.pause;
      return { q, x: xs.reduce((a, b) => a + b, 0) / xs.length };
    }).sort((a, b) => a.q - b.q);
  }
  return geo;
}

/**
 * Completa ogni battuta con la fine (q1, xEnd) e l'altezza del sistema (top, bottom). `info(i)` ritorna
 * { sistema, top, bottom, right } della battuta `i` (o null se non c'e': la battuta viene scartata).
 * q1 e' l'inizio della battuta dopo; per l'ultima, la stessa durata della precedente (4 quarti se e' l'unica).
 * xEnd e' la prima nota della battuta dopo se sta sullo stesso sistema, altrimenti il bordo destro della battuta.
 */
export function completaBattute(geo, info) {
  for (let i = 0; i < geo.length; i++) {
    const g = geo[i];
    if (!g) continue;
    const mio = info(i);
    if (!mio) { delete geo[i]; continue; }
    const next = geo[i + 1], prev = geo[i - 1];
    let q1 = next ? next.q0 : prev ? g.q0 + (g.q0 - prev.q0) : g.q0 + 4;
    if (!(q1 > g.q0)) q1 = g.q0 + 4;
    const dopo = next && next.p.length ? info(i + 1) : null;
    g.q1 = q1;
    g.top = mio.top;
    g.bottom = mio.bottom;
    g.xEnd = dopo && dopo.sistema === mio.sistema ? next.p[0].x : mio.right;
  }
  return geo;
}

/**
 * Posizione x del cursore nella battuta `g` (di puntiPerBattuta + completaBattute) alla frazione di tempo `f`.
 * Interpola tra le note, in quarti; con `ridotto` (movimento ridotto) salta da una nota alla successiva.
 * Ritorna null se la battuta non ha punti.
 */
export function xAlCursore(g, f, ridotto = false) {
  if (!g || !Array.isArray(g.p) || !g.p.length || !Number.isFinite(g.q1) || !Number.isFinite(g.xEnd)) return null;
  const q = g.q0 + clamp01(f) * (g.q1 - g.q0);
  const P = [...g.p, { q: g.q1, x: g.xEnd }];
  let x = P[0].x;
  for (let k = 0; k < P.length - 1; k++) {
    const a = P[k], b = P[k + 1];
    if (q < a.q) break;
    if (q >= b.q) { x = b.x; continue; } // segmento gia' percorso
    x = ridotto || b.q <= a.q ? a.x : a.x + (b.x - a.x) * ((q - a.q) / (b.q - a.q));
    break;
  }
  return x;
}

/**
 * La battuta sotto il punto (x, y) del contenitore, dalla geometria e non dai segni disegnati: toccare lo spazio tra
 * le note, sul testo o sul rigo di un'altra voce sceglie comunque la battuta di quel sistema in quel punto.
 * `caselle`: [{ i, sistema, l, r, t, b }] con t/b = altezza del sistema e l/r = estensione orizzontale della battuta.
 * Si considera il sistema piu' vicino in verticale; fuori da tutti i sistemi piu' di `margine` px -> -1.
 * Nel sistema scelto vince la battuta che contiene x; se x cade in uno spazio fra battute o oltre i bordi, la piu'
 * vicina.
 */
export function battutaAlPunto(caselle, x, y, margine = 24) {
  if (!Array.isArray(caselle) || !Number.isFinite(x) || !Number.isFinite(y)) return -1;
  let dyMin = Infinity, scelte = [];
  for (const c of caselle) {
    if (!c || ![c.l, c.r, c.t, c.b].every(Number.isFinite)) continue;
    const dy = y < c.t ? c.t - y : y > c.b ? y - c.b : 0;
    if (dy < dyMin - 1e-9) { dyMin = dy; scelte = [c]; } else if (Math.abs(dy - dyMin) <= 1e-9) scelte.push(c);
  }
  if (!scelte.length || dyMin > margine) return -1;
  const stesso = scelte.filter((c) => c.sistema === scelte[0].sistema);
  const dx = (c) => (x < c.l ? c.l - x : x > c.r ? x - c.r : 0);
  // a parita' (caselle che si sovrappongono) vince la battuta il cui centro e' piu' vicino al punto
  const centro = (c) => Math.abs(x - (c.l + c.r) / 2);
  return stesso.reduce((best, c) => (dx(c) < dx(best) || (dx(c) === dx(best) && centro(c) < centro(best)) ? c : best), stesso[0]).i;
}

/**
 * Posizione (dall'alto) del rigo da evidenziare per la voce `idx`, o -1 se non si puo' dire. Si evidenzia solo se i
 * righi della partitura sono tanti quante le voci: altrimenti (accompagnamento sul pianoforte, parti unite) non si
 * sa quale rigo e' di chi e una fascia sbagliata e' peggio di nessuna.
 */
export function rigoDellaVoce(idx, voci, righi) {
  return Number.isInteger(idx) && idx >= 0 && voci === righi && idx < righi ? idx : -1;
}

/**
 * Opzioni della partitura: valori di partenza. Fascia gialla sulla propria parte e cursore accesi, colore del cursore
 * ambra, fascia sulla battuta corrente spenta (c'e' il cursore), partitura su carta bianca (invert = sfondo scuro).
 */
export const OPZIONI_DEFAULT = Object.freeze({ myPart: true, cursor: true, cursorColor: "#f2a900", measure: false, invert: false });

/**
 * Le opzioni lette dal browser (stringa JSON o oggetto): ogni campo non valido torna al suo valore di partenza.
 * Il colore deve essere #rrggbb; non si fida mai di cio' che e' salvato.
 */
export function opzioniPartitura(raw) {
  const o = { ...OPZIONI_DEFAULT };
  let s = raw;
  if (typeof raw === "string") {
    try { s = JSON.parse(raw); } catch { return o; }
  }
  if (!s || typeof s !== "object" || Array.isArray(s)) return o;
  for (const k of ["myPart", "cursor", "measure", "invert"]) if (typeof s[k] === "boolean") o[k] = s[k];
  if (typeof s.cursorColor === "string" && /^#[0-9a-f]{6}$/i.test(s.cursorColor)) o.cursorColor = s.cursorColor.toLowerCase();
  return o;
}
