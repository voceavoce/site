import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { validate } from "../scripts/validate-content.mjs";
import { sampleUrls } from "../scripts/a11y-urls.mjs";

const brano = (slug, extra = {}) => ({
  schema: 1, slug, linea: "coro", rank: "1", ranks: ["1"], titolo: "T", generi: [],
  voci: [{ voce: "S", video_id: "abcdefghijk", pubblica_dal: "2026-12-16T15:30:00Z" }],
  ...extra,
});

function fixture(files) {
  const dir = mkdtempSync(path.join(tmpdir(), "vav-"));
  for (const [rel, content] of Object.entries(files)) {
    const p = path.join(dir, rel);
    mkdirSync(path.dirname(p), { recursive: true });
    writeFileSync(p, typeof content === "string" ? content : JSON.stringify(content));
  }
  return dir;
}
const run = (files) => {
  const dir = fixture(files);
  try { return validate(dir).errors; } finally { rmSync(dir, { recursive: true, force: true }); }
};
const has = (errs, re) => assert.ok(errs.some((e) => re.test(e)), `atteso ${re} in:\n${errs.join("\n")}`);

test("contenuto valido", () => {
  const errs = run({
    "generated/brani/a-b.json": brano("a-b", { pubblica_dal: undefined }),
    "generated/compositori.json": { x: { id: "x", brani: ["a-b"] } },
    "generated/opere.json": { o: { id: "o", brani: ["a-b"] } },
    "curated/a-b.yaml": "traduzioni:\n  en:\n    testo: Hello\n    credit: Me\n    license: CC BY 4.0\naffiliazioni:\n  - vendor: X\n    url: https://x.example/a\n",
  });
  assert.deepEqual(errs, []);
});

test("pubblica_dal null ammesso", () => {
  const b = brano("a-b"); b.voci[0].pubblica_dal = null;
  assert.deepEqual(run({ "generated/brani/a-b.json": b }), []);
});

test("campi obbligatori, enum, video_id, voci vuote", () => {
  has(run({ "generated/brani/a-b.json": { schema: 1, slug: "a-b" } }), /linea|required/);
  has(run({ "generated/brani/a-b.json": brano("a-b", { linea: "x" }) }), /linea/);
  const b = brano("a-b"); b.voci[0].video_id = "corto";
  has(run({ "generated/brani/a-b.json": b }), /video_id/);
  has(run({ "generated/brani/a-b.json": brano("a-b", { voci: [] }) }), /voci/);
  const d = brano("a-b"); d.voci[0].pubblica_dal = "ieri";
  has(run({ "generated/brani/a-b.json": d }), /pubblica_dal/);
});

test("slug non valido o diverso dal nome file", () => {
  has(run({ "generated/brani/a-b.json": brano("altro") }), /diverso dal nome file/);
  has(run({ "generated/brani/A_b.json": brano("A_b") }), /slug/);
});

test("JSON rotto", () => {
  has(run({ "generated/brani/a-b.json": "{ no" }), /JSON non valido/);
});

test("compositori e opere citano brani inesistenti", () => {
  const errs = run({
    "generated/brani/a-b.json": brano("a-b"),
    "generated/compositori.json": { x: { id: "x", brani: ["fantasma"] } },
    "generated/opere.json": { o: { id: "o", brani: ["fantasma2"] } },
  });
  has(errs, /fantasma"/); has(errs, /fantasma2/);
});

test("curated: orfano, lingua ammessa, campi obbligatori, https", () => {
  const base = { "generated/brani/a-b.json": brano("a-b") };
  has(run({ ...base, "curated/zzz.yaml": "nota: {}\n" }), /orfano/);
  has(run({ ...base, "curated/a-b.yaml": "traduzioni:\n  pt:\n    testo: x\n    credit: c\n    license: l\n" }), /pt|propertyName/);
  has(run({ ...base, "curated/a-b.yaml": "traduzioni:\n  en:\n    testo: x\n" }), /credit|license/);
  has(run({ ...base, "curated/a-b.yaml": "affiliazioni:\n  - vendor: X\n    url: http://x.example\n" }), /url/);
  has(run({ ...base, "curated/a-b.yaml": "affiliazioni:\n  - url: https://x.example\n" }), /vendor/);
  has(run({ ...base, "curated/a-b.yaml": "a: [\n" }), /YAML/);
});

test("contenuto reale del repo", () => {
  assert.deepEqual(validate().errors, []);
});

test("a11y-urls: home, ricerca nelle 3 lingue e un indice", () => {
  const urls = sampleUrls("http://x:1", "/inesistente");
  assert.deepEqual(urls, ["/", "/en/", "/es/", "/cerca/", "/en/search/", "/es/buscar/", "/autori/"].map((p) => "http://x:1" + p));
});

test("curated/_comuni: lingue mancanti, credit e nome file", () => {
  const riga = { la: "Amen", it: "Amen", en: "Amen", es: "Amén", de: "Amen", fr: "Amen" };
  const ok = `comune: amen\ncredit: C\nlicense: L\nrighe:\n  - ${JSON.stringify(riga)}\n`;
  assert.deepEqual(run({ "curated/_comuni/amen.yaml": ok }), []);
  const senzaFr = ok.replace(',"fr":"Amen"', "");
  has(run({ "curated/_comuni/amen.yaml": senzaFr }), /manca "fr"/);
  has(run({ "curated/_comuni/amen.yaml": ok.replace("credit: C\n", "") }), /credit\/license/);
  has(run({ "curated/_comuni/altro.yaml": ok }), /diverso dal nome file/);
  has(run({ "curated/_comuni/amen.yaml": "comune: amen\ncredit: C\nlicense: L\nrighe: []\n" }), /nessuna riga/);
});
