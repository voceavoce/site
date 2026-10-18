// Segnalazione di un errore nello spartito: un'email gia' scritta (brano, pagina, battuta), nella lingua del sito in
// cui si trova la persona. Chi visita e' un corista, non serve nessun account. Nessun dato parte dal sito: il link si
// apre solo se lo si clicca. Niente DOM: la usa anche la build.

const TESTI = {
  it: { titolo: "Spartito", brano: "Brano", pagina: "Pagina", battuta: "Battuta", numero: "(indica il numero)", cosa: "Cosa non va (nota, alterazione, ritmo, parola, chiave…)", invece: "Cosa dovrebbe esserci (con la fonte, se la conosci)" },
  en: { titolo: "Score", brano: "Piece", pagina: "Page", battuta: "Bar", numero: "(please give the number)", cosa: "What is wrong (note, accidental, rhythm, word, clef…)", invece: "What it should be (with the source, if you know it)" },
  es: { titolo: "Partitura", brano: "Obra", pagina: "Página", battuta: "Compás", numero: "(indica el número)", cosa: "Qué está mal (nota, alteración, ritmo, palabra, clave…)", invece: "Qué debería haber (con la fuente, si la conoces)" },
  de: { titolo: "Partitur", brano: "Stück", pagina: "Seite", battuta: "Takt", numero: "(bitte die Nummer angeben)", cosa: "Was ist falsch (Note, Vorzeichen, Rhythmus, Wort, Schlüssel…)", invece: "Was stehen müsste (mit Quelle, falls bekannt)" },
  fr: { titolo: "Partition", brano: "Pièce", pagina: "Page", battuta: "Mesure", numero: "(indique le numéro)", cosa: "Ce qui ne va pas (note, altération, rythme, mot, clé…)", invece: "Ce qui devrait figurer (avec la source, si tu la connais)" },
};

/** Oggetto e testo della segnalazione nella lingua del sito (italiano se non la conosce). */
export function testoSegnalazione({ titolo, pagina, battuta, lingua } = {}) {
  const t = TESTI[lingua] || TESTI.it;
  const nl = "\n";
  const corpo = [
    `${t.brano + ":"} ${titolo || ""}`,
    `${t.pagina + ":"} ${pagina || ""}`,
    `${t.battuta + ":"} ${battuta || t.numero}`,
    `${"Lingua / Language:"} ${TESTI[lingua] ? lingua : "it"}`,
    "",
    `${t.cosa + ":"}`,
    "",
    `${t.invece + ":"}`,
    "",
  ].join(nl);
  return { oggetto: `${t.titolo}: ${titolo || ""}`, corpo };
}

/** Email gia' scritta (mailto:) all'indirizzo del sito: non serve nessun account. */
export function mailSegnalazione({ email, ...dati } = {}) {
  const { oggetto, corpo } = testoSegnalazione(dati);
  const crlf = (s) => s.replace(/\n/g, "\r\n"); // i client di posta vogliono CRLF nel corpo
  return `mailto:${email || ""}?subject=${encodeURIComponent(oggetto)}&body=${encodeURIComponent(crlf(corpo))}`;
}
