# State — avanzamento e decisioni

Aggiornato: 2026-10-16

## Decisioni prese (utente)

- Hosting invariato: GitHub Pages da `voceavoce/site`, dominio voceavoce.com.
- Stack: Eleventy + Pagefind, build e deploy con GitHub Actions.
- Lingue: interfaccia IT/EN/ES con URL separati; testi cantati anche in DE/FR.
- Backup della landing attuale: tag `landing-v1` + copia in `/classic/` (noindex).
- **Niente YouTube API** (quota e crediti): i dati del sito li esporta la pipeline AIVideoCreator da ciò che ha già in git (roadmap, contratti, compositori, testi, verifiche).
- Lavoro su branch `claude/voceavocecoro-video-portal-s3o8vi` in entrambi i repo; commit e push a ogni punto fermo.
- Esecuzione dei task con sotto-agenti Sonnet/Haiku in base alla difficoltà; questo file e `task.md` li aggiorna solo l'agente principale.

## Fatti accertati

- La pipeline non chiama API AI: i metadati YouTube sono template Python (`choir_publish.py`, `metadati_seo.py`). L'export costa zero token.
- Roadmap: 489 brani coro, 31 arie, 3 metodi. Video pubblici oggi: 37 voci (9 brani); circa 570 voci programmate.
- Solo il tema chiaro è prodotto: niente selettore chiaro/scuro dei video.
- Capitoli e durata stanno solo in `runtime/` (macchina RENDER): vanno copiati in roadmap (task A4).
- Il genere non esiste nel contratto: campo facoltativo `genere` + regola deterministica.

## Avanzamento

- 2026-10-16 — Piano approvato. Scritti in AIVideoCreator `common/sito.py` e `cli/job_sito_esporta.py` (non ancora committati). Primo dry-run: 142 schede (140 coro, 1 aria, 1 metodo), 41 visibili oggi, 93 compositori. Pulizia di titoli e compositori in corso; la regex `_TRATTINO` in `sito.py` è da correggere (il modulo al momento non si importa).
- 2026-10-16 — Accesso GitHub sistemato dall'utente. Regex corretta, commit WIP `T-905` pushato su AIVideoCreator (branch `claude/voceavocecoro-video-portal-s3o8vi`). Dati di esempio reali copiati in `content/generated/` del sito (142 schede, 70 compositori, 7 opere/raccolte): servono a sviluppare il sito, saranno rigenerati dal primo export ufficiale (A8), che salverà anche gli slug in roadmap.
- 2026-10-16 — Tag `landing-v1` creato su `c50b793`, ma il push del tag è rifiutato (403: l'ambiente permette solo il branch di lavoro). Per pubblicarlo, dal tuo computer: `git tag landing-v1 c50b793 && git push origin landing-v1`.
- 2026-10-16 — Organizzazione del lavoro: i sotto-agenti modificano i file ma non fanno commit; commit, push e aggiornamento di `task.md`/`state.md` li fa l'agente principale.
- 2026-10-16 — B0 fatto (Haiku): landing archiviata in `src/static/classic/` (servita su /classic/), verificata via HTTP (noindex presente, asset 200).
- 2026-10-16 — A5-A7 fatti (Haiku): campo `genere` nello `_schema` del contratto, `VOCEAVOCE_SITE_DIR` in `.env.example`, STAGE 5 «Aggiorna il sito» nella skill `voceavoce-publish-choir`, riga in `CLAUDE.md`, voce T-905 in `tasks.md`. Commit pushato su AIVideoCreator.
