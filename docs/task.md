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
- [ ] A8 (S) primo export reale verso `voceavoce/site/content/generated/` + commit slug in roadmap — il branch è su main dal 2026-10-16: da lanciare sul PC dell'utente con lo STAGE 5 della skill
- [~] A9 (S) (ok utente 2026-10-17) Testi cantati nell'export (T-906, branch `claude/voceavocecoro-video-portal-s3o8vi` di AIVideoCreator): ripiego sui testi comuni `_comuni/`, anomalie (surrexit senza testo, «Testo» in testa), `slug_sito` salvati in roadmap; elenco dei brani usciti ancora senza testo → ricerca con gli strumenti del gate dei testi

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

- [ ] C1 (O) (dopo A9; decisione utente 2026-10-17: le traduzioni non rivista si pubblicano con l'etichetta «non rivista», campo `reviewed: false`) Traduzioni dei 19 testi comuni (`testi/_comuni`) in IT/EN/ES/DE/FR
- [ ] C2 (S) Note dei brani con video pubblici
- [ ] C3 (S) Interfaccia in **DE e FR** (decisione utente 2026-10-17: insieme a C1/C2, non prima): `de.json`/`fr.json` (316 testi ciascuno), 5 pagine istituzionali per lingua, percorsi localizzati, etichette di generi e stagioni, `site.langs`; note dei brani anche in DE/FR **nella pipeline** (decisione utente 2026-10-17: `nota_descrizione` del contratto estesa a de/fr, `_NOTA_LINGUE` in `sito.py`; servono anche alle localizzazioni YouTube), così le schede DE/FR nascono complete e non sono contenuto sottile (~730 → ~1.200 pagine)

## Manuale (utente)

- [x] M1 GitHub → Settings → Pages → Source → «GitHub Actions» (fatto dall'utente il 2026-10-16, prima del merge)

## P — Player di studio, Fase 1 (ok dell'utente 2026-10-16)

- [x] P1 (S) AIVideoCreator `job_sito_player`: manifest, sync.json dal modello di tempo dei video, copia del MusicXML, audio Opus/MP3 in `VOCEAVOCE_AUDIO_DIR` + test (Locus iste, Ave verum)
- [x] P2 (H) Sito: `.gitignore` audio, `.env.example`, `scripts/upload-audio.mjs` (rclone, dry-run, nessuna cancellazione senza conferma, verifica HEAD)
- [x] P3 (S) Player: Web Audio + SoundTouch, mixer, loop, tempo, `resolveAudioUrl`, flag delle funzioni
- [x] P4 (S) Partitura Verovio dal MusicXML con battuta corrente evidenziata, mobile-first
- [x] P5 (H) PWA: manifest + service worker che non mette in cache l'audio
- [x] P6 (H) `docs/player.md`, `docs/r2-setup.md` (con la policy CORS)
- [x] P9 (S) Worker `workers/audio/` (GET/HEAD/OPTIONS, Range, ETag, Cache-Control, CORS, 404 pulito, punto unico per il futuro controllo premium) + `wrangler.toml` senza segreti + test; `site.audioBase` di produzione = URL workers.dev
- [x] P10 (H) `docs/r2-setup.md` riscritto: bucket privato, binding nel Worker, deploy con wrangler, test con curl (anche Range); futuro audio.voceavoce.com solo con i nameserver, posta Aruba da copiare prima
- [x] P7 (S) Verifica su telefono (emulazione) e desktop, sincronia controllata a orecchio dall'utente
- [ ] P8 (O) Pipeline, da decidere con l'utente: con una sola corona a metà brano `choir._timing_regions` la tratta come corona finale e mette lì l'allargando finale (es. Locus iste, b. 28-29). Riguarda anche i video già pubblicati
- [x] P11 (S) [FATTO nel codice, resta la verifica a orecchio: compensazione col tempo udibile + bypass dello stretcher a 1x, vedi player.md] Latenza audio: il suono esce 75–150 ms dopo l'evidenziazione della battuta (buffer di SoundTouch + latenza d'uscita del dispositivo). Compensare l'evidenziazione con la latenza misurata (`AudioContext.outputLatency` / `baseLatency` + latenza dello stretcher); poi verifica a orecchio dell'utente

## Q — Robustezza (Fase 3, ok dell'utente 2026-10-16)

- [x] P12 (S) Test end-to-end Playwright in `tests/e2e/` (PWA + player), partendo dalle bozze in `tools/verifica-manuale/`; audio sintetici generati al momento del test, mai nel repo — FATTO: `tests/e2e/{helpers,player.spec,pwa.spec}.mjs`, 18 test, `npm run e2e`
- [x] P13 (S) Test dell'aggiornamento del service worker (versione nuova → cache vecchie cancellate, audio sempre fuori dalla cache)
- [x] P14 (H) `npm run e2e` nel workflow Check (solo PR), con l'installazione di Chromium da Playwright in CI
- [x] P15 (S) Test e2e automatico evidenziazione ↔ clic UDIBILE (ex `tools/verifica-manuale/measure.mjs`) a 1×/0,75×/0,5×, che deve fallire se si toglie la compensazione della latenza (richiesta utente 2026-10-17) — FATTO: `tests/e2e/sync-audio.spec.mjs`, 3 test; errore mediano con compensazione −5…+26 ms, senza compensazione −46…−116 ms (il test fallisce, come deve)

## Statistiche visite

- [x] S1 (2026-10-17) Scelta dell'utente: **Google Search Console + Cloudflare Web Analytics** (senza cookie). Fatto: interruttore `CLOUDFLARE_ANALYTICS_TOKEN` in `src/_data/site.js` (script solo nella build di produzione), pagine Privacy IT/EN/ES che si aggiornano da sole col token, guida `docs/statistiche.md` (richiamata da r2-setup.md §2)

## Da fare dall'utente (sul proprio PC)

- [ ] U1 AIVideoCreator su `main`: `runtime\venv\Scripts\python.exe -m pytest tests/ -q` (suite completa; rossi noti solo test_monetizable e test_svs_gate)
- [ ] U2 `.env` di AIVideoCreator: `VOCEAVOCE_SITE_DIR=<clone di voceavoce/site>` (e facoltativo `VOCEAVOCE_AUDIO_DIR`)
- [ ] U3 `job_sito_player --brano 002 --brano 475 --scrivi` (stem veri → Opus/MP3 + dati del player)
- [ ] U4 Prova in locale (`node scripts/serve-audio.mjs` + `npm run serve`) e ascolto della sincronia, in cuffia e in Bluetooth
- [ ] U5 Cloudflare secondo `docs/r2-setup.md`: bucket privato, token, rclone, `npx wrangler deploy` del Worker, URL vero in `AUDIO_BASE_PRODUZIONE` (`src/_data/site.js`), caricamento con `scripts/upload-audio.mjs`
- [ ] U8 Statistiche secondo `docs/statistiche.md`: Search Console (TXT su Aruba, solo aggiunta; sitemap), Cloudflare Web Analytics (token in `CLOUDFLARE_ANALYTICS_TOKEN`). Da fare insieme a U5
- [ ] U6 Decidere P8 (corona singola, Locus iste) e la licenza dei voicebank Synth V per il futuro download
- [ ] U7 Facoltativo: `git tag landing-v1 c50b793 && git push origin landing-v1`
