#!/usr/bin/env python3
"""Culture Crew, local app.

Serves the Culture Crew page on your own computer and reads the events from the
Google Sheet each time (cached for a few minutes). If the sheet can't be read,
it serves the saved copy in data/events.json instead and says so in the footer.

    python3 app.py            start on http://127.0.0.1:4173
    python3 app.py --open     start and open the browser
    python3 app.py --check    read the sheet once, print what happened, exit

Needs Python 3.8+ and nothing else.
"""
import argparse
import hashlib
import html
import json
import re
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from collections import Counter
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CONFIG = json.loads((ROOT / "config.json").read_text(encoding="utf-8"))
SNAPSHOT = ROOT / "data" / "events.json"
INDEX = ROOT / "public" / "index.html"

# ----------------------------------------------------------------------------
# Reading the sheet
# ----------------------------------------------------------------------------

class SheetUnavailable(Exception):
    pass


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):  # a redirect means Google wants a sign-in
        return None


def sheet_url():
    return "https://docs.google.com/spreadsheets/d/%s/htmlview/sheet?headers=true&gid=%s" % (
        CONFIG["sheet_id"], CONFIG.get("gid", "0"))


def fetch_sheet_html():
    req = urllib.request.Request(sheet_url(), headers={"User-Agent": "Mozilla/5.0 (culture-crew-local)"})
    opener = urllib.request.build_opener(_NoRedirect)
    try:
        with opener.open(req, timeout=CONFIG.get("timeout_seconds", 12)) as resp:
            return resp.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        if e.code in (301, 302, 303, 307, 401, 403):
            raise SheetUnavailable("The sheet is private, so this is the saved copy. "
                                   "Share the sheet as \"Anyone with the link can view\" to read it live.")
        raise SheetUnavailable("Google answered with error %s, so this is the saved copy." % e.code)
    except Exception as e:  # offline, DNS, timeout
        raise SheetUnavailable("The sheet could not be reached (%s), so this is the saved copy." % type(e).__name__)


def _text(fragment):
    fragment = re.sub(r"<br\s*/?>", " ", fragment, flags=re.I)
    return html.unescape(re.sub(r"<[^>]+>", "", fragment)).replace("\xa0", " ").strip()


def _link(fragment):
    m = re.search(r'<a[^>]*href="([^"]*)"', fragment)
    if not m:
        return ""
    href = html.unescape(m.group(1))
    u = urllib.parse.urlparse(href)
    if u.netloc.endswith("google.com") and u.path == "/url":  # Google wraps outbound links
        q = urllib.parse.parse_qs(u.query).get("q")
        if q:
            href = q[0]
    return href if re.match(r"https?://", href, re.I) else ""


WANTED = {"event": "Event", "venue": "Venue", "begin": "Begin Date", "end": "End",
          "hood": "Neighborhood", "cost": "Entry Cost", "category": "Category"}


def parse_sheet(page):
    """Rows of the sheet as dicts keyed event/venue/begin/end/hood/cost/category/url."""
    cols, rows = None, []
    for chunk in re.split(r"<tr[\s>]", page)[1:]:
        cells = re.findall(r"<td[^>]*>(.*?)</td>", chunk, flags=re.S)
        if not cells:
            continue
        texts = [_text(c) for c in cells]
        if cols is None:
            if "Event" in texts and "Venue" in texts:  # the header row
                cols = {key: texts.index(label) for key, label in WANTED.items() if label in texts}
            continue
        get = lambda key: texts[cols[key]] if key in cols and cols[key] < len(texts) else ""
        if not get("event"):
            continue
        row = {key: get(key) for key in WANTED}
        row["url"] = _link(cells[cols["event"]])
        rows.append(row)
    if cols is None:
        raise SheetUnavailable("The sheet opened, but no header row with Event and Venue was found, so this is the saved copy.")
    if not rows:
        raise SheetUnavailable("The sheet opened but had no event rows, so this is the saved copy.")
    return rows


# ----------------------------------------------------------------------------
# Turning sheet rows into the events the page shows
# ----------------------------------------------------------------------------

FAR_IL = {"Rockford, IL"}       # Illinois, but not a Chicago suburb
SUBURB_NO_STATE = {"Niles"}     # suburbs entered without ", IL"
CONCERT = [r"^Candlelight:", r"Concert Tour", r"In Concert$", r"Trans-Siberian Orchestra"]
COMEDY_TITLES = {"Improv Supernova", "Pandemonium, Please Hold", "Reality Detox: The Improv Experience",
                 "Brad Williams: The Tall Tales Tour", "Ben Schwartz and Friends", "Matt Rife: Stay Golden World Tour",
                 "Nikki Glaser: The Stunning Tour", "Daniel Sloss: Bitter", "Wait Wait... Don't Tell Me!"}


def iso(value):
    value = value.strip()
    for fmt in ("%m/%d/%Y", "%Y-%m-%d", "%m/%d/%y"):
        try:
            return datetime.strptime(value, fmt).strftime("%Y-%m-%d")
        except ValueError:
            pass
    return None  # TBD, Open run, blank


def min_price(cost):
    if cost.strip().lower() in ("free", "pay-what-you-can"):
        return 0
    nums = re.findall(r"\$\s*([0-9]+(?:\.[0-9]+)?)", cost)
    return float(nums[0]) if nums else None


def area_of(hood):
    if not hood:
        return ""
    if hood in SUBURB_NO_STATE:
        return "Suburbs"
    m = re.search(r",\s*([A-Z]{2})$", hood)
    if not m:
        return "City"
    return "Suburbs" if m.group(1) == "IL" and hood not in FAR_IL else "Out of town"


def page_type(title, category):
    """The sheet's Category, except that rows marked Theater are split into Concert and Comedy for the page."""
    if category != "Theater":
        return category
    if title in COMEDY_TITLES:
        return "Comedy"
    if any(re.search(p, title) for p in CONCERT):
        return "Concert"
    return "Theater"


def normalize(rows):
    by_venue = {}
    for r in rows:
        if r["category"]:
            by_venue.setdefault(r["venue"], Counter())[r["category"]] += 1
    events, seen = [], set()
    for r in rows:
        category = r["category"]
        if not category:  # blank Category: use what the venue's other rows say
            category = by_venue[r["venue"]].most_common(1)[0][0] if r["venue"] in by_venue else "Theater"
        eid = hashlib.sha1(("%s|%s|%s" % (r["event"], r["venue"], r["begin"])).encode()).hexdigest()[:6]
        if eid in seen:  # the same event entered twice
            continue
        seen.add(eid)
        events.append({
            "id": eid, "title": r["event"], "venue": r["venue"],
            "begin": iso(r["begin"]), "end": iso(r["end"]),
            "openRun": r["end"].strip().lower() == "open run", "beginTbd": r["begin"].strip().upper() == "TBD",
            "hood": r["hood"], "area": area_of(r["hood"]),
            "cost": r["cost"] or "TBD", "min": min_price(r["cost"]),
            "type": page_type(r["event"], category), "url": r["url"],
        })
    events.sort(key=lambda e: (e["begin"] or "0000", e["title"]))
    return events


# ----------------------------------------------------------------------------
# Live data with a saved copy behind it
# ----------------------------------------------------------------------------

_lock = threading.Lock()
_cache = {"at": 0.0, "data": None}


def load_snapshot(note):
    data = json.loads(SNAPSHOT.read_text(encoding="utf-8"))
    data.update({"source": "snapshot", "note": note, "local": True})
    return data


def load_live():
    events = normalize(parse_sheet(fetch_sheet_html()))
    now = datetime.now(timezone.utc)
    data = {"asOf": datetime.now().strftime("%Y-%m-%d"), "events": events}
    try:  # keep the newest good read as the fallback copy
        SNAPSHOT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    except OSError:
        pass
    data.update({"source": "live", "fetchedAt": now.isoformat(), "local": True})
    return data


def get_data(force=False):
    with _lock:
        fresh = time.time() - _cache["at"] < CONFIG.get("cache_minutes", 5) * 60
        if _cache["data"] is None or force or not fresh:
            try:
                _cache["data"] = load_live()
            except SheetUnavailable as e:
                _cache["data"] = load_snapshot(str(e))
            _cache["at"] = time.time()
        return _cache["data"]


# ----------------------------------------------------------------------------
# Web server
# ----------------------------------------------------------------------------

class Handler(BaseHTTPRequestHandler):
    server_version = "CultureCrew/1.0"

    def _send(self, code, body, ctype):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        url = urllib.parse.urlparse(self.path)
        if url.path in ("/", "/index.html"):
            self._send(200, INDEX.read_bytes(), "text/html; charset=utf-8")
        elif url.path == "/api/events":
            force = urllib.parse.parse_qs(url.query).get("refresh") == ["1"]
            body = json.dumps(get_data(force), ensure_ascii=False, separators=(",", ":")).encode("utf-8")
            self._send(200, body, "application/json; charset=utf-8")
        elif url.path == "/favicon.ico":
            self._send(204, b"", "image/x-icon")
        else:
            self._send(404, b"Not found", "text/plain; charset=utf-8")

    def log_message(self, fmt, *args):
        sys.stderr.write("%s  %s\n" % (time.strftime("%H:%M:%S"), fmt % args))


def main():
    ap = argparse.ArgumentParser(description="Culture Crew local app")
    ap.add_argument("--host", default=CONFIG.get("host", "127.0.0.1"),
                    help="127.0.0.1 keeps it on this computer; 0.0.0.0 lets others on your network open it")
    ap.add_argument("--port", type=int, default=CONFIG.get("port", 4173))
    ap.add_argument("--open", action="store_true", help="open the page in your browser")
    ap.add_argument("--check", action="store_true", help="read the sheet once, report, and exit")
    args = ap.parse_args()

    data = get_data()
    kinds = ", ".join("%s %d" % kv for kv in Counter(e["type"] for e in data["events"]).most_common())
    if data["source"] == "live":
        print("Sheet read live: %d events (%s)." % (len(data["events"]), kinds))
    else:
        print("Using the saved copy from %s: %d events (%s)." % (data["asOf"], len(data["events"]), kinds))
        print("  " + data["note"])
    if args.check:
        return

    server = ThreadingHTTPServer((args.host, args.port), Handler)
    shown = "localhost" if args.host in ("127.0.0.1", "0.0.0.0") else args.host
    address = "http://%s:%d/" % (shown, args.port)
    print("Culture Crew is running at %s  (Ctrl+C to stop)" % address)
    if args.open:
        threading.Timer(0.6, webbrowser.open, [address]).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
