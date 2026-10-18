import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import site from "./src/_data/site.js";
import { sections, routeUrl, altUrls, seasonSlugs } from "./src/_data/routes.js";
import * as fmt from "./src/_lib/format.js";
import * as ld from "./src/_lib/jsonld.js";
import { buildSitemap } from "./src/_lib/sitemap.js";
import { versionaAsset } from "./src/_lib/asset-version.js";
import { writeFileSync, mkdirSync } from "node:fs";
import { PLAYER_DIR } from "./src/_lib/studio.js";
import { urlSegnalazione } from "./src/assets/js/study/segnalazione.js";
import studio from "./src/_data/studio.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const i18nDir = path.join(here, "src/_data/i18n");

function loadI18n() {
  const out = {};
  for (const f of readdirSync(i18nDir).filter((n) => n.endsWith(".json"))) {
    out[f.replace(/\.json$/, "")] = JSON.parse(readFileSync(path.join(i18nDir, f), "utf8"));
  }
  return out;
}

export default function (eleventyConfig) {
  // Copie dirette: src/static/** -> radice, src/assets/** -> /assets/
  eleventyConfig.addPassthroughCopy({ "src/static": "/" });
  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });
  eleventyConfig.addWatchTarget("src/assets/");

  // Librerie di terze parti del player, copiate da node_modules come FILE SEPARATI e NON minificati insieme al
  // nostro codice (Verovio: LGPL-3.0; SoundTouchJS audio-worklet: MPL-2.0). Vedi src/static-vendor/NOTICE.txt.
  const st = "node_modules/@soundtouchjs/audio-worklet/.dist/";
  for (const f of ["index.js", "SoundTouchNode.js", "constants.js", "processOffline.js", "soundtouch-processor.js"]) {
    eleventyConfig.addPassthroughCopy({ [st + f]: `assets/vendor/soundtouch/${f}` });
  }
  for (const f of ["verovio-module.mjs", "verovio.mjs"]) {
    eleventyConfig.addPassthroughCopy({ [`node_modules/verovio/dist/${f}`]: `assets/vendor/verovio/${f}` });
  }
  eleventyConfig.addPassthroughCopy({ "src/static-vendor/NOTICE.txt": "assets/vendor/NOTICE.txt" });
  // MusicXML del player: /player-data/<slug>/score.musicxml (i dati di prova "_" restano fuori in produzione)
  for (const it of Object.values(studio.items)) {
    eleventyConfig.addPassthroughCopy({ [path.join(PLAYER_DIR, it.slug, it.scoreFile)]: `player-data/${it.slug}/score.musicxml` });
  }
  eleventyConfig.addWatchTarget("src/_data/i18n/");

  // t: chiave con punti ("nav.coro"), lingua; ripiega sulla lingua predefinita, poi sulla chiave.
  // JSON sicuro dentro un <script type="application/json">: niente "</script>" ne' "<!--"
  eleventyConfig.addFilter("jsonSafe", (v) => JSON.stringify(v).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029"));
  eleventyConfig.addFilter("t", (key, lang) => fmt.t(String(key), lang));
  eleventyConfig.addFilter("routeUrl", routeUrl);
  eleventyConfig.addFilter("reportUrl", (titolo, pagina) => urlSegnalazione({ titolo, pagina }));
  eleventyConfig.addFilter("altUrls", altUrls);
  eleventyConfig.addFilter("absUrl", (p) => new URL(p, site.url).href);
  eleventyConfig.addFilter("tv", (key, lang, vars) => fmt.t(key, lang, vars)); // t con segnaposto {x}
  eleventyConfig.addFilter("voiceName", fmt.voiceName);
  eleventyConfig.addFilter("langLabel", fmt.langLabel);
  eleventyConfig.addFilter("dateLong", fmt.dateLong);
  eleventyConfig.addFilter("isoDay", fmt.isoDay);
  eleventyConfig.addFilter("tonality", fmt.tonality);
  eleventyConfig.addFilter("stanzas", fmt.stanzas);
  eleventyConfig.addFilter("clock", fmt.clock);
  eleventyConfig.addFilter("countLabel", fmt.countLabel);
  eleventyConfig.addFilter("slice8", (a) => a.slice(0, 8));
  eleventyConfig.addFilter("pieceDescription", fmt.pieceDescription);
  eleventyConfig.addFilter("siteLd", (lang) => ld.serializeLd(ld.siteLd(lang)));
  eleventyConfig.addFilter("listLd", (entry, view, lang, opts) => { const o = ld.listLd(entry, view, lang, opts); return o ? ld.serializeLd(o) : ""; });
  eleventyConfig.addFilter("pieceLd", (piece, lang) => ld.serializeLd(ld.pieceLd(piece, lang)));
  eleventyConfig.addFilter("slice20", (a) => a.slice(0, 20));
  eleventyConfig.addFilter("slice30", (a) => a.slice(0, 30));
  eleventyConfig.addFilter("pageOg", ld.pageOg);
  eleventyConfig.addGlobalData("sections", sections);
  eleventyConfig.addGlobalData("seasonSlugs", seasonSlugs);

  // sitemap.xml: costruita a fine build dalle pagine HTML prodotte (canonical, noindex, hreflang).
  eleventyConfig.on("eleventy.after", ({ dir, results }) => {
    mkdirSync(dir.output, { recursive: true }); // con 0 pagine scritte (build di prova) la cartella puo' non esserci
    writeFileSync(path.join(dir.output, "sitemap.xml"), buildSitemap(results));
    // cartella di uscita reale: con --output (build degli e2e) dir.output resta quella della configurazione, ricavarla dai risultati
    const pagina = results.find((r) => r.url && r.outputPath);
    const uscita = pagina ? pagina.outputPath.slice(0, pagina.outputPath.length - (pagina.url.endsWith("/") ? pagina.url + "index.html" : pagina.url).length) : dir.output;
    versionaAsset(uscita); // ?v=<hash> sugli asset: niente copie vecchie dopo un deploy (src/_lib/asset-version.js)
  });

  return {
    dir: { input: "src", output: "_site", includes: "_includes", data: "_data" },
    templateFormats: ["njk", "md"], // gli .html in src/static restano file statici
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
  };
}
