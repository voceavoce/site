/* Logica pura del service worker (classificazione delle richieste), condivisa da /sw.js e dai test.
 * Script classico: in un SW si carica con importScripts(), nei test con node:vm (tests/sw.test.mjs).
 *
 * REGOLA SULL'AUDIO: l'audio dei brani (stem) NON entra MAI in nessuna cache (unica eccezione: i campioni degli strumenti, /assets/strumenti/). Niente respondWith per audio.voceavoce.com,
 * localhost:8787, URL .opus/.mp3/.wav/.flac/... o richieste con header Range: passano alla rete cosi' come sono.
 * Motivo: in questa fase il player non offre audio offline, e quando arrivera' il contenuto premium il
 * caricamento avverra' con URL firmati a scadenza, che non devono restare in una cache del browser.
 */
(function (g) {
  "use strict";
  var AUDIO_EXT = /\.(opus|mp3|wav|flac|ogg|oga|m4a|aac|weba)$/i;
  var AUDIO_HOSTS = ["audio.voceavoce.com", "localhost:8787", "127.0.0.1:8787"];
  var AUDIO_HOST_SUFFIX = /(^|\.)workers\.dev(:\d+)?$/i; // Cloudflare Worker dell'audio (URL deciso al deploy)
  var STATIC_EXT = /\.(css|js|mjs|wasm|png|jpe?g|webp|svg|ico|gif|woff2?|musicxml|json|webmanifest)$/i;

  /**
   * Come gestire una richiesta.
   * req: { url, method, mode, headers: { get(name) } } (una Request vera va bene); origin: self.location.origin;
   * audioHosts: host (con porta) in piu' da non toccare mai, iniettati in build da site.audioBase.
   * Ritorna "ignore" (il SW non intercetta), "navigate" (network-first) o "static" (stale-while-revalidate).
   */
  function classify(req, origin, audioHosts) {
    var url;
    try { url = new URL(req.url); } catch (e) { return "ignore"; }
    if (url.protocol !== "http:" && url.protocol !== "https:") return "ignore";
    // Campioni degli strumenti del player: file del sito (stessa origine, in git), si mettono in cache come le altre risorse
    // statiche cosi' la modalita' strumenti funziona anche offline. NON sono gli stem dei brani (quelli non si cachano mai).
    if (url.origin === origin && url.pathname.indexOf("/assets/strumenti/") === 0 && (!req.method || req.method === "GET") && !(req.headers && req.headers.get && req.headers.get("range"))) return "static";
    // audio e Range PRIMA di tutto (anche se cross-origin o sotto un altro schema di URL)
    if (AUDIO_HOSTS.indexOf(url.host) !== -1 || (audioHosts || []).indexOf(url.host) !== -1 || AUDIO_HOST_SUFFIX.test(url.host) || AUDIO_EXT.test(url.pathname)) return "ignore";
    if (req.headers && req.headers.get && req.headers.get("range")) return "ignore";
    if (req.method && req.method !== "GET") return "ignore";
    if (url.origin !== origin) return "ignore"; // YouTube, i.ytimg, ecc.
    var p = url.pathname;
    if (p.indexOf("/pagefind/") === 0 || p === "/sw.js") return "ignore";
    if (req.mode === "navigate") return "navigate";
    if (STATIC_EXT.test(p) || p.indexOf("/player-data/") === 0) return "static";
    return "ignore";
  }

  /** Una risposta si puo' salvare in cache solo se e' un 200 completo (mai 206/partial, mai errori). */
  function isCacheable(res) {
    return !!res && res.status === 200 && (res.type === "basic" || res.type === "default");
  }

  function cacheNames(version) { return { pre: "vav-pre-" + version, rt: "vav-rt-" + version }; }

  /** Le cache da cancellare all'activate: tutte quelle nostre ("vav-") che non sono della versione corrente. */
  function staleCaches(keys, version) {
    var n = cacheNames(version);
    return keys.filter(function (k) { return k.indexOf("vav-") === 0 && k !== n.pre && k !== n.rt; });
  }

  g.SWCore = { classify: classify, isCacheable: isCacheable, cacheNames: cacheNames, staleCaches: staleCaches };
  if (typeof module !== "undefined" && module.exports) module.exports = g.SWCore;
})(typeof self !== "undefined" ? self : globalThis);
