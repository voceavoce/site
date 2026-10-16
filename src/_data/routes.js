// Sezioni tradotte e costruzione degli URL per lingua.
// L'italiano sta alla radice; le altre lingue sotto /<lang>/.
import site from "./site.js";

export const sections = {
  pieces: { it: "brani", en: "pieces", es: "obras" },
  composers: { it: "autori", en: "composers", es: "compositores" },
  works: { it: "opere", en: "works", es: "colecciones" },
  genres: { it: "generi", en: "genres", es: "generos" },
  seasons: { it: "stagioni", en: "seasons", es: "temporadas" },
  search: { it: "cerca", en: "search", es: "buscar" },
  choir: { it: "coro", en: "choir", es: "coro" },
  arias: { it: "arie", en: "arias", es: "arias" },
  methods: { it: "metodi", en: "methods", es: "metodos" },
  // Pagine istituzionali (src/pages/info/): permalink esatti, senza slug.
  howItWorks: { it: "come-funziona", en: "how-it-works", es: "como-funciona" },
  sources: { it: "fonti-e-licenze", en: "sources-and-licences", es: "fuentes-y-licencias" },
  about: { it: "chi-siamo", en: "about", es: "quienes-somos" },
  privacy: { it: "privacy", en: "privacy", es: "privacidad" },
  disclosure: { it: "trasparenza", en: "disclosure", es: "transparencia" },
};

export const prefix = (lang) => (lang === site.defaultLang ? "" : `/${lang}`);

/**
 * URL di una pagina in una lingua.
 *   routeUrl("en")                          -> /en/
 *   routeUrl("es", "pieces")                -> /es/obras/
 *   routeUrl("it", "pieces", "locus-iste")  -> /brani/locus-iste/
 * `slug` puo' essere una stringa oppure una mappa {it,en,es} (slug tradotti).
 */
export function routeUrl(lang, section, slug) {
  let url = `${prefix(lang)}/`;
  if (section) {
    const seg = sections[section]?.[lang];
    if (!seg) throw new Error(`Sezione sconosciuta: ${section} (${lang})`);
    url += `${seg}/`;
    if (slug) url += `${typeof slug === "object" ? slug[lang] : slug}/`;
  }
  return url;
}

/** Le stesse pagine in tutte le lingue: [{lang, url}] */
export function altUrls(section, slug) {
  return site.langs.map((lang) => ({ lang, url: routeUrl(lang, section, slug) }));
}
