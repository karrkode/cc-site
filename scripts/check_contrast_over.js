// CC-295: text contrast where text sits on the lake, on event photos and on the category tiles.
//
// check_contrast.py proves the theme token pairs, and axe (scan_a11y.js) checks the painted page, but axe can't compute a
// ratio where text sits on a canvas (the masthead's lake, the tiles' water) or a photo: it reports those as "incomplete".
// This script does it by pixels. For each text node in the masthead, on a tile or poster (.water-field) and on a photo
// credit, it takes a screenshot with the text and one without it, and compares the text's colour with the pixels behind its glyphs. A text fails when the worst 1% of those pixels give under 4.5:1 (3:1 for large text: 24px, or 18.66px bold).
//
// Like scan_a11y.js it needs a running site with its API, Google Chrome and a one-time `npm ci` in scripts/a11y, and it is
// not part of CI (CI has no API). Run it before a release and after changing the masthead, a tile, a poster or a token:
//
//     (cd scripts/a11y && npm ci)
//     node scripts/check_contrast_over.js                        # http://localhost:4173
//     CONTRAST_URL=http://localhost:4295 CONTRAST_API_PORT=8000 node scripts/check_contrast_over.js
//     CONTRAST_ONLY=event-photo node scripts/check_contrast_over.js    # home, catalog, event, event-photo
//     CONTRAST_VERBOSE=1 node scripts/check_contrast_over.js     # also the worst ratio per page and state
//
// What it covers: light and dark, at 1280px and 375px. The masthead (full on home, compact on the catalog) in all eight
// lake looks (winter, spring, summer, autumn, each by day and at dusk, shown with ?lake=). The tiles, the home stack, the
// poster and a photo's credit in the clock's own look (their water doesn't change with the season). Motion is off, so the
// water holds still. Signed-out pages only. A page that doesn't show what it should fails the run, like in scan_a11y.js.
// Prints failures only, grouped by text, and exits 1 if there is one. The test data needs an event with a photo and a credit.
"use strict";
const path = require("path");
const { createRequire } = require("module");
const req = createRequire(path.join(__dirname, "a11y", "package.json"));
let chromium;
try { chromium = req("playwright-core").chromium; } catch (e) {
  console.error("check_contrast_over: run `npm ci` in scripts/a11y first (" + e.message.split("\n")[0] + ")");
  process.exit(2);
}

const ENV = process.env;
const BASE = (ENV.CONTRAST_URL || "http://localhost:4173").replace(/\/$/, "");
const ONLY = ENV.CONTRAST_ONLY ? ENV.CONTRAST_ONLY.split(",") : null;
const SKIP_VENUES = /second city|annoyance/i; // not test cases
const TEXT = 4.5, LARGE = 3.0;
const SEASONS = ["winter", "spring", "summer", "autumn"];
const LAKES = SEASONS.flatMap((s) => [s, s + ",dusk"]);
const VIEWS = [["light", 1280, 900], ["dark", 1280, 900], ["light", 375, 812], ["dark", 375, 812]];
const MAX_Y = 7000; // only the first screens: a screenshot of a long listing isn't needed to judge the water

// ready: what must be on the screen before we measure. lakes: also measure the masthead in each lake look.
const PAGES = [
  { name: "home", path: "/", ready: ".lead-sea, .listing .tile", lakes: true },
  { name: "catalog", path: "/#catalog", ready: ".listing .tile", lakes: true },
  { name: "event", path: "/#e/{event}", ready: ".poster" },
  { name: "event-photo", path: "/#e/{photo}", ready: ".poster.has-photo .photo-credit" },
];

async function events() {
  let res;
  try { res = await fetch(BASE.replace(/:\d+$/, "") + ":" + (ENV.CONTRAST_API_PORT || "8000") + "/events?limit=50"); } catch (e) { return {}; }
  const items = ((await res.json().catch(() => ({}))).items || []).filter((x) => !SKIP_VENUES.test(x.title + " " + ((x.venue || {}).name || "")));
  const photo = items.find((x) => x.image_url && x.image_credit_url);
  return { event: (items.find((x) => !x.image_url) || items[0] || {}).id, photo: (photo || {}).id };
}

// In the page: the text to check (before the page's text is hidden). One entry per text node, with its line boxes.
function collect({ onlyMast, maxY }) {
  const roots = Array.from(document.querySelectorAll(onlyMast ? ".mast" : ".mast, .water-field, .photo-credit"));
  const vw = window.innerWidth, out = [], seen = new Set();
  const name = (el) => el.tagName.toLowerCase() + (el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).join(".") : "");
  roots.forEach((root) => {
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      const text = n.nodeValue.replace(/\s+/g, " ").trim(), el = n.parentElement;
      if (!text || !el || seen.has(n) || /^(SCRIPT|STYLE|NOSCRIPT)$/.test(el.tagName)) continue;
      seen.add(n);
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") continue;
      let op = 1;
      for (let a = el; a; a = a.parentElement) op *= Number(getComputedStyle(a).opacity);
      if (op === 0) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      const rects = Array.from(range.getClientRects())
        .filter((r) => r.width >= 4 && r.height >= 4 && r.right > 0 && r.left < vw && r.top + window.scrollY < maxY)
        .map((r) => ({ x: r.left, y: r.top + window.scrollY, w: r.width, h: r.height }));
      if (!rects.length) continue;
      const c = (cs.color.match(/[\d.]+/g) || []).map(Number); // rgb(r, g, b) or rgba(r, g, b, a)
      const size = parseFloat(cs.fontSize), bold = Number(cs.fontWeight) >= 700;
      out.push({ name: name(el), text: text.length > 40 ? text.slice(0, 39) + "…" : text, rects, color: c.slice(0, 3), alpha: (c.length > 3 ? c[3] : 1) * op,
        large: size >= 24 || (bold && size >= 18.66) });
    }
  });
  return out;
}

// In the page: the pixels behind each text, as contrast ratios (the worst 1%, and the worst of all). A is the page as it
// shows, B the same with the text's colour hidden; the pixels that differ are the glyphs (a line box also holds stripes
// and water that the letters don't touch), and B gives what is behind each of them.
function measure(arg) {
  const { pngA, pngB, items, width, height } = arg;
  const load = (png) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement("canvas");
      cv.width = img.width; cv.height = img.height;
      const ctx = cv.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      resolve(ctx);
    };
    img.src = "data:image/png;base64," + png;
  });
  return Promise.all([load(pngA), load(pngB)]).then(([A, B]) => {
    const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const lum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    return items.map((it) => {
      const ratios = [];
      it.rects.forEach((r) => {
        const x = Math.max(0, Math.floor(r.x)), y = Math.max(0, Math.floor(r.y));
        const w = Math.min(width, Math.ceil(r.x + r.w)) - x, h = Math.min(height, Math.ceil(r.y + r.h)) - y;
        if (w < 1 || h < 1) return;
        const a = A.getImageData(x, y, w, h).data, d = B.getImageData(x, y, w, h).data;
        for (let i = 0; i < d.length; i += 4) {
          if (Math.max(Math.abs(a[i] - d[i]), Math.abs(a[i + 1] - d[i + 1]), Math.abs(a[i + 2] - d[i + 2])) < 12) continue; // not a glyph pixel
          const al = it.alpha, bg = lum(d[i], d[i + 1], d[i + 2]);
          const fg = lum(al * it.color[0] + (1 - al) * d[i], al * it.color[1] + (1 - al) * d[i + 1], al * it.color[2] + (1 - al) * d[i + 2]);
          ratios.push((Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05));
        }
      });
      ratios.sort((p, q) => p - q);
      return { worst: ratios[0], p1: ratios[Math.floor(ratios.length * 0.01)], n: ratios.length };
    });
  });
}

(async () => {
  const ids = await events();
  if (!ids.event) { console.error("check_contrast_over: no events from the API at :" + (ENV.CONTRAST_API_PORT || "8000")); process.exit(1); }
  const browser = await chromium.launch({ channel: "chrome" });
  const failures = new Map(); // "where: text" -> {ratio, need, states:[]}
  const notShown = [], table = [];
  for (const [theme, w, h] of VIEWS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: theme, reducedMotion: "reduce", deviceScaleFactor: 1, bypassCSP: true });
    for (const p of PAGES) {
      if (ONLY && !ONLY.includes(p.name)) continue;
      const looks = [""].concat(p.lakes ? LAKES : []); // "" is the clock's own look: everything is measured; the others, the masthead only
      for (const look of looks) {
        const state = theme + " " + w + "px " + p.name + (look ? " " + look : "");
        const id = p.name === "event-photo" ? ids.photo : ids.event;
        if (!id && /\{(event|photo)\}/.test(p.path)) { notShown.push(state + ": no event" + (p.name === "event-photo" ? " with a photo and a credit" : "")); continue; }
        const url = BASE + (look ? "/?lake=" + look : "") + p.path.replace("{event}", id).replace("{photo}", id);
        for (let attempt = 1; attempt <= 2; attempt++) {
        const page = await ctx.newPage();
        try {
          await page.goto(url);
          await page.waitForSelector(p.ready, { state: "visible", timeout: 15000 });
          await page.evaluate(() => document.querySelectorAll("img[loading=lazy]").forEach((i) => { i.loading = "eager"; }));
          await page.waitForFunction(() => Array.from(document.images).every((i) => i.complete), null, { timeout: 8000 }).catch(() => {});
          await page.waitForTimeout(1500); // the water's first paint, the view transition
          const items = await page.evaluate(collect, { onlyMast: !!look, maxY: MAX_Y });
          if (!items.length) throw new Error("no text found to check");
          const docH = await page.evaluate(() => document.documentElement.scrollHeight);
          const height = Math.min(MAX_Y, docH), clip = { x: 0, y: 0, width: w, height };
          const pngA = (await page.screenshot({ fullPage: true, clip })).toString("base64");
          await page.addStyleTag({ content: "*, *::before, *::after { color: transparent !important; -webkit-text-fill-color: transparent !important; caret-color: transparent !important; }" });
          const pngB = (await page.screenshot({ fullPage: true, clip })).toString("base64");
          const got = await page.evaluate(measure, { pngA, pngB, items, width: w, height });
          let low = Infinity;
          got.forEach((g, i) => {
            if (g.n === 0) return;
            const it = items[i], need = it.large ? LARGE : TEXT;
            low = Math.min(low, g.p1);
            if (g.p1 >= need) return;
            const key = it.name + ' "' + it.text + '" (' + (it.large ? "large, 3:1" : "4.5:1") + ")";
            const f = failures.get(key) || { states: [], worst: Infinity, p1: Infinity };
            f.states.push(state); f.worst = Math.min(f.worst, g.worst); f.p1 = Math.min(f.p1, g.p1);
            failures.set(key, f);
          });
          table.push([state, items.length + " texts, lowest " + (low === Infinity ? "-" : low.toFixed(2) + ":1")]);
          await page.close();
          break;
        } catch (e) { // a slow API now and then: one more try before it counts as not checked
          if (attempt === 2) notShown.push(state + ": " + e.message.split("\n")[0]);
        }
        await page.close();
        }
      }
    }
    await ctx.close();
  }
  await browser.close();
  if (ENV.CONTRAST_VERBOSE) table.forEach(([s, n]) => console.log(s.padEnd(44), n));
  failures.forEach((f, key) => console.log("LOW CONTRAST " + key + ": " + f.p1.toFixed(2) + ":1 (darkest spot " + f.worst.toFixed(2) + ":1) in " + f.states.length + " of the states: " + f.states.slice(0, 4).join("; ") + (f.states.length > 4 ? "; …" : "")));
  notShown.forEach((s) => console.log("NOT CHECKED " + s));
  process.exit(failures.size || notShown.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
