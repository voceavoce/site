# Verifiche manuali del player (bozze)

Script usati durante la sessione del 2026-10-16 per verificare a mano player e PWA con Playwright.
**Non sono test automatici** e non girano in CI: sono la base del task P12 (test end-to-end in `tests/e2e/`).
**Test automatici (P12-P14): `tests/e2e/`, lanciati con `npm run e2e`** (vedi `docs/player.md`, sezione «Test end-to-end»).
Possono contenere porte, percorsi o tempi legati a quella sessione: vanno rivisti prima di riusarli.

| File | Cosa verificava |
|---|---|
| `gen.py` | genera audio sintetici per voce, allineati a `sync.json`, con un clic a ogni battuta (gli audio vanno FUORI dal repo) |
| `sync.mjs` | battuta evidenziata contro `sync.json` a 1× e 0,75×, dopo un seek e dentro un loop |
| `calib.mjs` | latenza dello stretcher SoundTouch misurata offline (origine della tabella `STRETCH_LATENCY` in `src/assets/js/study/latency.js`) |
| `measure.mjs` | evidenziazione contro clic udibile, prima e dopo la compensazione della latenza (P11). **Automatizzato in `tests/e2e/sync-audio.spec.mjs` (P15)** sul brano di prova; questo script resta per il collaudo sul brano vero (Locus iste) |
| `kbd.mjs`, `kbd2.mjs` | uso da tastiera e ARIA del player |
| `mobile.mjs` | layout a 375/360 px, barra fissa, nessuno scroll orizzontale |
| `foot.mjs` | barra fissa che copriva il footer |
