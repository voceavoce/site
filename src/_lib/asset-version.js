// Versione degli asset a ogni build: gli URL di /assets/js e /assets/css portano ?v=<hash del contenuto>, cosi' dopo un
// deploy (o un rebuild in locale) il browser e il service worker non possono servire una copia vecchia: l'URL e' nuovo.
// Si applica a build finita, sui file in uscita (HTML, sw.js, moduli JS): vedi eleventy.config.js.
// Idempotente: un ?v= gia' presente viene sostituito, non accodato (il server di sviluppo ricostruisce piu' volte).
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

const V = String.raw`\?v=[0-9a-f]{10}`;
// riferimenti assoluti agli asset in HTML e sw.js: "/assets/js/x.js", "/assets/css/x.css"
const RIF_ASSET = new RegExp(String.raw`(/assets/(?:js|css)/[^"'\s?)<>]+\.(?:js|css))(?:${V})?(?=["'\s)<])`, "g");
// import relativi nei moduli: from "./x.js", import("../x.js")
const IMPORT_REL = new RegExp(String.raw`(\bfrom\s*["']|\bimport\s*\(\s*["'])(\.{1,2}/[^"'?]+\.js)(?:${V})?(["'])`, "g");
const TOGLI_V = new RegExp(V, "g");

/** Hash (10 cifre esadecimali) del contenuto di tutti gli asset: cambia se cambia anche un solo byte di un file. */
export function hashAsset(files) {
  const h = createHash("sha1");
  for (const { rel, text } of [...files].sort((a, b) => (a.rel < b.rel ? -1 : 1))) h.update(rel).update("\0").update(text.replace(TOGLI_V, "")).update("\0");
  return h.digest("hex").slice(0, 10);
}

/** Mette ?v=h ai riferimenti agli asset di un HTML o del service worker. */
export const versionaRiferimenti = (text, h) => text.replace(RIF_ASSET, `$1?v=${h}`);

/** Mette ?v=h agli import relativi di un modulo JS. */
export const versionaImport = (text, h) => text.replace(IMPORT_REL, `$1$2?v=${h}$3`);

function* walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

/** Applica la versione a tutta la cartella di uscita. Ritorna { hash, js, riferimenti } (file modificati). */
export function versionaAsset(outDir) {
  const assets = ["js", "css"].map((d) => path.join(outDir, "assets", d)).filter(existsSync);
  const files = assets.flatMap((d) => [...walk(d)]).filter((f) => /\.(js|css)$/.test(f));
  const hash = hashAsset(files.map((f) => ({ rel: path.relative(outDir, f).split(path.sep).join("/"), text: readFileSync(f, "utf8") })));
  let js = 0, riferimenti = 0;
  const scrivi = (f, prima, dopo) => { if (dopo !== prima) writeFileSync(f, dopo); return dopo !== prima; };
  for (const f of files.filter((x) => x.endsWith(".js"))) {
    const t = readFileSync(f, "utf8");
    if (scrivi(f, t, versionaImport(t, hash))) js++;
  }
  for (const f of walk(outDir)) {
    if (!/\.html$/.test(f) && path.basename(f) !== "sw.js") continue;
    const t = readFileSync(f, "utf8");
    if (scrivi(f, t, versionaRiferimenti(t, hash))) riferimenti++;
  }
  return { hash, js, riferimenti };
}
