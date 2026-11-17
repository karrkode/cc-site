// CC-292: question 4 of Find an outing is a map of Chicago in five clickable sections (regionMapHTML in public/js/outing.js).
// Checks the five sections, their labels with counts, aria-pressed, disabled sections, and the theme tokens in the CSS.
//
//     node scripts/test_region_map.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const PUB = path.join(__dirname, "..", "public");
const read = (f) => fs.readFileSync(path.join(PUB, f), "utf8");
const stub = () => new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => "" : stub()), apply: () => stub() });
const g = { window: { matchMedia: () => stub(), addEventListener() {} }, matchMedia: () => stub(), document: stub(), localStorage: stub(),
  location: stub(), history: stub(), navigator: stub(), Intl, console };
vm.createContext(g);
vm.runInContext("var AUTH = { user: null }, MYPLANS = {}, API = ''; function $(id) { return document; }", g);
["util.js", "outing.js"].forEach((f) => vm.runInContext(read("js/" + f), g));

const keys = g.REGIONS.map((r) => r[0]);
assert.deepStrictEqual(Array.from(keys), ["downtown", "north", "west", "south", "suburbs"], "five sides of town");
const sections = (html) => html.match(/<g class="rsec"[^>]*>/g) || [];

// every section is a labelled toggle with its count
const html = g.regionMapHTML({ downtown: 4, north: 1, west: 0, south: 12, suburbs: 7 }, { north: 1 });
const secs = sections(html);
assert.strictEqual(secs.length, 5, "five sections");
keys.forEach((k) => assert.ok(secs.some((s) => s.includes('data-pregion="' + k + '"')), k + " has a section"));
secs.forEach((s) => assert.ok(s.includes('role="button"') && /aria-pressed="(true|false)"/.test(s) && /aria-label="[^"]+, \d+ events?"/.test(s), "role, aria-pressed and a label with its count: " + s));
assert.ok(html.includes('aria-label="Northside, 1 event"'), "singular");
assert.ok(html.includes('aria-label="Southside, 12 events"'), "plural");
assert.ok(html.includes('aria-label="Downtown/Loop, 4 events"'), "named as in the chips");

// chosen = pressed; none chosen = nothing pressed
const press = (h) => sections(h).filter((s) => s.includes('aria-pressed="true"')).length;
assert.strictEqual(press(html), 1, "one pressed");
assert.strictEqual(press(g.regionMapHTML({ north: 1, west: 1 }, {})), 0, "none chosen presses nothing");
assert.strictEqual(press(g.regionMapHTML({ north: 1, west: 1, south: 1, downtown: 1, suburbs: 1 }, { north: 1, south: 1, suburbs: 1 })), 3, "multi-select");

// no events: disabled and out of the tab order; with events: in it
const west = secs.find((s) => s.includes('data-pregion="west"')), north = secs.find((s) => s.includes('data-pregion="north"'));
assert.ok(west.includes('aria-disabled="true"') && west.includes('tabindex="-1"'), "0 events: disabled");
assert.ok(north.includes('tabindex="0"') && !north.includes("aria-disabled"), "events: focusable");
assert.ok(g.regionMapHTML({}, {}).includes("aria-disabled"), "all empty still renders");

// theme tokens only inside the map's CSS
const css = read("css/site.css"), block = css.split("\n").filter((l) => /^\.(rmap|rsec)/.test(l)).join("\n");
assert.ok(block.length > 200, "map CSS present");
assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(block), "no hard-coded colours in the map CSS");
assert.ok(/\.rsec\[aria-pressed="true"\]/.test(block) && /\.rsec:focus-visible/.test(block) && /aria-disabled="true"/.test(block), "pressed, focus and disabled states");
assert.ok(/stroke:\s*var\(--/.test(block) && /fill:\s*var\(--/.test(block), "fills and strokes are tokens");

// Find an outing wires it: click toggles via data-pregion, Enter and Space too
const outing = read("js/outing.js");
assert.ok(outing.includes("regionMapHTML(counts, plan.regions)"), "step 4 draws the map");
assert.ok(outing.includes('ev.key === "Enter" || ev.key === " "') && outing.includes('hasAttribute("data-pregion")'), "keyboard toggles a section");
assert.ok(outing.includes('aria-disabled") !== "true"'), "a disabled section ignores clicks");
console.log("region map checks passed");
