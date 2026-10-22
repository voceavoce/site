// Sorgente "strumenti" del motore: suona le note di note.json con i campioni di strumenti.js.
// Scheduler con anticipo: ogni tick programma sul clock di Web Audio (AudioContext.currentTime) le note che cadono
// entro l'orizzonte; la logica del tempo e' in schedule.js (pura, testata). Le note non partono mai da setTimeout.
import { begin, advance, campioneVicino, guadagnoVelocita, durataMassimaCampione } from "./schedule.js";

const TICK_MS = 50;
const HORIZON = 0.4; // s di anticipo con la pagina visibile
const HORIZON_HIDDEN = 1.6; // scheda in secondo piano: i timer rallentano a ~1 s
const LEVEL = 1.5; // livello di una nota (i campioni sono equalizzati a RMS 0,07)
const REL_TENUTO = 0.09; // rilascio (s) degli strumenti a suono tenuto
const REL_PIANO = 0.3;
const FADE_IN = 0.004;
const STOP_REL = 0.025;
const ATT_TARGET = 0.03; // s: tempo di salita comune a cui si portano i campioni quando `allinea` e' attivo

export class Synth {
  /** `uscite`: chiave traccia -> GainNode della traccia (il mixer agisce li'). */
  constructor(ctx, campioni, uscite) {
    this.ctx = ctx;
    this.campioni = campioni;
    this.uscite = uscite;
    this.tutte = []; // tutte le parti di note.json
    this.parti = []; // quelle da suonare con gli strumenti [{ chiave, notes }]
    this.strum = new Map(); // chiave -> id strumento
    this.attive = new Set(); // voci che suonano o sono programmate
    this.state = null;
    this.rate = 1;
    this.loop = null;
    this.duration = 0;
    this.timer = 0;
    /** Stacco (s) alla fine delle note a suono NON tenuto (pianoforte): la nota si spegne `stacco` secondi prima della successiva, con un
     *  rilascio breve, cosi' il nuovo attacco esce da un suono pulito (utile a velocita' molto basse, dove le note si accavallano). 0 = come prima. */
    this.stacco = 0;
    /** Diagnostica: tutte le note con un oscillatore a pizzico (attacco di 2 ms), senza campioni, per sentire SOLO i tempi di partenza. */
    this.diagnostico = false;
    /** Allinea gli attacchi degli strumenti a suono non tenuto: ogni campione ha un suo tempo di salita (misurato dal buffer: istante in cui
     *  l'inviluppo liscio raggiunge il 90% del suo massimo iniziale); si porta tutto a ATT_TARGET anticipando (saltando l'inizio del
     *  campione) o ritardando la nota. 0/false = come prima. */
    this.allinea = false;
  }

  setParti(parti, duration) { this.tutte = parti; this.parti = parti; this.duration = duration; }
  /** Le parti che questa sorgente suona (le altre tracce suonano da stem cantato). */
  setTracce(chiavi) { this.parti = this.tutte.filter((p) => chiavi.has(p.chiave)); }
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

  // Tempo di salita (s, dopo il pad) di ogni campione di `camp`: si calcola una volta dal buffer decodificato.
  #salite(camp) {
    if (camp.salite) return camp.salite;
    const { def, buffer } = camp;
    const sr = buffer.sampleRate;
    const x = buffer.getChannelData(0);
    const w = Math.max(1, Math.round(0.001 * sr));
    const n = Math.round(0.3 / 0.001);
    const salite = [];
    for (let i = 0; i < def.note.length; i++) {
      const a = Math.round((i * def.slot + def.pad) * sr);
      const env = new Float32Array(n);
      for (let j = 0; j < n; j++) {
        let s = 0;
        for (let k = 0; k < w; k++) { const v = x[a + j * w + k] || 0; s += v * v; }
        env[j] = Math.sqrt(s / w);
      }
      const sm = env.map((_, j) => { let s = 0, c = 0; for (let q = Math.max(0, j - 5); q <= Math.min(n - 1, j + 5); q++) { s += env[q]; c++; } return s / c; });
      let pm = 0;
      for (let j = 0; j < 200; j++) if (sm[j] > pm) pm = sm[j];
      let j90 = 0;
      while (j90 < n && sm[j90] < 0.9 * pm) j90++;
      salite.push(j90 * 0.001);
    }
    camp.salite = salite;
    return salite;
  }

  #voceSecca(ev) {
    const out = this.uscite[ev.parte];
    if (!out) return;
    const ctx = this.ctx;
    const t0 = Math.max(ctx.currentTime, ev.ctxStart);
    const fine = t0 + Math.min(0.5, Math.max(0.1, ev.ctxEnd - t0));
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = 440 * Math.pow(2, (ev.midi - 69) / 12);
    const g = ctx.createGain();
    const level = 0.5 * guadagnoVelocita(ev.vel);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(level, t0 + 0.002);
    g.gain.exponentialRampToValueAtTime(0.001, fine);
    osc.connect(g);
    g.connect(out);
    osc.start(t0);
    osc.stop(fine + 0.02);
    const v = { src: osc, g, level, rel: 0.05, ctxStart: ev.ctxStart, ctxEnd: fine, scoreEnd: ev.start + ev.dur };
    this.attive.add(v);
    osc.onended = () => { this.attive.delete(v); try { g.disconnect(); } catch { /* gia' scollegato */ } };
  }

  #voce(ev) {
    if (this.diagnostico) { this.#voceSecca(ev); return; }
    const id = this.strum.get(ev.parte);
    const camp = id && this.campioni.get(id);
    const out = this.uscite[ev.parte];
    if (!camp || !out) return; // strumento non ancora caricato: la nota salta (il caricamento e' annunciato dalla UI)
    const { def, buffer } = camp;
    const { indice, rate } = campioneVicino(def, ev.midi);
    const ctx = this.ctx;
    const now = ctx.currentTime;
    let t0 = Math.max(now, ev.ctxStart);
    let extra = 0;
    if (this.allinea && !def.loop) {
      const delta = this.#salite(camp)[indice] - ATT_TARGET;
      if (delta > 0) extra = delta; // salita lenta: si salta l'inizio del campione
      else t0 += -delta / rate; // salita rapida: si ritarda la nota (la durata del campione cambia col passo `rate`)
    }
    const stacca = !def.loop && this.stacco > 0;
    const rel = def.loop ? REL_TENUTO : (stacca ? Math.min(REL_PIANO, 0.12) : REL_PIANO);
    // un campione non ciclico non puo' suonare oltre il suo slot (si sentirebbe la nota successiva del file): si chiude in tempo
    const limite = def.loop ? Infinity : t0 + durataMassimaCampione(def, rate);
    const tEnd = Math.max(t0 + 0.02, Math.min(ev.ctxEnd - (stacca ? this.stacco : 0), limite - rel));
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
    const level = LEVEL * (def.guadagno || 1) * guadagnoVelocita(ev.vel);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(level, t0 + FADE_IN);
    g.gain.setValueAtTime(level, tEnd);
    g.gain.linearRampToValueAtTime(0, tEnd + rel);
    src.connect(g);
    g.connect(out);
    src.start(t0, base + def.pad + extra);
    src.stop(Math.min(tEnd + rel + 0.02, limite));
    const v = { src, g, level, rel, limite, ctxStart: ev.ctxStart, ctxEnd: tEnd, scoreEnd: ev.start + ev.dur };
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
    const fine = Math.max(now + 0.02, Math.min(now + (fineScore - pos) / rate, (v.limite ?? Infinity) - v.rel));
    try {
      v.g.gain.cancelScheduledValues(now);
      v.g.gain.setValueAtTime(v.g.gain.value, now);
      v.g.gain.setValueAtTime(v.level, fine);
      v.g.gain.linearRampToValueAtTime(0, fine + v.rel);
      v.src.stop(Math.min(fine + v.rel + 0.02, v.limite ?? Infinity));
    } catch { /* gia' fermata */ }
    v.ctxEnd = fine;
  }
}
