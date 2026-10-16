# Player di studio — architettura e formati

Stato: **prototipo (Fase 1)**. Piano in [plan.md](plan.md), Fase 2; task P1–P7 in [task.md](task.md).

## Flusso dei dati

```
AIVideoCreator (macchina RENDER)                      voceavoce/site                 Cloudflare R2
job_sito_player --brano 002 --scrivi
  ├─ manifest.json, sync.json, score.musicxml  ──►  content/player/<slug>/   (in git)
  └─ <voce>.opus / .mp3                        ──►  VOCEAVOCE_AUDIO_DIR/<slug>/<versione>/   (MAI in git)
                                                       scripts/upload-audio.mjs (a mano) ──►  voceavoce-audio/<slug>/<versione>/
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
- `chiave` è il nome del file: soprano, alto, tenore, basso, tenore-1, accompagnamento. Per arie e metodi la chiave è il registro (alta, media, bassa).
- `file` e `riserva` sono **percorsi relativi** alla radice degli audio. Il player li risolve solo con `resolveAudioUrl()`.
- Il manifest non contiene mai URL assoluti né segreti. `licenza.audio` vale `null` finché non viene decisa.

## content/player/<slug>/sync.json

```json
{
  "schema": 1,
  "battute": [ { "m": 0, "numero": "1", "t": 0.5 }, { "m": 1, "numero": "2", "t": 2.61 } ],
  "fine": 182.4
}
```

- Le voci sono in **ordine di esecuzione** (ritornelli espansi).
- `m` è l'indice della battuta nel MusicXML in ordine di documento, partendo da 0: è la stessa numerazione con cui Verovio rende le battute.
- `numero` è l'etichetta scritta in partitura (può essere "0" per la battuta in levare).
- `t` sono i secondi dall'inizio dell'audio, calcolati con lo stesso modello di tempo dei video: tempo di prassi, `TempoMap`, corone, respiri, ritardando, `LEAD_IN_SEC`.

## Configurazione degli audio

- **Base URL in un solo punto** (`site.audioBase`): in produzione `https://audio.voceavoce.com`, in sviluppo `VOCEAVOCE_AUDIO_BASE`, default `http://localhost:8787`, servito da `scripts/serve-audio.mjs` sulla cartella `VOCEAVOCE_AUDIO_DIR`.
- Tutto passa da `resolveAudioUrl(track)`. In futuro questa funzione chiederà a un Cloudflare Worker URL firmati verso il bucket privato `voceavoce-audio-premium`, che userà gli stessi percorsi.
