// JSON-LD: funzioni pure che producono oggetti schema.org. Nessuna dipendenza da Eleventy.
import site from "../_data/site.js";
import { routeUrl, altUrls } from "../_data/routes.js";
import { SEASON_SLUGS, KINDS } from "./listing.js";
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

const LICENSE_URLS = {
  "cc by 4.0": "https://creativecommons.org/licenses/by/4.0/",
  "cc by-sa 4.0": "https://creativecommons.org/licenses/by-sa/4.0/",
  "cc by-nc 4.0": "https://creativecommons.org/licenses/by-nc/4.0/",
  "cc by-nc-sa 4.0": "https://creativecommons.org/licenses/by-nc-sa/4.0/",
  "cc by-nd 4.0": "https://creativecommons.org/licenses/by-nd/4.0/",
  "cc by-nc-nd 4.0": "https://creativecommons.org/licenses/by-nc-nd/4.0/",
  "cc0 1.0": "https://creativecommons.org/publicdomain/zero/1.0/",
  "cc0": "https://creativecommons.org/publicdomain/zero/1.0/",
};
/** URL della licenza se e' una CC nota, altrimenti null. */
export const licenseUrl = (l) => LICENSE_URLS[String(l ?? "").trim().toLowerCase().replace(/\s+/g, " ")] ?? null;

/**
 * Traduzioni del testo come CreativeWork. Il testo compare solo se `reviewed === true`
 * (le bozze si mostrano nella pagina ma non vanno ai motori di ricerca).
 */
export function translationsLd(traduzioni, originalLang) {
  const out = [];
  for (const [code, tr] of Object.entries(traduzioni || {})) {
    if (!tr?.testo || code === originalLang) continue;
    const w = { "@type": "CreativeWork", inLanguage: code };
    if (tr.reviewed === true) w.text = tr.testo;
    if (tr.credit) { w.author = { "@type": "Person", name: tr.credit }; w.creditText = tr.credit; }
    if (tr.license) {
      const u = licenseUrl(tr.license);
      if (u) w.license = u;
      else w.copyrightNotice = String(tr.license);
    }
    out.push(w);
  }
  return out;
}

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
    const trs = translationsLd(piece.traduzioni, comp.lyrics.inLanguage);
    if (trs.length) comp.lyrics.workTranslation = trs;
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

const SECTION_NAV = { choir: "nav.coro", arias: "nav.arie", methods: "nav.metodi", composers: "nav.compositori", works: "lists.works.h1", genres: "lists.genres.h1", seasons: "nav.stagioni" };

/** Anno intero o stringa tipo "c. 1540" -> valore per birthDate/deathDate; altrimenti undefined. */
const yearValue = (y) => (y == null || y === "" ? undefined : /^(c\.\s*)?\d{1,4}$/.test(String(y).trim()) ? String(y).trim() : undefined);

export function personLd(c, lang) {
  const p = { "@type": "Person", "@id": composerId(c.id), name: c.nome, url: abs(routeUrl(lang, "composers", c.id)), sameAs: [] };
  const b = yearValue(c.nascita), d = yearValue(c.morte);
  if (b) p.birthDate = b;
  if (d) p.deathDate = d;
  return p;
}

/** Url assoluto di una voce di elenco. */
function rowUrl(kind, r, lang) {
  if (kind === "composers") return abs(routeUrl(lang, "composers", r.id));
  if (kind === "works") return abs(routeUrl(lang, "works", r.id));
  if (kind === "genres") return abs(routeUrl(lang, "genres", r.id));
  if (kind === "seasons") return abs(routeUrl(lang, "seasons", SEASON_SLUGS[r.id]?.[lang] ?? r.id));
  return abs(routeUrl(lang, "pieces", r.slug));
}
function rowName(kind, r, lang) {
  if (kind === "composers") return r.nome;
  if (kind === "works") return r.titolo;
  if (kind === "genres") return t(`genres.${r.id}`, lang);
  if (kind === "seasons") return t(`seasons.${r.id}`, lang);
  return r.titolo;
}

/**
 * JSON-LD di una pagina di elenco: CollectionPage + ItemList (+ Person / opera per i dettagli).
 * `entry` = {kind, id}, `view` = viewFor(...) (`view.visible` e' gia' ordinato come in pagina).
 * Restituisce null per pagine noindex o senza elementi visibili.
 */
export function listLd(entry, view, lang, { heading, description, noindex } = {}) {
  const items = view?.visible || [];
  if (noindex || !items.length) return null;
  const { kind } = entry;
  const section = KINDS[kind].section;
  const url = abs(routeUrl(lang, section, kind === "season" ? SEASON_SLUGS[entry.id][lang] ?? SEASON_SLUGS[entry.id].it : entry.id));
  const itemKind = ["composers", "works", "genres", "seasons"].includes(kind) ? kind : "pieces";
  const list = {
    "@type": "ItemList",
    "@id": `${url}#list`,
    numberOfItems: items.length,
    itemListElement: items.map((r, i) => ({ "@type": "ListItem", position: i + 1, url: rowUrl(itemKind, r, lang), name: rowName(itemKind, r, lang) })),
  };
  const page = { "@type": "CollectionPage", "@id": `${url}#page`, url, name: heading, inLanguage: lang, isPartOf: { "@id": ID.website }, mainEntity: { "@id": list["@id"] } };
  if (description) page.description = description;
  const graph = [page, list];
  if (kind === "composer" && view.composer) {
    const person = personLd(view.composer, lang);
    page.mainEntity = { "@id": person["@id"] };
    graph.splice(1, 0, person);
  } else if (kind === "work" && view.work) {
    const w = view.work;
    const series = w.tipo === "raccolta";
    const work = {
      "@type": series ? "CreativeWorkSeries" : "MusicComposition",
      "@id": `${url}#work`,
      name: w.titolo,
      url,
      hasPart: items.map((p) => ({ "@type": "MusicComposition", name: p.titolo, url: abs(routeUrl(lang, "pieces", p.slug)) })),
    };
    const first = items[0]?.compositore;
    if (first) work.composer = { "@type": "Person", "@id": composerId(first.id), name: first.nome, url: composerUrl(first.id) };
    page.mainEntity = { "@id": work["@id"] };
    graph.splice(1, 0, work);
  }
  const crumbs = [{ name: site.name, url: abs(routeUrl(lang)) }];
  crumbs.push({ name: t(SECTION_NAV[section], lang), url: ["composers", "works", "genres", "seasons", "choir", "arias", "methods"].includes(kind) ? undefined : abs(routeUrl(lang, section)) });
  if (KINDS[kind].detail) crumbs.push({ name: heading, url });
  else crumbs[1].url = url;
  graph.push(breadcrumbLd(crumbs));
  return { "@context": "https://schema.org", "@graph": graph };
}

/** Immagine OG della pagina: miniatura YouTube della prima voce visibile, altrimenti quella predefinita. */
export function pageOg(piece) {
  const first = piece?.voci?.[0];
  if (first) return { image: thumbnailUrl(first.video_id), width: 480, height: 360, type: "video.other" };
  return { image: abs(site.ogImage.path), width: site.ogImage.width, height: site.ogImage.height, type: "website" };
}

export { altUrls };
