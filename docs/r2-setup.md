# Audio del player: Cloudflare R2 e Worker

Guida per l'autore del sito, da eseguire a mano sul pannello Cloudflare e dal proprio computer Windows (PowerShell). Contesto: [player.md](player.md) e la Fase 2 di [plan.md](plan.md).

> **Regole fisse (decisione dell'utente, 2026-10-16).**
> - Dominio, DNS e posta `info@voceavoce.com` restano su **Aruba**. Oggi **non si sposta nulla**.
> - La **registrazione** del dominio non si trasferisce mai: farebbe cessare la casella di posta.
> - Il bucket R2 resta **privato**: niente "Public access", niente `r2.dev`, niente dominio personalizzato sul bucket.
> - Il **CORS sta nel Worker**, non nel bucket: nel bucket non va impostata nessuna policy CORS.

> **Da ricontrollare.** Le schermate e i nomi dei menu di Cloudflare cambiano spesso. Prima di agire confronta ogni passo con la documentazione ufficiale. Nomi e comandi citati qui dal codice del repo (script, variabili, Worker) sono stati controllati sui file; quanto riguarda il pannello Cloudflare, i prezzi e i limiti no.

## 1. Quadro generale

Flusso degli audio:

```
PC locale                      script di caricamento              Cloudflare
VOCEAVOCE_AUDIO_DIR      -->   scripts/upload-audio.mjs     -->   bucket R2 PRIVATO
<slug>/<vN>/<voce>.opus        (rclone, API S3, token R2)         voceavoce-audio
                                                                      |
                                                                      | binding AUDIO (solo lettura, interno)
                                                                      v
                               browser  <--- player sul sito <--- Worker voceavoce-audio
                                             voceavoce.com        https://voceavoce-audio.<sottodominio>.workers.dev
```

- Il **sito** resta su GitHub Pages (`voceavoce.com`). Dominio, DNS e posta restano su Aruba e **non cambiano**.
- Il **bucket** è privato: dall'esterno non si raggiunge. Lo script ci scrive con un token API S3; il Worker lo legge tramite binding.
- Il **Worker** (codice in `workers/audio/`) è l'unico punto pubblico: accetta GET, HEAD e OPTIONS, gestisce Range, ETag, `Cache-Control` e il CORS, risponde 404 senza mai elencare il bucket.
- Gli audio **non entrano mai in git e non passano mai dalla CI**: il `.gitignore` li blocca, come `.env.local`. Il caricamento lo lanci tu con `scripts/upload-audio.mjs`; anche il deploy del Worker lo fai tu, in locale.
- Percorsi sul bucket e sul Worker: `{slug}/vN/{voce}.opus` e `.mp3`, per esempio `locus-iste-bruckner/v1/soprano.opus`.

Prerequisiti: PC Windows con il repo clonato, Node.js 22 o più recente (`package.json` richiede `>=22`), gli audio generati da AIVideoCreator con `job_sito_player` in una cartella fuori dal repo.

## 2. Account Cloudflare e piano gratuito

> Con lo stesso account attiva anche **Cloudflare Web Analytics**, e quando entri nel DNS di Aruba aggiungi il TXT di **Google Search Console**: passi in [statistiche.md](statistiche.md).

1. Vai su <https://dash.cloudflare.com/sign-up> e crea l'account con la tua email. **Non aggiungere il dominio** `voceavoce.com` a Cloudflare: non serve e non va fatto ora. Se la procedura lo propone, salta quel passo.
2. Scegli il **sottodominio workers.dev**: dal pannello, **Workers & Pages** (alla prima visita può chiedere di registrare il sottodominio). Sarà la parte `<sottodominio>` nell'URL `https://voceavoce-audio.<sottodominio>.workers.dev`. È pubblico e difficile da cambiare in seguito: sceglilo con cura.
3. Abilita **R2** (menu **R2 object storage**). Da verificare: può chiedere un metodo di pagamento anche per restare nel livello gratuito. Controlla sulla pagina ufficiale (<https://developers.cloudflare.com/r2/pricing/>) cosa è incluso e imposta, se il pannello lo permette, gli avvisi di spesa.
4. Annota l'**Account ID** (32 caratteri esadecimali, visibile nella pagina di R2 e nell'URL del pannello): serve in `.env.local`.

## 3. Il bucket privato `voceavoce-audio`

1. Pannello → **R2 object storage** → **Create bucket**.
2. Nome: esattamente `voceavoce-audio` (è scritto in `wrangler.toml` e in `.env.example`). Location: automatica va bene.
3. Dopo la creazione apri il bucket → **Settings** e controlla:
   - **Public access** / **R2.dev subdomain**: deve essere **Disabled**. Se è attivo, disattivalo.
   - **Custom domains**: nessuno.
   - **CORS policy**: nessuna. Il CORS lo fa il Worker.
4. Non servono regole di cache né di lifecycle.

## 4. Token API R2 per lo script di caricamento

1. R2 object storage → **Manage API tokens** (a destra nella pagina di R2) → **Create API token**.
2. Nome, per esempio `voceavoce-audio-upload`.
3. **Permissions**: **Object Read & Write**.
4. **Specify bucket(s)** / "Apply to specific buckets only": scegli solo `voceavoce-audio`. **Mai** un token valido per tutto l'account.
5. TTL a scelta. **Create API Token**.
6. La pagina mostra **Access Key ID** e **Secret Access Key**. Il segreto si vede **una volta sola**: copialo subito in `.env.local` (passo 5b) o nella config di rclone (passo 5a).

Dove tenerlo: in `.env.local` (ignorato da git) oppure nella config di rclone del tuo profilo utente. Mai in `.env.example`, in un commit o in chat. Se finisce per sbaglio dove non deve, revoca il token dal pannello e creane uno nuovo.

Documentazione: <https://developers.cloudflare.com/r2/api/tokens/>

## 5. rclone su Windows

Da PowerShell:

```powershell
winget install Rclone.Rclone
```

Chiudi e riapri PowerShell, poi:

```powershell
rclone version
```

Se lo script risponde "rclone non trovato nel PATH", riapri PowerShell o installa da <https://rclone.org/install/>.

Scegli **una** delle due configurazioni.

### 5a. Remote nella config di rclone

```powershell
rclone config
```

1. `n` (New remote). **name**: `r2` (o il valore di `RCLONE_REMOTE`).
2. **Storage**: `s3`. **provider**: `Cloudflare`. **env_auth**: `false`.
3. **access_key_id** e **secret_access_key**: quelli del passo 4.
4. **region**: `auto`. **endpoint**: `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`. **acl**: `private`.
5. Il resto invio. Conferma e `q`.

Prova: `rclone lsf r2:voceavoce-audio` (con un token limitato a un bucket, `rclone lsd r2:` può dare errore di permessi: è normale).

In `.env.local` bastano allora `VOCEAVOCE_AUDIO_DIR`, `R2_BUCKET`, `R2_PUBLIC_BASE`, `RCLONE_REMOTE`; le tre credenziali `R2_*` restano vuote.

### 5b. `.env.local` con le variabili `R2_*`

Nella radice del repo:

```powershell
Copy-Item .env.example .env.local
```

Modifica `.env.local` (ignorato da git):

```ini
VOCEAVOCE_AUDIO_DIR=C:\percorso\della\cartella\audio_sito
R2_ACCOUNT_ID=<32 caratteri esadecimali>
R2_ACCESS_KEY_ID=<Access Key ID del token>
R2_SECRET_ACCESS_KEY=<Secret Access Key del token>
R2_BUCKET=voceavoce-audio
R2_PUBLIC_BASE=https://voceavoce-audio.<sottodominio>.workers.dev
RCLONE_REMOTE=r2
```

Come funziona (dal codice di `scripts/upload-audio.mjs`):

- Le variabili d'ambiente di PowerShell prevalgono su `.env.local`; i valori vuoti contano come non impostati.
- Se `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID` e `R2_SECRET_ACCESS_KEY` sono **tutte e tre** impostate, lo script crea il remote rclone "al volo" (nome = `RCLONE_REMOTE`, provider Cloudflare, endpoint `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`, acl `private`) passando le credenziali al solo processo rclone come variabili d'ambiente, mai come argomenti né stampate. Non serve `rclone config`. Se ne imposti solo alcune: "Credenziali R2 incomplete".
- `VOCEAVOCE_AUDIO_DIR` può essere relativa alla radice del repo o assoluta. Se punta dentro il repo e i file audio non sono ignorati da git, lo script rifiuta di partire.
- `R2_PUBLIC_BASE` è l'URL del **Worker** (il bucket è privato). Serve alla verifica HEAD; senza, lo script si ferma (a meno di `--dry-run`).

## 6. Il Worker

Codice: `workers/audio/src/index.js`; configurazione: `workers/audio/wrangler.toml`. Non ci sono segreti né account ID nel repo: wrangler li prende dal login.

1. **Node 22**, se manca: `winget install OpenJS.NodeJS` (oppure <https://nodejs.org>). Controlla con `node -v` (deve essere v22 o superiore).
2. Dalla radice del repo:

   ```powershell
   cd workers\audio
   npx wrangler login
   ```

   Si apre il browser: autorizza wrangler sul tuo account Cloudflare. Una volta sola.
3. Il binding R2 è già in `wrangler.toml`:

   ```toml
   [[r2_buckets]]
   binding = "AUDIO"
   bucket_name = "voceavoce-audio"
   ```

   Significa: dentro il Worker, `env.AUDIO` è il bucket `voceavoce-audio`, in lettura e senza credenziali. Per questo il bucket può restare privato. `workers_dev = true` pubblica il Worker su `workers.dev`.
4. Pubblica:

   ```powershell
   npx wrangler deploy
   ```

5. L'URL (`https://voceavoce-audio.<sottodominio>.workers.dev`) è stampato al termine del deploy; lo ritrovi nel pannello, **Workers & Pages** → `voceavoce-audio`.
6. Log in tempo reale: `npx wrangler tail`.

Il deploy si fa **sempre in locale**, mai dalla CI, e non richiede alcun segreto nel repo.

### ALLOWED_ORIGINS

In `wrangler.toml`, sezione `[vars]`, è l'elenco (separato da virgole) delle origini che possono leggere gli audio dal browser. Oggi:

```
https://voceavoce.com, https://www.voceavoce.com, https://voceavoce.github.io, http://localhost:8080, http://127.0.0.1:8080
```

Per aggiungere un'origine, scrivila esattamente (schema, nessuna barra finale, porta se c'è) in `ALLOWED_ORIGINS` e rilancia `npx wrangler deploy`. Per le origini non in elenco il Worker non invia `Access-Control-Allow-Origin`.

## 7. Collegare il sito

1. In `src/_data/site.js` sostituisci la costante `AUDIO_BASE_PRODUZIONE` (oggi `https://voceavoce-audio.CAMBIAMI.workers.dev`) con l'URL vero, senza barra finale. Poi commit e push: il deploy del sito parte da solo. (In alternativa, per prove, la variabile `VOCEAVOCE_AUDIO_BASE` ha la precedenza.)
2. Metti lo **stesso URL** in `R2_PUBLIC_BASE` di `.env.local`: lo script verifica con HEAD i file appena caricati.
3. Aggiungi i dati del brano al sito, dalla cartella di AIVideoCreator (pipeline):

   ```powershell
   cd ..\AIVideoCreator\pipeline-core
   ..\runtime\venv\Scripts\python.exe -m scripts.cli.job_sito_player --brano 002 --scrivi
   ```

   Scrive manifest, sync e partitura in `content/player/<slug>/` del sito e gli audio in `VOCEAVOCE_AUDIO_DIR`. Poi commit e push del sito. Fallo **dopo** il primo caricamento su R2 (passo 8): senza audio raggiungibili il player in produzione sarebbe rotto.

## 8. Caricare gli audio

Da PowerShell, nella radice del repo del sito. Opzioni reali di `scripts/upload-audio.mjs`:

| Opzione | Effetto |
|---|---|
| `--slug <X>` (anche `--slug=X`) | solo la cartella di un brano (minuscole, cifre, trattini) |
| `--dry-run` | mostra cosa verrebbe caricato, senza caricare e senza verifica HEAD |
| `--sync` | allinea il bucket alla cartella locale: **cancella su R2** ciò che non esiste in locale |
| `--help` | aiuto |

Di default usa `rclone copy` (non cancella mai nulla), con una passata per estensione (`.opus`, `.ogg`, `.mp3`, `.m4a`, `.flac`, `.wav`) per dare il `Content-Type` giusto, `Cache-Control: public, max-age=31536000, immutable` e `--checksum`.

### 8.1 Prova a vuoto

```powershell
node scripts/upload-audio.mjs --slug locus-iste-bruckner --dry-run
```

```
Sorgente: C:\percorso\audio_sito\locus-iste-bruckner
Destinazione: r2:voceavoce-audio/locus-iste-bruckner
File audio locali: 10 (remote creato al volo dalle variabili R2_*)

$ rclone copy ... --checksum --progress --dry-run
...
Dry-run completato: nulla e' stato caricato ne' cancellato.
```

### 8.2 Un brano

```powershell
node scripts/upload-audio.mjs --slug locus-iste-bruckner
```

Dopo il caricamento fa un HEAD su ogni file all'URL del Worker (`R2_PUBLIC_BASE`) e controlla stato 200, Content-Type, `Cache-Control` con `max-age=31536000`, `Accept-Ranges: bytes`:

```
Verifica HEAD su https://voceavoce-audio.<sottodominio>.workers.dev (10 file)...
OK   200 locus-iste-bruckner/v1/soprano.opus  type="audio/ogg" cache="public, max-age=31536000, immutable" ranges="bytes"
...
Caricamento verificato: 10 file OK.
```

Se qualcosa non va: `Errori (N):` con una riga `- <chiave>: HTTP 404; ...` per file, uscita con codice 1. (La verifica fallisce finché il Worker non è stato pubblicato: fai prima il passo 6.)

### 8.3 Tutto

```powershell
node scripts/upload-audio.mjs
```

Senza `--slug` carica tutta `VOCEAVOCE_AUDIO_DIR`. I file identici (checksum) vengono saltati: si può rilanciare.

### 8.4 `--sync` con conferma

Solo per togliere da R2 i file che non esistono più in locale:

```powershell
node scripts/upload-audio.mjs --sync --dry-run   # solo anteprima, non cancella e non chiede nulla
node scripts/upload-audio.mjs --sync             # anteprima + conferma + sincronizzazione
```

Richiede un terminale interattivo, elenca i file `[da cancellare]` e chiede:

```
SYNC: su R2 verrebbero CANCELLATI 3 file che non esistono in locale.
Per confermare la CANCELLAZIONE su R2 scrivi il nome esatto del bucket (voceavoce-audio):
```

Scrivi `voceavoce-audio`. Qualsiasi altra risposta: "Conferma non corrispondente: annullato, nessuna modifica." Attenzione: cancellare un percorso già pubblicato rompe i manifest che lo citano.

## 9. Prove con curl sul Worker

In PowerShell usa `curl.exe` (non l'alias `curl`). Sostituisci `<URL>` con l'URL del Worker.

```powershell
curl.exe -I <URL>/locus-iste-bruckner/v1/soprano.opus
```
Atteso: `200`, `Content-Type: audio/ogg`, `Accept-Ranges: bytes`, `Cache-Control: public, max-age=31536000, immutable`, `ETag`.

```powershell
curl.exe -r 0-99 -o NUL -D - <URL>/locus-iste-bruckner/v1/soprano.opus
```
Atteso: `206`, `Content-Range: bytes 0-99/<totale>`, `Content-Length: 100`. (Su Windows `NUL`, non `/dev/null`.)

```powershell
curl.exe -I -H "Origin: https://voceavoce.com" <URL>/locus-iste-bruckner/v1/soprano.opus
curl.exe -I -H "Origin: https://example.com"   <URL>/locus-iste-bruckner/v1/soprano.opus
```
Atteso: con `voceavoce.com`, `Access-Control-Allow-Origin: https://voceavoce.com` (più `Access-Control-Expose-Headers`); con `example.com` l'intestazione **non** compare.

```powershell
curl.exe -i -X OPTIONS -H "Origin: https://voceavoce.com" -H "Access-Control-Request-Method: GET" -H "Access-Control-Request-Headers: Range" <URL>/locus-iste-bruckner/v1/soprano.opus
```
Atteso: `204`, senza corpo, con `Access-Control-Allow-Methods: GET, HEAD, OPTIONS`, `Access-Control-Allow-Headers: Range, If-None-Match`, `Access-Control-Max-Age: 86400`.

```powershell
curl.exe -i -X POST <URL>/locus-iste-bruckner/v1/soprano.opus
```
Atteso: `405` con `Allow: GET, HEAD, OPTIONS`.

```powershell
curl.exe -i <URL>/locus-iste-bruckner/v1/non-esiste.opus
curl.exe -i <URL>/
```
Atteso: entrambi `404` con testo "Non trovato". La radice non mostra mai un elenco di file. Lo stesso vale per qualsiasi percorso che non abbia la forma `{slug}/vN/{file}.opus|mp3`.

Prova anche l'MP3 di riserva: `Content-Type: audio/mpeg`.

## 10. Sviluppo locale

**Normale**: gli audio di sviluppo li serve `scripts/serve-audio.mjs`: Node senza dipendenze, solo su `127.0.0.1`, porta `VOCEAVOCE_AUDIO_PORT` (default 8787), cartella `VOCEAVOCE_AUDIO_DIR`; GET, HEAD, OPTIONS, Range, CORS per `http://localhost:8080` e `http://127.0.0.1:8080`. Due terminali nella radice del repo:

```powershell
# terminale 1: audio (atteso: "Audio di sviluppo: http://localhost:8787  (da <cartella>)")
node scripts/serve-audio.mjs
# terminale 2: sito
npm run serve
```

Poi apri `http://localhost:8080/player/<slug>/`. `npm run serve` lancia solo `eleventy --serve`: il server degli audio va avviato a parte. Senza `VOCEAVOCE_AUDIO_BASE`, `site.audioBase` in sviluppo è `http://localhost:8787`; nella build di produzione (`ELEVENTY_ENV=production`) è `AUDIO_BASE_PRODUZIONE`.

**Prova del Worker sul bucket vero** (da verificare con la documentazione di wrangler):

```powershell
cd workers\audio
npx wrangler dev --remote --port 8788
```

`--remote` esegue il Worker sull'infrastruttura Cloudflare con il binding collegato al bucket reale. Usa una porta diversa (qui 8788): la predefinita di wrangler (8787) coincide con quella di `serve-audio.mjs`. Poi prova con curl come nel passo 9 sull'indirizzo che wrangler stampa. Test del Worker senza rete: `npm run test:worker`, dalla radice del sito.

## 11. Limiti del piano gratuito

Ordini di grandezza, **da controllare sulle pagine ufficiali** perché cambiano:
- Workers: circa 100.000 richieste al giorno nel piano gratuito, con limiti di tempo CPU per richiesta (<https://developers.cloudflare.com/workers/platform/limits/>).
- R2: circa 10 GB di storage al mese; circa 1 milione di operazioni di classe A (scritture, elenchi) e 10 milioni di classe B (letture) al mese; uscita dati (egress) senza costo (<https://developers.cloudflare.com/r2/pricing/>).

Ogni richiesta al Worker è una lettura R2 (classe B), e il seek di un brano può generare più richieste Range. I file hanno cache del browser di un anno (`immutable`), che riduce le richieste ripetute. Il Worker non usa la cache d'edge. Se i limiti diventassero stretti, valuta il piano a pagamento solo dopo aver controllato i numeri reali nel pannello.

## 12. Futuro (solo da documentare, NON fare ora): `audio.voceavoce.com`

> **ATTENZIONE: non trasferire MAI la registrazione del dominio da Aruba. Farebbe cessare la casella `info@voceavoce.com`.** Quello che segue sposta, se mai servirà, **solo i nameserver**; la registrazione resta su Aruba.

Se un giorno si volesse `https://audio.voceavoce.com` al posto dell'URL `workers.dev`:

1. **Prima di toccare i nameserver**, dal pannello DNS di Aruba leggi **tutti** i record della zona e riportali uno per uno su Cloudflare, confrontandoli a coppie alla fine. Per la posta, tutti: **MX**, **TXT SPF**, **DKIM**, **DMARC**, **CNAME del webmail**, **autoconfig/autodiscover** e simili. Se ne dimentichi uno, la posta può smettere di arrivare o finire in spam.
2. Tutti i record in modalità **DNS only** (nuvola grigia): quelli della posta e quelli di GitHub Pages (`A`, `AAAA` dell'apex e `CNAME` di `www`). Gli IP di GitHub Pages vanno ricontrollati sulla documentazione ufficiale di GitHub (<https://docs.github.com/pages>), non copiati da qui.
3. Solo dopo aver verificato tutto, cambia i **nameserver** presso Aruba con quelli indicati da Cloudflare (la registrazione resta ad Aruba). Dopo la propagazione controlla sito, HTTPS di GitHub Pages e invio/ricezione della posta.
4. Aggiungi al Worker una **route** o un **custom domain** `audio.voceavoce.com` (in `wrangler.toml` o dal pannello) e aggiungi eventualmente la nuova origine, se serve, a `ALLOWED_ORIGINS`.
5. Nel sito cambia **solo** `AUDIO_BASE_PRODUZIONE` in `src/_data/site.js` (e `R2_PUBLIC_BASE` in `.env.local`).

Il bucket resta comunque privato.

## 13. Futuro premium (solo descritto)

- Un secondo bucket **privato**, `voceavoce-audio-premium`, con **gli stessi percorsi**, collegato al Worker con un secondo binding.
- La verifica dell'abbonamento va nella funzione `authorize()` di `workers/audio/src/index.js` (oggi restituisce sempre `{ ok: true }`; deve ritornare `{ ok: true }` oppure `{ ok: false, status: 401|403 }`), che sceglie il bucket in base al diritto dell'utente.
- Accesso con **URL firmati** temporanei. Nel sito l'unico punto da cambiare è `resolveAudioUrl(track)` in `src/assets/js/study/config.js`; i manifest hanno solo percorsi relativi e non cambiano.
- Da verificare prima: la licenza dei voicebank Synth V per il download degli stem.

## 14. Problemi frequenti

- **Errore CORS nel browser** (`blocked by CORS policy`, spesso sul seek): l'origine non è in `ALLOWED_ORIGINS`, oppure è scritta in modo diverso (schema, `www`, barra finale, porta). Correggi `wrangler.toml`, rilancia `npx wrangler deploy` e verifica con la prova `Origin` del passo 9. Non toccare il CORS del bucket: non è usato.
- **404 per percorso errato**: il formato deve essere `{slug}/vN/{file}.opus` (o `.mp3`): minuscole, cifre e trattini; versione `v1`, `v2`...; nessun altro nome. Confronta con `rclone lsf r2:voceavoce-audio/<slug> -R` e col `file` del manifest.
- **Opus su Safari**: l'Opus in Ogg non è sempre riprodotto. Il player usa da solo l'MP3 di riserva (`riserva` nel manifest): carica sempre l'MP3 accanto all'Opus. `Accept-Ranges: bytes` serve soprattutto a Safari.
- **Il player usa ancora `CAMBIAMI`**: `AUDIO_BASE_PRODUZIONE` in `src/_data/site.js` non è stata aggiornata, oppure il deploy del sito con la modifica non è ancora finito (controlla Actions).
- **Cache del service worker**: gli audio non vengono mai messi in cache dal service worker (né `*.workers.dev`, né l'host di `site.audioBase`, né file `.opus/.mp3/.wav/.flac`, né richieste con Range). Se una pagina del sito sembra vecchia, ricarica forzando (Ctrl+F5) o cancella i dati del sito dal browser.
- **`rclone non trovato nel PATH`**: riapri PowerShell dopo l'installazione.
- **`Credenziali R2 incomplete`**: imposta tutte e tre le variabili `R2_*` oppure nessuna (e usa il remote di `rclone config`).
- **`R2_PUBLIC_BASE non impostato`**: imposta l'URL del Worker o usa `--dry-run`.
- **`Rifiuto: VOCEAVOCE_AUDIO_DIR e' dentro il repo...`**: sposta la cartella audio fuori dal repo.
- **`AccessDenied` di rclone**: il token non ha Object Read & Write su `voceavoce-audio`, o `R2_ACCOUNT_ID` è di un altro account.
