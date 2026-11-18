// Checks run in CI before the site deploys (CC-297): crew date polls in public/js/polls.js. The showtime grid
// (aria-pressed cells, one per option), the results ("3 of 5 have answered", best with first names, Lock in only for the starter),
// the locked and closed states, the poll on the crew's page and under Waiting for you, and unique ids.
//
//     node scripts/test_polls.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const JS = path.join(__dirname, "..", "public", "js");
const read = (f) => fs.readFileSync(path.join(JS, f), "utf8");
function stub() {
  return new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => "" : stub()), set: () => true, apply: () => stub() });
}
const g = {
  window: { devicePixelRatio: 1, matchMedia: () => stub(), addEventListener: () => {} },
  matchMedia: () => stub(), document: stub(), localStorage: stub(), location: stub(), history: stub(), navigator: stub(), Intl, URL, console,
};
vm.createContext(g);
vm.runInContext("var AUTH = { user: { id: 'u-ana' } }, MYPLANS = {}; function $(id) { return document; }", g);
for (const f of ["util.js", "water.js", "listings.js", "outing.js", "crews.js", "polls.js"]) vm.runInContext(read(f), g);
const run = (code) => vm.runInContext(code, g);

const d = (n) => g.isoDate(g.add(g.T, n));
const option = (id, n, time, names, yours) => ({ id, date: d(n), time, count: names.length, names, yours: !!yours });
function poll(over) {
  const options = [option(1, 2, "19:30", ["Ana", "Ben"], true), option(2, 3, "14:00", ["Ben"]), option(3, 3, "19:30", [])];
  return Object.assign({
    id: 7, crew_id: 4, crew_name: "Thursday Theater", event_id: 9, event_title: "Hamlet", status: "open", window_from: d(1), window_to: d(9),
    started_by: "Ana", can_manage: true, members_total: 5, answered_count: 3, you_answered: true, options,
    best: [{ option_id: 1, date: d(2), time: "19:30", count: 2, names: ["Ana", "Ben"], everyone: false }], locked: null, created_at: "2026-11-18T00:00:00Z", closed_at: null,
  }, over);
}

// An open poll: the count, the best time with names, one pressed/unpressed cell for each option, "None of these work"
let html = run("pollCardHTML(" + JSON.stringify(poll()) + ", 'event')");
assert(html.includes("3 of 5 have answered"), "the answered count");
assert(html.includes("Ana, Ben") && html.includes("poll-tag"), "best time with first names");
assert.strictEqual((html.match(/data-poll-act="tick"/g) || []).length, 3, "a cell for each option");
assert.strictEqual((html.match(/aria-pressed="true"/g) || []).length, 1, "only your tick is pressed");
assert(html.includes("None of these work"), "the none button");
assert(html.includes('data-poll-act="lock"') && html.includes("Cancel poll"), "the starter can lock in and cancel");
assert(!html.includes("@"), "no email");
// Someone who isn't the starter can't manage
html = run("pollCardHTML(" + JSON.stringify(poll({ can_manage: false })) + ", 'crew')");
assert(!html.includes("data-poll-act=\"lock") && !html.includes("Cancel poll"), "only the starter manages");
// "None of these work" is pressed once answered with nothing ticked
const none = poll({ options: poll().options.map((o) => Object.assign({}, o, { yours: false })) });
assert(run("pollCardHTML(" + JSON.stringify(none) + ", 'crew')").includes('data-poll-act="none" data-poll="7" aria-pressed="true"'));
// Everyone can make it
html = run("pollCardHTML(" + JSON.stringify(poll({ best: [{ option_id: 1, date: d(2), time: "19:30", count: 5, names: ["Ana", "Ben", "Cy", "Dee", "Eli"], everyone: true }] })) + ", 'crew')");
assert(html.includes("all 5 of you"));
// Locked: the line, and Commit to for a member who said yes (once, not when already going)
const locked = poll({ status: "locked", locked: option(1, 2, "19:30", ["Ana", "Ben"], true) });
html = run("pollCardHTML(" + JSON.stringify(locked) + ", 'event')");
assert(html.includes("Locked in:") && html.includes('data-poll-act="commit"') && !html.includes("data-poll-act=\"tick\""));
assert(!run("pollCardHTML(" + JSON.stringify(poll({ status: "locked", locked: option(1, 2, "19:30", ["Ben"], false) })) + ", 'event')").includes("data-poll-act=\"commit\""), "no Commit to unless you said yes");
run("MYPLANS[9] = { status: 'going', date: '" + d(2) + "', time: '19:30', crews: [4] }");
assert(run("pollCardHTML(" + JSON.stringify(locked) + ", 'event')").includes("You’re going on this date"));
run("MYPLANS = {}");
assert(run("pollCardHTML(" + JSON.stringify(poll({ status: "cancelled" })) + ", 'event')").includes("Cancelled"));
assert(run("pollCardHTML(" + JSON.stringify(poll({ status: "ended" })) + ", 'event')").includes("has passed"));

// Waiting for you: only open polls you haven't answered; and on the crew's page
run("POLLS = " + JSON.stringify([poll({ you_answered: false }), poll({ id: 8, you_answered: true }), poll({ id: 9, status: "locked", you_answered: false, locked: option(1, 2, "19:30", ["Ana"]) })]));
const waiting = run("pollsWaitingHTML()");
assert.strictEqual((waiting.match(/data-poll-waiting/g) || []).length, 1, "one poll waits for you");
assert(waiting.includes("Hamlet") && waiting.includes('href="#e/9"'));
assert(run("pollsCrewHTML({ id: 4 })").includes("Date polls") && run("pollsCrewHTML({ id: 99 })") === "", "a crew's polls, and nothing for another");
run("AUTH.user = null");
assert.strictEqual(run("pollsWaitingHTML()"), "", "nothing signed out");
run("AUTH.user = { id: 'u-ana' }");

// Window and options come from the event's schedule: one per showtime, none on days it isn't on
const ev = run("toEvent(" + JSON.stringify({ id: 9, title: "Hamlet", category: "Theater", begin_date: d(1), end_date: d(20), venue: { id: 1, name: "V", neighborhood: "N", area: "city", region: "north" },
  performances: [], schedule: { dates: [{ date: d(2), time: "19:30" }, { date: d(3), time: "14:00" }, { date: d(3), time: "19:30" }], weekly: {}, weeks: {}, weekly_from: "", hours: {} } }) + ")");
g.__ev = ev;
const opts = run("pollOptions(__ev, '" + d(1) + "', '" + d(9) + "')");
assert.deepStrictEqual(JSON.parse(JSON.stringify(opts)), [{ date: d(2), time: "19:30" }, { date: d(3), time: "14:00" }, { date: d(3), time: "19:30" }]);
assert.deepStrictEqual(JSON.parse(JSON.stringify(run("pollWindow(__ev)"))), [d(2), d(3)], "the next show to the last");
console.log("ok: test_polls");
