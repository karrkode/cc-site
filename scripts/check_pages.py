"""Checks run in CI before the site deploys.

For each page in public/: it parses, has a <title>, and every element the page's script
looks up with $("id") exists somewhere in the file (in the HTML or in markup the script
builds). Inline scripts are written to build/scripts/ so CI can syntax-check them with node.

    python3 scripts/check_pages.py
"""
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
OUT = ROOT / "build" / "scripts"


class Page(HTMLParser):
    def __init__(self):
        super().__init__()
        self.title = ""
        self.scripts: list[str] = []
        self._in_title = False
        self._in_script = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        self._in_title = tag == "title"
        # inline JavaScript only (not JSON data blocks or external scripts)
        self._in_script = tag == "script" and "src" not in attrs and attrs.get("type") in (None, "text/javascript", "module")
        if self._in_script:
            self.scripts.append("")

    def handle_endtag(self, tag):
        if tag == "title":
            self._in_title = False
        if tag == "script":
            self._in_script = False

    def handle_data(self, data):
        if self._in_title:
            self.title += data
        if self._in_script:
            self.scripts[-1] += data


def main() -> int:
    problems = []
    OUT.mkdir(parents=True, exist_ok=True)
    pages = sorted(PUBLIC.glob("*.html"))
    if not pages:
        problems.append("no pages found in public/")
    for path in pages:
        text = path.read_text(encoding="utf-8")
        page = Page()
        page.feed(text)
        page.close()
        if not page.title.strip():
            problems.append(f"{path.name}: no <title>")
        for i, script in enumerate(page.scripts):
            (OUT / f"{path.stem}-{i}.js").write_text(script, encoding="utf-8")
        looked_up = set(re.findall(r'\$\("([\w-]+)"\)', text))
        defined = set(re.findall(r'id="([\w-]+)"', text))
        for missing in sorted(looked_up - defined):
            problems.append(f'{path.name}: script looks up $("{missing}") but no element has that id')
        print(f"{path.name}: title {page.title.strip()!r}, {len(page.scripts)} inline script(s), "
              f"{len(looked_up)} element lookups checked")
    for p in problems:
        print("ERROR:", p, file=sys.stderr)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
