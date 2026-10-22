// Unit test della logica PURA del cursore e delle opzioni della partitura (src/assets/js/study/cursore.js).
// Nessun DOM, nessun Verovio: la geometria arriva da funzioni finte, come la darebbe la pagina.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  frazioneInBattuta, puntiPerBattuta, completaBattute, xAlCursore, rigoDellaVoce, battutaAlPunto, opzioniPartitura, OPZIONI_DEFAULT,
} from "../src/assets/js/study/cursore.js";

const vicino = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const sync = { battute: [{ m: 0, t: 0.5 }, { m: 1, t: 2.5 }, { m: 2, t: 5 }, { m: 3, t: 7 }], fine: 10 };

// --- frazioneInBattuta -------------------------------------------------------------------------------------------
test("frazione: dentro la battuta e agli estremi", () => {
  vicino(frazioneInBattuta(sync, 0, 0.5), 0);
  vicino(frazioneInBattuta(sync, 0, 1.5), 0.5);
  vicino(frazioneInBattuta(sync, 1, 3.5), 0.4);
  vicino(frazioneInBattuta(sync, 2, 5), 0);
});
test("frazione: oltre la fine della battuta e' 1, prima dell'inizio e' 0 (mai fuori da 0..1)", () => {
  assert.equal(frazioneInBattuta(sync, 0, 99), 1);
  assert.equal(frazioneInBattuta(sync, 1, 0), 0);
});
test("frazione: l'ultima battuta dura quanto la precedente, la coda di silenzio non conta", () => {
  // ultima battuta: inizia a 7, la precedente durava 2 s -> fine a 9 (sync.fine = 10 include la coda)
  vicino(frazioneInBattuta(sync, 3, 8), 0.5);
  assert.equal(frazioneInBattuta(sync, 3, 9.5), 1);
});
test("frazione: una sola battuta usa sync.fine", () => {
  const uno = { battute: [{ m: 0, t: 1 }], fine: 5 };
  vicino(frazioneInBattuta(uno, 0, 3), 0.5);
});
test("frazione: lead-in (indice -1) e indice oltre la fine", () => {
  assert.equal(frazioneInBattuta(sync, -1, 0.2), 0);
  assert.equal(frazioneInBattuta(sync, 99, 8), frazioneInBattuta(sync, 3, 8));
});
test("frazione: dati non validi danno 0, senza eccezioni", () => {
  for (const [s, i, p] of [[undefined, 0, 1], [null, 0, 1], [{}, 0, 1], [{ battute: [] }, 0, 1], [{ battute: "x" }, 0, 1],
    [sync, NaN, 1], [sync, undefined, 1], [sync, 0, NaN], [sync, 0, undefined], [sync, 0, Infinity]]) {
    assert.equal(frazioneInBattuta(s, i, p), 0);
  }
});
test("frazione: due battute con lo stesso istante (durata nulla) non dividono per zero", () => {
  const doppie = { battute: [{ m: 0, t: 1 }, { m: 1, t: 1 }, { m: 2, t: 3 }], fine: 5 };
  assert.equal(frazioneInBattuta(doppie, 0, 1), 0);
  assert.ok(Number.isFinite(frazioneInBattuta(doppie, 1, 2)));
});

// --- puntiPerBattuta ---------------------------------------------------------------------------------------------
const timemap = [
  { qstamp: 0, measureOn: "m1", on: ["n1", "n2"] },
  { qstamp: 1, on: ["n3"] },
  { qstamp: 2, measureOn: "m2", on: ["n4"] },
  { qstamp: 3, restsOn: ["r1"] },
];
const indice = (id) => ({ m1: 0, m2: 1 })[id];
const xs = { n1: 10, n2: 20, n3: 30, n4: 100, r1: 130 };
const xDi = (id) => (id in xs ? xs[id] : null);

test("punti: note e pause per battuta, ordinate; righi diversi allo stesso istante danno la media", () => {
  const g = puntiPerBattuta(timemap, indice, xDi);
  assert.deepEqual(g[0], { q0: 0, p: [{ q: 0, x: 15 }, { q: 1, x: 30 }] });
  assert.deepEqual(g[1], { q0: 2, p: [{ q: 2, x: 100 }, { q: 3, x: 130 }] });
});
test("punti: una pausa di battuta intera (al centro) non sposta la nota delle altre voci (cursore sulla prima nota)", () => {
  // come exultate-deo-palestrina: 1 voce canta, 4 hanno la pausa di battuta, centrata a x=167
  const tm = [{ qstamp: 0, measureOn: "m1", on: ["n1"], restsOn: ["r1", "r2", "r3", "r4"] }, { qstamp: 2, on: ["n2"] }];
  const x = { n1: 132, n2: 189, r1: 167, r2: 167, r3: 167, r4: 167 };
  const g = puntiPerBattuta(tm, indice, (id) => x[id] ?? null);
  assert.deepEqual(g[0].p, [{ q: 0, x: 132 }, { q: 2, x: 189 }]);
});
test("punti: con sole pause in un istante si usa la loro posizione", () => {
  const g = puntiPerBattuta([{ qstamp: 0, measureOn: "m1", restsOn: ["r1", "r2"] }], indice, (id) => ({ r1: 40, r2: 60 })[id] ?? null);
  assert.deepEqual(g[0].p, [{ q: 0, x: 50 }]);
});
test("punti: elementi non trovati o con x non valida vengono saltati", () => {
  const g = puntiPerBattuta(timemap, indice, (id) => (id === "n3" ? NaN : id === "n4" ? null : xDi(id)));
  assert.deepEqual(g[0].p, [{ q: 0, x: 15 }]);
  assert.deepEqual(g[1].p, [{ q: 3, x: 130 }]);
});
test("punti: timemap non valida o vuota, voci senza qstamp, voci prima della prima battuta", () => {
  for (const tm of [undefined, null, "x", {}, []]) assert.deepEqual(puntiPerBattuta(tm, indice, xDi), []);
  const sporca = [null, { on: ["n1"] }, { qstamp: NaN, on: ["n1"] }, { qstamp: 0, on: ["n1"] }, { qstamp: 1, measureOn: "ignota", on: ["n2"] }];
  assert.deepEqual(puntiPerBattuta(sporca, indice, xDi), []);
});
test("punti: una battuta senza note resta con l'elenco vuoto", () => {
  const g = puntiPerBattuta([{ qstamp: 0, measureOn: "m1" }], indice, xDi);
  assert.deepEqual(g[0], { q0: 0, p: [] });
});
test("punti: i punti arrivano ordinati anche se la mappa e' in disordine", () => {
  const g = puntiPerBattuta([{ qstamp: 0, measureOn: "m1" }, { qstamp: 2, on: ["n3"] }, { qstamp: 1, on: ["n1"] }], indice, xDi);
  assert.deepEqual(g[0].p.map((p) => p.q), [1, 2]);
});

// --- completaBattute ---------------------------------------------------------------------------------------------
const info = (sistemi = ["s1", "s1"]) => (i) => ({ sistema: sistemi[i], top: 5, bottom: 55, right: 200 + i });

test("completa: fine = inizio della battuta dopo, xEnd = sua prima nota se stesso sistema", () => {
  const g = completaBattute(puntiPerBattuta(timemap, indice, xDi), info());
  assert.equal(g[0].q1, 2);
  assert.equal(g[0].xEnd, 100);
  assert.deepEqual([g[0].top, g[0].bottom], [5, 55]);
});
test("completa: l'ultima battuta dura quanto la precedente e finisce al suo bordo destro", () => {
  const g = completaBattute(puntiPerBattuta(timemap, indice, xDi), info());
  assert.equal(g[1].q1, 4); // 2 + (2 - 0)
  assert.equal(g[1].xEnd, 201);
});
test("completa: se la battuta dopo e' su un altro sistema il cursore finisce al bordo della propria", () => {
  const g = completaBattute(puntiPerBattuta(timemap, indice, xDi), info(["s1", "s2"]));
  assert.equal(g[0].xEnd, 200);
});
test("completa: una battuta sola, senza precedente, vale 4 quarti", () => {
  const g = completaBattute(puntiPerBattuta([{ qstamp: 3, measureOn: "m1", on: ["n1"] }], indice, xDi), info());
  assert.equal(g[0].q1, 7);
});
test("completa: la battuta di cui la pagina non ha il sistema viene scartata", () => {
  const g = completaBattute(puntiPerBattuta(timemap, indice, xDi), (i) => (i === 0 ? null : { sistema: "s", top: 0, bottom: 1, right: 9 }));
  assert.equal(g[0], undefined);
  assert.ok(g[1]);
});
test("completa: un q1 non crescente (mappa incoerente) viene riportato a un valore valido", () => {
  const g = completaBattute([{ q0: 5, p: [{ q: 5, x: 1 }] }, { q0: 5, p: [{ q: 5, x: 2 }] }], info());
  assert.ok(g[0].q1 > g[0].q0);
});

// --- xAlCursore --------------------------------------------------------------------------------------------------
const battuta = () => completaBattute(puntiPerBattuta(timemap, indice, xDi), info())[0]; // note a 15 (q0), 30 (q1), fine 100 (q2)

test("cursore: interpola tra le note in proporzione ai quarti", () => {
  const g = battuta();
  vicino(xAlCursore(g, 0), 15);
  vicino(xAlCursore(g, 0.25), 22.5);
  vicino(xAlCursore(g, 0.5), 30);
  vicino(xAlCursore(g, 0.75), 65);
  vicino(xAlCursore(g, 1), 100);
});
test("cursore: f fuori da 0..1 o non numerica viene limitata", () => {
  const g = battuta();
  vicino(xAlCursore(g, -3), 15);
  vicino(xAlCursore(g, 7), 100);
  vicino(xAlCursore(g, NaN), 15);
  vicino(xAlCursore(g, undefined), 15);
});
test("cursore: con movimento ridotto salta da una nota alla successiva", () => {
  const g = battuta();
  vicino(xAlCursore(g, 0.25, true), 15);
  vicino(xAlCursore(g, 0.75, true), 30);
  vicino(xAlCursore(g, 1, true), 100);
});
test("cursore: non e' mai fuori dall'intervallo delle note e del bordo", () => {
  const g = battuta();
  for (let k = 0; k <= 100; k++) {
    const x = xAlCursore(g, k / 100);
    assert.ok(x >= 15 - 1e-9 && x <= 100 + 1e-9, `x=${x}`);
  }
});
test("cursore: e' monotono crescente con f", () => {
  const g = battuta();
  let prima = -Infinity;
  for (let k = 0; k <= 50; k++) { const x = xAlCursore(g, k / 50); assert.ok(x >= prima); prima = x; }
});
test("cursore: due note allo stesso q (mappa incoerente) non danno NaN", () => {
  const g = { q0: 0, q1: 2, xEnd: 50, p: [{ q: 1, x: 10 }, { q: 1, x: 20 }] };
  for (const f of [0, 0.5, 0.51, 1]) assert.ok(Number.isFinite(xAlCursore(g, f)));
});
test("cursore: battuta mancante, vuota o con dati rotti -> null", () => {
  assert.equal(xAlCursore(undefined, 0.5), null);
  assert.equal(xAlCursore(null, 0.5), null);
  assert.equal(xAlCursore({ q0: 0, p: [] }, 0.5), null);
  assert.equal(xAlCursore({ q0: 0, q1: NaN, xEnd: 1, p: [{ q: 0, x: 1 }] }, 0.5), null);
  assert.equal(xAlCursore({ q0: 0, q1: 1, xEnd: undefined, p: [{ q: 0, x: 1 }] }, 0.5), null);
});

// --- rigoDellaVoce -----------------------------------------------------------------------------------------------
test("rigo della voce: solo se i righi sono tanti quante le voci", () => {
  assert.equal(rigoDellaVoce(0, 3, 3), 0);
  assert.equal(rigoDellaVoce(2, 3, 3), 2);
  assert.equal(rigoDellaVoce(1, 3, 4), -1); // un rigo in piu' (accompagnamento): non si sa quale
  assert.equal(rigoDellaVoce(1, 4, 3), -1);
});
test("rigo della voce: indici non validi o fuori intervallo -> -1", () => {
  for (const idx of [-1, 3, 99, 1.5, NaN, undefined, null, "1"]) assert.equal(rigoDellaVoce(idx, 3, 3), -1);
  assert.equal(rigoDellaVoce(0, 0, 0), -1);
});

// --- opzioniPartitura --------------------------------------------------------------------------------------------
test("opzioni: valori di partenza", () => {
  assert.deepEqual(opzioniPartitura(undefined), { myPart: true, cursor: true, cursorColor: "#f2a900", measure: false, invert: false, fullscreenPlay: true });
  assert.deepEqual(opzioniPartitura(null), OPZIONI_DEFAULT);
  assert.deepEqual(opzioniPartitura("{}"), OPZIONI_DEFAULT);
});
test("opzioni: lettura da stringa JSON e da oggetto", () => {
  const o = { myPart: false, cursor: false, cursorColor: "#112233", measure: true, invert: true, fullscreenPlay: false };
  assert.deepEqual(opzioniPartitura(JSON.stringify(o)), o);
  assert.deepEqual(opzioniPartitura(o), o);
});
test("opzioni: giro completo (salva e rileggi) senza perdite", () => {
  const o = { ...OPZIONI_DEFAULT, cursorColor: "#abcdef", measure: true };
  assert.deepEqual(opzioniPartitura(JSON.stringify(o)), o);
});
test("opzioni: JSON rotto, tipi sbagliati, array: si torna ai valori di partenza", () => {
  for (const raw of ["{non json", "", "null", "[]", "[1,2]", "42", '"testo"', 42, true, []]) {
    assert.deepEqual(opzioniPartitura(raw), OPZIONI_DEFAULT, String(raw));
  }
});
test("opzioni: ogni campo e' controllato da solo", () => {
  const o = opzioniPartitura({ myPart: "no", cursor: 0, measure: 1, invert: "si", cursorColor: "rosso" });
  assert.deepEqual(o, OPZIONI_DEFAULT);
  assert.equal(opzioniPartitura({ cursor: false }).cursor, false);
  assert.equal(opzioniPartitura({ cursor: false }).myPart, true);
});
test("opzioni: il colore deve essere #rrggbb; si normalizza in minuscolo", () => {
  assert.equal(opzioniPartitura({ cursorColor: "#ABCDEF" }).cursorColor, "#abcdef");
  for (const c of ["#abc", "abcdef", "#abcdeg", "#abcdef0", "red", "url(x)", "#abcdef; x", null, 12]) {
    assert.equal(opzioniPartitura({ cursorColor: c }).cursorColor, "#f2a900", String(c));
  }
});
test("opzioni: il risultato e' una copia, i valori di partenza non si modificano", () => {
  const o = opzioniPartitura(undefined);
  o.cursor = false;
  assert.equal(OPZIONI_DEFAULT.cursor, true);
  assert.ok(Object.isFrozen(OPZIONI_DEFAULT));
});

// --- battutaAlPunto ----------------------------------------------------------------------------------------------
// due sistemi: battute 0-2 sul primo (y 0..100), 3-4 sul secondo (y 200..300)
const S1 = {}, S2 = {};
const caselle = [
  { i: 0, sistema: S1, l: 50, r: 150, t: 0, b: 100 }, { i: 1, sistema: S1, l: 150, r: 300, t: 0, b: 100 }, { i: 2, sistema: S1, l: 300, r: 450, t: 0, b: 100 },
  { i: 3, sistema: S2, l: 50, r: 250, t: 200, b: 300 }, { i: 4, sistema: S2, l: 250, r: 450, t: 200, b: 300 },
];
test("battuta al punto: dentro un sistema vince la battuta che contiene x, ovunque in verticale", () => {
  assert.equal(battutaAlPunto(caselle, 100, 10), 0);
  assert.equal(battutaAlPunto(caselle, 200, 50), 1);
  assert.equal(battutaAlPunto(caselle, 400, 99), 2);
  assert.equal(battutaAlPunto(caselle, 100, 250), 3);
  assert.equal(battutaAlPunto(caselle, 400, 201), 4);
});
test("battuta al punto: punti diversi danno battute diverse (mai la stessa ovunque)", () => {
  const viste = new Set([[60, 50], [200, 50], [400, 50], [60, 250], [400, 250]].map(([x, y]) => battutaAlPunto(caselle, x, y)));
  assert.equal(viste.size, 5);
});
test("battuta al punto: spazio fra due battute e bordi laterali -> la piu' vicina", () => {
  assert.equal(battutaAlPunto(caselle, 149.9, 50), 0);
  assert.equal(battutaAlPunto(caselle, 10, 50), 0);     // a sinistra del sistema (etichette)
  assert.equal(battutaAlPunto(caselle, 900, 250), 4);   // a destra
});
test("battuta al punto: fuori dai sistemi (oltre il margine) -> -1; entro il margine sceglie il sistema piu' vicino", () => {
  assert.equal(battutaAlPunto(caselle, 100, 150), -1);   // tra i due sistemi, lontano da entrambi
  assert.equal(battutaAlPunto(caselle, 100, 120), 0);    // 20 px sotto il primo: ancora suo
  assert.equal(battutaAlPunto(caselle, 100, 185), 3);    // 15 px sopra il secondo
  assert.equal(battutaAlPunto(caselle, 100, -500), -1);
  assert.equal(battutaAlPunto(caselle, 100, 9999), -1);
});
test("battuta al punto: dati non validi -> -1, senza eccezioni", () => {
  for (const c of [undefined, null, [], "x", [null], [{ i: 0 }], [{ i: 0, l: NaN, r: 1, t: 0, b: 1 }]]) assert.equal(battutaAlPunto(c, 1, 1), -1);
  assert.equal(battutaAlPunto(caselle, NaN, 10), -1);
  assert.equal(battutaAlPunto(caselle, 10, undefined), -1);
});

test("battutaAlPunto: con caselle sovrapposte (testo e melismi sconfinano) vince la battuta col centro piu' vicino", () => {
  const sis = {};
  // la battuta 0 e' larga fin dentro la 1 e la 2 (come i versi di un melisma): prima vinceva sempre la 0
  const caselle = [
    { i: 0, sistema: sis, l: 0, r: 260, t: 0, b: 100 },
    { i: 1, sistema: sis, l: 100, r: 200, t: 0, b: 100 },
    { i: 2, sistema: sis, l: 200, r: 700, t: 0, b: 100 },
  ];
  assert.equal(battutaAlPunto(caselle, 150, 50), 1);
  assert.equal(battutaAlPunto(caselle, 50, 50), 0);
  assert.equal(battutaAlPunto(caselle, 450, 50), 2);
});
