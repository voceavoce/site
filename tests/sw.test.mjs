import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

// sw-core.js e' uno script classico (importScripts nel SW): qui lo si valuta in un contesto isolato.
const ctx = { URL };
vm.createContext(ctx);
vm.runInContext(readFileSync(new URL("../src/assets/js/sw-core.js", import.meta.url), "utf8"), ctx);
const { classify, isCacheable, staleCaches, cacheNames } = ctx.SWCore;

const ORIGIN = "https://voceavoce.com";
const req = (url, { method = "GET", mode = "no-cors", range } = {}) => ({
  url, method, mode, headers: { get: (n) => (n.toLowerCase() === "range" ? range ?? null : null) },
});

test("audio mai intercettato: host dell'audio e estensioni", () => {
  for (const u of [
    "https://audio.voceavoce.com/locus-iste/v1/soprano.opus",
    "http://localhost:8787/locus-iste/v1/soprano.opus",
    "https://audio.voceavoce.com/qualsiasi",
    `${ORIGIN}/player-data/x/soprano.opus`,
    `${ORIGIN}/a.MP3`, `${ORIGIN}/a.wav`, `${ORIGIN}/a.flac?sig=abc`,
  ]) assert.equal(classify(req(u), ORIGIN), "ignore", u);
  // Worker dell'audio in produzione: *.workers.dev e host iniettato da site.audioBase
  assert.equal(classify(req("https://voceavoce-audio.mio.workers.dev/locus-iste/v1/soprano"), ORIGIN), "ignore");
  assert.equal(classify(req("https://altro-host.example/locus-iste/v1/soprano"), ORIGIN, ["altro-host.example"]), "ignore");
  assert.equal(classify(req("https://altro-host.example:9000/x"), ORIGIN, ["altro-host.example:9000"]), "ignore");
  // anche se il browser ci fa girare sulla stessa origine di sviluppo
  assert.equal(classify(req("http://localhost:8787/x.opus"), "http://localhost:8787"), "ignore");
});

test("Range mai intercettato, nemmeno su un asset statico o una navigazione", () => {
  assert.equal(classify(req(`${ORIGIN}/assets/js/player.js`, { range: "bytes=0-" }), ORIGIN), "ignore");
  assert.equal(classify(req(`${ORIGIN}/`, { mode: "navigate", range: "bytes=0-10" }), ORIGIN), "ignore");
});

test("cross-origin, pagefind, sw.js e metodi non GET non intercettati", () => {
  assert.equal(classify(req("https://www.youtube-nocookie.com/embed/abc", { mode: "navigate" }), ORIGIN), "ignore");
  assert.equal(classify(req("https://i.ytimg.com/vi/abc/hq.jpg"), ORIGIN), "ignore");
  assert.equal(classify(req(`${ORIGIN}/pagefind/pagefind.js`), ORIGIN), "ignore");
  assert.equal(classify(req(`${ORIGIN}/pagefind/index/it.pf_index`), ORIGIN), "ignore");
  assert.equal(classify(req(`${ORIGIN}/sw.js`), ORIGIN), "ignore");
  assert.equal(classify(req(`${ORIGIN}/`, { method: "POST", mode: "navigate" }), ORIGIN), "ignore");
  assert.equal(classify(req("chrome-extension://abc/x.js"), ORIGIN), "ignore");
});

test("navigazioni same-origin: network-first", () => {
  assert.equal(classify(req(`${ORIGIN}/`, { mode: "navigate" }), ORIGIN), "navigate");
  assert.equal(classify(req(`${ORIGIN}/brani/locus-iste/`, { mode: "navigate" }), ORIGIN), "navigate");
  assert.equal(classify(req(`${ORIGIN}/?source=pwa`, { mode: "navigate" }), ORIGIN), "navigate");
});

test("asset statici same-origin: stale-while-revalidate", () => {
  for (const p of ["/assets/css/main.css", "/assets/js/player.js", "/assets/js/study/app.js", "/assets/img/avatar.png",
    "/assets/vendor/verovio/verovio-module.mjs", "/assets/vendor/x.wasm", "/player-data/locus-iste/score.musicxml", "/manifest.webmanifest"]) {
    assert.equal(classify(req(ORIGIN + p), ORIGIN), "static", p);
  }
  assert.equal(classify(req(`${ORIGIN}/api/qualcosa`), ORIGIN), "ignore");
});

test("solo i 200 completi si salvano (mai 206, errori o opache)", () => {
  assert.equal(isCacheable({ status: 200, type: "basic" }), true);
  assert.equal(isCacheable({ status: 206, type: "basic" }), false);
  assert.equal(isCacheable({ status: 404, type: "basic" }), false);
  assert.equal(isCacheable({ status: 200, type: "opaque" }), false);
  assert.equal(isCacheable(null), false);
});

test("activate: via le cache vecchie, non quelle di altri", () => {
  const n = cacheNames("v2");
  assert.deepEqual(staleCaches(["vav-pre-v1", "vav-rt-v1", n.pre, n.rt, "altro"], "v2"), ["vav-pre-v1", "vav-rt-v1"]);
});
