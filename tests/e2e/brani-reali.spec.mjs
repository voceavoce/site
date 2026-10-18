// Partitura di OGNI brano reale in content/player (non solo _prova), a piu' larghezze di schermo: deve comparire, avere
// tante battute quante ne dice sync.json, restare dentro il contenitore e non sovrapporre i righi. Nessun audio necessario.
import fs from "node:fs";
import path from "node:path";
import { expect } from "@playwright/test";
import { test, intercettaAudio, raccogliErrori, RADICE } from "./helpers.mjs";

const DIR = path.join(RADICE, "content/player");
const SLUGS = fs.readdirSync(DIR).filter((n) => !n.startsWith("_") && fs.existsSync(path.join(DIR, n, "sync.json")));
const CAMPIONE = ["a-d-una-fresca-riva-marenzio", "agnus-dei-josquin", "ave-maria-monteverdi"];
const SCHERMI = [{ nome: "telefono", width: 375, height: 740 }, { nome: "tablet", width: 768, height: 1000 }, { nome: "desktop", width: 1280, height: 800 }, { nome: "largo", width: 1920, height: 1000 }];

test.beforeEach(async ({ context }) => { await intercettaAudio(context); });

for (const slug of SLUGS) {
  const sync = JSON.parse(fs.readFileSync(path.join(DIR, slug, "sync.json"), "utf8"));
  // tutti i brani su telefono e desktop; le altre larghezze solo sui primi tre (campione), per tenere i tempi ragionevoli
  for (const s of SCHERMI.filter((x) => x.width === 375 || x.width === 1280 || CAMPIONE.includes(slug))) {
    test(`${slug} @ ${s.nome} ${s.width}px: la partitura compare intera e ordinata`, async ({ page }) => {
      const errori = raccogliErrori(page);
      await page.setViewportSize({ width: s.width, height: s.height });
      await page.goto(`/player/${slug}/`);
      await page.waitForFunction(() => document.querySelectorAll("[data-score] g.measure").length > 0, null, { timeout: 90_000 });
      // un eventuale errore non deve riguardare la partitura (l'audio finto di questo test non si decodifica)
      expect(await page.locator("[data-error]").textContent()).not.toMatch(/partitura/i);
      const r = await page.evaluate(() => {
        const c = document.querySelector("[data-score]"), cr = c.getBoundingClientRect();
        const svg = c.querySelector("svg"), sr = svg.getBoundingClientRect();
        const sistemi = [...c.querySelectorAll("g.system")].map((g) => g.getBoundingClientRect());
        const battute = [...c.querySelectorAll("g.measure")].map((g) => g.getBoundingClientRect());
        // altezza dei righi (staff) di ogni sistema, dall'alto: non devono sovrapporsi
        const righi = [...c.querySelectorAll("g.system")].map((sys) => {
          const first = sys.querySelector("g.measure");
          return [...first.querySelectorAll(":scope > g.staff")].map((st) => { const b = st.getBoundingClientRect(); return { t: b.top, b: b.bottom }; });
        });
        return {
          overflowX: getComputedStyle(c).overflowX, cw: cr.width, ch: cr.height, svgW: sr.width, svgH: sr.height, scrollW: c.scrollWidth, clientW: c.clientWidth,
          pagina: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          nSistemi: sistemi.length, nBattute: battute.length,
          misureVuote: battute.filter((b) => b.width < 5 || b.height < 5).length,
          sovrapposti: righi.reduce((n, rs) => n + rs.slice(1).filter((x, i) => x.t < rs[i].b - 40).length, 0),
          numeroRighi: righi.map((rs) => rs.length),
        };
      });
      expect(r.nBattute, "battute disegnate = battute di sync.json").toBe(sync.battute.length);
      expect(r.svgH, "la partitura ha un'altezza visibile").toBeGreaterThan(100);
      expect(r.svgW, "la partitura non e' piu' larga del contenitore").toBeLessThanOrEqual(r.cw + 1);
      expect(r.overflowX, "il riquadro non scorre di lato").toBe("hidden");
      expect(r.scrollW - r.clientW, "al piu' qualche pixel di scritta ritagliato, mai una parte della partitura").toBeLessThanOrEqual(24);
      expect(r.pagina, "nessuno scroll orizzontale della pagina").toBeLessThanOrEqual(1);
      expect(r.misureVuote).toBe(0);
      expect(r.sovrapposti, "righi sovrapposti").toBe(0);
      expect(new Set(r.numeroRighi).size, "ogni sistema ha lo stesso numero di righi").toBe(1);
      // niente errori dovuti alla partitura (gli audio finti possono non decodificarsi: si ignorano)
      expect(errori.filter((e) => !/audio|decode|opus|workers\.dev|Failed to load resource/i.test(e))).toEqual([]);
    });
  }
}
