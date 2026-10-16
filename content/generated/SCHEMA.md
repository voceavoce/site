# content/generated — dati scritti dalla pipeline AIVideoCreator

**Non modificare a mano**: questi file li riscrive `job_sito_esporta --scrivi` (repo AIVideoCreator,
`pipeline-core/scripts/cli/job_sito_esporta.py`). Le aggiunte editoriali (note, traduzioni, link)
vanno in `content/curated/<slug>.yaml`.

Schema versione 1.

## brani/<slug>.json

| Campo | Tipo | Note |
|---|---|---|
| `schema` | int | versione del formato |
| `slug` | str | indirizzo della scheda, stabile (salvato in roadmap come `slug_sito`) |
| `linea` | `coro` \| `aria` \| `metodo` | |
| `rank`, `ranks` | str, [str] | catalogo della pipeline (arie/metodi: un rank per registro) |
| `titolo` | str | titolo del brano (`titolo_breve`: titolo della lezione, es. «Lezione n. 1») |
| `compositore` | {id, nome, breve, date?, nascita?, morte?, periodo?, varianti?} | assente = anonimo/tradizionale |
| `opera` | {id, titolo} | opera da cui viene il brano (Messiah HWV 56, Pirro e Demetrio) |
| `raccolta` | {id, titolo, numero?} | raccolta didattica (Arie antiche, Concone op. 9) |
| `stagioni` | [str] | natale, pasqua, quaresima, mariano |
| `generi` | [str] | sacro, canto-natalizio, aria, aria-antica, metodo-vocale... |
| `lingua` | str | lingua cantata (ISO 639-1; `la` = latino) |
| `organico`, `accompagnamento` | str | «SATB»; a_cappella \| organo \| pianoforte \| accompagnamento |
| `tonalita` | {tonica, modo} | solo se certa |
| `tempo_bpm` | int \| [min, max] | |
| `fonte_spartito`, `licenza_spartito` | str | piattaforma e licenza RICONOSCIUTE (mai testo libero) |
| `edizioni_verifica` | [{edizione, editore?, anno?, url?}] | edizioni autorevoli del gate dello spartito |
| `testo` | {lingua, testo, fonte?: {sito, url}} | testo cantato originale (solo musica di pubblico dominio) |
| `nota` | {it?, en?, es?} | nota pubblica del brano |
| `voci` | [{voce, video_id, pubblica_dal, pubblica?, capitoli?, durata_sec?}] | `voce` = S/A/T/B/T1... o registro alta/media/bassa |
| `prima_uscita` | str ISO | |

REGOLA DEL SITO: una voce si mostra se `pubblica` oppure `pubblica_dal` <= ora della build.

## compositori.json, opere.json, indice.json

Elenchi derivati dai brani (id -> dati), e l'indice con `generato` (UTC) e `pipeline` (commit).
