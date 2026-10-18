import { test } from "node:test";
import assert from "node:assert/strict";
import { urlSegnalazione, REPO_SEGNALAZIONI } from "../src/assets/js/study/segnalazione.js";

test("urlSegnalazione: issue del sito con titolo e testo precompilati", () => {
  const u = new URL(urlSegnalazione({ titolo: "Agnus Dei", pagina: "https://voceavoce.com/it/player/agnus-dei-josquin/", battuta: "12" }));
  assert.equal(u.origin + u.pathname, `https://github.com/${REPO_SEGNALAZIONI}/issues/new`);
  assert.equal(REPO_SEGNALAZIONI, "voceavoce/site");
  assert.equal(u.searchParams.get("title"), "Spartito: Agnus Dei");
  const body = u.searchParams.get("body");
  assert.match(body, /\*\*Brano:\*\* Agnus Dei/);
  assert.match(body, /\*\*Pagina:\*\* https:\/\/voceavoce\.com\/it\/player\/agnus-dei-josquin\//);
  assert.match(body, /\*\*Battuta:\*\* 12/);
});

test("urlSegnalazione: senza battuta chiede di indicarla; caratteri speciali restano interi", () => {
  const u = new URL(urlSegnalazione({ titolo: "Ave & «Maria» #2", pagina: "https://x/?a=1&b=2" }));
  assert.equal(u.searchParams.get("title"), "Spartito: Ave & «Maria» #2");
  assert.match(u.searchParams.get("body"), /\*\*Battuta:\*\* \(indica il numero\)/);
  assert.match(u.searchParams.get("body"), /\?a=1&b=2/);
});

test("urlSegnalazione: senza argomenti non si rompe", () => {
  assert.doesNotThrow(() => new URL(urlSegnalazione()));
});
