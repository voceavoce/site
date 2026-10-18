---
layout: layouts/base.njk
title: Datenschutz
description: "Datenschutzhinweis von Voce a Voce: eine statische Website ohne Cookies, YouTube-Videos über youtube-nocookie.com und Kontaktdaten."
lang: de
routeSection: privacy
permalink: /de/datenschutz/
---
<div class="wrap">
<article class="info-page">
<!-- REDAKTIONSHINWEIS: Diesen Text vor dem Einschalten von Werbung oder Statistiken prüfen. -->

# Datenschutz

{% if site.analytics.attive -%}
Voce a Voce ist eine statische Website. Sie verwendet keine Cookies, und Voce a Voce erhebt keine personenbezogenen Daten der Besucher.

## Besuchsstatistik

Um zu wissen, wie viele Menschen die Website besuchen und welche Seiten sie lesen, nutzen wir **Cloudflare Web Analytics**. Der Dienst verwendet keine Cookies, speichert nichts im Browser und verfolgt Personen nicht über Websites hinweg. Wir sehen nur aggregierte Daten (Seitenaufrufe, Land, Gerätetyp, verweisende Website). Der Dienst wird von Cloudflare, Inc. erbracht: siehe die [Datenschutzerklärung von Cloudflare](https://www.cloudflare.com/privacypolicy/).
{%- else -%}
Voce a Voce ist eine statische Website. Sie verwendet weder eigene Cookies noch Statistiken, und Voce a Voce erhebt keine personenbezogenen Daten der Besucher.
{%- endif %}

## YouTube-Videos

Die Seiten der Stücke binden den YouTube-Player im erweiterten Datenschutzmodus über die Domain **youtube-nocookie.com** ein. Wenn eine Seite geöffnet und der Player geladen wird, kann YouTube Daten in deinem Browser speichern. Ab diesem Moment gelten die Regeln von YouTube und Google. Siehe die [Datenschutzerklärung von Google](https://policies.google.com/privacy).

## Fehlermeldungen

Wenn du das Formular „Fehler in der Partitur melden“ nutzt, gelangen dein Text, das Stück, die Seite und der Takt in ein privates Archiv auf GitHub, das nur die Betreuer der Website einsehen können. Die E-Mail-Adresse ist freiwillig: Wenn du sie angibst, nutzen wir sie nur, um dir zu antworten. Das Formular verwendet keine Cookies. Wenn du möchtest, schreib an {{ site.email }}; um eine Meldung löschen zu lassen, schreib uns ebenfalls.

## Kontakt

Bei Fragen zu diesem Hinweis schreib an [{{ site.email }}](mailto:{{ site.email }}).

</article>
</div>
