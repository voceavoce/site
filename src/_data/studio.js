// Dati globali `studio`: logica in src/_lib/studio.js.
import { loadStudio } from "../_lib/studio.js";
import site from "./site.js";

export default loadStudio({ langs: site.langs });
