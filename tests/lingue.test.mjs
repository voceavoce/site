import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import site from "../src/_data/site.js";
import { routeUrl, sections } from "../src/_data/routes.js";
import { SEASON_SLUGS } from "../src/_lib/listing.js";
import { tonality, t } from "../src/_lib/format.js";

const LINGUE = ["it", "en", "es", "de", "fr"];
const json = (l) => JSON.parse(readFileSync(new URL(`../src/_data/i18n/${l}.json`, import.meta.url), "utf8"));
const piatte = (o, p = "") => Object.entries(o).flatMap(([k, v]) => (typeof v === "object" ? piatte(v, p + k + ".") : [p + k]));

test("lingue: il sito ha it, en, es, de, fr con locale per ciascuna", () => {
  assert.deepEqual(site.langs, LINGUE);
  for (const l of LINGUE) assert.ok(site.locales[l], l);
});

test("lingue: i file i18n hanno tutte le stesse chiavi dell'italiano", () => {
  const base = piatte(json("it")).sort();
  for (const l of LINGUE) assert.deepEqual(piatte(json(l)).sort(), base, l);
});

test("lingue: nessuna traduzione e' vuota e i segnaposto coincidono con l'italiano", () => {
  const it = json("it");
  const get = (o, k) => k.split(".").reduce((x, y) => x[y], o);
  const segnaposto = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
  for (const l of LINGUE.filter((x) => x !== "it")) {
    const tr = json(l);
    for (const k of piatte(it)) {
      const v = get(tr, k);
      assert.ok(String(v).trim(), `${l} ${k} vuota`);
      assert.equal(segnaposto(v), segnaposto(get(it, k)), `${l} ${k}: segnaposto diversi`);
    }
  }
});

test("lingue: ogni sezione ha un segmento URL per lingua, senza doppioni dentro una lingua", () => {
  for (const l of LINGUE) {
    const visti = new Map();
    for (const [sez, m] of Object.entries(sections)) {
      assert.match(m[l] ?? "", /^[a-z0-9-]+$/, `${sez} ${l}`);
      if (sez === "study") continue;
      assert.ok(!visti.has(m[l]), `${l}: ${sez} duplica ${visti.get(m[l])}`);
      visti.set(m[l], sez);
    }
  }
  assert.equal(routeUrl("de", "pieces", "x"), "/de/stuecke/x/");
  assert.equal(routeUrl("fr", "privacy"), "/fr/confidentialite/");
});

test("lingue: gli slug delle stagioni esistono in tutte le lingue e sono distinti", () => {
  for (const [id, m] of Object.entries(SEASON_SLUGS)) {
    for (const l of LINGUE) assert.ok(m[l], `${id} ${l}`);
  }
  for (const l of LINGUE) assert.equal(new Set(Object.values(SEASON_SLUGS).map((m) => m[l])).size, 4, l);
});

test("lingue: ogni pagina istituzionale esiste in tutte le lingue", () => {
  const dir = new URL("../src/pages/info/", import.meta.url);
  const per = {};
  for (const f of readdirSync(dir)) {
    const s = readFileSync(new URL(f, dir), "utf8");
    const sez = /routeSection: (\w+)/.exec(s)?.[1];
    const l = /\nlang: (\w+)/.exec(s)?.[1];
    (per[sez] ??= new Set()).add(l);
    const perm = /permalink: (\S+)/.exec(s)[1];
    assert.equal(perm, routeUrl(l, sez), `${f}: permalink`);
  }
  for (const [sez, ls] of Object.entries(per)) assert.deepEqual([...ls].sort(), [...LINGUE].sort(), sez);
});

test("lingue: nome delle tonalita' in tedesco e francese", () => {
  assert.equal(tonality({ tonica: "G", modo: "major" }, "de"), "G-Dur");
  assert.equal(tonality({ tonica: "B", modo: "minor" }, "de"), "H-Moll");
  assert.equal(tonality({ tonica: "Bb", modo: "major" }, "de"), "B-Dur");
  assert.equal(tonality({ tonica: "Eb", modo: "major" }, "de"), "E♭-Dur");
  assert.equal(tonality({ tonica: "D", modo: "minor" }, "fr"), "Ré mineur");
  assert.equal(tonality({ tonica: "F#", modo: "minor" }, "fr"), "Fa♯ mineur");
  assert.equal(t("langName.de", "fr"), "Deutsch");
});
