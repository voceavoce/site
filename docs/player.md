# Player di studio — architettura e formati

Stato: **prototipo (Fase 1) completo e verificato in emulazione; manca la prova a orecchio dell'utente su stem veri**. Piano in [plan.md](plan.md), Fase 2; task P1–P10 in [task.md](task.md); configurazione di R2 e del Worker in [r2-setup.md](r2-setup.md).

Indice: [Flusso dei dati](#flusso-dei-dati) · [Formato di manifest e sync](#contentplayerslugmanifestjson) · [Configurazione degli audio](#configurazione-degli-audio) · [Architettura del player](#architettura-del-player) · [Verovio](#partitura-verovio-e-battuta-evidenziata) · [PWA](#pwa-cosa-entra-in-cache-e-cosa-no) · [Pubblicare un brano](#pubblicare-un-brano-nel-player-passo-per-passo) · [Audio mai in git](#regola-audio-mai-in-git) · [Licenze](#licenze-di-terze-parti) · [Limiti noti](#limiti-noti) · [Prossimi passi](#prossimi-passi)

## Flusso dei dati

```
AIVideoCreator (macchina RENDER)                      voceavoce/site                 Cloudflare R2
job_sito_player --brano 002 --scrivi
  ├─ manifest.json, sync.json, score.musicxml  ──►  content/player/<slug>/   (in git)
  └─ <voce>.opus / .mp3                        ──►  VOCEAVOCE_AUDIO_DIR/<slug>/<versione>/   (MAI in git)
                                                       scripts/upload-audio.mjs (a mano) ──►  voceavoce-audio/<slug>/<versione>/
                                                                                              ▲ binding
                                                       browser  ◄── Worker workers/audio/ (workers.dev) ┘
```

Gli audio non entrano mai in un repo e non passano mai dalla CI.

## content/player/<slug>/manifest.json

```json
{
  "schema": 1,
  "slug": "locus-iste-bruckner",
  "titolo": "Locus iste",
  "compositore": { "id": "anton-bruckner", "nome": "Anton Bruckner" },
  "linea": "coro",
  "audio_versione": "v1",
  "tracce": [
    { "voce": "S", "chiave": "soprano", "tipo": "voce",
      "file": "locus-iste-bruckner/v1/soprano.opus",
      "riserva": "locus-iste-bruckner/v1/soprano.mp3" },
    { "voce": "ACC", "chiave": "accompagnamento", "tipo": "accompagnamento",
      "file": "…/v1/accompagnamento.opus", "riserva": "…/v1/accompagnamento.mp3" }
  ],
  "sync": "sync.json",
  "partitura": "score.musicxml",
  "durata_sec": 182.4,
  "licenza": { "spartito": "PD", "fonte_spartito": "CPDL / ChoralWiki", "audio": null }
}
```

- `voce` è l'etichetta della partitura: S, A, T, B, T1…, oppure `ACC` per l'accompagnamento.
- `chiave` è il nome del file: soprano, alto, tenore, basso, tenore-1, accompagnamento. Per arie e metodi la chiave è il registro (alta, media, bassa) e l'accompagnamento di ciascun registro è `accompagnamento-<registro>` (un pianoforte per registro). La chiave è anche l'identificatore della traccia nel mixer.
- `tipo` vale `voce` o `accompagnamento`. Il player lo usa per escludere l'accompagnamento dal menu «La mia voce».
- `file` e `riserva` sono **percorsi relativi** alla radice degli audio, sempre con `/`: `<slug>/<versione>/<chiave>.opus|.mp3`. Il player li risolve solo con `resolveAudioUrl()`.
- Il manifest non contiene mai URL assoluti né segreti. `licenza.audio` vale `null` finché non viene decisa.
- `compositore` è facoltativo (manca se il brano non ha un compositore nel registro). `licenza.spartito` può essere `null` (è così nell'uscita reale di Locus iste, con `fonte_spartito` «PDMX / MuseScore»): il sito non lo usa per decidere nulla.
- `durata_sec` è `sync.fine` arrotondata a 0,1 s. Il player la mostra prima del caricamento e poi la sostituisce con la durata reale dei buffer decodificati.
- Lo `slug` è quello dell'export delle schede (`job_sito_esporta`) e coincide con `content/generated/brani/<slug>.json`: così `studio.linked[slug]` collega la scheda del brano al player.
- Cartelle il cui nome inizia per `_` (oggi `content/player/_prova/`) sono **dati di prova**: pagina `noindex`, nessun link dalle schede e, con `ELEVENTY_ENV=production`, nemmeno generata.

**Controlli in build** (`src/_lib/studio.js`, `checkManifest`): `schema` uguale a 1; `slug` uguale alla cartella; almeno una traccia con `voce`, `chiave` e `file`; `file` e `riserva` relativi (niente schema, `//`, `..`, `\`, `?`, `#`, caratteri di controllo, massimo 300 caratteri); `sync.battute` non vuoto, `sync.fine` numerica e tempi `t` non decrescenti; esistenza del file della partitura. Un manifest fuori contratto fa fallire la build.

## content/player/<slug>/sync.json

```json
{
  "schema": 1,
  "battute": [ { "m": 0, "numero": "1", "t": 0.5 }, { "m": 1, "numero": "2", "t": 2.61 } ],
  "fine": 182.4
}
```

- Le **battute** sono in **ordine di esecuzione** (ritornelli espansi).
- `m` è l'indice della battuta nel MusicXML in ordine di documento, partendo da 0: è la stessa numerazione con cui Verovio rende le battute. La partitura che il sito riceve è quella di lavoro della pipeline (ritornelli espansi e rinumerati 1..N), quindi `m` coincide anche con la posizione nell'elenco `battute`. Se l'XML del catalogo ha un numero di battute diverso da quella di lavoro, `job_sito_player` scrive la partitura riscritta, non l'originale.
- `numero` è l'etichetta scritta in partitura, come stringa (può essere "0" per la battuta in levare).
- `t` sono i secondi dall'inizio dell'audio, calcolati con lo stesso modello di tempo dei video: tempo di prassi (mai quello dell'XML), `TempoMap`, corone, respiri, ritardando. **`t` include il `LEAD_IN_SEC` di 0,5 s** che gli stem di Synth V portano in testa: per questo la prima battuta sta a 0,5 e non a 0. All'accompagnamento (FluidSynth, che parte sulla nota) il CLI antepone 0,5 s di silenzio in conversione, così tutte le tracce hanno lo stesso zero e un solo `sync.json` vale per tutte. Il count-in dei video non è negli stem e non entra nel sync.
- `fine` è la durata dell'audio in secondi (coda di silenzio compresa, come il `total_sec` dei video), quindi è maggiore dell'inizio dell'ultima battuta (es. Locus iste: ultima battuta a 182,024, `fine` 189,643). Le battute di coda silenziosa che non sono nella copia del sito restano fuori dall'elenco.
- Per le ripetizioni nel menu del loop il player aggiunge « (2)» all'etichetta quando lo stesso `numero` compare più volte.

## Configurazione degli audio

- **Base URL in un solo punto** (`site.audioBase`): in produzione l'URL `*.workers.dev` del Worker `workers/audio/` (bucket R2 privato), in sviluppo `VOCEAVOCE_AUDIO_BASE`, default `http://localhost:8787`, servito da `scripts/serve-audio.mjs` sulla cartella `VOCEAVOCE_AUDIO_DIR`. Oggi la costante `AUDIO_BASE_PRODUZIONE` in `src/_data/site.js` è ancora il segnaposto `https://voceavoce-audio.CAMBIAMI.workers.dev`, da sostituire dopo il primo `wrangler deploy` (vedi [r2-setup.md](r2-setup.md)).
- Tutto passa da `resolveAudioUrl(track)`. In futuro questa funzione chiederà a un Cloudflare Worker URL firmati verso il bucket privato `voceavoce-audio-premium`, che userà gli stessi percorsi.
- Il Worker ammette solo percorsi `{slug}/{versione}/{chiave}.opus|mp3` con caratteri `a-z 0-9 -` (per questo `_prova` si prova solo con `serve-audio.mjs`).

## Architettura del player

Pagina `/player/<slug>/` (e le versioni EN/ES) generata da `src/pages/study.njk` con i dati di `src/_data/studio.js` (logica in `src/_lib/studio.js`). I dati (manifest, sync, etichette tradotte, `audioBase`, URL della partitura) arrivano al browser dentro `<script type="application/json" id="study-data">`. Tutto il codice è vanilla JS a moduli ES in `src/assets/js/study/`, caricato solo in quella pagina.

### Moduli JS

| Modulo | Cosa fa |
|---|---|
| `app.js` | Collega pagina, motore, mixer, loop e partitura. Orologio visivo con `requestAnimationFrame`, trasporto (play/pausa, seek, velocità), tasto spazio, messaggi per l'`aria-live`. Con `?debug` espone `window.__study`. |
| `engine.js` | `StudyEngine`: contesto Web Audio, grafo (ramo diretto + ramo con stretcher), scaricamento e decodifica delle tracce, posizione del motore e posizione **udibile**, seek, velocità, loop. |
| `latency.js` | Funzioni **pure** sulla latenza: `stretcherLatency(velocità)` (tabella misurata, interpolata), `deviceLatency(ctx)` (`outputLatency`, poi `baseLatency`, poi 0), `totalLatency`. Testate in `tests/study.test.mjs`. |
| `timeline.js` | Funzioni **pure** sul tempo (nessun DOM, nessun Web Audio): `measureIndexAt` (ricerca binaria), `loopBounds`, `computePosition` (orologio unico), `audiblePosition` (tempo udibile), `indexOfScoreMeasure`, `measureLabels`, `formatClock`. Testate con `node:test`. |
| `mixer.js` | Stato per traccia (volume, mute, solo), `effectiveGains` (con almeno un solo suonano solo le tracce in solo; il mute vince sempre), preset «La mia voce» (voce scelta al 100%, le altre al 30%). |
| `loop.js` | Menu «da battuta / a battuta», pulsante di attivazione e modalità «scegli sulla partitura» (due tocchi: inizio e fine). |
| `score.js` | Verovio: layout, SVG, zoom, evidenziazione della battuta, tocco su una battuta. |
| `config.js` | `setAudioBase`, `isSafeRelativePath`, `canDecodeOpus`, `resolveAudioUrl`: **unico punto in cui nasce un URL audio**. |
| `features.js` | Interruttori `mixer`, `loop`, `tempo` (accesi) e `download` (spento). |
| `download.js` | Segnaposto vuoto per lo scarico degli stem (spento, vedi [Limiti noti](#limiti-noti)). |

### Grafo Web Audio

```
AudioBufferSource (una per traccia, mono, 24 kHz, playbackRate = velocità)
   └─► GainNode (uno per traccia)
          └─► bus (GainNode, somma)
                 ├─► dry (GainNode) ───────────────────────────────────────┐  1x: bypass
                 └─► UN solo SoundTouchNode (AudioWorklet) ─► wet (GainNode) ┤  < 1x: time-stretch
                                                                  AudioContext.destination ◄┘
```

- **Compensazione della latenza (P11).** Il tempo del motore (`position()`) è quello della sorgente che entra nel bus; ciò che si sente è più vecchio della latenza del ramo attivo: stretcher (SoundTouch non la espone: **misurata** offline con un `OfflineAudioContext` e il worklet vendorizzato, un clic ogni secondo, inizio del clic in uscita meno l'istante atteso; 133 ms a 1x, 123 a 0,75x, 94 a 0,5x, uguale a 44,1 e 48 kHz; tabella `STRETCH_LATENCY` in `latency.js`, da rifare se si aggiorna `@soundtouchjs/audio-worklet`) più la latenza d'uscita del dispositivo (`ctx.outputLatency || ctx.baseLatency || 0`, riletta a ogni fotogramma, quindi segue anche il Bluetooth se il browser la riporta). `engine.audiblePosition()` = `computePosition` calcolato a `currentTime − latenza`; usarlo **solo** per evidenziazione, tempo mostrato, cursore e scroll della partitura (`app.js: update()`). Seek e confini del loop restano sul tempo del motore. Conseguenze volute: dopo un seek l'evidenziazione resta sulla battuta di arrivo finché il suono nuovo non esce; al rientro del loop l'evidenziazione rientra con la stessa latenza del suono (il calcolo a `now − latenza` fa passare l'udibile per la fine del loop e poi per l'inizio, senza saltare battute); dopo un cambio di velocità o di loop `prevAnchor` raccorda con l'ancoraggio precedente invece di congelare la posizione; la pausa salva la posizione udibile, così si riparte da ciò che si è sentito.
- **Scavalcamento dello stretcher a 1x.** A 1x (velocità esattamente 100 %) il bus va all'uscita dal ramo `dry`: nessun buffer SoundTouch, latenza solo del dispositivo. Sotto 1x il ramo `wet` (con lo stretcher) sostituisce il diretto con una dissolvenza lineare a somma costante di 40 ms; lo stretcher resta sempre collegato (nessun transitorio di avvio quando si torna sotto 1x) e la compensazione pesa la latenza dello stretcher con il peso corrente del ramo `wet` (`engine.latency()`).

- **Rallentamento senza cambiare l'intonazione.** Ogni sorgente suona con `playbackRate = velocità` (0,5–1,0), quindi l'altezza scende; il nodo SoundTouch, che riceve la stessa velocità come parametro `playbackRate`, riporta l'intonazione al valore originale. Lo stretcher è **uno solo, sul mix**: le voci restano in sincronia esatta tra loro.
- **Orologio unico = l'AudioContext.** La posizione è `ancoraggio + (currentTime − istante) × velocità` (`computePosition`). Le sorgenti partono tutte allo stesso `when` (`currentTime + 0,06 s`), che è anche l'istante di ancoraggio. Al cambio di velocità si ri-ancora alla posizione di quel momento. Ogni seek ferma e ricrea le sorgenti.
- **Loop nativo e senza vuoti.** `AudioBufferSourceNode.loop = true` con `loopStart` e `loopEnd` presi dal sync (inizio della battuta iniziale, inizio della battuta dopo la finale); `computePosition` riporta l'orologio da `start` quando supera `end`. Un loop impostato quando la testina è già oltre la fine fa ripartire da `start`.
- **Decodifica a 24 kHz mono.** Le voci non hanno contenuto utile oltre i 12 kHz: ogni file viene decodificato con un `OfflineAudioContext(1, 1, 24000)` (che ricampiona) e, se è stereo, mediato a mono. Un buffer da 190 s occupa circa 18 MB (190 × 24000 × 4 byte), invece dei circa 67 MB a 44,1 kHz stereo. Se la decodifica offline fallisce si ripiega sul contesto principale.
- **Fallback se manca AudioWorklet.** `init()` richiede `AudioContext` e `AudioWorkletNode`; se mancano, errore `unsupported` e messaggio all'utente. Se il contesto c'è ma SoundTouch non si carica (file bloccato, worklet non registrabile) il bus va direttamente all'uscita: si suona alla velocità normale, il cursore della velocità si disattiva (`stretchOk = false`) e un messaggio lo dice. Piano B ancora non implementato: `<audio>` con `preservesPitch`.
- **`resolveAudioUrl(track, opts)` e il passaggio Opus → MP3.** Sceglie `file` (Opus) se il browser dichiara di decodificare Opus (`canPlayType` su `audio/ogg; codecs="opus"` o `audio/webm; codecs="opus"`), altrimenti `riserva` (MP3). Rifiuta percorsi non relativi e una base non configurata, e codifica ogni segmento con `encodeURIComponent`. In più `engine.js` riprova da solo con l'MP3 di riserva se lo scaricamento o la decodifica dell'Opus falliscono. Richieste con `mode: "cors"` e `credentials: "omit"`: nessun cookie, nessuna credenziale.
- **Errori.** `StudyError.kind` vale `network` (rete assente, HTTP non 2xx o CORS negato: dal client sono indistinguibili), `decode`, `worklet` o `unsupported`; la pagina mostra un messaggio tradotto in un riquadro `role="alert"`. Un errore della partitura non ferma il player.
- **Flag in `features.js`.** `mixer`, `loop` e `tempo` nascondono i rispettivi pannelli (`data-feature`) se spenti; `download` è `false` e `download.js` è vuoto. I flag servono a differenziare in futuro la versione gratuita da quella premium senza toccare il resto.
- **Tastiera e accessibilità.** Barra spaziatrice = play/pausa quando il focus non è in un campo, un pulsante o un link (il campo tiene la barra); frecce sui `range` (velocità di 5 in 5 punti, volumi di 5 in 5, posizione di 0,1 s) con `aria-valuetext`; muta e solo sono pulsanti con `aria-pressed` e nome accessibile completo («Muta Alto», «Solo Tenore») mentre il testo visibile è breve; `data-status` è un `role="status"` (annunci educati) e gli errori un `role="alert"`; la barra fissa in basso è un gruppo con etichetta.

## Partitura: Verovio e battuta evidenziata

- Verovio (WebAssembly, circa 7 MB, circa 2,3 MB compressi) è caricato **solo** nella pagina del player, con import dinamico di `verovio-module.mjs` e `verovio.mjs` da `/assets/vendor/verovio/`, in parallelo allo scaricamento della partitura (`/player-data/<slug>/score.musicxml`, copiata in build dalla cartella `content/player/<slug>/`).
- Il MusicXML è quello verificato dalla pipeline, letto direttamente (niente Humdrum). Verovio lo rende in SVG a pagine di larghezza uguale al contenitore, con scorrimento verticale dentro il riquadro (mai della pagina), zoom a passi (25–100) e rifacimento del layout al cambio di larghezza (con un ritardo di 200 ms; le variazioni di sola altezza, come la barra del browser mobile, si ignorano).
- **Indice `m`.** Ogni battuta renderizzata è un `<g class="measure">`. Il player le raccoglie in ordine di documento: la `m`-esima corrisponde al campo `m` del sync. Con la battuta evidenziata riceve la classe `is-current`, e dietro di essa si inserisce un rettangolo di sfondo (`.measure-bg`); il contenitore scorre per tenerla visibile (morbido, o istantaneo con `prefers-reduced-motion`).
- Ad ogni frame `measureIndexAt(sync, posizione)` dà l'indice nell'elenco di esecuzione e `sync.battute[i].m` l'indice della battuta da evidenziare. Prima della prima battuta (lead-in) non si evidenzia nulla.
- Un tocco su una battuta porta la testina al suo inizio (o, in modalità «scegli sulla partitura», imposta il loop). Con i ritornelli espansi `m` compare una volta sola; se comparisse più volte (sync con ripetizioni) si usa l'occorrenza più vicina alla posizione corrente.
- Verifica di coerenza: nel Locus iste vero le battute in SVG sono 48 e `max(m) + 1` è 48.

## PWA: cosa entra in cache e cosa no

Manifest `/manifest.webmanifest`, icone generate dall'avatar e service worker `/sw.js` (generato da `src/pages/sw.njk`, scope `/`, registrato da `sw-register.js`). La classificazione delle richieste è in `src/assets/js/sw-core.js`, con test in `tests/sw.test.mjs`.

| Richiesta | Trattamento |
|---|---|
| Navigazioni | rete prima; se manca, copia in cache (anche con altra query) e poi `/offline/` |
| Asset statici dello stesso sito (css, js, mjs, wasm, immagini, font, `.musicxml`, `.json`, `.webmanifest`, `/player-data/`) | dalla cache subito e aggiornamento in background (stale-while-revalidate) |
| Precache all'installazione | home, `/offline/`, `main.css`, `study.css`, gli script del sito e del player, icone, manifest |
| Verovio e SoundTouch | **non** nel precache (7 MB che ogni visitatore scaricherebbe senza aprire il player): entrano in cache alla prima apertura del player |
| **Audio** | **mai**: nessun `respondWith`, la richiesta va alla rete come se il SW non esistesse |
| Cross-origin (YouTube, i.ytimg), `/pagefind/`, `/sw.js`, metodi diversi da GET | non intercettati |

Sono considerati audio, e quindi mai intercettati: gli host `audio.voceavoce.com`, `localhost:8787`, `127.0.0.1:8787`, qualunque `*.workers.dev`, l'host di `site.audioBase` (iniettato in build in `AUDIO_HOSTS`), le estensioni `.opus .mp3 .wav .flac .ogg .oga .m4a .aac .weba` e **qualunque richiesta con header `Range`**. Si mette in cache solo una risposta 200 completa e dello stesso sito (mai 206). Le cache si chiamano `vav-pre-<versione>` e `vav-rt-<versione>` e quelle di versioni vecchie si cancellano all'`activate`. Motivo della regola: in questa fase non c'è audio offline, e quando arriveranno gli URL firmati per il premium non devono restare in una cache del browser.

## Test end-to-end

I test Playwright stanno in `tests/e2e/` (`player.spec.mjs`, `pwa.spec.mjs`, `sync-audio.spec.mjs`, utilità in `helpers.mjs`) e si lanciano con `npm run e2e`: lo script `scripts/e2e.mjs` costruisce il sito in `_site-e2e` (build non di produzione, quindi con il brano `content/player/_prova`, base audio `http://localhost:8787`) e poi esegue `playwright test`. Gli argomenti passano oltre: `npm run e2e -- --grep mixer`. Il server del sito è un `webServer` di Playwright (`http-server` su `127.0.0.1:8090`, `E2E_PORT` per cambiarla). `npm test` resta solo per gli unit test.

- **Audio sintetico.** Mai file audio nel repo: `helpers.mjs` costruisce in memoria un WAV per voce (tono debole più un clic a ogni battuta di `sync.json`) e lo serve intercettando le richieste verso `localhost:8787` e `*.workers.dev` (`context.route`), anche con `Range`. Il formato è riconosciuto dai byte, non dall'estensione `.opus`.
- **Sincronia.** Si registra la posizione udibile al momento in cui cambia la battuta evidenziata e la si confronta con `sync.json` (tolleranza 150 ms, a 1× e a 0,75×).
- **Sincronia con il clic udibile (P15, `sync-audio.spec.mjs`).** Misura quello che esce davvero dal grafo, senza passare da `audiblePosition()`: un AudioWorklet "spia" in ascolto sui due rami (diretto e stretcher, cioè il mix finale prima del dispositivo) rileva l'inizio di ogni clic sul frame esatto di `currentFrame`; il tempo di contesto diventa tempo di pagina con `getOutputTimestamp()` (in Chrome la coppia contextTime/performanceTime comprende già la latenza d'uscita: non si somma `outputLatency`, che nel test serve solo da riferimento; lo scarto è la mediana su tutti i clic per annullare il ritardo dei messaggi del worklet) e si confronta con l'istante in cui un MutationObserver vede cambiare la battuta evidenziata. Prove a 1× (da battuta 1), 0,75× (da 1) e 0,5× (da 2): mediana ≤ 40 ms e massimo ≤ 80 ms in valore assoluto. Obiettivo di P11 ±25 ms; le soglie lasciano margine al fotogramma di rAF (fino a ~17 ms) e al jitter del main thread in headless, restando ben sotto l'errore senza compensazione. Misure con compensazione su 6 esecuzioni: mediana 1× −5…+8 ms (max 12), 0,75× +11…+26 (max 49), 0,5× +2…+8 (max 35); il 0,75× è il più variabile (la latenza dello stretcher oscilla di ±10 ms). Dimostrato che il test fallisce senza compensazione: `stretcherLatency()` = 0 → 0,75× mediana −116 ms (max 122), 0,5× −77 (max 92), mentre 1× resta a posto (ramo diretto); `deviceLatency()` = 0 → 1× −71 ms, 0,75× −46, 0,5× −66. Se si aggiorna SoundTouch o si tocca `latency.js`, questo test dice subito se la tabella è ancora valida.
- **Offline.** `context.setOffline()` non vale per le richieste del service worker: il test usa un piccolo server del sito (`avviaSito`) che può fermare davvero.
- **Aggiornamento del SW.** Lo stesso server serve `/sw.js` con una `VERSION` diversa (come dopo un nuovo deploy, dove è l'hash di `site.buildTime`); il test verifica che `reg.update()` attivi la versione nuova e che restino solo le cache `vav-*` nuove (le cache di altre app non si toccano).
- **Browser.** In locale: `PW_CHROMIUM=/percorso/chrome`, altrimenti il Chromium di sistema se presente; in CI quello scaricato da `npx playwright install --with-deps chromium`. Non lanciare mai `playwright install` fuori dalla CI.
- **CI.** Il passo `npm run e2e` è nel workflow Check (solo pull request); se fallisce, `playwright-report/` e `test-results/` (con le trace) si scaricano come artifact.
- Le bozze manuali da cui sono nati (`tools/verifica-manuale/`) restano per le misure fuori dai test (latenza dello stretcher, collaudo sul brano vero; il confronto con il clic udibile è ora automatico).

## Pubblicare un brano nel player, passo per passo

1. **Macchina RENDER (AIVideoCreator).** Il brano deve avere gli stem cantati adottati (`/voceavoce-produci-lotto`, `job_svs_adopt`) in `runtime/inbox/choir/<job>/stems/<V>.svs.wav|flac` (più `accompaniment.wav` se c'è l'accompagnamento) e una scheda sul sito (`job_sito_esporta`). Da `pipeline-core/`:
   `../runtime/venv/Scripts/python.exe -m scripts.cli.job_sito_player --brano 002` è un dry-run (mostra bpm, battute, durata, corone, file e audio); aggiungendo `--scrivi` scrive `content/player/<slug>/{manifest.json, sync.json, score.musicxml}` nel clone del sito (`--out`, default `VOCEAVOCE_SITE_DIR`) e converte gli audio con ffmpeg (mono; Opus 48 kHz 64 kbit/s e MP3 VBR q5 di riserva) in `VOCEAVOCE_AUDIO_DIR/<slug>/<versione>/` (`--audio-dir`, `--versione`, default `v1`). Senza stem su quella macchina scrive comunque manifest, sync e partitura e avvisa che gli audio mancano. Non fa commit né push.
2. **Controllare.** Leggere il rapporto del CLI: bpm, numero di battute, durata, lead-in e corone devono essere quelli attesi. Provare in locale (due terminali nella radice del sito: `node scripts/serve-audio.mjs` e `npm run serve`, poi `http://localhost:8080/player/<slug>/`) e verificare a orecchio che la battuta evidenziata coincida con ciò che si sente.
3. **Caricare gli audio su R2, a mano.** `node scripts/upload-audio.mjs --slug <slug> --dry-run`, poi senza `--dry-run`. È rclone `copy` (non cancella nulla; `--sync` solo con anteprima e conferma digitando il nome del bucket) e finisce con un controllo HEAD sul Worker. Credenziali solo in `.env.local` o nella config di rclone.
4. **Worker.** Va distribuito una volta sola (`npx wrangler deploy` da `workers/audio/`, a mano) e il suo URL va scritto in `AUDIO_BASE_PRODUZIONE` (`src/_data/site.js`) e in `R2_PUBLIC_BASE` di `.env.local`. Passi completi in [r2-setup.md](r2-setup.md). Controllo: `curl -I -H "Range: bytes=0-99" <URL>/<slug>/v1/soprano.opus` deve dare 206.
5. **Commit dei dati nel sito.** Solo dopo il passo 3: `content/player/<slug>/` (tre file di testo) va in git con commit e push; il deploy parte da solo e la scheda del brano mostra «Studia con il player». **Mai prima del caricamento**: senza audio raggiungibili il player in produzione sarebbe rotto (per lo stesso motivo oggi non c'è nessun manifest reale nel sito).
6. **Nuova versione degli audio.** Si cambia `--versione` (v2): i percorsi sono diversi, quindi nessuna cache serve audio vecchio (i file sono `immutable` per un anno).

## Regola «audio mai in git»

- `.gitignore` blocca `*.opus *.mp3 *.wav *.flac *.ogg *.m4a` e le cartelle `audio/` e `audio-local/`; `VOCEAVOCE_AUDIO_DIR` sta fuori dal repo. `upload-audio.mjs` rifiuta di partire se la cartella audio è dentro il repo e non ignorata.
- Gli audio non passano mai dalla CI: il caricamento è manuale e il deploy di Pages non li vede. Il Worker è distribuito a mano con wrangler.
- Le credenziali non sono mai nel client né nel repo: `.env.example` contiene solo valori fittizi, `wrangler.toml` non ha segreti, il manifest non ha URL assoluti.
- Il bucket R2 è **privato**: niente accesso pubblico e niente `r2.dev`; gli audio escono solo dal Worker.
- Gli stem si rigenerano sempre dalla macchina RENDER con `job_sito_player --scrivi`.

## Licenze di terze parti

Le librerie sono copiate da `node_modules` in `assets/vendor/` come **file separati e non minificati insieme al nostro codice** (`eleventy.config.js`), modificabili e sostituibili, e il testo che le dichiara è `src/static-vendor/NOTICE.txt`, servito come `/assets/vendor/NOTICE.txt`.

| Libreria | Licenza | Uso |
|---|---|---|
| Verovio 6.x | LGPL-3.0-or-later | resa della partitura (`verovio-module.mjs`, `verovio.mjs`) |
| SoundTouchJS `@soundtouchjs/audio-worklet` 2.x | MPL-2.0 (l'algoritmo SoundTouch originale è di Olli Parviainen, LGPL-2.1) | time-stretch in AudioWorklet |

Finché i file restano separati, non modificati e con NOTICE, gli obblighi LGPL/MPL sono rispettati. Se in futuro si modificassero o si impacchettassero insieme al codice del sito, gli obblighi cambierebbero.

## Limiti noti

- **Memoria sui telefoni per i brani lunghi.** Tutte le tracce restano decodificate in memoria (nessuno streaming). Con 4 tracce di 190 s a 24 kHz mono i buffer sono circa 73 MB; in emulazione desktop (Chromium headless) l'intero processo del browser pesava circa 1,04 GB dopo il caricamento (processo della pagina circa 390 MB, heap JS circa 165 MB), valore non confrontabile con un telefono. Un brano di 10 minuti con 5 tracce vale circa 290 MB di soli buffer. Da misurare su un telefono vero; leve possibili: 16 kHz, decodifica su richiesta, `MediaElement` per i brani lunghi.
- **Durata reale degli stem non verificata rispetto a `fine`.** `sync.fine` e le `t` vengono dal modello, non dai file. Va controllato su stem veri che la loro durata combaci (e che il lead-in di 0,5 s sia davvero in testa a tutte le voci); in caso contrario il sync si sfasa.
- **Latenza audio: compensata, residuo da giudicare a orecchio (P11).** Prima: con audio sintetico (un clic a ogni battuta) la battuta si accendeva 105–135 ms **prima** del suono uscito dallo stretcher (133 ms di buffer SoundTouch a 1x, circa 120 a 0,75x) e circa 175–230 ms prima contando i 72 ms di `outputLatency` di Chromium headless. Ora (vedi [meccanismo](#grafo-web-audio)): a 1x lo stretcher è scavalcato e l'evidenziazione, il tempo mostrato e lo scroll usano il tempo udibile; misura sul vero Locus iste, evidenziazione meno clic udibile (tap sul mix finale più `outputLatency`): 1x da zero −10…−22 ms, 1x dopo seek da −14 a −48 ms, 0,75x da zero −15…+18 ms, 0,75x dopo seek −21…+9 ms, loop battute 10–13 a 1x −10…−21 ms e a 0,75x −14…+22 ms, cambio 100 → 75 → 100 % al volo −18…+9 ms (negativo = la battuta cambia dopo il clic; metà del residuo è il fotogramma di `requestAnimationFrame`). Limiti: (1) la latenza dello stretcher è una tabella misurata sul worklet vendorizzato (a 0,75x oscilla di ±10 ms da un punto all'altro del brano, perché SoundTouch sceglie la finestra di sovrapposizione in base al segnale) e va rifatta se si aggiorna `@soundtouchjs/audio-worklet`; (2) `outputLatency` è la stima del browser: con Bluetooth può essere imprecisa, Safari non la espone (si ripiega su `baseLatency`) e in emulazione non c'è un dispositivo vero; (3) nei 40 ms della dissolvenza a 1x ↔ sotto 1x il suono ha comunque un transitorio, come ad ogni cambio di velocità. Ultimo collaudo: orecchio dell'utente con cuffie e con Bluetooth.
- **Safari e Opus.** Safari prima della 17 non decodifica Opus (Ogg) e usa l'MP3 di riserva; la decodifica Opus e il worklet su Safari/iOS non sono stati provati su dispositivi veri. L'AudioContext su iOS parte solo da un gesto dell'utente (qui parte dal tasto Riproduci).
- **Sincronia da confermare a orecchio su stem veri.** Le prove automatiche usano tracce sintetiche con un clic a ogni battuta (nessuno stem vero è ancora stato convertito); l'ascolto dell'utente su Locus iste e Ave verum resta il collaudo finale (task P7).
- **Caso della corona singola (P8).** Con una sola corona a metà brano `choir._timing_regions` la tratta come corona finale e mette lì l'allargando finale (Locus iste, b. 28–29). Il sync segue lo stesso modello dei video, quindi è coerente con il video ma musicalmente discutibile; riguarda anche i video già pubblicati. La decisione spetta all'utente (task P8 in [task.md](task.md)).
- **Licenza dei voicebank per il download.** Non è chiaro se la licenza dei voicebank Synth V consenta di distribuire gli stem cantati scaricabili: finché non è verificata `features.download` resta spento e `licenza.audio` vale `null`. L'ascolto in streaming per lo studio è un'altra cosa e non è stato bloccato.
- **Placeholder dell'URL del Worker.** Finché `AUDIO_BASE_PRODUZIONE` è `…CAMBIAMI.workers.dev` nessun audio può essere raggiunto in produzione, ed è per questo che non si pubblica nessun manifest reale.
- Nessun controllo di rete lenta: il caricamento scarica tutte le tracce in parallelo (circa 2 MB l'una in Opus a 64 kbit/s per 190 s) prima di abilitare i comandi.

## Prossimi passi

1. Completare il collaudo della Fase 1: P7 a orecchio dell'utente su stem veri, decisione su P8, deploy del Worker, sostituzione del segnaposto, primo caricamento su R2 e poi pubblicazione dei dati di Locus iste e Ave verum K. 618.
2. Fase 2 (piano in [plan.md](plan.md)): estendere il player agli altri brani del catalogo, decidere le leve di memoria per i brani lunghi e per i telefoni e l'eventuale piano B `<audio>` con `preservesPitch`.
3. Premium (solo predisposto, **non implementare ora**): bucket privato `voceavoce-audio-premium` con gli stessi percorsi, servito dal Worker con URL firmati (`authorize()` in `workers/audio/src/index.js` e `resolveAudioUrl` asincrona), scarico degli stem (`features.download`) dopo la verifica della licenza dei voicebank, link per le donazioni, video YouTube accanto al player. Futuro dominio `audio.voceavoce.com` spostando su Cloudflare solo i nameserver, dopo aver copiato i record della posta Aruba (mai trasferire la registrazione).
4. Pubblicità: gli spazi sono predisposti e restano spenti; nessun cookie di tracciamento.


## Partitura: cursore, fascia della voce, opzioni (2026-10-18)

- **Carta bianca.** `.score-scroll` ha `--paper: #fff` e `--ink: #111` in ogni tema; `is-inverted` li scambia con `#101828` / `#eef0f5`. Verovio scrive `color="black"` sull'`<svg>` interno
  e lascia i glifi senza `fill`: il CSS imposta `color: var(--ink); fill: currentColor` su `.score-scroll svg svg`.
- **Cursore.** `score.js` chiede a Verovio `renderToTimemap({ includeMeasures, includeRests })` a ogni `layout()`; `cursore.js` ne ricava, per battuta, la x di ogni nota/pausa
  (`puntiPerBattuta`) e la fine (`completaBattute`: `q1` e `xEnd`). A ogni fotogramma `app.js: update()` passa `frazioneInBattuta(sync, i, pos)` (tempo udibile) e `xAlCursore` interpola in quarti.
  L'ultima battuta dura quanto la precedente (dopo c'e' solo la coda di silenzio, R-11). Con `prefers-reduced-motion` il cursore salta da nota a nota. E' un `<div class="score-cursor">` dietro l'SVG (z-index 1 contro 2).
- **Fascia della voce.** `setMyVoice(idx, voci)`: una `<div class="score-voice-band">` per sistema sul rigo `idx`; solo se i righi sono tanti quante le voci (`rigoDellaVoce`). Parte con la voce gia' scelta nel menu all'apertura e si aggiorna a ogni cambio.
- **Etichette dei righi.** `musicxml.js: abbreviaParti(xml, voci)`: sigle dal manifest (S, A, T, B, S1…) se le voci sono tante quante le parti; altrimenti iniziale del nome, solo se le abbreviazioni non sono gia' tutte diverse.
  `senzaTempiRipetuti` tiene un solo ♩=… per battuta.
- **Opzioni** (pulsante «Opzioni» → `#score-options`, `localStorage["va-score-opts"]`, letto con `opzioniPartitura`, che non si fida di nulla): `myPart` (acceso), `cursor` (acceso), `cursorColor` (`#f2a900`), `measure` (spento), `invert` (spento).
  Se lo storage e' bloccato o rovinato si usano i valori di partenza, senza errori.
- **Scegli sulla partitura** (nel riquadro Ripetizione): sceglie la battuta dalla posizione del tocco (`battutaAlPunto`), dentro il sistema piu' vicino (margine 24 px); i clic sintetici usano il segno colpito.
- **Mixer.** Solo stato di silenzio: `mute`. «Solo» (`soloState`) mette in mute le altre voci; secondo tocco = tutte in ascolto; `aria-pressed` di Solo = `isSolo`. «La mia voce»: scelta 100 %, altre 30 %, nessun mute.
- **Test.** Unit: `tests/cursore.test.mjs`, `tests/musicxml.test.mjs` (jsdom), `tests/study.test.mjs`. E2E: `tests/e2e/partitura.spec.mjs`, `tests/e2e/player.spec.mjs`. In locale:
  `$env:PW_CHROMIUM='C:\Program Files\Google\Chrome\Application\chrome.exe'; npm run e2e -- tests/e2e/partitura.spec.mjs`.
