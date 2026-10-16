// Funzioni pure per le pagine di elenco (B6): ordinamenti, raggruppamenti, voci per pagina.
// Nessun accesso a file: lavorano sui brani gia' costruiti da buildCatalog().

const fold = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Ordine di presentazione delle voci: S A T B (T1 < T2...), poi registri alta/media/bassa. */
const REGISTER = { alta: 0, media: 1, bassa: 2 };
export function voiceRank(code) {
  const m = /^([SATB])(\d)?/.exec(String(code));
  if (m) return "SATB".indexOf(m[1]) * 10 + (m[2] ? Number(m[2]) : 0);
  return 100 + (REGISTER[code] ?? 9);
}
/** Copia ordinata (non muta l'originale). */
export const sortVoices = (voci = []) => [...voci].sort((a, b) => voiceRank(a.voce) - voiceRank(b.voce));

/** Brano con almeno una voce visibile (le liste indicizzate contano solo questi). */
export const hasVideo = (p) => p.voci.length > 0;

/** Visibili / solo programmati (nessuna voce visibile ma almeno una in arrivo). */
export function splitByVisibility(pieces) {
  return {
    visible: pieces.filter(hasVideo),
    soon: pieces.filter((p) => !hasVideo(p) && p.vociInArrivo.length > 0),
  };
}

/** Data della prima uscita programmata di un brano (ISO) o null. */
export const nextRelease = (p) => p.vociInArrivo[0]?.pubblica_dal ?? null;

/**
 * Ordina i brani: per numero di raccolta se tutti e due ne hanno uno nella stessa raccolta
 * (percorso di studio), altrimenti per titolo senza accenti. Non muta l'originale.
 */
export function sortPieces(pieces) {
  return [...pieces].sort((a, b) => {
    const na = a.raccolta?.numero, nb = b.raccolta?.numero;
    if (na != null && nb != null && a.raccolta.id === b.raccolta.id && na !== nb) return na - nb;
    return fold(a.titolo).localeCompare(fold(b.titolo)) || a.slug.localeCompare(b.slug);
  });
}

/** Un elenco di raccolta numerata e' un "percorso": tutti i brani hanno il numero. */
export const isPath = (pieces) => pieces.length > 0 && pieces.every((p) => p.raccolta?.numero != null);

/** Chiave alfabetica di un compositore: cognome breve, poi nome. */
export const composerKey = (c) => fold(c.breve || c.nome);

export function sortComposers(list) {
  return [...list].sort((a, b) => composerKey(a).localeCompare(composerKey(b)) || fold(a.nome).localeCompare(fold(b.nome)));
}

/** Raggruppa per iniziale: [{letter, items}] nell'ordine in cui arrivano. */
export function groupByInitial(items, keyOf) {
  const out = [];
  for (const it of items) {
    const k = fold(keyOf(it)).trim()[0]?.toUpperCase() || "#";
    const letter = /[A-Z]/.test(k) ? k : "#";
    const last = out[out.length - 1];
    if (last && last.letter === letter) last.items.push(it);
    else out.push({ letter, items: [it] });
  }
  return out;
}

// Slug tradotti delle stagioni (gli altri id restano uguali in tutte le lingue).
export const SEASON_SLUGS = {
  natale: { it: "natale", en: "christmas", es: "navidad" },
  pasqua: { it: "pasqua", en: "easter", es: "pascua" },
  quaresima: { it: "quaresima", en: "lent", es: "cuaresma" },
  mariano: { it: "mariano", en: "marian", es: "mariano" },
};

const LINE_KIND = { choir: "coro", arias: "aria", methods: "metodo" };

/** Tipi di pagina: indice (sezione) e dettaglio (sezione + id). */
export const KINDS = {
  choir: { section: "choir" }, arias: { section: "arias" }, methods: { section: "methods" },
  composers: { section: "composers" }, works: { section: "works" }, genres: { section: "genres" }, seasons: { section: "seasons" },
  composer: { section: "composers", detail: true }, work: { section: "works", detail: true },
  genre: { section: "genres", detail: true }, season: { section: "seasons", detail: true },
};

/** Id delle pagine di dettaglio, ricavati dal catalogo. */
export function detailIds(cat) {
  return {
    composer: Object.keys(cat.perCompositore).sort(),
    work: Object.keys(cat.perOpera).sort(),
    genre: Object.keys(cat.perGenere).sort(),
    season: Object.keys(cat.perStagione).sort(),
  };
}

/** Tutte le pagine di elenco: una per (tipo x id x lingua). */
export function listEntries(cat, langs) {
  const ids = detailIds(cat);
  const out = [];
  for (const lang of langs) {
    for (const [kind, def] of Object.entries(KINDS)) {
      if (!def.detail) out.push({ kind, lang });
      else for (const id of ids[kind]) out.push({ kind, id, lang });
    }
  }
  return out;
}

/** Brani di un elenco, gia' divisi e ordinati. */
function listOf(pieces) {
  const { visible, soon } = splitByVisibility(pieces);
  const v = sortPieces(visible);
  return { visible: v, soon: sortPieces(soon), asPath: isPath(v) };
}

/** Contenuto di una pagina (indipendente dalla lingua). */
export function viewFor(cat, kind, id) {
  if (LINE_KIND[kind]) return { ...listOf(cat.perLinea[LINE_KIND[kind]] || []) };
  if (kind === "composer") return { composer: cat.compositori[id] ?? { id, nome: id }, ...listOf(cat.perCompositore[id] || []) };
  if (kind === "work") return { work: cat.opere[id] ?? { id, titolo: id }, ...listOf(cat.perOpera[id] || []) };
  if (kind === "genre") return { id, ...listOf(cat.perGenere[id] || []) };
  if (kind === "season") return { id, ...listOf(cat.perStagione[id] || []) };

  // Indici: voci con conteggio dei brani visibili; quelle senza video vanno in "soon" (senza link).
  const row = (pieces, extra) => ({ ...extra, ...listOf(pieces), count: pieces.filter(hasVideo).length });
  let rows = [];
  if (kind === "composers") {
    const comps = sortComposers(Object.values(cat.compositori).filter((c) => cat.perCompositore[c.id]));
    rows = comps.map((c) => row(cat.perCompositore[c.id], { id: c.id, nome: c.nome, date: c.date, periodo: c.periodo, key: c.breve || c.nome }));
  } else if (kind === "works") {
    rows = Object.values(cat.opere).filter((o) => cat.perOpera[o.id])
      .sort((a, b) => fold(a.titolo).localeCompare(fold(b.titolo)))
      .map((o) => {
        const first = cat.perOpera[o.id][0];
        return row(cat.perOpera[o.id], { id: o.id, titolo: o.titolo, tipo: o.tipo, compositore: first?.compositore?.nome ?? null });
      });
  } else if (kind === "genres") {
    rows = Object.keys(cat.perGenere).sort().map((g) => row(cat.perGenere[g], { id: g }));
  } else if (kind === "seasons") {
    rows = Object.keys(SEASON_SLUGS).filter((s) => cat.perStagione[s]).map((s) => row(cat.perStagione[s], { id: s }));
  }
  const withVideo = rows.filter((r) => r.count > 0);
  const onlySoon = rows.filter((r) => r.count === 0);
  const groups = kind === "composers" ? groupByInitial(withVideo, (r) => r.key) : null;
  return { rows: withVideo, soonRows: onlySoon, visible: withVideo, soon: onlySoon, groups };
}
