// Checks run in CI before the site deploys (CC-165): the masthead's lake through the year (water.js, lakeNow and
// lakeApply). The season and dusk come from the visitor's clock in Chicago time; winter is slow with ice, summer lively;
// the floes are filled at the water's own opacity; ?lake= picks one; only the masthead changes; site.css colours it.
//
//     node scripts/test_lake.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const ROOT = path.join(__dirname, "..", "public");
const SRC = fs.readFileSync(path.join(ROOT, "js", "water.js"), "utf8");
const CSS = fs.readFileSync(path.join(ROOT, "css", "site.css"), "utf8");

function fakeCanvas(attrs) {
  const ops = [];
  const ctx = new Proxy({}, {
    get(t, k) { return k in t ? t[k] : (...a) => ops.push(k + "(" + a.map((n) => typeof n === "number" ? n.toFixed(2) : n).join(",") + ")"); },
    set(t, k, v) { ops.push(k + "=" + v); return true; },
  });
  return { clientWidth: 900, clientHeight: 160, width: 0, height: 0, ops, getContext: () => ctx, getAttribute: (k) => attrs[k] ?? null };
}
const mastCanvas = () => fakeCanvas({ "data-water": "mast", "data-seed": "5", "data-kind": "theater" });

// water.js in a page whose masthead records its attributes and redraws. search: the page's ?query
function load(search) {
  const attrs = {}, canvas = mastCanvas();
  const mast = {
    attrs, canvas,
    setAttribute: (k, v) => { attrs[k] = v; }, removeAttribute: (k) => { delete attrs[k]; },
    querySelectorAll: () => [canvas],
  };
  const g = {
    window: { devicePixelRatio: 1 }, document: { querySelectorAll: () => [] }, location: { search: search || "" },
    $: (id) => (id === "mast" ? mast : null), CAT_KEYS: {}, console,
  };
  vm.createContext(g);
  vm.runInContext(SRC, g);
  return { g, mast };
}

let n = 0;
function test(name, fn) { fn(); n++; console.log("ok:", name); }
const at = (iso) => new Date(iso);

test("the season comes from the month in Chicago, not the visitor's own zone or UTC", () => {
  const { g } = load();
  assert.strictEqual(g.lakeNow(at("2027-01-15T18:00:00Z")).season, "winter");
  assert.strictEqual(g.lakeNow(at("2027-04-15T17:00:00Z")).season, "spring");
  assert.strictEqual(g.lakeNow(at("2027-07-15T17:00:00Z")).season, "summer");
  assert.strictEqual(g.lakeNow(at("2026-11-11T18:00:00Z")).season, "autumn");
  // 03:00 UTC on 1 March is 9pm on 28 February in Chicago: still winter
  assert.strictEqual(g.lakeNow(at("2027-03-01T03:00:00Z")).season, "winter");
  assert.strictEqual(g.lakeNow(at("2026-12-01T05:59:00Z")).season, "autumn"); // 11:59pm on 30 November
  assert.strictEqual(g.lakeNow(at("2026-12-01T06:00:00Z")).season, "winter");
});

test("dusk runs from half an hour before Chicago's sunset until 5am", () => {
  const { g } = load();
  // 11 November: sunset about 4:35pm CST, so dusk from 4:05pm
  assert.strictEqual(g.lakeNow(at("2026-11-11T22:04:00Z")).dusk, false); // 4:04pm
  assert.strictEqual(g.lakeNow(at("2026-11-11T22:05:00Z")).dusk, true); // 4:05pm
  assert.strictEqual(g.lakeNow(at("2026-11-12T05:00:00Z")).dusk, true); // 11pm
  // 15 July: sunset about 8:25pm CDT, so a summer afternoon at 7:30pm is still day
  assert.strictEqual(g.lakeNow(at("2027-07-16T00:30:00Z")).dusk, false); // 7:30pm
  assert.strictEqual(g.lakeNow(at("2027-07-16T01:00:00Z")).dusk, true); // 8:00pm
  assert.strictEqual(g.lakeNow(at("2027-07-16T09:59:00Z")).dusk, true); // 4:59am
  assert.strictEqual(g.lakeNow(at("2027-07-16T10:00:00Z")).dusk, false); // 5:00am
  assert.strictEqual(g.LAKE_SUNSET.length, 12);
});

test("?lake= shows a season, with or without dusk; anything else falls back to the clock", () => {
  const { g } = load();
  assert.deepStrictEqual({ ...g.lakeAsked("?lake=winter") }, { season: "winter", dusk: false });
  assert.deepStrictEqual({ ...g.lakeAsked("?x=1&lake=summer,dusk") }, { season: "summer", dusk: true });
  assert.strictEqual(g.lakeAsked("?lake=monsoon"), null);
  assert.strictEqual(g.lakeAsked(""), null);
});

test("the masthead carries the season and dusk, and its water is redrawn when they change", () => {
  const { mast } = load("?lake=summer,dusk");
  assert.strictEqual(mast.attrs["data-season"], "summer");
  assert.ok("data-dusk" in mast.attrs);
  const plain = load("?lake=autumn").mast;
  assert.strictEqual(plain.attrs["data-season"], "autumn");
  assert.ok(!("data-dusk" in plain.attrs));
  assert.ok(plain.canvas.ops.length > 10, "the masthead's water was drawn");
});

test("winter has floes, filled at the masthead water's own opacity, with the waves clipped out of them", () => {
  const { g } = load("?lake=winter"), c = mastCanvas();
  g.drawWater(c, 0);
  assert.ok(c.ops.some((o) => o === 'clip(evenodd)'));
  assert.ok(c.ops.includes("fillStyle=rgba(255,255,255," + g.WATER_ALPHA.mast + ")"));
  assert.ok(c.ops.includes("fill()"));
  for (const season of ["spring", "summer", "autumn"]) {
    const o = load("?lake=" + season), s = mastCanvas();
    o.g.drawWater(s, 0);
    assert.ok(!s.ops.some((op) => /^clip|^fill/.test(op)), season + " has no ice");
  }
});

test("winter drifts at half the pace and summer at 1.4 times; the waves are lower in winter and taller in summer", () => {
  for (const [season, pace] of [["winter", .5], ["summer", 1.4], ["spring", 1]]) {
    const { g } = load("?lake=" + season), a = mastCanvas(), b = mastCanvas();
    g.drawWater(a, 10);
    g.water(b, 5, "theater", 10 * pace, "mast", g.LAKE_LOOKS[season]);
    assert.deepStrictEqual(a.ops, b.ops, season);
  }
  const ys = (season) => { // how far the first wave line strays from its row
    const { g } = load("?lake=" + season), c = mastCanvas();
    g.drawWater(c, 0);
    const from = c.ops.indexOf("clip(evenodd)") + 1; // after winter's ice, which is drawn as a path of its own
    const pts = c.ops.slice(from).filter((o) => o.startsWith("lineTo(")).slice(0, 200).map((o) => parseFloat(o.split(",")[1]));
    return Math.max(...pts) - Math.min(...pts);
  };
  assert.ok(ys("winter") < ys("autumn") && ys("autumn") < ys("summer"));
});

test("with no drift (reduced motion) the masthead is still: drawn where the drift is, at 0", () => {
  const { g } = load("?lake=winter"), a = mastCanvas(), b = mastCanvas();
  g.drawWater(a); g.drawWater(b, 0);
  assert.deepStrictEqual(a.ops, b.ops);
});

test("tiles and posters keep their water whatever the season", () => {
  const tile = (season) => {
    const { g } = load("?lake=" + season), c = fakeCanvas({ "data-water": "poster", "data-seed": "99", "data-kind": "music" });
    g.drawWater(c, 7);
    return c.ops;
  };
  assert.deepStrictEqual(tile("winter"), tile("summer"));
});

test("site.css colours the band from the lake-* tokens, in both themes, with dusk over the season", () => {
  for (const theme of [':root, :root[data-theme="light"] {', ':root[data-theme="dark"] {']) {
    const body = CSS.slice(CSS.indexOf(theme)).split("}")[0];
    for (const t of ["winter", "between", "summer", "dusk"]) assert.ok(new RegExp("--lake-" + t + ": #[0-9A-F]{6};").test(body), theme + " " + t);
  }
  assert.ok(CSS.includes('.mast[data-season="winter"] { --lake: var(--lake-winter); }'));
  assert.ok(CSS.includes('.mast[data-season="summer"] { --lake: var(--lake-summer); }'));
  assert.ok(CSS.includes('.mast[data-season][data-dusk] { --lake: var(--lake-dusk); }'));
  const contrast = fs.readFileSync(path.join(__dirname, "check_contrast.py"), "utf8");
  for (const t of ["winter", "between", "summer", "dusk"]) assert.ok(contrast.includes('"lake-' + t + '"'), "contrast checks lake-" + t);
});

console.log(n + " lake checks passed");
