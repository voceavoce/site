import { test } from "node:test";
import assert from "node:assert/strict";
import { mailSegnalazione, testoSegnalazione } from "../src/assets/js/study/segnalazione.js";

const EMAIL = "info@voceavoce.com";
const parti = (m) => new URLSearchParams(m.split("?")[1]);

test("mailSegnalazione: email gia' scritta all'indirizzo del sito, in chiaro e con la battuta", () => {
  const m = mailSegnalazione({ email: EMAIL, titolo: "Agnus Dei", pagina: "https://voceavoce.com/player/agnus-dei-josquin/", battuta: "12", lingua: "it" });
  assert.match(m, /^mailto:info@voceavoce\.com\?subject=/);
  const q = parti(m);
  assert.equal(q.get("subject"), "Spartito: Agnus Dei");
  assert.match(q.get("body"), /^Brano: Agnus Dei\r\nPagina: https:\/\/voceavoce\.com\/player\/agnus-dei-josquin\/\r\nBattuta: 12\r\n/);
  assert.ok(!q.get("body").includes("**"), "niente Markdown: i coristi leggono un'email");
});

test("mailSegnalazione: senza battuta chiede di indicarla; caratteri speciali restano interi", () => {
  const q = parti(mailSegnalazione({ email: EMAIL, titolo: "Ave & «Maria» #2", pagina: "https://x/?a=1&b=2" }));
  assert.equal(q.get("subject"), "Spartito: Ave & «Maria» #2");
  assert.match(q.get("body"), /Battuta: \(indica il numero\)/);
  assert.match(q.get("body"), /\?a=1&b=2/);
});

test("testo e oggetto nella lingua del sito; lingua sconosciuta o assente, italiano", () => {
  const p = { titolo: "Agnus Dei", pagina: "https://voceavoce.com/fr/player/x/", battuta: "5" };
  const fr = testoSegnalazione({ ...p, lingua: "fr" });
  assert.equal(fr.oggetto, "Partition: Agnus Dei");
  assert.match(fr.corpo, /Mesure: 5/);
  assert.match(fr.corpo, /Ce qui ne va pas/);
  assert.match(fr.corpo, /Lingua \/ Language: fr/);
  assert.equal(testoSegnalazione({ ...p, lingua: "de" }).oggetto, "Partitur: Agnus Dei");
  const xx = testoSegnalazione({ titolo: "X", lingua: "xx" });
  assert.equal(xx.oggetto, "Spartito: X");
  assert.match(xx.corpo, /Lingua \/ Language: it/);
  assert.doesNotThrow(() => testoSegnalazione());
});

test("ogni lingua del sito ha tutti i testi della segnalazione", async () => {
  const site = (await import("../src/_data/site.js")).default;
  for (const l of site.langs) {
    const { oggetto, corpo } = testoSegnalazione({ titolo: "X", pagina: "p", battuta: "1", lingua: l });
    assert.match(corpo, new RegExp(`Lingua / Language: ${l}`), l);
    assert.ok(!oggetto.includes("undefined") && !corpo.includes("undefined"), l);
  }
});

test("payloadSegnalazione: campi ripuliti, mai undefined, il campo trappola passa com'e'", async () => {
  const { payloadSegnalazione } = await import("../src/assets/js/study/segnalazione.js");
  assert.deepEqual(payloadSegnalazione({ titolo: " A ", cosa: " nota sbagliata ", sito: "" }), { titolo: "A", pagina: "", battuta: "", lingua: "", cosa: "nota sbagliata", contatto: "", sito: "" });
  assert.deepEqual(Object.keys(payloadSegnalazione()).sort(), ["battuta", "contatto", "cosa", "lingua", "pagina", "sito", "titolo"]);
});
