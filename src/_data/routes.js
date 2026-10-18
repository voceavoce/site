// Sezioni tradotte e costruzione degli URL per lingua.
// L'italiano sta alla radice; le altre lingue sotto /<lang>/.
import site from "./site.js";

export const sections = {
  pieces: { it: "brani", en: "pieces", es: "obras", de: "stuecke", fr: "pieces" },
  composers: { it: "autori", en: "composers", es: "compositores", de: "komponisten", fr: "compositeurs" },
  works: { it: "opere", en: "works", es: "colecciones", de: "werke", fr: "oeuvres" },
  genres: { it: "generi", en: "genres", es: "generos", de: "gattungen", fr: "genres" },
  seasons: { it: "stagioni", en: "seasons", es: "temporadas", de: "jahreszeiten", fr: "saisons" },
  search: { it: "cerca", en: "search", es: "buscar", de: "suche", fr: "recherche" },
  choir: { it: "coro", en: "choir", es: "coro", de: "chor", fr: "choeur" },
  arias: { it: "arie", en: "arias", es: "arias", de: "arien", fr: "airs" },
  methods: { it: "metodi", en: "methods", es: "metodos", de: "methoden", fr: "methodes" },
  study: { it: "player", en: "player", es: "player", de: "player", fr: "player" }, // /player/<slug>/ (player di studio)
  // Pagine istituzionali (src/pages/info/): permalink esatti, senza slug.
  howItWorks: { it: "come-funziona", en: "how-it-works", es: "como-funciona", de: "so-funktioniert-es", fr: "comment-ca-marche" },
  sources: { it: "fonti-e-licenze", en: "sources-and-licences", es: "fuentes-y-licencias", de: "quellen-und-lizenzen", fr: "sources-et-licences" },
  about: { it: "chi-siamo", en: "about", es: "quienes-somos", de: "ueber-uns", fr: "a-propos" },
  privacy: { it: "privacy", en: "privacy", es: "privacidad", de: "datenschutz", fr: "confidentialite" },
  disclosure: { it: "trasparenza", en: "disclosure", es: "transparencia", de: "transparenz", fr: "transparence" },
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

// Slug tradotti delle stagioni (natale -> christmas / navidad): usare routeUrl(lang, "seasons", seasonSlugs[id]).
export { SEASON_SLUGS as seasonSlugs } from "../_lib/listing.js";
