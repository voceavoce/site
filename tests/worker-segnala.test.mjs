import { test } from "node:test";
import assert from "node:assert/strict";
import worker, { validaSegnalazione, costruisciIssue } from "../workers/segnala/src/index.js";

const ENV = { GITHUB_REPO: "voceavoce/segnalazioni", GITHUB_TOKEN: "token-finto", ALLOWED_ORIGINS: "https://voceavoce.com,http://localhost:8080" };
const OK = { titolo: "Agnus Dei", pagina: "https://voceavoce.com/player/agnus-dei-josquin/", battuta: "12", lingua: "fr", cosa: "Il fa del tenore e' sbagliato", contatto: "" };

let ipN = 0;
function richiesta(corpo, { metodo = "POST", origin = "https://voceavoce.com", tipo = "application/json", ip } = {}) {
  const h = new Headers({ "CF-Connecting-IP": ip || `10.0.0.${++ipN}` });
  if (origin) h.set("Origin", origin);
  if (tipo) h.set("Content-Type", tipo);
  return new Request("https://segnala.example/", { method: metodo, headers: h, body: metodo === "POST" ? (typeof corpo === "string" ? corpo : JSON.stringify(corpo)) : undefined });
}
function fetcherFinto(esito = true) {
  const chiamate = [];
  const f = async (url, init) => { chiamate.push({ url, init, corpo: JSON.parse(init.body) }); return new Response("{}", { status: esito ? 201 : 500 }); };
  f.chiamate = chiamate;
  return f;
}
const invia = (corpo, opzioni, env = ENV, f = fetcherFinto()) => worker.fetch(richiesta(corpo, opzioni), env, {}, f).then(async (r) => ({ r, json: await r.json().catch(() => null), f }));

test("validaSegnalazione: campi puliti, lingua sconosciuta -> it", () => {
  const v = validaSegnalazione({ ...OK, lingua: "xx", cosa: "  nota sbagliata \r\n" });
  assert.equal(v.ok, true);
  assert.equal(v.dati.lingua, "it");
  assert.equal(v.dati.cosa, "nota sbagliata");
});

test("validaSegnalazione: rifiuta formato, testo troppo corto o lungo, titolo mancante, pagina strana", () => {
  assert.equal(validaSegnalazione(null).errore, "formato");
  assert.equal(validaSegnalazione([]).errore, "formato");
  assert.equal(validaSegnalazione({ ...OK, cosa: "a" }).errore, "cosa-corto");
  assert.equal(validaSegnalazione({ ...OK, cosa: "x".repeat(2001) }).errore, "cosa-lungo");
  assert.equal(validaSegnalazione({ ...OK, titolo: "" }).errore, "titolo");
  assert.equal(validaSegnalazione({ ...OK, pagina: "javascript:alert(1)" }).errore, "pagina");
  assert.equal(validaSegnalazione({ ...OK, cosa: 42 }).errore, "cosa-corto");
});

test("costruisciIssue: testo recintato, email copiabile cosi' com'e', titolo con battuta e lingua", () => {
  const i = costruisciIssue(validaSegnalazione({ ...OK, cosa: "ciao @mario\n~~~~\n# titolo", contatto: "io@esempio.it" }).dati);
  assert.equal(i.titolo, "Spartito: Agnus Dei (battuta 12) [fr]");
  assert.ok(i.corpo.includes("io@esempio.it"), "l'email resta intera, senza caratteri invisibili dopo la @");
  assert.ok(!i.corpo.includes("\u200b"), "nessun carattere invisibile");
  assert.ok(i.corpo.includes("~~~~\nciao @mario\n~~\n# titolo\n~~~~"), "la menzione sta dentro il recinto, che non si chiude dall'interno");
  assert.match(i.corpo, /\*\*Contatto \(solo per rispondere\):\*\*/);
  assert.match(i.corpo, /\*\*Battuta:\*\* 12/);
});

test("POST valido: crea una issue nel repo privato con il token, risponde ok", async () => {
  const { r, json, f } = await invia(OK);
  assert.equal(r.status, 200);
  assert.deepEqual(json, { ok: true });
  assert.equal(f.chiamate.length, 1);
  assert.equal(f.chiamate[0].url, "https://api.github.com/repos/voceavoce/segnalazioni/issues");
  assert.equal(f.chiamate[0].init.headers.Authorization, "Bearer token-finto");
  assert.match(f.chiamate[0].corpo.title, /^Spartito: Agnus Dei/);
  assert.equal(r.headers.get("Access-Control-Allow-Origin"), "https://voceavoce.com");
});

test("campo trappola pieno: risponde ok ma non crea niente", async () => {
  const { r, json, f } = await invia({ ...OK, sito: "http://spam.example" });
  assert.equal(r.status, 200);
  assert.deepEqual(json, { ok: true });
  assert.equal(f.chiamate.length, 0);
});

test("origine non ammessa, metodo, tipo e corpo non validi vengono rifiutati", async () => {
  assert.equal((await invia(OK, { origin: "https://altro.example" })).r.status, 403);
  assert.equal((await worker.fetch(richiesta(OK, { metodo: "GET" }), ENV, {}, fetcherFinto())).status, 405);
  assert.equal((await invia(OK, { tipo: "text/plain" })).r.status, 415);
  assert.equal((await invia("{non json")).r.status, 400);
  assert.equal((await invia({ ...OK, cosa: "x".repeat(9000) })).r.status, 413);
  assert.equal((await invia({ ...OK, cosa: "" })).r.status, 400);
});

test("preflight CORS: 204 con le origini ammesse, niente CORS per le altre", async () => {
  const ok = await worker.fetch(richiesta("", { metodo: "OPTIONS", origin: "https://voceavoce.com" }), ENV, {}, fetcherFinto());
  assert.equal(ok.status, 204);
  assert.equal(ok.headers.get("Access-Control-Allow-Origin"), "https://voceavoce.com");
  const no = await worker.fetch(richiesta("", { metodo: "OPTIONS", origin: "https://altro.example" }), ENV, {}, fetcherFinto());
  assert.equal(no.headers.get("Access-Control-Allow-Origin"), null);
});

test("senza token o repo: 503; se GitHub risponde male: 502 senza dettagli", async () => {
  assert.equal((await invia(OK, {}, { ...ENV, GITHUB_TOKEN: "" })).r.status, 503);
  const { r, json } = await invia(OK, {}, ENV, fetcherFinto(false));
  assert.equal(r.status, 502);
  assert.deepEqual(json, { ok: false, errore: "inoltro" });
});

test("limite: dalla sesta richiesta in un minuto dallo stesso indirizzo, 429", async () => {
  const stati = [];
  for (let i = 0; i < 7; i++) stati.push((await invia(OK, { ip: "203.0.113.9" })).r.status);
  assert.deepEqual(stati, [200, 200, 200, 200, 200, 429, 429]);
});

test("limite con il binding LIMITE di Cloudflare, se presente", async () => {
  const env = { ...ENV, LIMITE: { limit: async () => ({ success: false }) } };
  assert.equal((await invia(OK, {}, env)).r.status, 429);
});
