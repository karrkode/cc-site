"""Prepare public/ for upload: copy it to build/site/ and stamp each css/ and js/ link with its file's hash.

The page links its files as css/site.css?v=dev and js/*.js?v=dev. Here "dev" becomes the first 10
characters of the file's SHA-256, so browsers can cache those files for a year (the deploy says so)
and still fetch a new copy the moment its content changes. index.html itself is never cached.

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
    print(f"build/site ready: {stamped} links stamped")
    return 0


if __name__ == "__main__":
    sys.exit(main())
