// Anteprima del brano (T-924, docs/anteprima-brano.md nel repo AIVideoCreator): funzioni pure del pannello di sviluppo.
// Il pannello (anteprima.js) le usa per i numeri e per il testo da copiare; qui non c'e' DOM.

/** BPM equivalenti alla velocita' del player (`pct`, 50..100) rispetto al tempo di prova. Un decimale. */
export function bpmDaVelocita(prova, pct) {
  if (!Number.isFinite(prova) || prova <= 0 || !Number.isFinite(pct)) return null;
  return Math.round(((prova * pct) / 100) * 10) / 10;
}

/** Velocita' (percentuale, a passi di 5 come lo slider) che dà `bpm` rispetto al tempo di prova.
 *  { pct, fuori }: `fuori` = il tempo voluto e' oltre quello che lo slider puo' dare (50..`max`%, 100 di default; 150 nelle
 *  anteprime a soli strumenti): serve rigenerare con --tempo. */
export function velocitaPerBpm(prova, bpm, max = 100, min = 50, passo = 5) {
  if (!Number.isFinite(prova) || prova <= 0 || !Number.isFinite(bpm) || bpm <= 0) return null;
  const grezza = (bpm / prova) * 100;
  const tondo = Math.round(Math.round(grezza / passo) * passo * 1000) / 1000;
  const pct = Math.min(max, Math.max(min, tondo));
  return { pct, fuori: grezza > max + 0.01 || grezza < min - 0.01 };
}

/** Indice (in sync.battute) della battuta col numero `numero` (testo, come lo scrivono le segnalazioni); -1 se non c'e'. */
export function indiceBattuta(sync, numero) {
  const n = String(numero ?? "").trim();
  if (!n) return -1;
  return (sync?.battute ?? []).findIndex((b) => String(b.numero) === n);
}

/** Opzioni del contratto come righe {chiave, valore} da mostrare: valori composti in JSON compatto, tagliati. */
export function righeOpzioni(opzioni, max = 160) {
  return Object.entries(opzioni ?? {}).map(([chiave, v]) => {
    const t = typeof v === "string" ? v : JSON.stringify(v);
    return { chiave, valore: t.length > max ? `${t.slice(0, max - 1)}…` : t };
  });
}

/** Il blocco da incollare nella chat di Claude: tempo deciso, osservazioni, segnalazioni segnate come vere o da ignorare
 *  (con battuta, parte e categoria: servono al registro e alle statistiche delle guardie). `segnate` = { indice della
 *  segnalazione nel dossier: "vera" | "ignora" }. Testo semplice + JSON in fondo. */
export function testoRisposta({ dossier, tempo, note, segnate = {}, velocitaPct = null }) {
  const b = dossier?.brano ?? {};
  const t = dossier?.tempo ?? {};
  const righe = [`ANTEPRIMA ${b.titolo ?? "?"} (rank ${b.rank ?? "?"})`];
  righe.push(`Tempo deciso: ${String(tempo ?? "").trim() || "non indicato"}`);
  if (Number.isFinite(velocitaPct) && Number.isFinite(t.prova)) righe.push(`Provato a: ${bpmDaVelocita(t.prova, velocitaPct)} BPM (${velocitaPct}% del tempo di prova ${t.prova})`);
  const osserv = String(note ?? "").trim();
  righe.push(osserv ? `Osservazioni: ${osserv}` : "Osservazioni: nessuna");
  const dettaglio = (dossier?.anomalie?.mostrate ?? []).map((a, i) => ({ indice: i, battuta: String(a.battuta), parte: a.parte ?? null, categoria: a.categoria ?? null, gravita: a.gravita ?? null, esito: segnate[i] ?? null }));
  const scelte = dettaglio.filter((s) => s.esito === "vera" || s.esito === "ignora");
  const battute = (esito) => [...new Set(scelte.filter((s) => s.esito === esito).map((s) => s.battuta))];
  const vere = battute("vera");
  const ignorate = battute("ignora");
  if (vere.length) righe.push(`Segnalazioni confermate (battute): ${vere.join(", ")}`);
  if (ignorate.length) righe.push(`Segnalazioni da ignorare (battute): ${ignorate.join(", ")}`);
  const json = {
    rank: b.rank ?? null,
    slug: b.slug ?? null,
    tempo_deciso: String(tempo ?? "").trim() || null,
    tempo_prova: t.prova ?? null,
    segnalazioni_vere: vere,
    segnalazioni_ignorate: ignorate,
    segnalazioni: scelte,
    osservazioni: osserv || null,
  };
  return `${righe.join("\n")}\n\n${JSON.stringify(json, null, 1)}\n`;
}
