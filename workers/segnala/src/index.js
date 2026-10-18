// Worker che riceve le segnalazioni di errori negli spartiti dal modulo del sito e le gira come issue di un
// repository GitHub PRIVATO (GITHUB_REPO): a chi cura il sito arriva la notifica di GitHub, a chi segnala non serve
// nessun account. Nessuna dipendenza. Il token (GITHUB_TOKEN) e' un segreto di wrangler, mai nel repository.
// Il testo delle persone non e' mai eseguito ne' interpretato: finisce in un blocco di codice dell'issue.

const LINGUE = ["it", "en", "es", "de", "fr"];
const MAX_CORPO = 8 * 1024; // byte della richiesta
const LIMITI = { titolo: 200, pagina: 300, battuta: 20, cosa: 2000, contatto: 200 };
const MIN_COSA = 3;
const FINESTRA_MS = 60_000;
const MAX_PER_FINESTRA = 5;
const recenti = new Map(); // ip -> [istanti]: argine a basso costo, per isolate (il vero limite e' il binding LIMITE, se c'e')

function originiAmmesse(env) {
  return String(env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
}

function intestazioni(request, env) {
  const h = new Headers({ "Content-Type": "application/json; charset=utf-8", "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store" });
  h.append("Vary", "Origin");
  const origin = request.headers.get("Origin");
  if (origin && originiAmmesse(env).includes(origin)) {
    h.set("Access-Control-Allow-Origin", origin);
    h.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    h.set("Access-Control-Allow-Headers", "Content-Type");
    h.set("Access-Control-Max-Age", "86400");
  }
  return h;
}

function risposta(status, corpo, request, env) {
  return new Response(JSON.stringify(corpo), { status, headers: intestazioni(request, env) });
}

/** Controlla e ripulisce i campi. Ritorna { ok: true, dati } oppure { ok: false, errore }. Pura (testabile). */
export function validaSegnalazione(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, errore: "formato" };
  const s = (v) => (typeof v === "string" ? v.replace(/\r\n/g, "\n").trim() : "");
  const dati = {
    titolo: s(raw.titolo), pagina: s(raw.pagina), battuta: s(raw.battuta),
    lingua: LINGUE.includes(raw.lingua) ? raw.lingua : "it", cosa: s(raw.cosa), contatto: s(raw.contatto),
  };
  for (const [k, max] of Object.entries(LIMITI)) if (dati[k].length > max) return { ok: false, errore: `${k}-lungo` };
  if (dati.cosa.length < MIN_COSA) return { ok: false, errore: "cosa-corto" };
  if (!dati.titolo) return { ok: false, errore: "titolo" };
  if (dati.pagina && !/^https?:\/\//i.test(dati.pagina)) return { ok: false, errore: "pagina" };
  return { ok: true, dati };
}

// Il testo delle persone va in un blocco recintato: niente titoli, link o menzioni che GitHub interpreti.
function recinto(testo) {
  return "~~~~\n" + testo.replace(/~{3,}/g, "~~").replace(/@/g, "@​") + "\n~~~~";
}

/** Titolo e testo dell'issue (in italiano per l'intestazione; il testo resta nella lingua della persona). Pura. */
export function costruisciIssue(d) {
  const titolo = `Spartito: ${d.titolo}${d.battuta ? ` (battuta ${d.battuta})` : ""} [${d.lingua}]`.slice(0, 250);
  const righe = [
    `**Brano:** ${d.titolo.replace(/[\r\n]+/g, " ")}`,
    `**Pagina:** ${d.pagina || "-"}`,
    `**Battuta:** ${d.battuta || "-"}`,
    `**Lingua:** ${d.lingua}`,
    "",
    "**Cosa non va:**",
    recinto(d.cosa),
  ];
  if (d.contatto) righe.push("", "**Contatto (solo per rispondere):**", recinto(d.contatto));
  return { titolo, corpo: righe.join("\n") };
}

function troppeRichieste(ip, adesso) {
  const lista = (recenti.get(ip) || []).filter((t) => adesso - t < FINESTRA_MS);
  lista.push(adesso);
  recenti.set(ip, lista);
  if (recenti.size > 500) for (const k of recenti.keys()) { if (!(recenti.get(k) || []).some((t) => adesso - t < FINESTRA_MS)) recenti.delete(k); }
  return lista.length > MAX_PER_FINESTRA;
}

async function creaIssue(env, issue, fetcher) {
  const r = await fetcher(`https://api.github.com/repos/${env.GITHUB_REPO}/issues`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "voceavoce-segnala",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title: issue.titolo, body: issue.corpo }),
  });
  return r.ok;
}

export default {
  async fetch(request, env, ctx, fetcher = fetch) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: intestazioni(request, env) });
    if (request.method !== "POST") return risposta(405, { ok: false, errore: "metodo" }, request, env);

    const origin = request.headers.get("Origin");
    if (origin && !originiAmmesse(env).includes(origin)) return risposta(403, { ok: false, errore: "origine" }, request, env);
    if (!/^application\/json\b/i.test(request.headers.get("Content-Type") || "")) return risposta(415, { ok: false, errore: "tipo" }, request, env);

    const ip = request.headers.get("CF-Connecting-IP") || "?";
    if (env.LIMITE?.limit) {
      const { success } = await env.LIMITE.limit({ key: ip });
      if (!success) return risposta(429, { ok: false, errore: "limite" }, request, env);
    } else if (troppeRichieste(ip, Date.now())) return risposta(429, { ok: false, errore: "limite" }, request, env);

    const testo = await request.text();
    if (testo.length > MAX_CORPO) return risposta(413, { ok: false, errore: "grande" }, request, env);
    let raw;
    try { raw = JSON.parse(testo); } catch { return risposta(400, { ok: false, errore: "json" }, request, env); }

    // Campo trappola, nascosto alle persone: se e' pieno e' un robot. Si risponde "ok" e non si fa nulla.
    if (raw && typeof raw === "object" && String(raw.sito || "").trim()) return risposta(200, { ok: true }, request, env);

    const v = validaSegnalazione(raw);
    if (!v.ok) return risposta(400, { ok: false, errore: v.errore }, request, env);
    if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) return risposta(503, { ok: false, errore: "non-configurato" }, request, env);

    let creata = false;
    try { creata = await creaIssue(env, costruisciIssue(v.dati), fetcher); } catch { creata = false; }
    return creata ? risposta(200, { ok: true }, request, env) : risposta(502, { ok: false, errore: "inoltro" }, request, env);
  },
};
