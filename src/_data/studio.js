// Dati globali `studio`: logica in src/_lib/studio.js.
import { loadStudio } from "../_lib/studio.js";
import { publishedSlugs } from "../_lib/catalog.js";
import site from "./site.js";

// In produzione il player esiste solo per i brani con un video gia' pubblicato (le uscite programmate lo ricevono
// al primo build dopo la data: la build notturna le raccoglie). In sviluppo si vedono tutti, per provarli.
const pubblicati = process.env.ELEVENTY_ENV === "production" ? publishedSlugs(site.buildTime) : null;

export default loadStudio({ langs: site.langs, pubblicati });
