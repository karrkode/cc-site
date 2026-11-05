// Checks run in CI before the site deploys (CC-221): the Event sources grid in public/js/sourcegrid.js: the order of the
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
const g = { window: { addEventListener() {} }, $: el, esc: (s) => String(s), SOURCES: null, SRC_ASK: null };
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
Object.keys(g.SG_STATES).forEach((s) => assert.ok(css.includes(".sg-" + s + " {"), "a colour for " + s));

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
