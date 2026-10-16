# Voce a Voce — site

The website of **[voceavoce.com](https://voceavoce.com/)**: a catalog of choral rehearsal
videos, one per piece per voice, with notes, lyrics and translations.

## What this is

A static website built with [Eleventy 3](https://www.11ty.dev/). It has no client-side framework.

- **Three languages.** Italian is at the root (`/`), English at `/en/` and Spanish at `/es/`.
  Pages link to their translations with `hreflang`, and the sitemap lists them.
- **Search** with [Pagefind](https://pagefind.app/), which builds a static index at build time.
  The author and genre pages work without JavaScript.
- **No cookies of its own.** There are no analytics and no tracking scripts.
- **Videos** are embedded from YouTube through `youtube-nocookie.com`, the privacy-enhanced domain.

## Where the data comes from

- `content/generated/` is written by the **Voce a Voce production pipeline**. It contains the
  pieces, composers, works and video IDs. Do not edit these files by hand: the next export
  overwrites them. See [content/generated/SCHEMA.md](content/generated/SCHEMA.md).
- `content/curated/` holds the editorial additions: notes, translations, genres and links. One
  file per piece, named after its slug. See [content/curated/README.md](content/curated/README.md).

The step-by-step guide for the people who write these files is in [docs/CONTENUTI.md](docs/CONTENUTI.md)
(in Italian).

## Working on it

```bash
npm ci               # install dependencies (Node 22, see .nvmrc)
npm run serve        # development server with live reload
npm run check        # validate content, run tests, build, and check HTML
npm run search       # build the search index (run after npm run build)
npm run a11y         # accessibility checks with pa11y-ci and axe
```

`npm run a11y` needs a Chromium browser. The one installed by `npm ci` is used by default. To use
another one, set `PUPPETEER_EXECUTABLE_PATH`.

## Deployment

- **On every push to `main`**, GitHub Actions validates the content, runs the tests, builds the
  site, builds the search index, checks HTML and accessibility, and publishes to GitHub Pages.
  The workflow is [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).
- **Every day at 04:15 UTC** the same workflow runs again. This publishes scheduled videos on the
  day they go live.
- **Other branches and pull requests** run the checks only, without publishing.
  See [`.github/workflows/check.yml`](.github/workflows/check.yml).
- The custom domain is **voceavoce.com** (`src/static/CNAME`).

## Folders

```
content/generated/   data written by the pipeline (do not edit)
content/curated/     editorial notes and translations
src/_data/           site settings, labels and translations (i18n)
src/_includes/       layouts and components
src/_lib/            catalog, formatting, JSON-LD and sitemap code
src/pages/           page templates (pieces, lists, search, info pages)
src/assets/          CSS, JavaScript and images
src/static/          files copied as they are (CNAME, archived old page in classic/)
scripts/             content validation, accessibility and HTML checks
tests/               unit tests
docs/                plan, tasks, state and author guide
```

`/classic/` is the previous landing page, kept as an archive. It is marked `noindex`.

## Brand assets

`assets/avatar.png`, `banner.png` and `watermark.png` are **generated**, not drawn: typography and
shapes composed from open fonts, produced deterministically by the tooling that builds the videos.
Editing them by hand means the next regeneration silently overwrites the change.

They are committed here because this is where the site needs them.

## Documentation

- [docs/plan.md](docs/plan.md): goals and design decisions
- [docs/task.md](docs/task.md): task list and status
- [docs/state.md](docs/state.md): progress log and the steps to go live
- [docs/CONTENUTI.md](docs/CONTENUTI.md): how to update the catalog and the editorial content (Italian)
