// S3 (T-1013): il controllo di fumo del sito pubblico, provato su un finto sito (nessuna rete vera).
import assert from "node:assert/strict";
import test from "node:test";
import { controllaBrano, datiStudio, main, sceglieBrani, slugDaHtml } from "../scripts/smoke-pubblico.mjs";

const studio = (extra = {}) => `<main data-score></main><script type="application/json" id="study-data">${JSON.stringify({
  audioBase: "https://audio.test", scoreUrl: "/player-data/a/score.musicxml", senzaAudio: false,
  manifest: { tracce: [{ chiave: "soprano", file: "a/v1/soprano.opus" }] }, ...extra })}</script>`;

function sito({ pagina = studio(), partitura = "<score-partwise></score-partwise>", audio = { status: 206, tipo: "audio/ogg", corpo: "x".repeat(1024) } } = {}) {
  const richieste = [];
  const f = async (url, opz = {}) => {
    const u = new URL(url);
    richieste.push({ metodo: opz.method ?? "GET", url: u.href, range: opz.headers?.range ?? null });
    const risposta = (status, corpo, tipo = "text/html") => new Response(corpo, { status, headers: { "content-type": tipo } });
    if (u.host === "audio.test") return risposta(audio.status, audio.corpo ?? "", audio.tipo);
    if (u.pathname === "/coro/") return risposta(200, `<a href="/brani/x/">x</a><a href="/brani/a/">a</a><a href="/brani/x/">x</a><a href="/brani/b/">b</a>`);
    if (u.pathname === "/brani/a/") return risposta(200, `<a href="/player/a/">ascolta</a>`);
    if (u.pathname === "/brani/b/") return risposta(200, `<a href="/en/player/b/">listen</a>`);
    if (u.pathname === "/brani/x/") return risposta(200, `<p>nessun player</p>`);
    if (u.pathname === "/player/a/") return pagina === null ? risposta(404, "no") : risposta(200, pagina);
    if (u.pathname === "/player-data/a/score.musicxml") return partitura === null ? risposta(404, "no") : risposta(200, partitura, "application/xml");
    return risposta(404, "no");
  };
  return { f, richieste };
}

test("slug dai link, senza doppioni", () => {
  assert.deepEqual(slugDaHtml(`<a href="/player/a/"><a href="/en/player/b/"><a href="/player/a/">`), ["a", "b"]);
  assert.equal(datiStudio("<p>niente</p>"), null);
});

test("tutto risponde: ok, e le richieste sono solo GET (per l'audio con Range minimo)", async () => {
  const { f, richieste } = sito();
  const r = await controllaBrano("https://x.test", "a", f);
  assert.equal(r.ok, true);
  assert.deepEqual(r.passi.map((p) => p.nome), ["pagina", "partitura", "audio"]);
  assert.ok(richieste.every((q) => q.metodo === "GET"));
  assert.equal(richieste.find((q) => q.url.includes("audio.test")).range, "bytes=0-1023");
});

test("ogni guasto e' un KO con il motivo", async () => {
  assert.equal((await controllaBrano("https://x.test", "a", sito({ pagina: null }).f)).ok, false);
  const senzaPartitura = await controllaBrano("https://x.test", "a", sito({ partitura: null }).f);
  assert.deepEqual(senzaPartitura.passi.filter((p) => !p.ok).map((p) => p.nome), ["partitura"]);
  const audioKo = await controllaBrano("https://x.test", "a", sito({ audio: { status: 403, tipo: "text/plain", corpo: "" } }).f);
  assert.deepEqual(audioKo.passi.filter((p) => !p.ok).map((p) => p.nome), ["audio"]);
  const vuoto = await controllaBrano("https://x.test", "a", sito({ audio: { status: 200, tipo: "audio/ogg", corpo: "" } }).f);
  assert.equal(vuoto.passi.at(-1).ok, false);
});

test("brano senza audio: l'audio non si controlla", async () => {
  const r = await controllaBrano("https://x.test", "a", sito({ pagina: studio({ senzaAudio: true }) }).f);
  assert.equal(r.ok, true);
  assert.match(r.passi.at(-1).dettaglio, /senza audio/);
});

test("sceglie i primi N brani di /coro/ che hanno un player; main esce con 0 o 1", async () => {
  const { f } = sito();
  assert.deepEqual(await sceglieBrani("https://x.test", 5, f), ["a", "b"]);   // x non ha il player: saltato
  assert.deepEqual(await sceglieBrani("https://x.test", 1, f), ["a"]);
  const righe = [];
  assert.equal(await main(["--base", "https://x.test", "a"], f, (s) => righe.push(s)), 0);
  assert.match(righe.at(-1), /^FUMO OK/);
  assert.equal(await main(["--base", "https://x.test", "a"], sito({ pagina: null }).f, (s) => righe.push(s)), 1);
  assert.match(righe.at(-1), /^FUMO KO/);
});
