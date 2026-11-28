// Checks run in CI before the site deploys (CC-297): crew date polls in public/js/polls.js. The showtime grid
// (aria-pressed cells, one per option), the results ("3 of 5 have answered", best with first names, Lock in only for the crew leader),
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

// An open poll starts closed: one button named for the crew, and nothing else until it's opened
run("POLL_SHOW = {}; POLL_EDIT = {}; POLL_DRAFT = {}");
let html = run("pollCardHTML(" + JSON.stringify(poll()) + ", 'event')");
assert(html.includes("Open poll for this event with “Thursday Theater”") && html.includes('aria-expanded="false"'), "the button names the crew");
assert(!html.includes("data-poll-act=\"tick\"") && !html.includes("poll-best"), "nothing shown until it is opened");
// A poll nobody has answered yet is new, and shimmers; once you've answered it's just open
html = run("pollCardHTML(" + JSON.stringify(poll({ you_answered: false })) + ", 'event')");
assert(html.includes("New poll for this event with “Thursday Theater”") && html.includes("poll-new"), "a new poll");
assert(run("pollCardHTML(" + JSON.stringify(poll({ you_answered: false })) + ", 'crew')").includes("New poll for “Hamlet”"));
assert(!run("pollCardHTML(" + JSON.stringify(poll()) + ", 'event')").includes("poll-new"), "no shimmer once you've answered");
assert(!run("pollCardHTML(" + JSON.stringify(poll()) + ", 'event')").includes("started by"), "no starter: polls open by themselves");
// Opened and not yet answered: only the showtimes (no best time, no counts), with Submit and None work
const fresh = poll({ you_answered: false, options: poll().options.map((o) => Object.assign({}, o, { yours: false })) });
run("POLL_SHOW[7] = true");
html = run("pollCardHTML(" + JSON.stringify(fresh) + ", 'event')");
assert.strictEqual((html.match(/data-poll-act="tick"/g) || []).length, 3, "a cell for each option");
assert(!html.includes("poll-best") && !html.includes("poll-tag") && !html.includes("poll-cell-n"), "no best time or counts before you answer");
assert(html.includes('data-poll-act="submit"') && html.includes("None work") && !html.includes("Modify"));
// Answered: the best time with first names, and Modify and Go to my crews instead of Submit and None work
html = run("pollCardHTML(" + JSON.stringify(poll()) + ", 'event')");
assert(html.includes("3 of 5 have answered") && html.includes("Ana, Ben") && html.includes("poll-tag"), "best time with first names");
assert(html.includes('data-poll-act="modify"') && html.includes('href="#crews"') && html.includes("Go to my crews"));
assert(!html.includes('data-poll-act="submit"') && !html.includes("None work") && !html.includes('data-poll-act="tick"'));
assert(html.includes('data-poll-act="lock"') && html.includes("Cancel poll"), "the leader can lock in and cancel");
assert(!html.includes("@"), "no email");
assert(html.includes("Close poll for this event with") && !html.includes("Open poll for"), "an open card offers Close");
assert(html.includes('class="poll-h sr-only"'), "the Date poll line isn't shown");
html = run("pollCardHTML(" + JSON.stringify(poll()) + ", 'crew')");
assert(html.includes("Close poll for “Hamlet”") && html.includes('data-poll-act="modify"') && !html.includes("Go to my crews"), "no link to the crews page from the crews page");
html = run("pollCardHTML(" + JSON.stringify(poll()) + ", 'event')");
// Modify brings the grid back with your saved ticks pressed
run("POLL_EDIT[7] = true; POLL_DRAFT = {}");
html = run("pollCardHTML(" + JSON.stringify(poll()) + ", 'event')");
assert.strictEqual((html.match(/aria-pressed="true"/g) || []).length, 1, "only your tick is pressed");
run("POLL_EDIT = {}; POLL_DRAFT = {}");
// Anyone but the crew leader can't manage
html = run("pollCardHTML(" + JSON.stringify(poll({ can_manage: false })) + ", 'crew')");
assert(!html.includes("data-poll-act=\"lock") && !html.includes("Cancel poll"), "only the leader manages");
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
run("CREW_DD = {}; POLLS = " + JSON.stringify([poll({ you_answered: false }), poll({ id: 8, you_answered: true }), poll({ id: 9, status: "locked", you_answered: false, locked: option(1, 2, "19:30", ["Ana"]) })]));
const waiting = run("pollsWaitingHTML()");
assert.strictEqual((waiting.match(/data-poll-waiting/g) || []).length, 1, "one poll waits for you");
assert(waiting.includes("Hamlet") && waiting.includes('href="#e/9"'));
assert(run("pollsCrewHTML({ id: 4 })").includes("The Crew Commits!") && run("pollsCrewHTML({ id: 4 })").includes("Polls only appear once a majority") && run("pollsCrewHTML({ id: 4 })").includes("data-poll-card") && !run("pollsCrewHTML({ id: 4 })").includes("Locked in"), "a crew's open polls");
assert.strictEqual(run("pollsLockedHTML({ id: 4 }).length"), 1, "the locked one goes on the Shared Calendar");
assert(run("pollsCrewHTML({ id: 99 })").includes("No open polls") && !run("pollsCrewHTML({ id: 99 })").includes("data-poll-card"), "nothing of another crew's");
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
// The same poll drawn on the event's page and on the crew's page (both are in the document at once) shares no ids
const ids = (h) => (h.match(/ id="[^"]+"/g) || []);
const both = ids(run("pollCardHTML(" + JSON.stringify(poll()) + ", 'event')")).concat(ids(run("pollCardHTML(" + JSON.stringify(poll()) + ", 'crew')")));
assert.strictEqual(new Set(both).size, both.length, "unique ids across views");
// A poll opens by itself once a majority has shared interest; before that the event page only says where it stands
run("POLLS = []; CREWS = [{ id: 4, name: 'Thursday Theater' }]; POLL_INT = { 9: { at: Date.now(), list: [{ crew_id: 4, shared: 2, members_total: 5, ready: false }] } }");
html = run("pollsEventHTML(__ev)");
assert(html.includes("2 of 5 have shared interest") && html.includes("opens by itself") && !html.includes("start-open"), "no start button, even below a majority");
run("POLL_INT[9].list[0].ready = true; POLL_INT[9].list[0].shared = 3");
assert(!run("pollsEventHTML(__ev)").includes("have shared interest"), "nothing to say at a majority: the poll is opened for you");
// ---------- CC-298: an exhibition poll (half-hours of up to five days) ----------
assert.strictEqual(run("pollSpan('13:00', '15:30')"), "1:00–3:30 PM");
assert.strictEqual(run("pollSpan('11:00', '13:30')"), "11:00 AM–1:30 PM", "across noon both ends keep their AM or PM");
assert.deepStrictEqual(JSON.parse(JSON.stringify(run("pollSlots({ opens: '10:00', closes: '12:00' })"))), ["10:00", "10:30", "11:00", "11:30"]);
assert.deepStrictEqual(JSON.parse(JSON.stringify(run("pollSlots({ opens: '10:15', closes: '11:30' })"))), ["10:30", "11:00"], "the grid starts on the half-hour");
assert.deepStrictEqual(JSON.parse(JSON.stringify(run("pollEnds({ opens: '10:00', closes: '12:00' }, '10:00')"))), ["11:00", "11:30", "12:00"], "a range is at least an hour");
const blocks = (taken, starts) => starts.map((t) => ({ start: t, count: (taken[t] || []).length, names: taken[t] || [], yours: false }));
const day = (id, n, mine) => ({ id, date: d(n), time: "", count: 0, names: [], yours: false, opens: "10:00", closes: "12:00",
  blocks: blocks({}, ["10:00", "10:30", "11:00", "11:30"]).map((b) => Object.assign(b, { yours: (mine || []).includes(b.start) })) });
function hpoll(over) {
  return Object.assign(poll({ kind: "hours", you_answered: false, options: [day(11, 2, ["10:30"]), day(12, 4)], best: [], answered_count: 1 }), over);
}
run("POLL_SHOW = { 7: true }; POLL_EDIT = {}; POLL_DRAFT = {}; POLL_DAY = {}; POLLS = []");
html = run("pollCardHTML(" + JSON.stringify(hpoll()) + ", 'event')");
assert.strictEqual((html.match(/data-poll-act="btick"/g) || []).length, 8, "a button for each half-hour of each day");
assert.strictEqual((html.match(/aria-pressed="true"/g) || []).length, 1, "your saved half-hour starts pressed");
assert(html.includes(`aria-label="${run("goingDay('" + d(2) + "')")}, 10:30 AM"`), "each half-hour is named with its day");
assert(html.includes("Day 1 of 2") && html.includes('data-poll-act="day-next"') && /data-poll-act="day-prev"[^>]*disabled/.test(html), "one day at a time on a phone, Previous disabled on the first");
assert.strictEqual((html.match(/poll-tt-h poll-tt-d is-cur/g) || []).length, 1, "only one day is the current one");
assert(!html.includes("poll-cell poll-block") && html.includes("poll-sq poll-block"), "squares, not pills");
assert(html.includes("Free all day") && html.includes("Clear day") && html.includes("None work") && html.includes('data-poll-act="submit"'));
assert(html.includes("10 AM–12 PM"), "each day shows its hours");
run("POLL_DAY[7] = 1");
html = run("pollCardHTML(" + JSON.stringify(hpoll()) + ", 'event')");
assert(html.includes("Day 2 of 2") && /data-poll-act="day-next"[^>]*disabled/.test(html), "Next disabled on the last day");
run("POLL_DAY = {}");
// ids stay unique with the card on both pages
const hboth = ids(run("pollCardHTML(" + JSON.stringify(hpoll()) + ", 'event')")).concat(ids(run("pollCardHTML(" + JSON.stringify(hpoll()) + ", 'crew')")));
assert.strictEqual(new Set(hboth).size, hboth.length, "unique ids across views (exhibition poll)");
// Answered: ranges, with Lock in carrying the range
const hbest = { option_id: 11, date: d(2), time: "10:00", end: "12:00", count: 3, names: ["Ana", "Ben", "Cy"], everyone: false };
html = run("pollCardHTML(" + JSON.stringify(hpoll({ you_answered: true, best: [hbest] })) + ", 'event')");
assert(html.includes("10:00 AM–12:00 PM") && html.includes("3 of 5") && html.includes('data-start="10:00" data-end="12:00"'), "the range, its people, and Lock in with its range");
assert(html.includes('data-poll-lock-sel="day"') && html.includes('data-poll-lock-sel="start"') && html.includes('data-poll-lock-sel="end"'), "Lock in another time: day, from, to");
assert(!html.includes('data-poll-act="btick"'), "the grid is gone once you've answered");
// Locked: the range, and Commit to uses it
const hlocked = hpoll({ status: "locked", you_answered: true, locked: { id: 11, date: d(2), time: "10:00", end: "12:00", count: 2, names: ["Ana", "Ben"], yours: true } });
html = run("pollCardHTML(" + JSON.stringify(hlocked) + ", 'event')");
assert(html.includes("Locked in:") && html.includes("10:00 AM–12:00 PM") && html.includes("Commit to"), "locked range with Commit to");
assert(run("pollCardHTML(" + JSON.stringify(hpoll({ status: "locked", you_answered: true, locked: { id: 11, date: d(2), time: "10:00", end: "12:00", count: 0, names: [], yours: false } })) + ", 'event')").includes("Nobody is free for all of it"));
run("MYPLANS[9] = { status: 'going', date: '" + d(2) + "', time: '10:00', crews: [4] }");
assert(run("pollCardHTML(" + JSON.stringify(hlocked) + ", 'event')").includes("You’re going on this date"), "going at the range's start counts as committed");
run("MYPLANS = {}");
// The day picker: only open days in the next 30, at most five chosen
const exhibit = run("toEvent(" + JSON.stringify({ id: 9, title: "Sue the T. rex", category: "Visual Art", begin_date: d(-5), end_date: d(40), venue: { id: 1, name: "Field Museum", neighborhood: "N", area: "city", region: "north", type: "Visual Art" },
  performances: [], schedule: { dates: [], weekly: {}, weeks: {}, weekly_from: "", hours: { mon: null } } }) + ")");
g.__ex = exhibit;
assert.strictEqual(run("isExhibit(__ex)"), true);
const choices = JSON.parse(JSON.stringify(run("pollDayChoices(__ex)")));
const openDays = Array.from({ length: 30 }, (_, i) => d(i)).filter((iso) => new Date(iso + "T12:00:00").getDay() !== 1);
assert.deepStrictEqual(choices, openDays, "today and the 29 days after, minus Mondays");
assert(choices.every((iso) => new Date(iso + "T12:00:00").getDay() !== 1), "a day marked Closed isn't offered");
run("POLL_DAYS = {}; POLL_ERR = {}");
html = run("pollDayPickHTML({ id: 4, name: 'Art Crew' }, __ex, 'event')");
assert(html.includes("Find a date with Art Crew") && html.includes("0 of 5 days chosen") && /data-poll-act="startdays"[^>]*disabled/.test(html), "Start is off until a day is chosen");
run("POLL_DAYS['4-9'] = " + JSON.stringify(choices.slice(0, 5)));
html = run("pollDayPickHTML({ id: 4, name: 'Art Crew' }, __ex, 'event')");
assert(html.includes("5 of 5 days chosen") && !/data-poll-act="startdays"[^>]*disabled/.test(html), "five chosen: Start is on");
assert.strictEqual((html.match(/data-poll-act="pickday"[^>]*disabled/g) || []).length, choices.length - 5, "a sixth can't be chosen");
assert.strictEqual((html.match(/aria-pressed="true"/g) || []).length, 5);
// On the event page: a crew that's ready gets the picker; one that isn't, where it stands. Waiting for you lists the ready one.
run("POLLS = []; POLL_DAYS = {}; POLL_READY_HOURS = [{ crew_id: 4, event_id: 9, kind: 'hours', event_title: 'Sue the T. rex', crew_name: 'Art Crew' }]; CREWS = [{ id: 4, name: 'Art Crew' }, { id: 5, name: 'Other' }]; POLL_INT = { 9: { at: Date.now(), list: [{ crew_id: 4, shared: 3, members_total: 5, ready: true }, { crew_id: 5, shared: 1, members_total: 5, ready: false }] } }");
html = run("pollsEventHTML(__ex)");
assert(html.includes("data-poll-pick") && html.includes("1 of 5 have shared interest") && html.includes("a member picks its days"));
run("POLL_READY_HOURS = [{ crew_id: 4, event_id: 9, kind: 'hours', event_title: 'Sue the T. rex', crew_name: 'Art Crew' }]");
html = run("pollsWaitingHTML()");
assert(html.includes("data-poll-ready") && html.includes("Sue the T. rex") && html.includes("Pick the days") && !html.includes("@"));
assert.strictEqual(run("pollsWaiting().length"), 1);
run("POLLS = [" + JSON.stringify(hpoll({ crew_id: 4, event_id: 9 })) + "]; POLL_READY_HOURS = [{ crew_id: 4, event_id: 9, kind: 'hours', event_title: 'x', crew_name: 'y' }]");
assert.strictEqual(run("pollsReadyHours().length"), 0, "once the poll exists it isn't also listed as ready");
run("POLLS = []; POLL_READY_HOURS = []");
assert(!run("pollsEventHTML(__ex)").includes("data-poll-pick"), "no picker once the server no longer lists the crew as ready (its poll was locked or cancelled long ago)");

// CC-315: a different member in the same tab sees nothing of the last member's polls, even when an earlier request answers late
run("visible = function () { return false; }; paintPending = function () {}; renderEventView = function () {}; paintCrews = function () {}; EV = { e: null };");
let inflight = []; // requests that haven't answered yet: path -> resolve(body)
run("readJSON = function (r) { return Promise.resolve(r); };");
g.api = (p, o) => new Promise((res) => inflight.push({ p, o, res: (body) => res({ ok: true, body }) }));
const answer = (path, body) => { const w = inflight.filter((x) => x.p.startsWith(path)); inflight = inflight.filter((x) => !w.includes(x)); w.forEach((x) => x.res(body)); return new Promise((r) => setTimeout(r, 0)); };
const tick = () => new Promise((r) => setTimeout(r, 0));
// onAuthChange is what runs on every change of member: it must empty the polls before it draws anything
const authChange = read("account.js").split("function onAuthChange() {")[1].split("\n")[1];
assert(/^\s*pollsSync\(\)/.test(authChange), "onAuthChange begins by calling pollsSync()");
(async () => {
  const ana = { id: "u-ana" }, ben = { id: "u-ben" };
  const readyRow = { crew_id: 4, event_id: 10, kind: "hours", event_title: "Sue the T. rex", crew_name: "Art Crew" };
  // Ana's polls and everything per-member that hangs off them
  run("AUTH.user = { id: 'u-ana' }; pollsSync();");
  run("POLLS = [" + JSON.stringify(poll()) + "]; POLL_READY_HOURS = [" + JSON.stringify(readyRow) + "]; POLL_SHOW = { 7: true }; POLL_EDIT = { 7: true }; POLL_DRAFT = { 7: [1] }; POLL_ERR = { 7: 'x' }; POLL_DAYS = { '4-10': ['d'] }; POLL_DAY = { 7: 1 }; POLL_BUSY = { 7: true }; POLL_INT = { 9: { at: 1, list: [] } }; POLL_ASK = 7; POLL_AUTO = { '4-10': true }");
  assert(run("pollsWaiting().length") > 0 && run("pollsOfCrew(4).length") === 1, "Ana sees her polls");
  // Another member signs in, in the same tab: (1) before any request answers, nothing of Ana's can be read
  run("AUTH.user = { id: 'u-ben' }; pollsSync();");
  assert.strictEqual(run("POLLS.length + POLL_READY_HOURS.length"), 0, "POLLS and POLL_READY_HOURS are empty");
  assert.strictEqual(run("pollsWaiting().length + pollsOfCrew(4).length + pollsOfEvent(9).length + pollsReadyHours().length"), 0, "no reader finds Ana's polls");
  assert.strictEqual(run("JSON.stringify([POLL_SHOW, POLL_EDIT, POLL_DRAFT, POLL_ERR, POLL_DAYS, POLL_DAY, POLL_BUSY, POLL_INT, POLL_AUTO, POLL_ASK])"), '[{},{},{},{},{},{},{},{},{},null]', "drafts, days, errors, interest and open or editing flags are empty");
  // The same member again (a role change fires onAuthChange too) keeps what they have
  run("POLLS = [" + JSON.stringify(poll()) + "]; pollsSync();");
  assert.strictEqual(run("POLLS.length"), 1, "the same member isn't cleared");
  run("POLLS = [];");

  // (3) Requests that were on their way at sign-out: Ana's answers arrive after Ben has signed in
  run("AUTH.user = { id: 'u-ana' }; pollsSync();");
  const late = run("loadPolls()"); // asks /crews/polls as Ana
  const lateReady = run("pollAutoCheck()");
  run("pollInterest(9)");
  const sub = run("pollSubmit(" + JSON.stringify(poll({ you_answered: false })) + ", [1])");
  await tick();
  run("AUTH.user = { id: 'u-ben' }; pollsSync();"); // Ana signs out, Ben signs in
  await answer("/crews/polls", [poll()]);
  await answer("/crews/poll-ready", [readyRow]);
  await answer("/crews/poll-interest", [{ crew_id: 4, count: 3 }]);
  await answer("/crews/4/polls/7/answer", poll());
  await late; await lateReady;
  assert.strictEqual(run("POLLS.length"), 0, "a poll list that answers late doesn't put Ana's polls back");
  assert.strictEqual(run("POLL_READY_HOURS.length"), 0, "nor the exhibitions her crews are ready to poll");
  assert.strictEqual(run("JSON.stringify(POLL_INT)"), "{}", "nor the interest counts");
  assert.strictEqual(run("pollsWaiting().length"), 0);
  // (2) Ben's own polls appear as before
  const bens = run("loadPolls()");
  await answer("/crews/polls", [poll({ id: 8, crew_name: "Ben's Crew" })]);
  await answer("/crews/poll-ready", []);
  await bens;
  assert.strictEqual(run("POLLS.length"), 1);
  assert.strictEqual(run("pollsWaiting().length"), 0 + run("POLLS.filter(function (p) { return p.status === 'open' && !p.you_answered; }).length"), "Ben's polls show");
  assert.strictEqual(run("POLLS[0].id"), 8, "Ben's own poll");
  // A failed request for the new member leaves nothing of Ana's behind either
  run("AUTH.user = { id: 'u-cat' }; pollsSync();");
  assert.strictEqual(run("POLLS.length + pollsWaiting().length"), 0, "after a switch with the request still unanswered");
  console.log("ok: test_polls");
})().catch((e) => { console.error(e); process.exit(1); });
