import { routeUrl } from "../_data/routes.js";
import { t } from "../_lib/format.js";
import { titoloBreve } from "../_lib/study-title.js";

export default {
  eleventyComputed: {
    lang: (d) => d.entry.lang,
    item: (d) => d.studio.items[d.entry.slug],
    piece: (d) => d.catalog.perSlug[d.entry.slug],
    routeSection: () => "study",
    routeSlug: (d) => d.entry.slug,
    permalink: (d) => `${routeUrl(d.entry.lang, "study", d.entry.slug)}index.html`,
    pieceTitle: (d) => d.catalog.perSlug[d.entry.slug]?.titolo ?? d.studio.items[d.entry.slug].manifest.titolo,
    title: (d) => t("study.pageTitle", d.entry.lang, { title: titoloBreve(d.entry.lang, d.catalog.perSlug[d.entry.slug]?.titolo ?? d.studio.items[d.entry.slug].manifest.titolo) }),
    description: (d) => t("study.desc", d.entry.lang, { title: d.catalog.perSlug[d.entry.slug]?.titolo ?? d.studio.items[d.entry.slug].manifest.titolo }),
    noindex: () => true, // per ora il player non si indicizza
    breadcrumbs: (d) => {
      const lang = d.entry.lang;
      const p = d.catalog.perSlug[d.entry.slug];
      return [
        ...(p ? [{ label: p.titolo_breve || p.titolo, url: routeUrl(lang, "pieces", p.slug) }] : []),
        { label: t("study.title", lang) },
      ];
    },
    // payload per app.js: nessun segreto, nessun URL assoluto dentro il manifest
    studyData: (d) => {
      const lang = d.entry.lang;
      const it = d.studio.items[d.entry.slug];
      return {
        audioBase: d.site.audioBase,
        scoreUrl: `/player-data/${it.slug}/score.musicxml`,
        senzaAudio: it.manifest.senza_audio === true,
        noteUrl: it.noteFile ? `/player-data/${it.slug}/note.json` : null,
        dossierUrl: it.dossierFile ? `/player-data/${it.slug}/dossier.json` : null,
        lang,
        linea: it.manifest.linea || "coro",
        manifest: { tracce: it.manifest.tracce, durata_sec: it.manifest.durata_sec },
        sync: it.sync,
        labels: { ...t("study.js", lang), play: t("study.play", lang), pause: t("study.pause", lang) },
      };
    },
  },
};
