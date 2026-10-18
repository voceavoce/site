// Versione degli asset a ogni build (src/_lib/asset-version.js): hash del contenuto, riscrittura di HTML / sw.js / import
// dei moduli, idempotenza (il server di sviluppo ricostruisce piu' volte sugli stessi file).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { hashAsset, versionaRiferimenti, versionaImport, versionaAsset } from "../src/_lib/asset-version.js";

const H = "0123456789";

test("hash: stesso contenuto stesso hash, indipendente dall'ordine; cambia con un byte", () => {
  const a = [{ rel: "assets/js/a.js", text: "uno" }, { rel: "assets/css/m.css", text: "due" }];
  assert.equal(hashAsset(a), hashAsset([...a].reverse()));
  assert.match(hashAsset(a), /^[0-9a-f]{10}$/);
  assert.notEqual(hashAsset(a), hashAsset([{ ...a[0], text: "uno!" }, a[1]]));
});
test("hash: non conta un ?v= gia' scritto (si rilancia senza cambiare)", () => {
  const prima = hashAsset([{ rel: "assets/js/a.js", text: 'import "./b.js";' }]);
  const dopo = hashAsset([{ rel: "assets/js/a.js", text: `import "./b.js?v=${H}";` }]);
  assert.equal(prima, dopo);
});
test("riferimenti: href e src di js e css, anche dentro l'elenco del precache; il resto no", () => {
  const t = '<link rel="stylesheet" href="/assets/css/main.css"><script type="module" src="/assets/js/study/app.js"></script><img src="/assets/img/avatar.png">' +
    'const P = ["/", "/assets/css/study.css", "/assets/js/sw-core.js"]; importScripts("/assets/js/sw-core.js");';
  const r = versionaRiferimenti(t, H);
  for (const u of ["/assets/css/main.css", "/assets/js/study/app.js", "/assets/css/study.css", "/assets/js/sw-core.js"]) assert.ok(r.includes(`${u}?v=${H}`), u);
  assert.ok(r.includes('src="/assets/img/avatar.png"'));
  assert.ok(r.includes('importScripts("/assets/js/sw-core.js?v=' + H + '")'));
  assert.ok(!r.includes(`img/avatar.png?v`));
});
test("riferimenti: un ?v= vecchio si sostituisce, non si accoda", () => {
  const r = versionaRiferimenti(`<script src="/assets/js/a.js?v=aaaaaaaaaa"></script>`, H);
  assert.equal(r, `<script src="/assets/js/a.js?v=${H}"></script>`);
  assert.equal(versionaRiferimenti(r, H), r);
});
test("import: statici e dinamici relativi si versionano, quelli assoluti o di libreria no", () => {
  const t = 'import { a } from "./a.js";\nimport b from \'../b.js\';\nconst m = await import("./c.js");\nimport("/pagefind/pagefind.js");\nimport x from "libreria";\nconst v = new URL("../../vendor/verovio/", import.meta.url);';
  const r = versionaImport(t, H);
  assert.ok(r.includes(`from "./a.js?v=${H}"`));
  assert.ok(r.includes(`from '../b.js?v=${H}'`));
  assert.ok(r.includes(`import("./c.js?v=${H}")`));
  assert.ok(r.includes('import("/pagefind/pagefind.js")'));
  assert.ok(r.includes('from "libreria"'));
  assert.equal(versionaImport(r, H), r);
});

test("cartella di uscita: HTML, sw.js e moduli versionati con lo stesso hash; rilanciando non cambia niente", () => {
  const d = mkdtempSync(path.join(tmpdir(), "va-"));
  try {
    const w = (rel, t) => { const f = path.join(d, rel); mkdirSync(path.dirname(f), { recursive: true }); writeFileSync(f, t); };
    w("assets/js/study/app.js", 'import { x } from "./x.js";');
    w("assets/js/study/x.js", "export const x = 1;");
    w("assets/css/main.css", "body{}");
    w("index.html", '<script type="module" src="/assets/js/study/app.js"></script><link href="/assets/css/main.css">');
    w("sw.js", 'const P = ["/assets/css/main.css"]; self.x = "/sw.js";');
    const r1 = versionaAsset(d);
    assert.match(r1.hash, /^[0-9a-f]{10}$/);
    assert.equal(r1.js, 1);
    assert.equal(r1.riferimenti, 2);
    const leggi = (rel) => readFileSync(path.join(d, rel), "utf8");
    assert.ok(leggi("index.html").includes(`app.js?v=${r1.hash}`) && leggi("index.html").includes(`main.css?v=${r1.hash}`));
    assert.ok(leggi("sw.js").includes(`main.css?v=${r1.hash}`) && leggi("sw.js").includes('"/sw.js"')); // sw.js stesso non si versiona
    assert.ok(leggi("assets/js/study/app.js").includes(`./x.js?v=${r1.hash}`));
    const r2 = versionaAsset(d);
    assert.equal(r2.hash, r1.hash);
    assert.equal(r2.js + r2.riferimenti, 0);
    // cambia un asset: cambia l'hash ovunque, una volta sola per riferimento
    w("assets/css/main.css", "body{color:red}");
    const r3 = versionaAsset(d);
    assert.notEqual(r3.hash, r1.hash);
    assert.ok(leggi("index.html").includes(`app.js?v=${r3.hash}`) && !leggi("index.html").includes(r1.hash));
    assert.ok(leggi("assets/js/study/app.js").includes(`./x.js?v=${r3.hash}`) && !leggi("assets/js/study/app.js").includes(r1.hash));
  } finally { rmSync(d, { recursive: true, force: true }); }
});
