// Checks run in CI before the site deploys (CC-301): the Show Run in the event edit form, public/js/showrun.js. The pure
// helpers (patternDates, monthCells, gridMove, readShowRun, showRunBody, editorDateMode), the form on a small fake of the
// page (modes, the day panel, Escape, Fill and Undo, what is saved), what Find an outing does with an exact Show Run, and the
// markup, styles and names the accessibility rules need.
//
//     node scripts/test_show_run.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const PUB = path.join(__dirname, "..", "public");
const read = (f) => fs.readFileSync(path.join(PUB, f), "utf8");
const has = (s, part, msg) => assert.ok(s.includes(part), msg || "has " + part);

// --- a fake of just the elements the editor touches ---
let FOCUS = null;
const ELS = {}, WIN = {};
function stub() {
  return new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => "" : stub()), set: () => true, apply: () => stub() });
}
function el(id) {
  const o = { id, value: "", textContent: "", innerHTML: "", hidden: false, checked: false, open: false, disabled: false, tabIndex: 0, handlers: {},
    addEventListener(t, f) { (this.handlers[t] = this.handlers[t] || []).push(f); },
    fire(t, ev) { const e = Object.assign({ target: this, preventDefault() { e.prevented = true; }, stopPropagation() {} }, ev); (this.handlers[t] || []).forEach((f) => f.call(this, e)); return e; },
    focus() { FOCUS = id; }, contains: () => true, querySelector: () => null, querySelectorAll: () => [], setAttribute() {}, getAttribute: () => null, click() { this.fire("click"); } };
  return new Proxy(o, { get: (t, k) => (k in t ? t[k] : stub()), set: (t, k, v) => { t[k] = v; return true; } });
}
const $ = (id) => ELS[id] || (ELS[id] = el(id));
const RADIOS = {};
const g = {
  $, console, Intl, Promise, setTimeout, JSON, Object, Array, Date, Math,
  window: { devicePixelRatio: 1, matchMedia: () => stub(), addEventListener: (t, f) => { WIN[t] = f; } },
  matchMedia: () => stub(), localStorage: stub(), location: stub(), history: stub(), navigator: stub(),
  document: { addEventListener() {}, activeElement: null, getElementById: (id) => $(id), querySelector: (q) => RADIOS[q] || (RADIOS[q] = { checked: false, value: "" }), querySelectorAll: () => [] },
};
vm.createContext(g);
vm.runInContext("var AUTH = { user: null }, MYPLANS = {}, API = '';", g);
["util.js", "outing.js", "hours.js", "showrun.js"].forEach((f) => vm.runInContext(read("js/" + f), g));
const set = (code) => vm.runInContext(code, g);
const plain = (x) => JSON.parse(JSON.stringify(x)); // the vm's own arrays and objects
const iso = (n) => g.isoDate(g.add(g.T, n));
const showsOf = (list) => plain(list);

// --- days to use: the Monday after today, a week of them, and a month's first day ---
let mon = g.add(g.T, 1); while (mon.getDay() !== 1) mon = g.add(mon, 1);
const D = (n) => g.isoDate(g.add(mon, n)); // 0 is that Monday
const dow = (s) => g.DOW[g.parseISO(s).getDay()];
const WEEKLY = { thu: ["20:00"], fri: ["20:00"], sat: ["20:00"], sun: ["15:00"] };

// 1. patternDates: a range, Thursday to Saturday at 8 PM and Sunday at 3 PM, four weeks
let list = plain(g.patternDates(D(0), D(27), WEEKLY, {}));
assert.strictEqual(list.length, 16, "four weeks of four days");
assert.deepStrictEqual(list.slice(0, 4).map((s) => [dow(s.date), s.time]), [["thu", "20:00"], ["fri", "20:00"], ["sat", "20:00"], ["sun", "15:00"]]);
assert.ok(list.every((s, i) => i === 0 || list[i - 1].date < s.date), "in date order");
assert.ok(list.every((s) => s.end_time === ""), "no end times");
list = plain(g.patternDates(D(0), D(6), { sat: ["15:00", "20:00"] }, {}));
assert.deepStrictEqual(list.map((s) => [s.date, s.time]), [[D(5), "15:00"], [D(5), "20:00"]], "two shows on a day");
// the 1st and 3rd Thursday only, over three months
let first = new Date(g.T.getFullYear(), g.T.getMonth() + 1, 1);
list = plain(g.patternDates(g.isoDate(first), g.isoDate(g.add(first, 89)), { thu: ["19:30"] }, { thu: [1, 3] }));
assert.ok(list.length >= 5 && list.length <= 7, "about two a month for three months: " + list.length);
assert.ok(list.every((s) => dow(s.date) === "thu" && [1, 3].indexOf(Math.ceil(+s.date.slice(8) / 7)) >= 0), "only the 1st and 3rd Thursday");
// days that have passed are skipped; a range that ends before it starts is empty
list = plain(g.patternDates(iso(-10), iso(10), { mon: ["20:00"], tue: ["20:00"], wed: ["20:00"], thu: ["20:00"], fri: ["20:00"], sat: ["20:00"], sun: ["20:00"] }, {}));
assert.strictEqual(list.length, 11, "today and ten days on, not the ten before");
assert.strictEqual(list[0].date, iso(0));
assert.deepStrictEqual(plain(g.patternDates(D(5), D(2), WEEKLY, {})), []);
assert.ok(g.patternDates(iso(0), iso(5000), { mon: ["20:00"] }, {}).length <= 160, "one fill goes no further than three years");

// 2. mergePattern: adds the missing times and never removes or changes a show
let merged = g.mergePattern([{ date: D(3), time: "20:00", end_time: "22:00" }, { date: D(5), time: "", end_time: "" }], g.patternDates(D(0), D(6), WEEKLY, {}));
assert.deepStrictEqual(plain(merged.added), [D(4), D(6)], "Thursday had its show already; Saturday has a show with no time");
assert.strictEqual(merged.left, 1, "Saturday was left alone");
assert.strictEqual(plain(merged.shows).find((s) => s.date === D(3)).end_time, "22:00", "an existing show keeps its end time");
assert.strictEqual(plain(merged.shows).find((s) => s.date === D(5)).time, "", "a show with no time stays as it was");
merged = g.mergePattern([], g.patternDates(D(0), D(6), { sat: ["10:00", "11:00", "12:00", "13:00", "14:00", "15:00"] }, {}));
assert.strictEqual(merged.added.length, 6);
merged = g.mergePattern(merged.shows, [{ date: D(5), time: "16:00", end_time: "" }]);
assert.strictEqual(merged.left, 1, "a day has six shows at most"); assert.strictEqual(merged.shows.length, 6);

// 3. monthCells and gridMove
let weeks = plain(g.monthCells(2026, 10)); // November 2026 starts on a Sunday
assert.strictEqual(weeks.length, 6); assert.ok(weeks.every((w) => w.length === 7));
assert.deepStrictEqual(weeks[0].slice(0, 6), [null, null, null, null, null, null]); assert.strictEqual(weeks[0][6], "2026-11-01", "Monday first, so Sunday is last");
assert.strictEqual(weeks[5][0], "2026-11-30"); assert.strictEqual(weeks[5][1], null);
assert.strictEqual(plain(g.monthCells(2027, 1)).length, 4, "February 2027 is four whole weeks");
assert.strictEqual(plain(g.monthCells(2027, 1)).flat().filter(Boolean).length, 28);
assert.strictEqual(g.gridMove("2026-11-30", "ArrowRight"), "2026-12-01", "a month's end goes on to the next");
assert.strictEqual(g.gridMove("2026-12-01", "ArrowLeft"), "2026-11-30");
assert.strictEqual(g.gridMove("2026-11-26", "ArrowDown"), "2026-12-03");
assert.strictEqual(g.gridMove("2026-11-03", "ArrowUp"), "2026-10-27");
assert.strictEqual(g.gridMove("2026-11-12", "Home"), "2026-11-09", "the week's Monday"); assert.strictEqual(g.gridMove("2026-11-12", "End"), "2026-11-15", "and Sunday");
assert.strictEqual(g.gridMove("2026-11-01", "Home"), "2026-10-26", "a Sunday's Monday is in the month before");
assert.strictEqual(g.gridMove("2026-01-31", "PageDown"), "2026-02-28", "the same day a month on, or the month's last");
assert.strictEqual(g.gridMove("2026-03-31", "PageUp"), "2026-02-28"); assert.strictEqual(g.gridMove("2026-01-15", "PageUp"), "2025-12-15");
assert.strictEqual(g.gridMove("2026-11-12", "x"), "2026-11-12");

// 4. showsProblem and readShowRun
const S = (date, time, end) => ({ date, time: time === undefined ? "20:00" : time, end_time: end || "" });
const bad = (shows, kept) => g.showsProblem(shows, kept || {});
assert.strictEqual(bad([S(D(3)), S(D(4))]), null);
assert.match(bad([S(D(3), "20:00", "19:00")]).error, /ends before it starts/);
assert.match(bad([S(D(3), "20:00", "20:00")]).error, /ends before it starts/, "an end at the start is no show");
assert.match(bad([S(D(3), "", "21:00")]).error, /end time needs a start time/);
assert.match(bad([S(D(3)), S(D(3))]).error, /two shows start at 8 PM/);
assert.strictEqual(bad([S(D(3)), S(D(3), "15:00")]), null, "a matinee and an evening");
assert.match(bad([S(D(3), ""), S(D(3))]).error, /start time/, "a show with no time can't share its day");
assert.strictEqual(bad([S(D(3), "")]), null, "a show with no time, alone");
assert.match(bad([1, 2, 3, 4, 5, 6, 7].map((h) => S(D(3), "1" + h + ":00"))).error, /six shows a day/);
assert.strictEqual(bad([1, 2, 3, 4, 5, 6].map((h) => S(D(3), "1" + h + ":00"))), null, "six is fine");
assert.match(bad([S(iso(-3))]).error, /has passed/, "a new past day is refused");
assert.strictEqual(bad([S(iso(-3))], { [iso(-3)]: true }), null, "a past day the event already had is fine");
const many = (n) => Array.from({ length: n }, (_, i) => S(g.isoDate(g.add(g.T, 1 + Math.floor(i / 6))), "1" + (i % 6) + ":00"));
assert.strictEqual(bad(many(500)), null, "500 shows"); assert.match(bad(many(501)).error, /500/, "501 shows");
// readShowRun reads the form's own shows
set("SR.kept = {}; SR.shows = " + JSON.stringify([S(D(4)), S(D(3), "15:00", "17:00"), S(D(3))]));
let got = plain(g.readShowRun());
assert.deepStrictEqual(got.show_run.map((s) => [s.date, s.time, s.end_time]), [[D(3), "15:00", "17:00"], [D(3), "20:00", ""], [D(4), "20:00", ""]], "sorted by date, then time");
set("SR.shows = " + JSON.stringify([S(D(4), "20:00", "19:00")]));
got = plain(g.readShowRun()); assert.match(got.error, /ends before it starts/); assert.strictEqual(got.id, "sr-d-" + D(4)); assert.strictEqual(got.date, D(4));

// 5. showRunBody: unchanged sends nothing; a changed run is sent whole; emptied clears the dates
const forty5 = Array.from({ length: 45 }, (_, i) => S(g.isoDate(g.add(g.T, 1 + i)), "19:30"));
assert.deepStrictEqual(plain(g.showRunBody([], [])), {}, "no shows and none now");
assert.deepStrictEqual(plain(g.showRunBody(forty5, forty5.slice().reverse())), {}, "the same shows in another order");
assert.deepStrictEqual(plain(g.showRunBody([S(D(3))], [S(D(3), "20:00", "")])), {});
let body = plain(g.showRunBody([], forty5));
assert.deepStrictEqual(Object.keys(body), ["show_run"], "only the Show Run; the API sets Opens and Closes"); assert.strictEqual(body.show_run.length, 45);
body = plain(g.showRunBody(forty5, forty5.slice(1)));
assert.strictEqual(body.show_run.length, 44, "one show removed after the fill: the whole run again");
body = plain(g.showRunBody(forty5, forty5.map((s, i) => (i === 7 ? Object.assign({}, s, { time: "14:00" }) : s))));
assert.strictEqual(body.show_run.length, 45, "retimed");
assert.deepStrictEqual(plain(g.showRunBody(forty5, [])), { show_run: [], begin_date: null, end_date: null }, "emptied: Dates not posted");

// 6. editorDateMode
assert.strictEqual(g.editorDateMode("Theater", {}), "showrun", "Theater with no shows is a Show Run");
assert.strictEqual(g.editorDateMode("Music", { open: false }), "showrun");
assert.strictEqual(g.editorDateMode("Theater", { open: true }), "open");
assert.strictEqual(g.editorDateMode("Visual Art", {}), "range"); assert.strictEqual(g.editorDateMode("Visual Art", { kind: "range", open: true }), "range", "an open exhibition is still a range");
assert.strictEqual(g.editorDateMode("Visual Art", { kind: "dates" }), "dates", "a talk: on chosen dates");
assert.strictEqual(g.editorDateMode("", {}), "range"); assert.strictEqual(g.editorDateMode("Theater"), "showrun");

// 7. notes under the calendar
const ev0 = (over) => g.fromApi(Object.assign({ id: 5, title: "Hamlet", category: "Theater", begin_date: null, end_date: null, open_run: false, cost_text: "$20", min_price: 20, url: "",
  venue: { id: 1, name: "A Red Orchid Theatre", neighborhood: "Old Town", area: "city", region: "north" }, show_run: [],
  schedule: { dates: [], dates_from: "", weekly: {}, weeks: {}, weekly_from: "", hours: {} } }, over));
const note = (e, before, shows, found) => plain(g.showRunNotes(e, before, shows, found)).join(" | ");
assert.match(note(ev0(), [], [], false), /No shows yet: it is listed as Dates not posted/);
assert.match(note(ev0({ begin_date: "2027-11-01", end_date: "2028-03-01" }), [], [], false), /Listed now as Nov 1, 2027 – Mar 1, 2028\. Add shows/);
assert.match(note(ev0({ begin_date: "2027-11-01", end_date: "2028-03-01" }), [], [S("2027-11-06"), S("2028-01-11")], false), /Listed now as .*; saving the Show Run sets .*Nov 6, 2027 – Jan 11, 2028/);
assert.strictEqual(note(ev0({ begin_date: "2027-11-06", end_date: "2028-01-11" }), [S("2027-11-06"), S("2028-01-11")], [S("2027-11-06"), S("2028-01-11")], false), "", "first and last match: no note");
assert.match(note(ev0(), [S("2027-11-06")], [], false), /No shows: saving lists it as Dates not posted/);
assert.match(note(ev0(), [S("2027-11-06")], [S("2027-11-06")], true), /These dates came from the venue's website\. Changing them makes this Show Run its only dates/);

// 8. Find an outing: an exact Show Run is those dates only, with no weekly fallback
const sched = (over) => Object.assign({ dates: [], dates_from: "", weekly: {}, weeks: {}, weekly_from: "", hours: {} }, over);
const dates = [{ date: iso(2), time: "20:00" }, { date: iso(9), time: null }];
const thu = g.DOW[g.add(g.T, 2).getDay()];
const exact = ev0({ begin_date: iso(2), end_date: iso(30), schedule: sched({ dates, dates_from: "event", weekly: { [thu]: ["20:00"] }, weekly_from: "venue" }) });
assert.strictEqual(exact.exactRun, true);
assert.deepStrictEqual(plain(g.timesOn(exact, g.add(g.T, 2))), ["20:00"]); assert.deepStrictEqual(plain(g.timesOn(exact, g.add(g.T, 9))), [""], "a show with no time");
assert.deepStrictEqual(plain(g.timesOn(exact, g.add(g.T, 9 + 7))), [], "past its last show, the venue's usual night is not a show");
assert.deepStrictEqual(plain(g.timesOn(exact, g.add(g.T, 4))), [], "a day between shows");
assert.ok(g.canGoOn(exact, g.add(g.T, 2)) && g.canGoOn(exact, g.add(g.T, 9)));
assert.ok(!g.canGoOn(exact, g.add(g.T, 16)) && !g.canGoOn(exact, g.add(g.T, 4)), "no weekly fallback, not even on the venue's usual night");
assert.strictEqual(g.goAnyDay(exact), false);
const found = ev0({ begin_date: iso(2), end_date: iso(40), schedule: sched({ dates: [dates[0]], dates_from: "found", weekly: { [thu]: ["20:00"] }, weekly_from: "venue" }) });
assert.strictEqual(found.exactRun, false);
assert.ok(g.canGoOn(found, g.add(g.T, 9)), "dates a venue's page gave: the venue's usual night after the last of them");
assert.ok(!g.canGoOn(found, g.add(g.T, 4)), "and before it, only the listed date");
// the event view's line, from the whole Show Run, or from the upcoming dates a list carries
const two = ev0({ begin_date: iso(2), end_date: iso(2), show_run: [{ date: iso(-5), time: "20:00", end_time: "" }, { date: iso(2), time: "14:00", end_time: "" }, { date: iso(2), time: "20:00", end_time: "21:30" }, { date: iso(9), time: "", end_time: "" }],
  schedule: sched({ dates: [{ date: iso(2), time: "14:00" }, { date: iso(2), time: "20:00" }, { date: iso(9), time: null }], dates_from: "event" }) });
assert.strictEqual(g.runDatesText(two), g.goingDay(iso(2)) + ", 2 PM and 8 PM–9:30 PM · " + g.goingDay(iso(9)), "a day is one entry; a day with no time is its date alone");
assert.strictEqual(g.runDatesText(Object.assign({}, two, { showRun: null })), g.goingDay(iso(2)) + ", 2 PM and 8 PM · " + g.goingDay(iso(9)), "a list's event: its upcoming dates");
assert.strictEqual(g.showRunCountText(two), "Show Run: 3 upcoming shows"); assert.strictEqual(g.showRunCountText(found), "");
assert.strictEqual(two.showRun.length, 4, "the event's whole Show Run, past shows too"); assert.strictEqual(ev0().showRun, null, "a list sends [], which says nothing");
assert.strictEqual(g.clockText(""), ""); assert.strictEqual(g.clockText(null), "");

// 9. the form: the mode follows the type and the open-run box
$("sr-shows").querySelector = () => ({ focus() { FOCUS = "first-input"; } });
const open = (e) => { FOCUS = null; $("ed-category").value = e.type; $("ed-begin").value = e.begin || ""; $("ed-end").value = e.end || ""; $("ed-open-run").checked = !!e.openRun; g.srOpen(e); };
const shown = (id) => !$(id).hidden;
open(ev0());
assert.strictEqual(g.ED_MODE, "showrun");
assert.ok(shown("ed-showrun") && !shown("ed-range") && !shown("ed-runkind") && shown("sr-open-field") && !shown("ed-sched"), "Theater with no shows: the calendar, no Opens, Closes or show days");
open(ev0({ category: "Visual Art" }));
assert.strictEqual(g.ED_MODE, "range");
assert.ok(!shown("ed-showrun") && shown("ed-range") && shown("ed-runkind") && !shown("sr-open-field") && !shown("ed-sched"), "an exhibition: Opens and Closes, as before");
$("ed-category").value = "Theater"; $("ed-category").fire("change");
assert.strictEqual(g.ED_MODE, "showrun", "changing the type switches the mode");
open(ev0({ open_run: true, begin_date: iso(0), schedule: sched({ weekly: WEEKLY, weekly_from: "event" }) }));
assert.strictEqual(g.ED_MODE, "open");
assert.ok(!shown("ed-showrun") && shown("ed-range") && !shown("ed-end-field") && shown("ed-sched"), "an open run: Opens and the show days, no Closes");
open(ev0({ category: "Visual Art", begin_date: iso(2), end_date: iso(9), show_run: [S(iso(2))], schedule: sched({ dates, dates_from: "event" }) }));
assert.strictEqual(g.ED_MODE, "dates");
assert.ok(shown("ed-showrun") && !shown("ed-range") && shown("ed-runkind") && !shown("sr-open-field"), "a talk on chosen dates: the calendar, under When is it on?");
$("ed-category").value = "Music"; $("ed-category").fire("change");
assert.strictEqual(g.ED_MODE, "showrun"); assert.strictEqual(g.SR.shows.length, 1, "the shows stay when the type changes");
open(ev0({ category: "Visual Art" }));
RADIOS['input[name="ed-runkind"]:checked'] = { checked: true, value: "fixed" }; g.srRunKindChanged();
assert.strictEqual(g.ED_MODE, "dates", "the radios");
RADIOS['input[name="ed-runkind"]:checked'] = { checked: true, value: "range" }; g.srRunKindChanged(); assert.strictEqual(g.ED_MODE, "range");
g.srOff(); assert.strictEqual(g.ED_MODE, null); assert.ok(!shown("ed-showrun") && shown("ed-end-field"), "approving a found event: the old fields");

// 10. the grid's markup: roles, labels, one tab stop
const theater = ev0({ begin_date: iso(1), end_date: iso(3), show_run: [S(iso(-1), "20:00"), S(iso(1), "20:00"), S(iso(2), "15:00"), S(iso(2), "20:00"), S(iso(3), "")],
  schedule: sched({ dates: [], dates_from: "event" }) });
open(theater);
const cells = $("sr-body").innerHTML, month = g.SR.month;
assert.strictEqual((cells.match(/tabindex="0"/g) || []).length, 1, "roving tabindex: one tab stop");
const label = (n) => (cells.match(new RegExp('id="sr-d-' + iso(n) + '"[^>]*aria-label="([^"]*)"')) || [])[1];
const inMonth = (n) => iso(n).slice(0, 7) === g.isoDate(month).slice(0, 7);
if (inMonth(1)) assert.strictEqual(label(1), g.dayName(g.add(g.T, 1)) + ", 8 PM show");
if (inMonth(2)) assert.strictEqual(label(2), g.dayName(g.add(g.T, 2)) + ", 3 PM and 8 PM shows");
if (inMonth(3)) assert.strictEqual(label(3), g.dayName(g.add(g.T, 3)) + ", show, time not posted");
const by = {}; theater.showRun.forEach((x) => (by[x.date] = by[x.date] || []).push(x));
const cell = (n) => g.srCell(iso(n), by);
assert.ok(/aria-pressed="true"/.test(cell(1)) && /aria-pressed="false"/.test(cell(4)), "a day with a show is pressed");
assert.strictEqual(g.srLabel(iso(2), by[iso(2)]), g.dayName(g.add(g.T, 2)) + ", 3 PM and 8 PM shows");
assert.strictEqual(g.srLabel(iso(4), []), g.dayName(g.add(g.T, 4)) + ", no show");
assert.ok(/aria-current="date"/.test(g.srCell(iso(0), by)), "today is marked");
assert.ok(/aria-disabled="true"/.test(g.srCell(iso(-2), by)) && /past, can&#39;t be changed/.test(g.srCell(iso(-2), by)), "a past day with no show is disabled, and says so");
assert.ok(!/aria-disabled/.test(cell(-1)) && /, past"/.test(cell(-1)), "a past day that has a show can be opened");
assert.ok(/<span class="sr-t" aria-hidden="true">3p 8p<\/span>/.test(cell(2)), "the cell's own text is hidden from a screen reader: the label says it");
assert.ok(/<span class="sr-dot" aria-hidden="true">2<\/span>/.test(cell(2)), "a phone cell shows a count");
assert.match($("sr-summary").textContent, /^5 shows, .* to .* \(4 upcoming\)\.$/, "the past show counts, and the upcoming ones are named");
assert.strictEqual($("sr-month-h").textContent, g.F.monthY.format(month));
assert.match($("sr-notes").innerHTML, /^$|class="notice"/);

// 11. the day panel: add, retime, Remove, No show this day, Escape
open(ev0({ begin_date: iso(1), end_date: iso(2), show_run: [S(iso(1), "20:00"), S(iso(2), "15:00")], schedule: sched({ dates_from: "event" }) }));
const free = iso(5);
FOCUS = null; g.srDayClick(free);
assert.strictEqual(g.SR.shows.length, 3, "an empty day gets a show at the last time used");
assert.strictEqual(g.SR.shows.find((s) => s.date === free).time, "15:00");
assert.strictEqual($("sr-panel").hidden, false); assert.strictEqual(g.SR.day, free); assert.strictEqual(FOCUS, "first-input", "focus goes to the time box");
assert.match($("edit-live").textContent, /^Added a show on .* at 3 PM\.$/);
assert.match($("sr-panel-h").textContent, /^[A-Z][a-z]+day, /);
assert.match($("sr-shows").innerHTML, /<label for="sr-0-t">Starts<\/label><input id="sr-0-t" type="time"/); assert.match($("sr-shows").innerHTML, /Ends <span class="opt-label">\(optional\)<\/span>/);
assert.match($("sr-shows").innerHTML, /aria-label="Remove 3 PM show on /, "Remove names its show");
// retime
$("sr-shows").fire("input", { target: { getAttribute: (k) => (k === "data-sr-t" ? "0" : null), value: "21:00" } });
assert.strictEqual(g.SR.shows.find((s) => s.date === free).time, "21:00"); assert.strictEqual(g.SR.last, "21:00", "the next new day starts at the time last used");
// a second show on the day
$("sr-add").fire("click"); assert.strictEqual(g.SR.dayRefs.length, 2); assert.strictEqual(FOCUS, "sr-1-t", "the new show's Starts"); assert.match($("sr-panel-msg").textContent, /give each show a start time/);
$("sr-shows").fire("input", { target: { getAttribute: (k) => (k === "data-sr-t" ? "1" : null), value: "14:00" } });
assert.match($("sr-panel-msg").textContent, /^Leave Starts empty/, "the message clears once each show has a time");
// the sixth show hides Add another show
for (let i = 2; i < 6; i++) { $("sr-add").fire("click"); $("sr-shows").fire("input", { target: { getAttribute: (k) => (k === "data-sr-t" ? String(i) : null), value: "1" + i + ":00" } }); }
assert.strictEqual(g.SR.dayRefs.length, 6); assert.strictEqual($("sr-add").hidden, true, "six shows a day at most");
// Remove one, then No show this day
const rm = (i) => $("sr-shows").fire("click", { target: { closest: () => ({ getAttribute: () => String(i) }) } });
rm(5); assert.strictEqual(g.SR.dayRefs.length, 5); assert.match($("edit-live").textContent, /^Removed the .* show on /); assert.strictEqual($("sr-add").hidden, false);
$("sr-none").fire("click");
assert.strictEqual(g.SR.shows.filter((s) => s.date === free).length, 0); assert.strictEqual($("sr-panel").hidden, true); assert.strictEqual(FOCUS, "sr-d-" + free, "back to the day");
assert.match($("edit-live").textContent, /^No show on .*: removed 5 shows\.$/);
// Escape closes the panel, not the dialog
g.srDayClick(iso(1)); assert.strictEqual(g.SR.day, iso(1)); assert.strictEqual(g.SR.shows.length, 2, "a day with a show just opens");
let esc = $("ed-showrun").fire("keydown", { key: "Escape" });
assert.ok(esc.prevented, "Escape is handled, so the dialog stays open"); assert.strictEqual(g.SR.day, ""); assert.strictEqual($("sr-panel").hidden, true); assert.strictEqual(FOCUS, "sr-d-" + iso(1), "back to the day");
let cancel = { target: { id: "edit-dialog" }, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } };
WIN.cancel(cancel); assert.ok(cancel.prevented && cancel.stopped, "a browser that sends cancel anyway: not the dialog");
esc = $("ed-showrun").fire("keydown", { key: "Escape" }); assert.ok(!esc.prevented, "with no panel open, Escape closes the dialog as usual");
// Enter in a time box is Done, not Save
g.srDayClick(iso(1)); const enter = $("ed-showrun").fire("keydown", { key: "Enter", target: { tagName: "INPUT", type: "time" } });
assert.ok(enter.prevented && g.SR.day === "", "Enter in a time box doesn't submit the form");
// a past day the event hasn't got can't be opened
FOCUS = null; g.srDayClick(iso(-4)); assert.strictEqual(g.SR.day, ""); assert.match($("edit-live").textContent, /has passed\.$/);
// grid keys
const key = (k, from) => $("sr-grid").fire("keydown", { key: k, target: { closest: () => ({ getAttribute: () => from }) } });
FOCUS = null; assert.ok(key("ArrowRight", iso(1)).prevented); assert.strictEqual(FOCUS, "sr-d-" + iso(2), "Right: the next day");
key("PageDown", iso(1)); assert.strictEqual(g.SR.month.getMonth(), (g.parseISO(iso(1)).getMonth() + 1) % 12, "Page Down: the next month"); assert.match($("edit-live").textContent, /^[A-Z][a-z]+ \d{4}$/, "the new month is announced");
assert.strictEqual((($("sr-body").innerHTML).match(/tabindex="0"/g) || []).length, 1);
assert.ok(!key("a", iso(1)).prevented, "other keys are left alone");
$("sr-prev").fire("click"); assert.strictEqual(g.SR.month.getMonth(), g.parseISO(iso(1)).getMonth(), "Previous");

// 12. Fill a pattern, then Undo; one show removed after the fill
open(ev0({ begin_date: D(0), end_date: D(41), schedule: sched({ dates_from: "", weekly: WEEKLY, weekly_from: "event" }) }));
assert.strictEqual($("sr-pat-from").value, D(0), "Fill starts with Opens and Closes"); assert.strictEqual($("sr-pat-to").value, D(41));
assert.deepStrictEqual(plain(g.SHOW_DAYS["ed-pat"].days), { thu: ["8 PM"], fri: ["8 PM"], sat: ["8 PM"], sun: ["3 PM"] }, "and the event's own show days");
$("sr-fill").fire("click");
assert.strictEqual(g.SR.shows.length, 24, "six weeks of four days"); assert.match($("edit-live").textContent, /^Added 24 shows, .* to .*\.$/);
assert.strictEqual($("sr-undo").hidden, false); assert.strictEqual($("sr-msg").textContent, "");
$("sr-fill").fire("click"); assert.strictEqual(g.SR.shows.length, 24, "filling again adds nothing"); assert.match($("edit-live").textContent, /^No new shows/);
const filled = plain(g.SR.shows), gone = filled.find((s) => dow(s.date) === "sat" && s.date > D(10));
set("SR.shows = SR.shows.filter(function (s) { return s.date !== " + JSON.stringify(gone.date) + "; })"); // the admin removes one Saturday
body = plain(g.editorDates(g.SR.e)); assert.strictEqual(body.body.show_run.length, 23, "the run goes whole, without it"); assert.ok(!body.body.show_run.some((s) => s.date === gone.date));
assert.deepStrictEqual(Object.keys(body.body), ["show_run"], "no begin, end, show days or run_dates: the API sets them");
$("sr-undo").fire("click"); assert.strictEqual(g.SR.shows.length, 0, "Undo: the Show Run before the fill"); assert.strictEqual($("sr-undo").hidden, true);
// a manual change after a fill ends the Undo
$("sr-fill").fire("click"); assert.strictEqual($("sr-undo").hidden, false); g.srDayClick(D(2)); assert.strictEqual($("sr-undo").hidden, true, "after a hand edit, Undo would lose it: it goes");
// Fill refuses what it can't do
open(ev0({ schedule: sched({ weekly_from: "" }) }));
$("sr-fill").fire("click"); assert.match($("sr-msg").textContent, /Choose the days of the week/);
g.setShowDays("ed-pat", { mon: ["20:00"], tue: ["20:00"], wed: ["20:00"], thu: ["20:00"], fri: ["20:00"], sat: ["20:00"], sun: ["20:00"] }, {});
$("sr-pat-from").value = ""; $("sr-fill").fire("click"); assert.match($("sr-msg").textContent, /first and the last date/);
$("sr-pat-from").value = D(9); $("sr-pat-to").value = D(2); $("sr-fill").fire("click"); assert.match($("sr-msg").textContent, /last date is before the first/);
$("sr-pat-from").value = iso(1); $("sr-pat-to").value = iso(600); $("sr-fill").fire("click");
assert.match($("sr-msg").textContent, /up to 500 shows\. This would make 600\.$/, "past 500 shows: refused"); assert.strictEqual(g.SR.shows.length, 0, "and nothing changes");
$("sr-pat-to").value = iso(500); $("sr-fill").fire("click"); assert.strictEqual(g.SR.shows.length, 500, "500 is fine"); assert.strictEqual($("sr-msg").textContent, "");
assert.strictEqual(g.editorDates(g.SR.e).body.show_run.length, 500);

// 13. what is saved, by mode
open(ev0());
assert.deepStrictEqual(plain(g.editorDates(g.SR.e)), { body: {} }, "an untouched Show Run sends nothing");
open(ev0({ begin_date: "2030-01-01", end_date: "2030-06-01" }));
assert.deepStrictEqual(plain(g.editorDates(g.SR.e)), { body: {} }, "a range event with no shows, untouched, keeps its dates");
g.srDayClick(iso(3));
body = plain(g.editorDates(g.SR.e)).body; assert.deepStrictEqual(Object.keys(body), ["show_run"]); assert.strictEqual(body.show_run.length, 1);
// an error names the day
set("SR.shows[0].time = '21:00'; SR.shows[0].end_time = '20:00'");
let err = plain(g.editorDates(g.SR.e)); assert.match(err.error, /ends before it starts/); assert.strictEqual(err.date, iso(3));
// emptied: begin and end are cleared
const had = [S(iso(1)), S(iso(2))];
open(ev0({ begin_date: iso(1), end_date: iso(2), show_run: had, schedule: sched({ dates: had, dates_from: "event" }) }));
g.srDayClick(iso(1)); $("sr-none").fire("click"); g.srDayClick(iso(2)); $("sr-none").fire("click");
assert.deepStrictEqual(plain(g.editorDates(g.SR.e).body), { show_run: [], begin_date: null, end_date: null }, "no shows: Dates not posted");
assert.match(note(g.SR.e, g.SR.before, g.SR.shows, false), /No shows: saving lists it as Dates not posted/);
// found-only dates, unchanged, send nothing; the notice says what changing them does
const fnd = [S(iso(1)), S(iso(2))];
open(ev0({ begin_date: iso(1), end_date: iso(40), show_run: fnd, schedule: sched({ dates: fnd, dates_from: "found", weekly: WEEKLY, weekly_from: "venue" }) }));
assert.strictEqual(g.SR.found, true); assert.deepStrictEqual(plain(g.editorDates(g.SR.e).body), {}); assert.match($("sr-notes").innerHTML, /came from the venue&#39;s website|came from the venue's website/);
// an open run that was a Show Run: the run goes, with the open run's own fields
open(ev0({ begin_date: iso(1), end_date: iso(2), show_run: had, schedule: sched({ dates: had, dates_from: "event", weekly: {}, weekly_from: "venue" }) }));
g.document.activeElement = $("ed-sr-open"); $("ed-sr-open").checked = true; $("ed-sr-open").fire("change");
assert.strictEqual(g.ED_MODE, "open"); assert.strictEqual($("ed-end").value, ""); assert.strictEqual(FOCUS, "ed-begin", "Opens comes next");
assert.ok(shown("ed-range") && shown("ed-sched") && !shown("ed-showrun"));
$("ed-begin").value = iso(1);
body = plain(g.editorDates(g.SR.e)); assert.deepStrictEqual(body.body, { show_run: [], begin_date: iso(1), end_date: null, open_run: true, weekly: {}, weeks: {} }, "switching to an open run: the run, the open run, Opens and the show days");
g.document.activeElement = $("ed-open-run"); $("ed-open-run").checked = false; $("ed-open-run").fire("change"); assert.strictEqual(g.ED_MODE, "showrun", "unticking goes back to the Show Run");
assert.strictEqual(FOCUS, "ed-sr-open", "and the focus goes to the box that is still there");
assert.deepStrictEqual(plain(g.editorDates(g.SR.e).body), {}, "and sends nothing");
// an event that was already an open run isn't touched
open(ev0({ open_run: true, begin_date: iso(0), schedule: sched({ weekly: WEEKLY, weekly_from: "event" }) }));
assert.deepStrictEqual(plain(g.editorDates(g.SR.e)), { body: {} });
$("ed-begin").value = iso(3); assert.deepStrictEqual(plain(g.editorDates(g.SR.e).body), { begin_date: iso(3) });
// an exhibition: Opens and Closes, as before; the closing date can't come before the opening date
open(ev0({ category: "Visual Art", begin_date: iso(1), end_date: iso(9) }));
assert.deepStrictEqual(plain(g.editorDates(g.SR.e)), { body: {} });
$("ed-end").value = iso(12); assert.deepStrictEqual(plain(g.editorDates(g.SR.e).body), { end_date: iso(12) });
$("ed-end").value = iso(0); assert.strictEqual(g.editorDates(g.SR.e).id, "ed-end");
// a talk that stops being "on chosen dates": its run is removed, and the range it asks for is set
open(ev0({ category: "Visual Art", begin_date: iso(2), end_date: iso(9), show_run: [S(iso(2)), S(iso(9))], schedule: sched({ dates, dates_from: "event" }) }));
RADIOS['input[name="ed-runkind"]:checked'] = { checked: true, value: "range" }; g.srRunKindChanged();
$("ed-begin").value = iso(2); $("ed-end").value = iso(30);
assert.deepStrictEqual(plain(g.editorDates(g.SR.e).body), { show_run: [], begin_date: iso(2), end_date: iso(30), open_run: false });
// Opens and Closes are never sent in a Show Run mode, whatever they hold
open(ev0({ begin_date: iso(1), end_date: iso(2), show_run: had, schedule: sched({ dates: had, dates_from: "event" }) }));
$("ed-begin").value = "2020-01-01"; assert.deepStrictEqual(plain(g.editorDates(g.SR.e).body), {});

// 14. the page: roles, labels, styles and names
const html = read("index.html"), css = read("css/site.css");
const showrun = read("js/showrun.js");
const fs0 = html.slice(html.indexOf('id="ed-showrun"'), html.indexOf("</fieldset>", html.indexOf('id="ed-showrun"')));
has(fs0, '<legend>Show Run</legend>'); has(fs0, '<table class="sr-grid" id="sr-grid" role="grid" aria-labelledby="sr-month-h">', "a grid with a name");
assert.strictEqual((fs0.match(/<th scope="col" abbr="/g) || []).length, 7, "seven column headings, Monday first"); assert.ok(fs0.indexOf('abbr="Monday"') < fs0.indexOf('abbr="Sunday"'));
has(fs0, 'id="sr-prev" aria-label="Previous month"'); has(fs0, 'id="sr-next" aria-label="Next month"');
has(fs0, '<div class="sr-panel" id="sr-panel" role="group" aria-labelledby="sr-panel-h" hidden>'); has(fs0, 'Add another show'); has(fs0, 'No show this day'); has(fs0, '<summary>Fill a pattern</summary>');
has(fs0, 'id="ed-pat-days"'); has(fs0, 'id="ed-pat-weekly"'); has(fs0, 'for="sr-pat-from">Start date</label>'); has(fs0, 'for="sr-pat-to">End date</label>');
has(fs0, "Open run: every week, no closing date"); has(fs0, 'id="sr-msg" role="alert"');
has(html, '<p class="sr-only" id="edit-live" role="status"></p>', "announcements go to the page's live region");
has(html, '<div class="field" id="ed-end-field"><label for="ed-end">Closes</label>', "Closes can hide");
assert.ok(html.indexOf('js/hours.js') < html.indexOf('js/showrun.js') && html.indexOf('js/showrun.js') < html.indexOf('js/found.js'), "showrun.js loads after hours.js, before found.js");
const block = css.slice(css.indexOf("/* CC-301 Show Run"), css.indexOf("/* CC-126: the invite QR code fills the screen")); // before the QR screen, which keeps to paper-white (test_invite.js)
assert.ok(block.length > 500, "the CC-301 block is in site.css");
assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(block) && !/rgb\(|hsl\(/.test(block), "theme tokens only: no colour of its own");
has(block, "min-height: 56px"); has(block, "min-width: 44px"); has(block, "@media (max-width: 480px)"); has(block, ".sr-day:focus-visible { outline: 3px solid var(--focus)", "a focus ring");
assert.ok(/\.sr-nav \.btn|\.editor \.sr-nav \.btn/.test(block) && /\.sr-pattern > summary \{[^}]*min-height: 44px/.test(block), "the buttons and the Fill summary are 44px high");
assert.ok(/\.sr-day \.sr-t \{ display: none; \}/.test(block), "a phone cell drops the times for a dot");
// the keyboard handling is in place: Escape, roving tabindex, arrows
has(showrun, 'ev.key === "Escape" && SR.day'); has(showrun, "ev.preventDefault(); ev.stopPropagation(); SR.eatCancel");
has(showrun, '(iso === SR.focus ? 0 : -1)', "the tab stop is SR.focus");
// the editor never sends the legacy run_dates
const admin = read("js/admin.js"), sub = admin.slice(admin.indexOf('$("edit-form").addEventListener("submit"'), admin.indexOf("function saveEvent"));
const code = (src) => src.replace(/\/\/.*$/gm, ""); // comments may say the word
assert.ok(!code(sub).includes("run_dates"), "the edit form never sends run_dates");
assert.ok(!code(showrun).includes("run_dates"), "nor does showrun.js");
// names: nothing in showrun.js is also declared in another script (they share one global scope)
const top = (src) => [...src.matchAll(/^(?:function|var|const|let)\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
const mine = top(showrun), others = {};
fs.readdirSync(path.join(PUB, "js")).filter((f) => f.endsWith(".js") && f !== "showrun.js").forEach((f) => top(read("js/" + f)).forEach((n) => (others[n] = f)));
mine.forEach((n) => assert.ok(!others[n], n + " is also declared in " + others[n]));
assert.strictEqual(new Set(mine).size, mine.length, "no name twice in showrun.js");

console.log("ok: the Show Run in the edit form (CC-301)");
