// Worker che serve gli audio di studio dal bucket R2 PRIVATO `voceavoce-audio` (binding AUDIO).
// Nessuna dipendenza. Percorsi ammessi: /{slug}/{versione}/{file}.{opus|mp3}. Mai elenchi del bucket.

const CHIAVE = /^[a-z0-9-]+\/v\d+\/[a-z0-9-]+\.(opus|mp3)$/;
const TIPI = { opus: "audio/ogg", mp3: "audio/mpeg" };
const CACHE_CONTROL = "public, max-age=31536000, immutable";

// UNICO punto di estensione per il futuro premium: oggi tutto e' pubblico.
// Qui andra' la verifica dell'abbonamento (token, URL firmato, oppure un secondo bucket
// `voceavoce-audio-premium` con gli stessi percorsi, scelto in base al diritto dell'utente).
// Deve ritornare { ok: true } oppure { ok: false, status: 401|403 }.
// eslint-disable-next-line no-unused-vars
async function authorize(request, env, key) {
  return { ok: true };
}

function originiAmmesse(env) {
  return String(env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
}

// Header comuni a ogni risposta: sicurezza + CORS (solo per le origini in lista).
function baseHeaders(request, env) {
  const h = new Headers();
  h.set("X-Content-Type-Options", "nosniff");
  h.append("Vary", "Origin");
  const origin = request.headers.get("Origin");
  if (origin && originiAmmesse(env).includes(origin)) {
    h.set("Access-Control-Allow-Origin", origin);
    h.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    h.set("Access-Control-Allow-Headers", "Range, If-None-Match");
    h.set("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges, ETag");
    h.set("Access-Control-Max-Age", "86400");
  }
  return h;
}

function testo(status, corpo, headers, extra = {}) {
  headers.set("Content-Type", "text/plain; charset=utf-8");
  for (const [k, v] of Object.entries(extra)) headers.set(k, v);
  return new Response(corpo, { status, headers });
}

// Ritorna la chiave R2 valida, oppure null.
function chiaveDaUrl(url) {
  let key;
  try {
    key = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
  } catch {
    return null;
  }
  if (!key || key.includes("..") || key.includes("\\")) return null;
  return CHIAVE.test(key) ? key : null;
}

function intestazioniOggetto(object, key, base) {
  const h = base;
  object.writeHttpMetadata(h);
  h.set("Content-Type", TIPI[key.split(".").pop()]);
  h.set("ETag", object.httpEtag);
  h.set("Cache-Control", CACHE_CONTROL);
  h.set("Accept-Ranges", "bytes");
  return h;
}

async function gestisci(request, env) {
  const base = baseHeaders(request, env);

  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: base });
  if (request.method !== "GET" && request.method !== "HEAD") {
    return testo(405, "Metodo non consentito", base, { Allow: "GET, HEAD, OPTIONS" });
  }

  const key = chiaveDaUrl(new URL(request.url));
  if (!key) return testo(404, "Non trovato", base);

  const auth = await authorize(request, env, key);
  if (!auth.ok) return testo(auth.status || 403, "Accesso negato", base);

  if (request.method === "HEAD") {
    const head = await env.AUDIO.head(key);
    if (!head) return testo(404, "Non trovato", base);
    const h = intestazioniOggetto(head, key, base);
    h.set("Content-Length", String(head.size));
    return new Response(null, { status: 200, headers: h });
  }

  // Niente caches.default: i file sono immutabili e R2 + la cache del browser (immutable) bastano;
  // una cache di edge sui GET completi aggiungerebbe complessita' e, con il futuro premium, il rischio
  // di servire a tutti un file protetto. Le richieste Range non sono comunque cacheabili in modo semplice.
  const haRange = request.headers.has("Range");
  let object;
  try {
    object = await env.AUDIO.get(key, { range: request.headers, onlyIf: request.headers });
  } catch (err) {
    // Range non soddisfacibile: R2 solleva un errore. Recupero la dimensione per Content-Range.
    if (haRange) {
      const head = await env.AUDIO.head(key);
      if (!head) return testo(404, "Non trovato", base);
      return testo(416, "Range non soddisfacibile", base, { "Content-Range": `bytes */${head.size}` });
    }
    throw err;
  }
  if (!object) return testo(404, "Non trovato", base);

  const h = intestazioniOggetto(object, key, base);
  // Senza body: la condizione onlyIf non e' soddisfatta.
  if (!("body" in object) || object.body === undefined) {
    const cond = request.headers.has("If-None-Match") || request.headers.has("If-Modified-Since");
    return new Response(null, { status: cond ? 304 : 412, headers: h });
  }

  let status = 200;
  if (haRange && object.range) {
    const { offset = 0, length = object.size - offset } = object.range;
    h.set("Content-Range", `bytes ${offset}-${offset + length - 1}/${object.size}`);
    h.set("Content-Length", String(length));
    status = 206;
  } else {
    h.set("Content-Length", String(object.size));
  }
  return new Response(object.body, { status, headers: h });
}

export default {
  async fetch(request, env, ctx) {
    try {
      return await gestisci(request, env, ctx);
    } catch {
      // Nessun dettaglio all'esterno.
      return new Response("Errore interno", {
        status: 500,
        headers: { "Content-Type": "text/plain; charset=utf-8", "X-Content-Type-Options": "nosniff" },
      });
    }
  },
};

export { authorize, chiaveDaUrl };
