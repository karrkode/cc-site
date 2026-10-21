# cc-site

The static site for chiculturecrew.com: plain HTML, CSS and JS with no build step. ARCHITECTURE.md explains the
whole system (diagrams in `docs/architecture/`). The API is the sibling repo `../cc-backend`, and its docker compose
serves this site locally on http://localhost:4173.

## Code

- `public/js/*.js` are plain scripts loaded in order (core, util, catalog, planner, account, crews, submit, admin,
  hours, found, issues, photos, approvals, start). They share one global scope, so check that a name is free before
  adding it.
- `start.js` routes on the URL hash (`#account`, `#submit`, `#approvals`, ...). Links in emails use these.
- Colors are theme tokens. Check new UI in both light and dark themes and at phone width.

## Checking in the browser pane

- Screenshots can lag behind the page. Check state with JS (`javascript_tool`) and click by `find` refs rather than
  by coordinates.
- Reload after JS changes. The local test accounts are in cc-backend/README.md.

## Deploy

- Merging to `main` deploys to S3/CloudFront through GitHub Actions. Afterwards, curl https://chiculturecrew.com
  and grep the changed file to confirm it's live.
