// PWA: manifest, registrazione del service worker, pagina /offline/ senza rete e REGOLA SULL'AUDIO (mai in cache).
// Per "senza rete" non basta context.setOffline(): non vale per le richieste fatte dal service worker. Si usa
// un server del sito che il test puo' FERMARE (helpers.avviaSito).
import { expect } from "@playwright/test";
import { test, avviaSito, eAudio, intercettaAudio, leggiCache, apriPlayer, raccogliErrori, HOST_AUDIO, PLAYER_URL } from "./helpers.mjs";

/** Registra il SW e aspetta che controlli la pagina (dopo un reload, come farebbe un secondo accesso). */
async function attivaSw(page, base) {
  await page.goto(`${base}/`);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
}

test.describe("manifest", () => {
  test("collegato alla pagina e valido: nome, start_url, display, icone 192 e 512 reali", async ({ page, request }) => {
    await page.goto("/");
    const href = await page.locator('link[rel="manifest"]').getAttribute("href");
    expect(href).toBeTruthy();
    const res = await request.get(new URL(href, page.url()).href);
    expect(res.ok()).toBe(true);
    const m = await res.json();
    expect(m.name).toBeTruthy();
    expect(m.short_name).toBeTruthy();
    expect(m.display).toBe("standalone");
    expect(m.start_url).toMatch(/^\//);
    expect(m.scope).toBe("/");
    expect(m.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
    const taglie = m.icons.map((i) => i.sizes);
    expect(taglie).toEqual(expect.arrayContaining(["192x192", "512x512"]));
    expect(m.icons.some((i) => i.purpose === "maskable")).toBe(true);
    for (const icona of m.icons) {
      const r = await request.get(new URL(icona.src, page.url()).href);
      expect(r.ok(), icona.src).toBe(true);
      expect(r.headers()["content-type"]).toBe("image/png");
      const b = await r.body();
      expect(b.subarray(1, 4).toString()).toBe("PNG");
      const [w, h] = icona.sizes.split("x").map(Number);
      expect([b.readUInt32BE(16), b.readUInt32BE(20)], `dimensioni reali di ${icona.src}`).toEqual([w, h]);
    }
    // anche la start_url si apre
    expect((await request.get(new URL(m.start_url, page.url()).href)).ok()).toBe(true);
  });
});

test.describe("service worker", () => {
  test("si registra, si attiva e controlla la pagina dopo il reload; precache presente", async ({ page }) => {
    const errori = raccogliErrori(page);
    await page.goto("/");
    const reg = await page.evaluate(async () => {
      const r = await navigator.serviceWorker.ready;
      return { scope: r.scope, script: r.active.scriptURL };
    });
    expect(new URL(reg.script).pathname).toBe("/sw.js");
    expect(new URL(reg.scope).pathname).toBe("/");
    // "ready" puo' risolvere con il worker ancora in "activating": si aspetta lo stato finale
    await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).active.state)).toBe("activated");
    await page.reload();
    expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    const cache = await leggiCache(page);
    const pre = Object.keys(cache).filter((k) => k.startsWith("vav-pre-"));
    expect(pre).toHaveLength(1);
    const urls = cache[pre[0]].map((u) => new URL(u).pathname);
    expect(urls).toEqual(expect.arrayContaining(["/", "/offline/", "/manifest.webmanifest", "/assets/css/main.css"]));
    expect(errori).toEqual([]);
  });

  test("senza rete: la pagina gia' visitata si apre dalla cache, una nuova mostra /offline/", async ({ page }) => {
    const sito = await avviaSito();
    try {
      await attivaSw(page, sito.url);
      // visita una pagina in piu' con rete: finisce nella cache di runtime (network-first)
      await page.goto(`${sito.url}/privacy/`);
      const titoloPrivacy = await page.title();
      await expect.poll(async () => Object.values(await leggiCache(page)).flat().some((u) => u.endsWith("/privacy/"))).toBe(true);
      await sito.ferma(); // il server sparisce: vale anche per le richieste del SW

      await page.goto(`${sito.url}/privacy/`);
      expect(await page.title()).toBe(titoloPrivacy);
      await page.goto(`${sito.url}/?source=pwa`); // precache: la start_url con la query si apre
      await expect(page.locator("h1").first()).toBeVisible();

      await page.goto(`${sito.url}/trasparenza/`); // mai visitata e non in precache
      await expect(page.locator("h1[lang=it]")).toHaveText("Sei offline");
      await expect(page.locator("h2[lang=en]")).toHaveText("You are offline");
      expect(await page.title()).toMatch(/Offline/);
    } finally {
      await sito.ferma().catch(() => {});
    }
  });

  test("l'audio non entra mai nella Cache Storage (anche con Range e host workers.dev)", async ({ page, context }) => {
    const viste = await intercettaAudio(context);
    await page.goto("/");
    await page.evaluate(() => navigator.serviceWorker.ready);
    await apriPlayer(page, PLAYER_URL); // navigazione controllata dal SW (clients.claim)
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    await page.reload(); // ricarica con il SW attivo: scarica di nuovo le 4 tracce attraverso il SW
    await apriPlayer(page, PLAYER_URL);
    // richieste di prova: Range verso l'host audio, un file audio sullo stesso sito, un host workers.dev
    const esiti = await page.evaluate(async (host) => {
      const out = [];
      const f = async (url, init) => { try { const r = await fetch(url, init); out.push([url, r.status]); } catch (e) { out.push([url, String(e)]); } };
      await f(`http://${host}/_prova/v1/soprano.opus`, { headers: { Range: "bytes=0-99" } });
      await f(`http://${host}/_prova/v1/alto.mp3`);
      await f("https://voceavoce-audio.esempio.workers.dev/_prova/v1/basso.opus");
      await f("https://voceavoce-audio.esempio.workers.dev/_prova/v1/basso.opus", { headers: { Range: "bytes=0-9" } });
      await f("/assets/audio-finto.wav"); // stesso sito: 404, ma non deve comunque finire in cache
      return out;
    }, HOST_AUDIO);
    expect(esiti.slice(0, 4).map((e) => e[1])).toEqual([206, 200, 200, 206]);
    expect(viste.filter((v) => v.range).length).toBeGreaterThanOrEqual(2);
    expect(viste.length).toBeGreaterThanOrEqual(4 + 4); // 4 tracce al primo caricamento + 4 dopo il reload (+ prove)
    await page.waitForTimeout(500); // le put in cache del SW sono asincrone: lascia loro il tempo di (non) avvenire
    const cache = await leggiCache(page);
    const tutti = Object.values(cache).flat();
    // test non vacuo: il SW ha davvero messo in cache altro (asset del player in runtime)
    expect(tutti.some((u) => u.includes("/assets/js/study/engine.js"))).toBe(true);
    expect(tutti.filter(eAudio), "URL audio in cache").toEqual([]);
    expect(tutti.filter((u) => new URL(u).host !== new URL(page.url()).host), "URL di altre origini in cache").toEqual([]);
  });
});

test.describe("aggiornamento del service worker", () => {
  // Strategia: il server di prova serve /sw.js con una VERSION scelta dal test. Cambiare la riga VERSION
  // cambia i byte dello script, quindi reg.update() installa un nuovo SW esattamente come dopo un nuovo deploy
  // (dove la VERSION e' l'hash di site.buildTime). E' piu' robusto di ricostruire il sito due volte (lento,
  // dipende dall'orologio) o di intercettare /sw.js con route (non affidabile per gli script dei service worker).
  test("una versione nuova si attiva e cancella le cache vav-* vecchie; l'audio resta fuori", async ({ page, context }) => {
    const viste = await intercettaAudio(context);
    const sito = await avviaSito({ swVersion: "e2e-a" });
    try {
      await attivaSw(page, sito.url);
      // stato iniziale: cache della versione A, piu' una cache "vav-" orfana e una cache di un'altra app
      await page.evaluate(async () => {
        await (await caches.open("vav-pre-versione-molto-vecchia")).put("/vecchia", new Response("x"));
        await (await caches.open("vav-rt-versione-molto-vecchia")).put("/vecchia", new Response("x"));
        await (await caches.open("altra-app")).put("/mia", new Response("x"));
      });
      await apriPlayer(page, `${sito.url}${PLAYER_URL}`);
      let nomi = Object.keys(await leggiCache(page)).sort();
      expect(nomi).toEqual(expect.arrayContaining(["vav-pre-e2e-a", "vav-rt-e2e-a", "vav-pre-versione-molto-vecchia", "altra-app"]));

      // nuovo "deploy"
      sito.setSwVersion("e2e-b");
      const script = await page.evaluate(async () => {
        const r = await navigator.serviceWorker.getRegistration();
        await r.update();
        return r.installing?.scriptURL ?? r.waiting?.scriptURL ?? r.active.scriptURL;
      });
      expect(new URL(script).pathname).toBe("/sw.js");
      // skipWaiting + clients.claim + activate: restano solo le cache della versione B (e quelle non nostre)
      await expect.poll(async () => Object.keys(await leggiCache(page)).filter((k) => k.startsWith("vav-")).sort(), { timeout: 20_000 })
        .toEqual(["vav-pre-e2e-b"]);
      nomi = Object.keys(await leggiCache(page));
      expect(nomi).toContain("altra-app"); // non si toccano le cache altrui
      expect(nomi.filter((k) => k.includes("e2e-a") || k.includes("vecchia"))).toEqual([]);
      expect(await page.evaluate(() => navigator.serviceWorker.controller?.state)).toBe("activated");

      // con la versione B la pagina funziona ancora e il player riscarica le tracce senza metterle in cache
      await page.goto(`${sito.url}/`);
      await apriPlayer(page, `${sito.url}${PLAYER_URL}`);
      await expect.poll(async () => Object.keys(await leggiCache(page)).filter((k) => k.startsWith("vav-")).sort()).toEqual(["vav-pre-e2e-b", "vav-rt-e2e-b"]);
      const tutti = Object.values(await leggiCache(page)).flat();
      expect(tutti.filter(eAudio)).toEqual([]);
      expect(viste.length).toBeGreaterThanOrEqual(8);
    } finally {
      await sito.ferma();
    }
  });
});
