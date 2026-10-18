// Segnalazione di un errore nello spartito: una issue di GitHub gia' compilata (titolo, brano, pagina, battuta).
// Nessun dato parte dal sito: il link si apre solo se la persona lo clicca. Niente DOM: la usa anche la build.
export const REPO_SEGNALAZIONI = "voceavoce/site";

/** URL di «nuova issue» con titolo e testo precompilati. La issue e' in italiano: la legge chi cura il sito. */
export function urlSegnalazione({ titolo, pagina, battuta } = {}) {
  const testo = [
    `**Brano:** ${titolo || ""}`,
    `**Pagina:** ${pagina || ""}`,
    `**Battuta:** ${battuta || "(indica il numero)"}`,
    "",
    "**Cosa non va** (nota, alterazione, ritmo, parola, chiave…):",
    "",
    "**Cosa dovrebbe esserci** (con la fonte, se la conosci):",
    "",
  ].join("\n");
  const q = (s) => encodeURIComponent(s);
  return `https://github.com/${REPO_SEGNALAZIONI}/issues/new?title=${q(`Spartito: ${titolo || ""}`)}&body=${q(testo)}`;
}
