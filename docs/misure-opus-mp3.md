# Misure: Opus o MP3 per gli audio del player

**Stato: punto futuro da valutare. Oggi si lascia tutto com'è** (Opus principale, MP3 di riserva per i browser che non leggono Opus). Questo documento serve per non rifare il ragionamento da zero se un giorno si vuole togliere uno dei due formati.

## La domanda

- Togliere l'MP3 di riserva dimezzerebbe quasi lo spazio su R2 (da 1,4 a circa 0,8 GB per 140 brani).
- Tenere **solo MP3** sarebbe più semplice (si apre ovunque), ma l'MP3 ha un ritardo di codifica all'inizio del file che, in teoria, potrebbe sfasare cursore e audio da un browser all'altro.

## Numeri di partenza (2026-10-18, 140 brani)

| formato | peso totale | impostazioni |
|---|---|---|
| Opus | 764 MB | mono, 48 kHz, 64 kbit/s |
| MP3 | 618 MB | mono, VBR qualità 5 (riserva) |

L'MP3 è **più leggero** dell'Opus a queste impostazioni: l'Opus non fa risparmiare spazio.

## Misura in Chrome (2026-10-18)

Script: `scripts/misura-opus-mp3.mjs` (Playwright con Chrome di sistema). Per ogni brano:voce decodifica con Web Audio a 24 kHz (come il player) l'**originale** (FLAC dello stem), l'Opus e l'MP3, poi confronta su 6 secondi dopo l'attacco:

- **sfasamento** (correlazione incrociata, risoluzione 1 campione = 0,04 ms);
- **SNR** in dB dopo l'allineamento e con il guadagno ottimo: più è alto, più la forma d'onda è fedele;
- differenza di **durata** rispetto all'originale.

Campione: 6 brani (*Locus iste*, *Salvation is created*, *Sicut cervus*, *The first Nowell*, *Stille Nacht*, *Jubilate Deo*), soprano e basso, 11 file.

| brano:voce | Opus: sfasamento ms | Opus: SNR dB | MP3: sfasamento ms | MP3: SNR dB | MP3 durata − orig. ms |
|---|---|---|---|---|---|
| salvation-is-created-chesnokov:soprano | 0,00 | 40,9 | 0,00 | 34,7 | 0,0 |
| locus-iste-bruckner:soprano | 0,00 | 37,1 | 0,00 | 37,6 | 0,0 |
| locus-iste-bruckner:basso | 0,00 | 29,8 | 0,00 | 31,8 | 0,0 |
| sicut-cervus-palestrina:soprano | 0,00 | 37,6 | 0,00 | 35,2 | 0,0 |
| sicut-cervus-palestrina:basso | 0,00 | 32,6 | 0,00 | 32,1 | 0,0 |
| the-first-nowell-stainer:soprano | 0,00 | 34,3 | 0,00 | 33,7 | 0,0 |
| the-first-nowell-stainer:basso | 0,00 | 29,6 | 0,00 | 30,8 | 0,0 |
| stille-nacht-gruber:soprano | 0,00 | 34,1 | 0,00 | 31,4 | 0,0 |
| stille-nacht-gruber:basso | 0,00 | 29,5 | 0,00 | 33,0 | 0,0 |
| jubilate-deo-mozart:soprano | 0,00 | 35,7 | 0,00 | 33,6 | 0,0 |
| jubilate-deo-mozart:basso | 0,00 | 28,9 | 0,00 | 29,3 | 0,0 |
| **media** | **0,00** | **33,6** | **0,00** | **33,0** | **0,0** |

## Cosa dicono

- **In Chrome non c'è nessuno sfasamento misurabile**: né l'MP3 né l'Opus. Il ritardo di codifica dell'MP3 risulta compensato dal decoder di Chrome (probabilmente grazie all'intestazione scritta da ffmpeg/LAME: non l'ho verificato) e la durata coincide con l'originale al campione.
- **La qualità è praticamente pari**: SNR medio 33,6 dB (Opus) contro 33,0 dB (MP3); a 6 brani su 11 vince l'Opus, negli altri 5 l'MP3. La differenza non è significativa con questo campione.
- Quindi, **per Chrome, l'MP3 da solo andrebbe bene**. L'argomento a favore dell'Opus («qualità migliore a pari bitrate») qui non si vede, perché l'MP3 ha un bitrate più alto (VBR) e un file ancora più piccolo.

## Cosa NON è stato misurato (da fare prima di decidere)

1. **Safari (macOS e iPhone) e Firefox.** Il rischio vero dell'MP3 sta lì: alcuni decoder non tolgono il ritardo di codifica, e in quel caso l'audio arriverebbe in ritardo rispetto al cursore (nell'ordine di 25-50 ms, da confrontare con la compensazione di latenza già presente nel player). Servono un Mac o un iPhone: Playwright con WebKit sarebbe un'approssimazione.
2. **Quali browser leggono l'Opus:** i Safari più vecchi no, ed è il motivo per cui esiste la riserva MP3. Da verificare con i dati di utilizzo (Cloudflare Web Analytics mostra il tipo di dispositivo) prima di toglierla.
3. **Più voci e brani lunghi** (la misura usa 6 s di un solo punto del brano; un errore di campionamento potrebbe accumularsi su brani da 8 minuti).
4. **Ascolto reale**: l'SNR non dice se un difetto è udibile. Un ascolto a cuffia di un brano in tutti e due i formati va fatto prima di togliere uno dei due.

## Come ripetere la misura

Servono gli audio e gli stem originali (non sono nel repo).

```powershell
# rif.json: { "slug:chiave": "percorso del FLAC originale" }  (i percorsi stanno nel rapporto di job_sito_player)
$env:PW_CHROMIUM = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
node scripts/misura-opus-mp3.mjs --audio-dir C:\source\repos\audio-sito --rif rif.json --out misure.md `
  locus-iste-bruckner:soprano locus-iste-bruckner:basso
```

Senza `--rif` il riferimento è l'Opus (utile per confrontare solo i due formati). Per provare un altro browser, si può copiare la pagina di misura e aprirla a mano: la logica è nella funzione `misura()` dello script (funziona in qualsiasi browser con Web Audio).

## Se si decide di cambiare

- **Togliere l'MP3:** togliere `riserva` dai manifest e dal comando di export (`job_sito_player`), cancellare i `.mp3` da R2 (`upload-audio.mjs --sync` chiede conferma prima di cancellare) e controllare che il player non dipenda dalla riserva (`resolveAudioUrl`, `tests/study.test.mjs`). Sapere che i browser senza Opus resterebbero senza audio.
- **Tenere solo MP3:** `file` punta all'MP3, niente `riserva`; rimisurare con questo script e ricontrollare la sincronia con i test e2e (`tests/e2e/sync-audio.spec.mjs`).
