"""Checks run in CI before the site deploys.

For each page in public/: it parses, has a <title>, and every element the page's scripts
look up with $("id") exists somewhere (in the HTML, or in markup a script builds), and every
img/, css/ and js/ file it uses is in public/. The page's scripts (inline, and the js/ files it
loads) are written to build/scripts/ so CI can syntax-check them with node.

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
        # the files the page loads (CC-65): they must exist, and their scripts count as the page's own
        for ref in sorted(set(re.findall(r'(?:src|href)="((?:css|js)/[^"?]+)(?:\?v=dev)?"', text))):
            if not (PUBLIC / ref).is_file():
                problems.append(f"{path.name}: loads {ref}, which isn't in public/")
            elif ref.endswith(".js"):
                code = (PUBLIC / ref).read_text(encoding="utf-8")
                (OUT / f"{path.stem}-{Path(ref).stem}.js").write_text(code, encoding="utf-8")
                text += "\n" + code
        for ref in re.findall(r'(?:src|href)="((?:css|js)/[^"]+)"', text):
            if not ref.endswith("?v=dev"):
                problems.append(f'{path.name}: {ref} needs "?v=dev" so the deploy can stamp its version')
        looked_up = set(re.findall(r'\$\("([\w-]+)"\)', text))
        defined = set(re.findall(r'id="([\w-]+)"', text))
        for missing in sorted(looked_up - defined):
            problems.append(f'{path.name}: script looks up $("{missing}") but no element has that id')
        # CC-119: search results and link previews say what the Home line says
        line = re.search(r'id="home-line">([^<]+)<', text)
        if line:
            for name in ('name="description"', 'property="og:description"'):
                meta = re.search(r'<meta ' + name + r' content="([^"]*)"', text)
                if not meta or not meta.group(1).startswith(line.group(1)):
                    problems.append(f"{path.name}: the {name} meta doesn't start with the Home line")
        # CC-118: a page heading says something its eyebrow doesn't, and the old names stay retired
        for eyebrow, heading in re.findall(r'<p class="eyebrow"[^>]*>([^<]+)</p>\s*<h1[^>]*>([^<]+)<', text):
            if eyebrow.strip().lower() == heading.strip().lower():
                problems.append(f'{path.name}: the heading "{heading.strip()}" repeats its eyebrow')
        for old in ("Plan an outing", "Plan your outing", "Pick an outing", "Culture Planner"):
            if re.search(r'>[^<]*' + old, text) or re.search(r'"[^"\n]*' + old, text):
                problems.append(f'{path.name}: still says "{old}" (CC-118 named it Find an outing / My week)')
        # CC-120: the crew board says who's been in plain words
        for old in ("been...maybe", "very much ha"):
            if old in text:
                problems.append(f'{path.name}: the crew board still says "{old}" (CC-120 made it "has been, with a photo")')
        for src in sorted(set(re.findall(r'src="(img/[^"]+)"', text))):
            if not (PUBLIC / src).is_file():
                problems.append(f"{path.name}: uses {src}, which isn't in public/")
        print(f"{path.name}: title {page.title.strip()!r}, {len(page.scripts)} inline script(s), "
              f"{len(looked_up)} element lookups checked")
    for p in problems:
        print("ERROR:", p, file=sys.stderr)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
