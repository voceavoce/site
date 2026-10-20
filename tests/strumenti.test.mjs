import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, statSync } from "node:fs";
import { scegliStrumenti } from "../src/assets/js/study/strumenti.js";
import { checkNote } from "../src/_lib/studio.js";

const IDS = ["pianoforte", "organo", "coro", "voce", "flauto", "archi"];
const tracce = [
  { chiave: "soprano", tipo: "voce" }, { chiave: "alto", tipo: "voce" },
  { chiave: "accompagnamento", tipo: "accompagnamento" },
];

test("strumenti: predefiniti per linea (voci e accompagnamento diversi)", () => {
  assert.deepEqual(scegliStrumenti(tracce, "coro", IDS), { soprano: "pianoforte", alto: "pianoforte", accompagnamento: "organo" });
  assert.deepEqual(scegliStrumenti(tracce, "arie", IDS), { soprano: "flauto", alto: "flauto", accompagnamento: "pianoforte" });
  assert.deepEqual(scegliStrumenti(tracce, "linea-sconosciuta", IDS).soprano, "pianoforte");
});

test("strumenti: le preferenze valgono per tipo o per traccia, se lo strumento esiste ancora", () => {
  const r = scegliStrumenti(tracce, "coro", IDS, { voce: "coro", alto: "archi", accompagnamento: "non-esiste" });
  assert.deepEqual(r, { soprano: "coro", alto: "archi", accompagnamento: "organo" });
});

test("strumenti: il catalogo spedito e' coerente con i file", () => {
  const dir = new URL("../src/assets/strumenti/", import.meta.url);
  const cat = JSON.parse(readFileSync(new URL("strumenti.json", dir), "utf8"));
  assert.equal(cat.schema, 1);
  assert.deepEqual(cat.strumenti.map((s) => s.id), IDS);
  let peso = 0;
  for (const s of cat.strumenti) {
    const f = new URL(s.file, dir);
    assert.ok(existsSync(f), s.file);
    peso += statSync(f).size;
    assert.equal(s.note.length > 10, true);
    for (const l of ["it", "en", "es", "de", "fr"]) assert.ok(s.nome[l], `${s.id} ${l}`);
    if (s.loop) {
      assert.equal(s.loop.length, s.note.length);
      for (const [a, b] of s.loop) assert.ok(a > 0 && b > a && b < s.slot, `${s.id} loop`);
    }
  }
  assert.ok(peso < 5 * 1024 * 1024, `campioni: ${peso} byte, il limite concordato e' ~5 MB`);
  assert.ok(existsSync(new URL("LICENSE-GeneralUser-GS.txt", dir)), "licenza del soundfont da spedire");
});

const manifest = { tracce: [{ chiave: "soprano" }, { chiave: "alto" }] };
test("note.json: controlli di contratto", () => {
  const ok = { schema: 1, fine: 10, parti: [{ chiave: "soprano", note: [[500, 1000, 60], [1500, 500, 62]] }] };
  assert.doesNotThrow(() => checkNote("x", ok, manifest));
  const male = (m) => assert.throws(() => checkNote("x", structuredClone(m), manifest));
  male({ ...ok, schema: 2 });
  assert.doesNotThrow(() => checkNote("x", { ...ok, parti: [...ok.parti, { chiave: "tenore", note: [[0, 100, 60]] }] }, manifest)); // parte senza traccia: ignorata
  male({ ...ok, parti: [{ chiave: "soprano", note: [] }, { chiave: "soprano", note: [] }] }); // ripetuta
  male({ ...ok, parti: [{ chiave: "soprano", note: [[1500, 100, 60], [500, 100, 60]] }] });
  male({ ...ok, parti: [{ chiave: "soprano", note: [[0, 0, 60]] }] });
  male({ ...ok, parti: [{ chiave: "soprano", note: [[0, 100, 200]] }] });
  male({ ...ok, parti: [{ chiave: "soprano", note: [[11000, 100, 60]] }] });
  male({ ...ok, parti: [{ chiave: "soprano", note: [[0.5, 100, 60]] }] });
});
