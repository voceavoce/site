// Base degli audio del player (UNICO punto di configurazione).
// Produzione: Worker Cloudflare su workers.dev (bucket R2 privato). Sviluppo: scripts/serve-audio.mjs.
// Da sostituire con l'URL mostrato da `wrangler deploy` (vedi workers/audio/README.md).
const AUDIO_BASE_PRODUZIONE = "https://voceavoce-audio.CAMBIAMI.workers.dev";
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
  audioBase: audioBase.replace(/\/+$/, ""),
  // TODO: link per le donazioni (Ko-fi, PayPal, ...). Finche' e' null il link «Sostieni il progetto» non si mostra.
  donazioni: null,
  buildTime: new Date().toISOString(),
};
