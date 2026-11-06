// Checks run in CI before the site deploys (CC-221): the Source grid in public/js/sourcegrid.js: the order of the
// blocks, where a panel goes, and the page's colours, options and motion.
//
//     node scripts/test_sources.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const PUB = path.join(__dirname, "..", "public");
const read = (f) => fs.readFileSync(path.join(PUB, f), "utf8");
const html = read("index.html"), css = read("css/site.css");
const el = () => ({ addEventListener() {}, innerHTML: "", textContent: "", hidden: false });
// CC-224: just enough of a block for sgMarks and sgTapsOff
const fakeBlock = (id, on, open) => {
  const c = new Set([].concat(on ? ["on"] : [], open ? ["is-open"] : []));
  return { c, classList: { add: (n) => c.add(n), remove: (n) => c.delete(n), toggle: (n, yes) => { if (yes) c.add(n); else c.delete(n); return yes; } },
    getAttribute: () => String(id), querySelectorAll: () => [] };
};
let fakeBlocks = [], docClick = null;
const grid = Object.assign(el(), { querySelectorAll: (sel) => fakeBlocks.filter((b) => sel === ".sg-block" || (b.c.has("on") && !b.c.has("is-open"))) });
const g = { window: { addEventListener() {} }, document: { addEventListener: (type, fn) => { if (type === "click") docClick = fn; } },
  $: (id) => (id === "sources-list" ? grid : el()), esc: (s) => String(s), SOURCES: null, SRC_ASK: null };
vm.createContext(g);
vm.runInContext(read("js/sourcegrid.js"), g);

// --- largest first, ties A to Z, turned off last ---
const src = (label, events_year, state) => ({ label, events_year, state: state || "ok" });
const order = g.sgSorted([src("Beta", 3), src("Off", 90, "off"), src("Alpha", 3), src("Big", 40, "error")]).map((s) => s.label);
assert.deepStrictEqual(order, ["Big", "Alpha", "Beta", "Off"]);

// --- the panel goes after the whole row, so the block's neighbours stay beside it ---
const row = (top, h) => ({ top, bottom: top + h });
const boxes = [row(0, 270), row(0, 132), row(0, 132), row(138, 132), row(276, 132), row(276, 132)];
assert.strictEqual(g.sgRowEnd(boxes, 1), 2, "the next block on the row is above the panel");
assert.strictEqual(g.sgRowEnd(boxes, 0), 3, "a tall block's row runs to its bottom");
assert.strictEqual(g.sgRowEnd(boxes, 4), 5, "the last row");

// --- a block: the name, its state in words, and three options ---
const block = g.sgBlockHTML({ id: 7, label: "Metro", size: 3, state: "error" });
assert.ok(/sg-size3/.test(block) && /sg-error/.test(block));
assert.ok(/Metro<span class="sr-only">: Can't be read<\/span>/.test(block), "the state doesn't rest on colour alone");
assert.strictEqual((block.match(/data-sg-tab=/g) || []).length, 3);
["events", "health", "settings"].forEach((t) => assert.ok(block.includes('data-sg-tab="' + t + '"')));
Object.keys(g.SG_STATES).forEach((s) => assert.ok(new RegExp("\\.sg-" + s + " \\{ --sg-deep: ").test(css), "a colour and a deeper one for " + s));
assert.ok(/\.sg-block:focus-within:not\(\.sg-quiet\), \.sg-block\.on \{ background: var\(--sg-deep\)/.test(css), "focus or a click deepens the colour");
assert.ok(/@media \(hover: hover\) \{ \.sg-block:hover \{ background: var\(--sg-deep\)/.test(css), "so does hovering, where there is hover");
assert.ok(/\.sg-block:focus-within:not\(\.sg-quiet\) \.sg-opts/.test(css) && !/\.sg-block:focus-within \.sg-opts/.test(css), "CC-224: focus handed back by a click on Close doesn't hold the options up");
const gridJs = read("js/sourcegrid.js");
assert.ok(gridJs.includes('if (ev.target.closest("[data-sg-close]")) { sgClose(true, ev.detail > 0);'), "a click on Close is quiet, Enter or Space isn't");
assert.ok(gridJs.includes('{ sgLoud(); if (ev.key === "Escape" && SG_OPEN) sgClose(true); }'), "Escape isn't, and any key brings the options back");

// --- CC-224: only the open block, and a block just tapped, show their options ---
const shows = () => fakeBlocks.map((b) => b.c.has("on"));
fakeBlocks = [fakeBlock(1, true, true), fakeBlock(2), fakeBlock(3, true)];
g.SG_OPEN = { id: 2, tab: "events" }; g.sgMarks();
assert.deepStrictEqual(shows(), [false, true, false], "moving to another block's panel: the last one goes back to its name");
g.SG_OPEN = null; g.sgMarks();
assert.deepStrictEqual(shows(), [false, false, false], "Close: the block goes back to its name");
fakeBlocks = [fakeBlock(1, true, true), fakeBlock(2, true)];
docClick({ target: { closest: () => null } });
assert.deepStrictEqual(shows(), [true, false], "a tap on blank space clears a tapped block and keeps the open one");
docClick({ target: { closest: () => ({}) } });
fakeBlocks[1].c.add("on"); docClick({ target: { closest: () => ({}) } });
assert.deepStrictEqual(shows(), [true, true], "a tap on a block is the block's own to handle");

// --- the page ---
const view = html.slice(html.indexOf('id="view-sources"'), html.indexOf("<!-- Site stats"));
assert.ok(view.includes('id="sources-how"') && view.includes('id="sources-kind"'), "the filters stay");
assert.ok(!view.includes("sources-sort"), "the Sort menu goes");
assert.ok(/class="sg-grid" id="sources-list"/.test(view));
assert.ok(/prefers-reduced-motion: reduce\) \{ \.sg-panel/.test(css), "panels open at once with reduced motion");
assert.ok(/\.sg-opts \{[^}]*44px/.test(css) && /\.sg-opt \{[^}]*min-height: 44px/.test(css), "44px options");
assert.ok(/--sg-row: 132px/.test(css), "three 44px options fill the smallest block");
assert.ok(/max-width: 520px\) \{ \.sg-size4 \{ grid-column: span 2/.test(css), "no sideways scroll on a phone");
console.log("test_sources: ok");
