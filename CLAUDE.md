# cc-site

The static site for chiculturecrew.com: plain HTML, CSS and JS with no build step. ARCHITECTURE.md explains the
whole system (diagrams in `docs/architecture/`). The API is the sibling repo `../cc-backend`, and its docker compose
serves this site locally on http://localhost:4173.

## Code

- `public/js/*.js` are plain scripts, loaded in the order of the `<script>` tags in `public/index.html`. They share
  one global scope, so check that a name is free before adding it.
- `start.js` routes on the URL hash (`#account`, `#submit`, `#approvals`, ...). Links in emails use these.
- Colors are theme tokens. Check new UI in both light and dark themes and at phone width.
- **No pills or rounded chips, ever.** A tag ("Best"), a toggle, a day or time cell is a box with sharp corners (`border-radius: 0`)
  and the slight shadow `box-shadow: var(--lift)`. A chosen cell turns green (`--src-ok-deep`, `--gauge-ok` border) with a tick.
  `design/lakefront-brief.md` (Shape) has the rule; circles stay for people only.

## Accessibility

- `node scripts/test_skip_link.js` runs in CI: the skip link, and unique ids. `scripts/scan_a11y.js` is the full axe scan
  (every page, light and dark, desktop and phone width). It needs a running site and Chrome, so run it before a release
  and after changing a page. Setup and options are at the top of the file. It prints violations only.
- Rows and cards draw their focus ring on the whole row (`:has(a:focus-visible)`), so the link itself shows no outline.

## Checking in the browser pane

- Screenshots can lag behind the page. Check state with JS (`javascript_tool`) and click by `find` refs rather than
  by coordinates.
- Reload after JS changes. The local test accounts are in cc-backend/README.md.

## Deploy

- Merging to `main` deploys to S3/CloudFront through GitHub Actions. Afterwards, curl https://chiculturecrew.com
  and grep the changed file to confirm it's live.
