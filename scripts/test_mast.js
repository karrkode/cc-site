// Checks run in CI before the site deploys (CC-242): the phone masthead. In the sheet, Review and your name are bars
// (buttons with aria-expanded) that open and shut their list, and start shut. On a phone the full masthead reduces to
// the compact one as the page scrolls, by position: sticky alone (CC-290): script measures it once per width and never
// lays it out per scroll event. With reduced motion the wordmark skips the in-between.
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

// ---------- CC-290: the page carries the masthead; nothing lays it out per scroll event ----------
const phone = css.slice(css.indexOf("html { scroll-padding-top"), css.indexOf("@keyframes mast-fade"));
const rule = (sel) => {
  const m = phone.match(new RegExp("(?:^|[};])\\s*" + sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + " \\{([^}]*)\\}"));
  assert.ok(m, "site.css has a phone rule for " + sel);
  return m[1];
};

test("CC-290: on a phone the masthead sticks at a negative top, so the page scrolls it down to the band", () => {
  assert.match(phone, /\.mast \{ position: sticky; top: 0; \}/);
  assert.match(rule(".mast-full"), /top: calc\(-1 \* var\(--mast-cut, 140px\)\)/);
  assert.match(rule(".mast-full .brand"), /position: sticky; top: calc\(28px - var\(--brand-h\) \/ 2\)/, "the wordmark pins in the band's middle");
  assert.match(rule(".mast-full .mast-in::after"), /position: sticky; top: 56px/, "and the stripe under it");
  assert.match(rule(".mast-full .burger"), /position: sticky; top: 6px/, "the hamburger stays in the corner");
});

test("CC-290: what changes with the scroll is opacity and transform only, never the layout", () => {
  // The scroll's progress reaches the CSS as an animation or as --mast-f / --mast-s. Neither may touch a property that
  // moves the page: a masthead sized from scroll events trails the scroll on a phone (the bug).
  const frames = css.slice(css.indexOf("@keyframes mast-fade")).match(/@keyframes mast-[a-z]+ \{[^@]*\}\s*\}/g);
  assert.strictEqual(frames.length, 4);
  frames.forEach((k) => {
    const props = (k.match(/[{;]\s*([a-z-]+):/g) || []).map((p) => p.replace(/[{;:\s]/g, ""));
    assert.ok(props.length > 0 && props.every((p) => p === "opacity" || p === "transform"), k);
  });
  const decls = phone.split(/[{};]/).filter((d) => /var\(--mast-[fs]\b/.test(d));
  assert.ok(decls.length >= 4, "the fallback draws from --mast-f and --mast-s");
  decls.forEach((d) => assert.match(d.trim(), /^(opacity|transform):/, d.trim()));
  assert.ok(!/--shrink|mast-small|--mast-full-h/.test(css + util), "the scroll-sized masthead is gone");
});

test("CC-290: the scroll drives the fade and the shrink itself where it can; reduced motion has no in-between", () => {
  const can = phone.slice(phone.indexOf("@supports (animation-timeline: scroll())"), phone.indexOf("@supports not (animation-timeline: scroll())"));
  assert.match(can, /\.mast-full \.mast-date, \.mast-full \.mast-tag \{ animation: mast-fade linear both; animation-timeline: scroll\(root\);/);
  assert.match(can, /\.mast-full \.brand \{ animation: mast-brand linear both; \}/);
  assert.match(can, /animation-timeline: scroll\(root\); animation-range: 0px var\(--mast-pin, 60px\)/);
  assert.match(can, /@media \(prefers-reduced-motion: reduce\) \{\s*\.mast-full \.brand, [^{]*\{ animation-range: 0px 1px; \}/);
  // `animation` resets animation-timeline, so the timeline has to come after it
  can.split("}").map((r) => r.slice(r.lastIndexOf("{") + 1)).filter((r) => /animation:/.test(r) && /animation-timeline/.test(r)).forEach((r) => assert.ok(r.indexOf("animation:") < r.indexOf("animation-timeline"), r));
});

// A fake masthead: 375 wide, 204 tall, the date 44px high at 6px, the wordmark 55.5px high and 325 wide in a 343px column.
function fakeMast(over) {
  const vals = {}, writes = [];
  const style = new Proxy({
    setProperty(k, v) { vals[k] = String(v); writes.push(k); }, removeProperty(k) { delete vals[k]; writes.push(k); },
  }, { set(t, k) { writes.push("style." + String(k)); return true; } }); // any style.x = ... counts as a write
  const classes = new Set(["mast-full"]);
  const m = {
    style, clientWidth: 375, offsetHeight: 204, getBoundingClientRect: () => ({ height: 203.7 }),
    classList: { contains: (c) => classes.has(c), add: (c) => { writes.push("class " + c); classes.add(c); }, remove: (c) => { writes.push("class " + c); classes.delete(c); }, toggle: (c) => { writes.push("class " + c); } },
  };
  const els = { mast: m, brand: { offsetLeft: 25, offsetHeight: 55.5 }, "mast-date": { offsetTop: 6, offsetHeight: 44, offsetLeft: 16, offsetWidth: 343 } };
  const win = { innerWidth: 375, scrollY: 0, scrollX: 0, scrollTo() { writes.push("scrollTo"); } };
  const ctx = Object.assign({
    window: win, MAST_PHONE: { matches: true }, MOTION_CALM: { matches: false }, MAST_BAND: 62, MAST_BRAND_PX: 26, MAST_PIN: 0, MAST_TICK: 0, MAST_W: 0,
    MAST_SCROLL_CSS: true, getComputedStyle: () => ({ fontSize: "37.5px" }), $: (id) => els[id],
  }, over);
  vm.createContext(ctx);
  vm.runInContext(util.match(/function mastShrink\([\s\S]*?\n}\n/)[0] + util.match(/function measureMast\(\) \{[\s\S]*?\n\}\nfunction paintShrink\(\) \{[\s\S]*?\n\}\n/)[0], ctx);
  return { ctx, vals, writes, win, classes };
}

test("CC-290: measuring tells the CSS the cut, the pin, and how far the wordmark shrinks and moves", () => {
  const f = fakeMast();
  f.ctx.measureMast();
  assert.strictEqual(parseFloat(f.vals["--mast-cut"]).toFixed(1), "141.7", "all but the 62px band scrolls away");
  assert.strictEqual(f.vals["--mast-pin"], "61.75px", "the wordmark's middle reaches 28px after 6 + 44 + 12 + 55.5 / 2 - 28");
  assert.ok(Math.abs(+f.vals["--brand-k"] - 26 / 37.5) < 1e-9, "down to the compact 26px");
  assert.strictEqual(f.vals["--brand-in"], "9px", "from the middle to the column's left edge");
  assert.ok(Math.abs(+f.vals["--stripe-k"] - 375 / 343) < 1e-9, "the stripe widens to the band");
  assert.strictEqual(f.ctx.MAST_W, 375);
});

test("CC-290: measuring reads the layout and never changes it, wherever the page is scrolled", () => {
  [0, 60, 500, -30].forEach((y) => {
    const f = fakeMast();
    f.win.scrollY = y; f.ctx.measureMast();
    assert.deepStrictEqual(f.writes.filter((w) => !/^--(mast-cut|mast-pin|brand-k|brand-in|stripe-k)$/.test(w)), [], "at " + y);
  });
});

test("CC-290: where the scroll drives the CSS, a scroll writes nothing at all", () => {
  const f = fakeMast();
  f.ctx.measureMast(); f.writes.length = 0;
  f.win.scrollY = 80; f.ctx.paintShrink();
  assert.deepStrictEqual(f.writes, []);
  assert.match(util, /addEventListener\("scroll", function \(\) \{ if \(!MAST_SCROLL_CSS && MAST_PIN && !MAST_TICK\)/);
});

test("CC-290: where it can't, a scroll sets the fade and the shrink, and nothing else", () => {
  const f = fakeMast({ MAST_SCROLL_CSS: false });
  f.ctx.measureMast(); f.writes.length = 0;
  f.win.scrollY = 30.875; f.ctx.paintShrink();
  assert.deepStrictEqual(f.writes.sort(), ["--mast-f", "--mast-s"]);
  assert.strictEqual(+f.vals["--mast-s"], 0.5);
  assert.ok(Math.abs(+f.vals["--mast-f"] - 0.625) < 1e-9, "the date and tagline are gone a little before the wordmark pins");
  f.win.scrollY = 900; f.ctx.paintShrink();
  assert.strictEqual(+f.vals["--mast-s"], 1); assert.strictEqual(+f.vals["--mast-f"], 1);
  f.win.scrollY = -30; f.ctx.paintShrink();
  assert.strictEqual(+f.vals["--mast-s"], 0, "iOS rubber-banding above the top");
  f.ctx.MOTION_CALM.matches = true; f.win.scrollY = 5; f.ctx.paintShrink();
  assert.strictEqual(+f.vals["--mast-s"], 1, "reduced motion: compact as soon as the page moves");
});

test("CC-290: a wide screen or a compact page clears what was measured", () => {
  const f = fakeMast({ MAST_SCROLL_CSS: false });
  f.ctx.measureMast(); f.win.scrollY = 40; f.ctx.paintShrink();
  f.classes.delete("mast-full"); f.ctx.measureMast();
  assert.deepStrictEqual(f.vals, {});
  assert.strictEqual(f.ctx.MAST_PIN, 0);
});

test("CC-289: a phone's toolbar sliding while you scroll (same width, new height) doesn't re-measure the masthead", () => {
  vm.runInContext(util.match(/function mastNeedsMeasure\([^\n]*\n/)[0], g);
  assert.strictEqual(g.mastNeedsMeasure(375, 375), false, "iOS fires resize for the toolbar, height only");
  assert.strictEqual(g.mastNeedsMeasure(375, 390), true, "a new width (rotation) does");
  assert.strictEqual(g.mastNeedsMeasure(0, 375), true, "the first measure");
  assert.match(util, /addEventListener\("resize", function \(\) \{ if \(mastNeedsMeasure\(MAST_W, window\.innerWidth\)\) measureMast\(\); \}\)/);
});
