// Latenza tra cio' che il motore "suona" e cio' che si sente. Funzioni PURE (nessun Web Audio): testate con node:test.
//
// Il tempo del motore e' il tempo della sorgente che sta entrando nel bus. Quello che esce dagli altoparlanti e' piu'
// vecchio di: latenza dello stretcher (solo se il ramo SoundTouch e' attivo) + latenza d'uscita del dispositivo.

/**
 * Latenza (s) del nodo SoundTouch per velocita'. SoundTouch non la espone: e' stata MISURATA offline
 * (OfflineAudioContext + il worklet vendorizzato, un clic ogni ~1 s, inizio del clic in uscita meno l'istante atteso
 * t / velocita'; media su 9 clic, uguale a 44,1 e 48 kHz). Dipende dalla finestra di sequenza che SoundTouch sceglie
 * in automatico in funzione del tempo. Da rifare se si aggiorna @soundtouchjs/audio-worklet.
 * Coppie [velocita', latenza in secondi], velocita' crescente.
 */
export const STRETCH_LATENCY = [
  [0.5, 0.094], [0.55, 0.103], [0.6, 0.109], [0.65, 0.115], [0.7, 0.117], [0.75, 0.123],
  [0.8, 0.123], [0.85, 0.125], [0.9, 0.127], [0.95, 0.131], [1, 0.133],
];

/** Latenza (s) dello stretcher alla velocita' `rate`: interpolazione lineare sulla tabella, ai limiti resta sul bordo. */
export function stretcherLatency(rate, table = STRETCH_LATENCY) {
  const r = Number.isFinite(+rate) ? +rate : 1;
  if (r <= table[0][0]) return table[0][1];
  const last = table[table.length - 1];
  if (r >= last[0]) return last[1];
  for (let i = 1; i < table.length; i++) {
    if (r <= table[i][0]) {
      const [r0, l0] = table[i - 1], [r1, l1] = table[i];
      return l0 + ((r - r0) / (r1 - r0)) * (l1 - l0);
    }
  }
  return last[1];
}

/** Latenza d'uscita del dispositivo (s): outputLatency, altrimenti baseLatency, altrimenti 0. Valori assurdi -> 0. */
export function deviceLatency(ctx) {
  const ok = (x) => Number.isFinite(x) && x > 0 && x < 2;
  if (ctx && ok(ctx.outputLatency)) return ctx.outputLatency;
  if (ctx && ok(ctx.baseLatency)) return ctx.baseLatency;
  return 0;
}

/**
 * Latenza totale (s) di cio' che si sente. `wet` e' il peso (0..1) del ramo con lo stretcher nel mix: 0 = bypass
 * diretto (1x), 1 = tutto attraverso SoundTouch; durante la dissolvenza tra i rami si pesa linearmente.
 */
export function totalLatency({ rate, wet = 1, device = 0 }) {
  const w = Math.min(1, Math.max(0, Number.isFinite(+wet) ? +wet : 1));
  return w * stretcherLatency(rate) + Math.max(0, device || 0);
}
