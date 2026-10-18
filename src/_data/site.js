// Base degli audio del player (UNICO punto di configurazione).
// Produzione: Worker Cloudflare su workers.dev (bucket R2 privato). Sviluppo: scripts/serve-audio.mjs.
// URL mostrato da `wrangler deploy` (vedi workers/audio/README.md).
const AUDIO_BASE_PRODUZIONE = "https://voceavoce-audio.voceavoce.workers.dev";
// Statistiche delle visite senza cookie: Cloudflare Web Analytics (guida in docs/statistiche.md).
// Incolla qui il token del sito ("data-cf-beacon"). Finche' e' null non si carica nessuno script.
const CLOUDFLARE_ANALYTICS_TOKEN = "671e07d6535a4584ac3fbb7681a7f97a";
const audioBase =
  process.env.VOCEAVOCE_AUDIO_BASE ||
  (process.env.ELEVENTY_ENV === "production" ? AUDIO_BASE_PRODUZIONE : "http://localhost:8787");

export default {
  url: "https://voceavoce.com",
  name: "Voce a Voce",
  langs: ["it", "en", "es"],
  defaultLang: "it",
  locales: { it: "it_IT", en: "en_US", es: "es_ES" },
  social: {
    youtube: "https://youtube.com/@voceavocecoro",
    facebook: "https://www.facebook.com/voceavocecoro",
    instagram: "https://instagram.com/voceavocecoro",
    tiktok: "https://tiktok.com/@voceavocecoro",
  },
  email: "info@voceavoce.com",
  ogImage: { path: "/assets/img/og-default.png", width: 1200, height: 630 },
  aiCrawlers: true, // robots.txt: consente esplicitamente i crawler AI
  ads: { enabled: false },
  analytics: {
    attive: Boolean(CLOUDFLARE_ANALYTICS_TOKEN), // decide il testo della pagina Privacy
    // lo script si carica solo nella build di produzione (niente visite finte da sviluppo e test)
    cloudflareToken: process.env.ELEVENTY_ENV === "production" ? CLOUDFLARE_ANALYTICS_TOKEN : null,
  },
  audioBase: audioBase.replace(/\/+$/, ""),
  // TODO: link per le donazioni (Ko-fi, PayPal, ...). Finche' e' null il link «Sostieni il progetto» non si mostra.
  donazioni: null,
  buildTime: process.env.VOCEAVOCE_NOW || new Date().toISOString(), // VOCEAVOCE_NOW: simula una data futura (uscite programmate) in locale
};
