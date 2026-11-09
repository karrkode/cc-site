// Checks run in CI before the site deploys (CC-244): the Site health page in public/js/health.js: the pie of non-200
// responses, its words for each status, and that the page is wired in (Engagement, the #health address, the script).
//
//     node scripts/test_health.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const PUB = path.join(__dirname, "..", "public");
const read = (f) => fs.readFileSync(path.join(PUB, f), "utf8");
const html = read("index.html");
const g = { document: { addEventListener() {} }, Intl, Math, Date, Number, esc: (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;") };
vm.createContext(g);
vm.runInContext(read("js/health.js"), g);

// --- the slices: most first, and past five the rest are Other ---
const rows = [404, 401, 503, 422, 201, 429, 500].map((status, i) => ({ status, count: 70 - i * 10 }));
const p = g.pieSlices(rows);
assert.strictEqual(p.total, 70 + 60 + 50 + 40 + 30 + 20 + 10);
assert.strictEqual(p.slices.length, 6);
assert.strictEqual(p.slices[0].label, "404 Not found");
assert.strictEqual(p.slices[5].label, "Other");
assert.strictEqual(p.slices[5].count, 30, "429 and 500 share Other");
assert.ok(Math.abs(p.slices.reduce((n, s) => n + s.pct, 0) - 100) < 1e-9);
assert.strictEqual(g.statusWords(418), "Client error");
assert.strictEqual(g.statusWords(599), "Server error");

// --- the drawing ---
const pie = g.pieHTML(p, 24);
assert.ok(/role="img" aria-label="Pie chart of 280 responses other than 200 in the last 24 hours: 404 Not found, 70;/.test(pie), "the pie has a text alternative");
assert.strictEqual((pie.match(/class="slice /g) || []).length, 6);
const one = g.pieHTML(g.pieSlices([{ status: 401, count: 3 }]), 1);
assert.ok(/<circle class="slice s1"/.test(one), "one status is a whole circle, not an arc that meets itself");
assert.ok(/Every response in the last hour was a 200/.test(g.pieHTML(g.pieSlices([]), 1)));
assert.ok(/A86 86 0 1 1 /.test(g.pieHTML(g.pieSlices([{ status: 404, count: 3 }, { status: 401, count: 1 }]), 24)), "a slice over half takes the long way round");

// --- the numbers ---
assert.strictEqual(g.hlMs(null), "–");
assert.strictEqual(g.hlMs(42.4), "42 ms");
assert.strictEqual(g.hlMs(0.3), "<1 ms", "a database check on the same host");
assert.strictEqual(g.hlMs(1530), "1.5 s");
assert.strictEqual(g.hlSince("2026-11-01T00:00:00Z", "2026-11-04T01:00:00Z"), "3 days");
assert.strictEqual(g.hlSince("2026-11-04T00:00:00Z", "2026-11-04T05:10:00Z"), "5 hours");
assert.strictEqual(g.hlSince("2026-11-04T00:00:00Z", "2026-11-04T00:01:00Z"), "1 minute");

// --- wired in ---
assert.ok(/data-go="health"/.test(html.slice(html.indexOf('id="view-engagement"'), html.indexOf('id="view-people"'))), "Engagement links to it");
assert.ok(/id="view-health"/.test(html) && /<script src="js\/health\.js\?v=dev"><\/script>\s*<script src="js\/start\.js/.test(html), "the view and its script, before start.js");
assert.ok(/h === "health"/.test(read("js/start.js")) && /go === "health"\) openHealth\(\)/.test(read("js/util.js")), "#health opens it");
assert.ok(/data-hl-hours="24" aria-pressed="true"/.test(html), "24 hours is the start");
console.log("test_health.js: ok");
