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
    motionOK: () => !(opt && opt.reduce), renderEventView: () => log.push("redraw"), rowsSettle: () => { g.settled = (g.settled || 0) + 1; }, console,
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

  // ---------- CC-225: the shared tokens, and buttons press to .97 ----------
  const root = css.match(/:root \{\s*--on-cat[\s\S]*?\n\}/)[0];
  assert.ok(/--ease-out: cubic-bezier/.test(root) && /--ease-in-out: cubic-bezier/.test(root), "an easing for entrances and one for movement");
  assert.ok(/--dur-drop: 200ms/.test(root), "drop-downs take about 200ms");
  assert.ok(/\.view \{ animation: rise [^;]*var\(--ease-out\)/.test(css), "views enter with ease-out");
  const press = css.match(/@media \(prefers-reduced-motion: no-preference\) \{\s*button, a\.btn, a\.textbtn[\s\S]*?\n\}/);
  assert.ok(press, "the press only exists when motion is welcome, so reduced motion never scales");
  const scaled = press[0].match(/([^{}]*)\{ transform: scale\(\.97\); \}/)[1], kept = press[0].match(/([^{}]*)\{ content: ""; position: absolute; inset: -2%; \}/)[1];
  assert.ok(scaled.includes("button:active:not(:disabled)") && scaled.includes("a.btn:active") && scaled.includes("a.textbtn:active"), "every button scales to .97, unless it's disabled");
  // Whole-row links. The link scales only where it is the row; otherwise the row does, as an inline link can't move and a tile would jump.
  [".last:active", ".lead-pick:active", "a.hub-row:active", ".listing:has(.listing-a:active)", ".wk-row:has(> .wk-row-a:active)",
    ".crew-plan:has(> .crew-plan-a:active)", ".journal-row:has(> .journal-a:active)", ".acct-row:has(.acct-row-t a:active)"].forEach((sel) => assert.ok(scaled.includes(sel), sel + " presses"));
  [".wk-row-a:active", ".listing-a:active", ".crew-plan-a:active", ".journal-a:active"].forEach((sel) => assert.ok(!scaled.replace(/:has\([^)]*\)/g, "").includes(sel), sel + " leaves the scaling to its row"));
  ["button:active:not(:disabled)::after", "a.btn:active::after", "a.textbtn:active::after", "a.hub-row:active::after", ".last:active::after", ".lead-pick:active::after", ".listing-a:active::after",
    ".wk-row-a:active::after", ".crew-plan-a:active::after", ".journal-a:active::after", ".acct-row-t a:active::after"].forEach((sel) => assert.ok(kept.includes(sel), sel + ": the shrinking edge keeps the pointer, so the click isn't lost"));
  assert.ok(/\.lead-pick:active \{ overflow: visible; \}/.test(press[0]), "the lead pick's field doesn't clip that");
  assert.strictEqual(css.split("scale(.97)").length, 2, "and nothing outside that block scales a button");
  assert.ok(/a\.btn, a\.textbtn \{ display: inline-block; \}/.test(css), "a transform can't move an inline link");
  assert.ok(/addEventListener\("touchstart", function \(\) \{\}, \{ passive: true \}\)/.test(read("js/core.js")), "iOS needs a touch listener for :active");

  // ---------- CC-226: links grow 2.5px on hover instead of underlining ----------
  assert.ok(!/:hover[^{}]*\{[^{}]*text-decoration/.test(css), "no hover turns an underline on");
  const hoverOnly = css.match(/@media \(hover: hover\) \{\s*\.lead-t[\s\S]*?\n\}/);
  const grow = hoverOnly && hoverOnly[0].match(/([^{}]*)\{ scale: calc\(1 \+ var\(--grow\) \/ var\(--fs\)\); \}/);
  assert.ok(grow, "the growth is the same px at each text's own size, and only where a device can hover");
  [".navlink:hover", ".ev-back:hover", ".lf-back .textbtn:hover", ".lead-pick:hover .lead-t", ".way:hover .way-t", ".last:hover .last-t", ".listing:hover .listing-t",
    ".wk-row-a:hover .listing-t", ".journal-a:hover .listing-t", ".crew-plan-a:hover .listing-t", ".crew-sum:hover .crew-top", ".hub-row:hover .hub-name",
    ".lf-page .opt:hover:not(:disabled) .opt-main"].forEach((sel) => assert.ok(grow[1].includes(sel), sel + " grows"));
  // The scale is only right if --fs says what font-size says, wherever a size changes
  const sized = css.match(/font-size: [^;]+; --fs: \d+;/g);
  assert.ok(sized.length >= 15, "each size of each growing text has its --fs");
  sized.forEach((d) => {
    const [, size, unit, fs] = d.match(/font-size: ([\d.]+)(px|rem); --fs: (\d+);/);
    assert.strictEqual(parseFloat(size) * (unit === "rem" ? 16 : 1), Number(fs), d);
  });
  assert.ok(/@media \(hover: hover\) \{\s*\.lead-t, \.last-t, \.listing-t, \.crew-top, \.hub-name \{ padding-right: calc\(100% \* var\(--grow\) \/ \(var\(--fs\) \+ var\(--grow\)\)\); \}/.test(css),
    "a name wraps so that, grown, it still fits its column and misses the price");
  assert.ok(/--grow: 2\.5;/.test(root), "links grow 2.5px");
  const origin = css.match(/([^{}]*)\{ transform-origin: 0 50%; \}/)[1];
  [".lead-t", ".way-t", ".last-t", ".listing-t", ".crew-top", ".hub-name", ".opt-main", ".ev-back", ".lf-back .textbtn"].forEach((sel) => assert.ok(origin.includes(sel), sel + " grows from the start of its text"));
  assert.ok(/\.navlink \{ transform-origin: 8px 50%; \}/.test(css), "a nav link's text starts after its padding");
  const animated = css.match(/@media \(prefers-reduced-motion: no-preference\) \{\s*\.lead-t[\s\S]*?\n\}/);
  assert.ok(animated && /transition: scale var\(--dur-grow\) var\(--ease-in-out\)/.test(animated[0]), "the growth is animated only when motion is welcome");
  assert.ok(/\.navlink, \.ev-back, \.lf-back \.textbtn \{ transition: transform var\(--dur-press\) var\(--ease-out\), scale var\(--dur-grow\)/.test(animated[0]), "buttons that grow keep their press");
  assert.ok(/@media \(hover: hover\) and \(prefers-reduced-motion: no-preference\) \{\s*[^{}]*\.listing-t[^{}]*\{ will-change: scale; \}/.test(css),
    "the text keeps its layer, or it jumps to the pixel grid as the growth starts and ends; touch screens don't pay for the layers");
  assert.ok(!/\.listing-a::after \{ content/.test(css) && /\.listing-cover \{ position: absolute; inset: 0; \}/.test(css), "a scaled name would hold the row's cover, so the cover is outside it");

  // ---------- opening and closing (CC-227) ----------
// The helper in util.js, on elements whose Animation you finish by hand
{
const util = read("js/util.js");
function mover(opt) {
  const anims = [], doc = {};
  const animation = () => { const a = { reversed: 0, cancelled: 0, currentTime: 0, reverse() { a.reversed++; }, cancel() { a.cancelled++; } }; anims.push(a); return a; };
  const el = (over) => Object.assign({ hidden: true, inert: false, open: false, isConnected: true, style: { setProperty(k, v, p) { this[k] = v; this.important = p; } },
    classList: { add() {}, remove() {} }, getClientRects: () => [1], getBoundingClientRect: () => ({ left: 100, top: 100, width: 400, height: 300 }),
    animate: () => animation() }, over);
  const sandbox = {
    window: { matchMedia: () => ({ matches: !!(opt && opt.calm) }), innerWidth: 1000, innerHeight: 800, scrollTo() {}, scrollX: 0, scrollY: 0 },
    document: { addEventListener: (t, f) => { doc[t] = f; }, documentElement: {}, createElement: () => el({ remove() { sandbox.scrimGone = true; } }), body: { appendChild() {} } },
    getComputedStyle: () => ({ position: "absolute", display: "grid", backgroundColor: "rgb(0 0 0)", getPropertyValue: (k) => ({ "--dur-drop": "200ms", "--ease-out": "ease-out", "--ease-in-out": "ease-in-out" })[k] }),
    WeakMap, Object, Math, parseFloat,
  };
  vm.createContext(sandbox);
  const from = util.indexOf("// ---------- opening and closing (CC-227"), to = util.indexOf("// ---------- the masthead (CC-137)");
  assert.ok(from > 0 && to > from, "the helper sits before the masthead");
  vm.runInContext(util.slice(from, to), sandbox);
  return { g: sandbox, el, anims, doc };
}

// a drop-down: state changes at once, and the exit keeps it painted and inert until it ends
let m = mover(), panel = m.el();
m.g.dropOpen(panel);
assert.strictEqual(panel.hidden, false, "it opens");
assert.strictEqual(m.anims.length, 1, "with one animation");
m.anims[0].onfinish();
m.g.dropClose(panel);
assert.strictEqual(panel.hidden, true, "hidden changes at once, so everything that reads it works as before");
assert.strictEqual(panel.inert, true, "nothing in it can be reached while it leaves");
assert.strictEqual(panel.style.display, "grid", "it stays painted");
assert.strictEqual(panel.style.important, "important", "over the page's [hidden] rule, which is !important");
assert.strictEqual(m.anims[1].reversed, 1, "the exit is the entrance played backwards");
m.anims[1].onfinish();
assert.strictEqual(panel.style.display, "", "and only then does it go");
assert.strictEqual(panel.inert, false, "leaving nothing behind");

// opened and closed quickly: the one animation turns round, and the last word wins
m = mover(); panel = m.el();
m.g.dropOpen(panel); m.g.dropClose(panel); m.g.dropOpen(panel);
assert.strictEqual(m.anims.length, 1, "it never stacks up animations");
assert.strictEqual(m.anims[0].reversed, 2, "it turns round from where it is, each time");
assert.strictEqual(panel.hidden, false);
assert.strictEqual(panel.inert, false, "reachable again as soon as it's coming back");
assert.strictEqual(panel.style.display, "");
m.anims[0].onfinish();
assert.strictEqual(panel.hidden, false, "the exit it turned away from doesn't finish later and hide it");
assert.strictEqual(panel.style.display, "");

// focus goes in before the move: focus on something shifted off the screen scrolls the page
m = mover(); panel = m.el();
let order = [];
panel.animate = () => { order.push("move"); return { reverse() {} }; };
m.g.dropOpen(panel, () => order.push("focus"));
assert.deepStrictEqual(order, ["focus", "move"]);

// a class shows the phone menu: it's hidden when the exit ends, not before
m = mover(); panel = m.el({ hidden: false });
let hid = 0;
m.g.dropClose(panel, () => hid++);
assert.strictEqual(hid, 0, "the exit finishes first");
m.anims[0].onfinish();
assert.strictEqual(hid, 1);
m = mover(); panel = m.el({ hidden: false }); hid = 0;
m.g.dropClose(panel, () => hid++); m.g.dropOpen(panel); m.anims[0].onfinish();
assert.strictEqual(hid, 0, "opened again mid-exit, it stays");

// reduced motion, or a browser without the API: they swap at once
m = mover({ calm: true }); panel = m.el();
m.g.dropOpen(panel); assert.strictEqual(panel.hidden, false);
m.g.dropClose(panel); assert.strictEqual(panel.hidden, true);
assert.strictEqual(m.anims.length, 0, "no animation with reduced motion");
assert.strictEqual(panel.inert, false);

// a dialog closes for real at once, so focus returns to a page that can take it; only then does it leave on screen
m = mover();
let closed = 0, opened = 0, sized = [];
const dlg = m.el({ tagName: "DIALOG", open: false, showModal() { this.open = true; opened++; }, close() { this.open = false; closed++; },
  animate(f, t) { sized.push([f, t]); return Object.assign(m.el().animate(), { reverse() { this.reversed++; } }); } });
dlg.classList = { list: [], add(c) { this.list.push(c); }, remove(c) { this.list = this.list.filter((x) => x !== c); } };
m.doc.click({ target: { closest: () => m.el({ getBoundingClientRect: () => ({ left: 10, top: 20, width: 80, height: 40 }) }) } });
m.g.openDialog(dlg);
assert.strictEqual(opened, 1);
assert.ok(/^translate\(-[\d.]+px, -[\d.]+px\) scale\(0\.2\)$/.test(sized[0][0][0].transform), "it starts at the control pressed: " + sized[0][0][0].transform);
assert.strictEqual(sized[0][1].easing, "ease-out", "an entrance eases out");
assert.strictEqual(sized[0][1].duration, 200, "in --dur-drop");
assert.strictEqual(sized[1][1].pseudoElement, "::backdrop", "its backdrop fades with it");
m.anims[0].onfinish();
m.g.closeDialog(dlg);
assert.strictEqual(closed, 1, "close() runs at once");
assert.strictEqual(dlg.inert, true);
assert.ok(dlg.classList.list.includes("dialog-leaving"), "held on screen");
assert.strictEqual(sized[2][1].easing, "ease-in-out", "an exit eases in and out: an ease-out backwards sits still");
m.g.closeDialog(dlg);
assert.strictEqual(closed, 1, "a second close does nothing");
// Escape reaches the same place through the dialog's cancel event, and the browser closes it
m = mover();
const esc = m.el({ tagName: "DIALOG", open: true, classList: { add() { esc.leaving = 1; }, remove() {} }, showModal() {} });
m.doc.cancel({ target: esc });
assert.ok(!esc.leaving, "a dialog openDialog didn't open is left alone: the QR screen");
m.g.openDialog(esc); m.doc.cancel({ target: esc });
assert.strictEqual(esc.leaving, 1, "Escape leaves the same way");

// every dialog goes through the helper, except the QR screen, which stays white and instant
["photos", "hours", "issues", "admin", "account", "catalog", "found"].forEach((f) => {
  const src = read("js/" + f + ".js");
  (src.match(/\$\("[\w-]+"\)\.(showModal|close)\(\)/g) || []).forEach((call) => {
    assert.ok(/qr-full|invite-dialog"\)\.close/.test(call), f + ".js goes round the helper: " + call);
  });
});
const site = read("css/site.css");
assert.ok(/\.qr-full::backdrop \{ background: #FFFFFF; \}/.test(site), "the QR screen's backdrop is white in both themes");
assert.ok(/dialog\.dialog-leaving \{[^}]*position: fixed/.test(site), "a leaving dialog is held in place");
}

// ---------- everything else that drops down (CC-228) ----------
{
const util = read("js/util.js");
const from = util.indexOf("// ---------- opening and closing (CC-227"), to = util.indexOf("// ---------- the masthead (CC-137)");
// A list with panels in it: repaint() swaps in new panels, as innerHTML does, and the old ones are gone from it
function shelf(opt) {
  const anims = [], root = { kids: [] };
  const panel = (id, hidden) => {
    const attrs = { "data-drop": "" }, p = { id, hidden, inert: false, removed: 0, style: { setProperty(k, v) { this[k] = v; } }, getClientRects: () => [1], getBoundingClientRect: () => ({ height: 120 }),
      closest: () => null, getAttribute: (k) => attrs[k], setAttribute: (k, v) => { attrs[k] = v; }, removeAttribute: (k) => { if (k === "id") p.id = ""; delete attrs[k]; },
      has: (k) => k in attrs, after: (x) => root.kids.push(x), remove() { p.removed++; root.kids = root.kids.filter((k) => k !== p); },
      animate: () => { const a = { reversed: 0, currentTime: 0, reverse() { a.reversed++; }, cancel() { a.cancelled = true; if (a.oncancel) a.oncancel(); }, finish() { a.onfinish(); } }; anims.push(a); return a; } };
    return p;
  };
  root.querySelectorAll = (sel) => root.kids.filter((k) => k.has(sel.slice(1, -1)));
  const sandbox = {
    window: { matchMedia: () => ({ matches: !!(opt && opt.calm) }), scrollTo() {}, scrollX: 0, scrollY: 0 },
    document: { addEventListener() {}, documentElement: {} },
    getComputedStyle: () => ({ position: "static", display: "block", getPropertyValue: (k) => ({ "--dur-drop": "200ms", "--ease-out": "ease-out", "--ease-in-out": "ease-in-out" })[k] }),
    WeakMap, Object, Math, parseFloat,
  };
  vm.createContext(sandbox); vm.runInContext(util.slice(from, to), sandbox);
  return { g: sandbox, root, panel, anims, repaint: (...kids) => sandbox.dropRepaint(root, () => { root.kids = kids; }) };
}
let s = shelf();
s.root.kids = [s.panel("a", true)];
s.repaint(s.panel("a", true));
assert.strictEqual(s.anims.length, 0, "a repaint that changes nothing moves nothing");
s.repaint(s.panel("a", false));
assert.strictEqual(s.anims.length, 1, "shut to open: it slides");
assert.strictEqual(s.anims[0].reversed, 0);
s.anims[0].finish();
s.repaint(s.panel("a", false));
assert.strictEqual(s.anims.length, 1, "open and still open: it's left alone");

const was = s.root.kids[0], standIn = s.panel("a", true);
s.repaint(standIn);
assert.ok(s.root.kids.includes(was), "the panel a repaint shut comes back to leave");
assert.strictEqual(was.id, "", "without its id, which is the stand-in's now");
assert.strictEqual(was.inert, true, "and nothing in it can be reached");
assert.strictEqual(s.anims[1].reversed, 1, "the exit is the entrance backwards");
s.anims[1].currentTime = 80;
const again = s.panel("a", false);
s.repaint(again);
assert.strictEqual(s.anims[1].cancelled, true, "opened mid-exit: the old one stops");
assert.strictEqual(was.removed, 1, "and goes");
assert.strictEqual(s.anims[2].currentTime, 80, "the new one starts where the old one had got to");

s = shelf();
s.repaint(s.panel("new", false));
assert.strictEqual(s.anims.length, 0, "a first paint is drawn as it stands: a lone crew doesn't slide open on arrival");

s = shelf({ calm: true });
s.root.kids = [s.panel("a", false)];
const calm = s.root.kids[0];
s.repaint(s.panel("a", true));
assert.strictEqual(s.anims.length, 0, "reduced motion: no animation");
assert.strictEqual(calm.removed, 1, "and it's gone at once");
s.repaint(s.panel("a", false));
assert.strictEqual(s.anims.length, 0, "and the next one opens at once");

// a filled box empties only once it's shut, and a change while it's open doesn't replay the entrance
s = shelf();
const box = Object.assign(s.panel("box", true), { innerHTML: "" });
s.g.dropFill(box, "ask");
assert.strictEqual(s.anims.length, 1); assert.strictEqual(box.innerHTML, "ask");
s.anims[0].finish();
s.g.dropFill(box, "ask again");
assert.strictEqual(s.anims.length, 1, "already open: its words just change");
s.g.dropEmpty(box);
assert.strictEqual(box.hidden, true); assert.strictEqual(box.innerHTML, "ask again", "it keeps its words on the way out");
s.anims[1].finish();
assert.strictEqual(box.innerHTML, "");

// a position: relative panel is in the flow: the pick note opens up its height, rather than shifting over the page
const plain = s.panel("p", false);
const place = (position) => { s.g.getComputedStyle = () => ({ position, display: "block" }); return s.g.dropFrames(plain); };
assert.ok("height" in place("relative")[0] && "height" in place("static")[0]);
assert.ok("transform" in place("absolute")[0] && "transform" in place("fixed")[0]);

// Every panel that drops down from a control goes through the helper
const all = ["util", "crews", "account", "admin", "found", "sourcing"].map((f) => read("js/" + f + ".js")).join("\n");
[/note\.hidden = /, /names\.hidden = /, /panel\.hidden = !open/, /box\.hidden = true; toggle/, /\$\("crew-new"\)\.hidden = /, /form\.hidden = /, /\$\("ed-confirm"\)\.hidden = false/, /\.rm-confirm"\)[^\n]*open\.remove\(\)/, /\$\("(oot|removed)-ask"\)\.innerHTML = /].forEach((old) => {
  assert.ok(!old.test(all), "a panel appears or goes without its slide: " + old);
});
["crew-list", "went-grid", "src-list", "sources-list"].forEach((id) => assert.ok(all.includes('dropRepaint($("' + id + '")'), id + " repaints through dropRepaint"));
const page = read("index.html");
(page.match(/<details[\s\S]*?<\/details>/g) || []).forEach((d) => assert.ok(/<\/summary>\s*<div class="details-body">/.test(d), "a <details> needs a .details-body to slide: " + d.slice(0, 60)));

// the grid's panel on Event sources keeps the same time, its wait with it, and no time with reduced motion
const css = read("css/site.css"), grid = read("js/sourcegrid.js");
assert.ok(/\.sg-panel \{[^}]*transition: grid-template-rows var\(--dur-drop\) var\(--ease-in-out\)/.test(css), "it shuts in --dur-drop");
assert.ok(/\.sg-panel\.open \{[^}]*transition-timing-function: var\(--ease-out\)/.test(css), "and opens easing out");
assert.strictEqual(+grid.match(/SG_PAUSE = (\d+)/)[1], parseFloat(css.match(/--dur-drop: (\d+)ms/)[1]), "sourcegrid.js waits as long as the panel moves");
}

// ---------- the price slider (CC-229) ----------
{
const planner = read("js/planner.js");
const code = planner.slice(planner.indexOf("function priceFill"), planner.indexOf('$("plan-opts").addEventListener("input"'));
assert.ok(/id="plan-price" min="0" max="' \+ last \+ '" step="any"/.test(planner), "the thumb is free to sit between stops");
assert.ok(/touch-action: pan-y/.test(read("css/site.css").match(/\.price-pick input\[type="range"\] \{[^}]*\}/)[0]), "a sideways drag on a phone stays with the thumb");

function slider(opt) {
  const frames = [], paints = [];
  const r = { max: "3", value: "1", isConnected: true, style: { setProperty() {} } };
  const anim = { progress: 0, cancelled: false, effect: { getComputedTiming: () => ({ progress: anim.progress }) }, cancel() { anim.cancelled = true; } };
  r.animate = (keys, timing) => { r.timing = timing; return anim; };
  const g = { PLAN_STOPS: [20, 35, 50, "any"], plan: { budget: 35 }, paintPrice: () => paints.push(g.plan.budget),
    motionOn: () => !(opt && opt.calm), motionTiming: (leaving) => ({ leaving }), requestAnimationFrame: (f) => frames.push(f) };
  vm.createContext(g);
  vm.runInContext(code, g);
  const step = () => frames.shift()();
  return { g, r, anim, paints, frames, step, drag: (on) => vm.runInContext("priceDrag = " + on, g), glide: () => vm.runInContext("priceGlide", g) };
}

// a drag: the thumb stays where the pointer has it, and the budget changes only as it passes a stop, always to a real one
let s = slider();
s.drag(true);
s.r.value = "1.3"; s.g.priceMoved(s.r);
assert.strictEqual(s.g.plan.budget, 35); assert.deepStrictEqual(s.paints, [], "nothing repaints between stops");
assert.strictEqual(s.r.value, "1.3", "the thumb is left where it is");
s.r.value = "1.7"; s.g.priceMoved(s.r);
assert.strictEqual(s.g.plan.budget, 50); assert.deepStrictEqual(s.paints, [50], "passing a stop updates the label and count");
s.r.value = "2.8"; s.g.priceMoved(s.r);
assert.strictEqual(s.g.plan.budget, "any", "the top stop can be Any price");

// not a drag: however small or large the browser's nudge, it's one stop; Home and End go to the ends
s = slider();
s.r.value = "1.02"; s.g.priceMoved(s.r);
assert.strictEqual(s.g.plan.budget, 50); assert.strictEqual(+s.r.value, 2, "a small nudge up is one stop");
s.r.value = "1.7"; s.g.priceMoved(s.r);
assert.strictEqual(s.g.plan.budget, 35); assert.strictEqual(+s.r.value, 1, "a big nudge down is one stop");
s.r.value = "3"; s.g.priceMoved(s.r);
assert.strictEqual(s.g.plan.budget, "any", "End");
s.r.value = "0"; s.g.priceMoved(s.r);
assert.strictEqual(s.g.plan.budget, 20, "Home");

// on release it eases to the stop, using the shared exit timing, and ends exactly on it
s = slider();
s.r.value = "1.4";
s.g.priceSettle(s.r);
assert.strictEqual(s.r.timing.leaving, true, "ease-in-out, the shared time");
s.anim.progress = 0.5; s.step();
assert.ok(Math.abs(s.r.value - 1.2) < 1e-9, "it goes where the easing says");
s.anim.progress = null; s.step();
assert.strictEqual(s.r.value, 1, "lands on the stop");
assert.strictEqual(s.frames.length, 0, "and stops asking for frames");
assert.strictEqual(s.glide(), null);

// grabbed again as it settles: the settling stops, and the thumb is the pointer's
s = slider();
s.r.value = "1.4";
s.g.priceSettle(s.r);
s.g.priceGlideStop();
assert.ok(s.anim.cancelled);
s.r.value = "1.3"; s.step();
assert.strictEqual(s.r.value, "1.3", "a late frame doesn't move it");

// the slider is gone (Back, the next step) as it settles: no frames left running
s = slider();
s.r.value = "1.4";
s.g.priceSettle(s.r);
s.r.isConnected = false; s.step();
assert.strictEqual(s.frames.length, 0);

// reduced motion, or already on a stop: straight there, nothing animated
s = slider({ calm: true });
s.r.value = "1.4"; s.g.priceSettle(s.r);
assert.strictEqual(s.r.value, 1); assert.strictEqual(s.r.timing, undefined, "no animation with reduced motion");
s = slider();
s.r.value = "1"; s.g.priceSettle(s.r);
assert.strictEqual(s.r.timing, undefined, "nothing to do");
}

// ---------- list rows arrive (CC-230) ----------
// rowsPainted in util.js, on a list whose rows record what they're asked to play
{
const util = read("js/util.js"), css = read("css/site.css");
function rowList(opt) {
  let now = 1000, shown = true;
  const played = [];
  const row = (k) => ({ getAttribute: () => k, animate(frames, t) { const a = { k, frames, t, currentTime: null, finished: 0, finish() { a.finished++; } }; played.push(a); return a; } });
  const root = { rows: [], animate: () => {}, getClientRects: () => (shown ? [1] : []), querySelectorAll: () => root.rows };
  const sandbox = {
    window: { matchMedia: () => ({ matches: !!(opt && opt.calm) }) },
    document: { addEventListener() {}, documentElement: {}, querySelectorAll: () => [root] },
    performance: { now: () => now },
    getComputedStyle: () => ({ getPropertyValue: (k) => ({ "--dur-drop": "200ms", "--stagger": "30ms", "--ease-out": "ease-out", "--ease-in-out": "ease-in-out" })[k] }),
    WeakMap, Object, Math, Array, parseFloat,
  };
  vm.createContext(sandbox);
  vm.runInContext(util.slice(util.indexOf("// ---------- opening and closing (CC-227"), util.indexOf("// ---------- the masthead (CC-137)")), sandbox);
  const paint = (n, from) => { root.rows = Array.from({ length: n }, (_, i) => row("e" + ((from || 0) + i))); played.length = 0; sandbox.rowsPainted(root); return played.slice(); };
  return { g: sandbox, root, paint, played, wait: (ms) => { now += ms; }, hide: (h) => { shown = !h; } };
}

// a new list: in order, 30ms apart, easing out, and the rest with the tenth
let l = rowList(), a = l.paint(300);
assert.strictEqual(a.length, 300);
assert.deepStrictEqual(a.slice(0, 4).map((x) => x.t.delay), [0, 30, 60, 90], "rows enter in order, 30ms apart");
assert.strictEqual(a[9].t.delay, 270, "the tenth");
assert.ok(a.slice(9).every((x) => x.t.delay === 270), "the rest come with it, so 300 rows don't take 9 seconds");
assert.ok(a[299].t.delay + a[299].t.duration <= 500, "every row is readable within half a second");
assert.strictEqual(a[0].t.easing, "ease-out");
assert.strictEqual(a[0].t.fill, "backwards", "a waiting row stays out of sight, and an ended one is left to the page");
assert.deepStrictEqual(Object.keys(a[0].frames[0]).sort(), ["opacity", "translate"], "nothing in the layout moves, and transform and scale stay free for the press and growth");

// a repaint during the entrance carries on from where it was
l.wait(100); let b = l.paint(300);
assert.strictEqual(b.length, 300, "the new rows take over");
assert.strictEqual(b[5].t.delay, 150); assert.strictEqual(b[5].currentTime, 100, "at the same moment");
// once it's over, the same rows repainted don't move
l.wait(1000); assert.strictEqual(l.paint(300).length, 0, "a saved plan or a late reply replays nothing");

// Load more: only the new rows, from the top of the stagger
l = rowList(); l.paint(24); l.wait(1000);
l.root.rows = l.root.rows.concat([24, 25].map((i) => Object.assign({}, l.root.rows[0], { getAttribute: () => "e" + i }))); l.played.length = 0; l.g.rowsPainted(l.root);
assert.strictEqual(l.played.length, 2); assert.strictEqual(l.played[0].t.delay, 0); assert.strictEqual(l.played[1].t.delay, 30);

// a list in a hidden view is remembered, not played; opening the view plays it, and coming back doesn't (show's `still`)
l = rowList(); l.hide(true);
assert.strictEqual(l.paint(5).length, 0, "nothing plays out of sight");
l.hide(false); l.played.length = 0; l.g.rowsShown(l.root);
assert.strictEqual(l.played.length, 5, "the view opens and its rows come in");
assert.ok(/function show\(name, focusId, still\)/.test(util) && /if \(!still\) lists\.forEach/.test(util), "show can leave the rows alone");
assert.ok(/show\(from, null, true\);\s*window\.scrollTo\(0, EV\.y\)/.test(read("js/catalog.js")), "going back to a list doesn't replay it");

// before the tile becomes the poster, what's still arriving lands
l = rowList(); a = l.paint(3); l.g.rowsSettle();
assert.ok(a.every((x) => x.finished === 1), "the view transition photographs rows at rest");
assert.ok(/rowsSettle\(\); name\(true\)/.test(read("js/catalog.js")));

// reduced motion: rows appear at once
l = rowList({ calm: true });
assert.strictEqual(l.paint(5).length, 0, "reduced motion: nothing plays");

// the four lists, and the water
const html = read("index.html");
["home-list", "grid", "planner-week", "myplans-grid", "crew-list"].forEach((id) => {
  assert.ok(new RegExp('id="' + id + '"[^>]*data-rows').test(html), id + " is a list whose rows arrive");
});
["catalog.js", "account.js", "crews.js"].forEach((f) => assert.ok(/rowsPainted\(/.test(read("js/" + f)), f + " tells it when it paints"));
assert.ok(/--stagger: 30ms;/.test(css), "the token");
assert.ok(!/\.tile[^{]*\{[^}]*animation/.test(css), "row tiles' water stays still");
}

// ---------- the success pulse (CC-231) ----------
{
const util = read("js/util.js"), css = read("css/site.css");
const pulsing = (opt) => {
  const played = [], shadow = (opt && opt.shadow) || "none";
  const g = { window: { matchMedia: () => ({ matches: !!(opt && opt.calm) }) }, document: { documentElement: {} }, Object, parseFloat,
    getComputedStyle: (el) => ({ boxShadow: shadow, getPropertyValue: (k) => ({ "--dur-pulse": "500ms", "--ease-out": "ease-out", "--stripe": "#9CD3EF" })[k] }) };
  vm.createContext(g);
  vm.runInContext(["var MOTION_CALM = window.matchMedia('');", util.match(/function motionOn.*\n/)[0], helper(util, "motionTiming"), helper(util, "pulse")].join("\n"), g);
  return { g, played, el: { animate: (frames, timing) => { played.push({ frames, timing }); } } };
};
let p = pulsing();
p.g.pulse(p.el);
assert.strictEqual(p.played.length, 1, "it runs once");
assert.strictEqual(p.played[0].timing.duration, 500);
assert.strictEqual(p.played[0].timing.easing, "ease-out");
assert.ok(!("fill" in p.played[0].timing) && !("iterations" in p.played[0].timing), "once, and it leaves nothing behind");
assert.ok(/#9CD3EF/.test(p.played[0].frames.boxShadow[0]) && /transparent$/.test(p.played[0].frames.boxShadow[1]), "a stripe ring that fades out");
p = pulsing({ shadow: "inset 0 0 0 1.5px red" });
p.g.pulse(p.el);
assert.ok(p.played[0].frames.boxShadow.every((f) => f.endsWith(", inset 0 0 0 1.5px red")), "a ghost button keeps its outline");
p = pulsing({ calm: true });
p.g.pulse(p.el);
assert.strictEqual(p.played.length, 0, "reduced motion: no pulse");
pulsing().g.pulse(null); // the button may have gone in a repaint

assert.ok(/--dur-pulse: 500ms;/.test(css), "the token");
// where it goes: each one beside the words that say it worked
[["catalog.js", /msg\.textContent = "Link copied\."; pulse\(t\); \}, fallback/], ["planner.js", /msg\.textContent = "Link copied\."; pulse\(t\); \}, fallback/],
  ["account.js", /msg\.textContent = "Link copied\."; pulse\(\$\("invite-copy"\)\); \}, fallback/], ["crews.js", /said\.textContent = "Link copied\."; pulse\(b\); \}, fallback/],
  ["crews.js", /said\.textContent = "Shared\."; pulse\(b\); \}/], ["crews.js", /"Saved " \+ name \+ "\."; pulse\(\$\("crew-h-" \+ id\)\)/],
  ["crews.js", /res\.body\.message;\n\s*pulse\(document\.querySelector\('\[data-crew-email/], ["crews.js", /redrawCards\(id, card, "\[data-crewshare-toggle\]"\); \}\)\n\s*\.then\(function \(\) \{ Array[^\n]*pulse\(b\)/],
  ["account.js", /"Saved\.";\n\s*pulse\(btn\);/], ["account.js", /msg\.textContent = "Saved\."; pulse\(btn\);/], ["account.js", /other devices\."; pulse\(btn\);/],
  ["account.js", /expires in an hour\."; pulse\(btn\);/], ["account.js", /resendCooldown\(\); pulse\(\$\("account-notice"\)\);/], ["account.js", /junk folder too\."; pulse\(box\); \}/],
  ["photos.js", /"\[data-photo\]"\)\.then\(function \(\) \{[^\n]*\n[^\n]*pulse\(b\)/], ["issues.js", /pulse\(\$\("is-thanks"\)\)/], ["submit.js", /pulse\(\$\("sd-title"\)\)/],
  ["admin.js", /"Added " \+ venueLabel\(res\.body\) \+ "\."; pulse\(\$\("vn-go"\)\)/], ["sourcegrid.js", /SG_SAID = "Saved\."; loadSources\("#sg-save"\)\.then\(function \(\) \{ pulse\(\$\("sg-save"\)\)/],
].forEach(([f, re]) => assert.ok(re.test(read("js/" + f)), f + " pulses: " + re));
// a failure never does, and the moments stay their own
["account.js", "admin.js", "catalog.js", "crews.js", "issues.js", "photos.js", "planner.js", "sourcegrid.js", "submit.js"].forEach((f) => {
  read("js/" + f).split("\n").forEach((line) => assert.ok(!/pulse\(/.test(line) || !/errorText|checkThis/.test(line.slice(0, line.indexOf("pulse("))) || /res\.ok\) \{ box/.test(line), f + " pulses beside a failure: " + line));
});
assert.ok(!/pulse\(/.test(read("js/catalog.js").match(/function evMotionCarry[\s\S]*?\n}\n/)[0]), "the Going leap is left alone");
}

console.log("motion: ok");
})().catch((e) => { console.error(e); process.exit(1); });
