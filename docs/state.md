# State — avanzamento e decisioni

Aggiornato: 2026-10-16

## Decisioni prese (utente)

- Hosting invariato: GitHub Pages da `voceavoce/site`, dominio voceavoce.com.
- Stack: Eleventy + Pagefind, build e deploy con GitHub Actions.
- Lingue: interfaccia IT/EN/ES con URL separati; testi cantati anche in DE/FR.
- Backup della landing attuale: tag `landing-v1` + copia in `/classic/` (noindex).
- **Niente YouTube API** (quota e crediti): i dati del sito li esporta la pipeline AIVideoCreator da ciò che ha già in git (roadmap, contratti, compositori, testi, verifiche).
- Lavoro su branch `claude/voceavocecoro-video-portal-s3o8vi` in entrambi i repo; commit e push a ogni punto fermo.
- Esecuzione dei task con sotto-agenti Sonnet/Haiku in base alla difficoltà; questo file e `task.md` li aggiorna solo l'agente principale.

- Video **incorporati direttamente** nelle schede (iframe `youtube-nocookie.com`, `loading="lazy"`, niente autoplay) invece della facade da cliccare (utente 2026-10-16). Conseguenza: YouTube può scrivere dati nel browser appena la scheda si apre; la pagina privacy va scritta di conseguenza.

## Fatti accertati

- La pipeline non chiama API AI: i metadati YouTube sono template Python (`choir_publish.py`, `metadati_seo.py`). L'export costa zero token.
- Roadmap: 489 brani coro, 31 arie, 3 metodi. Video pubblici oggi: 37 voci (9 brani); circa 570 voci programmate.
- Solo il tema chiaro è prodotto: niente selettore chiaro/scuro dei video.
- Capitoli e durata stanno solo in `runtime/` (macchina RENDER): vanno copiati in roadmap (task A4).
- Il genere non esiste nel contratto: campo facoltativo `genere` + regola deterministica.

## Avanzamento

- 2026-10-16 — Piano approvato. Scritti in AIVideoCreator `common/sito.py` e `cli/job_sito_esporta.py` (non ancora committati). Primo dry-run: 142 schede (140 coro, 1 aria, 1 metodo), 41 visibili oggi, 93 compositori. Pulizia di titoli e compositori in corso; la regex `_TRATTINO` in `sito.py` è da correggere (il modulo al momento non si importa).
- 2026-10-16 — Accesso GitHub sistemato dall'utente. Regex corretta, commit WIP `T-905` pushato su AIVideoCreator (branch `claude/voceavocecoro-video-portal-s3o8vi`). Dati di esempio reali copiati in `content/generated/` del sito (142 schede, 70 compositori, 7 opere/raccolte): servono a sviluppare il sito, saranno rigenerati dal primo export ufficiale (A8), che salverà anche gli slug in roadmap.
- 2026-10-16 — Tag `landing-v1` creato su `c50b793`, ma il push del tag è rifiutato (403: l'ambiente permette solo il branch di lavoro). Per pubblicarlo, dal tuo computer: `git tag landing-v1 c50b793 && git push origin landing-v1`.
- 2026-10-16 — Organizzazione del lavoro: i sotto-agenti modificano i file ma non fanno commit; commit, push e aggiornamento di `task.md`/`state.md` li fa l'agente principale.
- 2026-10-16 — B0 fatto (Haiku): landing archiviata in `src/static/classic/` (servita su /classic/), verificata via HTTP (noindex presente, asset 200).
- 2026-10-16 — A5-A7 fatti (Haiku): campo `genere` nello `_schema` del contratto, `VOCEAVOCE_SITE_DIR` in `.env.example`, STAGE 5 «Aggiorna il sito» nella skill `voceavoce-publish-choir`, riga in `CLAUDE.md`, voce T-905 in `tasks.md`. Commit pushato su AIVideoCreator.
- 2026-10-16 — A3-A4 fatti (Sonnet): 27 test in `tests/test_sito_esporta.py` (85 passati coi test di roadmap e complete_metadata). Da ora `job_choir_complete_metadata` salva in roadmap `capitoli` e `durata_sec` di ogni voce pubblicata. Limite noto: un compositore scritto in coda al titolo con un alias non elencato tra le `varianti` (es. «S. S. Wesley») resta nel titolo; si corregge aggiungendo la variante in `compositori.yaml`.
- 2026-10-16 — B1-B3 fatti (Sonnet): Eleventy 3, IT alla radice + /en/ /es/ con hreflang e canonical, design system chiaro/scuro (contrasti AA: testo 16.5/15.2:1, accento 7.1/10.8:1; sul chiaro l'ambra dei testi è scurita a #7a4a00 perché #ffc24d su chiaro dà 1.5:1), home in 3 lingue, html-validate 0 errori, nessuno scroll orizzontale a 375/1280. Corretto un testo ereditato dalla landing: «ogni brano in versione chiara e scura» era falso (la pipeline produce solo il tema chiaro), sostituito con la struttura reale della lezione. Il menu punta a pagine non ancora create (B6/B7). Font dei titoli: serif di sistema per ora.
- 2026-10-16 — B9-B10 fatti (Haiku): 5 pagine istituzionali × 3 lingue in `src/pages/info/` (privacy aggiornata al player incorporato), componenti `ad-slot` e `affiliate` spenti, etichette in `src/_data/labels.js`, html-validate 0 errori. Allineato `affiliate.njk` al formato dei file curati (`vendor`, `url`, `label`, `enabled`). Da fare: includere `info-links.njk` nel footer e i due componenti nella scheda.
- 2026-10-16 — B11-B12 fatti (Sonnet): `scripts/validate-content.mjs` + schemi JSON (brano, curato), 9 test; `npm run check` = validate + test + build + lint:html; workflow `deploy.yml` (main, avvio manuale, cron 04:15 UTC giornaliero, Pagefind, pa11y/axe, deploy Pages) e `check.yml` (PR e altri branch, senza deploy). pa11y sulle 3 home: 0 errori. Il deploy parte solo dopo il merge su main e il passaggio di Pages a «GitHub Actions» (M1).
