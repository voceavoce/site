// Funzioni pure del pannello di caricamento e della partitura a schermo intero (testate in tests/study.test.mjs).

/** Avanzamento complessivo 0..1 dalla frazione scaricata di ogni traccia (valori fuori scala o non numerici contano 0/1). */
export function progressoTotale(frazioni) {
  if (!Array.isArray(frazioni) || !frazioni.length) return 0;
  const somma = frazioni.reduce((s, f) => s + (Number.isFinite(f) ? Math.min(1, Math.max(0, f)) : 0), 0);
  return somma / frazioni.length;
}

/** Percentuale intera 0..100 per la barra; non scende mai sotto `minimo` finche' non si e' fermi (la barra si muove subito). */
export function percentuale(frazione, minimo = 0) {
  const p = Math.round(Math.min(1, Math.max(0, Number.isFinite(frazione) ? frazione : 0)) * 100);
  return Math.max(p, minimo);
}

/**
 * Premendo Riproduci si passa allo schermo intero? Solo su schermi stretti con tocco (telefono), con l'opzione accesa
 * e se non ci si e' gia'.
 */
export function pienoAlPlay({ stretto, tocco, opzione, attivo }) {
  return Boolean(stretto && tocco && opzione && !attivo);
}
