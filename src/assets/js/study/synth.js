// Sorgente "strumenti" del motore: suona le note di note.json con i campioni di strumenti.js.
// Scheduler con anticipo: ogni tick programma sul clock di Web Audio (AudioContext.currentTime) le note che cadono
// entro l'orizzonte; la logica del tempo e' in schedule.js (pura, testata). Le note non partono mai da setTimeout.
import { begin, advance, campioneVicino } from "./schedule.js";

const TICK_MS = 50;
const HORIZON = 0.4; // s di anticipo con la pagina visibile
const HORIZON_HIDDEN = 1.6; // scheda in secondo piano: i timer rallentano a ~1 s
const LEVEL = 1.5; // livello di una nota (i campioni sono equalizzati a RMS 0,07)
const REL_TENUTO = 0.09; // rilascio (s) degli strumenti a suono tenuto
const REL_PIANO = 0.3;
const FADE_IN = 0.004;
const STOP_REL = 0.025;

export class Synth {
  /** `uscite`: chiave traccia -> GainNode della traccia (il mixer agisce li'). */
  constructor(ctx, campioni, uscite) {
    this.ctx = ctx;
    this.campioni = campioni;
    this.uscite = uscite;
    this.parti = []; // [{ chiave, notes }]
    this.strum = new Map(); // chiave -> id strumento
    this.attive = new Set(); // voci che suonano o sono programmate
    this.state = null;
    this.rate = 1;
    this.loop = null;
    this.duration = 0;
    this.timer = 0;
  }

  setParti(parti, duration) { this.parti = parti; this.duration = duration; }
  setStrumento(chiave, id) { this.strum.set(chiave, id); }
  get running() { return this.timer !== 0; }

  /** Parte da `pos` (tempo di partitura) all'istante `when` del contesto. */
  start(pos, when, rate, loop) {
    this.stop();
    this.rate = rate;
    this.loop = loop;
    const b = begin(this.parti, pos, when, rate, loop);
    this.state = b.state;
    for (const ev of b.events) this.#voce(ev);
    this.#tick();
    this.timer = setInterval(() => this.#tick(), TICK_MS);
  }

  /** Velocita' o loop cambiati mentre suona: le note future si riprogrammano da `pos` (adesso); quelle in corso si accorciano o allungano. */
  retime(pos, rate, loop) {
    if (!this.timer) return;
    const now = this.ctx.currentTime;
    for (const v of [...this.attive]) {
      if (v.ctxStart > now) this.#taglia(v, v.ctxStart, true);
      else this.#riallinea(v, now, pos, rate, loop);
    }
    this.rate = rate;
    this.loop = loop;
    this.state = { scoreCursor: pos, ctxCursor: now };
    this.#tick();
  }

  stop() {
    if (this.timer) { clearInterval(this.timer); this.timer = 0; }
    const now = this.ctx.currentTime;
    for (const v of [...this.attive]) this.#taglia(v, now, false);
    this.state = null;
  }

  #tick() {
    if (!this.state) return;
    const horizon = this.ctx.currentTime + (typeof document !== "undefined" && document.hidden ? HORIZON_HIDDEN : HORIZON);
    const r = advance(this.parti, this.state, horizon, this.rate, this.loop, this.duration);
    this.state = r.state;
    for (const ev of r.events) this.#voce(ev);
  }

  #voce(ev) {
    const id = this.strum.get(ev.parte);
    const camp = id && this.campioni.get(id);
    const out = this.uscite[ev.parte];
    if (!camp || !out) return; // strumento non ancora caricato: la nota salta (il caricamento e' annunciato dalla UI)
    const { def, buffer } = camp;
    const { indice, rate } = campioneVicino(def, ev.midi);
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const t0 = Math.max(now, ev.ctxStart);
    const tEnd = Math.max(t0 + 0.02, ev.ctxEnd);
    const rel = def.loop ? REL_TENUTO : REL_PIANO;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;
    const base = indice * def.slot;
    if (def.loop) {
      src.loop = true;
      src.loopStart = base + def.loop[indice][0];
      src.loopEnd = base + def.loop[indice][1];
    }
    const g = ctx.createGain();
    const level = LEVEL * (def.guadagno || 1);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(level, t0 + FADE_IN);
    g.gain.setValueAtTime(level, tEnd);
    g.gain.linearRampToValueAtTime(0, tEnd + rel);
    src.connect(g);
    g.connect(out);
    src.start(t0, base + def.pad);
    src.stop(tEnd + rel + 0.02);
    const v = { src, g, level, rel, ctxStart: ev.ctxStart, ctxEnd: tEnd, scoreEnd: ev.start + ev.dur };
    this.attive.add(v);
    src.onended = () => { this.attive.delete(v); try { g.disconnect(); } catch { /* gia' scollegato */ } };
  }

  // Chiude una voce subito (o all'istante `quando` se non e' ancora partita: allora non parte affatto).
  #taglia(v, quando, nonPartita) {
    const g = v.g.gain;
    try {
      g.cancelScheduledValues(quando);
      if (nonPartita) { g.setValueAtTime(0, quando); v.src.stop(quando + 0.001); }
      else {
        g.setValueAtTime(g.value, quando);
        g.linearRampToValueAtTime(0, quando + STOP_REL);
        v.src.stop(quando + STOP_REL + 0.01);
      }
    } catch { /* gia' fermata */ }
  }

  // Una nota in corso: la sua fine nel contesto dipende dalla velocita' nuova.
  #riallinea(v, now, pos, rate, loop) {
    const fineScore = loop ? Math.min(v.scoreEnd, loop.end) : v.scoreEnd;
    const fine = Math.max(now + 0.02, now + (fineScore - pos) / rate);
    try {
      v.g.gain.cancelScheduledValues(now);
      v.g.gain.setValueAtTime(v.g.gain.value, now);
      v.g.gain.setValueAtTime(v.level, fine);
      v.g.gain.linearRampToValueAtTime(0, fine + v.rel);
      v.src.stop(fine + v.rel + 0.02);
    } catch { /* gia' fermata */ }
    v.ctxEnd = fine;
  }
}
