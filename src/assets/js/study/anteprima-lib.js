// Anteprima del brano (T-924, docs/anteprima-brano.md nel repo AIVideoCreator): funzioni pure del pannello di sviluppo.
// Il pannello (anteprima.js) le usa per i numeri e per il testo da copiare; qui non c'e' DOM.

/** BPM equivalenti alla velocita' del player (`pct`, 50..100) rispetto al tempo di prova. Un decimale. */
export function bpmDaVelocita(prova, pct) {
  if (!Number.isFinite(prova) || prova <= 0 || !Number.isFinite(pct)) return null;
  return Math.round(((prova * pct) / 100) * 10) / 10;
}

/** Velocita' (percentuale, a passi di 5 come lo slider) che dà `bpm` rispetto al tempo di prova.
 *  { pct, fuori }: `fuori` = il tempo voluto e' oltre quello che lo slider puo' dare (50..100%): serve rigenerare con --tempo. */
export function velocitaPerBpm(prova, bpm) {
  if (!Number.isFinite(prova) || prova <= 0 || !Number.isFinite(bpm) || bpm <= 0) return null;
  const grezza = (bpm / prova) * 100;
  const pct = Math.min(100, Math.max(50, Math.round(grezza / 5) * 5));
  return { pct, fuori: grezza > 100.01 || grezza < 49.99 };
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
 *  e le scelte del contratto che ha visto. `segnate` = { battuta: "vera" | "ignora" }. Testo semplice + JSON in fondo. */
export function testoRisposta({ dossier, tempo, note, segnate = {}, velocitaPct = null }) {
  const b = dossier?.brano ?? {};
  const t = dossier?.tempo ?? {};
  const righe = [`ANTEPRIMA ${b.titolo ?? "?"} (rank ${b.rank ?? "?"})`];
  righe.push(`Tempo deciso: ${String(tempo ?? "").trim() || "non indicato"}`);
  if (Number.isFinite(velocitaPct) && Number.isFinite(t.prova)) righe.push(`Provato a: ${bpmDaVelocita(t.prova, velocitaPct)} BPM (${velocitaPct}% del tempo di prova ${t.prova})`);
  const osserv = String(note ?? "").trim();
  righe.push(osserv ? `Osservazioni: ${osserv}` : "Osservazioni: nessuna");
  const vere = Object.entries(segnate).filter(([, s]) => s === "vera").map(([n]) => n);
  const ignorate = Object.entries(segnate).filter(([, s]) => s === "ignora").map(([n]) => n);
  if (vere.length) righe.push(`Segnalazioni confermate (battute): ${vere.join(", ")}`);
  if (ignorate.length) righe.push(`Segnalazioni da ignorare (battute): ${ignorate.join(", ")}`);
  const json = {
    rank: b.rank ?? null,
    slug: b.slug ?? null,
    tempo_deciso: String(tempo ?? "").trim() || null,
    tempo_prova: t.prova ?? null,
    segnalazioni_vere: vere,
    segnalazioni_ignorate: ignorate,
    osservazioni: osserv || null,
  };
  return `${righe.join("\n")}\n\n${JSON.stringify(json, null, 1)}\n`;
}
