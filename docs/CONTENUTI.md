# Come aggiornare il catalogo

Questa guida è per chi cura il canale. Spiega come far comparire un video sul sito, come
aggiungere note e traduzioni a un brano e come controllare tutto prima di pubblicare.

Il sito non legge YouTube direttamente. Legge i dati che la pipeline esporta dai file del progetto.
Per questo i dati dei video arrivano sempre attraverso l'esportazione.

---

## 1. Aggiornare il catalogo dopo una pubblicazione

Fai questo passo dopo aver pubblicato o programmato dei video. È l'ultimo passo della skill
`/voceavoce-publish-choir`, in AIVideoCreator (STAGE 5, «Aggiorna il sito»).

1. **Prova a secco.** Dalla cartella `pipeline-core/` esegui:
   ```bash
   ../runtime/venv/Scripts/python.exe -m scripts.cli.job_sito_esporta
   ```
   Il comando non scrive nulla. Mostra quanti brani si aggiungono, si tolgono o cambiano.
2. **Scrivi.** Se il riepilogo va bene, esegui lo stesso comando con `--scrivi`:
   ```bash
   ../runtime/venv/Scripts/python.exe -m scripts.cli.job_sito_esporta --scrivi
   ```
   I file vanno nella cartella indicata da `VOCEAVOCE_SITE_DIR` nel file `.env`, dentro `content/generated/`.
3. **Pubblica il dato.** Nel clone del sito (`voceavoce/site`):
   ```bash
   git add content/generated
   git commit -m "dati: export <data>"
   git push
   ```

Non serve rifare la build. I video programmati compaiono da soli il giorno della loro uscita:
ogni notte, alle 04:15 UTC (06:15 in estate, 05:15 in inverno), il sito si ricostruisce.

Un video privato con una data futura è già nei dati. Non si vede prima di quella data.

---

## 2. Aggiungere note, traduzioni o affiliazioni a un brano

Le aggiunte editoriali stanno in un file per brano, dentro `content/curated/`.

### Il nome del file

Il nome deve essere lo **slug** del brano, più l'estensione `.yaml`. Esempio: `locus-iste-bruckner.yaml`.

Lo slug lo trovi in due posti, e sono uguali:
- il nome del file in `content/generated/brani/` (senza `.json`);
- l'ultima parte dell'indirizzo della scheda, per esempio `voceavoce.com/brani/locus-iste-bruckner/`.

Se il file non ha uno slug esistente, la validazione dà errore. Vedi la sezione 3.

### Esempio completo

```yaml
# content/curated/locus-iste-bruckner.yaml
# Tutti i campi sono facoltativi, tranne quelli dentro una traduzione.
# Una riga che inizia con # è un commento: il sito la ignora.

# Esempio: le note e le traduzioni qui sono di prova, non sono testi approvati.

# Note sul brano. Scrivi almeno una lingua: le altre usano quella disponibile.
nota:
  it: "Bruckner scrisse questo mottetto nel 1869 per il coro della cattedrale di Linz."
  en: "Bruckner wrote this motet in 1869 for the choir of Linz Cathedral."
  es: "Bruckner escribió este motete en 1869 para el coro de la catedral de Linz."

# Traduzioni del testo cantato. La chiave è la lingua della traduzione (it, en, es, de, fr).
traduzioni:
  it:
    testo: |
      Questo luogo è stato fatto da Dio,
      un mistero impareggiabile,
      è senza difetto.

      Seconda strofa
    credit: "Nome del traduttore"   # obbligatorio: chi ha tradotto
    license: "CC BY 4.0"           # obbligatorio: la licenza della traduzione
    reviewed: true                 # true = traduzione rivista; false = il sito mostra «non ancora rivista»

# Generi del brano. Sostituiscono quelli che la pipeline ricava in automatico.
generi: [sacro, canto-natalizio]

# Link per acquistare lo spartito (affiliazione). Compaiono solo se enabled: true.
affiliazioni:
  - vendor: "Nome del negozio"
    url: "https://www.esempio.com/spartito-locus-iste"   # deve iniziare con https://
    label: "Edizione stampata"                          # testo del link (facoltativo)
    enabled: true
```

Non serve usare tutti i campi. Un file con solo `nota` va benissimo.

### Il campo `nota`

- Le lingue ammesse sono `it`, `en`, `es`, `de`, `fr`.
- Ogni nota è una stringa tra virgolette. Non può essere vuota.

### Il campo `traduzioni`

- Ogni traduzione ha tre campi obbligatori: `testo`, `credit`, `license`.
- Le strofe si separano con una riga vuota. I versi vanno a capo con un semplice invio.
- Con `reviewed: false` (o senza il campo) la traduzione è visibile, ma il sito la segna come «non ancora rivista».
- Scrivi `reviewed: true` solo quando qualcuno ha controllato la traduzione.
- Un brano senza traduzioni va bene: il sito mostra solo il testo originale.

### Il campo `generi`

Sostituisce i generi generati in automatico. Usa i nomi che già esistono nel sito, per esempio
`sacro`, `canto-natalizio`, `aria`, `aria-antica`, `metodo-vocale`.

### Il campo `affiliazioni`

- Ogni link ha `vendor`, `url` e `enabled`. `label` è il testo del link: se manca, si usa il nome del negozio.
- Il link compare solo se `enabled: true`. Lo puoi spegnere senza cancellarlo.
- Il sito lo segnala come «link sponsorizzato». Le fonti gratuite di pubblico dominio restano sempre in cima.

### Il campo `percorsi`

Serve a collegare il brano a una serie, per esempio `concone-50-lezioni-op-9`. Per ora non
compare ancora in pagina: puoi lasciarlo vuoto.

---

## 3. Controllare prima di pubblicare

Dalla cartella del sito, dopo aver scaricato le dipendenze con `npm ci` (una volta sola):

```bash
npm run check
```

Il comando controlla in ordine: i dati, i test, la costruzione del sito e la validità dell'HTML.
Se tutto va bene, l'ultima riga dice `OK`. Se trova un errore, si ferma e ti dice dove.

Per i file in `content/curated/` vedi gli errori più comuni qui sotto. Un errore nei file
generati da `scripts/`, o nei test, va segnalato a chi gestisce la pipeline.

| Messaggio (in breve) | Che cosa significa | Che cosa fare |
|---|---|---|
| `file orfano: nessun brano con slug "…"` | Il nome del file non corrisponde a nessun brano. | Controlla lo slug e rinomina il file. Lo slug è in `content/generated/brani/`. |
| `must have required property 'credit'` (o `'license'`, `'testo'`) | Una traduzione non ha uno dei campi obbligatori. | Aggiungi il campo mancante a quella traduzione. |
| `YAML non valido` | Il file ha un errore di sintassi, spesso di indentazione o di virgolette. | Controlla che le righe siano allineate con due spazi. Metti le virgolette intorno ai testi che contengono `:` o `#`. |
| `must match pattern "^https://…"` | Un link di affiliazione non inizia con `https://`. | Correggi l'indirizzo. |
| `must NOT have fewer than 1 characters` | Una nota o una traduzione è vuota. | Scrivi il testo oppure togli la voce. |
| `must be array` | Un campo come `generi` non è una lista. | Usa le parentesi quadre: `generi: [sacro]`. |

Se il controllo dà errore, correggi e rilancia `npm run check`. Quando passa, puoi fare il commit
e il push: il sito si aggiorna da solo.

Per un controllo di accessibilità più completo, lancia anche `npm run a11y`. Serve un browser
Chromium, e viene installato con `npm ci`.

---

## 4. Attivare in futuro la pubblicità e le affiliazioni

### Affiliazioni

Per ogni link di acquisto, metti `enabled: true` nel file del brano (vedi la sezione 2).
La pagina di trasparenza deve restare aggiornata: `src/pages/info/trasparenza.it.md`
(e le versioni in inglese e spagnolo).

### Pubblicità

Oggi la pubblicità è spenta. Per accenderla servono più passi, e non sono solo tecnici.

1. **Scegli il CMP.** Serve un gestore del consenso certificato in Unione Europea (TCF 2.2), perché
   la pubblicità personalizzata richiede il consenso dei visitatori. Il punto in cui inserirlo è
   già segnato in `src/_includes/layouts/base.njk`, con un commento.
2. **Rivedi l'informativa privacy.** Il testo va aggiornato prima di accendere gli annunci:
   `src/pages/info/privacy.it.md`, `privacy.en.md` e `privacidad.es.md`. Il file italiano
   contiene una nota redazionale da togliere quando il testo è pronto.
3. **Inserisci lo snippet della rete pubblicitaria** in `src/_includes/components/ad-slot.njk`,
   dove c'è il commento `snippet rete pubblicitaria`.
4. **Accendi gli spazi.** In `src/_data/site.js` cambia:
   ```js
   ads: { enabled: true },
   ```
5. Esegui `npm run check` e fai il push.

Se il consenso non è ancora pronto, non accendere gli spazi. Le affiliazioni non richiedono questi passi.

---

## 5. Cosa NON fare

- **Non modificare a mano `content/generated/`.** Il prossimo export sovrascrive tutto. Le
  aggiunte si fanno solo in `content/curated/`.
- **Non cambiare uno slug già pubblicato.** L'indirizzo della scheda cambierebbe, e i link
  esterni e i motori di ricerca non lo troverebbero più. Lo slug è stabile: non si rinomina.
- **Non copiare nei file curati gli ID dei video.** Gli ID arrivano dall'esportazione.
- **Non pubblicare testi o traduzioni senza sapere la licenza.** Ogni traduzione deve avere
  `credit` e `license`, e la licenza deve essere quella giusta.
- **Non inserire dati personali** nelle note o nelle traduzioni.
