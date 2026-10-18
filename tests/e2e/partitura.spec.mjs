// Partitura del player di studio: carta bianca, cursore che scorre, fascia della propria voce, riquadro delle opzioni
// (ricordate nel browser) ed etichette dei righi. Sul brano di prova content/player/_prova, con audio sintetici.
import { expect } from "@playwright/test";
import { test, apriPlayer, intercettaAudio, raccogliErrori, SYNC } from "./helpers.mjs";

test.beforeEach(async ({ context }) => {
  await intercettaAudio(context);
});

const battuta = (i) => SYNC.battute[i];
const sfondo = (page) => page.evaluate(() => getComputedStyle(document.querySelector("[data-score]")).backgroundColor);
const cursoreX = (page) => page.evaluate(() => {
  const m = /translate\(([-\d.]+)px/.exec(document.querySelector(".score-cursor").style.transform);
  return m ? Number(m[1]) : null;
});
const apriOpzioni = async (page) => {
  await page.click("[data-score-options-toggle]");
  await expect(page.locator("[data-score-options]")).toBeVisible();
};
const posiziona = (page, t) => page.locator("[data-seek]").fill(String(Number(Number(t).toFixed(1))));

test.describe("aspetto di partenza", () => {
  test("carta bianca, cursore visibile, fascia sulla voce scelta, nessuna fascia sulla battuta, nessun errore", async ({ page }) => {
    const errori = raccogliErrori(page);
    await apriPlayer(page);
    expect(await sfondo(page)).toBe("rgb(255, 255, 255)");
    await expect(page.locator(".score-cursor")).toBeVisible();
    expect(await page.locator(".score-voice-band").count()).toBeGreaterThan(0);
    // la fascia sta DIETRO la partitura e il cursore sta tra fascia e partitura
    const z = await page.evaluate(() => ({
      banda: getComputedStyle(document.querySelector(".score-voice-band")).zIndex,
      cursore: getComputedStyle(document.querySelector(".score-cursor")).zIndex,
      svg: getComputedStyle(document.querySelector("[data-score] > svg")).zIndex,
    }));
    expect(Number(z.banda)).toBeLessThan(Number(z.cursore));
    expect(Number(z.cursore)).toBeLessThan(Number(z.svg));
    await posiziona(page, battuta(1).t + 0.1);
    await expect(page.locator("[data-score] .measure-bg")).toHaveCount(1);
    expect(await page.evaluate(() => getComputedStyle(document.querySelector("[data-score] .measure-bg")).display)).toBe("none");
    await expect(page.locator("[data-score-options]")).toBeHidden();
    expect(errori).toEqual([]);
  });

  test("le etichette dei righi sono le sigle delle voci, anche sul primo rigo", async ({ page }) => {
    await apriPlayer(page);
    const sigle = await page.evaluate(() => window.__study.sync && [...document.querySelectorAll("[data-score] g.label text, [data-score] g.labelAbbr text")].map((t) => t.textContent.trim()).filter(Boolean));
    expect(sigle.length).toBeGreaterThan(0);
    for (const s of sigle) expect(["S", "A", "T", "B"]).toContain(s);
    expect(new Set(sigle).size).toBe(4);
  });
});

test.describe("cursore", () => {
  test("si sposta verso destra col tempo dentro la battuta", async ({ page }) => {
    await apriPlayer(page);
    const t0 = battuta(1).t, t1 = battuta(2).t;
    await posiziona(page, t0 + 0.1);
    const x1 = await cursoreX(page);
    await posiziona(page, t0 + (t1 - t0) * 0.5);
    const x2 = await cursoreX(page);
    await posiziona(page, t1 - 0.1);
    const x3 = await cursoreX(page);
    expect(x1).not.toBeNull();
    expect(x2).toBeGreaterThan(x1);
    expect(x3).toBeGreaterThan(x2);
  });

  test("segue la riproduzione: dopo un po' si e' mosso", async ({ page }) => {
    await apriPlayer(page);
    await posiziona(page, battuta(0).t);
    const prima = await cursoreX(page);
    await page.click("[data-play]");
    await page.waitForFunction((b) => window.__study.engine.audiblePosition() > b, battuta(2).t + 0.1, { timeout: 15_000 });
    await page.click("[data-play]");
    const dopo = await cursoreX(page);
    expect(dopo).not.toBe(prima);
  });

  test("prima della prima battuta (lead-in) resta all'inizio, senza errori", async ({ page }) => {
    const errori = raccogliErrori(page);
    await apriPlayer(page);
    await posiziona(page, 0);
    await expect(page.locator(".score-cursor")).toBeVisible();
    expect(errori).toEqual([]);
  });

  test("il cursore ha l'altezza del sistema e resta dentro la partitura", async ({ page }) => {
    await apriPlayer(page);
    await posiziona(page, battuta(1).t + 0.1);
    const r = await page.evaluate(() => {
      const c = document.querySelector(".score-cursor").getBoundingClientRect();
      const s = document.querySelector("[data-score]").getBoundingClientRect();
      return { altezza: c.height, dentro: c.left >= s.left && c.right <= s.right };
    });
    expect(r.altezza).toBeGreaterThan(20);
    expect(r.dentro).toBe(true);
  });
});

test.describe("fascia della propria voce", () => {
  test("cambiando voce nel menu la fascia passa al rigo di quella voce", async ({ page }) => {
    await apriPlayer(page);
    const topFascia = () => page.evaluate(() => parseFloat(document.querySelector(".score-voice-band").style.top));
    await page.selectOption("[data-myvoice-select]", "soprano");
    const soprano = await topFascia();
    await page.selectOption("[data-myvoice-select]", "basso");
    const basso = await topFascia();
    expect(basso).toBeGreaterThan(soprano);
    // una fascia per sistema
    const sistemi = await page.locator("[data-score] g.system").count();
    expect(await page.locator(".score-voice-band").count()).toBe(sistemi);
  });

  test("la voce gia' scelta all'apertura e' evidenziata (senza toccare il menu)", async ({ page }) => {
    await apriPlayer(page);
    expect(await page.locator(".score-voice-band").count()).toBeGreaterThan(0);
  });
});

test.describe("riquadro delle opzioni", () => {
  test("il pulsante apre e chiude il riquadro e dice lo stato (aria-expanded)", async ({ page }) => {
    await apriPlayer(page);
    const bottone = page.locator("[data-score-options-toggle]");
    await expect(bottone).toHaveAttribute("aria-expanded", "false");
    await bottone.click();
    await expect(bottone).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("[data-score-options]")).toBeVisible();
    await bottone.click();
    await expect(bottone).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator("[data-score-options]")).toBeHidden();
  });

  test("il pulsante e' sulla stessa riga di A- e A+ e ogni scelta ha un'etichetta", async ({ page }) => {
    await apriPlayer(page);
    const y = await page.evaluate(() => ["[data-zoom-out]", "[data-zoom-in]", "[data-score-options-toggle]"].map((s) => Math.round(document.querySelector(s).getBoundingClientRect().top)));
    expect(new Set(y).size).toBe(1);
    await apriOpzioni(page);
    for (const sel of ["[data-opt-mypart]", "[data-opt-cursor]", "[data-opt-cursor-color]", "[data-opt-measure]", "[data-opt-invert]"]) {
      await expect(page.locator(`label:has(${sel})`)).toContainText(/\S/);
    }
  });

  test("Inverti colori: carta scura, ricordata dopo il ricaricamento; si toglie con lo stesso comando", async ({ page }) => {
    await apriPlayer(page);
    await apriOpzioni(page);
    await page.check("[data-opt-invert]");
    expect(await sfondo(page)).toBe("rgb(16, 24, 40)");
    await page.reload();
    await page.waitForFunction(() => window.__study?.score);
    expect(await sfondo(page)).toBe("rgb(16, 24, 40)");
    await apriOpzioni(page);
    await expect(page.locator("[data-opt-invert]")).toBeChecked();
    await page.uncheck("[data-opt-invert]");
    expect(await sfondo(page)).toBe("rgb(255, 255, 255)");
  });

  test("Cursore: spento sparisce, acceso torna; il colore si cambia ed e' ricordato", async ({ page }) => {
    await apriPlayer(page);
    await apriOpzioni(page);
    await page.locator("[data-opt-cursor-color]").fill("#d93a00");
    expect(await page.evaluate(() => getComputedStyle(document.querySelector(".score-cursor")).backgroundColor)).toBe("rgb(217, 58, 0)");
    await page.uncheck("[data-opt-cursor]");
    await expect(page.locator(".score-cursor")).toBeHidden();
    await expect(page.locator("[data-opt-cursor-color]")).toBeDisabled();
    await page.check("[data-opt-cursor]");
    await expect(page.locator(".score-cursor")).toBeVisible();
    await page.reload();
    await page.waitForFunction(() => window.__study?.score);
    expect(await page.evaluate(() => getComputedStyle(document.querySelector(".score-cursor")).backgroundColor)).toBe("rgb(217, 58, 0)");
  });

  test("Evidenzia la mia parte: spento toglie la fascia gialla, acceso la rimette", async ({ page }) => {
    await apriPlayer(page);
    await apriOpzioni(page);
    const visibile = () => page.evaluate(() => getComputedStyle(document.querySelector(".score-voice-band")).display !== "none");
    expect(await visibile()).toBe(true);
    await page.uncheck("[data-opt-mypart]");
    expect(await visibile()).toBe(false);
    await page.check("[data-opt-mypart]");
    expect(await visibile()).toBe(true);
  });

  test("Evidenzia la battuta: spento di default, acceso mostra la fascia sulla battuta corrente", async ({ page }) => {
    await apriPlayer(page);
    await posiziona(page, battuta(1).t + 0.1);
    const display = () => page.evaluate(() => getComputedStyle(document.querySelector("[data-score] .measure-bg")).display);
    expect(await display()).toBe("none");
    await apriOpzioni(page);
    await page.check("[data-opt-measure]");
    expect(await display()).not.toBe("none");
  });

  test("opzioni salvate rovinate nel browser: si usano i valori di partenza, senza errori", async ({ page }) => {
    const errori = raccogliErrori(page);
    await page.addInitScript(() => localStorage.setItem("va-score-opts", '{"cursorColor":"rosso","cursor":"no"'));
    await apriPlayer(page);
    expect(await sfondo(page)).toBe("rgb(255, 255, 255)");
    await expect(page.locator(".score-cursor")).toBeVisible();
    expect(errori).toEqual([]);
  });

  test("se il browser non permette di salvare (storage bloccato) il riquadro funziona lo stesso", async ({ page }) => {
    const errori = raccogliErrori(page);
    await page.addInitScript(() => {
      Object.defineProperty(window, "localStorage", { get() { throw new DOMException("bloccato", "SecurityError"); } });
    });
    await apriPlayer(page);
    await apriOpzioni(page);
    await page.check("[data-opt-invert]");
    expect(await sfondo(page)).toBe("rgb(16, 24, 40)");
    expect(errori).toEqual([]);
  });
});

test.describe("scelta della battuta toccando la partitura", () => {
  /** Punto (px di pagina) nel mezzo di una battuta, in alto nel suo sistema: spesso e' spazio vuoto, senza segni. */

  test("toccare lo spazio vuoto di battute diverse sceglie battute diverse (e quella giusta)", async ({ page }) => {
    await apriPlayer(page);
    const scelte = [];
    for (const i of [1, 3]) {
      await page.click("[data-loop-pick]");
      const { x, y } = await centro(page, i);
      await page.mouse.click(x, y);
      scelte.push(await page.locator("[data-loop-from]").inputValue());
      await page.click("[data-loop-pick]"); // spegne la scelta (e azzera quella a meta')
    }
    expect(scelte).toEqual(["1", "3"]);
  });

  test("prima e ultima battuta: l'intervallo del ciclo e' quello toccato", async ({ page }) => {
    await apriPlayer(page);
    await page.click("[data-loop-pick]");
    const a = await centro(page, 1), b = await centro(page, 4);
    await page.mouse.click(a.x, a.y);
    await page.mouse.click(b.x, b.y);
    await expect(page.locator("[data-loop-from]")).toHaveValue("1");
    await expect(page.locator("[data-loop-to]")).toHaveValue("4");
  });

  test("senza la scelta attiva un tocco porta la riproduzione a quella battuta, anche sullo spazio vuoto", async ({ page }) => {
    await apriPlayer(page);
    const { x, y } = await centro(page, 3);
    await page.mouse.click(x, y);
    await expect(page.locator("[data-score] g.measure").nth(3)).toHaveClass(/is-current/);
  });

  test("un tocco fuori dai sistemi (sotto la partitura) non sceglie niente", async ({ page }) => {
    await apriPlayer(page);
    const prima = await page.evaluate(() => document.querySelector("[data-seek]").dataset.measure);
    const r = await page.evaluate(() => { const s = document.querySelector("[data-score]").getBoundingClientRect(); return { x: s.left + 20, y: s.bottom - 2 }; });
    await page.mouse.click(r.x, r.y);
    expect(await page.evaluate(() => document.querySelector("[data-seek]").dataset.measure)).toBe(prima);
  });
});

const centro = (page, i) => page.evaluate((k) => {
  const g = document.querySelectorAll("[data-score] g.measure")[k];
  document.querySelector("[data-score]").scrollIntoView({ block: "center", behavior: "instant" }); // il tasto Scegli e' piu' in basso: la pagina puo' essere scorsa
  const r = g.getBoundingClientRect(), s = g.closest("g.system").getBoundingClientRect();
  return { x: r.left + r.width * 0.5 + 3, y: s.top + s.height * 0.1 };
}, i);

test.describe("scelta della battuta su brani reali (testo e melismi sotto le note)", () => {
  // Il rettangolo di ogni battuta include versi e trattini che sconfinano nelle vicine: l'estensione giusta e' quella del rigo.
  for (const slug of ["agnus-dei-josquin", "adieu-sweet-amaryllis-wilbye", "a-d-una-fresca-riva-marenzio"]) {
    test(`${slug}: toccando il centro di OGNI battuta si sceglie quella battuta`, async ({ page }) => {
      test.setTimeout(600_000); // brani lunghi: decine di battute, ognuna con il suo tocco
      await page.goto(`/player/${slug}/`);
      await page.waitForFunction(() => document.querySelectorAll("[data-score] g.measure").length > 0 && !document.querySelector("[data-loop-pick]").disabled, null, { timeout: 180_000 });
      const n = await page.evaluate(() => document.querySelectorAll("[data-score] g.measure").length);
      const sbagliate = [];
      for (let i = 0; i < n; i++) {
        await page.click("[data-loop-pick]");
        const p = await page.evaluate(async (k) => {
          const g = document.querySelectorAll("[data-score] g.measure")[k];
          g.scrollIntoView({ block: "center", behavior: "instant" });
          // lo scroll automatico del tocco precedente puo' ancora girare: si misura quando la battuta sta ferma per 6 frame
          for (let fermo = 0, y0 = null; fermo < 6;) {
            await new Promise((ok) => requestAnimationFrame(ok));
            const y = g.getBoundingClientRect().top;
            fermo = y === y0 ? fermo + 1 : 0; y0 = y;
            if (fermo === 0) g.scrollIntoView({ block: "center", behavior: "instant" });
          }
          const linee = [...g.querySelector(":scope > g.staff").querySelectorAll(":scope > path")].map((e) => e.getBoundingClientRect());
          const l = Math.min(...linee.map((r) => r.left)), r = Math.max(...linee.map((r) => r.right));
          const s = g.closest("g.system").getBoundingClientRect();
          return { x: (l + r) / 2, y: s.top + s.height * 0.12 };
        }, i);
        await page.mouse.click(p.x, p.y);
        const got = await page.locator("[data-loop-from]").inputValue();
        if (got !== String(i)) sbagliate.push(`${i}->${got}`);
        await page.click("[data-loop-pick]"); // spegne la scelta
      }
      expect(sbagliate, "battute scelte male (attesa -> ottenuta)").toEqual([]);
    });
  }

  test("exultate-deo-palestrina: all'inizio il cursore sta sulla prima nota, non a meta' battuta (le altre voci hanno la pausa di battuta)", async ({ page }) => {
    await page.goto("/player/exultate-deo-palestrina/?debug");
    await page.waitForFunction(() => document.querySelectorAll("[data-score] g.measure").length > 0 && window.__study?.score, null, { timeout: 90_000 });
    await page.waitForTimeout(1000);
    const { cursore, nota } = await page.evaluate(() => {
      const c = document.querySelector("[data-score]").getBoundingClientRect();
      const m = /translate\(([-\d.]+)px/.exec(document.querySelector(".score-cursor").style.transform);
      const g0 = document.querySelectorAll("[data-score] g.measure")[0];
      const xs = [...g0.querySelectorAll(".note .notehead")].map((e) => { const r = e.getBoundingClientRect(); return r.left + r.width / 2 - c.left; });
      return { cursore: Number(m[1]) + 2, nota: Math.min(...xs) };
    });
    expect(Math.abs(cursore - nota), `cursore ${cursore} prima nota ${nota}`).toBeLessThan(8);
  });

  test("scelto un passaggio la testina va al suo inizio e Riproduci parte da li", async ({ page }) => {
    await apriPlayer(page);
    await page.click("[data-loop-pick]");
    for (const i of [2, 4]) {
      const { x, y } = await centro(page, i);
      await page.mouse.click(x, y);
    }
    await expect(page.locator("[data-loop-from]")).toHaveValue("2");
    await expect(page.locator("[data-loop-to]")).toHaveValue("4");
    const inizio = battuta(2).t;
    expect(await page.evaluate(() => window.__study.engine.position())).toBeCloseTo(inizio, 1);
    // le due etichette dei pulsanti Ripeti mostrano il passaggio, e i due pulsanti sono lo stesso interruttore
    await expect(page.locator("[data-loop-toggle]").first().locator("[data-loop-range]")).toHaveText("3–5");
    await expect(page.locator("[data-loop-toggle]").nth(1).locator("[data-loop-range]")).toHaveText("3–5");
    await page.click("[data-play]");
    await expect(page.locator("[data-play]")).toHaveAttribute("aria-pressed", "true");
    expect(await page.evaluate(() => window.__study.engine.position())).toBeGreaterThanOrEqual(inizio - 0.05);
  });

  test("Riproduci con un ripeti acceso e la testina prima del passaggio parte dall'inizio del passaggio", async ({ page }) => {
    await apriPlayer(page);
    await page.locator("[data-loop-from]").selectOption({ value: "3" }); // per valore (indice): l'etichetta "3" e' un'altra battuta
    await page.locator("[data-loop-to]").selectOption({ value: "4" });
    await page.locator("[data-loop-toggle]").first().click(); // acceso, testina ancora a 0
    expect(await page.evaluate(() => window.__study.engine.position())).toBeLessThan(0.5);
    await page.click("[data-play]");
    await expect(page.locator("[data-play]")).toHaveAttribute("aria-pressed", "true");
    expect(await page.evaluate(() => window.__study.engine.position())).toBeGreaterThanOrEqual(battuta(3).t - 0.05);
  });
});
