# A10 in locale: testi cantati dei brani già usciti

Da lanciare sul PC dell'utente con Claude Code, che ha accesso libero al web (la sessione cloud non raggiunge i siti dei testi). Contesto: [task.md](task.md) (A10), elenco dei brani in [testi-mancanti.md](testi-mancanti.md), note dagli XML in [state.md](state.md) (voce del 2026-10-17 «A10 bloccato»).

## Preparazione (PowerShell)

```powershell
# AIVideoCreator: main contiene T-906
cd <percorso>\AIVideoCreator
git checkout main
git pull origin main
# (facoltativo) aggiorna l'indirizzo del remote: GitHub segnala che il repo si è spostato
git remote set-url origin https://github.com/ezin82/AIVideoCreator.git

# Sito: branch di lavoro
cd <percorso>\site
git fetch origin claude/voceavocecoro-video-portal-s3o8vi
git checkout claude/voceavocecoro-video-portal-s3o8vi
git pull origin claude/voceavocecoro-video-portal-s3o8vi
npm ci
```

Controlla che nel `.env` di AIVideoCreator ci sia `VOCEAVOCE_SITE_DIR=<percorso>\site` (compito U2).

## Avvio

Apri Claude Code nella cartella di **AIVideoCreator** e incolla il prompt qui sotto.

## Prompt da incollare

```text
Compito A10 (T-907): testi cantati dei 35 brani corali già usciti che non hanno ancora il riferimento in
projects-instances/choir/sources/pdmx/testi/. Elenco: <percorso del sito>\docs\testi-mancanti.md.
Note già ricavate dagli XML: sezione «A10 bloccato» di <percorso del sito>\docs\state.md.

Regole (oltre a CLAUDE.md: CRLF, encoding, commit «T-907: …» + push subito, tasks.md solo con Grep):
- Lavora su un branch (es. t907-testi), merge in main solo alla fine e a render fermi.
- Per ogni brano crea testi/<rank>_<stem>.json nel formato di testi/README.md, con il testo da ALMENO 2 siti
  (cpdl.org, hymnary.org, wikisource, preces-latinae.org, lieder.net, wikipedia), url e data di consultazione.
  Mai scrivere versi a memoria. Se non trovi 2 fonti, segnalo e passa oltre.
- Il testo deve essere quello CANTATO nell'XML (strofe presenti, varianti): metti per prima la fonte più vicina.
- Verifica ogni brano con job_choir_testo (--help; --registra per salvare l'esito); per i testi liturgici
  standard usa --da-comune <chiave> (--elenca-comuni).
- Solo testi di pubblico dominio: annota autore del testo e anno di morte. Chesnokov «Tebe poem» (015) è cantato
  in una traduzione inglese probabilmente moderna: segnalalo, non pubblicarlo senza fonte PD.
- 053 Gorczycki è cantato in POLACCO: correggi la lingua nel contratto (render_settings.json) e cerca il testo polacco.
- 034 Ave maris stella: valuta di aggiungere la chiave in _comuni/ (testi_comuni.py).
- Lotti da 6-8 brani; dopo ogni lotto: pytest tests/test_sito_esporta.py tests/test_lyrics_check.py
  tests/test_testi_comuni.py -q, poi commit e push.
- Alla fine: da pipeline-core, job_sito_esporta --scrivi (scrive nel clone del sito di VOCEAVOCE_SITE_DIR).
  Gli slug NON devono cambiare (confronta i nomi dei file in content/generated/brani prima e dopo).
  Nel sito: npm run validate; npm test; npm run build; poi commit di content/generated con messaggio
  «dati: testi cantati dei brani usciti (A10) [skip ci]» e push sul branch claude/voceavocecoro-video-portal-s3o8vi.
Rapporto finale: brani fatti / incompleti / segnalati per copyright; brani usciti con testo prima 5/40 → dopo.
```

## Dopo

Torna nella sessione cloud (o in una nuova, dal branch del sito) e scrivi «A10 fatto»: controllo i dati, aggiorno task e stato.
