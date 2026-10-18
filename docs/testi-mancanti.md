# A9 - brani corali pubblicati (pubblica_dal <= 2026-10-17) senza testo sul sito

Pubblicati: 40; con testo: 5; senza: 35. Schede totali con testo: 51/142.

| rank | titolo | compositore | lingua | file testi | slug |
|---|---|---|---|---|---|
| 100 | Adieu Sweet Amaryllis | John Wilbye | en | no | adieu-sweet-amaryllis-wilbye |
| 252 | Angelus ad Virginem | - | la | no | angelus-ad-virginem |
| 019 | Audite silete | Michael Praetorius | la | no | audite-silete-praetorius |
| 034 | Ave Maris Stella | Edvard Grieg | - | no | ave-maris-stella-grieg |
| 197 | Cantate Domino | Giovanni Croce | la | no | cantate-domino-croce |
| 041 | Canticorum Jubilo G | George Frideric Handel | la | no | canticorum-jubilo-g-handel |
| 127 | Duo Seraphim | Tomás Luis de Victoria | la | no | duo-seraphim-victoria |
| 114 | Exultate Deo | Giovanni Pierluigi da Palestrina | la | no | exultate-deo-palestrina |
| 074 | Fair Phyllis I saw | John Farmer | en | no | fair-phyllis-i-saw-farmer |
| 061 | Gaudeamus Igitur | Johannes Brahms | la | no | gaudeamus-igitur-brahms |
| 006 | God so loved the world | John Stainer | en | no | god-so-loved-the-world-stainer |
| 340 | I Saw Three Ships | - | en | no | i-saw-three-ships |
| 077 | In the Bleak Midwinter | Gustav Holst | en | no | in-the-bleak-midwinter-holst |
| 310 | It was a lover and his lass | Thomas Morley | en | no | it-was-a-lover-and-his-lass-morley |
| 096 | Jubilate Deo | Wolfgang Amadeus Mozart | la | no | jubilate-deo-mozart |
| 111 | Lead Me Lord | Samuel Sebastian Wesley | en | no | lead-me-lord-wesley |
| 283 | Los reyes siguen la estrella | Francisco Guerrero | es | no | los-reyes-siguen-la-estrella-guerrero |
| 446 | Niño Dios d'amor herido | Francisco Guerrero | es | no | nino-dios-d-amor-herido-guerrero |
| 017 | O Little Town of Bethlehem | Lewis Redner | en | no | o-little-town-of-bethlehem-redner |
| 287 | O nata lux de lumine | Thomas Tallis | la | no | o-nata-lux-de-lumine-tallis |
| 045 | O vos omnes | Tomás Luis de Victoria | la | no | o-vos-omnes-victoria |
| 053 | Omni die dic Mariae | Grzegorz Gorczycki | la | no | omni-die-dic-mariae-gorczycki |
| 072 | Once in Royal David's City | Henry J. Gauntlett | en | no | once-in-royal-david-s-city-gauntlett |
| 204 | Prado verde y florido | Francisco Guerrero | es | no | prado-verde-y-florido-guerrero |
| 016 | Sicut cervus | Giovanni Pierluigi da Palestrina | la | no | sicut-cervus-palestrina |
| 080 | Stille Nacht | Franz Xaver Gruber | de | no | stille-nacht-gruber |
| 015 | Tebe poem, Op. 27 No. 6 | Pavel Chesnokov | en | no | tebe-poem-chesnokov |
| 073 | The First Nowell | John Stainer | en | no | the-first-nowell-stainer |
| 004 | The Star-Spangled Banner | John Stafford Smith | en | no | the-star-spangled-banner-smith |
| 156 | Vere languores | Tomás Luis de Victoria | la | no | vere-languores-victoria |
| 133 | Verily, verily I say unto you | Thomas Tallis | en | no | verily-verily-i-say-unto-you-tallis |
| 067 | Versa est in luctum | Alonso Lobo | la | no | versa-est-in-luctum-lobo |
| 261 | We Three Kings of Orient Are | John Henry Hopkins Jr. | en | no | we-three-kings-of-orient-are-hopkins |
| 032 | What Child Is This | John Stainer | en | no | what-child-is-this-stainer |
| 059 | While Shepherds Watched Their Flocks By Night | Richard Allison | en | no | while-shepherds-watched-their-flocks-by-night-allison |

## Come riempirli (job_choir_testo / gate testi)
- `job_choir_testo` NON cerca in rete: confronta le sillabe dell'XML con il riferimento `sources/pdmx/testi/<rank>_<stem>.json`, che l'agente scrive a mano da >=2 siti diversi (url, data, testo; vedi testi/README.md); `--registra` salva l'esito nel file.
- Per i testi liturgici standard: `job_choir_testo --brano <rank> --da-comune <chiave>` genera il riferimento dalla libreria `_comuni/` (`--elenca-comuni` per le chiavi); il fallback dell'export copre gia' i casi coerenti senza file.
- Per gli altri (es. Ave Maria di Josquin, Stabat Mater polifonico, brani en/es) serve la ricerca web per brano e poi `--registra`; `job_sito_esporta --scrivi` li porta sul sito solo se la musica e' PD sicura (o testo comune latino).
