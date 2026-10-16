import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../workers/audio/src/index.js";

const DATI = new Uint8Array(1000).map((_, i) => i % 256);
const ETAG = '"abc123"';

// Finto bucket R2 in memoria: get/head con range e onlyIf, come l'API reale.
function oggetto(key, conBody, range) {
  const o = {
    key, size: DATI.length, httpEtag: ETAG,
    writeHttpMetadata(h) { h.set("Last-Modified", "Mon, 01 Jan 2026 00:00:00 GMT"); h.set("Content-Type", "application/octet-stream"); },
  };
  if (conBody) {
    const off = range ? range.offset : 0, len = range ? range.length : DATI.length;
    o.body = new Blob([DATI.slice(off, off + len)]).stream();
    if (range) o.range = range;
  }
  return o;
}
function finto(files) {
  return {
    async head(key) { return files.has(key) ? oggetto(key, false) : null; },
    async get(key, { range, onlyIf } = {}) {
      if (!files.has(key)) return null;
      const inm = onlyIf?.get("If-None-Match");
      if (inm && inm === ETAG) return oggetto(key, false);
      const r = range?.get("Range");
      if (r) {
        const m = /^bytes=(\d*)-(\d*)$/.exec(r);
        let a = m[1] === "" ? DATI.length - Number(m[2]) : Number(m[1]);
        let b = m[1] === "" || m[2] === "" ? DATI.length - 1 : Math.min(Number(m[2]), DATI.length - 1);
        if (a >= DATI.length || a > b) throw new Error("R2Error 10039 range non soddisfacibile");
        return oggetto(key, true, { offset: a, length: b - a + 1 });
      }
      return oggetto(key, true);
    },
  };
}
const ENV = () => ({
  AUDIO: finto(new Set(["locus-iste/v1/soprano.opus", "locus-iste/v1/soprano.mp3"])),
  ALLOWED_ORIGINS: "https://voceavoce.com,http://localhost:8080",
});
const chiedi = (path, init = {}, env = ENV()) => worker.fetch(new Request("https://w.example" + path, init), env, {});
const OPUS = "/locus-iste/v1/soprano.opus";

test("GET 200 con corpo e header", async () => {
  const r = await chiedi(OPUS);
  assert.equal(r.status, 200);
  assert.equal((await r.arrayBuffer()).byteLength, 1000);
  assert.equal(r.headers.get("Content-Length"), "1000");
  assert.equal(r.headers.get("ETag"), ETAG);
  assert.equal(r.headers.get("Accept-Ranges"), "bytes");
  assert.equal(r.headers.get("X-Content-Type-Options"), "nosniff");
});

test("Content-Type forzato e Cache-Control", async () => {
  const o = await chiedi(OPUS);
  assert.equal(o.headers.get("Content-Type"), "audio/ogg");
  assert.equal(o.headers.get("Cache-Control"), "public, max-age=31536000, immutable");
  const m = await chiedi("/locus-iste/v1/soprano.mp3");
  assert.equal(m.headers.get("Content-Type"), "audio/mpeg");
});

test("HEAD senza corpo", async () => {
  const r = await chiedi(OPUS, { method: "HEAD" });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("Content-Length"), "1000");
  assert.equal(await r.text(), "");
  assert.equal((await chiedi("/locus-iste/v1/no.opus", { method: "HEAD" })).status, 404);
});

test("Range 206 con Content-Range", async () => {
  const r = await chiedi(OPUS, { headers: { Range: "bytes=10-19" } });
  assert.equal(r.status, 206);
  assert.equal(r.headers.get("Content-Range"), "bytes 10-19/1000");
  assert.equal(r.headers.get("Content-Length"), "10");
  assert.deepEqual([...new Uint8Array(await r.arrayBuffer())], [...DATI.slice(10, 20)]);
  const coda = await chiedi(OPUS, { headers: { Range: "bytes=990-" } });
  assert.equal(coda.headers.get("Content-Range"), "bytes 990-999/1000");
});

test("Range non soddisfacibile: 416", async () => {
  const r = await chiedi(OPUS, { headers: { Range: "bytes=5000-6000" } });
  assert.equal(r.status, 416);
  assert.equal(r.headers.get("Content-Range"), "bytes */1000");
});

test("If-None-Match: 304", async () => {
  const r = await chiedi(OPUS, { headers: { "If-None-Match": ETAG } });
  assert.equal(r.status, 304);
  assert.equal(await r.text(), "");
});

test("404: file mancante, radice, percorsi malformati o con ..", async () => {
  for (const p of ["/locus-iste/v1/manca.opus", "/", "", "/locus-iste/", "/locus-iste/v1/soprano.wav",
    "/Locus/v1/soprano.opus", "/locus-iste/1/soprano.opus", // ".." letterale lo normalizza gia' il parser URL
    "/locus-iste/v1/%2e%2e/soprano.opus", "/..%2fx/v1/a.opus", "/%E0%A4%A", "/a/v1/b/c.opus"]) {
    const r = await chiedi(p);
    assert.equal(r.status, 404, p);
    assert.ok((await r.text()).length < 40);
  }
});

test("405 con Allow per POST/PUT/DELETE", async () => {
  for (const method of ["POST", "PUT", "DELETE"]) {
    const r = await chiedi(OPUS, { method, body: "x" });
    assert.equal(r.status, 405, method);
    assert.equal(r.headers.get("Allow"), "GET, HEAD, OPTIONS");
  }
});

test("CORS: presente per origine ammessa, assente per le altre", async () => {
  const ok = await chiedi(OPUS, { headers: { Origin: "https://voceavoce.com" } });
  assert.equal(ok.headers.get("Access-Control-Allow-Origin"), "https://voceavoce.com");
  assert.match(ok.headers.get("Vary"), /Origin/);
  assert.match(ok.headers.get("Access-Control-Expose-Headers"), /Content-Range/);
  const no = await chiedi(OPUS, { headers: { Origin: "https://evil.example" } });
  assert.equal(no.headers.get("Access-Control-Allow-Origin"), null);
  assert.match(no.headers.get("Vary"), /Origin/);
  const senza = await chiedi(OPUS);
  assert.equal(senza.headers.get("Access-Control-Allow-Origin"), null);
});

test("preflight OPTIONS: 204", async () => {
  const r = await chiedi(OPUS, { method: "OPTIONS", headers: { Origin: "http://localhost:8080", "Access-Control-Request-Method": "GET" } });
  assert.equal(r.status, 204);
  assert.equal(r.headers.get("Access-Control-Allow-Origin"), "http://localhost:8080");
  assert.equal(r.headers.get("Access-Control-Allow-Methods"), "GET, HEAD, OPTIONS");
  assert.equal(r.headers.get("Access-Control-Allow-Headers"), "Range, If-None-Match");
  assert.equal(r.headers.get("Access-Control-Max-Age"), "86400");
});

test("errore interno: 500 generico", async () => {
  const env = ENV();
  env.AUDIO.get = async () => { throw new Error("segreto interno"); };
  const r = await chiedi(OPUS, {}, env);
  assert.equal(r.status, 500);
  assert.equal(await r.text(), "Errore interno");
});
