import { t } from "./format.js";

// <title> al massimo 70 caratteri comprensivi del suffisso " · Voce a Voce" aggiunto dal layout (regola html-validate long-title).
const MAX_TITLE = 70, SUFFISSO = " · Voce a Voce".length;
export function titoloBreve(lang, titolo) {
  const margine = MAX_TITLE - SUFFISSO - t("study.pageTitle", lang, { title: "" }).length;
  return titolo.length <= margine ? titolo : `${titolo.slice(0, Math.max(1, margine - 1)).trimEnd()}…`;
}
