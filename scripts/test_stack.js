// Checks run in CI before the site deploys (CC-238): the home stack in public/js/leadstack.js. Its places on the screen,
// its order and loop, reduced motion, the once-a-session fan-out, and the markup screen readers get.
//
//     node scripts/test_stack.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const PUB = path.join(__dirname, "..", "public");
const js = fs.readFileSync(path.join(PUB, "js", "leadstack.js"), "utf8");
const css = fs.readFileSync(path.join(PUB, "css", "site.css"), "utf8");

// Just enough of a page: the slot records its listeners so the tests can fire them
function page(opts) {
  opts = opts || {};
  const on = {}, store = {};
  const el = (extra) => Object.assign({ style: { setProperty() {} }, classList: { add() {}, remove() {}, toggle() {} }, textContent: "", offsetWidth: 300 }, extra);
  const card = (i) => {
    const link = { tabIndex: -1, tagName: "A", focus() {} };
    const c = el({ style: { setProperty(k, v) { c.veil = v; } }, classList: { toggle(k, v) { if (k === "is-front") c.front = v; } }, querySelector: () => link, link, i });
    return c;
  };
  const cards = Array.from({ length: opts.n === undefined ? 5 : opts.n }, (_, i) => card(i));
  const slot = el({ offsetParent: opts.hidden ? null : {}, contains: () => false, setPointerCapture() {}, addEventListener(t, f) { on[t] = f; } });
  const ids = { "lead-slot": slot, stack: el(), "stack-count": el(), "stack-live": el() };
  const g = {
    window: { matchMedia: () => ({ matches: !!opts.phone }) },
    document: { activeElement: null, querySelectorAll: () => cards },
    sessionStorage: { getItem: (k) => store[k] || null, setItem: (k, v) => { store[k] = v; } },
    $: (id) => ids[id], motionOK: () => !opts.reduced, leadHTML: (e) => "<a>" + e.title + "</a>",
    setTimeout: (f) => f(), Promise, console,
  };
  vm.createContext(g);
  vm.runInContext(js, g);
  return { g, on, cards, ids, store };
}
const events = (n) => Array.from({ length: n }, (_, i) => ({ id: i + 1, title: "Event " + (i + 1) }));
const started = (o) => { const p = page(o); p.g.stackStart(events(p.cards.length)); return p; };
const front = (p) => p.cards.filter((c) => c.front).map((c) => c.i);
const tick = () => new Promise((r) => setImmediate(r));

(async () => {
  // --- its places ---
  {
    const { g } = page();
    assert.strictEqual(g.stackPose(0).ry, 0, "the front card faces you");
    const one = g.stackPose(1), two = g.stackPose(2), three = g.stackPose(3);
    assert.ok(one.ry > 0 && two.ry > 0 && one.x < two.x, "the next two turn away and recede to the right");
    assert.ok(one.o === 1 && two.o === 1 && three.o === 0, "only three show");
    assert.ok(one.veil > 0 && two.veil > one.veil, "a veil, stronger further back");
    assert.ok(g.stackPose(1, true).x > one.x, "a hovered back card nudges out");
    const { g: ph } = page({ phone: true });
    assert.ok(ph.stackPose(2).x < two.x, "on a phone they sit closer, so both strips fit the width");
  }
  // --- order, loop, and the front card's sharp text ---
  {
    const p = started({ reduced: true });
    assert.deepStrictEqual(front(p), [0]);
    assert.strictEqual(p.cards[0].style.transform, "none", "at rest the front has no transform, so its text stays sharp (CC-235)");
    assert.strictEqual(p.cards[0].link.tabIndex, 0); assert.strictEqual(p.cards[1].link.tabIndex, -1, "only the front card takes the keyboard");
    assert.strictEqual(p.ids["stack-count"].textContent, "1 of 5");
    assert.strictEqual(p.ids["stack-live"].textContent, "", "nothing is announced until it changes");
    await p.g.stackStep(1);
    assert.deepStrictEqual(front(p), [1]);
    assert.strictEqual(p.ids["stack-live"].textContent, "2 of 5: Event 2", "the new event and its place are announced");
    await p.g.stackStep(-1); await p.g.stackStep(-1);
    assert.deepStrictEqual(front(p), [4], "before the first comes the last");
    await p.g.stackStep(1);
    assert.deepStrictEqual(front(p), [0], "after the last comes the first");
    await p.g.stackGoTo(2);
    assert.deepStrictEqual(front(p), [2], "a click on the third card brings it to the front");
  }
  // --- with motion: it moves, then lands; a redraw keeps the same event in front ---
  {
    const p = started();
    await p.g.stackStep(1); await tick();
    assert.deepStrictEqual(front(p), [1]);
    p.g.stackStart(events(5));
    assert.deepStrictEqual(front(p), [1], "signing in redraws the cards; the same event stays in front");
    p.g.stackStart(events(5).slice(2));
    assert.strictEqual(p.g.STACK.cur, 0, "if that event has gone, back to the first");
  }
  // --- the fan-out: once a browser session, never with reduced motion, and not when the home page isn't showing ---
  {
    const p = started();
    assert.strictEqual(p.store.cc_fan, "1", "the first time, it plays");
    const again = page(); again.store.cc_fan = "1"; again.g.stackStart(events(5));
    assert.notStrictEqual(again.cards[1].style.transform, "none", "already played this session: straight to rest");
    assert.strictEqual(started({ reduced: true }).store.cc_fan, undefined, "reduced motion: no fan-out");
    assert.strictEqual(started({ hidden: true }).store.cc_fan, undefined, "off screen: it waits");
  }
  // --- swipes and clicks ---
  {
    const p = started({ reduced: true }), on = p.on;
    const target = { closest: (s) => (s === "#stack-cards" ? {} : null) };
    const pt = (x, y, at) => ({ pointerId: 1, pointerType: "touch", clientX: x, clientY: y, timeStamp: at, target, type: "pointerup" });
    on.pointerdown(pt(200, 100, 0)); on.pointermove(pt(100, 102, 300)); on.pointerup(pt(100, 102, 300));
    await tick();
    assert.deepStrictEqual(front(p), [1], "a swipe left is the next event");
    let stopped = 0;
    on.click({ target, preventDefault() {}, stopPropagation() { stopped += 1; } });
    assert.strictEqual(stopped, 1, "the click a swipe leaves behind doesn't open the event");
    on.pointerdown(pt(100, 100, 0)); on.pointermove(pt(200, 101, 300)); on.pointerup(pt(200, 101, 300));
    await tick();
    assert.deepStrictEqual(front(p), [0], "a swipe right is the one before");
    on.pointerdown(pt(100, 100, 0)); on.pointermove(pt(102, 160, 300)); on.pointerup(pt(102, 160, 300));
    await tick();
    assert.deepStrictEqual(front(p), [0], "up and down stay with the page");
    on.pointerdown(pt(100, 100, 0)); on.pointermove(pt(120, 100, 600)); on.pointerup(pt(120, 100, 600));
    await tick();
    assert.deepStrictEqual(front(p), [0], "a short slow drag springs back");
    let done = 0;
    on.keydown({ key: "ArrowRight", preventDefault() { done += 1; } });
    await tick();
    assert.ok(done === 1 && front(p)[0] === 1, "the → key moves it on");
    on.keydown({ key: "Enter", preventDefault() { done += 1; } });
    assert.strictEqual(done, 1, "other keys are left alone");
  }
  // --- the markup ---
  {
    const { g } = page();
    const html = g.stackHTML(events(3));
    assert.ok(/<ol class="stack-cards"[^>]*role="list">/.test(html), "an ordered list for screen readers");
    assert.strictEqual((html.match(/<li class="sc"/g) || []).length, 3);
    assert.ok(/aria-live="polite"/.test(html) && /aria-label="Next event"/.test(html) && /aria-label="Previous event"/.test(html));
  }
  // --- the rules in site.css ---
  assert.ok(/@media \(max-width: 700px\), \(pointer: coarse\) \{\s*\.stack-nav \[data-stack-go\] \{ display: none; \}/.test(css), "arrows on desktop only");
  assert.ok(/\.stack-cards \{[^}]*touch-action: pan-y/.test(css), "the page still scrolls over the stack");
  assert.ok(!/\.sc[^{]*\{[^}]*will-change/.test(css), "no will-change on the cards: it softens the text (CC-235)");
  assert.ok(/--veil: \.18/.test(css) && /--veil: \.11/.test(css), "the veil has a value in each theme");
  console.log("ok: home stack");
})().catch((e) => { console.error(e); process.exit(1); });
