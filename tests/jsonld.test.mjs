import test from "node:test";
import assert from "node:assert/strict";
import { listLd, translationsLd, personLd, siteLd, pieceLd, serializeLd, videoObjectLd, pageOg } from "../src/_lib/jsonld.js";
import { buildCatalog } from "../src/_lib/catalog.js";
import { viewFor, detailIds } from "../src/_lib/listing.js";

const piece = {
  slug: "locus-iste", titolo: "Locus iste", linea: "coro", lingua: "la", organico: "SATB",
  compositore: { id: "bruckner", nome: "Anton Bruckner" }, generi: ["sacro"], prima_uscita: "2026-01-01T00:00:00Z",
  testo: { lingua: "la", testo: "Locus iste\na Deo factus est </script><script>alert(1)" },
  voci: [{ voce: "S", video_id: "abc123", pubblica_dal: "2026-01-01T00:00:00Z", durata_sec: 185, capitoli: [{ sec: 0, label: "Inizio" }, { sec: 60, label: "Secondo" }] }],
};
const graph = (o) => o["@graph"];
const byType = (o, ty) => graph(o).filter((x) => x["@type"] === ty);

test("WebSite e Organization con @id stabili e SearchAction", () => {
  const g = siteLd("en");
  const [ws] = byType(g, "WebSite"), [org] = byType(g, "Organization");
  assert.equal(ws["@id"], "https://voceavoce.com/#website");
  assert.equal(org["@id"], "https://voceavoce.com/#organization");
  assert.equal(ws.inLanguage, "en");
  assert.equal(ws.potentialAction.target.urlTemplate, "https://voceavoce.com/en/search/?q={search_term_string}");
  assert.ok(org.logo.startsWith("https://") && org.email && org.sameAs.length >= 4 && org.name === "Voce a Voce");
});

test("scheda: campi obbligatori di MusicComposition, VideoObject, Breadcrumb", () => {
  const g = pieceLd(piece, "it");
  const [mc] = byType(g, "MusicComposition");
  assert.equal(mc.composer["@id"], "https://voceavoce.com/autori/bruckner/#person");
  assert.equal(mc.url, "https://voceavoce.com/brani/locus-iste/");
  assert.equal(mc.inLanguage, "la");
  assert.ok(mc.lyrics.text);
  const [vo] = byType(g, "VideoObject");
  for (const k of ["name", "description", "thumbnailUrl", "uploadDate", "embedUrl", "contentUrl", "duration"]) assert.ok(vo[k], k);
  assert.equal(vo.name, "Locus iste – Soprano");
  assert.equal(vo.thumbnailUrl, "https://i.ytimg.com/vi/abc123/hqdefault.jpg");
  assert.equal(vo.embedUrl, "https://www.youtube-nocookie.com/embed/abc123");
  assert.equal(vo.duration, "PT3M5S");
  assert.deepEqual(vo.hasPart.map((c) => [c.startOffset, c.endOffset]), [[0, 60], [60, 185]]);
  const [bc] = byType(g, "BreadcrumbList");
  assert.equal(bc.itemListElement.length, 3);
  assert.equal(bc.itemListElement[2].position, 3);
});

test("senza testo: niente lyrics; senza durata: niente duration", () => {
  const p = { ...piece, testo: undefined, voci: [{ voce: "S", video_id: "x", pubblica_dal: "2026-01-01T00:00:00Z" }] };
  const g = pieceLd(p, "it");
  assert.equal("lyrics" in byType(g, "MusicComposition")[0], false);
  assert.equal("duration" in byType(g, "VideoObject")[0], false);
  assert.equal("hasPart" in videoObjectLd(p, p.voci[0], "it"), false);
});

test("niente VideoObject per voci non ancora uscite (catalogo reale)", () => {
  const cat = buildCatalog("2000-01-01T00:00:00Z");
  for (const p of cat.brani) assert.equal(byType(pieceLd(p, "it"), "VideoObject").length, p.voci.length); // solo voci `pubblica: true`
  assert.ok(cat.brani.every((p) => p.voci.every((v) => v.pubblica === true)));
  const now = buildCatalog(new Date().toISOString());
  for (const p of now.brani) assert.equal(byType(pieceLd(p, "it"), "VideoObject").length, p.voci.length);
});

test("escaping di </script> nel JSON serializzato", () => {
  const s = serializeLd(pieceLd(piece, "it"));
  assert.ok(!s.includes("</script"));
  assert.ok(!s.includes("<"));
  assert.equal(JSON.parse(s)["@graph"][0].lyrics.text.includes("</script>"), true);
});

test("og: miniatura della prima voce, altrimenti predefinita", () => {
  assert.equal(pageOg(piece).type, "video.other");
  assert.equal(pageOg(piece).image, "https://i.ytimg.com/vi/abc123/hqdefault.jpg");
  assert.equal(pageOg({ voci: [] }).type, "website");
});

const TR = {
  en: { testo: "This place is made by God", credit: "A. Rossi", license: "CC BY 4.0", reviewed: true },
  de: { testo: "BOZZA </script>", credit: "B. Test", license: "Proprietaria", reviewed: false },
  la: { testo: "originale", reviewed: true },
};

test("traduzioni: testo solo se reviewed, licenza CC come URL, originale escluso", () => {
  const trs = translationsLd(TR, "la");
  assert.deepEqual(trs.map((x) => x.inLanguage), ["en", "de"]);
  assert.equal(trs[0].text, "This place is made by God");
  assert.equal(trs[0].license, "https://creativecommons.org/licenses/by/4.0/");
  assert.equal(trs[0].creditText, "A. Rossi");
  assert.equal(trs[0].author.name, "A. Rossi");
  assert.equal("text" in trs[1], false);
  assert.equal("license" in trs[1], false);
  assert.equal(trs[1].copyrightNotice, "Proprietaria");
});

test("scheda: lyrics.workTranslation e bozze senza testo nel JSON serializzato", () => {
  const mc = byType(pieceLd({ ...piece, traduzioni: TR }, "it"), "MusicComposition")[0];
  assert.equal(mc.lyrics.workTranslation.length, 2);
  const s = serializeLd(pieceLd({ ...piece, traduzioni: TR }, "it"));
  assert.ok(!s.includes("BOZZA"));
  assert.ok(!("workTranslation" in byType(pieceLd(piece, "it"), "MusicComposition")[0].lyrics));
});

test("listLd: ItemList ordinata, url nella lingua, noindex -> null", () => {
  const cat = buildCatalog(new Date().toISOString());
  const id = detailIds(cat).composer.find((i) => (cat.perCompositore[i] || []).some((p) => p.voci.length));
  const view = viewFor(cat, "composer", id);
  const g = listLd({ kind: "composer", id }, view, "en", { heading: "X", description: "d" });
  const [list] = byType(g, "ItemList");
  assert.deepEqual(list.itemListElement.map((e) => e.position), view.visible.map((_, i) => i + 1));
  assert.deepEqual(list.itemListElement.map((e) => e.name), view.visible.map((p) => p.titolo));
  assert.ok(list.itemListElement.every((e) => e.url.startsWith("https://voceavoce.com/en/")));
  assert.ok(view.visible.every((p) => p.voci.length > 0)); // nessun brano futuro
  const [person] = byType(g, "Person");
  assert.equal(person["@id"], `https://voceavoce.com/autori/${id}/#person`);
  assert.deepEqual(person.sameAs, []);
  assert.equal(listLd({ kind: "composer", id }, view, "it", { noindex: true }), null);
  assert.equal(listLd({ kind: "genre", id: "x" }, { visible: [] }, "it", {}), null);
});

test("personLd: anni interi o 'c. 1540', altrimenti omessi; escaping titolo", () => {
  const p = personLd({ id: "a", nome: "A", nascita: "c. 1540", morte: 1623 }, "it");
  assert.equal(p.birthDate, "c. 1540");
  assert.equal(p.deathDate, "1623");
  assert.equal("birthDate" in personLd({ id: "a", nome: "A", nascita: "boh" }, "it"), false);
  const view = { visible: [{ slug: "s", titolo: "</script><b>" }] };
  const s = serializeLd(listLd({ kind: "choir" }, view, "it", { heading: "Coro" }));
  assert.ok(!s.includes("<"));
});

test("listLd: opera/raccolta con hasPart", () => {
  const cat = buildCatalog(new Date().toISOString());
  const id = detailIds(cat).work.find((i) => viewFor(cat, "work", i).visible.length);
  if (!id) return;
  const view = viewFor(cat, "work", id);
  const g = listLd({ kind: "work", id }, view, "it", { heading: "W" });
  const w = graph(g).find((x) => x.hasPart);
  assert.equal(w.hasPart.length, view.visible.length);
});
