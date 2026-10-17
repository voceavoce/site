---
layout: layouts/base.njk
title: Privacidad
description: "Aviso de privacidad de Voce a Voce: sitio estático sin cookies, vídeos de YouTube con youtube-nocookie.com y contacto."
lang: es
routeSection: privacy
permalink: /es/privacidad/
---
<div class="wrap">
<article class="info-page">
<!-- NOTA EDITORIAL: revisar este texto antes de activar publicidad o estadísticas. -->

# Privacidad

{% if site.analytics.attive -%}
El sitio no usa cookies, y Voce a Voce no recoge datos personales de los visitantes.

## Estadísticas de visitas

Para saber cuántas personas visitan el sitio y qué páginas leen usamos **Cloudflare Web Analytics**, que no usa cookies, no guarda nada en el navegador y no sigue a las personas entre sitios. Solo vemos datos agregados (páginas vistas, país, tipo de dispositivo, sitio de procedencia). El servicio lo presta Cloudflare, Inc.: consulta la [política de privacidad de Cloudflare](https://www.cloudflare.com/privacypolicy/).
{%- else -%}
El sitio no usa cookies ni estadísticas propias, y Voce a Voce no recoge datos personales de los visitantes.
{%- endif %}

## Vídeos de YouTube

Las fichas de las obras incluyen el reproductor de YouTube en modo de privacidad mejorada, a través del dominio **youtube-nocookie.com**. Cuando la ficha se abre y el reproductor se carga, YouTube puede guardar datos en el navegador. Desde ese momento se aplican las normas de YouTube y de Google, que puedes consultar en la [política de privacidad de Google](https://policies.google.com/privacy).

## Contacto

Para preguntas sobre este aviso escribe a [{{ site.email }}](mailto:{{ site.email }}).

</article>
</div>
