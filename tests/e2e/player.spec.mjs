// Player di studio (/player/<slug>/) sul brano di prova content/player/_prova: caricamento, sincronia della battuta
// evidenziata con sync.json, seek, loop, mixer, tastiera/ARIA e layout mobile. Audio sintetici (helpers.mjs).
import { expect } from "@playwright/test";
import { test, apriPlayer, apriRipeti, intercettaAudio, raccogliErrori, SYNC, CHIAVI, MANIFEST } from "./helpers.mjs";

const TOLLERANZA_S = 0.15; // evidenziazione vs sync.json: un frame di rAF piu' la latenza stimata, in headless
const battuta = (i) => SYNC.battute[i];

test.beforeEach(async ({ context }) => {
  await intercettaAudio(context);
});

/** Registra nel browser ogni cambio di battuta evidenziata, con la posizione udibile di quell'istante. */
async function registraEvidenziazioni(page) {
  await page.evaluate(() => {
    const c = document.querySelector("[data-score]");
    const e = window.__study.engine;
    window.__hl = [];
    new MutationObserver(() => {
      const i = [...c.querySelectorAll("g.measure")].findIndex((x) => x.classList.contains("is-current"));
      const ultimo = window.__hl.at(-1);
      if (i >= 0 && (!ultimo || ultimo.m !== i)) window.__hl.push({ m: i, pos: e.audiblePosition() });
    }).observe(c, { attributes: true, subtree: true, attributeFilter: ["class"] });
  });
}

test.describe("caricamento", () => {
  test("4 tracce decodificate, partitura con tutte le battute, Play attivo, nessun errore", async ({ page }) => {
    const errori = raccogliErrori(page);
    await apriPlayer(page);
    const r = await page.evaluate(() => {
      const S = window.__study;
      return {
        tracce: [...S.engine.tracks.keys()],
        durate: [...S.engine.tracks.values()].map((t) => t.buffer.duration),
        durata: S.engine.duration,
        svg: document.querySelectorAll("[data-score] > svg").length,
        battuteSvg: document.querySelectorAll("[data-score] g.measure").length,
        battuteSync: S.sync.battute.length,
        play: document.querySelector("[data-play]").disabled,
        totale: document.querySelector("[data-total]").textContent,
      };
    });
    expect(r.tracce.sort()).toEqual([...CHIAVI].sort());
    r.durate.forEach((d) => expect(d).toBeCloseTo(SYNC.fine, 1));
    expect(r.svg).toBeGreaterThan(0);
    expect(r.battuteSvg).toBe(r.battuteSync);
    expect(r.battuteSvg).toBe(Math.max(...SYNC.battute.map((b) => b.m)) + 1);
    expect(r.play).toBe(false);
    expect(r.totale).toBe("0:20");
    await expect(page.locator("[data-error]")).toBeHidden();
    await expect(page.locator("[data-status]")).not.toBeEmpty();
    expect(errori).toEqual([]);
  });
});

test.describe("sincronia", () => {
  // Parte poco prima di una battuta e verifica che ogni battuta successiva si accenda al tempo di sync.json.
  for (const [pct, daBattuta] of [[100, 3], [75, 4]]) {
    test(`la battuta evidenziata segue sync.json a ${pct}%`, async ({ page }) => {
      await apriPlayer(page);
      await registraEvidenziazioni(page);
      await page.evaluate(({ pct, t }) => {
        const s = document.querySelector("[data-speed]");
        s.value = pct;
        s.dispatchEvent(new Event("input", { bubbles: true }));
        window.__study.engine.seek(t);
      }, { pct, t: battuta(daBattuta).t - 0.3 });
      await page.click("[data-play]");
      await expect(page.locator("[data-play]")).toHaveAttribute("aria-pressed", "true");
      const ultima = SYNC.battute.length - 1;
      await page.waitForFunction((n) => window.__hl.some((h) => h.m === n), ultima, { timeout: 40_000 });
      const hl = await page.evaluate(() => window.__hl);
      // sequenza ordinata, senza salti, fino all'ultima battuta
      // (l'eventuale battuta precedente, accesa dal seek prima di Play, non conta)
      hl.splice(0, hl.length, ...hl.filter((h) => h.m >= daBattuta));
      expect(hl.map((h) => h.m)).toEqual(Array.from({ length: ultima - daBattuta + 1 }, (_, k) => daBattuta + k));
      for (const h of hl) expect(Math.abs(h.pos - battuta(h.m).t), `battuta ${h.m}`).toBeLessThan(TOLLERANZA_S);
      expect(await page.evaluate(() => window.__study.engine.rate)).toBeCloseTo(pct / 100, 5);
    });
  }

  test("seek: dal cursore e dal tocco sulla partitura, in pausa", async ({ page }) => {
    await apriPlayer(page);
    // cursore di posizione (input range): fill lancia l'evento input come un utente
    await page.locator("[data-seek]").fill(String(battuta(3).t));
    await expect(page.locator("[data-seek]")).toHaveAttribute("data-measure", battuta(3).numero);
    await expect(page.locator("[data-score] g.measure").nth(3)).toHaveClass(/is-current/);
    expect(await page.evaluate(() => window.__study.engine.pausedPos)).toBeCloseTo(battuta(3).t, 1);
    await expect(page.locator("[data-time]")).toHaveText("0:09");
    // tocco su una battuta della partitura
    await page.locator("[data-score] g.measure").nth(1).dispatchEvent("click"); // il gestore e' sul <g>: un clic a coordinate puo' cadere tra i segni
    await expect(page.locator("[data-score] g.measure").nth(1)).toHaveClass(/is-current/);
    expect(await page.evaluate(() => window.__study.engine.pausedPos)).toBeCloseTo(battuta(1).t, 1);
    // seek in riproduzione: si riparte dalla nuova battuta
    await page.click("[data-play]");
    await page.locator("[data-seek]").fill((battuta(4).t + 0.2).toFixed(1));
    await expect(page.locator("[data-score] g.measure").nth(4)).toHaveClass(/is-current/);
    await page.click("[data-play]");
  });

  test("loop su un intervallo di battute: rientra all'inizio e resta dentro", async ({ page }) => {
    await apriPlayer(page);
    const a = 2, b = 3; // battute di indice 2..3 = da 6,3 s a 12,1 s
    const inizio = battuta(a).t, fine = battuta(b + 1).t;
    await expect(page.locator("[data-loop]")).toBeHidden(); // il riquadro Ripeti e' chiuso finche' non si preme il pulsante
    await apriRipeti(page);
    await expect(page.locator("[data-loop-open]")).toHaveAttribute("aria-expanded", "true");
    await page.locator("[data-loop-from]").selectOption({ value: String(a) });
    await page.locator("[data-loop-to]").selectOption({ value: String(b) });
    await page.locator("[data-loop] [data-loop-toggle]").click();
    await expect(page.locator("[data-loop] [data-loop-toggle]")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("[data-loop-open]")).toHaveClass(/is-on/); // il pulsante della barra segnala che il ripeti e' acceso
    const loop = await page.evaluate(() => window.__study.engine.loop);
    expect(loop.start).toBeCloseTo(inizio, 3);
    expect(loop.end).toBeCloseTo(fine, 3);

    await registraEvidenziazioni(page);
    await page.evaluate((t) => window.__study.engine.seek(t), fine - 0.6); // quasi alla fine del loop: il giro si vede subito
    await page.click("[data-play]");
    // campiona la posizione udibile per ~3 s: deve rientrare (scendere) almeno una volta e non uscire mai dal loop
    const camp = await page.evaluate(async () => {
      const e = window.__study.engine, out = [];
      const t0 = performance.now();
      while (performance.now() - t0 < 3000) { out.push(e.audiblePosition()); await new Promise((r) => setTimeout(r, 30)); }
      return out;
    });
    await page.click("[data-play]");
    const salti = camp.filter((p, i) => i > 0 && p < camp[i - 1] - 1);
    expect(salti.length, "deve esserci un rientro del loop").toBeGreaterThanOrEqual(1);
    for (const p of camp) { expect(p).toBeGreaterThanOrEqual(inizio - 0.05); expect(p).toBeLessThanOrEqual(fine + 0.05); }
    // dopo il rientro si riaccende la prima battuta del loop
    const hl = (await page.evaluate(() => window.__hl)).map((h) => h.m);
    expect(hl).toContain(a);
    expect(hl.every((m) => m >= a && m <= b)).toBe(true);
  });
});

test.describe("mixer", () => {
  const gain = (page, k) => page.evaluate((x) => window.__study.engine.getGainValue(x), k);
  const riga = (page, k) => page.locator(`[data-track=${k}]`);

  // Il contesto audio parte sospeso: finche' non si preme Play i guadagni non avanzano, quindi si parte in riproduzione.
  test.beforeEach(async ({ page }) => {
    await apriPlayer(page);
    await page.click("[data-play]");
    await expect(page.locator("[data-play]")).toHaveAttribute("aria-pressed", "true");
  });

  test("volume: valore del motore, uscita testuale e aria-valuetext", async ({ page }) => {
    await riga(page, "basso").locator("[data-volume]").fill("50");
    await expect.poll(() => gain(page, "basso")).toBeCloseTo(0.5, 2);
    await expect(riga(page, "basso").locator("[data-volume-out]")).toHaveText("50%");
    await expect(riga(page, "basso").locator("[data-volume]")).toHaveAttribute("aria-valuetext", "50%");
    expect(await gain(page, "soprano")).toBeCloseTo(1, 2);
  });

  test("muta: guadagno a zero, aria-pressed, ripristino", async ({ page }) => {
    const muta = riga(page, "alto").locator("[data-mute]");
    await expect(muta).toHaveAttribute("aria-pressed", "false");
    await muta.click();
    await expect(muta).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => gain(page, "alto")).toBeLessThan(0.01);
    await expect(riga(page, "alto")).toHaveClass(/is-silent/);
    await expect.poll(() => gain(page, "soprano")).toBeCloseTo(1, 2);
    await muta.click();
    await expect(muta).toHaveAttribute("aria-pressed", "false");
    await expect.poll(() => gain(page, "alto")).toBeCloseTo(1, 2);
  });

  test("solo: mette in mute tutte le altre voci (visibile) e fa suonare solo quella", async ({ page }) => {
    const solo = riga(page, "tenore").locator("[data-solo]");
    await solo.click();
    await expect(solo).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => gain(page, "tenore")).toBeCloseTo(1, 2);
    for (const k of ["soprano", "alto", "basso"]) {
      await expect(riga(page, k).locator("[data-mute]")).toHaveAttribute("aria-pressed", "true");
      await expect.poll(() => gain(page, k)).toBeLessThan(0.01);
    }
    await expect(riga(page, "tenore").locator("[data-mute]")).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator(".mix__row.is-silent")).toHaveCount(3);
  });

  test("solo: secondo tocco rimette tutte le voci in ascolto", async ({ page }) => {
    const solo = riga(page, "tenore").locator("[data-solo]");
    await solo.click();
    await solo.click();
    await expect(solo).toHaveAttribute("aria-pressed", "false");
    for (const k of ["soprano", "alto", "tenore", "basso"]) await expect.poll(() => gain(page, k)).toBeCloseTo(1, 2);
    await expect(page.locator(".mix__row.is-silent")).toHaveCount(0);
  });

  test("duetto: Solo su una voce, poi si toglie il mute a un'altra", async ({ page }) => {
    await riga(page, "soprano").locator("[data-solo]").click();
    await riga(page, "basso").locator("[data-mute]").click();
    await expect.poll(() => gain(page, "soprano")).toBeCloseTo(1, 2);
    await expect.poll(() => gain(page, "basso")).toBeCloseTo(1, 2);
    for (const k of ["alto", "tenore"]) await expect.poll(() => gain(page, k)).toBeLessThan(0.01);
    await expect(riga(page, "soprano").locator("[data-solo]")).toHaveAttribute("aria-pressed", "false");
  });

  test("«La mia voce»: la voce scelta al 100%, le altre al 30%", async ({ page }) => {
    await page.locator("[data-myvoice-select]").selectOption("alto");
    await page.locator("[data-myvoice]").click();
    await expect.poll(() => gain(page, "alto")).toBeCloseTo(1, 2);
    for (const k of ["soprano", "tenore", "basso"]) await expect.poll(() => gain(page, k)).toBeCloseTo(0.3, 2);
    await expect(riga(page, "soprano").locator("[data-volume]")).toHaveValue("30");
  });
});

test.describe("tastiera e ARIA", () => {
  test("ogni controllo ha un nome accessibile e i gruppi sono etichettati", async ({ page }) => {
    await apriPlayer(page);
    const senzaNome = await page.evaluate(() => {
      const nome = (e) => (e.getAttribute("aria-label") || [...(e.labels || [])].map((l) => l.textContent).join(" ") || e.textContent).trim();
      return [...document.querySelectorAll(".study button, .study input, .study select, .transport button, .transport input")]
        .filter((e) => e.type !== "hidden" && !nome(e)).map((e) => e.outerHTML.slice(0, 80));
    });
    expect(senzaNome).toEqual([]);
    await expect(page.locator(".transport")).toHaveAttribute("role", "group");
    await expect(page.locator(".transport")).toHaveAttribute("aria-label", /.+/);
    await expect(page.locator("[data-status]")).toHaveAttribute("role", "status");
    await expect(page.locator("[data-error]")).toHaveAttribute("role", "alert");
    await expect(page.locator("[data-score]")).toHaveAttribute("aria-label", /.+/);
    await expect(page.locator("[data-score] > svg").first()).toHaveAttribute("role", "img");
    // i controlli a due stati dichiarano aria-pressed fin dall'inizio
    for (const sel of ["[data-play]", "[data-loop-toggle]", "[data-mute]", "[data-solo]", "[data-loop-pick]"]) {
      for (const el of await page.locator(sel).all()) await expect(el).toHaveAttribute("aria-pressed", /^(true|false)$/);
    }
    // l'etichetta del tasto Play cambia con lo stato
    const prima = await page.locator("[data-play-label]").textContent();
    await page.click("[data-play]");
    await expect(page.locator("[data-play-label]")).not.toHaveText(prima);
    await page.click("[data-play]");
    await expect(page.locator("[data-play-label]")).toHaveText(prima);
  });

  test("ordine del focus: segue il DOM, ogni controllo e' raggiungibile e ha il focus visibile", async ({ page }) => {
    await apriPlayer(page);
    await page.locator("[data-zoom-out]").focus();
    const visti = [];
    for (let i = 0; i < 60; i++) {
      const info = await page.evaluate(() => {
        const e = document.activeElement;
        const d = [...Object.keys(e.dataset)].find((k) => /^(zoomOut|zoomIn|loopOpen|scoreOptionsToggle|loopPick|score|loopFrom|loopTo|loopToggle|volume|mute|solo|myvoiceSelect|myvoice|play|seek|speed)$/.test(k));
        const riga = e.closest("[data-track]")?.dataset.track;
        const c = getComputedStyle(e);
        return { id: d ? d + (riga ? `:${riga}` : "") : null, visibile: e.matches(":focus-visible"), contorno: c.outlineStyle !== "none" && parseFloat(c.outlineWidth) > 0 || c.boxShadow !== "none" };
      });
      if (info.id) { visti.push(info.id); expect(info.visibile && info.contorno, `focus visibile su ${info.id}`).toBe(true); }
      if (info.id === "speed") break; // ultimo controllo della barra
      await page.keyboard.press("Tab");
    }
    // il riquadro Ripeti e' chiuso: i suoi controlli non sono raggiungibili finche' non si apre
    const atteso = ["zoomOut", "zoomIn", "loopOpen", "scoreOptionsToggle", "score",
      ...CHIAVI.flatMap((k) => [`volume:${k}`, `mute:${k}`, `solo:${k}`]),
      "myvoiceSelect", "myvoice", "play", "seek", "speed"];
    expect(visti).toEqual(atteso);
  });

  test("tasti: Spazio e Invio sui pulsanti, frecce sul volume, Spazio fuori dai campi avvia il brano", async ({ page }) => {
    await apriPlayer(page);
    // Spazio con il focus sul corpo della pagina: avvia/ferma
    await page.locator("body").evaluate((b) => { document.activeElement?.blur?.(); });
    await page.keyboard.press("Space");
    await expect(page.locator("[data-play]")).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Space");
    await expect(page.locator("[data-play]")).toHaveAttribute("aria-pressed", "false");
    // Spazio sul pulsante Play (non deve contare due volte: il gestore globale ignora i pulsanti)
    await page.locator("[data-play]").focus();
    await page.keyboard.press("Space");
    await expect(page.locator("[data-play]")).toHaveAttribute("aria-pressed", "true");
    // Invio su muta, Spazio su solo
    await page.locator("[data-track=alto] [data-mute]").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("[data-track=alto] [data-mute]")).toHaveAttribute("aria-pressed", "true");
    await page.locator("[data-track=tenore] [data-solo]").focus();
    await page.keyboard.press("Space");
    await expect(page.locator("[data-track=tenore] [data-solo]")).toHaveAttribute("aria-pressed", "true");
    // frecce sul volume (passo 5)
    await page.locator("[data-track=basso] [data-volume]").focus();
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await expect(page.locator("[data-track=basso] [data-volume]")).toHaveValue("90");
    // tasti sul cursore di posizione (da fermo: a fine brano il motore riparte da zero)
    await page.click("[data-play]");
    await expect(page.locator("[data-play]")).toHaveAttribute("aria-pressed", "false");
    await page.locator("[data-seek]").focus();
    await page.keyboard.press("End");
    await expect(page.locator("[data-seek]")).toHaveAttribute("data-measure", SYNC.battute.at(-1).numero);
    await expect(page.locator("[data-seek]")).toHaveValue(String(MANIFEST.durata_sec));
    await page.keyboard.press("Home");
    await expect(page.locator("[data-seek]")).toHaveValue("0");
    // Spazio dentro un menu non avvia il brano
    await apriRipeti(page);
    await page.locator("[data-loop-from]").focus();
    await page.keyboard.press("Space");
    await expect(page.locator("[data-play]")).toHaveAttribute("aria-pressed", "false");
  });
});

test.describe("mobile 375 px", () => {
  test.use({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

  test("nessuno scroll orizzontale; la barra fissa non copre il fondo della pagina", async ({ page }) => {
    await apriPlayer(page);
    const orizzontale = () => page.evaluate(() => ({ doc: document.documentElement.scrollWidth - document.documentElement.clientWidth, body: document.body.scrollWidth - document.documentElement.clientWidth, partitura: document.querySelector("[data-score]").scrollWidth - document.querySelector("[data-score]").clientWidth }));
    const h = await orizzontale();
    expect(h.doc).toBeLessThanOrEqual(0);
    expect(h.body).toBeLessThanOrEqual(0);
    expect(h.partitura).toBeLessThanOrEqual(1);
    // la partitura riempie il contenitore
    const svg = await page.evaluate(() => ({ svg: document.querySelector("[data-score] > svg").getBoundingClientRect().width, box: document.querySelector("[data-score]").clientWidth }));
    expect(svg.svg).toBeLessThanOrEqual(svg.box + 1);
    // in fondo alla pagina il footer deve stare tutto sopra la barra fissa
    await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
    await expect.poll(() => page.evaluate(() => Math.round(window.scrollY + innerHeight) >= document.documentElement.scrollHeight - 1)).toBe(true);
    const f = await page.evaluate(() => {
      const t = document.querySelector(".transport");
      const pos = getComputedStyle(t).position;
      return { pos, trTop: t.getBoundingClientRect().top, footerBottom: document.querySelector("footer.site-footer .fine").getBoundingClientRect().bottom, altezza: window.innerHeight };
    });
    expect(f.pos).toBe("fixed");
    expect(f.footerBottom, "l'ultima riga del footer sta sopra la barra di trasporto").toBeLessThanOrEqual(f.trTop + 0.5);
    expect((await orizzontale()).doc).toBeLessThanOrEqual(0);
    // la barra non e' piu' alta di meta' schermo e i controlli principali sono tutti nella viewport
    const box = await page.locator(".transport").boundingBox();
    expect(box.height).toBeLessThan(f.altezza / 2);
    for (const sel of ["[data-play]", "[data-seek]", "[data-speed]"]) {
      const b = await page.locator(sel).boundingBox();
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(375.5);
    }
  });
});
