// Dati globali `catalog`: logica in src/_lib/catalog.js (qui solo l'export di default, richiesto da Eleventy).
import { buildCatalog } from "../_lib/catalog.js";
import site from "./site.js";

export default function () {
  return buildCatalog(site.buildTime);
}
