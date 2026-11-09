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
