# content/curated — contenuti editoriali

Un file `content/curated/<slug>.yaml` per brano (lo `slug` è quello di `content/generated/brani/`).
Qui si scrive solo ciò che la pipeline non sa. I campi curati **vincono** su quelli generati;
uno slug inesistente è un errore di validazione.

```yaml
nota:                       # nota sul brano, per lingua (anche una sola: le altre ripiegano)
  it: "Testo in italiano."
  en: "English text."
  es: "Texto en español."

traduzioni:                 # del testo cantato; chiave = lingua della traduzione
  it:
    testo: |
      Prima strofa, verso uno
      verso due

      Seconda strofa
    credit: "Nome del traduttore"
    license: "CC BY-SA 4.0"
    reviewed: true          # false/assente: la scheda la segna "non ancora rivista"
  en: { testo: "...", credit: "...", license: "PD", reviewed: false }   # anche de, fr

generi: [sacro, canto-natalizio]   # sostituisce i generi generati

affiliazioni:                      # link sponsorizzati (mai sopra le fonti gratuite)
  - { vendor: "Nome", url: "https://...", label: "Edizione stampata", enabled: true }

percorsi: [concone-50-lezioni-op-9]   # percorsi/serie a cui il brano appartiene
```

Le strofe si separano con una riga vuota; i versi vanno a capo con il solo invio.
