import { test } from "node:test";
import assert from "node:assert/strict";
import { progressoTotale, percentuale, pienoAlPlay } from "../src/assets/js/study/schermo.js";
import { opzioniPartitura } from "../src/assets/js/study/cursore.js";

test("progressoTotale: media delle frazioni, fuori scala e non numeri tenuti a bada", () => {
  assert.equal(progressoTotale([]), 0);
  assert.equal(progressoTotale(undefined), 0);
  assert.equal(progressoTotale([0, 0, 0, 0]), 0);
  assert.equal(progressoTotale([1, 1, 1, 1]), 1);
  assert.equal(progressoTotale([1, 0.5, 0, 0.5]), 0.5);
  assert.equal(progressoTotale([2, -1]), 0.5); // 2 -> 1, -1 -> 0
  assert.equal(progressoTotale([NaN, 1]), 0.5);
});

test("percentuale: intera 0-100, con minimo perche' la barra si muova subito", () => {
  assert.equal(percentuale(0), 0);
  assert.equal(percentuale(0, 3), 3);
  assert.equal(percentuale(0.456), 46);
  assert.equal(percentuale(1, 3), 100);
  assert.equal(percentuale(5), 100);
  assert.equal(percentuale(-1), 0);
  assert.equal(percentuale(NaN, 3), 3);
});

test("pienoAlPlay: solo telefono (stretto e a tocco), opzione accesa, non gia' a schermo intero", () => {
  const base = { stretto: true, tocco: true, opzione: true, attivo: false };
  assert.equal(pienoAlPlay(base), true);
  assert.equal(pienoAlPlay({ ...base, stretto: false }), false); // desktop o tablet largo
  assert.equal(pienoAlPlay({ ...base, tocco: false }), false); // finestra stretta col mouse
  assert.equal(pienoAlPlay({ ...base, opzione: false }), false);
  assert.equal(pienoAlPlay({ ...base, attivo: true }), false);
  assert.equal(pienoAlPlay({}), false);
});

test("opzioniPartitura: schermo intero al play acceso di partenza, valore non booleano ignorato", () => {
  assert.equal(opzioniPartitura(undefined).fullscreenPlay, true);
  assert.equal(opzioniPartitura('{"fullscreenPlay":false}').fullscreenPlay, false);
  assert.equal(opzioniPartitura('{"fullscreenPlay":"no"}').fullscreenPlay, true);
});
