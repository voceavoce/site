# Task — nuovo sito voceavoce.com

Riferimento: [plan.md](plan.md). Stato e decisioni: [state.md](state.md).
Legenda: `[ ]` da fare · `[~]` in corso · `[x]` fatto. Modello consigliato: **H** = Haiku (meccanico), **S** = Sonnet (sviluppo), **O** = Opus (giudizio/revisione).

## A — AIVideoCreator (branch `claude/voceavocecoro-video-portal-s3o8vi`)

- [x] A1 (S) `pipeline-core/scripts/common/sito.py`: funzioni pure (inclusione voci, gruppi arie/metodi, slug, genere, compositore e titolo puliti, scheda, capitoli) — commit WIP pushato
- [x] A2 (S) `pipeline-core/scripts/cli/job_sito_esporta.py`: CLI dry-run / `--scrivi`, `--out` (default `VOCEAVOCE_SITE_DIR`), salva `slug_sito` in roadmap — commit WIP pushato, dry-run ok (142 schede)
- [x] A3 (S) `tests/test_sito_esporta.py`: inclusione per privacy/date, voci ritirate escluse, slug stabile, genere, titolo/compositore puliti, idempotenza
- [x] A4 (S) `job_choir_complete_metadata._salva_stato`: copia i capitoli di `chapters.txt` e la durata in `voci.<V>` della roadmap + test
- [x] A5 (H) `_schema` del contratto: documentare il campo facoltativo `genere`
- [x] A6 (H) `.env.example`: `VOCEAVOCE_SITE_DIR`; skill `voceavoce-publish-choir`: passo finale export + commit del sito
- [x] A7 (H) `CLAUDE.md`: una riga sul nuovo export; numero T-905 in `tasks.md`
- [ ] A8 (S) primo export reale verso `voceavoce/site/content/generated/` + commit slug in roadmap — DOPO il merge del branch di AIVideoCreator su main (vedi state.md)

## B — Sito (`voceavoce/site`, branch `claude/voceavocecoro-video-portal-s3o8vi`)

- [x] B0 (H) Backup: copia landing in `src/static/classic/` con `noindex`, canonical, og:image assoluto, avviso «versione archiviata» — fatto. Tag `landing-v1` creato in locale (push rifiutato 403: da pushare dall'utente)
- [x] B1 (S) Base Eleventy 3: `package.json`, `eleventy.config.js`, `.nvmrc`, struttura `src/`
- [x] B2 (S) i18n IT/EN/ES con URL per lingua, `lang-switch` a link, `hreflang`
- [x] B3 (S) Design system: token CSS chiaro/scuro, layout `base.njk`, componenti card/breadcrumbs
- [x] B4 (S) `catalog.js`: unisce `content/generated` + `content/curated`, filtra voci per `pubblica_dal`, noindex sulle schede solo programmate
- [x] B5 (S) Scheda brano: In breve, facade video + selettore voce, capitoli, note, testo/traduzioni, spartito, correlati
- [x] B6 (S) Liste: compositori, opere/raccolte, generi, stagioni, linee (coro/arie/metodi), home
- [x] B7 (S) Ricerca Pagefind con UI accessibile (filtri, aria-live, stato in URL)
- [x] B8 (S) SEO: JSON-LD (WebSite, Organization, MusicComposition, VideoObject, Breadcrumb, Person, ItemList), sitemap con hreflang, robots, llms.txt, feed Atom, OG
- [x] B9 (H) Pagine istituzionali IT/EN/ES: come funziona, fonti e licenze, chi siamo, privacy, trasparenza affiliazioni
- [x] B10 (H) Componenti `ad-slot` e `affiliate` dietro `site.ads.enabled = false`
- [x] B11 (S) `scripts/validate-content.mjs` (ajv) + schema
- [x] B12 (S) CI `.github/workflows/deploy.yml`: validazione, build, Pagefind, html-validate, pa11y/axe, link check, deploy Pages; cron giornaliero
- [x] B13 (S) Verifica: Playwright (ricerca, filtri, voce, lingua, tastiera), screenshot 375/1280 chiaro/scuro, Lighthouse
- [x] B14 (H) README sito + `docs/CONTENUTI.md`

## Rifiniture emerse

- [x] R1 (H) Footer: includere `info-links.njk`; breadcrumb e riga autore della scheda: link a compositore e opera quando esistono le pagine (B6)
- [x] R2 (H) Selettore voce di arie/metodi: le sigle A/M/B (alta/media/bassa) si confondono con Alto/Basso: usare le parole intere
- [x] R3 Testi cantati: decisione utente 2026-10-16 = testo completo, con la fonte citata e linkata (già così)
- [x] R4 (S) Pipeline: «Lead Me Lord - Samuel Sebastian Wesley» resta col nome nel titolo (compositore fuori registro, nome preso dal titolo ma non tolto dal titolo): `titolo_pulito` deve togliere anche il nome scelto fra i candidati
- [x] R5 (S) `workTranslation` nel JSON-LD e ItemList sulle pagine di elenco

## C — Contenuti editoriali (costano token: stima prima di partire)

- [ ] C1 (O) (rimandato dall'utente, 2026-10-16) Traduzioni dei 19 testi comuni (`testi/_comuni`) in IT/EN/ES/DE/FR
- [ ] C2 (S) Note dei brani con video pubblici

## Manuale (utente)

- [x] M1 GitHub → Settings → Pages → Source → «GitHub Actions» (fatto dall'utente il 2026-10-16, prima del merge)

## P — Player di studio, Fase 1 (ok dell'utente 2026-10-16)

- [~] P1 (S) AIVideoCreator `job_sito_player`: manifest, sync.json dal modello di tempo dei video, copia del MusicXML, audio Opus/MP3 in `VOCEAVOCE_AUDIO_DIR` + test (Locus iste, Ave verum)
- [x] P2 (H) Sito: `.gitignore` audio, `.env.example`, `scripts/upload-audio.mjs` (rclone, dry-run, nessuna cancellazione senza conferma, verifica HEAD)
- [~] P3 (S) Player: Web Audio + SoundTouch, mixer, loop, tempo, `resolveAudioUrl`, flag delle funzioni
- [~] P4 (S) Partitura Verovio dal MusicXML con battuta corrente evidenziata, mobile-first
- [ ] P5 (H) PWA: manifest + service worker che non mette in cache l'audio
- [ ] P6 (H) `docs/player.md`, `docs/r2-setup.md` (con la policy CORS)
- [ ] P7 (S) Verifica su telefono (emulazione) e desktop, sincronia controllata a orecchio dall'utente
