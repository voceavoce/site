# Worker segnalazioni (voceavoce-segnala)

Piccolo Cloudflare Worker (piano gratuito) che riceve il modulo «Segnala un errore nello spartito» del sito e lo
gira come **issue di un repository GitHub privato**: a chi cura il sito arriva la notifica di GitHub, a chi segnala non
serve nessun account. Chi visita il sito non vede mai GitHub. Dominio e posta restano su Aruba.

Cosa fa: accetta solo `POST` JSON dalle origini di `ALLOWED_ORIGINS` (CORS), controlla e ripulisce i campi
(testo 3-2000 caratteri, email facoltativa), scarta i robot con un campo trappola nascosto, limita a 5 invii al minuto per
indirizzo, e scrive il testo in un blocco recintato dell'issue (GitHub non vi attiva menzioni né link; l'email resta copiabile).
Senza cookie. Se il Worker non risponde, il modulo mostra l'indirizzo email del sito.

## Da fare una volta sola (a mano)

1. **Repo privato** su GitHub, per esempio `voceavoce/segnalazioni` (Private). Se lo chiami diversamente, cambia
   `GITHUB_REPO` in `wrangler.toml`. Metti il repo in "Watching" per ricevere le notifiche per email.
2. **Token**: GitHub → Settings → Developer settings → Fine-grained tokens → nuovo token, *solo* quel repo,
   permesso **Issues: Read and write** (nient'altro), scadenza a tua scelta.
3. Dalla cartella `workers/segnala/`:

        npx wrangler login                    # una volta sola
        npx wrangler secret put GITHUB_TOKEN  # incolla il token quando lo chiede: non finisce in nessun file
        npx wrangler deploy                   # pubblica il Worker

   Il token non va mai in chat, in `wrangler.toml` o nel repository. Il deploy lo fai tu, mai la CI.
4. `wrangler deploy` stampa l'URL `https://voceavoce-segnala.<sottodominio>.workers.dev`. Copialo in
   `src/_data/site.js`, costante `SEGNALA_URL_PRODUZIONE` (oppure variabile `VOCEAVOCE_SEGNALA_URL` in build).
   Finche' e' `null` il sito non mostra il modulo e il link apre l'email gia' scritta. (Attivato il 2026-10-18: `https://voceavoce-segnala.voceavoce.workers.dev`.)

## Prova

    curl -i -X POST <URL> -H "Content-Type: application/json" -H "Origin: https://voceavoce.com" \
      -d '{"titolo":"Prova","pagina":"https://voceavoce.com/","battuta":"1","lingua":"it","cosa":"Prova di segnalazione"}'

Deve rispondere `200 {"ok":true}` e comparire un'issue nel repo privato (poi chiudila). Codici di errore:
`400` dati non validi, `403` origine non ammessa, `413` troppo grande, `415` non JSON, `429` troppi invii,
`502` GitHub non ha risposto, `503` token o repo non configurati.

## Se arriva spam

Il campo trappola e il limite bastano di solito. In caso contrario si puo' aggiungere il Rate Limiting di Cloudflare
(binding `LIMITE`, gia' usato dal codice se presente) o Cloudflare Turnstile.

## Privacy

I dati (testo, brano, pagina, battuta, email se scritta) stanno solo nel repo privato; la pagina Privacy del sito lo dice
nelle 5 lingue. Per cancellare una segnalazione basta chiudere e rimuovere l'issue.

Test: `npm run test:worker` (dalla radice del sito).
