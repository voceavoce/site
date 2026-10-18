// Dati globali `studio`: logica in src/_lib/studio.js.
import { loadStudio } from "../_lib/studio.js";
import { publishedSlugs } from "../_lib/catalog.js";
import site from "./site.js";

// Il player esiste per tutti i brani con i dati pronti, ma solo quelli con un video gia' pubblicato hanno il link dalla
// scheda (le uscite programmate lo ricevono alla prima build dopo la data: la build notturna le raccoglie). Gli altri sono
// pagine nascoste (noindex, niente link, niente sitemap) raggiungibili dall'indirizzo: serve al link nelle descrizioni.
const pubblicati = process.env.ELEVENTY_ENV === "production" ? publishedSlugs(site.buildTime) : null;

export default loadStudio({ langs: site.langs, pubblicati });
