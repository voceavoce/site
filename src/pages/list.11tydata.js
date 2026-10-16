// Pagine di elenco (B6): dati calcolati per (tipo x id x lingua). Vedi _lib/listing.js.
import { routeUrl } from "../_data/routes.js";
import { t, countLabel } from "../_lib/format.js";
import { buildCatalog } from "../_lib/catalog.js";
import { KINDS, SEASON_SLUGS, viewFor } from "../_lib/listing.js";
import site from "../_data/site.js";

const cat = buildCatalog(site.buildTime);
const cache = new Map();
const view = (e) => {
  const k = `${e.kind}/${e.id ?? ""}`;
  if (!cache.has(k)) cache.set(k, viewFor(cat, e.kind, e.id));
  return cache.get(k);
};

// Nome mostrato nell'H1/title di una pagina di dettaglio.
function nameOf(e, v, lang) {
  if (e.kind === "composer") return v.composer.nome;
  if (e.kind === "work") return v.work.titolo;
  if (e.kind === "genre") return t(`genres.${e.id}`, lang);
  return t(`seasons.${e.id}`, lang);
}
const dateText = (e, v) => (e.kind === "composer" && v.composer.date ? v.composer.date : "");

export default {
  eleventyComputed: {
    lang: (d) => d.entry.lang,
    kind: (d) => d.entry.kind,
    view: (d) => view(d.entry),
    routeSection: (d) => KINDS[d.entry.kind].section,
    routeSlug: (d) => (d.entry.kind === "season" ? SEASON_SLUGS[d.entry.id] : d.entry.id),
    permalink: (d) => {
      const e = d.entry;
      const slug = e.kind === "season" ? SEASON_SLUGS[e.id] : e.id;
      return `${routeUrl(e.lang, KINDS[e.kind].section, slug)}index.html`;
    },
    // H1: indice -> lists.<kind>.h1 ; dettaglio -> nome dell'entita'
    heading: (d) => {
      const e = d.entry, def = KINDS[e.kind];
      return def.detail ? nameOf(e, view(e), e.lang) : t(`lists.${e.kind}.h1`, e.lang);
    },
    title: (d) => {
      const e = d.entry, def = KINDS[e.kind];
      return def.detail ? t(`lists.${e.kind}.title`, e.lang, { name: nameOf(e, view(e), e.lang) }) : t(`lists.${e.kind}.title`, e.lang);
    },
    description: (d) => {
      const e = d.entry, def = KINDS[e.kind];
      if (!def.detail) return t(`lists.${e.kind}.desc`, e.lang);
      const v = view(e), name = nameOf(e, v, e.lang), dates = dateText(e, v);
      return t(`lists.${e.kind}.desc`, e.lang, {
        name, who: dates ? `${name} (${dates})` : name,
        n: v.visible.length ? countLabel(v.visible.length, e.lang) : countLabel(0, e.lang),
      });
    },
    noindex: (d) => {
      const v = view(d.entry);
      return v.visible.length === 0;
    },
    breadcrumbs: (d) => {
      const e = d.entry, def = KINDS[e.kind], lang = e.lang;
      const sectionKey = { choir: "nav.coro", arias: "nav.arie", methods: "nav.metodi", composers: "nav.compositori", works: "lists.works.h1", genres: "lists.genres.h1", seasons: "nav.stagioni" }[def.section];
      if (!def.detail) return [{ label: t(sectionKey, lang) }];
      return [
        { label: t(sectionKey, lang), url: routeUrl(lang, def.section) },
        { label: nameOf(e, view(e), lang) },
      ];
    },
  },
};
