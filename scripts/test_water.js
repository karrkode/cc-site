// Checks run in CI before the site deploys (CC-138): the water patterns in public/js/water.js.
// The same event always draws the same water, at any size and in either theme; different events differ; the
// strokes have the place's opacity; the bitmap follows the pixel ratio; the canvas is hidden from screen readers.
//
//     node scripts/test_water.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const SRC = fs.readFileSync(path.join(__dirname, "..", "public", "js", "water.js"), "utf8");

// A canvas that records what's drawn on it, rounded so the comparison is about the picture
function fakeCanvas(w, h, attrs) {
  const ops = [];
  const ctx = new Proxy({}, {
    get(t, k) { return k in t ? t[k] : (...a) => ops.push(k + "(" + a.map((n) => typeof n === "number" ? n.toFixed(2) : n).join(",") + ")"); },
    set(t, k, v) { ops.push(k + "=" + v); return true; },
  });
  return { clientWidth: w, clientHeight: h, width: 300, height: 150, ops, getContext: () => ctx, getAttribute: (k) => (attrs || {})[k] ?? null };
}

function load(dpr, theme) {
  const sandbox = {
    window: { devicePixelRatio: dpr }, // no matchMedia: the density watch stays off
    document: { documentElement: { getAttribute: () => theme }, querySelectorAll: () => [] },
    $: () => ({ querySelectorAll: () => [] }),
    CAT_KEYS: { "Theater": "theater", "Music": "music", "Visual Art": "art" },
    console,
  };
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox);
  return sandbox;
}

function draw(w, h, id, type, place, opt) {
  const g = load((opt && opt.dpr) || 1, (opt && opt.theme) || "light");
  const html = g.waterHTML({ id, type }, place);
  const attrs = {};
  html.replace(/([\w-]+)="([^"]*)"/g, (_, k, v) => { attrs[k] = v; });
  const c = fakeCanvas(w, h, attrs);
  g.drawWater(c);
  return { c, html, attrs };
}

let n = 0;
function test(name, fn) { fn(); n++; console.log("ok:", name); }

for (const type of ["Theater", "Music", "Visual Art"]) {
  test(type + ": the same event draws the same water every time, in both themes", () => {
    const a = draw(96, 96, "41", type, "tile").c.ops;
    assert.ok(a.length > 10);
    assert.deepStrictEqual(draw(96, 96, "41", type, "tile").c.ops, a);
    assert.deepStrictEqual(draw(96, 96, "41", type, "tile", { theme: "dark" }).c.ops, a);
  });
  test(type + ": different events draw different water", () => {
    assert.notDeepStrictEqual(draw(96, 96, "41", type, "tile").c.ops, draw(96, 96, "42", type, "tile").c.ops);
  });
}

test("on a wider screen, the lines start the same way (the seed, not the size, sets each line)", () => {
  const firstMove = (ops) => ops.find((o) => o.startsWith("moveTo"));
  assert.strictEqual(firstMove(draw(320, 340, "41", "Theater", "poster").c.ops), firstMove(draw(1200, 340, "41", "Theater", "poster").c.ops));
});

test("the three kinds are drawn differently: art in ripples, theater and music in lines", () => {
  const art = draw(96, 96, "7", "Visual Art", "tile").c.ops, music = draw(96, 96, "7", "Music", "tile").c.ops;
  assert.ok(art.some((o) => o.startsWith("ellipse")) && !art.some((o) => o.startsWith("lineTo")));
  assert.ok(music.some((o) => o.startsWith("lineTo")) && !music.some((o) => o.startsWith("ellipse")));
  assert.notDeepStrictEqual(draw(96, 96, "7", "Theater", "tile").c.ops, music);
});

// The y of every point on each line drawn
function lines(ops) {
  const out = [];
  ops.forEach((o) => { if (o === "beginPath()") out.push([]); else if (/^(moveTo|lineTo)/.test(o)) out[out.length - 1].push(Number(o.split(",")[1].slice(0, -1))); });
  return out;
}

test("music is a regular wave: the same height on every line", () => {
  const ls = lines(draw(200, 96, "9", "Music", "tile").c.ops);
  assert.ok(ls.length > 3);
  const swing = (ys) => (Math.max(...ys) - Math.min(...ys)).toFixed(1); // each line starts at its own phase
  ls.forEach((l) => assert.strictEqual(swing(l), swing(ls[0])));
});

test("white strokes: 42% on tiles, 24% on posters, 13% on the masthead", () => {
  assert.ok(draw(96, 96, "1", "Theater", "tile").c.ops.includes("strokeStyle=rgba(255,255,255,0.42)"));
  assert.ok(draw(600, 340, "1", "Theater", "poster").c.ops.includes("strokeStyle=rgba(255,255,255,0.24)"));
  const g = load(1, "light"), c = fakeCanvas(1200, 200, { "data-water": "mast", "data-seed": "5", "data-kind": "theater" });
  g.drawWater(c);
  assert.ok(c.ops.includes("strokeStyle=rgba(255,255,255,0.13)"));
});

test("the line gap is clamp(9px, h/9, 18px)", () => {
  // a long music wave swings evenly round its line, so the middle of each swing is where the line sits
  const gap = (h) => { const mid = lines(draw(2000, h, "3", "Music", "tile").c.ops).map((ys) => (Math.max(...ys) + Math.min(...ys)) / 2); return mid[1] - mid[0]; };
  assert.ok(Math.abs(gap(60) - 9) < 0.1);
  assert.ok(Math.abs(gap(117) - 13) < 0.1);
  assert.ok(Math.abs(gap(340) - 18) < 0.1);
});

test("sharp on high-density screens: the bitmap is the box times the pixel ratio", () => {
  const { c } = draw(96, 80, "1", "Theater", "tile", { dpr: 2 });
  assert.strictEqual(c.width, 192); assert.strictEqual(c.height, 160);
  assert.strictEqual(c.ops[0], "setTransform(2.00,0.00,0.00,2.00,0.00,0.00)");
});

test("a canvas with no size yet (a hidden view) draws nothing", () => {
  assert.deepStrictEqual(draw(0, 0, "1", "Theater", "tile").c.ops, []);
});

test("the canvas is hidden from screen readers and carries its seed and kind", () => {
  const { attrs } = draw(96, 96, "41", "Visual Art", "poster");
  assert.strictEqual(attrs["aria-hidden"], "true");
  assert.strictEqual(attrs["data-water"], "poster");
  assert.strictEqual(attrs["data-kind"], "art");
  assert.strictEqual(attrs["data-seed"], String(41 * 53 + 7));
});

test("ids that aren't small numbers still get a stable seed in range", () => {
  const g = load(1, "light");
  assert.strictEqual(g.waterSeed("abc-123"), g.waterSeed("abc-123"));
  assert.ok(g.waterSeed("abc-123") >= 0 && g.waterSeed("abc-123") < 233280);
  assert.ok(g.waterSeed("99999999999") < 233280);
});

console.log(n + " water checks passed");
