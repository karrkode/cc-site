// Checks run in CI before the site deploys (CC-212): Found events in public/js/found.js. Each event waiting to be
// added has one "Edit/Approve" button, whatever it's missing; one on for under a week opens the form as a fixed run of
// its days, each with a time, and a longer one as a date range, as before.
//
//     node scripts/test_found.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const JS = path.join(__dirname, "..", "public", "js");
const read = (f) => fs.readFileSync(path.join(JS, f), "utf8");

// Any element the scripts touch at load: every property is a no-op function or another stub
function stub() {
  return new Proxy(function () {}, {
    get: (t, k) => (k === Symbol.toPrimitive ? () => "" : stub()),
    set: () => true,
    apply: () => stub(),
  });
}
const g = {
  window: { devicePixelRatio: 1, matchMedia: () => stub(), addEventListener: () => {} },
  matchMedia: () => stub(),
  document: stub(), localStorage: stub(), location: stub(), history: stub(), navigator: stub(),
  Intl, console,
};
vm.createContext(g);
vm.runInContext("var AUTH = { user: null }, MYPLANS = {}, API = ''; function $(id) { return document; }", g);
["util.js", "planner.js", "found.js"].forEach((f) => vm.runInContext(read(f), g));

const iso = (n) => g.isoDate(g.add(g.T, n));
function item(over) {
  return Object.assign({ id: 1, title: "Opening Night", status: "new", needs: "", venue_id: 3, venue_category: "Visual Art",
    begin_date: iso(10), end_date: iso(10), weekly: {}, venue_show_times: {}, short_dates: [] }, over);
}
const same = (a, b, msg) => assert.strictEqual(JSON.stringify(a), JSON.stringify(b), msg); // the vm's own arrays
const buttons = (i) => g.foundActions(i, String(i.id), i.title).match(/data-found-act="[a-z]+"/g).map((s) => s.slice(16, -1));

// --- one Edit/Approve button, whatever the item is missing ---
[{}, { needs: "date" }, { needs: "show_days" }, { venue_id: null }, { venue_category: null, category: null }, { status: "skipped" }].forEach((over) => {
  const i = item(over), html = g.foundActions(i, "1", i.title);
  same(buttons(i), ["edit", "reject", "skip"], JSON.stringify(over));
  assert.ok(html.includes('aria-label="Edit and approve Opening Night">Edit/Approve</button>'), "named for the event");
  assert.ok(!/>Approve<|Edit then approve|Add the date|Add show days/.test(html), "the old buttons are gone");
});
same(buttons(item({ status: "rejected" })), ["edit"]);
same(buttons(item({ status: "update" })), ["accept", "dismiss"]); // updates are unchanged

// --- under a week: a fixed run of its days, each with a time ---
same(g.shortRun(item()), [{ date: iso(10), time: "", end_time: "" }], "one day, no time yet");
same(g.shortRun(item({ short_dates: [{ date: iso(10), time: "18:00" }] })), [{ date: iso(10), time: "18:00", end_time: "" }],
  "the time its page gave");
let run = g.shortRun(item({ end_date: iso(15) }));
same(run.map((r) => r.date), [10, 11, 12, 13, 14, 15].map(iso), "six days: every one");
run = g.shortRun(item({ end_date: iso(12), short_dates: [{ date: iso(10), time: "19:30" }, { date: iso(12), time: "14:00" }, { date: iso(30), time: "20:00" }] }));
same(run.map((r) => [r.date, r.time]), [[iso(10), "19:30"], [iso(12), "14:00"]], "only the listed dates in the run");
const dow = (n) => g.DOW[g.add(g.T, n).getDay()];
run = g.shortRun(item({ end_date: iso(14), weekly: { [dow(11)]: ["20:00"], [dow(13)]: ["15:00", "20:00"] } }));
same(run.map((r) => [r.date, r.time]), [[iso(11), "20:00"], [iso(13), "15:00"]], "its show days, the first time each");
run = g.shortRun(item({ end_date: iso(11), venue_show_times: { [dow(10)]: ["19:30"] } }));
same(run.map((r) => r.time), ["19:30", ""], "else the venue's usual times");

// --- a week or more, or no closing date: a date range, as before ---
same(g.shortRun(item({ end_date: iso(16) })), [], "seven days");
same(g.shortRun(item({ end_date: null })), [], "no closing date");
same(g.shortRun(item({ begin_date: null, end_date: null })), [], "no dates");

console.log("found: ok");
