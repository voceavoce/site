import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const leggi = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("dichiarazione IA: etichetta delle note in tutte le lingue e sezione nella pagina di trasparenza", () => {
  for (const l of ["it", "en", "es", "de", "fr"]) {
    assert.ok(JSON.parse(leggi(`src/_data/i18n/${l}.json`)).piece.aiNote, `piece.aiNote in ${l}`);
  }
  for (const [p, re] of [["trasparenza.it", /Intelligenza artificiale/], ["disclosure.en", /Artificial intelligence/], ["transparencia.es", /Inteligencia artificial/], ["transparenz.de", /Künstliche Intelligenz/], ["transparence.fr", /Intelligence artificielle/]]) {
    assert.match(leggi(`src/pages/info/${p}.md`), re, p);
  }
  assert.match(leggi("src/pages/piece.njk"), /piece\.aiNote/);
});
