// JSON-LD: funzioni pure che producono oggetti schema.org. Nessuna dipendenza da Eleventy.
import site from "../_data/site.js";
import { routeUrl, altUrls } from "../_data/routes.js";
import { t, voiceName, pieceDescription, isoDuration } from "./format.js";

const abs = (p) => new URL(p, site.url).href;
export const ID = { website: `${site.url}/#website`, organization: `${site.url}/#organization` };
export const composerId = (id) => `${site.url}/autori/${id}/#person`;
export const composerUrl = (id) => `${site.url}/autori/${id}/`;
export const thumbnailUrl = (videoId) => `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

/** Serializza per l'inserimento in <script>: escapa "<" (quindi "</script>" e "<!--") e i separatori di riga. */
export function serializeLd(obj) {
  return JSON.stringify(obj)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function organizationLd() {
  return {
    "@type": "Organization",
    "@id": ID.organization,
    name: site.name,
    url: `${site.url}/`,
    logo: abs("/assets/img/avatar.png"),
    email: site.email,
    sameAs: Object.values(site.social),
  };
}

export function websiteLd(lang) {
  return {
    "@type": "WebSite",
    "@id": ID.website,
    url: `${site.url}/`,
    name: site.name,
    inLanguage: lang,
    publisher: { "@id": ID.organization },
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${abs(routeUrl(lang, "search"))}?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  };
}

/** WebSite + Organization (tutte le pagine). */
export function siteLd(lang) {
  return { "@context": "https://schema.org", "@graph": [websiteLd(lang), organizationLd()] };
}

export function videoObjectLd(piece, voice, lang) {
  const name = `${piece.titolo} – ${voiceName(voice.voce, lang)}`;
  const upload = voice.pubblica_dal || piece.prima_uscita;
  const watch = `https://www.youtube.com/watch?v=${voice.video_id}`;
  const v = {
    "@type": "VideoObject",
    name,
    description: `${pieceDescription(piece, lang)} ${voiceName(voice.voce, lang)}.`,
    thumbnailUrl: thumbnailUrl(voice.video_id),
    uploadDate: upload,
    embedUrl: `https://www.youtube-nocookie.com/embed/${voice.video_id}`,
    contentUrl: watch,
    inLanguage: piece.lingua,
  };
  if (!v.inLanguage) delete v.inLanguage;
  if (voice.durata_sec) v.duration = isoDuration(voice.durata_sec);
  const chapters = voice.capitoli || [];
  if (chapters.length) {
    v.hasPart = chapters.map((c, i) => {
      const end = chapters[i + 1]?.sec ?? voice.durata_sec;
      const clip = { "@type": "Clip", name: c.label, startOffset: c.sec, url: `${watch}&t=${c.sec}s` };
      if (end != null && end > c.sec) clip.endOffset = end;
      return clip;
    });
  }
  return v;
}

export function breadcrumbLd(items) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => {
      const e = { "@type": "ListItem", position: i + 1, name: it.name };
      if (it.url) e.item = it.url;
      return e;
    }),
  };
}

const LINE_NAV = { coro: ["choir", "nav.coro"], aria: ["arias", "nav.arie"], metodo: ["methods", "nav.metodi"] };

/** Grafo JSON-LD della scheda brano. `piece.voci` contiene gia' solo le voci visibili. */
export function pieceLd(piece, lang) {
  const url = abs(routeUrl(lang, "pieces", piece.slug));
  const comp = {
    "@type": "MusicComposition",
    "@id": `${url}#composition`,
    name: piece.titolo,
    url,
    mainEntityOfPage: url,
  };
  if (piece.compositore) {
    comp.composer = { "@type": "Person", "@id": composerId(piece.compositore.id), name: piece.compositore.nome, url: composerUrl(piece.compositore.id) };
  }
  if (piece.lingua) comp.inLanguage = piece.lingua;
  if (piece.testo?.testo) {
    comp.lyrics = { "@type": "CreativeWork", text: piece.testo.testo, inLanguage: piece.testo.lingua || piece.lingua };
    if (!comp.lyrics.inLanguage) delete comp.lyrics.inLanguage;
  }
  if (piece.generi?.length) comp.genre = piece.generi.map((g) => t(`genres.${g}`, lang));
  const parent = piece.opera || piece.raccolta;
  if (parent) comp.isPartOf = { "@type": piece.opera ? "MusicComposition" : "CreativeWork", name: parent.titolo };
  if (piece.organico) comp.musicArrangement = piece.organico;
  if (!comp.musicArrangement) delete comp.musicArrangement;

  const [section, navKey] = LINE_NAV[piece.linea] || LINE_NAV.coro;
  const crumbs = breadcrumbLd([
    { name: site.name, url: abs(routeUrl(lang)) },
    { name: t(navKey, lang), url: abs(routeUrl(lang, section)) },
    { name: piece.titolo_breve || piece.titolo, url },
  ]);
  const videos = (piece.voci || []).map((v) => videoObjectLd(piece, v, lang));
  return { "@context": "https://schema.org", "@graph": [comp, ...videos, crumbs] };
}

/** Immagine OG della pagina: miniatura YouTube della prima voce visibile, altrimenti quella predefinita. */
export function pageOg(piece) {
  const first = piece?.voci?.[0];
  if (first) return { image: thumbnailUrl(first.video_id), width: 480, height: 360, type: "video.other" };
  return { image: abs(site.ogImage.path), width: site.ogImage.width, height: site.ogImage.height, type: "website" };
}

export { altUrls };
