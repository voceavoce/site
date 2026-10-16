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
- [ ] A8 (S) primo export reale verso `voceavoce/site/content/generated/` + commit slug in roadmap

## B — Sito (`voceavoce/site`, branch `claude/voceavocecoro-video-portal-s3o8vi`)

- [x] B0 (H) Backup: copia landing in `src/static/classic/` con `noindex`, canonical, og:image assoluto, avviso «versione archiviata» — fatto. Tag `landing-v1` creato in locale (push rifiutato 403: da pushare dall'utente)
- [x] B1 (S) Base Eleventy 3: `package.json`, `eleventy.config.js`, `.nvmrc`, struttura `src/`
- [x] B2 (S) i18n IT/EN/ES con URL per lingua, `lang-switch` a link, `hreflang`
- [x] B3 (S) Design system: token CSS chiaro/scuro, layout `base.njk`, componenti card/breadcrumbs
- [x] B4 (S) `catalog.js`: unisce `content/generated` + `content/curated`, filtra voci per `pubblica_dal`, noindex sulle schede solo programmate
- [x] B5 (S) Scheda brano: In breve, facade video + selettore voce, capitoli, note, testo/traduzioni, spartito, correlati
- [~] B6 (S) Liste: compositori, opere/raccolte, generi, stagioni, linee (coro/arie/metodi), home
- [ ] B7 (S) Ricerca Pagefind con UI accessibile (filtri, aria-live, stato in URL)
- [x] B8 (S) SEO: JSON-LD (WebSite, Organization, MusicComposition, VideoObject, Breadcrumb, Person, ItemList), sitemap con hreflang, robots, llms.txt, feed Atom, OG
- [x] B9 (H) Pagine istituzionali IT/EN/ES: come funziona, fonti e licenze, chi siamo, privacy, trasparenza affiliazioni
- [x] B10 (H) Componenti `ad-slot` e `affiliate` dietro `site.ads.enabled = false`
- [x] B11 (S) `scripts/validate-content.mjs` (ajv) + schema
- [x] B12 (S) CI `.github/workflows/deploy.yml`: validazione, build, Pagefind, html-validate, pa11y/axe, link check, deploy Pages; cron giornaliero
- [ ] B13 (S) Verifica: Playwright (ricerca, filtri, voce, lingua, tastiera), screenshot 375/1280 chiaro/scuro, Lighthouse
- [ ] B14 (H) README sito + `docs/CONTENUTI.md`

## Rifiniture emerse

- [x] R1 (H) Footer: includere `info-links.njk`; breadcrumb e riga autore della scheda: link a compositore e opera quando esistono le pagine (B6)
- [~] R2 (H) Selettore voce di arie/metodi: le sigle A/M/B (alta/media/bassa) si confondono con Alto/Basso: usare le parole intere
- [x] R3 Testi cantati: decisione utente 2026-10-16 = testo completo, con la fonte citata e linkata (già così)

## C — Contenuti editoriali (costano token: stima prima di partire)

- [ ] C1 (O) Traduzioni dei 19 testi comuni (`testi/_comuni`) in IT/EN/ES/DE/FR
- [ ] C2 (S) Note dei brani con video pubblici

## Manuale (utente)

- [x] M1 GitHub → Settings → Pages → Source → «GitHub Actions» (fatto dall'utente il 2026-10-16, prima del merge)
