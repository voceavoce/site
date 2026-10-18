import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCatalog, publishedSlugs } from "../src/_lib/catalog.js";

test("note dei brani: ogni brano pubblicato ha la nota in it, en, es, de e fr", () => {
  const pub = publishedSlugs();
  const { brani } = buildCatalog("2100-01-01T00:00:00Z");
  const senza = brani
    .filter((p) => pub.has(p.slug))
    .filter((p) => !["it", "en", "es", "de", "fr"].every((l) => String(p.nota?.[l] ?? "").trim().length > 40))
    .map((p) => p.slug);
  assert.deepEqual(senza, []);
});

test("note dei brani: nessuna nota e' un doppione di un'altra", () => {
  const { brani } = buildCatalog("2100-01-01T00:00:00Z");
  const viste = new Map();
  for (const p of brani) {
    const t = p.nota?.it;
    if (!t) continue;
    assert.ok(!viste.has(t), `${p.slug} ripete la nota di ${viste.get(t)}`);
    viste.set(t, p.slug);
  }
});
