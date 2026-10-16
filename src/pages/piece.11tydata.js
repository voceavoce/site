import { routeUrl } from "../_data/routes.js";
import { t, pieceDescription, composerName } from "../_lib/format.js";
import { buildCatalog } from "../_lib/catalog.js";
import site from "../_data/site.js";

const lineSection = { coro: "choir", aria: "arias", metodo: "methods" };
// Il catalogo e' calcolato una volta sola per build.
const cat = buildCatalog(site.buildTime);

export default {
  eleventyComputed: {
    lang: (d) => d.entry.lang,
    piece: (d) => cat.perSlug[d.entry.slug],
    routeSection: () => "pieces",
    routeSlug: (d) => d.entry.slug,
    permalink: (d) => `${routeUrl(d.entry.lang, "pieces", d.entry.slug)}index.html`,
    titleFull: (d) => {
      const p = cat.perSlug[d.entry.slug];
      const tail = " | Voce a Voce";
      const len = (x) => x.length + 4 * (x.match(/['&"<>]/g) || []).length; // le entita' HTML contano nel limite dei 70
      const name = composerName(p, d.entry.lang);
      let out = `${p.titolo} – ${name}${tail}`;
      if (len(out) > 70 && p.compositore?.breve) out = `${p.titolo} – ${p.compositore.breve}${tail}`;
      if (len(out) > 70) { // titoli molto lunghi: tronca il titolo, tieni compositore e sito
        const rest = ` – ${p.compositore?.breve || name}${tail}`;
        out = `${p.titolo.slice(0, 70 - rest.length - 1).trimEnd()}…${rest}`;
      }
      return out;
    },
    title: (d) => cat.perSlug[d.entry.slug].titolo,
    description: (d) => pieceDescription(cat.perSlug[d.entry.slug], d.entry.lang),
    noindex: (d) => cat.perSlug[d.entry.slug].noindex,
    breadcrumbs: (d) => {
      const p = cat.perSlug[d.entry.slug];
      const lang = d.entry.lang;
      const nav = { coro: "nav.coro", aria: "nav.arie", metodo: "nav.metodi" }[p.linea];
      return [
        { label: t(nav, lang), url: routeUrl(lang, lineSection[p.linea]) },
        ...(p.compositore ? [{ label: p.compositore.breve || p.compositore.nome, url: routeUrl(lang, "composers", p.compositore.id) }] : []),
        ...(p.raccolta || p.opera ? [{ label: (p.raccolta || p.opera).titolo, url: routeUrl(lang, "works", (p.raccolta || p.opera).id) }] : []),
        { label: p.titolo_breve || p.titolo },
      ];
    },
  },
};
