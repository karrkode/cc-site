// Checks run in CI before the site deploys (CC-207): the Event Sourcing page in public/js/sourcing.js: the budget dial
// follows the budget guard, the graph keeps to its box, and the page's layout is what the story asked for.
//
//     node scripts/test_sourcing.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const PUB = path.join(__dirname, "..", "public");
const read = (f) => fs.readFileSync(path.join(PUB, f), "utf8");
const html = read("index.html");
const el = () => ({ addEventListener() {}, innerHTML: "", textContent: "", hidden: false });
const g = { window: { addEventListener() {} }, document: { addEventListener() {} }, Intl, Math, Date, $: el, esc: (s) => String(s), plural: (n, a, b) => n + " " + (n === 1 ? a : b) };
vm.createContext(g);
vm.runInContext(read("js/sourcing.js"), g);

// --- the dial: the zone is the guard's, and the needle stops at the end ---
const at = (share, state) => g.gaugeAt(share * 10, 10, state);
assert.strictEqual(at(0.79, "ok").zone, "ok");
assert.strictEqual(at(0.79, "ok").pct, 79);
assert.strictEqual(at(0.8, "saving").zone, "saving");
assert.ok(at(0.79, "ok").at < g.GAUGE_SAVE * g.GAUGE_LIMIT, "79% is short of the amber");
assert.ok(Math.abs(at(0.8, "saving").at - g.GAUGE_SAVE * g.GAUGE_LIMIT) < 1e-9, "80% is where the amber starts");
assert.ok(at(0.999, "saving").at < g.GAUGE_LIMIT, "just under the limit stays in the amber");
assert.strictEqual(at(0.999, "saving").pct, 99, "never rounds up to the limit");
assert.strictEqual(at(1, "paused").at, 1, "the limit is the end of the dial");
assert.strictEqual(at(2.5, "paused").at, 1, "past the limit, the needle stays at the end");
assert.strictEqual(at(2.5, "paused").pct, 250);
assert.strictEqual(g.gaugeAt(0, 10, "ok").at, 0);
const dial = g.gaugeHTML(at(0.85, "saving"), 10, "A label");
assert.ok(/role="img" aria-label="A label"/.test(dial), "the dial has a text alternative");
assert.ok(/class="zone warn on"/.test(dial) && !/class="zone ok on"/.test(dial), "only the zone it's in is marked");
assert.strictEqual(g.wholeMoney(10), "$10");
assert.strictEqual(g.wholeMoney(12.5), "$12.50");

// --- the graph ---
[[0, 1], [1, 1], [2, 2], [3, 5], [7, 10], [11, 20], [63, 100], [100, 100]].forEach(([max, top]) => assert.strictEqual(g.niceTop(max), top, "the axis above " + max));
const weeks = [3, 0, 12].map((n, i) => ({ first: "2026-10-1" + i, last: "2026-10-1" + (i + 1), n }));
const { points, top } = g.graphPoints(weeks, 600);
assert.strictEqual(top, 20);
assert.strictEqual(points[0].x, g.GRAPH_PAD.left);
assert.strictEqual(points[2].x, 600 - g.GRAPH_PAD.right);
points.forEach((p) => assert.ok(p.y >= g.GRAPH_PAD.top && p.y <= g.GRAPH_H - g.GRAPH_PAD.bottom, "a point stays in the box"));
assert.ok(points[1].y === g.GRAPH_H - g.GRAPH_PAD.bottom, "zero sits on the baseline");
assert.ok(/3 weeks: from 0 to 12 a week, and 12 in the latest week/.test(g.graphLabel(weeks)), "the graph has a text alternative");

// --- the page ---
const view = html.slice(html.indexOf('id="view-sourcing"'), html.indexOf('id="view-engagement"'));
const order = ["needs-section", "budget-gauge", "found-graph", "src-list", "hub-tools"].map((s) => view.indexOf(s));
assert.ok(order.every((n, i) => n >= 0 && (!i || n > order[i - 1])), "the page runs Needs you, Budget, graph, Found events, the tools");
assert.ok(/id="needs-section" hidden/.test(view), "Needs you starts hidden, heading included");
["This week", "week-figures", "left out", "Checks run"].forEach((s) => assert.ok(!view.includes(s), "gone from the page: " + s));
["Found events", "Event sources", "Skip rules", "Check by hand only", "Withdrawn"].forEach((t) => assert.ok(view.includes(">" + t + "</button>"), "a tool: " + t));
assert.ok(view.includes("<h2>Tools</h2>"), "the section is called Tools");
assert.ok(view.includes('data-hub="manual">Check by hand only</button>'), "Check by hand only opens on the sources checked by hand");
const js = read("js/sourcing.js");
assert.ok(js.includes('"#sources/manual"'), "so does Needs you's row");

// --- Event sources: the filters ---
const admin = read("js/admin.js");
const f = { SOURCES_HOW: "all", SOURCES_KIND: "all" };
vm.createContext(f);
vm.runInContext(admin.slice(admin.indexOf("var SOURCE_TYPES"), admin.indexOf("$(\"sources-how\").addEventListener")), f);
const list = [{ id: 1, manual: true, kind: "theater" }, { id: 2, manual: false, kind: "theater" }, { id: 3, manual: false, kind: "museum" },
  { id: 4, manual: false, kind: "opera" }, { id: 5, manual: false, kind: "music" }, { id: 6, manual: false, kind: "comedy" }];
const ids = (how, kind) => { f.SOURCES_HOW = how; f.SOURCES_KIND = kind; return f.filteredSources(list).map((s) => s.id).join(); };
assert.strictEqual(ids("all", "all"), "1,2,3,4,5,6");
assert.strictEqual(ids("manual", "all"), "1");
assert.strictEqual(ids("auto", "all"), "2,3,4,5,6");
assert.strictEqual(ids("all", "Theater"), "1,2");
assert.strictEqual(ids("auto", "Theater"), "2");
assert.strictEqual(ids("all", "Music"), "4,5", "an opera source is Music");
assert.strictEqual(ids("all", "Visual Art"), "3");
assert.strictEqual(ids("manual", "Visual Art"), "");
const kinds = html.slice(html.indexOf('id="sources-kind"'), html.indexOf("</select>", html.indexOf('id="sources-kind"')));
assert.deepStrictEqual(kinds.match(/>[^<]+<\/option>/g).map((o) => o.slice(1, -9)), ["All types", "Theater", "Music", "Visual Art"], "only the site's three types");
const firstLine = view.slice(view.indexOf('class="hub-top"'), view.indexOf('id="found-graph"'));
assert.ok(firstLine.includes('id="needs-section"') && firstLine.includes('id="budget-gauge"'), "Needs you and Budget share a line");
assert.ok(!/function needRowHTML[^\n]*\n[^\n]*\n?[^\n]*hub-go/.test(js), "a Needs you row is its text, with no link at the right");
assert.ok(!/Found events? to review/.test(js), "found events moved to the list below");
console.log("Event Sourcing checks pass");
