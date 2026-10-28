# Culture Crew — the site

The page at **https://chiculturecrew.com**: a running list of plays, concerts and
exhibitions around Chicago, with a catalog, an outing planner that suggests only what's on, accounts,
plans and an "I've been" list with optional photos, culture crews that share plans and see who's been,
event submissions, issue reports, and admin pages (review, found events from event discovery, venues,
members, photo approvals, stats). Approvers, offered the permission by the admin, review "I've been" photos.

It's a single static page (`public/index.html` with its `css/` and `js/`, no build step) served from S3 through
CloudFront. Everything dynamic comes from the Culture Crew API at
**https://api.chiculturecrew.com** ([karrkode/cc-backend](https://github.com/karrkode/cc-backend)),
which the page calls from the browser. The infrastructure for both lives in cc-backend's
`infra/` folder.

## Files

```
public/index.html        the page's HTML
public/css/site.css      its styles
public/js/               its scripts, by area, loaded in order (see js/core.js)
public/404.html          shown by CloudFront for any missing path
public/img/              images the page uses (the plan dolphins)
public/js/vendor/        qrcode.js, for crew invite QR codes (CC-86), kept with the site so invite links stay private
scripts/check_pages.py   checks run in CI before every deploy
scripts/stamp_assets.py  stamps each css/js link with its file's hash at deploy
.github/workflows/       CI/CD
ARCHITECTURE.md          how the site, API, database and AWS parts fit together (with diagrams in docs/architecture/)
```

## Run it locally

The page needs the API. With [cc-backend](https://github.com/karrkode/cc-backend) cloned next
to this repo:

```
cd ../cc-backend
docker compose --profile web up --build -d
docker compose run --rm api python -m scripts.seed
```

The page is then on http://localhost:4173 and the API on http://localhost:8000. Edits to
`public/` show up on reload (a hard reload, Cmd+Shift+R, if the browser kept an old copy). The page finds the API by itself (`localhost:8000`
locally, `api.<its own domain>` in production); the `cc-api` meta tag overrides it.

Without Docker, any static server works, e.g. `python3 -m http.server 4173 -d public`,
as long as the API is running on port 8000.

## How work flows

Work is planned in Jira (project **CC** at chiculturecrew.atlassian.net), and GitHub for Jira
links code to issues by their key: branches are named `CC-123-short-description` and commits
start with `CC-123:`.

- **Pull request** into `main`: CI runs `scripts/check_pages.py` (each page parses and has a
  title, and every element the script looks up exists) and a JavaScript syntax check.
- **Merge**: CI uploads the pages to S3, refreshes CloudFront, checks that
  chiculturecrew.com serves the page, and records the deploy on the Jira issue.

The deploy job gets short-lived AWS credentials through OIDC; no AWS keys are stored in
GitHub. Only the `production` environment may use them, and only `main` may use that
environment.

## History

Until October 2026 the site was built on Netlify from a Google Sheet (`app.py`, `build.py`).
The move to AWS is described in cc-backend's `infra/README.md`. The sheet fed the API through a
nightly sync until that was retired in October 2026 (CC-72); it's kept as a read-only archive.
