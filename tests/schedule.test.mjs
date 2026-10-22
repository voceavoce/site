import test from "node:test";
import assert from "node:assert/strict";
import { guadagnoVelocita, VEL_PREDEFINITA, firstAtOrAfter, inRange, soundingAt, begin, advance, campioneVicino, durataMassimaCampione } from "../src/assets/js/study/schedule.js";

const notes = [[0, 1000, 60], [1000, 1000, 62], [2000, 2000, 64], [4000, 500, 65]];
const parti = [{ chiave: "soprano", notes }];

test("firstAtOrAfter: ricerca binaria sugli inizi", () => {
  assert.equal(firstAtOrAfter(notes, 0), 0);
  assert.equal(firstAtOrAfter(notes, 0.5), 1);
  assert.equal(firstAtOrAfter(notes, 1), 1);
  assert.equal(firstAtOrAfter(notes, 4.1), 4);
});

test("inRange: intervallo semiaperto e taglio al loop", () => {
  assert.deepEqual(inRange(notes, 1, 2).map((n) => n.midi), [62]);
  assert.equal(inRange(notes, 2, 3, 3)[0].dur, 1); // nota da 2 s tagliata a fine loop
});

test("soundingAt: note in corso a una posizione", () => {
  const s = soundingAt(notes, 2.5);
  assert.equal(s.length, 1);
  assert.equal(s[0].midi, 64);
  assert.ok(Math.abs(s[0].dur - 1.5) < 1e-9);
  assert.equal(soundingAt(notes, 2).length, 0); // inizia esattamente li': non e' "in corso"
});

test("begin: le note in corso partono subito, durata scalata dalla velocita'", () => {
  const { events, state } = begin(parti, 2.5, 10, 0.5);
  assert.equal(events.length, 1);
  assert.equal(events[0].ctxStart, 10);
  assert.ok(Math.abs(events[0].ctxEnd - (10 + 1.5 / 0.5)) < 1e-9);
  assert.deepEqual(state, { scoreCursor: 2.5, ctxCursor: 10 });
});

test("advance: velocita' 1x, istanti nel contesto", () => {
  const { events, state } = advance(parti, { scoreCursor: 0, ctxCursor: 100 }, 102.5, 1, null, 10);
  assert.deepEqual(events.map((e) => [e.midi, e.ctxStart]), [[60, 100], [62, 101], [64, 102]]);
  assert.ok(Math.abs(state.scoreCursor - 2.5) < 1e-9);
});

test("advance: a 0,5x gli istanti si dilatano e la finestra copre meno partitura", () => {
  const { events, state } = advance(parti, { scoreCursor: 0, ctxCursor: 100 }, 104.5, 0.5, null, 10);
  assert.deepEqual(events.map((e) => [e.midi, e.ctxStart]), [[60, 100], [62, 102], [64, 104]]);
  assert.ok(Math.abs(state.scoreCursor - 2.25) < 1e-9);
});

test("advance: nessuna nota doppia fra finestre consecutive", () => {
  let st = { scoreCursor: 0, ctxCursor: 0 };
  const visti = [];
  for (let h = 0.15; h < 6; h += 0.15) {
    const r = advance(parti, st, h, 1, null, 5);
    st = r.state;
    visti.push(...r.events.map((e) => e.midi));
  }
  assert.deepEqual(visti, [60, 62, 64, 65]);
});

test("advance: giro del loop riparte dall'inizio, con le note gia' in corso", () => {
  const loop = { start: 1, end: 3 }; // la nota 64 (2-4 s) e' tagliata a 3 s
  let st = { scoreCursor: 1, ctxCursor: 0 };
  const r = advance(parti, st, 3.9, 1, loop, 10);
  const midi = r.events.map((e) => [e.midi, Math.round(e.ctxStart * 1000) / 1000]);
  assert.deepEqual(midi, [[62, 0], [64, 1], [62, 2], [64, 3]]);
  assert.equal(r.events[1].dur, 1); // 64: tagliata alla fine del loop
  assert.ok(r.state.scoreCursor >= 1 && r.state.scoreCursor < 3);
});

test("advance: loop con nota che attraversa l'inizio del passaggio", () => {
  const loop = { start: 2.5, end: 3.5 };
  const r = advance(parti, { scoreCursor: 2.5, ctxCursor: 0 }, 2.2, 1, loop, 10);
  // al giro (ctx 1,0) la nota 64 e' in corso a 2,5 s e riparte con il residuo, tagliato a fine loop
  const catchUp = r.events.filter((e) => e.catchUp);
  assert.equal(catchUp.length, 2);
  assert.ok(Math.abs(catchUp[0].dur - 1) < 1e-9);
});

test("advance: fine del brano, nessuna nota oltre", () => {
  const r = advance(parti, { scoreCursor: 3, ctxCursor: 0 }, 50, 1, null, 4.6);
  assert.deepEqual(r.events.map((e) => e.midi), [65]);
});

test("durataMassimaCampione: un campione non ciclico non esce dal suo slot (altrimenti si sente la nota dopo)", () => {
  const def = { slot: 3.75, pad: 0.1 };
  assert.ok(Math.abs(durataMassimaCampione(def, 1) - 3.63) < 1e-9);
  assert.ok(Math.abs(durataMassimaCampione(def, 2) - 1.815) < 1e-9); // intonato un'ottava sopra: finisce prima
  assert.ok(durataMassimaCampione(def, 0.5) > 7);
  assert.ok(durataMassimaCampione({ slot: 0.01, pad: 0.1 }, 1) >= 0.05); // slot degenere: mai zero o negativo
  assert.equal(durataMassimaCampione(def, 0), durataMassimaCampione(def, 1)); // velocita' non valida = 1
});

test("campioneVicino: campione piu' vicino e rapporto di velocita'", () => {
  const s = { note: [24, 27, 30, 33] };
  assert.deepEqual(campioneVicino(s, 27), { indice: 1, rate: 1 });
  const c = campioneVicino(s, 29);
  assert.equal(c.indice, 2);
  assert.ok(Math.abs(c.rate - Math.pow(2, -1 / 12)) < 1e-12);
});

test("velocita': guadagno monotono, 1 a mf, limitato; assente = mf", () => {
  assert.equal(guadagnoVelocita(VEL_PREDEFINITA), 1);
  assert.equal(guadagnoVelocita(undefined), 1);
  const v = [20, 33, 49, 64, 80, 96, 112, 127].map(guadagnoVelocita);
  for (let i = 1; i < v.length; i++) assert.ok(v[i] > v[i - 1]);
  assert.ok(guadagnoVelocita(1) >= 0.3 && guadagnoVelocita(127) <= 1.5);
  assert.ok(guadagnoVelocita(33) < 0.5 && guadagnoVelocita(112) > 1.3);
});

test("velocita' nelle note pianificate: usata se c'e', altrimenti mf, anche nelle note in corso", () => {
  const n = [[0, 2000, 60, 33], [500, 500, 62]];
  const r = inRange(n, 0, 1);
  assert.deepEqual(r.map((x) => x.vel), [33, 80]);
  assert.equal(soundingAt(n, 1)[0].vel, 33);
});
