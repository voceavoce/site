# Statistiche: Google Search Console e Cloudflare Web Analytics

Guida per l'autore del sito, da seguire **insieme** a [r2-setup.md](r2-setup.md): l'account Cloudflare è lo stesso, e la verifica di Search Console si fa sul pannello DNS di Aruba.

GitHub Pages **non** fornisce statistiche sulle visite. Il pannello *Insights → Traffic* del repo conta chi guarda il codice su github.com, non i visitatori di voceavoce.com.

| Strumento | Cosa dice | Costo | Script sul sito |
|---|---|---|---|
| **Google Search Console** | con quali ricerche ti trovano su Google, clic, posizione media, pagine indicizzate ed errori | gratis | nessuno |
| **Cloudflare Web Analytics** | visite e pagine viste, pagine più lette, paese, dispositivo, sito di provenienza, Core Web Vitals | gratis | uno script leggero, senza cookie |
| YouTube Studio | visualizzazioni dei video (anche quelle dal sito) | — | — |

> **Regole fisse (decisione dell'utente, 2026-10-16).**
> - Dominio, DNS e posta `info@voceavoce.com` restano su **Aruba**. Per entrambi gli strumenti **non si spostano i nameserver** e **non si aggiunge il dominio a Cloudflare**.
> - Sul DNS di Aruba si **aggiunge** soltanto un record TXT: i record esistenti (MX, SPF, DKIM, CNAME della posta, record verso GitHub Pages) **non si modificano e non si cancellano**.
> - Niente cookie di tracciamento: Cloudflare Web Analytics non ne usa, quindi non serve il banner per il consenso. La pagina Privacy si aggiorna da sola quando inserisci il token (vedi §2.3).

> **Da ricontrollare.** I nomi dei menu di Aruba, Google e Cloudflare cambiano spesso: confronta ogni passo con le loro guide ufficiali. Quanto riguarda il codice del repo (`src/_data/site.js`, layout, pagina Privacy) è controllato sui file.

## 1. Google Search Console

### 1.1 Proprietà di tipo «Dominio»

1. Vai su <https://search.google.com/search-console> con il tuo account Google.
2. **Aggiungi proprietà** → scegli **Dominio** (non «Prefisso URL») e scrivi `voceavoce.com`. La proprietà «Dominio» copre insieme `https://`, `http://`, `www.` e tutti i sottodomini.
3. Google mostra un record **TXT** del tipo `google-site-verification=XXXXXXXX`. Copialo e **non chiudere** la pagina.

### 1.2 Record TXT sul DNS di Aruba

1. Entra nell'**Area clienti Aruba** → il dominio `voceavoce.com` → **Gestione DNS** (il nome esatto può essere «Gestione DNS e reindirizzamenti» o simile).
2. **Prima di tutto fai uno screenshot** della tabella dei record così com'è: è il tuo backup.
3. **Aggiungi** un nuovo record:
   - tipo **TXT**;
   - nome/host: vuoto oppure `@` (il dominio principale, come chiede il pannello);
   - valore: `google-site-verification=XXXXXXXX` copiato da Google;
   - TTL: quello proposto.
4. Se esiste già un TXT che inizia con `v=spf1`, **lascialo com'è**: è quello della posta. Il TXT di Google è un record **in più**, separato; non va unito all'SPF.
5. Salva. La propagazione può richiedere da qualche minuto a qualche ora.
6. Torna su Search Console e premi **Verifica**. Se fallisce, riprova più tardi: non cambiare altri record.
7. Lascia il record TXT anche dopo la verifica: Google lo ricontrolla periodicamente.

Controllo facoltativo da PowerShell: `Resolve-DnsName voceavoce.com -Type TXT` deve mostrare sia il TXT di Google sia quello SPF, se c'era.

### 1.3 Sitemap

1. In Search Console → **Sitemap** → aggiungi `https://voceavoce.com/sitemap.xml` → **Invia**.
2. La sitemap è generata dal sito a ogni build (con le varianti IT/EN/ES): non va più toccata. Anche `robots.txt` la indica già.
3. Dopo qualche giorno controlla **Pagine** (indicizzazione) e **Risultati multimediali/Video**: le schede-brano hanno i dati strutturati `VideoObject` e `MusicComposition`.

### 1.4 Facoltativo: Bing Webmaster Tools

Su <https://www.bing.com/webmasters> si può **importare il sito da Search Console** con un clic, senza altri record DNS. Bing alimenta anche alcune ricerche fatte con assistenti AI.

## 2. Cloudflare Web Analytics

Usa lo **stesso account Cloudflare** creato per gli audio (r2-setup.md §2). Il dominio **non** va aggiunto a Cloudflare: si usa la modalità con lo script JavaScript, che funziona con il DNS su Aruba.

### 2.1 Aggiungere il sito

1. Pannello Cloudflare → **Analytics & Logs → Web Analytics** (o cerca «Web Analytics» nel pannello).
2. **Add a site** → nome host `voceavoce.com`.
3. Se propone di attivarlo «automaticamente» tramite il proxy di Cloudflare, **non** farlo (richiederebbe di spostare il DNS): scegli lo **snippet JavaScript manuale**.
4. Cloudflare mostra uno snippet simile a:
   ```html
   <script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "0123456789abcdef"}'></script>
   ```
   Ti serve **solo il token** (la stringa dopo `"token":`). Non è un segreto: finisce comunque in ogni pagina pubblica.

### 2.2 Inserire il token nel sito

1. Apri `src/_data/site.js` e sostituisci
   ```js
   const CLOUDFLARE_ANALYTICS_TOKEN = null;
   ```
   con
   ```js
   const CLOUDFLARE_ANALYTICS_TOKEN = "0123456789abcdef";
   ```
2. Commit e push su `main` (o tramite PR): il deploy di GitHub Pages pubblica il sito con lo script.

Comportamento del codice:
- lo script si carica **solo nella build di produzione** (`ELEVENTY_ENV=production`, quella del workflow di deploy): `npm run serve`, i test end-to-end e la CI delle PR non generano visite finte;
- finché il token è `null` non si carica nulla;
- il service worker non intercetta le richieste verso altri domini, quindi non interferisce con lo script.

### 2.3 Pagina Privacy

Con il token impostato, le pagine Privacy IT/EN/ES mostrano da sole la sezione «Statistiche delle visite» (Cloudflare Web Analytics, senza cookie, solo dati aggregati, link alla privacy policy di Cloudflare). Senza token restano come oggi. **Rileggi il testo** prima di attivare: è in `src/pages/info/privacy.it.md`, `privacy.en.md`, `privacidad.es.md`.

### 2.4 Verifica

1. Dopo il deploy apri <https://voceavoce.com>, poi il sorgente della pagina (Ctrl+U): in fondo deve esserci `static.cloudflareinsights.com/beacon.min.js` con il tuo token.
2. Dagli strumenti per sviluppatori (F12 → Rete) la richiesta verso `cloudflareinsights.com` deve rispondere senza errori.
3. Nel pannello Web Analytics i primi dati compaiono in pochi minuti.

Limiti da sapere: chi usa un blocco pubblicità o tracker non viene contato, quindi i numeri sono **per difetto**; le visualizzazioni dei video incorporati restano in YouTube Studio.

## 3. Ordine consigliato

Quando crei l'account Cloudflare e metti mano al DNS:
1. r2-setup.md §2 (account Cloudflare), poi §2.1–2.2 di questa guida (token nel sito);
2. §1.1–1.2 (TXT di Google su Aruba), **una sola modifica DNS**, con lo screenshot prima;
3. il resto di r2-setup.md (bucket, Worker, audio);
4. dopo il primo deploy: sitemap in Search Console (§1.3) e verifica dello script (§2.4).
