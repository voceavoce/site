import { test } from "node:test";
import assert from "node:assert/strict";
import { splitVoices, isVoiceVisible, buildCatalog } from "../src/_lib/catalog.js";

const now = "2026-10-16T12:00:00Z";

test("voce con data futura nascosta e 'in arrivo'", () => {
  const { visibili, inArrivo } = splitVoices([{ voce: "S", pubblica_dal: "2026-10-17" }], now);
  assert.equal(visibili.length, 0);
  assert.equal(inArrivo.length, 1);
});
test("voce con data passata visibile", () => {
  assert.equal(isVoiceVisible({ voce: "S", pubblica_dal: "2026-10-16T09:00:00Z" }, now), true);
  assert.equal(splitVoices([{ voce: "S", pubblica_dal: "2026-08-29" }], now).visibili.length, 1);
});
test("pubblica: true sempre visibile, anche con data futura", () => {
  assert.equal(isVoiceVisible({ voce: "S", pubblica: true, pubblica_dal: "2030-01-01" }, now), true);
});
test("senza data e non pubblica: nascosta e non 'in arrivo'", () => {
  const r = splitVoices([{ voce: "S" }], now);
  assert.equal(r.visibili.length + r.inArrivo.length, 0);
});
test("catalogo: brano senza voci visibili ha noindex", () => {
  const far = buildCatalog("2000-01-01T00:00:00Z");
  assert.ok(far.brani.every((p) => p.noindex || p.voci.length > 0));
  assert.ok(far.brani.some((p) => p.noindex));
  const late = buildCatalog("2100-01-01T00:00:00Z");
  assert.ok(late.brani.every((p) => !p.noindex));
});
