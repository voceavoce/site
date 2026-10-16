// sitemap.xml: costruita dalle pagine HTML generate, cosi' include anche le liste create da altri template.
import site from "../_data/site.js";
import { routeUrl } from "../_data/routes.js";
import { buildCatalog } from "./catalog.js";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const attr = (tag, name) => new RegExp(`${name}="([^"]*)"`).exec(tag)?.[1];

/** Estrae canonical, noindex e alternate hreflang da una pagina HTML. */
export function parsePage(html) {
  const head = html.slice(0, html.indexOf("</head>") + 1 || undefined);
  const noindex = /<meta\s+name="robots"[^>]*noindex/i.test(head);
  const canonical = /<link\s+rel="canonical"[^>]*>/i.exec(head)?.[0];
  const alternates = [...head.matchAll(/<link\s+rel="alternate"\s+hreflang="[^"]*"[^>]*>/gi)].map((m) => ({ lang: attr(m[0], "hreflang"), href: attr(m[0], "href") }));
  return { noindex, canonical: canonical && attr(canonical, "href"), alternates };
}

export function buildSitemap(results, catalog = buildCatalog(site.buildTime)) {
  const lastmod = new Map();
  for (const p of catalog.brani) {
    if (!p.ultimaUscita) continue;
    for (const lang of site.langs) lastmod.set(new URL(routeUrl(lang, "pieces", p.slug), site.url).href, p.ultimaUscita);
  }
  const seen = new Map();
  for (const r of results) {
    if (!r.outputPath?.endsWith(".html") || r.url.startsWith("/classic/")) continue;
    const pg = parsePage(r.content);
    if (pg.noindex || !pg.canonical || seen.has(pg.canonical)) continue;
    seen.set(pg.canonical, pg);
  }
  const urls = [...seen.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([loc, pg]) => {
    const links = pg.alternates.map((a) => `    <xhtml:link rel="alternate" hreflang="${esc(a.lang)}" href="${esc(a.href)}"/>`).join("\n");
    return `  <url>\n    <loc>${esc(loc)}</loc>\n    <lastmod>${esc(lastmod.get(loc) || site.buildTime)}</lastmod>\n${links}\n  </url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join("\n")}\n</urlset>\n`;
}
