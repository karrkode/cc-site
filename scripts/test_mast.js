// Checks run in CI before the site deploys (CC-242): the phone masthead. In the sheet, Review and your name are bars
// (buttons with aria-expanded) that open and shut their list, and start shut. On a phone the full masthead shrinks to
// the compact one as the page scrolls; with reduced motion it skips the in-between.
//
//     node scripts/test_mast.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const ROOT = path.join(__dirname, "..", "public");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const html = read("index.html"), util = read("js/util.js");
const css = read("css/site.css").replace(/\/\*[\s\S]*?\*\//g, "");
const test = (name, fn) => { fn(); console.log("ok: " + name); };

test("Review and your name are bars that say whether they're open, and what they open", () => {
  [["rv-head", "rv-menu"], ["me-head", "me-menu"]].forEach(([head, menu]) => {
    const tag = (html.match(new RegExp('<button[^>]*id="' + head + '"[^>]*>')) || [])[0];
    assert.ok(tag, head + " is a button");
    assert.match(tag, /type="button"/);
    assert.match(tag, /aria-expanded="false"/, head + " starts shut");
    assert.match(tag, new RegExp('aria-controls="' + menu + '"'));
    assert.match(tag, / hidden>/, head + " shows only in the sheet");
  });
});

test("each list is labelled by its bar's name, so the count isn't read as part of it", () => {
  assert.match(read("js/hubs.js"), /"aria-labelledby", sheet \? "rv-head-name"/);
  assert.match(read("js/account.js"), /"aria-labelledby", sheet \? "me-head-name"/);
  assert.ok(html.includes('id="rv-head-name"') && html.includes('id="me-head-name"'));
});

test("the bars start shut when the sheet opens or the screen changes size", () => {
  assert.match(read("js/hubs.js"), /menu\.hidden = true;[^\n]*"rv-head"\)\.setAttribute\("aria-expanded", "false"\)/);
  assert.match(read("js/account.js"), /menu\.hidden = true; \$\("me-head"\)\.setAttribute\("aria-expanded", "false"\)/);
  const click = util.match(/\$\("mast-burger"\)\.addEventListener\("click", function \(\) \{[\s\S]*?\n\}\);/)[0];
  assert.ok(click.indexOf("shutSheetBars()") > 0 && click.indexOf("shutSheetBars()") < click.indexOf("dropOpen"));
});

const g = {};
vm.createContext(g);
vm.runInContext(util.match(/function mastShrink\([\s\S]*?\n}\n/)[0], g);

test("the shrink runs 0 to 1 over the cut, and holds at 1 past it", () => {
  assert.strictEqual(g.mastShrink(0, 148, false), 0);
  assert.strictEqual(g.mastShrink(74, 148, false), 0.5);
  assert.strictEqual(g.mastShrink(148, 148, false), 1);
  assert.strictEqual(g.mastShrink(900, 148, false), 1);
  assert.strictEqual(g.mastShrink(-30, 148, false), 0, "iOS rubber-banding above the top");
});

test("reduced motion: full at the top, compact as soon as the page moves", () => {
  assert.strictEqual(g.mastShrink(0, 148, true), 0);
  assert.strictEqual(g.mastShrink(1, 148, true), 1);
  assert.strictEqual(g.mastShrink(74, 148, true), 1);
});

test("no cut (a wide screen or a compact page): nothing shrinks", () => {
  assert.strictEqual(g.mastShrink(200, 0, false), 0);
});

test("on a phone the masthead is pinned, and the compact one hides the date and tagline", () => {
  const phone = css.slice(css.indexOf("html { scroll-padding-top"));
  assert.match(phone, /\.mast \{ position: sticky; top: 0; \}/);
  assert.match(phone, /\.mast-small \.mast-date, \.mast-small \.mast-tag \{ visibility: hidden; \}/);
});

test("CC-289: a phone's toolbar sliding while you scroll (same width, new height) doesn't re-measure the masthead", () => {
  vm.runInContext(util.match(/function mastNeedsMeasure\([^\n]*\n/)[0], g);
  assert.strictEqual(g.mastNeedsMeasure(375, 375), false, "iOS fires resize for the toolbar, height only");
  assert.strictEqual(g.mastNeedsMeasure(375, 390), true, "a new width (rotation) does");
  assert.strictEqual(g.mastNeedsMeasure(0, 375), true, "the first measure");
  assert.match(util, /addEventListener\("resize", function \(\) \{ if \(mastNeedsMeasure\(MAST_W, window\.innerWidth\)\) measureMast\(\); \}\)/);
});

test("CC-289: measuring leaves the scroll and the shrink where they were, even when the page is briefly shorter", () => {
  // A fake page: 1000px of content under the masthead, whose full height is 204 and compact height 62 (cut 142). The
  // browser clamps the scroll to the page's height, as it does when measureMast clears the margin.
  const VH = 812, FULL = 204, SMALL = 62;
  const vals = {}, fake = {
    scrollY: 0, scrollX: 0, calls: [],
    style: { marginBottom: "", setProperty(k, v) { vals[k] = String(v); }, removeProperty(k) { delete vals[k]; }, getPropertyValue(k) { return vals[k] || ""; } },
    classes: new Set(["mast-full"]),
  };
  const shrink = () => (vals["--shrink"] === undefined ? 0 : +vals["--shrink"]);
  const height = () => FULL - (FULL - SMALL) * shrink();
  const docH = () => 1000 + height() + (parseFloat(fake.style.marginBottom) || 0);
  const clamp = () => { fake.scrollY = Math.min(fake.scrollY, Math.max(0, docH() - VH)); };
  const m = {
    style: fake.style, clientHeight: FULL,
    classList: { contains: (c) => fake.classes.has(c), remove: (c) => fake.classes.delete(c), toggle: (c, on) => { on ? fake.classes.add(c) : fake.classes.delete(c); clamp(); } },
    querySelector: () => ({ getBoundingClientRect: () => ({ height: 40 }) }),
    getBoundingClientRect: () => { clamp(); return { height: height() }; },
  };
  const win = {
    innerWidth: 375, get scrollY() { clamp(); return fake.scrollY; }, scrollX: 0,
    scrollTo(x, y) { fake.calls.push([x, y]); fake.scrollY = y; clamp(); },
  };
  const brand = { clientWidth: 300 };
  const ctx = {
    window: win, MAST_PHONE: { matches: true }, MOTION_CALM: { matches: false }, MAST_CUT: 0, MAST_FULL_H: 0, MAST_WATER_H: 0, MAST_TICK: 0, MAST_W: 0,
    document: { createRange: () => ({ selectNodeContents() {}, getBoundingClientRect: () => ({ width: 200 }) }) },
    $: (id) => (id === "brand" ? brand : m),
  };
  vm.createContext(ctx);
  vm.runInContext(util.match(/function mastShrink\([\s\S]*?\n}\n/)[0] + util.match(/function measureMast\(\) \{[\s\S]*?\n\}\nfunction paintShrink\(\) \{[\s\S]*?\n\}\n/)[0], ctx);
  // the page is at 120px, in the middle of the shrink, and 5px from its bottom
  win.scrollTo(0, 0); vals["--shrink"] = "1"; fake.style.marginBottom = "142px"; ctx.MAST_CUT = 142; ctx.MAST_FULL_H = FULL;
  const bottom = docH() - VH; fake.scrollY = bottom; fake.calls.length = 0;
  ctx.measureMast();
  assert.strictEqual(win.scrollY, bottom, "the scroll is back where it was");
  assert.strictEqual(shrink(), 1, "and the masthead is as compact as that scroll says");
  assert.strictEqual(ctx.MAST_W, 375);
  assert.ok(fake.calls.length > 0 && fake.calls[0][1] === bottom, "it asked for the old scroll, because the clamp had moved it");
  // the same measure at a scroll nothing clamps leaves it alone
  fake.calls.length = 0; fake.scrollY = 60; ctx.measureMast();
  assert.strictEqual(win.scrollY, 60); assert.strictEqual(fake.calls.length, 0, "no needless scrollTo");
  assert.ok(Math.abs(shrink() - 60 / 142) < 0.01);
  // iOS rubber-banding above the top: never scroll to a negative offset
  fake.scrollY = -30; fake.calls.length = 0; ctx.measureMast();
  assert.ok(fake.calls.every((c) => c[1] >= 0));
});
