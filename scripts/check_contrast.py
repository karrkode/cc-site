"""Checks run in CI before the site deploys (CC-136).

Every colour pair the site uses meets WCAG AA in both themes: 4.5:1 for text, 3:1 for borders, focus rings and
the category fields against the page. The colours are read from the theme blocks at the top of public/css/site.css,
so changing a token there is enough to re-check it. The pairs are the Lakefront brief's contrast table
(design/lakefront-brief.md, section 3) plus the ones site.css puts together.

    python3 scripts/check_contrast.py
"""
import re
import sys
from pathlib import Path

CSS = Path(__file__).resolve().parents[1] / "public" / "css" / "site.css"

TEXT, LARGE, NON_TEXT = 4.5, 3.0, 3.0  # LARGE: text of 24px, or 18.66px bold, and up
PAIRS = [  # (foreground, background, minimum, where it's used)
    ("text", "page", TEXT, "all text"),
    ("text", "surface", TEXT, "text on panels"),
    ("muted", "page", TEXT, "venues, hints"),
    ("muted", "surface", TEXT, "hints on panels"),
    ("muted", "info-soft", TEXT, "counts in an active filter"),
    ("lead", "page", TEXT, "links, Free"),
    ("lead", "surface", TEXT, "links on panels"),
    ("on-lead", "lead", TEXT, "primary button"),
    ("star", "page", TEXT, "Closes today"),
    ("star", "surface", TEXT, "Closes today on a panel"),
    ("on-info-soft", "info-soft", TEXT, "notices, tags"),
    ("on-danger-soft", "danger-soft", TEXT, "errors"),
    ("page", "text", TEXT, "tooltips, a pressed filter button"),
    ("text", "info-soft", TEXT, "a filter button on hover"),
    ("on-lake", "lake", TEXT, "masthead"),
    ("on-lake-muted", "lake", TEXT, "masthead, muted"),
    ("stripe", "lake", NON_TEXT, "focus ring and active nav on the masthead"),
    ("on-cat", "cat-theater", TEXT, "text on a theater field"),
    ("on-cat", "cat-music", TEXT, "text on a music field"),
    ("on-cat", "cat-art", TEXT, "text on an art field"),
    ("field-line", "page", NON_TEXT, "form borders"),
    ("field-line", "surface", NON_TEXT, "form borders on panels"),
    ("focus", "page", NON_TEXT, "focus ring"),
    ("focus", "surface", NON_TEXT, "focus ring on panels"),
    ("cat-theater", "page", NON_TEXT, "theater field"),
    ("cat-music", "page", NON_TEXT, "music field"),
    ("cat-art", "page", NON_TEXT, "art field"),
    # CC-138: where text crosses a water line (white at the line's opacity over the field, written "lake+13%")
    ("on-lake", "lake+13%", TEXT, "masthead text across its water"),
    ("on-lake-muted", "lake+13%", TEXT, "muted masthead text across its water"),
    ("stripe", "lake+13%", NON_TEXT, "active nav across the masthead's water"),
    ("on-cat", "cat-theater+24%", LARGE, "poster title across a theater poster's water"),
    ("on-cat", "cat-music+24%", LARGE, "poster title across a music poster's water"),
    ("on-cat", "cat-art+24%", LARGE, "poster title across an art poster's water"),
    # CC-139: the host's gold ring. In light the pale gold is ~1.4:1 on the page, so its rim carries it; on a field
    # (the lead pick, the poster) the gold itself does. The lake dolphin's edge is --text, checked above.
    ("gold-rim", "page", NON_TEXT, "the host's ring and star, their rim"),
    ("gold-rim", "surface", NON_TEXT, "the host's ring on a card"),
    ("gold", "cat-theater", NON_TEXT, "the host's ring on a theater field"),
    ("gold", "cat-music", NON_TEXT, "the host's ring on a music field"),
    ("gold", "cat-art", NON_TEXT, "the host's ring on an art field"),
] + [("dot-ink", f"dot-{i}", TEXT, "initials on a crew dot") for i in range(6)]


def block(css: str, selector: str) -> dict[str, str]:
    """The custom properties declared in the rule whose whole selector is `selector`."""
    m = re.search(r"^" + re.escape(selector) + r"\s*\{([^}]*)\}", css, flags=re.M)
    if not m:
        sys.exit(f"no {selector} block in {CSS}")
    body = re.sub(r"/\*.*?\*/", "", m.group(1), flags=re.S)
    return dict(re.findall(r"--([\w-]+):\s*([^;]+);", body))


def luminance(hex_colour: str) -> float:
    h = hex_colour.strip().lstrip("#")
    if not re.fullmatch(r"[0-9A-Fa-f]{6}", h):
        raise ValueError(f"not a #RRGGBB colour: {hex_colour}")
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return 0.2126 * out[0] + 0.7152 * out[1] + 0.0722 * out[2]


def colour(tokens: dict[str, str], name: str) -> str:
    """A token's #RRGGBB, or for "token+N%" the token under white at N% opacity (a water line over it)."""
    m = re.fullmatch(r"(.+)\+(\d+)%", name)
    if not m:
        return tokens[name]
    base, alpha = tokens[m.group(1)].strip().lstrip("#"), int(m.group(2)) / 100
    if not re.fullmatch(r"[0-9A-Fa-f]{6}", base):
        raise ValueError(f"not a #RRGGBB colour: {base}")
    return "#" + "".join(f"{round(int(base[i:i + 2], 16) * (1 - alpha) + 255 * alpha):02X}" for i in (0, 2, 4))


def ratio(a: str, b: str) -> float:
    la, lb = sorted((luminance(a), luminance(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


def main() -> int:
    css = CSS.read_text(encoding="utf-8")
    shared = block(css, ":root")
    themes = {
        "light": {**shared, **block(css, ':root, :root[data-theme="light"]')},
        "dark (Lights down)": {**shared, **block(css, ':root, :root[data-theme="light"]'), **block(css, ':root[data-theme="dark"]')},
    }
    problems = []
    for name, tokens in themes.items():
        for fg, bg, minimum, where in PAIRS:
            try:
                r = ratio(colour(tokens, fg), colour(tokens, bg))
            except (KeyError, ValueError) as e:
                problems.append(f"{name}: {fg} on {bg}: {e}")
                continue
            line = f"{name:20} {fg:>15} on {bg:<16} {r:5.2f}  (needs {minimum}, {where})"
            if r < minimum:
                problems.append(line)
            else:
                print("ok:", line)
    for p in problems:
        print("FAIL:", p)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
