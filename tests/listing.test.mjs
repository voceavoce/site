import { test } from "node:test";
import assert from "node:assert/strict";
import { voiceRank, sortVoices, splitByVisibility, sortPieces, isPath, groupByInitial, sortComposers, listEntries, viewFor } from "../src/_lib/listing.js";
import { buildCatalog } from "../src/_lib/catalog.js";

const P = (slug, titolo, extra = {}) => ({ slug, titolo, voci: [], vociInArrivo: [], ...extra });

test("voci in ordine S A T B, poi registri alta/media/bassa", () => {
  const out = sortVoices([{ voce: "B" }, { voce: "T2" }, { voce: "S" }, { voce: "T1" }, { voce: "A" }]).map((v) => v.voce);
  assert.deepEqual(out, ["S", "A", "T1", "T2", "B"]);
  assert.deepEqual(sortVoices([{ voce: "bassa" }, { voce: "alta" }, { voce: "media" }]).map((v) => v.voce), ["alta", "media", "bassa"]);
  assert.ok(voiceRank("B") < voiceRank("alta"));
});
test("sortVoices non muta l'originale", () => {
  const a = [{ voce: "B" }, { voce: "S" }];
  sortVoices(a);
  assert.equal(a[0].voce, "B");
});
test("visibili e solo programmati", () => {
  const r = splitByVisibility([P("a", "A", { voci: [{ voce: "S" }] }), P("b", "B", { vociInArrivo: [{ voce: "S" }] }), P("c", "C")]);
  assert.deepEqual(r.visible.map((p) => p.slug), ["a"]);
  assert.deepEqual(r.soon.map((p) => p.slug), ["b"]);
});
test("ordine per numero di raccolta, altrimenti titolo senza accenti", () => {
  const r = { id: "r" };
  const l = sortPieces([P("x", "Z", { raccolta: { ...r, numero: 10 } }), P("y", "A", { raccolta: { ...r, numero: 2 } }), P("z", "M", { raccolta: { ...r, numero: 1 } })]);
  assert.deepEqual(l.map((p) => p.slug), ["z", "y", "x"]);
  assert.deepEqual(sortPieces([P("1", "Étoile"), P("2", "Ave"), P("3", "Zeta")]).map((p) => p.slug), ["2", "1", "3"]);
  assert.equal(isPath(l), true);
  assert.equal(isPath([P("q", "Q")]), false);
});
test("compositori per cognome e raggruppati per iniziale", () => {
  const cs = sortComposers([{ nome: "Anton Bruckner", breve: "Bruckner" }, { nome: "Johann Sebastian Bach", breve: "Bach" }, { nome: "Édouard Élgar", breve: "Élgar" }]);
  assert.deepEqual(cs.map((c) => c.breve), ["Bach", "Bruckner", "Élgar"]);
  const g = groupByInitial(cs, (c) => c.breve);
  assert.deepEqual(g.map((x) => [x.letter, x.items.length]), [["B", 2], ["E", 1]]);
});
test("catalogo reale: pagine di elenco per ogni lingua, nessun brano senza video nelle liste", () => {
  const cat = buildCatalog("2026-10-16T12:00:00Z");
  const entries = listEntries(cat, ["it", "en", "es"]);
  assert.ok(entries.some((e) => e.kind === "season" && e.id === "natale" && e.lang === "es"));
  for (const e of entries) {
    const v = viewFor(cat, e.kind, e.id);
    assert.ok(v.visible.every((x) => (x.slug ? x.voci.length > 0 : x.count > 0)));
  }
  const concone = viewFor(cat, "work", "concone-50-lezioni-op-9");
  assert.equal(concone.asPath, true);
});
