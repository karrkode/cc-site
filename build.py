#!/usr/bin/env python3
"""Build the static site for Netlify.

Reads the events the same way app.py does (live sheet, falling back to
data/events.json), embeds them in the page, and writes dist/index.html.

    python3 build.py
"""
import json
from pathlib import Path

import app

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "dist"
PLACEHOLDER = '<script type="application/json" id="events-data">null</script>'


def main():
    data = app.get_data(force=True)
    data["local"] = False  # no server behind a static deploy, so hide "Check the sheet again"
    # "</" would end the script tag early if an event title contained it
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")

    page = app.INDEX.read_text(encoding="utf-8")
    if PLACEHOLDER not in page:
        raise SystemExit("public/index.html no longer has the events-data placeholder.")
    OUT.mkdir(exist_ok=True)
    (OUT / "index.html").write_text(page.replace(PLACEHOLDER, PLACEHOLDER.replace("null", payload)), encoding="utf-8")

    if data["source"] == "live":
        print("Built dist/index.html with %d events read live from the sheet." % len(data["events"]))
    else:
        print("Built dist/index.html with %d events from the saved copy." % len(data["events"]))
        print("  " + data["note"])


if __name__ == "__main__":
    main()
