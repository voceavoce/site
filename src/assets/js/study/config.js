// Configurazione degli audio: UNICO punto in cui nasce un URL audio.
//
// La base (`site.audioBase`, da VOCEAVOCE_AUDIO_BASE) arriva nella pagina dentro #study-data e viene impostata
// con setAudioBase(). Il manifest contiene solo percorsi RELATIVI alla base.
//
// FUTURO: per gli audio premium questa funzione diventera' asincrona e chiedera' a un Cloudflare Worker un URL
// firmato per il bucket privato `voceavoce-audio-premium` (stessi percorsi). Nessuna credenziale nel client.

let audioBase = "";

export function setAudioBase(base) {
  audioBase = String(base || "").replace(/\/+$/, "");
}
export function getAudioBase() {
  return audioBase;
}

/** Un percorso del manifest e' valido se e' relativo: niente schema, niente "//", niente "..", niente "\". */
export function isSafeRelativePath(p) {
  if (typeof p !== "string" || !p || p.length > 300) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(p)) return false; // https:, data:, javascript:, file: ...
  if (p.startsWith("/") || p.includes("\\") || p.includes("//")) return false;
  if (/[\u0000-\u001f?#]/.test(p)) return false;
  return !p.split("/").some((seg) => seg === ".." || seg === ".");
}

/** Il browser decodifica Opus (Ogg)? Safari piu' vecchi di 17 no: allora si usa l'MP3 di riserva. */
export function canDecodeOpus() {
  try {
    const a = document.createElement("audio");
    return /^(probably|maybe)$/.test(a.canPlayType('audio/ogg; codecs="opus"')) || /^(probably|maybe)$/.test(a.canPlayType('audio/webm; codecs="opus"'));
  } catch {
    return false;
  }
}

/**
 * URL assoluto del file audio di una traccia.
 * @param {{file:string, riserva?:string}} track  traccia del manifest
 * @param {{base?:string, fallback?:boolean, opus?:boolean}} [opts]
 *   base: sostituisce la base configurata; fallback: forza l'MP3 di riserva; opus: forza l'esito del test Opus.
 * @throws se il percorso non e' relativo (un manifest non puo' puntare a URL assoluti).
 */
export function resolveAudioUrl(track, opts = {}) {
  const useFallback = opts.fallback ?? !(opts.opus ?? canDecodeOpus());
  const rel = useFallback && track.riserva ? track.riserva : track.file;
  if (!isSafeRelativePath(rel)) throw new Error(`Percorso audio non valido: ${rel}`);
  const base = String(opts.base ?? audioBase).replace(/\/+$/, "");
  if (!base) throw new Error("Base degli audio non configurata");
  return `${base}/${rel.split("/").map(encodeURIComponent).join("/")}`;
}
