import test from "node:test";
import assert from "node:assert/strict";
import { siteLd, pieceLd, serializeLd, videoObjectLd, pageOg } from "../src/_lib/jsonld.js";
import { buildCatalog } from "../src/_lib/catalog.js";

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
