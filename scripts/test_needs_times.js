// Checks run in CI before the site deploys (CC-311): Review lists the live events that still have no start time for
// any upcoming show ("Needs show times"), with a count and an Edit button on each row (the existing edit form, where
// the Show Run is added). The list comes from the admin API's needs_show_times filter, and hides when it is empty.
//
//     node scripts/test_needs_times.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const PUB = path.join(__dirname, "..", "public");
const read = (f) => fs.readFileSync(path.join(PUB, f), "utf8");
const html = read("index.html"), admin = read("js/admin.js");
const has = (s, part, msg) => assert.ok(s.includes(part), msg || "has " + part);

// --- the page: a section that starts hidden, with a count and a list ---
const section = html.slice(html.indexOf('id="needstimes"'), html.indexOf('id="withdrawn-title"'));
has(section, 'id="needstimes" hidden>'); has(section, 'id="needstimes-n"'); has(section, 'id="needstimes-list"');
has(admin.slice(admin.indexOf("function renderReview()"), admin.indexOf("// CC-133: what removing")), "renderNeedsTimes();", "Review loads it");

const ELS = {}, CALLS = [];
const $ = (id) => ELS[id] || (ELS[id] = { id, textContent: "", innerHTML: "", hidden: true });
let BODY = { items: [], total: 0 };
const g = {
  $, Promise, console, CALLS,
  esc: (s) => String(s),
  api(p) { CALLS.push(p); return Promise.resolve({ ok: true, status: 200, body: BODY }); },
  readJSON: (r) => Promise.resolve(r),
  toEvent: (raw) => ({ id: raw.id, title: raw.title }),
  queueItemHTML: (e, actions) => "<item " + e.id + ">" + actions + "</item>",
  editButtonHTML: (e) => "<edit " + e.id + ">",
  refocusAfterEdit() {},
};
vm.createContext(g);
vm.runInContext(admin.slice(admin.indexOf("// CC-311:"), admin.indexOf("function renderScheduled()")), g);
const flush = () => new Promise((r) => setTimeout(r, 0));

(async () => {
  BODY = { items: [{ id: 4, title: "Hamlet" }, { id: 9, title: "Cats" }], total: 2 };
  g.renderNeedsTimes(); await flush();
  assert.deepStrictEqual(CALLS, ["/admin/events?needs_show_times=true&limit=500"]);
  assert.strictEqual($("needstimes").hidden, false, "shown when there are some");
  assert.strictEqual($("needstimes-n").textContent, "2", "the count");
  assert.strictEqual($("needstimes-list").innerHTML, "<item 4><edit 4></item><item 9><edit 9></item>", "each row opens the edit form");

  BODY = { items: [{ id: 4, title: "Hamlet" }], total: 600 };
  g.renderNeedsTimes(); await flush();
  assert.strictEqual($("needstimes-n").textContent, "600", "the count is the total, not the page");
  has($("needstimes-list").innerHTML, "Showing the first 1 of 600.");

  BODY = { items: [], total: 0 };
  g.renderNeedsTimes(); await flush();
  assert.strictEqual($("needstimes").hidden, true, "hidden when nothing needs times");
  assert.strictEqual($("needstimes-n").textContent, "");
  console.log("ok: test_needs_times.js");
})().catch((e) => { console.error(e); process.exit(1); });
