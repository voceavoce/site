// Valida content/generated (schema + coerenza) e content/curated (YAML).
// Uso: node scripts/validate-content.mjs [cartella-content]
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import yaml from "js-yaml";

const here = path.dirname(fileURLToPath(import.meta.url));
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const listFiles = (dir, ext) =>
  existsSync(dir) ? readdirSync(dir).filter((n) => n.endsWith(ext)).sort() : [];

function makeValidators() {
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  return {
    brano: ajv.compile(readJson(path.join(here, "schema/brano.schema.json"))),
    curated: ajv.compile(readJson(path.join(here, "schema/curated.schema.json"))),
  };
}

const fmt = (errs) =>
  (errs || []).map((e) => `${e.instancePath || "/"} ${e.message}${e.params?.propertyName ? ` "${e.params.propertyName}"` : ""}${e.params?.allowedValues ? " (" + e.params.allowedValues.join("|") + ")" : ""}`);

/** Valida la cartella content/ (con generated/ e curated/). Ritorna { errors, brani }. */
export function validate(dir = path.join(here, "../content")) {
  const errors = [];
  const err = (file, msg) => errors.push(`${file}: ${msg}`);
  const v = makeValidators();
  const slugs = new Set();

  const braniDir = path.join(dir, "generated/brani");
  for (const name of listFiles(braniDir, ".json")) {
    const rel = `generated/brani/${name}`;
    let data;
    try {
      data = readJson(path.join(braniDir, name));
    } catch (e) {
      err(rel, `JSON non valido (${e.message})`);
      continue;
    }
    const base = name.replace(/\.json$/, "");
    slugs.add(base);
    if (!v.brano(data)) for (const m of fmt(v.brano.errors)) err(rel, m);
    if (data && data.slug !== base) err(rel, `slug "${data.slug}" diverso dal nome file "${base}"`);
  }

  for (const [file, key] of [["compositori.json", "compositori"], ["opere.json", "opere"]]) {
    const p = path.join(dir, "generated", file);
    if (!existsSync(p)) continue;
    let data;
    try {
      data = readJson(p);
    } catch (e) {
      err(`generated/${file}`, `JSON non valido (${e.message})`);
      continue;
    }
    for (const [id, entry] of Object.entries(data)) {
      if (entry?.id !== id) err(`generated/${file}`, `"${id}": campo id "${entry?.id}" non coincide con la chiave`);
      if (!Array.isArray(entry?.brani)) err(`generated/${file}`, `"${id}": manca l'elenco brani`);
      for (const s of entry?.brani ?? []) {
        if (!slugs.has(s)) err(`generated/${file}`, `"${id}" cita il brano inesistente "${s}"`);
      }
    }
    void key;
  }

  const curDir = path.join(dir, "curated");
  for (const name of [...listFiles(curDir, ".yaml"), ...listFiles(curDir, ".yml")]) {
    const rel = `curated/${name}`;
    const base = name.replace(/\.ya?ml$/, "");
    if (!slugs.has(base)) err(rel, `file orfano: nessun brano con slug "${base}"`);
    let data;
    try {
      data = yaml.load(readFileSync(path.join(curDir, name), "utf8"));
    } catch (e) {
      err(rel, `YAML non valido (${e.message.split("\n")[0]})`);
      continue;
    }
    if (data == null) continue;
    if (!v.curated(data)) for (const m of fmt(v.curated.errors)) err(rel, m);
  }

  // Traduzioni dei testi comuni: curated/_comuni/<comune>.yaml, 5 lingue per ogni frase.
  const comDir = path.join(curDir, "_comuni");
  for (const name of listFiles(comDir, ".yaml")) {
    const rel = `curated/_comuni/${name}`;
    let d;
    try {
      d = yaml.load(readFileSync(path.join(comDir, name), "utf8"));
    } catch (e) {
      err(rel, `YAML non valido (${e.message.split(String.fromCharCode(10))[0]})`);
      continue;
    }
    if (!d?.credit || !d?.license) err(rel, "mancano credit/license");
    if (d?.comune !== name.slice(0, -5)) err(rel, `comune "${d?.comune}" diverso dal nome file`);
    if (!Array.isArray(d?.righe) || !d.righe.length) err(rel, "nessuna riga");
    for (const [i, r] of (d?.righe ?? []).entries()) {
      for (const k of ["la", "it", "en", "es", "de", "fr"]) {
        if (typeof r?.[k] !== "string" || !r[k].trim()) err(rel, `riga ${i + 1}: manca "${k}"`);
      }
    }
  }

  return { errors, brani: slugs.size };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2] ? path.resolve(process.argv[2]) : path.join(here, "../content");
  const { errors, brani } = validate(dir);
  if (errors.length) {
    console.error(`Validazione contenuti: ${errors.length} errori`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`Validazione contenuti: OK (${brani} brani)`);
}
