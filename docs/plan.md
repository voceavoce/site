# Voce a Voce — da landing page a catalogo video ricercabile

## Contesto

**Dove è pubblicato oggi:** su **GitHub Pages**, dal branch `main` del repo `voceavoce/site`, con dominio personalizzato **voceavoce.com** (file `CNAME`; `.nojekyll` disattiva Jekyll). È confermato anche da `AIVideoCreator/docs/voceavoce-infrastruttura.md`.

Il sito di oggi è una sola pagina statica: `index.html`, `style.css` e 4 PNG in `assets/`.

**Perché cambiarlo:** il canale YouTube cresce. Oggi la roadmap conta 489 brani corali, 31 arie e 3 metodi (pilota Concone), con circa 700 video per voce tra pubblicati e programmati. La landing rimanda soltanto al canale.

Serve un catalogo strutturato, concettualmente "alla Choralia" ma con un'interfaccia moderna, che:
- presenti i video dentro **schede-brano**: spiegazione, testo, traduzioni, fonti;
- si possa sfogliare per autore, opera/raccolta, genere, stagione, voce e linea (coro / arie / metodi), e abbia una **ricerca interna**;
- sia accessibile (WCAG 2.2 AA), valido W3C e indicizzabile da motori di ricerca e AI;
- abbia già gli spazi per **banner** e **affiliazioni**, spenti finché non servono;
- resti statico, sullo stesso hosting.

**Problemi della landing attuale da non ripetere:**
- EN/ES sono iniettati via JS, quindi i motori di ricerca vedono solo l'italiano.
- `og:image` è relativo: le anteprime social non funzionano.
- Il cambio lingua usa `<button>` senza stato.
- I PNG arrivano a 2560×1440.
- Mancano sitemap, `robots.txt`, dati strutturati e canonical.

**Decisioni prese:**
- Eleventy + Pagefind, build e deploy con GitHub Actions.
- Interfaccia IT/EN/ES; testi cantati anche con traduzioni DE/FR.
- Backup: tag `landing-v1` + copia in `/classic/` (noindex).
- **Niente YouTube API:** i dati del sito li scrive la pipeline **AIVideoCreator**, partendo da ciò che ha già in git.

## Cosa offre già AIVideoCreator (verificato)

| Dato | Dove (in git) |
|---|---|
| ID video per voce, `publish_at`, `privacy`, stadio | `projects-instances/<linea>/roadmap/brani/<rank>.json` (scritto da `job_choir_complete_metadata._salva_stato` e da `job_choir_sync_schedule`) |
| Titolo, compositore, opera madre, stagione (`avvento-natale`, `pasqua`, `quaresima-passione`, `mariano`, `generico`), lingua, voicing, fonte, licenza, `nota_descrizione {it,en,es}` | contratto `…/render_settings.json` |
| Arie/metodi: `opera`, `numero`, `registro`, attribuzione | `projects-instances/{arie,metodi}/render_settings.json` |
| Compositori: nascita, morte, periodo, alias | `projects-instances/choir/compositori.yaml` (letto da `metadati_seo.compositore_info`) |
| Testi originali con fonti | `sources/pdmx/testi/*.json`, `testi/_comuni/`, `verses/`, `arie/testi_cantati/` |
| Edizioni di verifica IMSLP/CPDL | `sources/pdmx/verifiche/*.json` |
| Etichette multilingua, periodi, playlist | `testi_seo.yaml`, `metadati_seo.scheda_brano` |
| Modello da riusare | `scripts/cli/job_choir_esporta_scores.py`: esporta dati per un repo pubblico, include solo video `public`, non fa push |

**Cosa manca:**
- **genere**: non esiste come campo; si ricava, vedi sotto;
- **traduzioni dei testi cantati**;
- **capitoli**: oggi solo in `runtime/` sulla macchina RENDER, fuori da git;
- **varianti scure**: si produce solo il tema chiaro, quindi niente selettore chiaro/scuro;
- **ID playlist**: non vengono salvati.

**Implicazione:** l'esportatore è codice Python puro e costa **zero token e zero quota API**. Consumano token solo i contenuti scritti dall'agente (traduzioni, note); quelli li pianifichiamo a lotti, come chiede la regola di AIVideoCreator «operazioni costose: segnalarle prima».

---

## Parte A — AIVideoCreator: esportatore dei dati del sito

Nuovo CLI **`pipeline-core/scripts/cli/job_sito_esporta.py`**, sul modello di `job_choir_esporta_scores.py`. È puro, deterministico, testato.

- **Input:** le 3 linee definite in `scripts/common/linee.py` `LINEE`. Per ciascuna legge roadmap, contratto, `compositori.yaml`, testi, verifiche e, se presente, `testi_seo.yaml`. Se trova `runtime/output/…` (cioè gira sulla macchina RENDER), legge anche `chapters.txt` e la durata da `render_meta.json`.
- **Output:** scrive nella cartella `--out` (default: variabile `VOCEAVOCE_SITE_DIR` nel `.env`, altrimenti `runtime/tmp/site_export/`) dentro `content/generated/`:
  - `brani/<slug>.json`: un file per brano, con lo schema documentato in `content/generated/SCHEMA.md`;
  - `compositori.json`, `opere.json`, `indice.json` (con data di generazione e hash del commit della pipeline).
- **Regola di inclusione:** il brano entra se ha almeno una voce `public`, oppure una voce `private` con `publish_at` futuro. Per queste ultime l'ID viene esportato con `publish_at`, e il sito lo mostra solo dopo quella data. Un video privato non è comunque visibile a nessuno, quindi esportarne l'ID non rivela nulla. Escluse le voci in `voci_v1_eliminate` / `voci_sfasate_sostituite` e i brani con `hold_publish`.
- **Slug stabile:** generato al primo export da titolo e cognome del compositore (es. `locus-iste-bruckner`) e salvato una volta per tutte nel campo `slug_sito` della roadmap. Così, se il titolo viene corretto, l'URL non cambia e il posizionamento non si perde.
- **Genere, senza AI:** campo opzionale `genere` nel contratto. Se manca, una regola deterministica lo ricava:
  - linea `metodi` → *metodo-vocale*;
  - linea `arie` → *aria*, con il sottotipo dalla raccolta (es. *arie antiche*);
  - coro + lingua `la` → *sacro-latino*;
  - stagione `avvento-natale` → aggiunge il tag *natale*;
  - il periodo arriva da `compositori.yaml` (rinascimento / barocco / …).
  - La regola sta in una funzione pura con i suoi test.
- **Capitoli in git:** `job_choir_complete_metadata` gira già quando il video viene pubblicato. Aggiungo un passo che copia i capitoli di `chapters.txt` dentro `brani/<rank>.json` (`voci.<V>.capitoli`). Così entrano in git e l'export li trova da qualsiasi macchina.
- **Collegamento con la catena:** nuovo passo finale della skill `/voceavoce-publish-choir`. Lancia `job_sito_esporta --scrivi`, poi l'agente fa commit e push nel clone di `voceavoce/site` con messaggio `dati: export <data>`, come già avviene con `job_brand_assets --out`. Con `--dry-run` mostra solo cosa cambierebbe (brani aggiunti, rimossi, modificati).
- **Regole del repo AIVideoCreator da rispettare:**
  - CRLF ed encoding preservati;
  - commit `T-NN: …` (prendo il prossimo T libero in `tasks.md`) con push subito dopo;
  - modifiche al codice su un worktree / branch separato `claude/voceavocecoro-video-portal-s3o8vi`, merge su main solo a render fermi;
  - un test per ogni funzione, più un test sul file di configurazione realmente spedito.
- **Test (`tests/test_sito_esporta.py`):** inclusione ed esclusione per privacy e date, slug stabile, regola del genere, schema dell'output, idempotenza (stesso input → stessi byte), e nessuna voce eliminata che finisca nell'export.

### Contenuti editoriali (gli unici che costano token, a lotti)

File curati nel repo del sito: **`content/curated/<slug>.yaml`**. L'export non li tocca mai. Contengono:
- note sul brano per lingua (partendo da `nota_descrizione`, che esiste già);
- traduzioni del testo (`it/en/es/de/fr`, ognuna con `credit`, `license: CC BY 4.0` e `reviewed`);
- eventuale genere corretto a mano, link agli spartiti in affiliazione, percorsi di studio.

**Priorità:** prima i brani con video pubblici (oggi circa 10), poi quelli programmati man mano che escono. I testi liturgici ricorrenti (`testi/_comuni/`, 19 file) si traducono **una volta sola** e valgono per tutti i brani che li usano. Il risparmio è grande, perché tanti brani usano Gloria, Ave Maria, Magnificat.

Una scheda senza traduzione resta perfettamente valida: mostra solo l'originale.

---

## Parte B — Il nuovo sito (`voceavoce/site`, branch `claude/voceavocecoro-video-portal-s3o8vi`)

### Struttura degli URL

L'italiano resta alla radice, così l'URL di oggi non perde valore; `/en/` e `/es/` sono le varianti.

| Pagina | IT | EN | ES |
|---|---|---|---|
| Home | `/` | `/en/` | `/es/` |
| Scheda brano | `/brani/locus-iste-bruckner/` | `/en/pieces/…` | `/es/obras/…` |
| Autore | `/autori/bruckner/` | `/en/composers/…` | `/es/compositores/…` |
| Opera / raccolta | `/opere/messiah-hwv-56/` | `/en/works/…` | `/es/colecciones/…` |
| Genere / periodo | `/generi/sacro-latino/` | `/en/genres/…` | `/es/generos/…` |
| Stagione | `/stagioni/natale/` | `/en/seasons/christmas/` | `/es/temporadas/navidad/` |
| Linee | `/coro/`, `/arie/`, `/metodi/` (Concone come percorso ordinato) | | |
| Ricerca | `/cerca/` | `/en/search/` | `/es/buscar/` |
| Istituzionali | come funziona, fonti e licenze, chi siamo, privacy, trasparenza affiliazioni | | |
| Backup | `/classic/` (noindex) | | |

**Home:**
- hero con la ricerca in evidenza;
- "Ultimi video";
- "In arrivo", con i `publish_at` futuri;
- quattro ingressi: *Coro SATB*, *Metodi vocali*, *Arie di studio*, *Stagionali*;
- il metodo, raccontato con il motivo delle 4 barre;
- i canali social.

**Scheda brano:**
1. Breadcrumb → H1 → riga con compositore (date), opera, periodo.
2. **"In breve"** come elenco di definizioni (`<dl>`): organico, lingua, stagione, linea, voci disponibili, fonte, licenza. È il blocco che motori di ricerca e AI citano.
3. **Player incorporato** (iframe `youtube-nocookie.com`, `loading="lazy"`; decisione utente 2026-10-16, prima era una facade). Il selettore voce si genera dalle chiavi reali (S/A/T/B, ma anche T1/T2/B1/B2, oppure "Voce media" per i metodi). Le voci non ancora uscite compaiono come "in arrivo il …". Sotto, i capitoli cliccabili.
4. Note sul brano, da `curated` o da `nota_descrizione`.
5. **Testo e traduzioni**, affiancati verso per verso; su mobile diventano schede. Ogni blocco ha il suo `lang`; ogni traduzione riporta autore e licenza.
6. **Spartito:** prima le fonti di pubblico dominio (verifiche IMSLP/CPDL, nessun repository `scores`: le correzioni restano nel sito), poi le eventuali affiliazioni.
7. Spazio pubblicitario riservato (spento) · brani correlati · "Hai sentito un errore?" che apre un'email già scritta a info@ (anche dal player, con la battuta; nella lingua del sito; chi visita è un corista, niente GitHub).

**Contenuti sottili:** per i brani programmati senza alcun video pubblico la scheda viene generata con `noindex`, e diventa indicizzabile alla prima uscita. Così Google non vede pagine vuote.

### Stack e struttura del repo

- **Eleventy 3** (ESM, Nunjucks). Nessun framework lato client: JS minimo, come miglioramento progressivo.
- **Pagefind:** indice statico per lingua, con filtri. L'interfaccia è mia, scritta sulla sua API, per renderla accessibile:
  - `<form role="search">`;
  - filtri come checkbox dentro `<fieldset>`;
  - conteggio risultati annunciato con `aria-live`;
  - stato della ricerca nell'URL (`?q=&voce=&stagione=`), così si può condividere.
  - Senza JS restano gli indici per autore e genere.
- **@11ty/eleventy-img:** AVIF/WebP con `srcset`, e immagine OG 1200×630.
- Font serif self-hosted (sottoinsieme woff2) per i titoli; font di sistema per il testo.

```
eleventy.config.js   package.json   .nvmrc
content/generated/   ← SCRITTO DALLA PIPELINE (non modificare a mano)
content/curated/     ← note, traduzioni, affiliazioni (umano o agente)
content/taxonomies.yaml  (generi, stagioni, linee: etichette in 3 lingue)
src/_data/ site.js  i18n/{it,en,es}.json  catalog.js (unisce generated + curated, filtra per data)
src/_includes/layouts/ base · piece · listing · page
src/_includes/components/ video-facade · voice-picker · lyrics · card · breadcrumbs ·
                          lang-switch · in-brief · ad-slot · affiliate · jsonld/*
src/pages/ piece · composer · work · genre · season · line · search · home · static/*.md
src/assets/ css/ js/(search, facade, theme) img/ fonts/
src/static/ CNAME .nojekyll robots.txt llms.txt classic/
scripts/validate-content.mjs
.github/workflows/deploy.yml
docs/CONTENUTI.md
```

`scripts/validate-content.mjs` usa ajv e lo `SCHEMA.md`/JSON Schema condiviso con la pipeline. Fa fallire la build se trova curated orfani (slug inesistente), riferimenti rotti o ID malformati.

### Design system (UI/UX)

- **Identità ripresa dall'attuale:** blu notte `#121a2c`, ambra `#ffc24d`, logotipo "VOCE **a** VOCE". Il motivo delle **4 barre, una evidenziata**, diventa la firma grafica e il controllo per scegliere la voce. Le etichette testuali sono sempre visibili: il colore non è mai l'unico indizio.
- **Tema chiaro e scuro** del sito: `prefers-color-scheme` più interruttore, memorizzato in `localStorage`. I colori sono token, con contrasti AA verificati.
- **CSS moderno, senza framework:** `@layer`, container queries, `clamp()`, layout fluido da 320px, nessuno scroll orizzontale, `prefers-reduced-motion`.
- **Card brano:** miniatura 16:9 con `aspect-ratio`, titolo, compositore, chip delle voci, badge stagione e linea.

### Accessibilità (WCAG 2.2 AA) e W3C

- HTML5 valido, landmark, un solo H1 con gerarchia corretta, skip link.
- `:focus-visible`, aree cliccabili ≥ 24×24px, tutto usabile da tastiera. Il selettore voce è un gruppo radio nativo; le schede delle traduzioni seguono le APG.
- Cambio lingua come **link** alla pagina equivalente, con `hreflang` e `lang`.
- La facade è un `<button>` con nome completo ("Riproduci: Locus iste, voce Alto"); l'iframe ha un `title`.
- `lang` su ogni testo straniero (`la`, `de`, …); `alt` corretti.
- Tutto il contenuto è leggibile senza JS.

### SEO, ottimizzazione per le AI, prestazioni

- **HTML statico per ogni lingua:** `title` e meta description unici, canonical, `hreflang` (it/en/es + x-default), `sitemap.xml` con le alternate.
- **JSON-LD:**
  - `WebSite` con `SearchAction`;
  - `Organization` con `sameAs` (YouTube, Facebook, Instagram, TikTok);
  - nella scheda: `MusicComposition` (compositore, autore del testo, `lyrics`, `inLanguage`, `workTranslation`) + un `VideoObject` per voce pubblicata (`uploadDate`, `thumbnailUrl` di i.ytimg, `embedUrl`, `duration` quando disponibile, capitoli come `Clip`) + `BreadcrumbList`;
  - `Person` per i compositori; `ItemList` per opere, raccolte e Concone.
- Altri file: `robots.txt` (crawler AI ammessi, configurabile), `llms.txt`, feed Atom delle nuove uscite, Open Graph e Twitter card con URL assoluti.
- **Contenuto citabile:** il riquadro "In breve", note originali, entità coerenti (stesso compositore = stessa pagina = stesso `@id`).
- **Core Web Vitals:**
  - la facade carica `youtube-nocookie.com` solo al clic, quindi niente cookie di terzi prima di un'interazione;
  - JS sotto i 10 KB per pagina (Pagefind solo nella pagina di ricerca);
  - CLS circa 0.
  - Obiettivo: Lighthouse ≥ 95 in tutte e 4 le categorie.
- **Rebuild quotidiano** con cron GitHub Actions, gratuito e senza API: i video programmati compaiono da soli il giorno del loro `publish_at`, senza un nuovo export.

### Monetizzazione (predisposta, spenta)

- **`ad-slot`:** spazi con dimensioni riservate (niente CLS) ed etichetta "Pubblicità", controllati da `site.ads.enabled = false`. Da spenti mostrano nulla, o una promo interna ("Iscriviti al canale").
  - Posizioni: dopo "In breve", tra le note e il testo, nella colonna laterale su desktop, ogni N card nelle liste.
- **`affiliate`:** link con `rel="sponsored noopener"` e l'etichetta "link sponsorizzato", più la pagina Trasparenza. Le fonti gratuite di pubblico dominio stanno sempre in cima.
- **Privacy:** oggi nessun cookie. Per attivare AdSense nello Spazio Economico Europeo servirà un CMP certificato (TCF 2.2): il punto in cui inserirlo è già pronto in `base.njk`, ma l'integrazione è fuori da questo lavoro.

---

## Evoluzione del player di studio (2026-10-18)

Dopo la prima messa online con tre brani di prova, l'interfaccia della partitura e' stata rifatta in base all'uso reale. Principi:

- **La partitura e' carta.** Sfondo bianco e inchiostro scuro in ogni tema; l'inversione e' un'opzione, non il default (una partitura scura stanca).
- **Come i video.** Cursore che scorre sul sistema e fascia gialla sul rigo della propria voce; la fascia sulla battuta e' un'opzione spenta.
- **Dietro, non sopra.** Cursore e fascia stanno dietro le note (div sotto l'SVG, SVG con sfondo trasparente): note e testo restano nitidi.
- **Tutto cio' che e' configurabile sta in un pulsante «Opzioni»**, sulla stessa riga degli altri strumenti, con scelte ricordate nel browser e valori di partenza sensati.
- **Logica pura separata dal DOM** (`cursore.js`, `musicxml.js`, `mixer.js`): testata con unit test, con valori non validi gestiti. Il DOM si prova con jsdom e con Playwright.
- **Il mixer ha un solo concetto di silenzio.** Solo e' una scorciatoia di Muta.
- **I difetti dei dati si correggono alla fonte**, e nel sito solo con pulizie piccole e testate: l'XML del catalogo ha tempi ripetuti, nomi parte dello strumento di sintesi, scritte stray.
- **Un worktree per il codice di AIVideoCreator**, merge a render fermi.

Prossimi passi: vedi `task.md`, sezione P (P20–P27).

## Contenuti in 5 lingue, CI e player (2026-10-18 sera)

- **Lingue:** it/en/es/de/fr con un solo modello di rotte (`routes.js`) e chiavi i18n identiche (test `tests/lingue.test.mjs`); cambio lingua con menu a tendina per il mobile. Traduzioni e note scritte dall'IA e dichiarate come tali (pagina Trasparenza, etichetta sulle note, «non rivista» sui testi).
- **Traduzioni dei testi comuni:** file `content/curated/_comuni/<comune>.yaml` con frasi `{la, alt, it, en, es, de, fr}`; `comuni.js` abbina il testo cantato del brano alle frasi (parole normalizzate, copertura minima 70%); i `curated/<slug>.yaml` per brano prevalgono.
- **Guardie automatiche:** note in 5 lingue per ogni brano pubblicato, anti-segreti sui file tracciati, chiavi i18n e segnaposto coerenti.
- **CI:** controlli rapidi in un job, e2e in 3 job paralleli (`--shard`).
- **Player:** pannello di caricamento con avanzamento, partitura a schermo intero (automatica su telefono), «Tutte le voci pari». Aperto: qualità del rallentamento (R4 in `task.md`).

## Segnalazioni, partiture del video, player anticipato (2026-10-18 notte)

- **Una sola partitura:** il sito pubblica la partitura come la vede il video (`score.video.musicxml`, scritta dagli assets; chiavi corali, sigle, dinamiche sopra), non più lo score di lavoro. Il sito può adattarla, ma parte da quella. Non si pubblica su un repo `scores` separato: le correzioni restano in pipeline e sito.
- **Segnalare un errore (coristi, non programmatori):** link nel player e nella scheda → modulo nel sito → Worker Cloudflare gratuito → issue nel repo privato `voceavoce/segnalazioni` (notifica GitHub all'utente). Se il Worker non c'è o fallisce, resta l'email già scritta. Nessun cookie; privacy aggiornata nelle 5 lingue.
- **Dalla segnalazione alla correzione (flusso):** issue → verifica su edizione autorevole (gate T-796) → correzione come *repair* nella pipeline (mai nel file del sito) → score rigenerato → PR → l'utente risponde e chiude. Una skill `/voceavoce-segnalazioni` (R14) guiderà i passi, dopo il primo caso fatto a mano (Lutkin, R13).
- **Player anticipato:** la pagina `/player/<slug>/` esiste per ogni brano con dati pronti ma resta nascosta (noindex, nessun link) fino all'uscita; serve al link «Studia la tua parte nel player» nelle descrizioni YouTube (T-912) dal primo minuto. YouTube resta il primo passo (scoperta), il player lo strumento per lavorare sui passaggi.
- **Rallentamento:** il «suono sporco» sotto il 100% è il vibrato delle voci Synth V rallentato dal time-stretching; must have (R4): provare ad attenuarlo nei rendering (T-911).

## Player con strumenti MIDI e fine dell'MP3 (2026-10-20)

Idea dell'utente, analizzata e pianificata in [midi-player.md](midi-player.md): il player può suonare le note della partitura con strumenti scelti per voce (default pianoforte per le voci, organo per l'accompagnamento), sincronizzate al cursore; i tempi delle note nascono nella pipeline dallo stesso modello dei video (`note.json`, T-915), così corone, respiri e ritardando restano coerenti. Gli strumenti sostituiscono l'MP3 come fallback quando il browser non legge l'Opus; dopo la misura in produzione si elimina l'MP3 (-618 MB su R2). Fasi M0-M8 in [task.md](task.md); percorso principale 10-12 giorni, MP3 tolto solo dopo i dati di Cloudflare Web Analytics. Decisioni aperte: dove tenere i campioni (regola «audio mai in git»), licenza del soundfont, soglia di visitatori senza Opus.

## Ordine di esecuzione

1. **Backup:** tag `landing-v1` su `c50b793` + `src/static/classic/` (noindex, percorsi corretti).
2. **AIVideoCreator:** `job_sito_esporta` + test; passo dei capitoli in `job_choir_complete_metadata`; campo `genere` documentato nel `_schema` del contratto; passo nella skill `voceavoce-publish-choir`; prima esecuzione dell'export (sul clone, in questo ambiente) verso `voceavoce/site/content/generated/`.
3. **Sito, base:** package, config, layout, token CSS, i18n con URL per lingua.
4. **Sito, pagine:** scheda brano, liste per autore, opera, genere, stagione e linea, home, istituzionali.
5. **Ricerca:** attributi Pagefind e UI accessibile.
6. **SEO:** JSON-LD, sitemap, robots, llms.txt, feed, OG.
7. **Monetizzazione:** componenti dietro interruttore e pagina Trasparenza.
8. **CI:** `deploy.yml` (validazione → build → Pagefind → html-validate → pa11y-ci/axe → controllo dei link → `deploy-pages`), con trigger su push e cron giornaliero.
9. **Primo lotto editoriale:** traduzioni dei testi comuni e note dei brani già pubblici. Ti indico la stima dei token prima di partire.
10. **Documentazione:** README del sito, `docs/CONTENUTI.md`, sezione nel `CLAUDE.md` di AIVideoCreator (una riga).

**Passaggio manuale tuo, una volta sola:** su GitHub, *Settings → Pages → Source → "GitHub Actions"*, subito dopo il merge su main. Il dominio voceavoce.com resta invariato. Fino a quel momento Pages serve la radice di `main`, quindi c'è qualche minuto di transizione.

## Verifica

- **AIVideoCreator:**
  - `pytest tests/test_sito_esporta.py` più i test toccati (`test_complete_metadata*`, `test_roadmap*`);
  - `--dry-run` sul catalogo reale: numero di brani inclusi ed esclusi, con i motivi;
  - controllo che nessun file sia passato da CRLF a LF.
- **Sito:**
  - `npm run build` e `npm run check`: validazione, html-validate (W3C), pa11y-ci/axe in Chromium su home, scheda, lista e ricerca nelle 3 lingue, zero errori AA.
  - Prove con Playwright:
    - ricerca "Bruckner" o "Concone";
    - filtro Natale;
    - cambio voce nella facade;
    - un video con `publish_at` futuro deve restare nascosto e comparire quando simulo la data;
    - cambio lingua che porta alla stessa scheda;
    - navigazione solo da tastiera.
  - Screenshot a 375 e 1280px, in chiaro e in scuro, che ti invio.
  - Lighthouse ≥ 95.
  - Sitemap con le alternate e JSON-LD valido (parse e campi obbligatori). Dopo il deploy: Rich Results Test di Google e invio della sitemap in Search Console (istruzioni nel README).
  - `/classic/` identica alla landing di oggi, con `noindex`.

---

# Fase 2 — Player di studio (PWA), prototipo

Richiesta dell'utente del 2026-10-16. Ok per l'implementazione dato lo stesso giorno. Formati dei dati in [player.md](player.md).

**Obiettivo.** Una pagina `/player/<slug>/` per esercitarsi sulla propria parte: tracce separate per voce (stem Synth V), mixer con volume, mute e solo, partitura renderizzata con Verovio che evidenzia la battuta corrente, loop di battute, rallentamento senza cambiare l'intonazione. Mobile-first e installabile come PWA. Prototipo su 2 brani: **Locus iste** (Bruckner, SATB a cappella, con corone) e **Ave verum corpus K. 618** (Mozart, con accompagnamento).

**Scelte (decise con l'utente):**
- **Partitura:** il MusicXML verificato della pipeline, che Verovio legge direttamente. Niente Humdrum.
- **Sincronia:** `sync.json` con l'inizio di ogni battuta, calcolato in AIVideoCreator con lo **stesso modello di tempo dei video** (`choir.TempoMap`, `_time_at`: corone, respiri, ritardando, `LEAD_IN_SEC`). Non si ricava da tempo e metrica né dalla timemap di Verovio, perché non sarebbe allineato agli stem.
- **Dati per il player:** li produce un nuovo CLI `job_sito_player` in AIVideoCreator. Nel sito scrive `content/player/<slug>/{manifest.json, sync.json, score.musicxml}`. Gli audio Opus (più un MP3 di riserva per Safari) vanno in `VOCEAVOCE_AUDIO_DIR`, **fuori da ogni repo**.
- **Audio mai nel repo e mai nella CI.** Il `.gitignore` blocca `*.opus *.mp3 *.wav *.flac` e la cartella audio. Il caricamento su Cloudflare R2 lo lancia l'utente a mano con `scripts/upload-audio.mjs`, uno script che usa rclone: `copy` per default, `sync` solo con conferma esplicita, `--dry-run`, controllo HEAD degli URL pubblici. Le credenziali restano solo in locale (`.env.local` o config di rclone); `.env.example` contiene solo valori fittizi.
- **R2 + Worker (aggiornamento dell'utente, 2026-10-16):** il dominio voceavoce.com resta registrato su **Aruba**, e il DNS e la casella info@voceavoce.com restano lì. **Mai proporre il trasferimento della registrazione**: farebbe cessare la posta. Il bucket `voceavoce-audio` è **privato**: niente accesso pubblico e niente r2.dev. Gli audio li serve un **Cloudflare Worker gratuito** su `*.workers.dev`, collegato al bucket tramite binding. Il Worker accetta GET, HEAD e OPTIONS (gli altri metodi danno 405), gestisce Range (206), Content-Type, ETag, `Cache-Control: public, max-age=31536000, immutable` e il CORS (solo il sito, il suo URL GitHub Pages e localhost), e restituisce 404 puliti senza mai elencare il bucket. C'è un solo punto dove in futuro si inserirà la verifica dell'abbonamento. Codice in `workers/audio/`, `wrangler.toml` senza segreti, deploy fatto a mano dall'utente con wrangler (mai dalla CI). Percorsi `{slug}/{versione}/{voce}.opus`. Token R2 con permesso Object Read & Write limitato al solo bucket, per lo script di caricamento, che non cambia. Futuro, solo documentato: `audio.voceavoce.com` spostando su Cloudflare SOLO i nameserver, dopo aver copiato tutti i record della posta Aruba e quelli di GitHub Pages in modalità «DNS only». Passi in `docs/r2-setup.md`.
- **Rallentamento:** Web Audio con le tracce decodificate (mono, 24 kHz) → un GainNode per voce → **un solo** stretcher SoundTouch in AudioWorklet sul mix. Così le voci restano in sincronia esatta. Piano B: `<audio>` con `preservesPitch`.
- **Codice:** vanilla JS a moduli ES dentro Eleventy. Le funzioni sono separate (`mixer`, `loop`, `tempo`, `download`) e accese da flag in `features.js`, pronte per un futuro premium. Gli URL audio passano solo da `resolveAudioUrl(track)`, con la base configurabile in un solo punto (localhost in sviluppo, l'URL `workers.dev` del Worker in produzione). Nessuna credenziale nel client.
- **PWA:** manifest più un service worker essenziale che mette in cache pagina, script e Verovio, ma **mai l'audio**.
- **Predisposizione futura, da non implementare ora:** bucket privato `voceavoce-audio-premium` con gli stessi percorsi, servito da un Cloudflare Worker con URL firmati; link per le donazioni; video YouTube accanto al player.
- **Pubblicità:** gli spazi già predisposti restano spenti. Niente cookie di tracciamento.

**Da verificare:** la licenza dei voicebank Synth V per il download degli stem (funzione premium futura); la decodifica Opus su Safari; la memoria sui telefoni per i brani lunghi.

**Documenti:** `docs/player.md` (architettura, formato di manifest e sync, limiti, prossimi passi) e `docs/r2-setup.md`.

---

# Fase 3 — Robustezza: test end-to-end di player e PWA (ok dell'utente 2026-10-16, FATTA)

**Perché.** Gli unit test (81, `npm test`) coprono la logica pura: classificazione del service worker, tempi, loop, `resolveAudioUrl`, Worker, script R2. Le prove nel browser vero (registrazione e aggiornamento del SW, offline, audio mai in cache, player sincronizzato, tastiera, mobile) finora sono state fatte a mano con Playwright. Gli script sono salvati in `tools/verifica-manuale/` come bozze, ma non girano in CI.

**Cosa fare:**
- `@playwright/test` come devDependency, test in `tests/e2e/`, comando `npm run e2e`. In locale usa il Chromium di sistema; in CI quello scaricato da Playwright.
- Audio sintetici (con un clic a ogni battuta) generati AL MOMENTO del test da uno script Node in una cartella temporanea: mai file audio nel repo. Server audio di prova = `scripts/serve-audio.mjs`.
- **PWA:**
  - il SW si registra e si attiva; il manifest e le icone sono validi;
  - offline: le pagine visitate si aprono dalla cache, quelle nuove mostrano `/offline/` (va simulato fermando il server, perché `setOffline` non vale per le richieste del SW);
  - dopo la riproduzione `caches` non contiene audio;
  - **aggiornamento**: una versione nuova del SW si attiva e cancella le cache `vav-*` vecchie.
- **Player:**
  - caricamento delle tracce;
  - battuta evidenziata contro `sync.json` a 1× e 0,75×;
  - seek, loop, mixer (muta, solo, «La mia voce»);
  - tastiera e ARIA;
  - layout a 375 px.
- **CI:** `npm run e2e` nel workflow **Check**, che gira solo sulle pull request.

**Com'è stata fatta (2026-10-16):** 18 test (13 player, 5 PWA), ~45 s, 3 run di fila verdi. Audio WAV sintetici costruiti in memoria e serviti con `context.route` (Range compreso): nessun file audio su disco. Offline e aggiornamento del SW usano un piccolo server statico in-process (`tests/e2e/helpers.mjs`, `avviaSito`) che si può fermare e che può servire `/sw.js` con un'altra `VERSION`. Le richieste esterne (miniature i.ytimg) ricevono una GIF 1×1, così i test non dipendono da internet. Resta manuale il confronto evidenziazione ↔ clic udibile (`tools/verifica-manuale/measure.mjs`, P11): il test automatico confronta la posizione udibile del motore con `sync.json`.
