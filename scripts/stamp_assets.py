"""Prepare public/ for upload: copy it to build/site/ and stamp each css/ and js/ link with its file's hash.

The page links its files as css/site.css?v=dev and js/*.js?v=dev. Here "dev" becomes the first 10
characters of the file's SHA-256, so browsers can cache those files for a year (the deploy says so)
and still fetch a new copy the moment its content changes. index.html itself is never cached.

CC-121: it also writes build/site/join, the same page with the join page's title, description and address,
so chiculturecrew.com/join previews as the join page in messages. The deploy uploads it as the object "join".
CC-126: likewise build/site/invite, uploaded as the object "invite".

    python3 scripts/stamp_assets.py
"""
import hashlib
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
OUT = ROOT / "build" / "site"

JOIN_TITLE = "Ready to join the culture crew? · Culture Crew"
JOIN_DESCRIPTION = ("Chicago theater, comedy, music and art, and the people you go with. "
                    "Join in one step, and look around the catalog first.")
JOIN_URL = "https://chiculturecrew.com/join"
# CC-126: chiculturecrew.com/invite, where an admin's Invite a friend leads: the join page with the admins' pitch
INVITE_TITLE = "Yours truly wants you to be part of the Culture Crew!"
INVITE_DESCRIPTION = ("Live arts need people to choose, commit and communicate in order to thrive. "
                      "Save events, get shows recommended, and start a crew: anything worth seeing is worth seeing together.")
INVITE_URL = "https://chiculturecrew.com/invite"


def join_page(index: str, title: str = JOIN_TITLE, description: str = JOIN_DESCRIPTION, url: str = JOIN_URL) -> str | None:
    """index.html with the join page's preview tags (or the invite page's), or None if one of the tags it changes
    isn't there. The preview image stays the site's."""
    swaps = [(r"<title>[^<]*</title>", f"<title>{title}</title>"),
             (r'<meta name="description" content="[^"]*">', f'<meta name="description" content="{description}">'),
             (r'<link rel="canonical" href="[^"]*">', f'<link rel="canonical" href="{url}">'),
             (r'<meta property="og:title" content="[^"]*">', f'<meta property="og:title" content="{title}">'),
             (r'<meta property="og:description" content="[^"]*">', f'<meta property="og:description" content="{description}">'),
             (r'<meta property="og:url" content="[^"]*">', f'<meta property="og:url" content="{url}">')]
    for pattern, tag in swaps:
        index, n = re.subn(pattern, tag, index, count=1)
        if n != 1:
            return None
    return index


def main() -> int:
    shutil.rmtree(OUT, ignore_errors=True)
    shutil.copytree(PUBLIC, OUT)
    stamped = 0
    for page in OUT.glob("*.html"):
        text = page.read_text(encoding="utf-8")

        def stamp(m: re.Match) -> str:
            nonlocal stamped
            ref = m.group(1)
            digest = hashlib.sha256((PUBLIC / ref).read_bytes()).hexdigest()[:10]
            stamped += 1
            return f'"{ref}?v={digest}"'

        text = re.sub(r'"((?:css|js)/[^"?]+)\?v=dev"', stamp, text)
        if re.search(r'"(?:css|js)/[^"]*\?v=dev"', text):
            print(f"ERROR: {page.name} still has an unstamped ?v=dev link", file=sys.stderr)
            return 1
        page.write_text(text, encoding="utf-8")
    index = (OUT / "index.html").read_text(encoding="utf-8")
    join = join_page(index)
    invite = join_page(index, INVITE_TITLE, INVITE_DESCRIPTION, INVITE_URL)  # CC-126
    if join is None or invite is None:
        print("ERROR: index.html is missing a preview tag the join page replaces", file=sys.stderr)
        return 1
    (OUT / "join").write_text(join, encoding="utf-8")
    (OUT / "invite").write_text(invite, encoding="utf-8")
    print(f"build/site ready: {stamped} links stamped, and the join and invite pages")
    return 0


if __name__ == "__main__":
    sys.exit(main())
