# Player con strumenti MIDI: analisi e piano di sviluppo

Stato (2026-10-20): **M0–M4 fatti** (export note.json T-915, motore, pannello, fallback, 9 test e2e); restano l'ascolto dell'utente (M9), le parti mancanti in 15 brani (M10) e le fasi opzionali. M5-M6 (togliere l'MP3) in coda. Task: sezione **M** di [task.md](task.md). Contesto del player: [player.md](player.md). Misure Opus/MP3: [misure-opus-mp3.md](misure-opus-mp3.md).

## 1. Idea e obiettivi

Oltre agli stem cantati (Synth V, Opus), il player può suonare le **note della partitura** con strumenti sintetici, sincronizzate alla partitura e al cursore come l'audio. Tre obiettivi:

1. **Funzione nuova:** scegliere lo strumento di ogni voce (e dell'accompagnamento). Default: voci in **pianoforte**, accompagnamento in **organo** (il timbro «coro» c'è ma non è il default: il coro GM è poco leggibile per l'intonazione).
2. **Fallback al posto dell'MP3:** se il browser non legge l'Opus (o lo scaricamento/decodifica fallisce) il player passa da solo agli strumenti, invece che all'MP3.
3. **Possibile eliminazione dell'MP3 in futuro** (618 MB su 1,4 GB di R2): rimandata, non decisa.

Vantaggi collaterali: rallentamento **senza artefatti** (si riprogramma il tempo, niente SoundTouch né vibrato, vedi R4/T-911); nessuna latenza dello stretcher; file di poche decine di KB, quindi in cache nella PWA e utilizzabili offline; in prospettiva, player anche per brani **senza render**.

Limiti da dire all'utente: il timbro non è il canto (niente testo, niente fraseggio); gli errori di partitura (caso Lutkin) si sentono uguali.

## 2. Decisioni di progetto

| # | Decisione | Scelta |
|---|---|---|
| D1 | Dove nascono i tempi delle note | **Nella pipeline**, dallo stesso modello dei video (`TempoMap`, corone, respiri, ritardando, `LEAD_IN_SEC`). Mai ricavati nel browser dal timemap di Verovio (usa il tempo dell'XML, non quello di prassi) |
| D2 | Formato | `content/player/<slug>/note.json`, dati in git (non è audio). Schema sotto |
| D3 | Orologio | Lo stesso `sync.json`: gli istanti delle note sono nel tempo del sync (lead-in compreso), quindi cursore, loop e battuta evidenziata non cambiano |
| D4 | Velocità | Nessun time-stretch: la sorgente MIDI ricalcola gli istanti. Percorso **diretto** (ramo `dry`), niente latenza SoundTouch |
| D5 | Scelta strumento | Per traccia, salvata in `localStorage` (con try/catch, solo comodità). Default per linea: *coro* voci pianoforte, accompagnamento organo; *arie/metodi* voce flauto, accompagnamento pianoforte |
| D6 | Fallback | Si attiva se: (a) `canDecodeOpus()` è falso; (b) per una traccia falliscono rete e decodifica. Avviso esplicito e visibile: «Questo browser non legge l'audio cantato: stai ascoltando gli strumenti» |
| D7 | MP3 | **Resta** (decisione 2026-10-20) fino a problemi di spazio; poi si segue M5-M6. Il fallback agli strumenti è l'ultimo anello: Opus → MP3 → strumenti |
| D8 | Mix cantato + strumento | **Fuori dalla prima versione.** Richiede di compensare la latenza dello stretcher sul ramo MIDI (vedi §6). Fase opzionale M7 |

### Decisioni dell'utente (2026-10-20) e verifica delle licenze

- **U-M1 – campioni in git: SÌ.** Gli strumenti stanno nel repo come file del sito (eccezione dichiarata alla regola «audio mai in git», che resta per gli stem dei brani). Vanno quindi in cache nella PWA e il fallback funziona offline. Obiettivo: meno di ~5 MB in tutto.
- **U-M2 – licenze (verificate il 2026-10-20 sui testi originali):**
  - **GeneralUser GS 2.0.3** (il soundfont che già usa la pipeline, S. Christian Collins): «use it in your software projects», uso libero anche commerciale, modifiche e confezionamento ammessi; i campioni ereditano diritti che consentono l'uso in produzione musicale. Riserva dell'autore: l'origine di alcuni campioni non è certa al 100% (nessuno da raccolte commerciali, nessuna contestazione dal 2000). Ammesso. Obblighi pratici: citare l'autore nella pagina «Fonti e licenze» e **non linkare i suoi file direttamente**. Cartella `src/assets/strumenti/` con una `LICENSE-GeneralUser-GS.txt` e `docs/licenze-terze-parti`.
  - **WebAudioFont: GPL-3.0** → **scartata** (copyleft sul sito).
  - **SpessaSynth: Apache-2.0** → ammessa ma non necessaria se si sceglie il sampler nostro.
  - Scelta conseguente: **strada C** (§4), campioni resi dal soundfont già in uso, nessuna libreria di terzi.
- **U-M3 – MP3: restano** finché non ci sono problemi di spazio su R2. Catena di riserva: **Opus → MP3 → strumenti** (gli strumenti scattano se anche l'MP3 fallisce o non c'è). M5 (misura) e M6 (eliminazione dell'MP3) restano in coda, da riprendere solo se lo spazio diventa un problema.

## 3. Formato dei dati

`content/player/<slug>/note.json`, schema 1 (validato in build come manifest e sync):

```json
{
  "schema": 1,
  "fine": 189.643,
  "parti": [
    { "chiave": "soprano", "tipo": "voce", "voce": "S", "note": [[500, 1840, 72], [2340, 920, 74]] },
    { "chiave": "accompagnamento", "tipo": "accompagnamento", "note": [[500, 3680, 48], [500, 3680, 55]] }
  ]
}
```

- Ogni nota: `[inizio_ms, durata_ms, altezza_midi]`, interi, ordinate per inizio. Chiavi uguali a quelle di `manifest.tracce`.
- Tempi nel tempo del sync (lead-in di 0,5 s compreso), con ritornelli espansi come la partitura del sito.
- Legature di valore fuse (stessa strada di `accomp_midi_events` / `stripTies`), note di abbellimento (grace) escluse, accordi come più note allo stesso inizio.
- Dimensione attesa: 4 voci + accompagnamento, ~400 note per parte, ~10–25 KB (5–10 KB con gzip).
- **Velocità (dinamica), facoltativa:** quarto elemento `[inizio_ms, durata_ms, altezza, velocità]`, intero 1-127 come in MIDI; senza, vale 80 (mf). Il sito la traduce in guadagno con la curva `(v/80)^0.9` limitata fra 0,3 e 1,5 (pp ≈ 0,45, p ≈ 0,64, mf 1, f ≈ 1,18, ff ≈ 1,36; escursione moderata perché molti brani stanno fra p e mf). La pipeline la ricava da dinamiche e forcelle della partitura (T-921).

Controlli in build (`checkManifest` accanto a quello del sync): schema = 1; ogni `chiave` presente nel manifest; inizi non decrescenti; altezze 0–127; durate > 0; nessuna nota oltre `fine`.

## 4. Strumenti: tre strade da confrontare nello spike (M1)

| Strada | Pro | Contro |
|---|---|---|
| **A. WebAudioFont** (un file JS per strumento) | Subito pronto, tutti i suoni GM, caricamento per strumento | Peso 0,2–1 MB per strumento; **verificare licenza** della libreria e dei preset; dipendenza esterna |
| **B. Sintetizzatore SF2 in browser** (es. SpessaSynth) + soundfont ridotto ai programmi scelti | Qualità, standard | Peso (soundfont intero decine di MB; ridurlo richiede un passo di build); più codice di terzi |
| **C. Sampler minimo nostro** con campioni resi dalla pipeline con FluidSynth dallo stesso soundfont già in uso (una nota ogni 3 semitoni, 2–3 s, Opus) | Licenza sotto controllo, nessuna libreria, peso piccolo (6 strumenti ≈ 2–4 MB) | Più lavoro nostro; strumenti a suono tenuto (organo, coro) chiedono punti di loop; da scrivere uno script in pipeline |

Lo spike (M1) confronta timbro, peso, tempo di caricamento, licenza e semplicità su Locus iste con un solo strumento (pianoforte) e uno a suono tenuto (organo), e propone la scelta. Strumenti previsti nel catalogo: pianoforte, organo, coro «aah», voce «ooh», flauto, archi (insieme).

## 5. Architettura nel player

Moduli nuovi, funzioni pure testabili con `node:test` come `timeline.js`:

| File | Ruolo |
|---|---|
| `study/schedule.js` (puro) | Dato `parti`, posizione, velocità, loop e finestra di anticipo: elenco delle note da programmare con il loro istante nel contesto audio; gestione del giro del loop; nessun DOM, nessun Web Audio |
| `study/synth.js` | Sorgente MIDI: timer con anticipo (~25 ms di tick, ~150 ms di orizzonte), uno `GainNode` per traccia collegato al bus, note-off con rilascio; `start(pos)`, `stop()`, `setRate()`, `setLoop()` con la stessa semantica di `StudyEngine` |
| `study/strumenti.js` | Catalogo, default per linea (D5), caricamento e cache dei campioni, preferenze |
| `engine.js` (modifiche) | Una traccia ha `kind: "audio" \| "midi"`; `play/pause/seek/setRate/setLoop` inoltrano alla sorgente giusta; `audiblePosition()` in modalità MIDI usa solo la latenza del dispositivo (nessuna latenza dello stretcher); `stretchOk` non limita più la velocità in modalità MIDI |
| `app.js` / UI | Selettore strumento per traccia; indicatore di modalità («Strumenti» / «Cantato»); avviso del fallback; velocità consentita anche sotto 0,5× in modalità MIDI (da valutare) |

Orologio: invariato. `computePosition` con ancoraggio (posizione, tempo del contesto, velocità, loop) vale anche per la sorgente MIDI: l'istante audio di una nota è `anchorTime + (t_nota − anchorPos) / rate`, con il giro del loop gestito da `schedule.js`.

Mixer: guadagni, Solo («muto gli altri») e «la mia voce» agiscono sui `GainNode` di traccia, quindi funzionano senza modifiche concettuali.

PWA: `note.json` è same-origin e va in cache con il resto dei dati del player; i campioni seguono la scelta U-M1. Verovio resta fuori dalla precache come oggi.

## 6. Rischi e mitigazioni

| Rischio | Mitigazione |
|---|---|
| Note su corone, respiri e ritardando fuori sincrono | Tempi dal modello della pipeline (D1) e test di coerenza: primo evento di ogni battuta = `t` del sync entro 1 ms |
| Jitter dello scheduler (main thread occupato) | Programmare con `AudioContext.currentTime` e orizzonte di 150 ms; nessuna nota partita da `setTimeout` direttamente |
| Seek e loop con note ancora in corso | Stop con rilascio rapido (20 ms) di tutte le note, poi riprogrammazione dalla nuova posizione; test e2e dedicati |
| Timbro scadente / non si sente la voce guida | Spike M1 con ascolto dell'utente prima di costruire il resto; pianoforte come default |
| Peso e licenza degli strumenti | U-M1 e U-M2 prima di vendorizzare qualsiasi cosa |
| Utenti con browser senza Opus più numerosi del previsto | Misura prima di togliere l'MP3 (M4); alternativa: stesso Opus in contenitore WebM/CAF per Safari vecchi (da verificare quali contenitori leggono in Web Audio) |
| Mix cantato + strumento sfasato dallo stretcher (133 ms a 1×, ~123 a 0,75×) | Rimandato (D8); in M7 ritardare le note MIDI della latenza del ramo attivo con la tabella `STRETCH_LATENCY` di `latency.js` |

## 7. Piano per fasi

Stime in giorni di lavoro con sub-agenti, test inclusi. Modello consigliato: H = Haiku, S = Sonnet, O = Opus.

### M0 – Decisioni (0,5 gg, utente)
U-M1, U-M2, U-M3. Registrare in `tasks.md` di AIVideoCreator i numeri T riservati (sotto).

### M1 – Spike (2–3 gg, O/S)
Locus iste: export note di prova (script usa-e-getta), tre strade del §4 su due strumenti, pagina di prova fuori dal player. Esito: scelta della strada, peso reale, ascolto dell'utente (timbro, sincronia con cursore a 1× e a 0,75×). **Non si prosegue senza l'ok dell'utente.**

### M2 – Pipeline: export delle note (T-915, 1,5 gg, S)
`job_sito_player` scrive `note.json` accanto a `sync.json`: parti cantate e accompagnamento, dallo stesso modello di tempo (`TempoMap.seconds_at`, `_midi_tempo_marks`), legature fuse, grace escluse. Opzione `--solo-note` per rigenerare senza toccare audio. Test `tests/test_player_note.py`: coerenza con `sync` (inizio battuta = `t` entro 1 ms), numero note = note dell'XML meno legature e grace, determinismo, CRLF/UTF-8. Rigenerazione dei 140 brani e commit nel sito.

### M3 – Sito: motore e interfaccia (3–4 gg, S)
`schedule.js` + test unitari (finestra, loop, velocità, seek), `synth.js`, `strumenti.js`, modifiche a `engine.js`/`app.js`, controllo `note.json` in `src/_lib/studio.js`, selettore strumento e modalità, i18n nelle 5 lingue, `docs/player.md`. Default D5.

### M4 – Fallback Opus → strumenti (1,5 gg, S)
`canDecodeOpus()` falso o tracce non scaricabili/decodificabili → modalità strumenti con avviso (5 lingue). Test e2e: `canPlayType` forzato a stringa vuota; audio 404; evidenziazione in sincronia con il suono di sintesi (spia nel grafo come P15, tolleranza 40/80 ms); loop; velocità 0,75× e 0,5×; seek durante le note; PWA offline in modalità strumenti. Resta l'MP3 come rete di sicurezza.

### M5 – Misura e decisione sull'MP3 (1 gg + 1 settimana di dati)
Dopo il deploy: Cloudflare Web Analytics, quota di browser senza Opus; prova a mano su iPhone/Safari vecchio (utente). Se sotto la soglia U-M3 → M6; altrimenti valutare il contenitore alternativo per Safari.

### M6 – Eliminare l'MP3 (T-916, 1–1,5 gg, S)
Pipeline: `job_sito_player` non converte più l'MP3 e non scrive `riserva`. Sito: `riserva` opzionale e ignorata nel manifest, `resolveAudioUrl` senza ramo MP3, `#fetchDecode` con un solo tentativo e poi fallback a strumenti, `scripts/upload-audio.mjs` senza `*.mp3`, test aggiornati (config, engine, e2e), `docs/r2-setup.md`, `docs/player.md`, `misure-opus-mp3.md` archiviato. Sul bucket R2 l'eliminazione dei `*.mp3` la fa l'utente (`rclone delete --include "*.mp3" --dry-run` prima).

### M7 – Opzionale: mix cantato + strumento (2–3 gg, S/O)
Per voce «Cantato / Strumento». Note MIDI ritardate della latenza del ramo attivo (tabella di `latency.js`); test di sincronia misto con spia nel grafo.

### M8 – Opzionale: brani senza render (2 gg, S)
Player in sola modalità strumenti per i brani con partitura e tempo ma senza stem; pagina nascosta come ora finché il brano non è pubblicato.

**Totale percorso principale (M1–M4 + M6): circa 10–12 giorni di lavoro, più l'attesa dei dati di M5.**

## 8. Numeri T riservati in AIVideoCreator

Da registrare in `tasks.md` quando si parte (ultimo usato: T-914): **T-915** export `note.json` (M2); **T-916** fine dell'MP3 nella conversione (M6); **T-917** solo se si sceglie la strada C: campioni di strumento resi con FluidSynth.

## 9. Definizione di «fatto»

- `npm run check`, `npm run e2e`, `npm run a11y` verdi; test unitari nuovi per `schedule.js`; test Python per l'export.
- Ascolto dell'utente su Locus iste, Ave verum (475, con organo) e un'aria: sincronia, timbro, velocità, loop.
- Il fallback si prova a mano forzando `canPlayType` e, per M6, con un browser reale senza Opus.
- Documentazione: `player.md` (architettura e limiti), `plan.md`, `task.md`, `state.md`.

## 10. Idee da valutare (non pianificate)

- **Nomi delle note al posto del testo (M12, 2026-10-21).** Mostrare nella partitura il nome di ogni nota (do re mi… oppure C D E…, con eventuale vocale per cantarci sopra) come supporto al solfeggio cantato e alla lettura; insieme agli strumenti permette di studiare l'intonazione senza il testo. Aperte: do fisso o mobile, alterazioni, vocali, più strofe, posizione nell'interfaccia. Punto di partenza: `study/musicxml.js` riscrive già il MusicXML prima di Verovio.
