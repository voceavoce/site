// Test delle correzioni al MusicXML prima di Verovio (src/assets/js/study/musicxml.js). Servono DOMParser e
// XMLSerializer: nel browser sono globali, qui li fornisce jsdom (dipendenza di sviluppo).
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

let M, finestra;
before(async () => {
  finestra = new JSDOM("").window;
  globalThis.DOMParser = finestra.DOMParser;
  globalThis.XMLSerializer = finestra.XMLSerializer;
  M = await import("../src/assets/js/study/musicxml.js");
});

const METRONOMO = (bpm = 120) => `<direction><direction-type><metronome parentheses="no"><beat-unit>quarter</beat-unit><per-minute>${bpm}</per-minute></metronome></direction-type><sound tempo="${bpm}"/></direction>`;
const NOTA = '<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type></note>';

/** Un MusicXML minimo: `parti` = [{ nome, abbr, nascosto, battute: [contenuto di ogni battuta] }]. */
function xml(parti) {
  const lista = parti.map((p, i) => `<score-part id="P${i + 1}"><part-name${p.nascosto ? ' print-object="no"' : ""}>${p.nome ?? ""}</part-name>${p.abbr ? `<part-abbreviation>${p.abbr}</part-abbreviation>` : ""}</score-part>`).join("");
  const corpo = parti.map((p, i) => `<part id="P${i + 1}">${(p.battute ?? [NOTA]).map((b, k) => `<measure number="${k + 1}">${b}</measure>`).join("")}</part>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><score-partwise version="3.1"><part-list>${lista}</part-list>${corpo}</score-partwise>`;
}
const leggi = (testo) => new finestra.DOMParser().parseFromString(testo, "application/xml");
const conta = (testo, nome) => (testo.match(new RegExp(`<${nome}[ />]`, "g")) || []).length;

// --- siglaDaNome -------------------------------------------------------------------------------------------------
test("sigla dal nome: iniziale maiuscola e numero", () => {
  assert.equal(M.siglaDaNome("Soprano"), "S");
  assert.equal(M.siglaDaNome("tenor"), "T");
  assert.equal(M.siglaDaNome("Soprano 2"), "S2");
  assert.equal(M.siglaDaNome("  Basso  "), "B");
  assert.equal(M.siglaDaNome("Élisabeth"), "É");
});
test("sigla dal nome: niente lettera iniziale -> null, mai eccezioni", () => {
  for (const n of ["", "   ", "123", "-", undefined, null]) assert.equal(M.siglaDaNome(n), null);
});

// --- senzaTempiRipetuti ------------------------------------------------------------------------------------------
test("tempi: lo stesso segno scritto 3 volte nella stessa battuta ne resta uno", () => {
  const doc = leggi(xml([{ nome: "S", battute: [METRONOMO() + METRONOMO() + METRONOMO() + NOTA] }]));
  assert.equal(M.senzaTempiRipetuti(doc), 2);
  assert.equal(doc.querySelectorAll("metronome").length, 1);
});
test("tempi: battute diverse tengono ciascuna il suo segno", () => {
  const doc = leggi(xml([{ nome: "S", battute: [METRONOMO() + NOTA, NOTA, METRONOMO() + NOTA] }]));
  assert.equal(M.senzaTempiRipetuti(doc), 0);
  assert.equal(doc.querySelectorAll("metronome").length, 2);
});
test("tempi: lo stesso segno su un'altra parte nella stessa battuta si toglie, uno diverso resta", () => {
  const doc = leggi(xml([
    { nome: "S", battute: [METRONOMO(120) + NOTA] },
    { nome: "A", battute: [METRONOMO(120) + NOTA] },
    { nome: "T", battute: [METRONOMO(90) + NOTA] },
  ]));
  assert.equal(M.senzaTempiRipetuti(doc), 1);
  assert.deepEqual([...doc.querySelectorAll("per-minute")].map((n) => n.textContent), ["120", "90"]);
});
test("tempi: si toglie il segno visibile ma il <sound tempo> resta (la riproduzione non e' di Verovio)", () => {
  const doc = leggi(xml([{ nome: "S", battute: [METRONOMO() + METRONOMO() + NOTA] }]));
  M.senzaTempiRipetuti(doc);
  assert.equal(doc.querySelectorAll("metronome").length, 1);
  assert.equal(doc.querySelectorAll("sound").length, 2);
});
test("tempi: in una direction con piu' direction-type si toglie solo quello del metronomo", () => {
  const dir = '<direction><direction-type><words>Allegro</words></direction-type><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>100</per-minute></metronome></direction-type></direction>';
  const doc = leggi(xml([{ nome: "S", battute: [METRONOMO(100) + dir + NOTA] }]));
  assert.equal(M.senzaTempiRipetuti(doc), 1);
  assert.equal(doc.querySelectorAll("metronome").length, 1);
  assert.equal(doc.querySelectorAll("words").length, 1); // il testo "Allegro" non si perde
});
test("tempi: senza metronomi non fa niente; le note non si toccano", () => {
  const doc = leggi(xml([{ nome: "S", battute: [NOTA + NOTA] }]));
  assert.equal(M.senzaTempiRipetuti(doc), 0);
  assert.equal(doc.querySelectorAll("note").length, 2);
});

// --- abbreviaParti -----------------------------------------------------------------------------------------------
const coro = (extra = {}) => xml([
  { nome: "Soprano", abbr: "Ch", nascosto: true, ...extra },
  { nome: "Tenor", abbr: "Ch", nascosto: true },
  { nome: "Bass", abbr: "Ch", nascosto: true },
]);

test("etichette: le sigle del manifest sostituiscono nome e abbreviazione, e il nome non e' piu' nascosto", () => {
  const fuori = M.abbreviaParti(coro(), ["S", "T", "B"]);
  const doc = leggi(fuori);
  assert.deepEqual([...doc.querySelectorAll("part-name")].map((n) => n.textContent), ["S", "T", "B"]);
  assert.deepEqual([...doc.querySelectorAll("part-abbreviation")].map((n) => n.textContent), ["S", "T", "B"]);
  assert.equal(doc.querySelectorAll("part-name[print-object]").length, 0);
});
test("etichette: il file resta valido e musicalmente identico (note e battute)", () => {
  const dentro = coro();
  const fuori = M.abbreviaParti(dentro, ["S", "T", "B"]);
  assert.equal(leggi(fuori).querySelector("parsererror"), null);
  assert.equal(conta(fuori, "note"), conta(dentro, "note"));
  assert.equal(conta(fuori, "measure"), conta(dentro, "measure"));
});
test("etichette: nomi dello strumento di sintesi (tutti uguali, senza abbreviazione) -> sigle del manifest", () => {
  const dentro = xml([{ nome: "ARIA Player" }, { nome: "ARIA Player" }, { nome: "ARIA Player" }]);
  const doc = leggi(M.abbreviaParti(dentro, ["S1", "S2", "T"]));
  assert.deepEqual([...doc.querySelectorAll("part-abbreviation")].map((n) => n.textContent), ["S1", "S2", "T"]);
  assert.deepEqual([...doc.querySelectorAll("part-name")].map((n) => n.textContent), ["S1", "S2", "T"]);
});
test("etichette: voci e parti in numero diverso -> iniziale del nome, se le abbreviazioni sono tutte uguali", () => {
  const doc = leggi(M.abbreviaParti(coro(), ["S", "T"]));
  assert.deepEqual([...doc.querySelectorAll("part-abbreviation")].map((n) => n.textContent), ["S", "T", "B"]);
});
test("etichette: voci e parti in numero diverso, abbreviazioni gia' tutte diverse -> il file non cambia", () => {
  const dentro = xml([{ nome: "Soprano", abbr: "S." }, { nome: "Tenor", abbr: "T." }]);
  assert.equal(M.abbreviaParti(dentro, ["S", "T", "B"]), dentro);
  assert.equal(M.abbreviaParti(dentro), dentro);
});
test("etichette: una parte senza part-abbreviation ne riceve una", () => {
  const doc = leggi(M.abbreviaParti(xml([{ nome: "X" }, { nome: "Y" }]), ["S", "T"]));
  assert.deepEqual([...doc.querySelectorAll("part-abbreviation")].map((n) => n.textContent), ["S", "T"]);
});
test("etichette: una voce senza sigla (vuota o nulla) lascia stare quella parte", () => {
  const doc = leggi(M.abbreviaParti(coro(), ["S", "", null]));
  assert.deepEqual([...doc.querySelectorAll("part-abbreviation")].map((n) => n.textContent), ["S", "Ch", "Ch"]);
});
test("etichette: una sola parte -> il file non cambia", () => {
  const dentro = xml([{ nome: "Soprano", abbr: "Ch" }]);
  assert.equal(M.abbreviaParti(dentro, ["S"]), dentro);
});
test("etichette e tempi insieme: tempi non ripetuti anche quando le etichette sono gia' buone", () => {
  const dentro = xml([{ nome: "Soprano", abbr: "S", battute: [METRONOMO() + METRONOMO() + NOTA] }, { nome: "Tenor", abbr: "T" }]);
  const fuori = M.abbreviaParti(dentro, []);
  assert.equal(conta(fuori, "metronome"), 1);
  assert.deepEqual([...leggi(fuori).querySelectorAll("part-abbreviation")].map((n) => n.textContent), ["S", "T"]);
});
test("XML non valido o non XML: si restituisce il testo originale senza eccezioni", () => {
  for (const rotto of ["", "<a><b></a>", "non xml", "<score-partwise>", "{}"]) assert.equal(M.abbreviaParti(rotto, ["S", "T"]), rotto);
});
test("voci non valide (non un elenco): si ignorano", () => {
  const dentro = coro();
  for (const v of [undefined, null, "STB", 3, {}]) {
    const doc = leggi(M.abbreviaParti(dentro, v));
    assert.deepEqual([...doc.querySelectorAll("part-abbreviation")].map((n) => n.textContent), ["S", "T", "B"]); // dal nome
  }
});
test("senza DOMParser (ambiente senza DOM) il testo torna com'e'", () => {
  const salvato = globalThis.DOMParser;
  globalThis.DOMParser = undefined;
  try {
    const dentro = coro();
    assert.equal(M.abbreviaParti(dentro, ["S", "T", "B"]), dentro);
  } finally { globalThis.DOMParser = salvato; }
});

// --- senzaTestiLunghi --------------------------------------------------------------------------------------------
const PAROLE = (t, extra = "") => `<direction><direction-type><words>${t}</words></direction-type>${extra}</direction>`;
const LUNGA = "Translation: The mouth of the righteous utters wisdom, and his tongue speaks what is just.";

test("senzaTestiLunghi: toglie le traduzioni, tiene le indicazioni normali", () => {
  const doc = leggi(xml([{ nome: "S", battute: [PAROLE(LUNGA) + PAROLE("Allegro moderato") + NOTA] }]));
  assert.equal(M.senzaTestiLunghi(doc), 1);
  const testo = new finestra.XMLSerializer().serializeToString(doc);
  assert.ok(!testo.includes("Translation"));
  assert.ok(testo.includes("Allegro moderato"));
});

test("senzaTestiLunghi: tiene <sound> e gli altri segni della stessa direzione", () => {
  const doc = leggi(xml([{ nome: "S", battute: [PAROLE(LUNGA, '<sound tempo="90"/>') + NOTA] }]));
  assert.equal(M.senzaTestiLunghi(doc), 1);
  assert.equal(doc.querySelectorAll("sound").length, 1);
  assert.equal(doc.querySelectorAll("words").length, 0);
  const due = leggi(xml([{ nome: "S", battute: [`<direction><direction-type><words>${LUNGA}</words></direction-type><direction-type><words>dolce</words></direction-type></direction>` + NOTA] }]));
  assert.equal(M.senzaTestiLunghi(due), 1);
  assert.deepEqual([...due.querySelectorAll("words")].map((w) => w.textContent), ["dolce"]);
});

test("senzaTestiLunghi: soglia personalizzabile, niente da togliere = 0, spazi multipli contati una volta", () => {
  const doc = leggi(xml([{ nome: "S", battute: [PAROLE("uno   due") + NOTA] }]));
  assert.equal(M.senzaTestiLunghi(doc, 7), 0); // "uno due" = 7
  assert.equal(M.senzaTestiLunghi(doc, 6), 1);
  assert.equal(M.senzaTestiLunghi(leggi(xml([{ nome: "S" }]))), 0);
});

test("abbreviaParti: toglie le scritte lunghe anche con una sola parte", () => {
  const out = M.abbreviaParti(xml([{ nome: "S", battute: [PAROLE(LUNGA) + NOTA] }]), ["S"]);
  assert.ok(!out.includes("Translation"));
});
