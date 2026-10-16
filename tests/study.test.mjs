import { test } from "node:test";
import assert from "node:assert/strict";
import { measureIndexAt, timeOfMeasure, endOfMeasure, loopBounds, indexOfScoreMeasure, computePosition, measureLabels, formatClock } from "../src/assets/js/study/timeline.js";
import { resolveAudioUrl, isSafeRelativePath, setAudioBase } from "../src/assets/js/study/config.js";
import { effectiveGains, myVoiceState, initialMixerState } from "../src/assets/js/study/mixer.js";
import { loadStudio, checkManifest } from "../src/_lib/studio.js";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const sync = { battute: [{ m: 0, numero: "0", t: 0.5 }, { m: 1, numero: "1", t: 2.5 }, { m: 2, numero: "2", t: 5 }, { m: 1, numero: "1", t: 7 }], fine: 10 };

test("tempo -> battuta: ricerca binaria", () => {
  assert.equal(measureIndexAt(sync, 0), -1);
  assert.equal(measureIndexAt(sync, 0.5), 0);
  assert.equal(measureIndexAt(sync, 2.49), 0);
  assert.equal(measureIndexAt(sync, 2.5), 1);
  assert.equal(measureIndexAt(sync, 6.99), 2);
  assert.equal(measureIndexAt(sync, 9999), 3);
  assert.equal(measureIndexAt({ battute: [], fine: 1 }, 3), -1);
});
test("battuta -> tempo e fine battuta", () => {
  assert.equal(timeOfMeasure(sync, 2), 5);
  assert.equal(timeOfMeasure(sync, 99), 7);
  assert.equal(timeOfMeasure(sync, -3), 0.5);
  assert.equal(endOfMeasure(sync, 1), 5);
  assert.equal(endOfMeasure(sync, 3), 10);
});
test("limiti del loop: ordine, clamp, fine", () => {
  assert.deepEqual(loopBounds(sync, 1, 2), { from: 1, to: 2, start: 2.5, end: 7 });
  assert.deepEqual(loopBounds(sync, 2, 1), { from: 1, to: 2, start: 2.5, end: 7 });
  assert.deepEqual(loopBounds(sync, -5, 99), { from: 0, to: 3, start: 0.5, end: 10 });
  assert.deepEqual(loopBounds(sync, "x", 0), { from: 0, to: 0, start: 0.5, end: 2.5 });
  assert.equal(loopBounds({ battute: [], fine: 1 }, 0, 0), null);
});
test("battuta di partitura -> indice di esecuzione (ritornelli)", () => {
  assert.equal(indexOfScoreMeasure(sync, 1, 0), 1);
  assert.equal(indexOfScoreMeasure(sync, 1, 3), 3);
  assert.equal(indexOfScoreMeasure(sync, 9), -1);
  assert.deepEqual(measureLabels(sync), ["0", "1", "2", "1 (2)"]);
});
test("orologio unico: velocita' e loop", () => {
  assert.equal(computePosition({ anchorPos: 2, anchorTime: 10, now: 12, rate: 1 }), 4);
  assert.equal(computePosition({ anchorPos: 2, anchorTime: 10, now: 12, rate: 0.75 }), 3.5);
  assert.equal(computePosition({ anchorPos: 2, anchorTime: 10, now: 9, rate: 1 }), 2); // partenza futura
  assert.equal(computePosition({ anchorPos: 0, anchorTime: 0, now: 99, rate: 1, duration: 10 }), 10);
  const loop = { start: 4, end: 8 };
  assert.equal(computePosition({ anchorPos: 6, anchorTime: 0, now: 3, rate: 1, loop }), 5); // 9 -> 4 + 1
  assert.equal(computePosition({ anchorPos: 6, anchorTime: 0, now: 1, rate: 1, loop }), 7);
  assert.equal(computePosition({ anchorPos: 1, anchorTime: 0, now: 12, rate: 1, loop }), 4 + ((13 - 4) % 4)); // entra nel loop dopo averlo raggiunto
  assert.equal(formatClock(75.9), "1:15");
});

test("resolveAudioUrl: percorsi relativi, niente doppie barre, MP3 di riserva", () => {
  const tr = { file: "locus/v1/soprano.opus", riserva: "locus/v1/soprano.mp3" };
  assert.equal(resolveAudioUrl(tr, { base: "https://audio.voceavoce.com/", opus: true }), "https://audio.voceavoce.com/locus/v1/soprano.opus");
  assert.equal(resolveAudioUrl(tr, { base: "http://localhost:8787///", opus: false }), "http://localhost:8787/locus/v1/soprano.mp3");
  assert.equal(resolveAudioUrl(tr, { base: "http://x", fallback: true }), "http://x/locus/v1/soprano.mp3");
  assert.equal(resolveAudioUrl({ file: "a b/c.opus" }, { base: "http://x", opus: false }), "http://x/a%20b/c.opus"); // senza riserva resta il file
  setAudioBase("https://b.test/");
  assert.equal(resolveAudioUrl(tr, { opus: true }), "https://b.test/locus/v1/soprano.opus");
  setAudioBase("");
  assert.throws(() => resolveAudioUrl(tr, { opus: true }), /non configurata/);
});
test("resolveAudioUrl rifiuta URL assoluti e percorsi pericolosi", () => {
  for (const bad of ["https://evil.test/a.opus", "//evil.test/a.opus", "/a.opus", "../a.opus", "a/../b.opus", "a//b.opus", "javascript:alert(1)", "data:audio/wav;base64,AA", "a\\b.opus", "a.opus?x=1", ""]) {
    assert.equal(isSafeRelativePath(bad), false, bad);
    assert.throws(() => resolveAudioUrl({ file: bad }, { base: "http://x", opus: true }), /non valido/, bad);
  }
  assert.equal(isSafeRelativePath("slug/v1/tenore-1.opus"), true);
});

test("mixer: mute, solo e La mia voce", () => {
  const tracks = ["S", "A", "T", "B"].map((c) => ({ chiave: c }));
  let st = initialMixerState(tracks);
  assert.deepEqual(effectiveGains(st), { S: 1, A: 1, T: 1, B: 1 });
  st.A.mute = true;
  assert.equal(effectiveGains(st).A, 0);
  st.B.solo = true;
  assert.deepEqual(effectiveGains(st), { S: 0, A: 0, T: 0, B: 1 });
  st.A.solo = true; // solo + mute: resta muta
  assert.deepEqual(effectiveGains(st), { S: 0, A: 0, T: 0, B: 1 });
  st.B.volume = 0.4;
  assert.equal(effectiveGains(st).B, 0.4);
  st = myVoiceState(st, "T");
  assert.deepEqual(effectiveGains(st), { S: 0.3, A: 0.3, T: 1, B: 0.3 });
});

test("studio: manifest con URL assoluto rifiutato; dati di prova esclusi in produzione", () => {
  const m = { schema: 1, slug: "x", tracce: [{ voce: "S", chiave: "soprano", file: "https://e.test/a.opus" }] };
  assert.throws(() => checkManifest("x", m, sync), /non relativo/);
  const dir = mkdtempSync(path.join(tmpdir(), "player-"));
  for (const slug of ["_prova", "vero"]) {
    mkdirSync(path.join(dir, slug));
    writeFileSync(path.join(dir, slug, "manifest.json"), JSON.stringify({ schema: 1, slug, titolo: "T", tracce: [{ voce: "S", chiave: "soprano", file: `${slug}/v1/soprano.opus` }], sync: "sync.json", partitura: "score.musicxml" }));
    writeFileSync(path.join(dir, slug, "sync.json"), JSON.stringify(sync));
    writeFileSync(path.join(dir, slug, "score.musicxml"), "<x/>");
  }
  assert.deepEqual(loadStudio({ dir, production: true }).slugs, ["vero"]);
  const dev = loadStudio({ dir, production: false });
  assert.deepEqual(dev.slugs, ["_prova", "vero"]);
  assert.deepEqual(Object.keys(dev.linked), ["vero"]); // nessun link verso i dati di prova
  assert.equal(dev.schede.length, 6);
});
