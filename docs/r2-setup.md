# Configurazione di Cloudflare R2 per gli audio del player

Guida per l'autore del sito, da eseguire a mano sul pannello Cloudflare e dal proprio computer Windows. Contesto: [player.md](player.md) e la Fase 2 di [plan.md](plan.md).

> **Da ricontrollare.** Le schermate e i nomi dei menu di Cloudflare cambiano spesso. Prima di agire confronta ogni passo con la documentazione ufficiale (link nei passi). Le informazioni su GitHub Pages e Cloudflare di questa guida non sono state verificate riga per riga sulle pagine ufficiali. Una ricerca in rete ha confermato solo che il dominio personalizzato di un bucket R2 deve appartenere allo stesso account Cloudflare del bucket.

## 1. Prerequisiti e quadro generale

- Un account Cloudflare (il piano gratuito basta; R2 può chiedere una carta di pagamento anche se resti nel livello gratuito).
- Accesso al pannello del registrar dove è registrato `voceavoce.com`.
- Il repo del sito clonato sul PC Windows, con Node.js installato.
- Gli audio già generati da AIVideoCreator (`job_sito_player`) in una cartella locale, fuori dal repo, indicata da `VOCEAVOCE_AUDIO_DIR`.

Quadro generale:

- Il **sito** resta su **GitHub Pages** (`voceavoce.com`, `www.voceavoce.com`).
- Gli **audio** stanno su **Cloudflare R2**, nel bucket `voceavoce-audio`, serviti da `https://audio.voceavoce.com`.
- Gli audio **non entrano mai in git e non passano mai dalla CI**: il `.gitignore` blocca `*.opus *.mp3 *.wav *.flac *.ogg *.m4a`, `audio/`, `audio-local/` e `.env.local`. Il caricamento lo lanci tu a mano con `scripts/upload-audio.mjs`.
- Percorsi sul bucket: `<slug>/<versione>/<voce>.opus` e `.mp3` (per esempio `locus-iste-bruckner/v1/soprano.opus`).

## 2. DNS: spostare la zona `voceavoce.com` su Cloudflare

Per collegare `audio.voceavoce.com` al bucket, il dominio deve essere una zona dello stesso account Cloudflare del bucket. Quindi i nameserver di `voceavoce.com` passano a Cloudflare e **da quel momento tutti i record DNS si gestiscono su Cloudflare**, compresi quelli di GitHub Pages e della posta.

Documentazione ufficiale da consultare:

- Cloudflare, aggiungere un sito: <https://developers.cloudflare.com/fundamentals/manage-domains/add-site/>
- Cloudflare, cambiare i nameserver: <https://developers.cloudflare.com/dns/nameserver-setup/>
- GitHub Pages, dominio personalizzato e record DNS: <https://docs.github.com/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site>

### 2.1 Prima di toccare i nameserver: copia i record attuali

1. Nel pannello DNS del registrar (o del provider DNS attuale) annota **tutti** i record esistenti. Fai uno screenshot o copia il testo.
2. Cerca in particolare i record della posta di `info@voceavoce.com`: **MX**, e i **TXT** per SPF (`v=spf1 ...`), DKIM (nomi tipo `selettore._domainkey`) e DMARC (`_dmarc`). Cerca anche eventuali CNAME di servizio del provider di posta (autoconfig, autodiscover).
3. Se non li copi prima, dopo il cambio dei nameserver la posta può smettere di arrivare.

### 2.2 Aggiungere il dominio a Cloudflare

1. Dashboard Cloudflare → **Add a domain** (o *Onboard a domain*) → scrivi `voceavoce.com` → scegli il piano **Free**.
2. Cloudflare prova a importare da solo i record DNS esistenti. **Non fidarti**: confronta l'elenco importato con quello annotato al punto 2.1 e aggiungi a mano ciò che manca (MX e TXT compresi).
3. Alla fine Cloudflare ti mostra **due nameserver** (formato `nome.ns.cloudflare.com`). Tienili aperti.

### 2.3 Record per GitHub Pages (tutti in modalità **DNS only**)

Nella zona `voceavoce.com` su Cloudflare devono esistere questi record. Per ciascuno la nuvola deve essere **grigia (DNS only)**, non arancione (Proxied).

| Tipo | Nome | Contenuto |
|---|---|---|
| A | `@` | `185.199.108.153` |
| A | `@` | `185.199.109.153` |
| A | `@` | `185.199.110.153` |
| A | `@` | `185.199.111.153` |
| AAAA | `@` | `2606:50c0:8000::153` |
| AAAA | `@` | `2606:50c0:8001::153` |
| AAAA | `@` | `2606:50c0:8002::153` |
| AAAA | `@` | `2606:50c0:8003::153` |
| CNAME | `www` | `voceavoce.github.io` |

Perché **DNS only**: GitHub Pages deve vedere direttamente il tuo dominio per emettere il certificato HTTPS e per far funzionare "Enforce HTTPS". Con la nuvola arancione la richiesta passa da Cloudflare e il certificato di GitHub può restare in attesa o rompersi.

Controlla anche, nel repo del sito su GitHub, in Settings → Pages, che il dominio personalizzato sia `voceavoce.com` (o come lo hai impostato ora) e che il record non cambi. Gli indirizzi sopra sono quelli indicati da GitHub al momento in cui questa guida è stata scritta: **ricontrollali sulla pagina ufficiale di GitHub** prima di inserirli.

### 2.4 Cambiare i nameserver al registrar

1. Nel pannello del registrar cerca la sezione **Nameserver** (o *DNS server*, *Delegazione*) del dominio `voceavoce.com`. Il nome esatto cambia da registrar a registrar.
2. Passa da "nameserver predefiniti" a "nameserver personalizzati" e sostituisci quelli attuali con i due di Cloudflare. Salva.
3. Se il dominio ha **DNSSEC** attivo al registrar, disattivalo prima del cambio (oppure segui le istruzioni di Cloudflare per DNSSEC), altrimenti il dominio può smettere di risolvere.
4. La propagazione può richiedere da pochi minuti a 24-48 ore. Su Cloudflare lo stato diventa **Active** quando ha rilevato i nuovi nameserver.

### 2.5 Verifiche dopo il cambio

1. Sito: apri `https://voceavoce.com` e `https://www.voceavoce.com`: devono rispondere come prima.
2. GitHub: Settings → Pages deve mostrare il dominio senza errori, e "Enforce HTTPS" deve restare attivo.
3. Posta: invia un messaggio di prova a `info@voceavoce.com` e controlla che arrivi.
4. Su Cloudflare, scheda DNS: tutti i record di GitHub Pages devono avere la nuvola grigia.

## 3. Creare il bucket `voceavoce-audio`

1. Dashboard Cloudflare → **Storage & databases** → **R2 object storage** (se è la prima volta, attiva R2).
2. **Create bucket**.
3. Nome: `voceavoce-audio` (deve coincidere con `R2_BUCKET`).
4. **Location**: Automatic. **Default storage class**: Standard.
5. Conferma con **Create bucket**.

Documentazione: <https://developers.cloudflare.com/r2/buckets/create-buckets/>

## 4. Dominio personalizzato `audio.voceavoce.com`

1. Apri il bucket `voceavoce-audio` → **Settings** → sezione **Public access** → **Custom Domains** → **Add**.
2. Scrivi `audio.voceavoce.com` e conferma. Cloudflare crea da solo il record DNS (nella zona che hai spostato al punto 2) e il certificato.
3. Attendi che lo stato diventi **Active**: può servire qualche minuto.
4. Il record creato per `audio` può restare **proxied**: è corretto, serve a Cloudflare per fare cache e per servire il bucket. La regola "DNS only" vale solo per i record di GitHub Pages del punto 2.3.

**Dominio `r2.dev` (Public Development URL).** Nella stessa sezione c'è l'interruttore per il dominio pubblico `https://pub-....r2.dev`. Va usato **solo per i test**: ha limiti di velocità e non è pensato per la produzione, e non permette cache e regole di Cloudflare. Per tenerlo **disattivato** lascia l'interruttore su *Disabled* (cliccando *Disallow* se lo avevi acceso per prova). Il dominio personalizzato non richiede che `r2.dev` sia attivo.

Documentazione: <https://developers.cloudflare.com/r2/buckets/public-buckets/>

## 5. Policy CORS

Bucket → **Settings** → **CORS Policy** → **Add CORS policy** → scheda **JSON** → incolla:

```json
[
  {
    "AllowedOrigins": [
      "https://voceavoce.com",
      "https://www.voceavoce.com",
      "http://localhost:8080",
      "http://127.0.0.1:8080"
    ],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["Range"],
    "ExposeHeaders": ["Content-Length", "Content-Range", "Accept-Ranges", "ETag"],
    "MaxAgeSeconds": 86400
  }
]
```

Poi **Save**. Se il pannello mostra un formato leggermente diverso dal JSON qui sopra (cambia ogni tanto), segui l'esempio ufficiale: <https://developers.cloudflare.com/r2/buckets/cors/>

Perché servono `Range` e gli header esposti:

- Il browser, per riprodurre un audio e per spostarsi nel brano (**seek**), chiede solo una parte del file con l'header `Range: bytes=...`. Il server risponde **206 Partial Content** con `Content-Range`.
- `Range` non è un header "semplice" per CORS: senza averlo in `AllowedHeaders` la richiesta cross-origin viene bloccata.
- `Content-Length`, `Content-Range`, `Accept-Ranges`, `ETag` sono letti da JavaScript (il player decodifica le tracce con Web Audio): se non sono in `ExposeHeaders` il browser li nasconde alla pagina.
- Le origini `http://localhost:8080` e `http://127.0.0.1:8080` servono per `npm run serve` (Eleventy) durante lo sviluppo.

## 6. Cache

- In upload lo script imposta su ogni file `Cache-Control: public, max-age=31536000, immutable` (un anno, mai rivalidato).
- Il percorso `<slug>/<versione>/<voce>.opus` **cambia a ogni rigenerazione** (`v1` → `v2` in `audio_versione` del manifest). Quindi un file già in cache non viene mai servito al posto di uno nuovo: ogni versione ha un URL diverso. Non sovrascrivere mai un file già pubblicato con contenuto diverso nella stessa versione.
- **Facoltativo:** una Cache Rule di Cloudflare sul sottodominio: zona `voceavoce.com` → **Caching** → **Cache Rules** → *Create rule* con filtro *Hostname equals* `audio.voceavoce.com`, azione *Eligible for cache*, e rispetto dell'header di origine (*Use cache-control header if present*). Serve solo se vuoi forzare la cache anche dove R2 non la imposta. Non è necessaria per far funzionare il sito. Documentazione: <https://developers.cloudflare.com/cache/interaction-cloudflare-products/r2/>

## 7. Token API R2

1. Dashboard → **R2 object storage** → **Manage API tokens** (nella pagina di R2, a destra) → **Create API token**.
2. Nome: per esempio `voceavoce-audio-upload`.
3. **Permissions**: **Object Read & Write**.
4. **Specify bucket(s)** / *Apply to specific buckets only*: scegli solo `voceavoce-audio`.
5. **TTL**: a tua scelta (per esempio un anno, oppure illimitato se preferisci non rinnovarlo).
6. **Create API Token**.
7. La pagina mostra **Access Key ID** e **Secret Access Key**, più l'endpoint `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`. Il **segreto si vede una volta sola**: copialo subito in un gestore di password o direttamente in `.env.local` (passo 8b) o nella config di rclone (passo 8a).
8. L'**Account ID** (32 caratteri esadecimali) è nell'URL dashboard e nella pagina R2.

Regole:

- Il token **non deve mai essere valido per tutto l'account**: solo il bucket `voceavoce-audio`.
- Non incollarlo in `.env.example`, nella chat, nei file del repo o in un commit. `.env.local` è già ignorato da git.
- Se il segreto finisce per sbaglio dove non deve, revoca il token dal pannello e creane uno nuovo.

Documentazione: <https://developers.cloudflare.com/r2/api/tokens/>

## 8. Installare rclone su Windows e configurarlo

Installazione, da PowerShell:

```powershell
winget install Rclone.Rclone
```

Chiudi e riapri PowerShell, poi controlla:

```powershell
rclone version
```

Se il comando non si trova, lo script si ferma con "rclone non trovato nel PATH". Alternativa: <https://rclone.org/install/>.

Scegli **una** delle due configurazioni.

### 8a. Remote nella config di rclone

```powershell
rclone config
```

1. `n` (New remote).
2. **name**: lo stesso valore di `RCLONE_REMOTE` (default dello script: `r2`).
3. **Storage**: `s3`.
4. **provider**: `Cloudflare`.
5. **env_auth**: `false` (inserisci le chiavi a mano).
6. **access_key_id** e **secret_access_key**: quelli del passo 7.
7. **region**: `auto` (o lascia il valore predefinito).
8. **endpoint**: `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` (con il tuo Account ID).
9. **acl**: `private`.
10. Il resto, invio per i valori predefiniti. Conferma e `q` per uscire.

Prova: `rclone lsd r2:` deve elencare i bucket (anche solo `voceavoce-audio`). Con un token limitato a un bucket, l'elenco dei bucket può dare errore di permessi: in quel caso prova `rclone lsf r2:voceavoce-audio`.

Con questa strada, in `.env.local` bastano `VOCEAVOCE_AUDIO_DIR`, `R2_BUCKET`, `R2_PUBLIC_BASE` e `RCLONE_REMOTE`; le tre credenziali `R2_*` restano vuote o assenti. Se ne imposti solo alcune, lo script si ferma con "Credenziali R2 incomplete".

### 8b. `.env.local` con le variabili `R2_*`

Nella radice del repo copia `.env.example` in `.env.local`:

```powershell
Copy-Item .env.example .env.local
```

Poi modifica `.env.local` (è ignorato da git):

```ini
VOCEAVOCE_AUDIO_DIR=C:\percorso\della\cartella\audio_sito
R2_ACCOUNT_ID=<i 32 caratteri esadecimali del tuo account>
R2_ACCESS_KEY_ID=<Access Key ID del token>
R2_SECRET_ACCESS_KEY=<Secret Access Key del token>
R2_BUCKET=voceavoce-audio
R2_PUBLIC_BASE=https://audio.voceavoce.com
RCLONE_REMOTE=r2
```

Come funziona (dal codice dello script):

- Le variabili d'ambiente di PowerShell prevalgono su `.env.local`; i valori vuoti contano come non impostati.
- Se `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID` e `R2_SECRET_ACCESS_KEY` sono **tutte e tre** impostate, lo script crea il remote rclone "al volo" (nome = `RCLONE_REMOTE`, provider Cloudflare, endpoint `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`, acl `private`) passando le credenziali al solo processo rclone come variabili d'ambiente, mai come argomenti né stampate. Non serve quindi `rclone config`.
- `VOCEAVOCE_AUDIO_DIR` può essere relativa alla radice del repo o assoluta. Se punta dentro il repo e i file audio non sono ignorati da git, lo script rifiuta di partire.
- **Mai** mettere credenziali vere in `.env.example` o in un commit.

## 9. Uso di `scripts/upload-audio.mjs`

Tutti i comandi da PowerShell, nella radice del repo. Opzioni reali dello script:

| Opzione | Effetto |
|---|---|
| `--slug <X>` (anche `--slug=X`) | solo la cartella di un brano; lo slug ammette minuscole, cifre e trattini |
| `--dry-run` | mostra cosa verrebbe caricato, senza caricare e senza verifica HEAD |
| `--sync` | allinea il bucket alla cartella locale: **cancella su R2** ciò che non esiste in locale |
| `--help` | aiuto |

Lo script usa `rclone copy` per default (non cancella mai nulla) e lancia una passata per estensione (`.opus`, `.ogg`, `.mp3`, `.m4a`, `.flac`, `.wav`) per dare a ciascun tipo il `Content-Type` giusto (`.opus` → `audio/ogg; codecs=opus`, `.mp3` → `audio/mpeg`) e il `Cache-Control` del passo 6, con `--checksum`.

### 9.1 Prova a vuoto

```powershell
node scripts/upload-audio.mjs --slug locus-iste-bruckner --dry-run
```

Output di esempio (messaggi reali dello script, valori di esempio):

```
Sorgente: C:\percorso\audio_sito\locus-iste-bruckner
Destinazione: r2:voceavoce-audio/locus-iste-bruckner
File audio locali: 10 (remote creato al volo dalle variabili R2_*)

$ rclone copy C:\percorso\audio_sito\locus-iste-bruckner r2:voceavoce-audio/locus-iste-bruckner --include *.opus --header-upload Cache-Control: public, max-age=31536000, immutable --header-upload Content-Type: audio/ogg; codecs=opus --checksum --progress --dry-run
...
Dry-run completato: nulla e' stato caricato ne' cancellato.
```

### 9.2 Caricare un brano

```powershell
node scripts/upload-audio.mjs --slug locus-iste-bruckner
```

Dopo il caricamento lo script fa una richiesta **HEAD** su ogni file all'URL pubblico (`R2_PUBLIC_BASE`) e controlla: stato 200, Content-Type giusto, `Cache-Control` con `max-age=31536000`, `Accept-Ranges: bytes`. Senza `R2_PUBLIC_BASE` si ferma e propone `--dry-run`. Esempio di esito:

```
Verifica HEAD su https://audio.voceavoce.com (10 file)...
OK   200 locus-iste-bruckner/v1/soprano.opus  type="audio/ogg" cache="public, max-age=31536000, immutable" ranges="bytes"
...
Caricamento verificato: 10 file OK.
```

In caso di problemi, l'elenco finale ha la forma `Errori (N):` e per ogni file `- <chiave>: HTTP 403; accept-ranges "" (serve "bytes" per Safari)`, e il codice di uscita è 1.

### 9.3 Caricare tutto

```powershell
node scripts/upload-audio.mjs
```

Senza `--slug` carica l'intera `VOCEAVOCE_AUDIO_DIR`. `copy` salta i file già identici (confronto per checksum), quindi si può rilanciare.

### 9.4 `--sync` con conferma

Serve solo se vuoi **togliere da R2** i file che non esistono più in locale.

```powershell
node scripts/upload-audio.mjs --sync --dry-run   # solo anteprima, non chiede nulla e non cancella
node scripts/upload-audio.mjs --sync             # anteprima + conferma + sincronizzazione
```

Lo script richiede un terminale interattivo, mostra l'elenco `[da cancellare]` e poi:

```
SYNC: su R2 verrebbero CANCELLATI 3 file che non esistono in locale.
Per confermare la CANCELLAZIONE su R2 scrivi il nome esatto del bucket (voceavoce-audio):
```

Scrivi `voceavoce-audio` per procedere. Qualsiasi altra risposta: "Conferma non corrispondente: annullato, nessuna modifica." Attenzione: i file cancellati da un percorso già pubblicato rompono i manifest che li citano.

### 9.5 Verifica manuale con curl

In PowerShell usa `curl.exe` (non l'alias `curl`).

```powershell
curl.exe -I https://audio.voceavoce.com/locus-iste-bruckner/v1/soprano.opus
curl.exe -s -D - -o NUL -r 0-99 https://audio.voceavoce.com/locus-iste-bruckner/v1/soprano.opus
curl.exe -s -D - -o NUL -r 0-99 -H "Origin: https://voceavoce.com" https://audio.voceavoce.com/locus-iste-bruckner/v1/soprano.opus
```

Cosa controllare:

- Prima richiesta (HEAD): `HTTP/... 200`, `Content-Type: audio/ogg` (per l'opus lo script carica `audio/ogg; codecs=opus`; Cloudflare può mostrare solo `audio/ogg`), `Accept-Ranges: bytes`, `Cache-Control: public, max-age=31536000, immutable`.
- Seconda richiesta (`-r 0-99`): `HTTP/... 206`, `Content-Range: bytes 0-99/<totale>`, `Content-Length: 100`.
- Terza richiesta (con `Origin`): oltre al 206, `Access-Control-Allow-Origin: https://voceavoce.com` e `Access-Control-Expose-Headers` con `Content-Range`, `Accept-Ranges`, ecc. Se manca, rivedi il passo 5. Prova anche con `Origin: https://example.org`: l'header `Access-Control-Allow-Origin` **non** deve comparire.
- Prova anche l'MP3 di riserva: `Content-Type: audio/mpeg`.

## 10. Sviluppo locale

In sviluppo gli audio non vanno su R2: li serve `scripts/serve-audio.mjs`.

- Server Node senza dipendenze, in ascolto **solo su 127.0.0.1**, porta `VOCEAVOCE_AUDIO_PORT` (default **8787**), sulla cartella `VOCEAVOCE_AUDIO_DIR`.
- Supporta GET, HEAD, OPTIONS, Range (risposte 206) e CORS **solo** per `http://localhost:8080` e `http://127.0.0.1:8080` (le origini di `eleventy --serve`). Non ha `--help` né opzioni: si configura con le variabili d'ambiente. Non è un server di produzione.
- Il player legge la base degli audio dalla variabile `VOCEAVOCE_AUDIO_BASE` (nel `.env.example`: `http://localhost:8787`); in produzione la base è `https://audio.voceavoce.com`.

Come provare il player in locale (due terminali PowerShell nella radice del repo):

```powershell
# terminale 1: audio
node scripts/serve-audio.mjs
# atteso: "Audio di sviluppo: http://localhost:8787  (da <cartella>)"

# terminale 2: sito
npm run serve
```

Poi apri `http://localhost:8080/player/<slug>/`. Nota: `npm run serve` lancia solo `eleventy --serve`, **non** avvia il server degli audio: vanno avviati separatamente. Prova rapida del server audio: `curl.exe -I http://localhost:8787/<slug>/v1/soprano.opus`.

Se `VOCEAVOCE_AUDIO_BASE` non è impostata nel tuo ambiente, controlla come la base arriva alla pagina (`site.audioBase`, vedi [player.md](player.md)): al momento di scrivere questa guida non ho trovato nel repo il file dati che la definisce, quindi verifica che il valore in sviluppo sia `http://localhost:8787`.

## 11. Futuro (solo descritto, niente da fare ora)

- Un secondo bucket **privato** `voceavoce-audio-premium`, senza dominio pubblico, con **gli stessi percorsi** del bucket pubblico.
- Un **Cloudflare Worker** che verifica l'abbonamento dell'utente e restituisce **URL firmati temporanei** verso quel bucket.
- Nel codice del sito `resolveAudioUrl(track)` (`src/assets/js/study/config.js`) è l'**unico punto da cambiare**: oggi compone `base + percorso`, in futuro chiederà l'URL firmato al Worker. I manifest non cambiano, perché contengono solo percorsi relativi.
- Da verificare prima: la licenza dei voicebank Synth V per il download degli stem.

## 12. Problemi frequenti

- **Errore CORS nella console del browser** (`blocked by CORS policy`, spesso solo sul seek): controlla che la policy del passo 5 sia salvata, che l'origine sia scritta esattamente (schema `https://`, nessuna barra finale, `www` compreso) e che `Range` sia in `AllowedHeaders`. Verifica con la terza richiesta curl del passo 9.5. Dopo una modifica la policy può impiegare qualche istante, e il browser tiene in cache il preflight fino a `MaxAgeSeconds`.
- **403 Forbidden**: il dominio personalizzato non è ancora **Active** o non è collegato al bucket giusto; oppure stai usando l'URL `r2.dev` con l'accesso disattivato; oppure (in upload) il token non ha **Object Read & Write** su `voceavoce-audio`. Un errore rclone `AccessDenied` ha la stessa causa. Controlla anche che `R2_ACCOUNT_ID` sia l'account del bucket.
- **404 su un file appena caricato**: percorso diverso dal `file` del manifest (maiuscole, versione `v1`/`v2`, estensione). Confronta con `rclone lsf r2:voceavoce-audio/<slug> -R`.
- **Opus su Safari**: il decoder non sempre riproduce Opus in contenitore Ogg. Il player lo rileva (`canPlayType`) e passa da solo al `riserva`, cioè l'**MP3**. Per questo l'MP3 va caricato sempre accanto all'Opus. `Accept-Ranges: bytes` serve soprattutto a Safari.
- **Certificato del dominio in attesa** (`audio.voceavoce.com` resta *Initializing* o dà errore SSL): aspetta qualche minuto e ricarica; verifica che la zona sia **Active** (nameserver cambiati) e che non ci siano record in conflitto per `audio`. Per il sito su GitHub Pages, "Enforce HTTPS" può restare in grigio finché il certificato non viene emesso: richiede record DNS corretti e **DNS only**.
- **Record di GitHub Pages lasciati in modalità Proxied** (nuvola arancione): rompono l'emissione del certificato e "Enforce HTTPS". Rimettili su **DNS only** (nuvola grigia) e attendi il rinnovo del controllo in Settings → Pages (se serve, rimuovi e reinserisci il dominio personalizzato).
- **`rclone non trovato nel PATH`**: riapri PowerShell dopo `winget install Rclone.Rclone`.
- **`Credenziali R2 incomplete`**: imposta tutte e tre le variabili `R2_*` oppure nessuna (e usa il remote di `rclone config`).
- **`Rifiuto: VOCEAVOCE_AUDIO_DIR e' dentro il repo...`**: sposta la cartella audio fuori dal repo.
