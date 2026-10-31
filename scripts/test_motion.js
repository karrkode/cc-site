// Checks run in CI before the site deploys (CC-144): the motion moments (design brief, section 6).
// Drift (water.js): 0.25 rad/s of phase, at most 30 frames a second, only the masthead and the poster, paused when the
// tab is hidden or the canvas is off-screen, frozen with reduced motion. Tile becomes poster and the dolphins
// (catalog.js): the right names for the swap, an instant swap without the API or with reduced motion, and the brief's
// timings and easings, here and in site.css.
//
//     node scripts/test_motion.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const ROOT = path.join(__dirname, "..", "public");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const helper = (src, name) => src.match(new RegExp("function " + name + "\\([\\s\\S]*?\\n}\\n"))[0];

// ---------- drift ----------
// A page with frames you step by hand, an IntersectionObserver you answer by hand, and canvases that count draws
function page(opt) {
  const frames = [], handlers = {}, media = { matches: !!(opt && opt.reduce), addEventListener: (t, f) => { media.change = f; } };
  let io = null;
  const canvas = (where) => ({ clientWidth: 300, clientHeight: 100, width: 0, height: 0, isConnected: true, where,
    closest: (sel) => (sel === "#mast, .poster" && where !== "tile" ? {} : null),
    getAttribute: (k) => ({ "data-kind": "theater", "data-seed": "5", "data-water": where === "mast" ? "mast" : "poster" })[k],
    getContext: () => new Proxy({}, { get: () => () => {}, set: () => true }) });
  const mast = canvas("mast");
  const sandbox = {
    window: { devicePixelRatio: 1, matchMedia: () => media },
    document: { hidden: false, addEventListener: (t, f) => { handlers[t] = f; }, querySelectorAll: () => [] },
    $: () => ({ querySelectorAll: () => [mast] }),
    requestAnimationFrame: (f) => { frames.push(f); return frames.length; },
    IntersectionObserver: function (cb) { io = { cb, seen: [] }; this.observe = (c) => io.seen.push(c); this.unobserve = () => {}; },
    CAT_KEYS: {}, console,
  };
  vm.createContext(sandbox);
  vm.runInContext(read("js/water.js"), sandbox);
  const draws = [];
  sandbox.drawWater = (c, t) => { if (t !== undefined) draws.push([c.where, t]); }; // the drift calls it by name, with its time
  return {
    g: sandbox, mast, canvas, draws, handlers, media,
    observed: () => io.seen,
    show: (c, on) => io.cb([{ target: c, isIntersecting: on }]),
    run(ms, hz, from) { // step the frames at hz for ms; returns the time it stopped at
      let ts = from || 1000;
      const end = ts + ms;
      while (ts < end && frames.length) { ts += 1000 / hz; frames.shift()(ts); }
      return ts;
    },
    pending: () => frames.length,
  };
}

let p = page();
assert.deepStrictEqual(p.observed(), [p.mast], "the masthead's water is watched");
p.show(p.mast, true);
let ts = p.run(2000, 60);
const mastDraws = p.draws.filter((d) => d[0] === "mast").length;
assert.ok(mastDraws >= 58 && mastDraws <= 60, "30 frames a second at 60Hz, got " + mastDraws / 2);
assert.ok(Math.abs(p.g.WATER_T - 2) < 0.05, "the clock runs at real time (the phase moves 0.25 rad per second of it)");
for (const hz of [120, 144, 240]) {
  const q = page(); q.show(q.mast, true); q.run(2000, hz);
  assert.ok(q.draws.length <= 61, "never more than 30 frames a second at " + hz + "Hz, got " + q.draws.length / 2);
  assert.ok(q.draws.length >= 50, "and not much fewer at " + hz + "Hz, got " + q.draws.length / 2);
}
assert.ok(/water\(canvas[^)]*\)/.test(read("js/water.js")) && /t \* \.25/.test(read("js/water.js")) && /t \* 6/.test(read("js/water.js")),
  "water() moves the phase 0.25 rad/s and art's ripples 6px/s");

// the poster joins when it's on the screen; a tile never does
const poster = p.canvas("poster"), tile = p.canvas("tile");
p.g.paintWater({ querySelectorAll: () => [poster, tile] });
assert.ok(p.observed().includes(poster) && !p.observed().includes(tile), "the poster drifts; row tiles and the lead never move");
p.show(poster, true); p.draws.length = 0;
ts = p.run(500, 60, ts);
assert.ok(p.draws.some((d) => d[0] === "poster") && !p.draws.some((d) => d[0] === "tile"));

// a resize redraws a drifting canvas where the drift has got to, and the others at 0
const real = vm.runInContext("(" + helper(read("js/water.js"), "drawWater") + ")", p.g);
const at = []; p.g.water = (c, seed, kind, t) => at.push(t);
real(poster); real(tile);
assert.deepStrictEqual(at, [p.g.WATER_T, 0]);

// hidden tab: the frames stop; showing it again starts them without a jump
p.g.document.hidden = true;
p.run(100, 60, ts);
assert.strictEqual(p.pending(), 0, "no frames while the tab is hidden");
const t0 = p.g.WATER_T;
p.g.document.hidden = false; p.handlers.visibilitychange();
ts = p.run(1000 / 60 * 1.5, 60, ts + 60000); // a minute later: the first frame only sets the clock
assert.ok(p.g.WATER_T - t0 < 0.05, "no jump after a pause");
p.run(1000, 60, ts);
assert.ok(p.pending() > 0 && p.g.WATER_T - t0 > 0.9, "and it drifts on");

// off-screen: both canvases scrolled away, the frames stop
p.show(p.mast, false); p.show(poster, false);
p.run(100, 60, ts);
assert.strictEqual(p.pending(), 0, "no frames while nothing that drifts is on the screen");
p.show(poster, true);
assert.ok(p.pending() > 0, "back on the screen, it starts again");

// reduced motion: drawn once (by paintWater) and frozen
p = page({ reduce: true });
p.show(p.mast, true);
assert.strictEqual(p.pending(), 0, "reduced motion: no frames at all");
assert.strictEqual(p.g.WATER_T, 0);
assert.strictEqual(p.g.motionOK(), false);
p = page();
p.show(p.mast, true); p.run(200, 60);
p.media.matches = true; p.run(200, 60);
assert.strictEqual(p.pending(), 0, "turning reduced motion on stops it where it is");

// ---------- tile becomes poster ----------
const CATALOG = read("js/catalog.js");
function catalog(opt) {
  const cls = new Set(), started = [], log = [];
  const g = {
    document: { documentElement: { classList: { add: (...c) => c.forEach((x) => cls.add(x)), remove: (...c) => c.forEach((x) => cls.delete(x)),
      toggle: (c, on) => (on ? cls.add(c) : cls.delete(c)) } } },
    motionOK: () => !(opt && opt.reduce), renderEventView: () => log.push("redraw"), console,
  };
  if (!(opt && opt.noApi)) g.document.startViewTransition = (cb) => {
    let finish; const finished = new Promise((r) => (finish = r));
    started.push({ cb, finish, cls: [...cls] }); return { finished };
  };
  vm.createContext(g);
  vm.runInContext("var POSTER = { seq: 0, moving: false, redraw: false };" + helper(CATALOG, "posterSource") + helper(CATALOG, "posterMove"), g);
  return { g, cls, started, log };
}
const el = (over) => Object.assign({ style: {}, classList: { contains: () => false }, querySelector: () => null }, over);
function row() {
  const tile = el(), title = el();
  return { a: el({ querySelector: (s) => (s === ".tile" ? tile : s === ".listing-t, .lead-t" ? title : null) }), tile, title };
}
let c = catalog();
let r = row();
let src = c.g.posterSource(r.a);
assert.ok(src.tile === r.tile && src.title === r.title, "a row: its tile and title");
const leadT = el(), lead = el({ classList: { contains: (k) => k === "lead-pick" }, querySelector: (s) => (s === ".listing-t, .lead-t" ? leadT : null) });
assert.ok(c.g.posterSource(lead).tile === lead && c.g.posterSource(lead).title === leadT, "the home lead: itself and its title");
assert.strictEqual(c.g.posterSource(el()), null, "Last chance and cards have no tile: no move");
assert.strictEqual(c.g.posterSource(null), null);

(async () => {
  // forward: named for the swap, cleared after; a redraw during the move waits for its end
  let swapped = 0;
  c.g.posterMove(src, false, () => swapped++);
  assert.strictEqual(swapped, 0, "the swap waits for the old picture");
  assert.strictEqual(r.tile.style.viewTransitionName, "poster"); assert.strictEqual(r.title.style.viewTransitionName, "ev-title");
  assert.deepStrictEqual(c.started[0].cls, ["vt-poster"], "and the event page's poster and title are named by .vt-poster");
  c.started[0].cb();
  assert.strictEqual(swapped, 1); assert.strictEqual(c.g.POSTER.moving, true);
  c.g.POSTER.redraw = true; // the event's details came back mid-move
  c.started[0].finish(); await new Promise((res) => setImmediate(res));
  assert.strictEqual(r.tile.style.viewTransitionName, ""); assert.strictEqual(r.title.style.viewTransitionName, "");
  assert.strictEqual(c.cls.size, 0); assert.strictEqual(c.g.POSTER.moving, false);
  assert.deepStrictEqual(c.log, ["redraw"], "the held redraw happens once the move ends");

  // back: .vt-back for the 340ms timing
  c.g.posterMove(src, true, () => {});
  assert.deepStrictEqual(c.started[1].cls.sort(), ["vt-back", "vt-poster"]);
  // a newer move skips the older; the older's end leaves the newer's names alone
  c.g.posterMove(src, false, () => {});
  c.started[1].finish(); await new Promise((res) => setImmediate(res));
  assert.strictEqual(r.tile.style.viewTransitionName, "poster", "the newer move keeps its names");

  // no API, reduced motion, or no tile: the view just changes, at once
  for (const [opt, s, why] of [[{ noApi: true }, src, "without the API"], [{ reduce: true }, src, "with reduced motion"], [{}, null, "without a tile"]]) {
    const k = catalog(opt); let done = 0;
    k.g.posterMove(s, false, () => done++);
    assert.strictEqual(done, 1, "an instant swap " + why); assert.strictEqual(k.started.length, 0); assert.strictEqual(k.cls.size, 0);
  }

  // ---------- the dolphins ----------
  function dolphins(reduce) {
    const anims = [], body = [], marks = [];
    const mk = (cls) => ({ cls, animate(k, o) { const a = { k, o, currentTime: 0 }; anims.push([cls, a]); return a; }, remove() {}, classList: { add() {} },
      setAttribute() {}, getBoundingClientRect: () => ({ left: 100, top: 200, width: 30, height: 20 }), querySelector: () => null });
    const g = {
      motionOK: () => !reduce, performance: { now: () => 0 }, markHTML: (kind) => { marks.push(kind); return "<svg>"; },
      document: { body: { insertAdjacentHTML() { body.push(mk("leaper")); }, get lastElementChild() { return body[body.length - 1]; }, appendChild() {} },
        createElement: () => mk("ripple") },
      console,
    };
    vm.createContext(g);
    vm.runInContext(CATALOG.match(/var EV_MOTION[\s\S]*?\nvar NOD = [\s\S]*?};\n/)[0] + helper(CATALOG, "evLeap") + helper(CATALOG, "evRipples") + helper(CATALOG, "evNod"), g);
    const mark = mk("mark"), btn = Object.assign(mk("btn"), { querySelector: () => mark });
    return { g, anims, btn, marks };
  }
  let d = dolphins(false);
  d.g.evLeap(d.btn, "7");
  const [, leap] = d.anims[0];
  assert.strictEqual(leap.o.duration, 760); assert.strictEqual(leap.o.easing, "cubic-bezier(.33,0,.4,1)");
  assert.strictEqual(leap.k[0].opacity, 0); assert.strictEqual(leap.k[leap.k.length - 1].opacity, 0, "out of the button and back in");
  assert.strictEqual(d.g.EV_MOTION.you, "7", "then You're going slides in");
  assert.deepStrictEqual(d.marks, ["interested"], "CC-154: the lake dolphin leaps, not the ink one");
  leap.onfinish();
  const rings = d.anims.filter((x) => x[0] === "ripple").map((x) => x[1].o);
  assert.deepStrictEqual(rings.map((o) => [o.duration, o.delay]), [[620, 0], [620, 130]], "two rings on landing, 130ms apart");
  d.g.evNod(d.btn, "7");
  const nod = d.anims[d.anims.length - 1][1];
  assert.strictEqual(nod.o.duration, 360); assert.strictEqual(nod.k[1].transform, "translateY(-5px) rotate(-12deg)", "tips −12° and rises 5px");
  d = dolphins(true);
  d.g.evLeap(d.btn, "7"); d.g.evNod(d.btn, "7");
  assert.strictEqual(d.anims.length, 0, "reduced motion: no leap, nod or rings");
  assert.strictEqual(d.g.EV_MOTION.you, null, "and no slide");
  assert.deepStrictEqual(d.marks, [], "and no dolphin is added");
  assert.ok(/if \(on\) evLeap\(/.test(read("js/account.js")) && /if \(on\) evNod\(/.test(read("js/account.js")), "only turning Going or Interested on moves a dolphin");

  // ---------- site.css: the brief's timings ----------
  const css = read("css/site.css");
  const rule = (sel) => { const m = css.match(new RegExp(sel.replace(/[()[\].]/g, "\\$&") + "[^{]*\\{([^}]*)\\}")); return m ? m[1] : ""; };
  // CC-154: the leap and its rings are lake, with no red in either theme
  assert.ok(!/--dol-|--star/.test(rule(".mark.leaper")), "the leaper keeps .mark-int's lake colours");
  assert.ok(/border: 2px solid var\(--stripe\)/.test(rule(".ripple")) && !/--star/.test(rule(".ripple")), "lake rings");
  assert.ok(/\.leaper, \.ripple \{ display: none; \}/.test(css), "reduced motion hides them");
  assert.ok(/animation-duration: 440ms/.test(rule("::view-transition-group(poster), ::view-transition-group(ev-title)")), "440ms forward");
  assert.ok(/cubic-bezier\(\.2, \.8, \.2, 1\)/.test(rule("::view-transition-group(poster), ::view-transition-group(ev-title)")));
  assert.ok(/animation-duration: 340ms/.test(rule(".vt-back::view-transition-group(poster)")), "340ms back");
  assert.ok(/animation-duration: 220ms/.test(rule("::view-transition-old(root), ::view-transition-new(root)")), "root crossfade 220ms");
  assert.ok(/object-fit: cover/.test(rule("::view-transition-old(poster), ::view-transition-new(poster)")));
  assert.ok(/view-transition-name: poster/.test(rule(".vt-poster #ev-body .poster")) && /view-transition-name: ev-title/.test(rule(".vt-poster #event-title")));
  assert.ok(/@media \(prefers-reduced-motion: reduce\) \{\s*::view-transition-group\(\*\), ::view-transition-old\(\*\), ::view-transition-new\(\*\) \{ animation: none !important; \}/.test(css),
    "reduced motion: views swap instantly");

  console.log("motion: ok");
})().catch((e) => { console.error(e); process.exit(1); });
