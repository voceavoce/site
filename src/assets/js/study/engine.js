// Motore audio (Web Audio).
//
//   AudioBufferSource (una per traccia, mono, 24 kHz) -> GainNode (uno per traccia) -> bus (somma)
//     +-> dry (GainNode) ------------------------------------------+-> uscita        (1x: bypass, nessuna latenza)
//     +-> UN solo SoundTouchNode (AudioWorklet, time-stretch) -> wet +                 (< 1x)
//   dry e wet si scambiano con una dissolvenza di XFADE secondi quando la velocita' attraversa 1x.
//
// Il rallentamento si ottiene cosi': ogni sorgente suona con playbackRate = velocita' (l'altezza scende) e il
// nodo SoundTouch, che conosce la stessa velocita' (parametro playbackRate), riporta l'intonazione al valore
// originale. Poiche' lo stretcher e' uno solo sul mix, le voci restano in sincronia esatta.
// L'orologio unico e' l'AudioContext: posizione = ancoraggio + (currentTime - istante) * velocita' (timeline.js).
//
// Latenza: il ramo wet ritarda di ~0,1 s (buffer di SoundTouch, latency.js) piu' la latenza d'uscita del dispositivo.
// audiblePosition() e' il tempo del motore indietro di quella latenza: serve a evidenziazione, posizione e scroll.
//
// SoundTouch (AudioWorklet): vedi src/assets/vendor (copiato da node_modules, file separati e non minificati).
import { resolveAudioUrl } from "./config.js";
import { computePosition, audiblePosition } from "./timeline.js";
import { deviceLatency, totalLatency } from "./latency.js";

const TARGET_RATE = 24000; // le voci non hanno contenuto utile oltre i 12 kHz: si dimezza la memoria
const XFADE = 0.04; // dissolvenza (s) tra ramo diretto e ramo con stretcher
const VENDOR = new URL("../../vendor/soundtouch/", import.meta.url);

export class StudyError extends Error {
  constructor(kind, message, cause) {
    super(message);
    this.kind = kind; // "network" | "decode" | "worklet" | "unsupported"
    this.cause = cause;
  }
}

export class StudyEngine extends EventTarget {
  /** `perVoce`: SPERIMENTALE (?stretch=voci), uno stretcher per voce invece di uno sul mix: ogni linea e' monofonica, ma le voci possono sfasarsi di qualche ms. */
  constructor({ perVoce = false } = {}) {
    super();
    this.perVoce = perVoce;
    this.stretchers = []; // con perVoce: uno per traccia
    this.ctx = null;
    this.tracks = new Map(); // chiave -> { buffer, gain, source }
    this.bus = null;
    this.stretcher = null;
    this.dry = null; // ramo diretto bus -> uscita (usato a 1x)
    this.wet = null; // uscita dello stretcher -> uscita
    this.mix = { from: 0, to: 0, t0: 0 }; // peso del ramo wet (0..1) e dissolvenza in corso
    this.prevAnchor = null; // ancoraggio precedente (velocita'/loop appena cambiati), per la posizione udibile
    this.stretchOk = false;
    this.duration = 0;
    this.rate = 1;
    this.loop = null;
    this.playing = false;
    this.anchorPos = 0;
    this.anchorTime = 0;
    this.pausedPos = 0;
    this.gains = {};
  }

  /** Crea il contesto e il grafo. Va chiamato presto: il contesto parte sospeso, play() lo riattiva. */
  async init() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC || !window.AudioWorkletNode) throw new StudyError("unsupported", "Web Audio / AudioWorklet non disponibili");
    this.ctx = new AC({ latencyHint: "playback" });
    this.bus = this.ctx.createGain();
    this.dry = this.ctx.createGain();
    this.bus.connect(this.dry);
    this.dry.connect(this.ctx.destination);
    try {
      const { SoundTouchNode } = await import(new URL("index.js", VENDOR).href);
      await SoundTouchNode.register(this.ctx, new URL("soundtouch-processor.js", VENDOR).href);
      this.SoundTouchNode = SoundTouchNode;
      this.wet = this.ctx.createGain();
      this.wet.gain.value = 0; // si parte a 1x: tutto sul ramo diretto
      if (!this.perVoce) {
        this.stretcher = new SoundTouchNode({ context: this.ctx });
        this.bus.connect(this.stretcher);
        this.stretcher.connect(this.wet);
      }
      this.wet.connect(this.ctx.destination);
      this.stretchOk = true;
    } catch (e) {
      // Senza lo stretcher si suona alla velocita' normale e il controllo della velocita' va disattivato.
      this.stretchOk = false;
      this.dispatchEvent(new CustomEvent("warning", { detail: new StudyError("worklet", "SoundTouch non disponibile", e) }));
    }
  }

  /** Scarica e decodifica le tracce del manifest (in parallelo). `onProgress(fatte, totale)`. */
  async load(tracks, onProgress = () => {}) {
    let done = 0;
    await Promise.all(
      tracks.map(async (tr) => {
        const buffer = await this.#fetchDecode(tr);
        const gain = this.ctx.createGain();
        gain.connect(this.bus);
        this.tracks.set(tr.chiave, { buffer, gain, source: null });
        if (this.perVoce && this.stretchOk) {
          const st = new this.SoundTouchNode({ context: this.ctx });
          gain.connect(st);
          st.connect(this.wet);
          st.playbackRate.setValueAtTime(this.rate, this.ctx.currentTime);
          this.stretchers.push(st);
        }
        onProgress(++done, tracks.length);
      }),
    );
    this.duration = Math.max(...[...this.tracks.values()].map((t) => t.buffer.duration));
    this.setGains(this.gains);
  }

  async #fetchDecode(tr) {
    // Prima Opus (o l'MP3 se il browser non lo decodifica); se la decodifica fallisce, riprova con l'MP3 di riserva.
    const attempts = [resolveAudioUrl(tr)];
    if (tr.riserva) {
      const fb = resolveAudioUrl(tr, { fallback: true });
      if (fb !== attempts[0]) attempts.push(fb);
    }
    let lastErr;
    for (const url of attempts) {
      let data;
      try {
        const res = await fetch(url, { mode: "cors", credentials: "omit" });
        if (!res.ok) throw new StudyError("network", `HTTP ${res.status} per ${url}`);
        data = await res.arrayBuffer();
      } catch (e) {
        // fetch() lancia TypeError sia per rete assente sia per CORS negato: dal client sono indistinguibili.
        lastErr = e instanceof StudyError ? e : new StudyError("network", `Impossibile scaricare ${url}`, e);
        continue;
      }
      try {
        return await this.#decodeMono(data);
      } catch (e) {
        lastErr = new StudyError("decode", `Impossibile decodificare ${url}`, e);
      }
    }
    throw lastErr;
  }

  // Decodifica a 24 kHz con un OfflineAudioContext (decodeAudioData ricampiona alla frequenza del contesto) e mono.
  async #decodeMono(data) {
    let buf;
    try {
      buf = await new OfflineAudioContext(1, 1, TARGET_RATE).decodeAudioData(data.slice(0));
    } catch {
      buf = await this.ctx.decodeAudioData(data.slice(0));
    }
    if (buf.numberOfChannels === 1) return buf;
    const mono = this.ctx.createBuffer(1, buf.length, buf.sampleRate);
    const out = mono.getChannelData(0);
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const ch = buf.getChannelData(c);
      for (let i = 0; i < out.length; i++) out[i] += ch[i] / buf.numberOfChannels;
    }
    return mono;
  }

  /** Volumi effettivi (0..1) per chiave di traccia, gia' al netto di mute e solo. */
  setGains(gains) {
    this.gains = { ...gains };
    if (!this.ctx) return;
    for (const [id, tr] of this.tracks) {
      if (id in gains) tr.gain.gain.setTargetAtTime(gains[id], this.ctx.currentTime, 0.015); // senza click
    }
  }
  getGainValue(id) {
    return this.tracks.get(id)?.gain.gain.value ?? null;
  }

  /** Posizione corrente in secondi (orologio unico). */
  position() {
    if (!this.playing) return this.pausedPos;
    const p = computePosition({ anchorPos: this.anchorPos, anchorTime: this.anchorTime, now: this.ctx.currentTime, rate: this.rate, loop: this.loop, duration: this.duration });
    if (p >= this.duration && !this.loop) {
      this.#stopSources();
      this.playing = false;
      this.pausedPos = 0;
      this.dispatchEvent(new Event("ended"));
      return 0;
    }
    return p;
  }

  /**
   * Posizione UDIBILE (s): quella che si sta sentendo adesso, cioe' il tempo del motore al netto della latenza del
   * ramo attivo (stretcher solo se non siamo a 1x) e di quella d'uscita del dispositivo. Per evidenziazione, tempo
   * mostrato e scroll; mai per seek o confini del loop (restano sul tempo del motore: position()).
   */
  audiblePosition() {
    if (!this.playing) return this.pausedPos;
    return audiblePosition({ anchorPos: this.anchorPos, anchorTime: this.anchorTime, now: this.ctx.currentTime, rate: this.rate, loop: this.loop, duration: this.duration, latency: this.latency(), prev: this.prevAnchor });
  }

  /** Latenza attuale (s) tra motore e orecchio, secondo il ramo attivo. */
  latency() {
    return totalLatency({ rate: this.rate, wet: this.#wetWeight(), device: deviceLatency(this.ctx) });
  }

  #wetWeight() {
    const m = this.mix;
    const k = Math.min(1, Math.max(0, (this.ctx.currentTime - m.t0) / XFADE));
    return m.from + (m.to - m.from) * k;
  }

  // Sceglie il ramo: wet = 1 (stretcher) o 0 (diretto), con dissolvenza lineare a somma costante.
  #setBranch(wet) {
    if (!this.wet || this.mix.to === wet) return;
    const now = this.ctx.currentTime;
    const w0 = this.#wetWeight();
    this.mix = { from: w0, to: wet, t0: now };
    for (const [g, from, to] of [[this.wet.gain, w0, wet], [this.dry.gain, 1 - w0, 1 - wet]]) {
      g.cancelScheduledValues(now);
      g.setValueAtTime(from, now);
      g.linearRampToValueAtTime(to, now + XFADE);
    }
  }

  #startSources(pos) {
    this.prevAnchor = null; // sorgenti nuove: nessun suono precedente da raccordare
    const when = this.ctx.currentTime + 0.06; // stesso istante di partenza per tutte le tracce
    for (const tr of this.tracks.values()) {
      const src = this.ctx.createBufferSource();
      src.buffer = tr.buffer;
      src.playbackRate.value = this.rate;
      this.#applyLoop(src);
      src.connect(tr.gain);
      src.start(when, Math.min(pos, tr.buffer.duration));
      tr.source = src;
    }
    this.anchorPos = pos;
    this.anchorTime = when;
  }
  #stopSources() {
    for (const tr of this.tracks.values()) {
      if (tr.source) { try { tr.source.stop(); } catch {} tr.source.disconnect(); tr.source = null; }
    }
  }
  #applyLoop(src) {
    if (this.loop) { src.loop = true; src.loopStart = this.loop.start; src.loopEnd = Math.min(this.loop.end, src.buffer.duration); }
    else src.loop = false;
  }

  async play() {
    if (this.playing || !this.tracks.size) return;
    if (this.ctx.state !== "running") await this.ctx.resume();
    let pos = this.pausedPos;
    if (this.loop && pos >= this.loop.end) pos = this.loop.start;
    this.#startSources(pos);
    this.playing = true;
    this.dispatchEvent(new Event("play"));
  }
  pause() {
    if (!this.playing) return;
    this.position();
    if (!this.playing) return; // fine del brano raggiunta proprio ora
    this.pausedPos = this.audiblePosition(); // si riparte da dove si e' sentito, non da dove era il motore
    this.#stopSources();
    this.playing = false;
    this.dispatchEvent(new Event("pause"));
  }
  seek(t) {
    const pos = Math.min(Math.max(0, t), this.duration);
    if (this.playing) { this.#stopSources(); this.#startSources(pos); } else this.pausedPos = pos;
  }

  /** Velocita' da 0,5 a 1,0 (senza cambiare l'intonazione). */
  setRate(r) {
    r = Math.min(1, Math.max(0.5, r));
    if (!this.stretchOk) r = 1;
    const now = this.ctx.currentTime;
    if (this.playing) { // nuovo ancoraggio alla posizione di adesso, poi cambio per tutti allo stesso istante
      this.prevAnchor = { anchorPos: this.anchorPos, anchorTime: this.anchorTime, rate: this.rate, loop: this.loop };
      this.anchorPos = computePosition({ anchorPos: this.anchorPos, anchorTime: this.anchorTime, now, rate: this.rate, loop: this.loop, duration: this.duration });
      this.anchorTime = now;
    }
    this.rate = r;
    for (const tr of this.tracks.values()) tr.source?.playbackRate.setValueAtTime(r, now);
    this.stretcher?.playbackRate.setValueAtTime(r, now);
    for (const st of this.stretchers) st.playbackRate.setValueAtTime(r, now);
    this.#setBranch(r < 1 ? 1 : 0);
  }

  /** Loop senza vuoti ({start,end} in secondi) oppure null. */
  setLoop(range) {
    const pos = this.playing ? this.position() : this.pausedPos;
    const oldLoop = this.loop;
    this.loop = range ? { start: range.start, end: range.end } : null;
    if (this.playing) {
      if (this.loop && pos >= this.loop.end) { this.seek(this.loop.start); return; }
      this.prevAnchor = { anchorPos: this.anchorPos, anchorTime: this.anchorTime, rate: this.rate, loop: oldLoop };
      this.anchorPos = pos;
      this.anchorTime = this.ctx.currentTime;
      for (const tr of this.tracks.values()) if (tr.source) this.#applyLoop(tr.source);
    } else if (this.loop && pos >= this.loop.end) {
      this.pausedPos = this.loop.start;
    }
  }

  destroy() {
    this.#stopSources();
    this.ctx?.close();
  }
}
