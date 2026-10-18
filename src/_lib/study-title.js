import { t } from "./format.js";

// <title> al massimo 70 caratteri comprensivi del suffisso " · Voce a Voce" aggiunto dal layout (regola html-validate long-title).
const MAX_TITLE = 70, SUFFISSO = " · Voce a Voce".length;
// Lunghezza che html-validate vede: nel sorgente HTML l'apostrofo e' &#39; (5 caratteri), & e' &amp;, ecc.
const ENTITA = { "&": 5, "<": 4, ">": 4, '"': 6, "'": 5 };
export const lunghezzaHtml = (s) => [...s].reduce((n, c) => n + (ENTITA[c] ?? 1), 0);

export function titoloBreve(lang, titolo) {
  const margine = MAX_TITLE - SUFFISSO - lunghezzaHtml(t("study.pageTitle", lang, { title: "" }));
  if (lunghezzaHtml(titolo) <= margine) return titolo;
  let corto = [...titolo];
  while (corto.length > 1 && lunghezzaHtml(corto.join("").trimEnd()) + 1 > margine) corto.pop();
  return `${corto.join("").trimEnd()}…`;
}
