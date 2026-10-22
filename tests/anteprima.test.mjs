// Funzioni pure del pannello di anteprima (src/assets/js/study/anteprima-lib.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadStudio } from "../src/_lib/studio.js";
import { bpmDaVelocita, velocitaPerBpm, indiceBattuta, righeOpzioni, testoRisposta } from "../src/assets/js/study/anteprima-lib.js";

test("bpmDaVelocita: tempo di prova per la percentuale dello slider", () => {
  assert.equal(bpmDaVelocita(72, 100), 72);
  assert.equal(bpmDaVelocita(72, 75), 54);
  assert.equal(bpmDaVelocita(66, 85), 56.1);
  assert.equal(bpmDaVelocita(0, 100), null);
  assert.equal(bpmDaVelocita(72, NaN), null);
});

test("velocitaPerBpm: passi di 5, segnala quando serve rigenerare", () => {
  assert.deepEqual(velocitaPerBpm(80, 72), { pct: 90, fuori: false });
  assert.deepEqual(velocitaPerBpm(80, 40), { pct: 50, fuori: false });
  assert.deepEqual(velocitaPerBpm(80, 30), { pct: 50, fuori: true });
  assert.deepEqual(velocitaPerBpm(72, 90), { pct: 100, fuori: true });
  assert.equal(velocitaPerBpm(72, "x"), null);
  // anteprima a soli strumenti: lo slider arriva al 150%
  assert.deepEqual(velocitaPerBpm(80, 100, 150), { pct: 125, fuori: false });
  assert.deepEqual(velocitaPerBpm(80, 120, 150), { pct: 150, fuori: false });
  assert.deepEqual(velocitaPerBpm(80, 130, 150), { pct: 150, fuori: true });
  assert.deepEqual(velocitaPerBpm(80, 40, 150), { pct: 50, fuori: false });
});

test("indiceBattuta: il numero e' un testo, anche con spazi; -1 se manca", () => {
  const sync = { battute: [{ numero: "1" }, { numero: "2" }, { numero: "13" }] };
  assert.equal(indiceBattuta(sync, "13"), 2);
  assert.equal(indiceBattuta(sync, 2), 1);
  assert.equal(indiceBattuta(sync, " 1 "), 0);
  assert.equal(indiceBattuta(sync, "99"), -1);
  assert.equal(indiceBattuta(sync, ""), -1);
  assert.equal(indiceBattuta(null, "1"), -1);
});

test("righeOpzioni: testo e JSON, valori lunghi tagliati", () => {
  const r = righeOpzioni({ title: "T", voicing: ["S", "A"], tempo_hint: "x".repeat(300) }, 20);
  assert.deepEqual(r[0], { chiave: "title", valore: "T" });
  assert.equal(r[1].valore, '["S","A"]');
  assert.equal(r[2].valore.length, 20);
  assert.deepEqual(righeOpzioni(null), []);
});

test("testoRisposta: tempo, osservazioni, segnalazioni e JSON da incollare", () => {
  const dossier = { brano: { titolo: "Ave verum", rank: "475", slug: "_anteprima-ave" }, tempo: { prova: 72 },
    anomalie: { mostrate: [{ battuta: "13", parte: "basso", categoria: "raddoppio", gravita: "alta" }, { battuta: "13", parte: "tenore", categoria: "sillaba", gravita: "media" }, { battuta: "17", parte: "alto", categoria: "salto", gravita: "bassa" }, { battuta: "32", parte: "soprano", categoria: "salto", gravita: "bassa" }] } };
  const t = testoRisposta({ dossier, tempo: " 66 ", note: "il basso e' troppo alto in b. 13", segnate: { 0: "vera", 2: "ignora", 3: "boh" }, velocitaPct: 90 });
  assert.match(t, /^ANTEPRIMA Ave verum \(rank 475\)\nTempo deciso: 66\n/);
  assert.match(t, /Provato a: 64.8 BPM \(90% del tempo di prova 72\)/);
  assert.match(t, /Osservazioni: il basso e' troppo alto in b\. 13/);
  assert.match(t, /Segnalazioni confermate \(battute\): 13/);
  assert.match(t, /Segnalazioni da ignorare \(battute\): 17/);
  const json = JSON.parse(t.slice(t.indexOf("{")));
  assert.deepEqual(json, { rank: "475", slug: "_anteprima-ave", tempo_deciso: "66", tempo_prova: 72, segnalazioni_vere: ["13"], segnalazioni_ignorate: ["17"],
    segnalazioni: [{ indice: 0, battuta: "13", parte: "basso", categoria: "raddoppio", gravita: "alta", esito: "vera" }, { indice: 2, battuta: "17", parte: "alto", categoria: "salto", gravita: "bassa", esito: "ignora" }],
    osservazioni: "il basso e' troppo alto in b. 13" });
});

test("testoRisposta: senza niente di compilato non esplode", () => {
  const t = testoRisposta({ dossier: null, tempo: "", note: "" });
  assert.match(t, /Tempo deciso: non indicato/);
  assert.match(t, /Osservazioni: nessuna/);
  assert.equal(JSON.parse(t.slice(t.indexOf("{"))).tempo_deciso, null);
});

// --- le cartelle di anteprima nel sito -------------------------------------------------------------------------
const SYNC = { schema: 1, battute: [{ m: 0, numero: "1", t: 0.5 }], fine: 4 };
function cartella(dir, slug, dossier) {
  mkdirSync(path.join(dir, slug));
  writeFileSync(path.join(dir, slug, "manifest.json"), JSON.stringify({ schema: 1, slug, titolo: "T", tracce: [{ voce: "S", chiave: "soprano", file: `${slug}/v1/soprano.opus` }] }));
  writeFileSync(path.join(dir, slug, "sync.json"), JSON.stringify(SYNC));
  writeFileSync(path.join(dir, slug, "score.musicxml"), "<x/>");
  if (dossier !== undefined) writeFileSync(path.join(dir, slug, "dossier.json"), typeof dossier === "string" ? dossier : JSON.stringify(dossier));
}
const DOSSIER = { schema: 1, brano: { rank: "1" }, tempo: { prova: 72 } };

test("anteprima: il dossier c'e' solo nelle cartelle _anteprima-*, e in produzione non esistono", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "player-"));
  cartella(dir, "_anteprima-x", DOSSIER);
  cartella(dir, "vero", DOSSIER); // un dossier in un brano vero non conta
  const dev = loadStudio({ dir, production: false });
  assert.equal(dev.items["_anteprima-x"].dossierFile, "dossier.json");
  assert.equal(dev.items.vero.dossierFile, null);
  assert.deepEqual(loadStudio({ dir, production: true }).slugs, ["vero"]);
  assert.equal(loadStudio({ dir, production: true }).items["_anteprima-x"], undefined);
  assert.equal("_anteprima-x" in dev.linked, false);
});

test("anteprima: dossier non valido ferma la build con un messaggio chiaro", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "player-"));
  cartella(dir, "_anteprima-y", { schema: 2, brano: {}, tempo: {} });
  assert.throws(() => loadStudio({ dir, production: false }), /dossier\.json non valido/);
});
