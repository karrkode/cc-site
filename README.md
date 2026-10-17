# Culture Crew, local app

> **Moving to AWS.** On this branch the page (`public/index.html`) loads events and
> accounts from the Culture Crew API, which is its own repo:
> **cc-backend** (github.com/karrkode/cc-backend). Clone it next to this one and run
> `docker compose --profile web up --build -d` there to get the API on :8000 and this
> page on http://localhost:4173. The sheet-reading app described below is being retired.

## How work flows

Work is planned in Jira (project **CC** at chiculturecrew.atlassian.net), and GitHub for Jira
links code to issues by their key: branches are named `CC-123-short-description` and commits
start with `CC-123:`. Pull requests run the page checks (`scripts/check_pages.py` and a
JavaScript syntax check); merging to `main` publishes the page to S3, refreshes CloudFront,
and shows the deploy on the Jira issue. No AWS keys are stored in GitHub (OIDC).

The Culture Crew page, run from your own computer. It reads the events from the
Google Sheet each time it loads (cached for 5 minutes), so edits to the sheet show
up without republishing anything.

## Run it

Needs Python 3.8 or newer. Nothing to install.

```
cd culture-crew-app
python3 app.py --open
```

Or double-click `start.command` on a Mac. The page opens at http://localhost:4173/.
Stop it with Ctrl+C.

To let other people on your Wi-Fi open it:

```
python3 app.py --host 0.0.0.0
```

They go to `http://<your computer's name or IP>:4173/`.

## Where the events come from

1. **The sheet, live.** This works only when the sheet is shared as
   "Anyone with the link can view". The app has no Google sign-in.
2. **The saved copy** in `data/events.json`, used whenever the sheet can't be read
   (private sheet, no internet). The footer of the page says which one you are
   looking at and why. Each successful live read replaces the saved copy.

`python3 app.py --check` reads the sheet once, prints what happened, and exits.
"Check the sheet again" in the page footer skips the 5-minute cache.

The saved copy shipped here was read from the sheet on October 7, 2026 (321 events).

## What the app does with the sheet

It looks for the header row (Event, Venue, Begin Date, End, Neighborhood,
Entry Cost, Category) and reads every row under it. Columns can be reordered;
the header names have to stay the same. The link on the Event cell becomes the
card's link.

- **Neighborhood** decides the area filter: a plain name is the city,
  "Town, IL" is the suburbs, another state (or Rockford) is out of town. The
  outing builder skips out-of-town events.
- **Category** is shown as written, with one exception: rows marked Theater
  whose titles look like concerts (Candlelight, "In Concert", Trans-Siberian
  Orchestra) or are on a short list of stand-up and improv shows appear as
  Concert or Comedy. Write Concert or Comedy in the sheet and the app uses that.
- A blank Category takes the category of the venue's other rows.
- **Entry Cost**: the first dollar amount is the "from" price used by the
  budget filters. "Free" and "Pay-what-you-can" count as free; anything without
  a dollar amount shows as "Price not posted".

## Settings

`config.json` holds the sheet ID, the tab's gid, the port, and the cache time.

## Files

```
app.py              the server and the sheet reader
config.json         settings
public/index.html   the page
data/events.json    saved copy of the events
start.command       double-click starter for macOS
```

## Tested

The page, the outing builder, share links and the saved-copy fallback were run
in a browser against this app. The live sheet reader was tested against a
stand-in copy of the sheet's web page, not against Google itself, because the
sheet is private. The first run with the sheet shared by link is the real test;
`python3 app.py --check` will say whether it worked.
