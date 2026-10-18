---
layout: layouts/base.njk
title: Privacy
description: "Voce a Voce privacy notice: a static site with no cookies, YouTube videos via youtube-nocookie.com, and contact details."
lang: en
routeSection: privacy
permalink: /en/privacy/
---
<div class="wrap">
<article class="info-page">
<!-- EDITORIAL NOTE: review this text before enabling advertising or statistics. -->

# Privacy

{% if site.analytics.attive -%}
Voce a Voce is a static website. It does not use cookies, and Voce a Voce does not collect personal data from visitors.

## Visit statistics

To know how many people visit the site and which pages they read we use **Cloudflare Web Analytics**, which uses no cookies, stores nothing in the browser and does not track people across sites. We only see aggregate data (page views, country, device type, referring site). The service is provided by Cloudflare, Inc.: see the [Cloudflare privacy policy](https://www.cloudflare.com/privacypolicy/).
{%- else -%}
Voce a Voce is a static website. It does not use its own cookies or statistics, and Voce a Voce does not collect personal data from visitors.
{%- endif %}

## YouTube videos

Piece pages embed the YouTube player in privacy-enhanced mode, through the **youtube-nocookie.com** domain. When a piece page opens and the player loads, YouTube may store data in your browser. From that moment, YouTube's and Google's rules apply. See the [Google privacy policy](https://policies.google.com/privacy).

## Error reports

If you use the “Report an error in the score” form, the text you write, the piece, the page and the bar are sent to a private archive on GitHub, which only the people who run the site can read. The email is optional: if you give it, we use it only to reply. The form uses no cookies. If you prefer, write to {{ site.email }}; to have a report deleted, write to us too.

## Contact

For questions about this notice, write to [{{ site.email }}](mailto:{{ site.email }}).

</article>
</div>
