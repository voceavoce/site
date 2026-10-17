import { test } from "node:test";
import assert from "node:assert/strict";
import { measureIndexAt, timeOfMeasure, endOfMeasure, loopBounds, indexOfScoreMeasure, computePosition, audiblePosition, measureLabels, formatClock } from "../src/assets/js/study/timeline.js";
import { stretcherLatency, deviceLatency, totalLatency, STRETCH_LATENCY } from "../src/assets/js/study/latency.js";
import { resolveAudioUrl, isSafeRelativePath, setAudioBase } from "../src/assets/js/study/config.js";
import { effectiveGains, myVoiceState, initialMixerState, soloState, isSolo } from "../src/assets/js/study/mixer.js";
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

const voci4 = () => initialMixerState(["S", "A", "T", "B"].map((c) => ({ chiave: c })));
const mute = (st) => Object.fromEntries(Object.entries(st).map(([k, v]) => [k, v.mute]));

test("mixer: stato di partenza e mute", () => {
  const st = voci4();
  assert.deepEqual(effectiveGains(st), { S: 1, A: 1, T: 1, B: 1 });
  st.A.mute = true;
  assert.equal(effectiveGains(st).A, 0);
  st.B.volume = 0.4;
  assert.equal(effectiveGains(st).B, 0.4);
  st.B.volume = 7; assert.equal(effectiveGains(st).B, 1);   // volume fuori scala: limitato
  st.B.volume = NaN; assert.equal(effectiveGains(st).B, 0);
});
test("mixer: Solo mette in mute tutte le altre voci, e solo quelle", () => {
  const st = soloState(voci4(), "T");
  assert.deepEqual(mute(st), { S: true, A: true, T: false, B: true });
  assert.deepEqual(effectiveGains(st), { S: 0, A: 0, T: 1, B: 0 });
  assert.equal(isSolo(st, "T"), true);
  assert.equal(isSolo(st, "S"), false);
});
test("mixer: Solo riaccende la voce scelta anche se era in mute e non tocca i volumi", () => {
  const st = voci4();
  st.T.mute = true; st.T.volume = 0.6; st.S.volume = 0.5;
  const dopo = soloState(st, "T");
  assert.equal(dopo.T.mute, false);
  assert.equal(dopo.T.volume, 0.6);
  assert.equal(dopo.S.volume, 0.5);
  assert.equal(effectiveGains(dopo).T, 0.6);
});
test("mixer: secondo tocco su Solo rimette tutte in ascolto; con un'altra voce passa a quella", () => {
  let st = soloState(voci4(), "T");
  st = soloState(st, "T");
  assert.deepEqual(mute(st), { S: false, A: false, T: false, B: false });
  st = soloState(soloState(voci4(), "T"), "B");
  assert.deepEqual(mute(st), { S: true, A: true, T: true, B: false });
});
test("mixer: duetto = Solo su una voce e poi si toglie il mute a un'altra", () => {
  const st = soloState(voci4(), "S");
  st.B.mute = false;
  assert.deepEqual(effectiveGains(st), { S: 1, A: 0, T: 0, B: 1 });
  assert.equal(isSolo(st, "S"), false); // ora suonano in due: nessuna e' piu' "sola"
});
test("mixer: Solo non fa niente con una traccia sola o una voce sconosciuta, e non modifica lo stato di partenza", () => {
  const una = initialMixerState([{ chiave: "S" }]);
  assert.equal(soloState(una, "S"), una);
  assert.equal(isSolo(una, "S"), false);
  const st = voci4();
  assert.equal(soloState(st, "X"), st);
  const copia = JSON.parse(JSON.stringify(st));
  soloState(st, "A");
  assert.deepEqual(st, copia);
});
test("mixer: La mia voce porta la scelta al 100%, le altre al 30% e toglie ogni mute", () => {
  let st = soloState(voci4(), "S");
  st = myVoiceState(st, "T");
  assert.deepEqual(effectiveGains(st), { S: 0.3, A: 0.3, T: 1, B: 0.3 });
  assert.deepEqual(mute(st), { S: false, A: false, T: false, B: false });
  assert.equal("solo" in st.T, false);
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
  // solo i brani con un video gia' pubblicato: gli altri non hanno ne' pagina, ne' link, ne' partitura
  const pub = loadStudio({ dir, production: false, pubblicati: new Set(["altro"]) });
  assert.deepEqual(pub.slugs, ["_prova"]); // "vero" non e' pubblicato; i dati di prova restano (solo fuori produzione)
  assert.deepEqual(loadStudio({ dir, production: true, pubblicati: new Set(["vero"]) }).slugs, ["vero"]);
  assert.deepEqual(loadStudio({ dir, production: true, pubblicati: new Set() }).slugs, []);
});

test("latenza dello stretcher: tabella monotona, interpolata e limitata", () => {
  for (let i = 1; i < STRETCH_LATENCY.length; i++) {
    assert.ok(STRETCH_LATENCY[i][0] > STRETCH_LATENCY[i - 1][0]);
    assert.ok(STRETCH_LATENCY[i][1] >= STRETCH_LATENCY[i - 1][1]); // piu' lento = latenza minore o uguale
  }
  assert.equal(stretcherLatency(1), 0.133);
  assert.equal(stretcherLatency(0.5), 0.094);
  assert.equal(stretcherLatency(0.75), 0.123);
  assert.ok(Math.abs(stretcherLatency(0.525) - 0.0985) < 1e-9); // meta' tra 0,5 e 0,55
  assert.equal(stretcherLatency(2), 0.133);
  assert.equal(stretcherLatency(0.1), 0.094);
  assert.equal(stretcherLatency(NaN), 0.133);
});

test("latenza d'uscita: outputLatency, poi baseLatency, poi 0", () => {
  assert.equal(deviceLatency({ outputLatency: 0.07, baseLatency: 0.01 }), 0.07);
  assert.equal(deviceLatency({ outputLatency: 0, baseLatency: 0.01 }), 0.01);
  assert.equal(deviceLatency({ baseLatency: 0.02 }), 0.02);
  assert.equal(deviceLatency({ outputLatency: NaN, baseLatency: -1 }), 0);
  assert.equal(deviceLatency({ outputLatency: 99 }), 0);
  assert.equal(deviceLatency(null), 0);
});

test("latenza totale: segue il ramo attivo (bypass a 1x, stretcher sotto)", () => {
  assert.equal(totalLatency({ rate: 1, wet: 0, device: 0.07 }), 0.07); // bypass: solo il dispositivo
  assert.ok(Math.abs(totalLatency({ rate: 0.75, wet: 1, device: 0.07 }) - 0.193) < 1e-9);
  assert.ok(Math.abs(totalLatency({ rate: 0.75, wet: 0.5, device: 0 }) - 0.0615) < 1e-9); // dissolvenza a meta'
  assert.equal(totalLatency({ rate: 0.75, wet: 7 }), 0.123); // peso limitato a 1
  assert.equal(totalLatency({ rate: 1, wet: 0 }), 0);
});

test("tempo udibile: motore meno latenza (a orologio), con rate e senza passare sotto l'ancoraggio", () => {
  const a = { anchorPos: 2, anchorTime: 10, rate: 1 };
  assert.equal(audiblePosition({ ...a, now: 12, latency: 0 }), computePosition({ ...a, now: 12 }));
  assert.ok(Math.abs(audiblePosition({ ...a, now: 12, latency: 0.2 }) - 3.8) < 1e-9);
  assert.ok(Math.abs(audiblePosition({ ...a, rate: 0.75, now: 12, latency: 0.2 }) - (2 + 1.8 * 0.75)) < 1e-9);
  // dopo un seek/partenza il suono nuovo arriva `latency` dopo l'ancoraggio: prima l'udibile resta fermo
  assert.equal(audiblePosition({ ...a, now: 10.1, latency: 0.2 }), 2);
  assert.equal(audiblePosition({ ...a, now: 9, latency: 0.2 }), 2);
  assert.equal(audiblePosition({ ...a, now: 12, latency: -5 }), 4); // latenza negativa ignorata
  assert.equal(audiblePosition({ ...a, anchorPos: 9.9, now: 11, latency: 0, duration: 10 }), 10);
});

test("tempo udibile: dopo un cambio di velocita' raccorda con l'ancoraggio precedente", () => {
  const prev = { anchorPos: 2, anchorTime: 10, rate: 1, loop: null };
  // a t=12 la velocita' passa a 0,75: ancoraggio nuovo (4, 12)
  const cur = { anchorPos: 4, anchorTime: 12, rate: 0.75 };
  // 100 ms dopo, con latenza 0,2: l'udibile e' ancora sul vecchio ramo (a 11,9 s -> 3,9), non congelato a 4
  assert.ok(Math.abs(audiblePosition({ ...cur, now: 12.1, latency: 0.2, prev }) - 3.9) < 1e-9);
  assert.equal(audiblePosition({ ...cur, now: 12.1, latency: 0.2 }), 4);
  // a regime usa l'ancoraggio nuovo
  assert.ok(Math.abs(audiblePosition({ ...cur, now: 13, latency: 0.2, prev }) - (4 + 0.8 * 0.75)) < 1e-9);
});

test("tempo udibile nel loop: rientra dopo il motore e non esce mai dal loop", () => {
  const loop = { start: 5, end: 7 };
  const a = { anchorPos: 6, anchorTime: 0, rate: 1, loop };
  // il motore supera 7 a t=1 e rientra da 5; l'udibile (latenza 0,15) passa ancora per 6,95 e rientra a t=1,15
  assert.ok(Math.abs(computePosition({ ...a, now: 1.05 }) - 5.05) < 1e-9);
  assert.ok(Math.abs(audiblePosition({ ...a, now: 1.05, latency: 0.15 }) - 6.9) < 1e-9);
  assert.ok(Math.abs(audiblePosition({ ...a, now: 1.2, latency: 0.15 }) - 5.05) < 1e-9);
  for (let t = 0; t < 20; t += 0.01) {
    const p = audiblePosition({ ...a, now: t, latency: 0.15 });
    assert.ok(p >= 5 - 1e-9 && p <= 7 + 1e-9 || t < 1.15 && p >= 6 - 1e-9, `fuori dal loop a t=${t}: ${p}`);
  }
});

test("titolo della pagina del player: al massimo 70 caratteri col suffisso del sito", async () => {
  const { titoloBreve } = await import("../src/_lib/study-title.js");
  const lungo = "While shepherds watched their flocks by night (Allison, from the Christmas collection)";
  for (const lang of ["it", "en", "es"]) {
    const t = titoloBreve(lang, lungo);
    assert.ok(t.endsWith("…"), lang);
    assert.ok(t.length < lungo.length);
    assert.equal(titoloBreve(lang, "Locus iste"), "Locus iste");
  }
});
