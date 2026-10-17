---
layout: layouts/base.njk
title: Privacy
description: "Informativa sulla privacy di Voce a Voce: sito statico senza cookie, video YouTube con youtube-nocookie.com e contatti."
lang: it
routeSection: privacy
permalink: /privacy/
---
<div class="wrap">
<article class="info-page">
<!-- NOTA REDAZIONALE: rivedere questo testo prima di attivare pubblicità o statistiche. -->

# Privacy

{% if site.analytics.attive -%}
Il sito non usa cookie, e Voce a Voce non raccoglie dati personali dai visitatori.

## Statistiche delle visite

Per sapere quante persone visitano il sito e quali pagine leggono usiamo **Cloudflare Web Analytics**, che non usa cookie, non salva nulla nel browser e non segue le persone fra un sito e l'altro. Vediamo solo dati aggregati (pagine viste, paese, tipo di dispositivo, sito di provenienza). Il servizio è fornito da Cloudflare, Inc.: trovi i dettagli nella [privacy policy di Cloudflare](https://www.cloudflare.com/privacypolicy/).
{%- else -%}
Il sito non usa cookie né statistiche propri, e Voce a Voce non raccoglie dati personali dai visitatori.
{%- endif %}

## Video di YouTube

Le schede dei brani contengono il player di YouTube in modalità a privacy avanzata, tramite il dominio **youtube-nocookie.com**. Quando la scheda si apre e il player viene caricato, YouTube può salvare dati nel browser. Da quel momento si applicano le norme di YouTube e di Google, che trovi nella [privacy policy di Google](https://policies.google.com/privacy).

## Contatti

Per domande su questa informativa scrivi a [{{ site.email }}](mailto:{{ site.email }}).

</article>
</div>
