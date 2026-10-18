import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parole, caricaComuni, traduciComune, LINGUE } from "../src/_lib/comuni.js";
import { buildCatalog } from "../src/_lib/catalog.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const comuni = caricaComuni(path.join(here, "../content/curated/_comuni"));

const riga = (la, t) => ({ la, ...Object.fromEntries(LINGUE.map((l) => [l, `${l}:${t}`])) });
const finto = {
  credit: "C",
  license: "L",
  righe: [riga("Ave Maria", "ave"), riga("gratia plena", "piena"), riga("Dominus tecum", "tecum")].map((r) => ({
    ...r,
    chiavi: [parole(r.la)],
  })),
};

test("parole: minuscole, senza accenti/punteggiatura, ae/oe, j=i, v=u", () => {
  assert.deepEqual(parole("Æterni Jesu, cælórum Vírgine!"), ["aeterni", "iesu", "caelorum", "uirgine"]);
  assert.deepEqual(parole(""), []);
  assert.deepEqual(parole(null), []);
});

test("traduciComune: abbina per frase anche con a capo diversi e ripetizioni", () => {
  const r = traduciComune("Ave, Maria,\ngrátia\nplena. Ave Maria", finto);
  assert.equal(r.it.testo, "it:ave\nit:piena\nit:ave");
  assert.equal(r.fr.testo, "fr:ave\nfr:piena\nfr:ave");
  assert.deepEqual(Object.keys(r), LINGUE);
  assert.equal(r.en.reviewed, false);
  assert.equal(r.en.credit, "C");
  assert.equal(r.en.license, "L");
});

test("traduciComune: testo parziale con copertura sufficiente", () => {
  assert.equal(traduciComune("Dominus tecum", finto).de.testo, "de:tecum");
});

test("traduciComune: copertura sotto soglia -> niente traduzione", () => {
  assert.deepEqual(traduciComune("Ave Maria e poi molte parole non presenti nel comune", finto), {});
  assert.deepEqual(traduciComune("", finto), {});
  assert.deepEqual(traduciComune("Ave Maria", null), {});
  assert.deepEqual(traduciComune("Ave Maria", { righe: [] }), {});
});

test("traduciComune: la frase piu' lunga vince sulla piu' corta", () => {
  const c = {
    righe: [riga("Sanctus", "s"), riga("Sanctus Sanctus Sanctus", "sss")].map((r) => ({ ...r, chiavi: [parole(r.la)] })),
  };
  assert.equal(traduciComune("Sanctus, Sanctus, Sanctus", c).it.testo, "it:sss");
});

test("traduciComune: lingua incompleta viene omessa", () => {
  const r = riga("Amen", "a");
  delete r.es;
  assert.deepEqual(Object.keys(traduciComune("Amen", { righe: [{ ...r, chiavi: [["amen"]] }] })), ["it", "en", "de", "fr"]);
});

test("contenuti: ogni file comune ha tutte e 5 le lingue e crediti", () => {
  assert.ok(Object.keys(comuni).length >= 8);
  for (const [k, c] of Object.entries(comuni)) {
    assert.ok(c.credit && c.license, `${k}: credit/license`);
    assert.ok(c.righe.length > 0, `${k}: nessuna riga`);
    for (const r of c.righe) {
      assert.ok(r.chiavi.length > 0, `${k}: riga senza testo latino`);
      for (const l of LINGUE) assert.ok(String(r[l] ?? "").trim(), `${k} / ${r.la}: manca ${l}`);
    }
  }
});

test("catalogo: i brani con testo comune ricevono la traduzione non rivista", () => {
  const { brani } = buildCatalog("2100-01-01T00:00:00Z");
  const k = brani.find((p) => p.slug === "kyrie-in-b-flat-major-schubert");
  assert.equal(k.traduzioni.it.testo, "Signore, pietà\nCristo, pietà\nSignore, pietà");
  assert.equal(k.traduzioni.it.reviewed, false);
  for (const p of brani.filter((x) => x.testo?.comune && comuni[x.testo.comune])) {
    const t = traduciComune(p.testo.testo, comuni[p.testo.comune]);
    for (const l of Object.keys(t)) assert.equal(p.traduzioni[l].testo, t[l].testo, `${p.slug} ${l}`);
  }
});
