# State — avanzamento e decisioni

## Riepilogo per riprendere (aggiornato 2026-10-18 notte, segnalazioni attive, player anticipato in PR)

- **Unite su `main`:** #15 (partiture del player = quelle del video: tenore in violino-8, sigle, dinamiche sopra; 141 `score.musicxml` rigenerati), #16 + #17 (segnalazioni: la #16 è stata unita prima degli ultimi commit, la #17 l'ha completata), #18 (docs R4), oltre a #4–#14.
- **Segnalazioni attive in produzione.** Il link «Segnala un errore nello spartito» (player, sotto la partitura, e scheda brano; 5 lingue) apre un modulo nel sito (brano e battuta già noti, email facoltativa) che invia al Worker Cloudflare `workers/segnala` (`https://voceavoce-segnala.voceavoce.workers.dev`, piano gratuito), il quale crea un'issue nel repo **privato** `voceavoce/segnalazioni`: a chi cura il sito arriva la notifica di GitHub. Token GitHub fine-grained (solo Issues su quel repo) come secret di wrangler (`wrangler secret put GITHUB_TOKEN`, mai nel repo né in chat). Senza URL il link apre un'email già scritta a info@ (nella lingua del sito). Il repo `scores` non si usa. Provato in produzione dall'utente: issue #2 (vera, vedi sotto).
- **Aperte:** **#19** player anticipato (la pagina `/player/<slug>/` è costruita per tutti i 141 brani con dati pronti, ma nascosta fino all'uscita: noindex, fuori da sitemap/ricerca, nessun link; il link dalla scheda compare solo per i brani con una voce visibile, alla build notturna dopo la data) e **#20** Worker: l'email lasciata da chi segnala era illeggibile (carattere invisibile dopo la @); **dopo il merge serve `npx wrangler deploy` a mano** da `workers/segnala`.
- **AIVideoCreator (`main`, pushato):** T-910 (`score.video.musicxml`: la partitura del video diventa un file salvato dagli assets; `job_sito_player --solo-partitura`), T-911 (MUST HAVE, non adesso: attenuare il vibrato nei rendering; causa del rallentamento «sporco» = vibrato delle voci Synth V rallentato dal time-stretching), T-912 (riga «🎧 Studia la tua parte nel player» nelle descrizioni YouTube, 5 lingue; `job_sito_esporta.slug_per_rank` assegna lo slug prima dell'export; la scrive `job_choir_metadata`). Nuovi T-913 (caso Lutkin) e T-914 (skill segnalazioni) in `tasks.md`.
- **Da fare, in ordine:** (1) **caso Lutkin** (issue #2 del repo privato): nelle due varianti, b. 18 `f`, forcella *crescendo* dalla b. 19 alla 23 dove compare `pp` e si chiude: incoerente, quasi certamente va un *diminuendo*; verificare su edizione autorevole, correggere nel catalogo/pipeline (non nel file del sito), rigenerare lo score del sito, PR, rispondere alla persona (che ha lasciato la sua email) e chiudere l'issue; i video già su YouTube mostrano lo stesso errore (decisione dell'utente su un nuovo render). (2) **Skill di verifica delle segnalazioni** (R13 in `task.md`), dopo il caso Lutkin. (3) Merge #19 e #20 + `wrangler deploy`. (4) Brani nuovi: prima `job_sito_player --scrivi`, audio su R2 e PR del sito, POI il video pubblico (altrimenti il link nella descrizione dà 404). (5) Riga del player nei video GIÀ pubblicati: solo su istruzione (API YouTube) o a mano.
- **Da scartare:** il branch `fix/player-qualita-rallentamento` (`?stretch=voci`, mai in PR) e il suo esperimento.

## Lavori in corso 2026-10-21 (cloud, elenco concordato con l'utente)

Ordine: (7) test completo della pipeline [in corso, `/tmp` log non persistente] · (1) test offline strumenti [FATTO] · (2) axe sul pannello Suono + tastiera [FATTO] · (8-9) Lutkin: regola `anomalie_spartito` + repair (non attivo, in attesa della verifica dell'utente sull'edizione) + scansione del catalogo [FATTO: 523 XML, `docs/anomalie-catalogo-2026-10.md` nel repo AIVideoCreator; nuova regola `dinamica`: 33 righe in 23 brani, da rivedere 177, 259, 305, 039, aria-012] · (3) dinamica nelle note (velocity) [sito FATTO; pipeline T-921 in corso] · (4) mix cantato+strumento (M7) [FATTO] · (5) brani in lavorazione (M8) [FATTO: 23 player senza_audio, vedi task.md per l'avviso sui 22 da-caricare] · U1 pytest [FATTO: 3253 passati; 28 falliti (2 noti, 5 nuovi di ambiente/render Linux, cmudict/googleapiclient mancanti); corretti T-919 batch_runner e encoding] · (6) pannello Suono nella scheda brano (M11) · (10) bozza skill segnalazioni [FATTO, T-914] · (11) note dei due brani senza testo [RIMANDATO dall'utente a quando lavora in locale con la rete: `npm run check` resta rosso solo per questo]. Commit e push a ogni passo.

- **Idea da valutare (2026-10-21), M12:** nomi delle note (do re mi / C D E; decisioni: it + anglosassone, sezione nel pannello Suono, niente vocali nella v1, poi la vocale della sillaba del testo; aperte: do fisso/mobile, alterazioni, strofe) al posto del testo nella partitura, come supporto al solfeggio; vedi `docs/task.md` e `docs/midi-player.md` §10. Non pianificata.

## Modo di lavoro dal 2026-10-21 (credito in esaurimento)

Un task alla volta, niente sub-agenti in parallelo; commit e push dopo OGNI passo e aggiornamento di `state.md`/`task.md` prima di cambiare task. Prossimi candidati (cloud, uno per volta): (1) `npm run check` verde = solo le note R5 (rimandate al locale); (2) M12 nomi delle note nella partitura (da valutare con l'utente: serve prima una decisione su do fisso/mobile, alterazioni, vocali); (3) rendere `tests/note.test.mjs` meno rigido? (no: e' la guardia voluta); (4) rifinire loop dei timbri tenuti dopo l'ascolto M9; (5) R4/T-911 vibrato (solo con istruzioni); i resti sono dell'utente in locale (vedi il riepilogo sotto).

## Riepilogo 2026-10-21 sera (credito quasi finito: tutto committato e pushato)

- **Fatti oggi:** U1 pytest completo (3253 passati; correzioni T-919), test offline/axe/tastiera degli strumenti, mix cantato+strumento per voce (M7), dinamica nelle note (T-921, 66 brani), player per 23 brani in lavorazione (M8/T-920), caso Lutkin PREPARATO (T-913, non attivo), scansione catalogo (`docs/anomalie-catalogo-2026-10.md` in AIVideoCreator), skill `/voceavoce-segnalazioni` (bozza T-914), idea M12 registrata. e2e strumenti 18/18 verdi.
- **Resta all'utente (in locale):** M9 ascolto; verifica Lutkin sull'edizione e attivazione (`docs/caso-lutkin.md` in AIVideoCreator); note R5 dei due brani (serve la rete: e' l'unico rosso di `npm run check`); rilanciare `job_sito_player --in-lavorazione --scrivi` sulla macchina RENDER PRIMA di pubblicare i 22 'da-caricare' (hanno gli stem); decidere se includere i 3 brani 'pubblicato' senza voci pubblicabili; rivedere sulle fonti i brani con regola `dinamica` (177, 259, 305, 039, aria-012); P8 corona singola.
- **Non fatto:** M11 (pannello Suono nella scheda brano: scartato, la scheda non ha mixer), M12 (nomi delle note, da valutare), M5-M6 (togliere l'MP3, in coda), 5 test di rendering/ffmpeg Linux e cmudict/googleapiclient mancanti nel cloud.

## Come proseguire in locale (se la sessione cloud si ferma)

- **Stato git (2026-10-20 sera):** tutto è su GitHub. Sito: branch `claude/voceavocecoro-video-portal-s3o8vi` (ultimo commit 3ba5686 + questo). AIVideoCreator: stesso nome di branch, ultimo commit cd9f63a (T-915); `main` di entrambi non è ancora toccato (nessuna PR aperta).
- **Sito:** `git fetch origin claude/voceavocecoro-video-portal-s3o8vi && git checkout claude/voceavocecoro-video-portal-s3o8vi && git pull && npm ci`. Controlli: `npm run check`, `npm run e2e` (completo, da rifare in locale: l'esecuzione cloud non ha finito prima dell'interruzione; il solo `tests/e2e/strumenti.spec.mjs` è verde 9/9), `npm run a11y` (da fare sul nuovo pannello «Suono»). In locale `jsdom` è installato, quindi `tests/musicxml.test.mjs` deve passare; `tests/note.test.mjs` fallisce per scelta se un brano pubblicato non ha le note in 5 lingue.
- **AIVideoCreator:** branch di lavoro come sopra; per rigenerare i dati del sito `cd pipeline-core && python -m scripts.cli.job_sito_player --brano <rank> --scrivi --solo-note --out <percorso del sito>` (ripetibile per rank; per l'elenco vedi gli `slug_sito` in `projects-instances/*/roadmap/brani/*.json`).
- **Campioni degli strumenti:** `python3 tools/strumenti/genera.py --soundfont <GeneralUser-GS.sf2>` (servono fluidsynth, ffmpeg, numpy); i file sono già in git, rigenerare solo se cambia il catalogo.
- **Prossimi passi, in ordine:** (1) M9 ascolto in locale (`node scripts/serve-audio.mjs` + `npm run serve`, poi `/player/locus-iste-bruckner/`, scegliere «Strumenti»); (2) rifare e2e completo e a11y; (3) M10 chiavi di `note.json` per i 15 brani con parti mancanti (pipeline); (4) caso Lutkin R13/T-913, R14/T-914, R4/T-911; (5) PR del branch quando l'utente lo chiede.

## Aggiornamento 2026-10-20 (sera): modalità strumenti implementata

- **Fatto** (M0-M4): campioni in git (6 strumenti, 2,7 MB, da GeneralUser GS con FluidSynth: `tools/strumenti/genera.py`), `note.json` per i 141 brani (AIVideoCreator T-915, cd9f63a), motore (`schedule.js`, `synth.js`, `strumenti.js`, `suono.js`, `engine.js`), pannello «Suono» in 5 lingue, fallback Opus → MP3 → strumenti, cache offline dei campioni nel service worker, attribuzione in «Fonti e licenze». 9 test e2e nuovi + unitari. Vedi `docs/player.md` («Modalità strumenti») e `docs/midi-player.md`.
- **Decisioni dell'utente:** MIDI/campioni nel repo; licenza verificata (GeneralUser GS ammesso, WebAudioFont GPL-3.0 scartata); MP3 restano finché non c'è un problema di spazio (M5-M6 in coda).
- **Controlli (2026-10-20 sera):** e2e completo 358/358 verdi (22,8 min); `validate`, `secrets`, `build`, `lint:html` OK; `a11y` 17/17 senza errori (il pannello «Suono» compare solo a audio caricato, quindi pa11y potrebbe non averlo visto: da riprovare a mano); `npm test` 233/234: resta solo `tests/note.test.mjs`, perché due brani pubblicati non hanno la nota (`o-lord-in-thee-is-all-my-trust-tallis`, `tres-morillas-m-enamoran`: nessuna nota nei dati della pipeline, vedi R5; da scrivere con fonti, non a memoria).
- **M10 fatto** (T-918, AIVideoCreator 4afb889): i `note.json` di tutti i brani coprono le tracce del manifest, senza parti in più; `npm test` 233/234 (resta la guardia sulle note, vedi sopra), e2e strumenti 9/9.
- **Da fare:** M9 ascolto dell'utente (timbri, loop dei timbri tenuti, livelli) PRIMA della pubblicazione; poi Lutkin (R13), R14, R4. Nessuna PR aperta: il lavoro è sul branch di sviluppo.

## Aggiornamento 2026-10-20: piano del player con strumenti MIDI

- Scritto [midi-player.md](midi-player.md) (analisi, formato `note.json`, architettura, rischi, fasi) e aggiunta la sezione **M** a `task.md` (M0-M8). Nessun codice ancora.
- Decisioni dell'utente: gli strumenti MIDI fanno da **fallback quando l'Opus non funziona**, al posto dell'MP3, che si elimina (F1 diventa M5-M6) solo dopo il fallback in produzione e i dati di Analytics; il default non è il coro ma il **pianoforte** per le voci, con l'accompagnamento in uno strumento diverso (organo).
- Da decidere (M0): dove stanno i campioni (R2 o libreria in git: tocca la regola «audio mai in git»), licenza del soundfont, soglia per togliere l'MP3. Prima dell'implementazione: spike M1 con ascolto dell'utente.
- Ordine di lavoro proposto: caso Lutkin (R13) → R14 → M0/M1 → R4. Numeri T riservati in AIVideoCreator: T-915, T-916 (T-917 solo se sampler nostro).

## Riepilogo precedente (2026-10-18 sera, C1-C3 fatti, player in rifinitura)

- **Unite su `main` (online):** #4 (player: scelta battuta, Ripeti in riquadro, tempi radi, cursore sulla prima nota), #5 (asset versionati `?v=hash`), #6 (C1, traduzioni dei 20 testi comuni in 5 lingue, non riviste), #7 (dichiarazione sull'uso dell'IA: pagina Trasparenza + etichetta sulle note), #8 (anti-segreti: `npm run secrets`, in `check` e in CI), #9 (CI: e2e in 3 job paralleli, ~6 min invece di ~15), #10 (C2, note it/en/es dei brani pubblicati), #11 (C3, interfaccia in tedesco e francese + note de/fr, menu lingua a tendina), #12 (player: pannello di caricamento con barra, partitura a schermo intero, su telefono al Riproduci).
- **Aperta:** **#13** «Tutte le voci pari» (pulsante nel mixer che annulla La mia voce e Solo); conflitti risolti, check in corso, la unisce l'utente.
- **Rallentamento (R4, MUST HAVE, non adesso):** causa trovata, è il vibrato delle voci Synth V che il time-stretching rallenta; prova da fare = attenuare il vibrato nei rendering (AIVideoCreator T-911). `?stretch=voci` non serve.
- **Branch sperimentale (non in PR, da scartare):** `fix/player-qualita-rallentamento`: `?debug&stretch=voci` usa uno stretcher SoundTouch per voce (default invariato: uno sul mix). Serve a capire se i suoni «sporchi»/l'intonazione instabile a velocità ridotta dipendono dal mix delle quattro voci. Misure in Node sul soprano di Agnus Dei (70% e 50%): scarto d'intonazione ~10-11 cent (Rubber Band 12), nessuna differenza cambiando i parametri WSOLA (`quickSeek`, overlap, sequenza, finestra) né il resampling lineare/Lanczos: l'algoritmo da solo non spiega ciò che l'utente sente; da capire con la prova in browser.
- **AIVideoCreator (`main`, pushato):** T-908 unito (copia della partitura senza battuta vuota di coda), T-909 (`_NOTA_LINGUE` con de/fr nell'export per il sito). Le note de/fr dei brani restano nel sito (`content/curated`), non nel contratto `nota_descrizione`.
- **Test da fare dall'utente** (cosa verificare a mano): vedi `task.md`, sezione R, «Prove a mano».
- **Strumenti:** `gh` in `C:\Program Files\GitHub CLI\gh.exe` (login `ezin82`); e2e: `$env:PW_CHROMIUM='C:\Program Files\Google\Chrome\Application\chrome.exe'; npm run e2e -- tests/e2e/player.spec.mjs` (un file alla volta); `npm run check` = validate + secrets + test + build + lint:html. Il test `tests/note.test.mjs` fallisce se un brano appena pubblicato non ha la nota in 5 lingue: è voluto, serve scrivere la nota (`content/curated/<slug>.yaml`).
- **Server locali:** sito su 8080 (`npm run serve`) e audio su 8787 (`node scripts/serve-audio.mjs`), avviati da me; fermarli a fine lavoro.

## Riepilogo precedente (2026-10-18 notte, PR #2 unita, correzioni in corso)

- **PR #2 (player, 140 brani, audio su R2, statistiche) e' gia' unita su `main` e online** (deploy ok). PR #3 (solo docs/script: misura Opus/MP3, punto F1) aperta, da unire. **Lavoro in corso su `fix/player-ripeti-selezione-tempi`** (non ancora in PR): vedi task **P31–P36** in `task.md` (scelta battuta sbagliata sui brani veri, Ripeti poco chiaro e Riproduci dall'inizio, tempi sovrapposti, cursore a meta' battuta, tenore fuori tessitura, e2e da rilanciare).
- **Strumenti:** `gh` installato (`C:\Program Files\GitHub CLI\gh.exe`, login `ezin82` fatto); e2e: `$env:PW_CHROMIUM='C:\Program Files\Google\Chrome\Application\chrome.exe'; npm run e2e -- tests/e2e/partitura.spec.mjs`; con `E2E_SKIP_BUILD=1` non ricostruisce. In PowerShell evitare le virgolette dentro `Select-String`.
- **Token Cloudflare Web Analytics** inserito in `src/_data/site.js` (solo produzione).

## Riepilogo precedente (2026-10-18 notte, PR del player pronta)


- **Fatto stanotte (autonomia):** esportati e caricati su R2 **tutti i brani con stem** (140 player, 1210 file, 1,4 GB su 10 GB gratuiti, verifica HEAD ok). Il player esiste per tutti (pagina nascosta prima dell'uscita: noindex, niente link, sitemap o ricerca; decisione 2026-10-18) e il link dalla scheda compare solo per i brani con video gia' pubblicato (oggi 42), alla build dopo la data. Test: 152 unit; e2e di tutti i brani reali (ha trovato e fatto correggere 3 difetti di layout); a11y 12/12 con il player.
- **Solo resta** nel mixer (decisione utente). Tutte le impostazioni del player: vedi blocco precedente.
- **Non verificato:** l'ultima suite e2e completa e' stata fermata dal sistema (poca memoria) a 244/331 senza errori; mancano partitura/player/pwa/sync-audio dopo le ultime modifiche CSS/JS (task P26). L'organo non e' stato ascoltato.
- **AIVideoCreator:** T-908 ancora solo sul branch `sito-player-senza-coda` (P25); i dati del sito sono gia' generati con quel codice.
- **Ricetta export (da `pipeline-core` del worktree):** `RUNTIME_DIR=C:/source/repos/AIVideoCreator/runtime ../../../../runtime/venv/Scripts/python.exe -m scripts.cli.job_sito_player --brano <rank> ... --scrivi --out C:/source/repos/site --audio-dir C:/source/repos/audio-sito`; poi togliere dai manifest le tracce senza file, `node scripts/upload-audio.mjs` (PowerShell, rclone dal PATH di sistema), commit di `content/player/`.

## Riepilogo precedente (2026-10-18, fine sessione «player in produzione»)


- **Cloudflare fatto.** Account creato; bucket R2 privato `voceavoce-audio`; Worker `voceavoce-audio` pubblicato su
  **https://voceavoce-audio.voceavoce.workers.dev** (sottodominio `workers.dev` scelto: `voceavoce`); `AUDIO_BASE_PRODUZIONE`
  in `src/_data/site.js` punta lì. Credenziali SOLO in `.env.local` (ignorato da git). DNS e posta restano su Aruba, nessuna modifica per R2.
- **3 brani con player e audio su R2** (prova): Marenzio *A d'una fresca riva* (rank 342), Josquin *Agnus Dei* (416), Monteverdi
  *Ave Maria* (407). Dati in `content/player/<slug>/`, audio (18 file) in `C:\source\repos\audio-sito` (fuori dai due repo). Tutti a cappella.
- **Brani con organo e stem pronti** (candidati per provare la traccia di accompagnamento): rank 475 *Ave verum corpus* (Mozart, 4 voci) e
  rank 259 *Good King Wenceslas* (Shaw, 8 voci). Il catalogo ha 24 brani con `accompagnamento: organo` e 2 con pianoforte, ma solo questi due hanno `accompaniment.wav` negli stem.
- **Search Console / Bing.** TXT di verifica aggiunto su Aruba; al 2026-10-17 presente su 2 name server su 4 (dns3.arubadns.net, dns.technorail.com),
  mancava su dns4.arubadns.cz e dns2.technorail.com: verifica Google in attesa di propagazione (fino a 24 h). Sitemap inviata, sito importato in Bing.
- **AIVideoCreator T-908** (branch `sito-player-senza-coda`, worktree `.claude/worktrees/sito-player-senza-coda`, commit `23dece3c`, pushato,
  **NON unito su main**): `job_sito_player` scrive per il sito la partitura di lavoro senza la battuta vuota di coda (R-11); il sync perde quella battuta,
  la durata resta quella dell'audio. Merge a render fermi (regola del `CLAUDE.md` di AIVideoCreator), poi riesportare gli altri brani con lo stesso comando.
- **Branch del sito:** `claude/voceavocecoro-video-portal-s3o8vi` (sempre NON unita su `main`). Ultimo commit pushato `815b83d`; il resto del lavoro
  di questa sessione (mixer, scelta battuta, test, jsdom) e' in commit WIP successivo, vedi `git log`.
- **Interfaccia della partitura (fatta questa sessione, vedi `docs/player.md` §Partitura):** carta bianca di default anche nel tema scuro; pulsante **Opzioni**
  (ingranaggio) nella barra A−/A+ con riquadro: «Evidenzia la mia parte» (fascia gialla sul rigo della voce scelta, acceso), «Cursore che scorre» (acceso)
  + colore, «Evidenzia la battuta» (spento), «Inverti colori»; opzioni in `localStorage` (`va-score-opts`). Cursore (barra dietro le note) da mappa dei tempi
  Verovio + `sync.json`. Sigle dei righi S/A/T/B dal manifest; tempi duplicati dell'XML tolti; zoom iniziale 100/75/60 per larghezza.
- **Mixer: nuova semantica (decisione utente 2026-10-18).** Un solo stato di silenzio: `mute`. **Solo** = scorciatoia che mette in mute tutte le altre voci
  (secondo tocco: tutte in ascolto); il suo `aria-pressed` e' derivato (`isSolo`). Duetto = Solo + togliere il mute a un'altra. L'utente sta valutando di **togliere i
  tasti Solo** e lasciare solo Muta (e magari un «solo la mia voce» vicino a «La mia voce»): **decisione aperta**.
- **Scelta sulla partitura:** ora sceglie la battuta dalla POSIZIONE sul sistema (`battutaAlPunto`), non dal segno colpito; il pulsante e' stato spostato
  nel riquadro **Ripetizione**.
- **Test:** `npm test` = **146 unit test** (nuovi `tests/cursore.test.mjs`, `tests/musicxml.test.mjs` con **jsdom** come devDependency, mixer riscritto in `study.test.mjs`).
  E2E in locale: `PW_CHROMIUM='C:\Program Files\Google\Chrome\Application\chrome.exe'` poi `npm run e2e -- tests/e2e/partitura.spec.mjs` (nuovo spec, ~25 test).
  **Ultimo esito: 3 e2e ROSSI da sistemare** (vedi task P17).
- **Difetti dell'XML del catalogo (PDMX), non del pipeline:** per Marenzio tempo ♩=120 scritto 3 volte, nomi parte «ARIA Player», scritte «b» sperdute. Nel sito si puliscono
  tempi ed etichette; le «b» restano. **Da decidere:** correggere alla fonte (`score_validate.repair`) e controllare se i video li mostrano (le pagine renderizzate sono state cancellate dalla pulizia).
- **Trappole incontrate (ricordarle):** (1) `eleventy --serve` legge dati e i18n **una volta sola**: dopo aver cambiato `src/_data/i18n/*.json` o `content/player/*` va riavviato `npm run serve`;
  (2) il browser puo' tenere in cache una copia **troncata** di `verovio-module.mjs` (7 MB) se la apre mentre Eleventy la ricopia → «Non riesco a mostrare la partitura» /
  `SyntaxError: Invalid or unexpected token`: rifare `fetch(url, {cache:'reload'})` e ricaricare; (3) il service worker serve CSS/JS vecchi in locale: `unregister()` + `caches.delete()`;
  (4) i file del repo sono CRLF nel working tree (autocrlf): nelle sostituzioni da script leggere in modalita' universale e riscrivere con `\r\n`; (5) `input[type=range]` rifiuta in Playwright
  `fill("0.0")` (lo normalizza in "0"): passare `String(Number(x.toFixed(1)))`; (6) un `!` del prompt usa Bash, dove non c'e' Node nel PATH: usare PowerShell.
- **Server di sviluppo** ancora attivo in background sulla porta 8080 (avviato da me con `VOCEAVOCE_AUDIO_BASE` = Worker): fermarlo se non serve.

## Riepilogo precedente (2026-10-16, fine sessione) — in parte superato dal blocco sopra


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
- **(Superato, fatto il 2026-10-18)** Segnaposto `AUDIO_BASE_PRODUZIONE`: ora e' l'URL vero del Worker. Finché non c'è l'URL vero e gli audio non sono caricati, NON aggiungere dati reali in `content/player/` e NON unire su `main` un player che punti al segnaposto.
- **Vincoli fissi dell'utente:**
  - dominio, DNS e posta su **Aruba**: MAI proporre il trasferimento della registrazione;
  - niente pubblicità (gli spazi esistono ma restano spenti), niente cookie di tracciamento;
  - niente YouTube API;
  - commit e push frequenti;
  - sotto-agenti Sonnet/Haiku; solo l'agente principale aggiorna `task.md` e `state.md`.
- **CI:** «Check» gira solo sulle PR (e a mano); «Deploy» su push a `main`, a mano e ogni giorno alle 04:15 UTC. Prima di ogni push con codice: `npm run check` e `npm run a11y` in locale (per a11y serve `PUPPETEER_EXECUTABLE_PATH` verso un Chromium).
- **Test:** `npm test` = 81 unit test; `npm run e2e` = 21 test end-to-end (compreso P15, sincronia contro il clic udibile) Playwright di player e PWA (build non di produzione in `_site-e2e`, dati `_prova`, audio sintetici in memoria), anche nel workflow Check sulle PR. Fase 3 (P12–P14) fatta il 2026-10-16.
- **Prossimo passo:** compiti dell'utente U1–U7 in `task.md` (audio veri, Cloudflare/Worker, URL vero al posto di `CAMBIAMI`), poi PR e merge del player su main.
- **Cose che l'utente fa sul suo PC:** sezione «Da fare dall'utente» in `task.md` (U1–U7).
- **Aperto:** P8, corona singola: `choir._timing_regions` tratta un'unica corona a metà brano come finale e ci mette l'allargando (Locus iste b. 28-29); riguarda anche i video pubblicati. C1 (traduzioni comuni), C2 (note it/en/es) e C3 (interfaccia DE/FR, note DE/FR) fatti il 2026-10-18; restano le note DE/FR nella pipeline e la rilettura umana. A8, primo export ufficiale con `slug_sito`, si fa con lo STAGE 5 della skill.


Aggiornato: 2026-10-18

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
- **Statistiche** (utente 2026-10-17): Google Search Console + Cloudflare Web Analytics, senza cookie; sul DNS Aruba si aggiunge solo il TXT di Google. Guida `docs/statistiche.md`.
- **Lingue DE/FR del sito** (utente 2026-10-17): l'interfaccia resta IT/EN/ES per ora; DE e FR si aggiungono insieme alle traduzioni dei testi cantati e alle note (C1/C2 → C3), così le schede nascono complete. Motivo: le note della pipeline esistono solo in it/en/es, e schede DE/FR senza testo proprio sarebbero contenuto sottile per Google.
- **Testi e note** (utente 2026-10-17): prima A9 (testi cantati nell'export); traduzioni pubblicate anche se non rivista, con l'etichetta «non rivista»; note DE/FR generate nella pipeline (`nota_descrizione` con de/fr), non solo nel sito.

- **Player, interfaccia (utente 2026-10-18):** partitura su carta bianca anche nel tema scuro; cursore stile video (sta DIETRO le note, trasparente, colore configurabile);
  evidenziazione della battuta solo come opzione (spenta); fascia gialla sul rigo della propria voce, anche all'apertura e disattivabile; sigle S/T/B su tutti i righi;
  opzioni in un pulsante «Opzioni» con ingranaggio (non un titoletto a comparsa), sulla stessa riga di A−/A+; «Inverti colori» dentro le opzioni; «Scegli sulla partitura»
  dentro il riquadro Ripetizione; zoom iniziale alto (A+).
- **Mixer (utente 2026-10-18):** Solo = metti in Muta le altre voci (coerente con Muta); per un duetto si toglie il mute a un'altra voce. Valutato: togliere i tasti Solo.
- **Lavoro su AIVideoCreator in un worktree separato** (utente 2026-10-18), con CRLF, test e push dopo ogni commit; merge in `main` a render fermi.
- **Test (utente 2026-10-18):** ogni sviluppo ha unit test, il codice deve essere robusto (valori non validi, storage bloccato, dati mancanti) e i test si aggiornano a ogni correzione approvata.

## Fatti accertati

- La pipeline non chiama API AI: i metadati YouTube sono template Python (`choir_publish.py`, `metadati_seo.py`). L'export costa zero token.
- Roadmap: 489 brani coro, 31 arie, 3 metodi. Video pubblici oggi: 37 voci (9 brani); circa 570 voci programmate.
- Solo il tema chiaro è prodotto: niente selettore chiaro/scuro dei video.
- Capitoli e durata stanno solo in `runtime/` (macchina RENDER): vanno copiati in roadmap (task A4).
- Il genere non esiste nel contratto: campo facoltativo `genere` + regola deterministica.

- (2026-10-17) **Testi cantati quasi assenti sul sito:** dei 40 brani corali già usciti solo 1 ha il testo (sing-joyfully-byrd); su tutto il catalogo 41 brani su 142. Cause: (1) `job_sito_esporta` legge solo `testi/<rank>_<stem>.json`, che esiste per 85 brani, quasi tutti i più recenti (gate dei testi nato dopo); (2) nessun ripiego sui 19 testi comuni di `testi/_comuni/` (ave-maria, ave-verum, o-salutaris… non agganciati); (3) surrexit-pastor-bonus-lasso ha il file ma esce senza testo (da capire); (4) a-d-una-fresca-riva ha il testo che comincia con la parola «Testo» (rumore della fonte). Blocca di fatto C1: le traduzioni non avrebbero un testo originale accanto.

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
- 2026-10-17 — **Statistiche (S1):** GitHub Pages non dà statistiche delle visite. Decisione utente: Google Search Console (verifica con TXT sul DNS Aruba, nessuno script) + Cloudflare Web Analytics (senza cookie, stesso account dell'audio, nessuno spostamento del DNS). Codice pronto e spento (`CLOUDFLARE_ANALYTICS_TOKEN = null`), guida `docs/statistiche.md`, compito utente U8.
- 2026-10-17 — **P15 fatto:** `tests/e2e/sync-audio.spec.mjs` misura il clic che esce davvero dal grafo audio (AudioWorklet «spia» su dry+wet, `getOutputTimestamp`) e lo confronta con il cambio di battuta evidenziata. Con compensazione: mediana −5…+8 ms a 1×, +11…+26 a 0,75×, +2…+8 a 0,5× (max 49). Senza compensazione dello stretcher o del dispositivo: −46…−116 ms, il test fallisce. Soglie: |mediana| ≤ 40 ms, max ≤ 80 ms. Suite e2e ~105 s, 3 run verdi. Nota: in Chrome `getOutputTimestamp()` include già la latenza d'uscita, quindi il test non somma `outputLatency`.
- 2026-10-17 — Decisione sulle lingue: DE/FR rimandate a C3, insieme a C1/C2 (vedi Decisioni prese).
- 2026-10-17 — **A9 fatto (T-906):** testi cantati nell'export, vedi task A9. Verificato a campione: l'Ave verum di Byrd nell'XML canta davvero «unda fluxit sanguine», quindi la variante nel testo è corretta. Scheda: nota «testo liturgico tradizionale, riportato per intero» per i testi comuni, etichetta «traduzione non rivista». Restano 35 brani usciti senza testo (A10, `docs/testi-mancanti.md`). AIVideoCreator T-906 è sul branch, non su main (A11).
- 2026-10-17 — AIVideoCreator T-906 su main (fast-forward a d37860b, render fermi confermati). A10 (T-907) avviato: testi dei 35 brani usciti, ≥2 fonti per brano, verifica con `job_choir_testo`, solo testi di pubblico dominio.
- 2026-10-17 — **A10 bloccato**: nella sessione cloud i siti dei testi non sono raggiungibili (DNS/proxy), nessun file scritto, nessun testo scritto a memoria. Dall'analisi degli XML (da usare alla ripresa):
  - 053 Gorczycki «Omni die dic Mariae»: cantato in **polacco** («Dnia każdego Boga mego Matkę…»), non in latino: la lingua nel contratto va corretta;
  - 015 Chesnokov «Tebe poem»: cantato in inglese, traduzione non standard e probabilmente moderna → da escludere dal sito salvo fonte PD;
  - 034 Ave maris stella (Grieg): inno completo di 7 strofe, manca una chiave in `_comuni` (candidato da aggiungere);
  - 080 Stille Nacht e 004 Star-Spangled Banner: nell'XML solo la prima strofa;
  - 446 e 283 (Guerrero): sillabe fuse nell'XML («dea mor», «queapenas»), da gestire nel gate dei testi.

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
