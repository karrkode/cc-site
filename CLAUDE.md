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
  (every page, and the open menus and dialogs with their focus in and out, light and dark, desktop and phone width). It needs a running site and Chrome, so it isn't
  a CI job. It is a required check before every PR that touches `public/` (CC-294): run it on the story's preview with the member
  and admin accounts, no skips allowed, and put the result in the PR's test plan. Any failure blocks the PR, unless it passes on two reruns of only that state
  (`A11Y_ONLY=<state>`): then it is flaky, and it is listed in the PR instead. Also run it before
  a release. Setup and options are at the top of the file. It prints violations only.
- Rows and cards draw their focus ring on the whole row (`:has(a:focus-visible)`), so the link itself shows no outline.

## Checking in the browser pane

- Screenshots can lag behind the page. Check state with JS (`javascript_tool`) and click by `find` refs rather than
  by coordinates.
- Reload after JS changes. The local test accounts are in cc-backend/README.md.

## Deploy

- Merging to `main` deploys to S3/CloudFront through GitHub Actions. Afterwards, curl https://chiculturecrew.com
  and grep the changed file to confirm it's live.
