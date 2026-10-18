---
layout: layouts/base.njk
title: Confidentialité
description: "Notice de confidentialité de Voce a Voce : un site statique sans cookies, des vidéos YouTube via youtube-nocookie.com et les coordonnées de contact."
lang: fr
routeSection: privacy
permalink: /fr/confidentialite/
---
<div class="wrap">
<article class="info-page">
<!-- NOTE ÉDITORIALE : relire ce texte avant d'activer la publicité ou les statistiques. -->

# Confidentialité

{% if site.analytics.attive -%}
Voce a Voce est un site statique. Il n'utilise pas de cookies, et Voce a Voce ne collecte pas de données personnelles sur les visiteurs.

## Statistiques de visite

Pour savoir combien de personnes visitent le site et quelles pages elles lisent, nous utilisons **Cloudflare Web Analytics**, qui n'utilise pas de cookies, ne stocke rien dans le navigateur et ne suit pas les personnes d'un site à l'autre. Nous ne voyons que des données agrégées (pages vues, pays, type d'appareil, site de provenance). Le service est fourni par Cloudflare, Inc. : voir la [politique de confidentialité de Cloudflare](https://www.cloudflare.com/privacypolicy/).
{%- else -%}
Voce a Voce est un site statique. Il n'utilise ni cookies propres ni statistiques, et Voce a Voce ne collecte pas de données personnelles sur les visiteurs.
{%- endif %}

## Vidéos YouTube

Les fiches des pièces intègrent le lecteur YouTube en mode de confidentialité renforcée, via le domaine **youtube-nocookie.com**. Lorsqu'une fiche s'ouvre et que le lecteur se charge, YouTube peut stocker des données dans ton navigateur. À partir de ce moment, les règles de YouTube et de Google s'appliquent. Voir la [politique de confidentialité de Google](https://policies.google.com/privacy).

## Signalements d'erreurs

Si tu utilises le formulaire « Signaler une erreur dans la partition », le texte que tu écris, la pièce, la page et la mesure arrivent dans une archive privée sur GitHub, accessible uniquement à celles et ceux qui s'occupent du site. L'e-mail est facultatif : si tu le donnes, nous l'utilisons seulement pour te répondre. Le formulaire n'utilise pas de cookies. Si tu préfères, écris à {{ site.email }} ; pour faire supprimer un signalement, écris-nous aussi.

## Contact

Pour toute question sur cette notice, écris à [{{ site.email }}](mailto:{{ site.email }}).

</article>
</div>
