# State — avanzamento e decisioni

## Riepilogo per riprendere (aggiornato 2026-10-16, fine sessione)

- **Online:** il nuovo sito Eleventy è su voceavoce.com (PR #1 unita, Deploy verde); la vecchia landing è su `/classic/`.
- **Branch del sito:** `claude/voceavocecoro-video-portal-s3o8vi`. Contiene la Fase 2, cioè il player di studio, NON ancora unita su `main`. Ultimo commit pulito: P11 (`c7be018`), poi questo aggiornamento. Check e a11y sono verdi in locale (81 test, 11/11).
- **AIVideoCreator:** T-905 unito su `main` (`80f43da`): `job_sito_esporta` (catalogo) e `job_sito_player` (player). Il branch omonimo resta solo come riferimento.
- **Player (Fase 2, codice completo):**
  - Web Audio a 24 kHz mono, un GainNode per voce, un solo SoundTouch (scavalcato a 1×);
  - evidenziazione compensata per la latenza (`src/assets/js/study/latency.js`, tabella misurata offline: 133/123/94 ms a 1×/0,75×/0,5×);
  - Verovio dal MusicXML;
  - PWA con un SW che non tocca mai l'audio;
  - dati di prova `content/player/_prova/` esclusi dalla build di produzione.
- **Audio:** MAI in git né in CI. Cartella locale `VOCEAVOCE_AUDIO_DIR` → `scripts/upload-audio.mjs` (rclone, a mano) → bucket R2 **privato** `voceavoce-audio` → Worker `workers/audio/` su `*.workers.dev` (deploy a mano con wrangler).
- **Segnaposto da sostituire:** `AUDIO_BASE_PRODUZIONE` in `src/_data/site.js` vale ancora `https://voceavoce-audio.CAMBIAMI.workers.dev`. Finché non c'è l'URL vero e gli audio non sono caricati, NON aggiungere dati reali in `content/player/` e NON unire su `main` un player che punti al segnaposto.
- **Vincoli fissi dell'utente:**
  - dominio, DNS e posta su **Aruba**: MAI proporre il trasferimento della registrazione;
  - niente pubblicità (gli spazi esistono ma restano spenti), niente cookie di tracciamento;
  - niente YouTube API;
  - commit e push frequenti;
  - sotto-agenti Sonnet/Haiku; solo l'agente principale aggiorna `task.md` e `state.md`.
- **CI:** «Check» gira solo sulle PR (e a mano); «Deploy» su push a `main`, a mano e ogni giorno alle 04:15 UTC. Prima di ogni push con codice: `npm run check` e `npm run a11y` in locale (per a11y serve `PUPPETEER_EXECUTABLE_PATH` verso un Chromium).
- **Test:** `npm test` = 81 unit test; `npm run e2e` = 18 test end-to-end Playwright di player e PWA (build non di produzione in `_site-e2e`, dati `_prova`, audio sintetici in memoria), anche nel workflow Check sulle PR. Fase 3 (P12–P14) fatta il 2026-10-16.
- **Prossimo passo:** compiti dell'utente U1–U7 in `task.md` (audio veri, Cloudflare/Worker, URL vero al posto di `CAMBIAMI`), poi PR e merge del player su main.
- **Cose che l'utente fa sul suo PC:** sezione «Da fare dall'utente» in `task.md` (U1–U7).
- **Aperto:** P8, corona singola: `choir._timing_regions` tratta un'unica corona a metà brano come finale e ci mette l'allargando (Locus iste b. 28-29); riguarda anche i video pubblicati. C1–C2, traduzioni e note, rimandate. A8, primo export ufficiale con `slug_sito`, si fa con lo STAGE 5 della skill.


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

- Testi cantati pubblicati **completi**, con il sito di provenienza citato e linkato sotto il testo (utente 2026-10-16). L'esportatore li include solo se la musica è di pubblico dominio sicuro (compositore morto da più di 100 anni).

- Traduzioni e note editoriali (C1, C2) rimandate a più avanti (utente 2026-10-16).

- Player di studio (Fase 2): partitura dal MusicXML della pipeline (non .krn); prototipo su Locus iste e Ave verum K. 618; rallentamento con Web Audio + SoundTouch (piano B `preservesPitch`); spazi pubblicitari lasciati spenti (utente 2026-10-16). Implementazione in attesa dell'ok.

- **Dominio e posta su Aruba, non si toccano** (utente 2026-10-16): niente spostamento del DNS su Cloudflare per ora, e MAI il trasferimento della registrazione, che farebbe cessare la casella info@voceavoce.com. Gli audio li serve un Cloudflare Worker su `*.workers.dev` collegato al bucket R2 privato; il CORS sta nel Worker; il deploy del Worker lo fa l'utente con wrangler.

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

- 2026-10-16 — B4-B5 fatti (Sonnet): catalogo (`src/_lib/catalog.js`, logica pura testata) e scheda brano in 3 lingue: 426 pagine (142 × 3), di cui 102 brani noindex perché hanno solo voci programmate. Player incorporato (youtube-nocookie, lazy) con selettore voce; senza JS restano il primo video e i link alle altre voci. `npm run check` passa: validazione, 14 test, build di 444 pagine, html-validate 0 errori. Traduzioni con `reviewed` falso mostrate con l'etichetta «Traduzione non ancora rivista». Capitoli letti nel formato della pipeline (`sec`, `titolo`).

- 2026-10-16 — B8 + R1 fatti (Sonnet): JSON-LD (WebSite, Organization, MusicComposition, un VideoObject per voce uscita con capitoli come Clip, BreadcrumbList; 870 blocchi tutti JSON validi), sitemap con hreflang generata dall'HTML finale (141 URL: 41 schede indicizzabili oggi × 3 lingue + home e pagine istituzionali; noindex e /classic/ esclusi), robots.txt con crawler AI ammessi (`site.aiCrawlers`), llms.txt, feed Atom per lingua, og:image della scheda = miniatura YouTube. Footer con le pagine istituzionali. Non ancora fatti: `workTranslation` e ItemList delle liste. Commit fatto con `npm run check` verde, includendo anche il lavoro di B6 ancora in corso.

- 2026-10-16 — L'utente ha impostato Pages → Source = «GitHub Actions». Il sito attuale resta online con l'ultimo deploy finché il merge su `main` non avvia `deploy.yml`.

- 2026-10-16 — B6 + R2 fatti (Sonnet): pagine di elenco in 3 lingue (indici coro/arie/metodi/autori/opere/generi/stagioni + dettagli: 70 autori, 7 opere, 5 generi, 4 stagioni), Concone come percorso ordinato, home con Ultimi video / In arrivo / Sfoglia il catalogo, link a compositore e opera nella scheda, parole intere per i registri delle arie. Brani solo programmati: in «In arrivo» senza link; pagine di dettaglio senza video visibili: noindex. `npm run check` verde: 26 test, 723 pagine HTML valide, 291 URL in sitemap.

- 2026-10-16 — R4 fatto (Sonnet), commit `421ede2` su AIVideoCreator: titoli senza il nome del compositore anche fuori registro (alias e stesso cognome). Cambiano 2 slug, nessuno ancora salvato in roadmap: `handl-gallus-quod-chorus-vatum` → `quod-chorus-vatum-gallus`, `lead-me-lord-samuel-sebastian-wesley` → `lead-me-lord-wesley`. I dati del sito vanno rigenerati dopo B7.

- 2026-10-16 — CI «Check» rossa dal commit `5a6c69f`: fallisce solo il controllo di accessibilità (contrasto delle sigle voce e del ♪ nelle card senza miniatura; regola axe `frame-tested` sull'iframe YouTube, da escludere perché cross-origin). Correzione affidata all'agente di B7. Regola da ora: prima di ogni push con codice, oltre a `npm run check` lanciare anche `npm run a11y`.

- 2026-10-16 — B7 fatto (Sonnet): ricerca Pagefind in 3 lingue (/cerca/, /en/search/, /es/buscar/) con filtri compositore/linea/voce/stagione/genere, conteggio aria-live, stato nell'URL, campo di ricerca nella home; indicizzate solo le schede pubblicabili (41 per lingua). Corretti gli errori di accessibilità della CI (contrasto sigle voce e ♪ delle card; `frame-tested` escluso per l'iframe YouTube) e lo script `npm run a11y` che restava appeso. Verificato: `npm run check` verde, pa11y/axe 10/10 pagine 0 errori. Dati del sito rigenerati dalla pipeline (R4): 2 slug cambiati, i compositori ora portano anche gli `alias` del registro.

- 2026-10-16 — CI «Check» tornata verde sul commit `de1f830`.
- 2026-10-16 — A8 (primo export ufficiale con `slug_sito` salvato in roadmap) rimandato di proposito: scrivere `slug_sito` nelle roadmap su questo branch creerebbe conflitti con le roadmap che la pipeline aggiorna su `main` di AIVideoCreator. Si fa dopo il merge del branch di AIVideoCreator, con lo STAGE 5 della skill `/voceavoce-publish-choir`.

- 2026-10-16 — R5 fatto (Sonnet): `workTranslation` nella scheda (testo solo per traduzioni con `reviewed: true`), CollectionPage + ItemList sulle pagine di elenco indicizzabili, Person sulla pagina del compositore, CreativeWorkSeries/MusicComposition per raccolte e opere; 1317 blocchi JSON-LD tutti validi. B14 fatto (Haiku): README in inglese e guida `docs/CONTENUTI.md` in italiano. Allineato lo schema dei file curati al codice (`generi`, `label`, `enabled`, `percorsi`, `reviewed` booleano; campi sconosciuti ora sono errore). Tolti dalla radice `index.html`, `style.css`, `CNAME`, `.nojekyll` della vecchia landing: non servono più (la landing è in `src/static/classic/`, il CNAME in `src/static/`). Verificato: check verde (31 test), a11y 10/10.

- 2026-10-16 — B13 fatto (Sonnet), verifica finale: 96 combinazioni Playwright (3 lingue × 8 tipi di pagina × 375/1280 × chiaro/scuro) senza scroll orizzontale, errori console o 404 locali; 23149 link interni e 2178 link di cambio lingua, 0 rotti; tastiera ok (skip link, menu, lingua, tema persistente, selettore voce, ricerca); Lighthouse home 100/100/96/100 desktop e 99/100/96/100 mobile, scheda 100/100/100/100 (il 96 di best practices dipende solo dalle miniature YouTube bloccate in questo ambiente); 294 URL in sitemap, tutti con canonical e hreflang validi; CSS 29 KB, JS 1–3 KB per pagina (10 KB la ricerca, Pagefind escluso). Corretti: «licenza —» nel riquadro In breve quando la licenza manca; `llms.txt` con nomi leggibili delle sezioni e descrizione corretta del progetto (prima diceva «coro virtuale» e citava traduzioni non ancora presenti).

- 2026-10-16 — Aperta la pull request https://github.com/voceavoce/site/pull/1 verso `main`. Il merge lo fa l'utente.

- 2026-10-16 — PR #1 unita dall'utente (`bb36fe5`). Workflow Deploy verde: il nuovo sito è online su voceavoce.com. Il branch di lavoro riparte da `main` per la Fase 2.

- 2026-10-16 — P2 fatto (Haiku): `.gitignore` per gli audio, `.env.example` fittizio, `scripts/upload-audio.mjs` (rclone `copy` per default con un passaggio per estensione e Content-Type corretto; `--sync` solo dopo anteprima e conferma digitando il nome del bucket; credenziali solo come variabili d'ambiente; rifiuto se la cartella audio è dentro il repo e non ignorata; verifica HEAD finale), `scripts/serve-audio.mjs` (server di sviluppo con Range e CORS solo per localhost). 17 test. Da provare con rclone vero: qui rclone non c'è.

- 2026-10-16 — P1 fatto (Sonnet), commit `80f43da` su AIVideoCreator: `job_sito_player` scrive manifest, sync e partitura in `content/player/<slug>/` e gli audio (Opus mono 64k + MP3 di riserva) in `VOCEAVOCE_AUDIO_DIR`. Il sync usa `choir._timing_regions` e `_time_at`, le stesse funzioni di stem, cursore e durata. `t` include i 0,5 s di LEAD_IN, perché `job_svs_adopt` li lascia in testa agli stem Synth V; all'accompagnamento (FluidSynth, senza lead-in) si aggiungono 0,5 s in conversione. Stem cercati in `runtime/inbox/choir/<job>/stems/<V>.svs.wav|flac` e `accompaniment.wav`. Prove: 002 Locus iste 63 bpm, 48 battute, 189,6 s, una corona a b. 29; 475 Ave verum 72 bpm, 46 battute, 158,3 s. 79 test. Da verificare sulla macchina RENDER: durate reali degli stem e sincronia all'ascolto. Trovato un comportamento esistente della pipeline: una sola corona a metà brano viene trattata come finale e l'allargando finale finisce lì (task P8, da decidere).

- 2026-10-16 — P3+P4 fatti (Sonnet): pagina `/player/<slug>/` in 3 lingue. Web Audio: decodifica a 24 kHz mono, un GainNode per traccia, un solo SoundTouchNode (`@soundtouchjs/audio-worklet` 2.1.1, MPL-2.0) sul mix; loop nativo senza vuoti. Mixer con muta, solo e «La mia voce». Partitura Verovio (LGPL, 7 MB, circa 2,3 MB compressa, caricata solo nel player) con la battuta corrente evidenziata e il tocco per spostarsi o scegliere il loop. Prove Playwright: sincronia, velocità 0,75 con intonazione invariata (soprano 393 → 390 Hz), loop. Dati di prova `content/player/_prova/` esclusi dalla build di produzione (`ELEVENTY_ENV=production` nel deploy). Check verde (57 test), a11y 11/11. I dati reali di Locus iste e Ave verum NON entrano ancora nel sito: senza audio su R2 il player sarebbe rotto in produzione. Vanno aggiunti con `job_sito_player --scrivi` dopo il primo caricamento.

- 2026-10-16 — P5 fatto (Sonnet): PWA con `/manifest.webmanifest`, icone rigenerate dall'avatar 800 px, `/sw.js` (navigazioni network-first con pagina `/offline/`, asset stale-while-revalidate, audio, Range, cross-origin, `*.workers.dev` e host di `site.audioBase` mai intercettati); provata offline vera fermando il server. Scelta mia: Verovio (7 MB) NON è nel precache, altrimenti ogni visitatore lo scaricherebbe; entra in cache alla prima apertura del player. P9 fatto (Sonnet): Worker `workers/audio/` (GET/HEAD/OPTIONS, 405, Range 206/416, 304, CORS solo per le origini ammesse, 404 senza elenco, `authorize()` unico punto per il premium, nessuna cache d'edge), `wrangler.toml` senza segreti, 11 test. `site.audioBase` di produzione = costante `AUDIO_BASE_PRODUZIONE` in `src/_data/site.js`, oggi segnaposto `https://voceavoce-audio.CAMBIAMI.workers.dev`, da sostituire dopo il primo `wrangler deploy`. Check verde (75 test), a11y 11/11.

- 2026-10-16 — P10 fatto (Sonnet): `docs/r2-setup.md` riscritto per il Worker (bucket privato, nessuna CORS nel bucket, deploy con wrangler, test con curl compreso Range, futuro solo con i nameserver e la posta Aruba copiata prima; il divieto di trasferire la registrazione è in evidenza). Da verificare dal vivo: limiti del piano gratuito, voci di menu del pannello Cloudflare, `wrangler dev --remote`, percorso locale di AIVideoCreator.

- 2026-10-16 — CI rossa dal commit `b0b4b68`: la regola `audio/` del `.gitignore` escludeva anche `workers/audio/`, quindi il codice del Worker non era mai entrato in git e in CI il suo test non trovava il modulo (in locale passava perché i file c'erano). Corretto ancorando le regole alla radice (`/audio/`, `/audio-local/`) e aggiungendo il Worker. Lezione: dopo ogni modifica al `.gitignore` controllare `git status --ignored`. I run `WIP` dei salvataggi automatici possono risultare rossi perché fotografano lavoro a metà.

- 2026-10-16 — Workflow «Check» ora solo sulle pull request (e avvio manuale), per scelta dell'utente: niente CI a ogni push del branch di lavoro. Prima di aprire una PR lanciare in locale `npm run check` e `npm run a11y`.

- 2026-10-16 — P6 fatto e P7 quasi (Sonnet): `docs/player.md` completo (architettura, flusso di pubblicazione, licenze, limiti). Verifica sul vero Locus iste (48 battute, audio sintetici di 189,6 s): evidenziazione contro sync 3–19 ms a 1× e 0,75×, dopo un seek e dentro un loop; mobile senza scroll orizzontale; tastiera e ARIA ok; memoria: buffer 73 MB teorici, heap JS 164 MB. Build di produzione senza player di prova né audio. Corretto: la barra fissa copriva il footer. Aperto (P11): il suono esce 75–150 ms DOPO l'evidenziazione per la latenza di SoundTouch e del dispositivo.

- 2026-10-16 — Branch di AIVideoCreator portato su `main` (fast-forward a `80f43da`, 5 commit T-905; autorizzazione dell'utente, nessun render in corso). Test toccati qui: 137 verdi. Da lanciare sul PC dell'utente: la suite completa `runtime\venv\Scripts\python.exe -m pytest tests/ -q`. Ora si può fare A8 (primo export ufficiale con `slug_sito` in roadmap) con lo STAGE 5 della skill `/voceavoce-publish-choir`.

- 2026-10-16 — P11 fatto (Sonnet): latenza dello stretcher misurata offline (133 ms a 1×, 123 a 0,75×, 94 a 0,5×) e messa in tabella; l'evidenziazione usa il tempo «udibile» = motore − (latenza stretcher + outputLatency). A 1× lo stretcher viene scavalcato (ramo diretto, dissolvenza di 40 ms). Misure evidenziazione contro clic udibile: prima −190…−225 ms, dopo circa ±25 ms (un caso −48 dopo un seek a 1×), anche nel loop e cambiando velocità al volo. Pausa: riparte da ciò che si è sentito. Check verde (81 test), a11y 11/11. Resta la prova a orecchio dell'utente, in cuffia e in Bluetooth. Fase 1 del player COMPLETA lato codice.
- 2026-10-16 — **Fase 3 fatta (P12–P14):** test end-to-end Playwright in `tests/e2e/` (13 player + 5 PWA, compreso l'aggiornamento del SW che cancella le cache `vav-*` vecchie e l'audio mai in cache con Range e workers.dev), `npm run e2e`, passo nel workflow Check con report caricato se fallisce. 3 run di fila verdi (~45 s). Nessun bug trovato in player o SW. `@playwright/test` fissato a 1.56.1 (stessa versione del Chromium in /opt/pw-browsers).

## Messa online (da fare quando il sito è pronto)

1. GitHub → `voceavoce/site` → Settings → Pages → Build and deployment → Source: da «Deploy from a branch» a **GitHub Actions**. Controllare Custom domain `voceavoce.com` ed Enforce HTTPS.
2. Merge del branch `claude/voceavocecoro-video-portal-s3o8vi` su `main` (pull request). Il push su `main` avvia `deploy.yml`.
3. Se il merge è avvenuto prima del passo 1: Actions → Deploy → Run workflow su `main`.
4. Verifica: workflow verde, voceavoce.com nuovo, voceavoce.com/classic/ con la vecchia landing.
5. Facoltativo, dal proprio computer: `git tag landing-v1 c50b793 && git push origin landing-v1`.

## Come riprendere in locale

1. Sito: `git clone https://github.com/voceavoce/site && cd site && git checkout claude/voceavocecoro-video-portal-s3o8vi && npm ci && npm run serve`.
2. Pipeline: in AIVideoCreator `git fetch && git checkout claude/voceavocecoro-video-portal-s3o8vi`.
3. Stato del lavoro: questo file (sezione Avanzamento) e `task.md`: `[~]` = in corso, `[ ]` = da fare.
4. I commit `WIP …` sono salvataggi automatici fatti ogni 10 minuti mentre gli agenti lavoravano: il codice può essere incompleto. Prima di continuare lancia `npm run check` (sito) e `pytest tests/test_sito_*.py` (pipeline).
5. Gli audio non sono mai nel repo: si rigenerano con `job_sito_player --scrivi` nella cartella `VOCEAVOCE_AUDIO_DIR`.
