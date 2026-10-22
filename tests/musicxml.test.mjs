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

// --- tempiRadi ---------------------------------------------------------------------------------------------------
const bpmDi = (doc) => [...doc.querySelectorAll("per-minute")].map((n) => n.textContent);
test("tempi radi: il valore si arrotonda all'intero (91.9998 -> 92)", () => {
  const doc = leggi(xml([{ nome: "S", battute: [METRONOMO(91.999800000000001) + NOTA] }]));
  assert.equal(M.tempiRadi(doc), 0);
  assert.deepEqual(bpmDi(doc), ["92"]);
});
test("tempi radi: un rallentando scritto battuta per battuta lascia pochi segni leggibili", () => {
  // come exultate-deo-palestrina: 90, 85.0002, 82.0002, 81, 78, 79.0002 tutti nelle ultime battute
  const bpm = [90, 85.0002, 82.0002, 81, 78, 79.0002];
  const doc = leggi(xml([{ nome: "S", battute: bpm.map((b) => METRONOMO(b) + NOTA) }]));
  assert.equal(M.tempiRadi(doc), 4); // restano 90 e 78 (un -13% a quattro battute dal primo); 85, 82, 81 e 79 spariscono
  assert.deepEqual(bpmDi(doc), ["90", "78"]);
  assert.equal(doc.querySelectorAll("sound").length, 6); // la riproduzione non cambia
});
test("tempi radi: un cambio netto (>=10%) dopo qualche battuta si tiene", () => {
  const battute = [METRONOMO(120) + NOTA, NOTA, NOTA, NOTA, NOTA, METRONOMO(80) + NOTA];
  const doc = leggi(xml([{ nome: "S", battute }]));
  assert.equal(M.tempiRadi(doc), 0);
  assert.deepEqual(bpmDi(doc), ["120", "80"]);
});
test("tempi radi: un cambio netto ma troppo vicino al segno precedente si toglie", () => {
  const doc = leggi(xml([{ nome: "S", battute: [METRONOMO(120) + NOTA, METRONOMO(80) + NOTA] }]));
  assert.equal(M.tempiRadi(doc), 1);
  assert.deepEqual(bpmDi(doc), ["120"]);
});
test("tempi radi: la decisione vale per tutte le parti (stessa battuta, stesso esito)", () => {
  const battute = [METRONOMO(100) + NOTA, METRONOMO(101) + NOTA];
  const doc = leggi(xml([{ nome: "S", battute }, { nome: "A", battute }]));
  assert.equal(M.tempiRadi(doc), 2);
  assert.deepEqual(bpmDi(doc), ["100", "100"]);
});
test("tempi radi: valori non numerici o senza per-minute non si toccano, mai eccezioni", () => {
  const dir = '<direction><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>c. 60-70</per-minute></metronome></direction-type></direction>';
  const doc = leggi(xml([{ nome: "S", battute: [dir + NOTA, NOTA] }]));
  assert.equal(M.tempiRadi(doc), 0);
  assert.equal(doc.querySelectorAll("metronome").length, 1);
});
test("tempi radi: abbreviaParti li applica", () => {
  const bpm = [90, 85, 82, 81];
  const fuori = M.abbreviaParti(xml([{ nome: "S", battute: bpm.map((b) => METRONOMO(b) + NOTA) }]), []);
  assert.equal(conta(fuori, "metronome"), 1);
});

// --- chiaviOttavate ----------------------------------------------------------------------------------------------
const CHIAVE_SOL = "<attributes><clef><sign>G</sign><line>2</line></clef></attributes>";
const nota = (step, ott) => `<note><pitch><step>${step}</step><octave>${ott}</octave></pitch><duration>4</duration><type>quarter</type></note>`;
const giro = (ott) => ["E", "F", "G", "A", "G", "F", "E", "D", "E", "F"].map((s) => nota(s, ott)).join("");
test("chiavi: una parte in chiave di violino che sta sotto il do centrale (tenore) prende la chiave ottavata", () => {
  const doc = leggi(xml([{ nome: "T", battute: [CHIAVE_SOL + giro(3)] }]));
  assert.equal(M.chiaviOttavate(doc), 1);
  assert.equal(doc.querySelector("clef-octave-change").textContent, "-1");
  assert.deepEqual([...doc.querySelectorAll("clef > *")].map((e) => e.tagName), ["sign", "line", "clef-octave-change"]); // l'ordine che vuole MusicXML
  assert.equal(doc.querySelectorAll("octave")[0].textContent, "3"); // le altezze non cambiano
});
test("chiavi: soprano e contralto (sopra il do centrale) restano come sono", () => {
  const doc = leggi(xml([{ nome: "S", battute: [CHIAVE_SOL + giro(5)] }, { nome: "A", battute: [CHIAVE_SOL + giro(4)] }]));
  assert.equal(M.chiaviOttavate(doc), 0);
  assert.equal(doc.querySelectorAll("clef-octave-change").length, 0);
});
test("chiavi: chiave di basso e chiavi gia' ottavate non si toccano; poche note non bastano per decidere", () => {
  const basso = '<attributes><clef><sign>F</sign><line>4</line></clef></attributes>';
  const gia = '<attributes><clef><sign>G</sign><line>2</line><clef-octave-change>-1</clef-octave-change></clef></attributes>';
  const doc = leggi(xml([{ nome: "B", battute: [basso + giro(2)] }, { nome: "T", battute: [gia + giro(3)] }, { nome: "X", battute: [CHIAVE_SOL + nota("C", 3)] }]));
  assert.equal(M.chiaviOttavate(doc), 0);
  assert.equal(doc.querySelectorAll("clef-octave-change").length, 1);
});
test("chiavi: abbreviaParti la applica", () => {
  const fuori = M.abbreviaParti(xml([{ nome: "T", battute: [CHIAVE_SOL + giro(3)] }]), []);
  assert.equal(conta(fuori, "clef-octave-change"), 1);
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

// --- nomi delle note (M12) -----------------------------------------------------------------------------------------
const N = (step, ott, { alter, chord, tie, lyric, grace } = {}) =>
  `<note>${grace ? "<grace/>" : ""}${chord ? "<chord/>" : ""}<pitch><step>${step}</step>${alter !== undefined ? `<alter>${alter}</alter>` : ""}<octave>${ott}</octave></pitch><duration>4</duration>${tie ? `<tie type="${tie}"/>` : ""}${lyric ? `<lyric number="1"><syllabic>single</syllabic><text>${lyric}</text></lyric>` : ""}</note>`;
const PAUSA = "<note><rest/><duration>4</duration></note>";
const nomi = (testo) => [...leggi(testo).querySelectorAll("lyric > text")].map((t) => t.textContent);
const conSistema = (battute, sistema) => M.abbreviaParti(xml([{ nome: "Soprano", abbr: "S", battute }]), ["S"], { testo: sistema });

test("nomi delle note: italiano con diesis e bemolle, anglosassone, do fisso", () => {
  const b = [N("C", 4, { lyric: "Lo" }) + N("D", 4, { alter: 1 }) + N("E", 4, { alter: -1 }) + N("F", 4) + N("G", 4, { alter: 2 }) + N("A", 4) + N("B", 4, { alter: -2 })];
  assert.deepEqual(nomi(conSistema(b, "do")), ["Do", "Re♯", "Mi♭", "Fa", "Sol♯♯", "La", "Si♭♭"]);
  assert.deepEqual(nomi(conSistema(b, "abc")), ["C", "D♯", "E♭", "F", "G♯♯", "A", "B♭♭"]);
});

test("nomi delle note: toglie tutti i versi, un solo <lyric> single per nota", () => {
  const verso2 = '<lyric number="2"><syllabic>begin</syllabic><text>ste</text></lyric>';
  const b = [N("C", 4, { lyric: "Lo" }).replace("</note>", verso2 + "</note>") + N("D", 4, { lyric: "cus" })];
  const out = conSistema(b, "do");
  assert.deepEqual(nomi(out), ["Do", "Re"]);
  assert.equal(conta(out, "lyric"), 2);
  assert.ok(!out.includes("<syllabic>begin"));
  assert.equal(conta(out, "syllabic"), 2);
});

test("nomi delle note: la nota legata non ripete il nome; pause e abbellimenti senza nome", () => {
  const b = [N("E", 4, { tie: "start" }) + N("E", 4, { tie: "stop" }) + PAUSA + N("F", 4, { grace: true }) + N("G", 4)];
  assert.deepEqual(nomi(conSistema(b, "do")), ["Mi", "Sol"]);
});

test("nomi delle note: le note di un accordo stanno sotto la prima", () => {
  const b = [N("C", 4) + N("E", 4, { chord: true }) + N("G", 4, { chord: true }) + N("D", 4)];
  assert.deepEqual(nomi(conSistema(b, "do")), ["Do/Mi/Sol", "Re"]);
});

test("nomi delle note: parole = identico a oggi; sistema sconosciuto o senza note = invariato", () => {
  const b = [N("C", 4, { lyric: "Lo" })];
  const orig = xml([{ nome: "Soprano", abbr: "S", battute: b }]);
  assert.equal(M.abbreviaParti(orig, [], { testo: "parole" }), M.abbreviaParti(orig));
  assert.deepEqual(nomi(M.abbreviaParti(orig, [], { testo: "parole" })), ["Lo"]);
  assert.equal(M.abbreviaParti(orig, [], { testo: "klingon" }), orig);
  const soloPause = xml([{ nome: "Soprano", abbr: "S", battute: [PAUSA] }]);
  assert.equal(M.abbreviaParti(soloPause, [], { testo: "do" }), soloPause);
});

test("nomi delle note: XML non valido restituito com'e'", () => {
  assert.equal(M.abbreviaParti("<non-xml", [], { testo: "do" }), "<non-xml");
});

test("nomi delle note: solo le voci cantate; senza testo si usano le prime N parti del manifest, mai l'accompagnamento", () => {
  const voce = { nome: "Soprano", abbr: "S", battute: [N("C", 4, { lyric: "Lo" }) + N("D", 4)] };
  const pianoforte = { nome: "Piano", abbr: "Pf", battute: [N("E", 3) + N("F", 3)] };
  assert.deepEqual(nomi(M.abbreviaParti(xml([voce, pianoforte]), [], { testo: "do" })), ["Do", "Re"]);
  // nessuna parte con testo: senza voci note niente nomi (XML invariato), con le voci del manifest solo le prime
  const senza = { ...voce, battute: [N("C", 4) + N("D", 4)] };
  const doc = xml([senza, pianoforte]);
  assert.equal(M.abbreviaParti(doc, [], { testo: "do" }), doc);
  assert.deepEqual(nomi(M.abbreviaParti(doc, ["S"], { testo: "do" })), ["Do", "Re"]);
});

test("nomi delle note: piu' voci sullo stesso rigo scrivono su righe diverse", () => {
  const v = (voce, step) => N(step, 4).replace("</pitch>", "</pitch>").replace("<duration>4</duration>", `<duration>4</duration><voice>${voce}</voice>`);
  const b = [N("C", 4, { lyric: "x" }).replace("<duration>4</duration>", "<duration>4</duration><voice>1</voice>") + v(2, "E")];
  const doc = leggi(M.abbreviaParti(xml([{ nome: "Soprano", abbr: "S", battute: b }]), [], { testo: "do" }));
  assert.deepEqual([...doc.querySelectorAll("lyric")].map((l) => `${l.getAttribute("number")}:${l.querySelector("text").textContent}`), ["1:Do", "2:Mi"]);
});

test("nomi delle note: le semicrome in fila si alternano fra la riga 1 e la 2; la nota lenta riparte dalla 1", () => {
  const nota = (step, dur) => `<note><pitch><step>${step}</step><octave>4</octave></pitch><duration>${dur}</duration></note>`;
  const b = ["<attributes><divisions>4</divisions></attributes>" + nota("C", 1) + nota("D", 1) + nota("E", 1) + nota("F", 1) + nota("G", 4) + nota("A", 1) + nota("B", 1)];
  const doc = leggi(M.abbreviaParti(xml([{ nome: "Soprano", abbr: "S", battute: [b[0].replace(nota("C", 1), nota("C", 1).replace("</note>", '<lyric number="1"><text>a</text></lyric></note>'))] }]), [], { testo: "do" }));
  assert.deepEqual([...doc.querySelectorAll("lyric")].map((l) => l.getAttribute("number")), ["1", "2", "1", "2", "1", "1", "2"]);
});

test("nomi delle note: le crome in fila e i valori piu' lunghi restano sempre sulla riga 1 (niente sfalsamento senza coloriture)", () => {
  const nota = (step, dur) => `<note><pitch><step>${step}</step><octave>4</octave></pitch><duration>${dur}</duration></note>`;
  const b = ["<attributes><divisions>4</divisions></attributes>" + nota("C", 2).replace("</note>", '<lyric number="1"><text>a</text></lyric></note>') + nota("D", 2) + nota("E", 2) + nota("F", 2) + nota("G", 4)];
  const doc = leggi(M.abbreviaParti(xml([{ nome: "Soprano", abbr: "S", battute: b }]), [], { testo: "do" }));
  assert.deepEqual([...doc.querySelectorAll("lyric")].map((l) => l.getAttribute("number")), ["1", "1", "1", "1", "1"]);
});
