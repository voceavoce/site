# Voce a Voce — site

The landing page behind **[voceavoce.com](https://voceavoce.com/)**.

## What this is

A static page, in three languages (IT/EN/ES), pointing to the project's channels. Plain HTML, CSS
and a little JavaScript — no build step, no framework, no dependencies. Open `index.html` in a
browser and you are looking at the deployed site.

It is served by GitHub Pages from the `main` branch of this repository. `CNAME` holds the custom
domain and `.nojekyll` turns off Jekyll processing; both are versioned, so the deployment
configuration lives with the code rather than only in a settings panel.

## The project

**Voce a Voce** publishes choral rehearsal videos, one per piece per voice: your part in high
contrast, the other voices attenuated, a cursor following the music in real time, and the syllables
underneath.

The scores those videos are made from are corrected by hand and published separately, at
**[voceavoce/scores](https://github.com/voceavoce/scores)** — which is also where to report a wrong
note if you hear one.

## Working on it

```bash
python -m http.server 8000    # then open http://localhost:8000
```

Opening `index.html` directly works too. The `python` server is only worth the trouble when
something depends on being served over HTTP rather than `file://`.

## Brand assets

`assets/avatar.png`, `banner.png` and `watermark.png` are **generated**, not drawn: typography and
shapes composed from open fonts, produced deterministically by the tooling that builds the videos.
Editing them by hand means the next regeneration silently overwrites the change.

They are committed here because this is where the site needs them.
