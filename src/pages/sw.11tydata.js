// Elenco del precache del service worker, calcolato a build dai file reali (src/assets + vendor di node_modules).
import { readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import site from "../_data/site.js";

const ls = (dir, prefix, re = /\.(js|css|png)$/) => readdirSync(dir).filter((f) => re.test(f)).map((f) => `${prefix}${f}`);

export default {
  eleventyExcludeFromCollections: true,
  eleventyComputed: {
    swVersion: () => createHash("sha1").update(site.buildTime).digest("hex").slice(0, 10),
    // essenziale: se uno di questi fallisce l'installazione fallisce (cosi' non si installa un SW a meta')
    audioHosts: () => [new URL(site.audioBase).host],
    swPrecache: () => [
      "/",
      "/offline/",
      "/assets/css/main.css",
      "/assets/css/study.css",
      ...ls("src/assets/js", "/assets/js/", /^(theme|player|sw-core)\.js$/),
      ...ls("src/assets/js/study", "/assets/js/study/", /\.js$/),
      "/assets/img/avatar.png",
      "/assets/img/favicon.png",
      ...ls("src/assets/img/icons", "/assets/img/icons/", /\.png$/),
      "/manifest.webmanifest",
    ],
    // Vuoto di proposito: Verovio (~7 MB) e SoundTouch NON si precaricano, altrimenti ogni visitatore
    // scaricherebbe 7 MB anche senza aprire il player. Entrano in cache alla prima apertura del player
    // (stale-while-revalidate sugli asset statici).
    swPrecacheVendor: () => [],
  },
};
