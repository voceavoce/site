# Worker audio (voceavoce-audio)

Piccolo Cloudflare Worker (piano gratuito) che serve gli audio di studio dal bucket R2 **privato**
`voceavoce-audio`, collegato con il binding `AUDIO`. Gestisce GET, HEAD, OPTIONS, Range (206), ETag/304,
CORS per le sole origini di `ALLOWED_ORIGINS` e non elenca mai il bucket. Percorsi: `/{slug}/{versione}/{file}.opus|mp3`.
Il punto per il futuro premium e' la funzione `authorize` in `src/index.js`. Dominio e posta restano su Aruba.

## Comandi (da `workers/audio/`, a mano; wrangler non e' una dipendenza del sito)

    npx wrangler login      # una volta sola
    npx wrangler deploy     # pubblica il Worker
    npx wrangler tail       # log in tempo reale

Test locali (dalla radice del sito): `npm run test:worker`.

## Dopo il deploy

`wrangler deploy` stampa l'URL, del tipo `https://voceavoce-audio.<sottodominio>.workers.dev`
(lo ritrovi anche nella dashboard Cloudflare, Workers & Pages). Copialo:

- in `src/_data/site.js`, nella costante `AUDIO_BASE_PRODUZIONE` (oppure variabile `VOCEAVOCE_AUDIO_BASE` in build);
- in `.env.local`, come `R2_PUBLIC_BASE`, per la verifica HEAD di `scripts/upload-audio.mjs`.

Controllo rapido: `curl -I -H "Range: bytes=0-99" <URL>/<slug>/v1/<voce>.opus` deve dare 206.
