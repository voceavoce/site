import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import site from "./src/_data/site.js";
import { sections, routeUrl, altUrls, seasonSlugs } from "./src/_data/routes.js";
import * as fmt from "./src/_lib/format.js";
import * as ld from "./src/_lib/jsonld.js";
import { buildSitemap } from "./src/_lib/sitemap.js";
import { writeFileSync } from "node:fs";

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
  eleventyConfig.addWatchTarget("src/_data/i18n/");

  // t: chiave con punti ("nav.coro"), lingua; ripiega sulla lingua predefinita, poi sulla chiave.
  eleventyConfig.addFilter("t", (key, lang) => fmt.t(String(key), lang));
  eleventyConfig.addFilter("routeUrl", routeUrl);
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
    writeFileSync(path.join(dir.output, "sitemap.xml"), buildSitemap(results));
  });

  return {
    dir: { input: "src", output: "_site", includes: "_includes", data: "_data" },
    templateFormats: ["njk", "md"], // gli .html in src/static restano file statici
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
  };
}
