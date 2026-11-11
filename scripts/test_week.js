// Checks run in CI before the site deploys (CC-146): My week in Lakefront, in public/js/account.js.
// One line a day in listings style: plans as event rows with Change plan and Tell a crew, an empty day as one
// "Find something →" line; Events you're interested in beside it with Pick a day and I've been; the journal (its own page at
// #journal since CC-159) with only the entry being written open, a finished one folded to its three words; errors say "Check this:".
//
//     node scripts/test_week.js
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
  Intl, URL, console,
};
vm.createContext(g);
vm.runInContext("var AUTH = { user: null }, MYPLANS = {}, API = ''; function $(id) { return document; }", g);
["util.js", "water.js", "listings.js", "planner.js", "account.js", "crews.js", "photos.js"].forEach((f) => vm.runInContext(read(f), g));
const set = (code) => vm.runInContext(code, g);
set("AUTH.user = { id: 'u1', display_name: 'Yours Truly', role: 'user' }; CREWS = [{ id: 7, name: 'Thursday Theater' }];");

const iso = (d) => g.isoDate(d);
let n = 0;
function ev(over) {
  n += 1;
  return g.toEvent(Object.assign({
    id: n, source_id: null, title: "Event " + n, category: "Theater", begin_date: iso(g.add(g.T, -3)), end_date: iso(g.add(g.T, 20)),
    open_run: false, cost_text: "$20", min_price: 20, url: "https://example.com",
    venue: { id: 1, name: "A Red Orchid Theatre", neighborhood: "Old Town", area: "city", region: "north" },
  }, over));
}
const has = (html, s, msg) => assert.ok(html.includes(s), msg || "has " + s);
const lacks = (html, s, msg) => assert.ok(!html.includes(s), msg || "lacks " + s);
const plan = (e, status, date) => set("MYPLANS[" + JSON.stringify(e.id) + "] = " + JSON.stringify({ status: status, date: date || null, crews: [] }) + ";");

// --- a day: its name, then "Nothing yet…" and Find something on the same line, its list under it (CC-131) ---
let html = g.weekDayHTML({ d: g.T, items: [] });
has(html, '<h3 class="wk-day-t">Today, ' + g.listingDay(g.T) + "</h3>", "today says so, in listings style");
has(html, '<span class="wk-none">Nothing yet…</span>');
has(html, 'class="week-tbtn day-find" data-find-day="' + iso(g.T) + '"', "one Find something line");
has(html, 'class="day-found" id="find-' + iso(g.T) + '" aria-live="polite" hidden>', "its list waits, closed, under the line");
lacks(html, "wk-rows");
set("FIND_DAY_OPEN[" + JSON.stringify(iso(g.T)) + "] = true; FIND_DAY[" + JSON.stringify(iso(g.T)) + "] = { loading: false, items: [] };");
has(g.weekDayHTML({ d: g.T, items: [] }), "Nothing on the list for that day.", "an open list stays open when the week redraws");
set("FIND_DAY[" + JSON.stringify(iso(g.T)) + "] = { loading: false, error: true, items: [] };");
has(g.weekDayHTML({ d: g.T, items: [] }), '<p class="week-error">Check this: the events couldn’t be loaded.', "errors are a band that says Check this:");

// --- CC-156: an open day's three kinds; pressing one shows only it, one day at a time ---
const fd = iso(g.add(g.T, 1)), other = iso(g.add(g.T, 3)), K = (t) => "data-day-kind=\"" + t + "\" data-day=\"" + fd + "\" aria-pressed=\"";
const play = ev({ title: "Play One" }), tune = ev({ title: "Tune One", category: "Music" });
set("FIND_DAY_OPEN[" + JSON.stringify(fd) + "] = true; FIND_DAY[" + JSON.stringify(fd) + "] = { loading: false, items: [] };");
g.FIND_DAY[fd].items = [play, tune];
html = g.dayFoundHTML(fd);
has(html, 'class="week-steps day-kinds" role="group" aria-label="Show only"', "the buttons are a labelled group");
["Theater", "Music", "Visual Art"].forEach((t) => has(html, K(t) + 'false">' + t + "</button>", t + " is there, not pressed"));
has(html, 'class="week-step day-kind cat-music"', "in the kind's colour");
has(html, "Play One"); has(html, "Tune One");
g.setDayKind(fd, "Music");
html = g.dayFoundHTML(fd);
has(html, K("Music") + 'true">', "Music is pressed"); has(html, K("Theater") + 'false">');
has(html, "Tune One"); lacks(html, "Play One", "only Music");
g.setDayKind(fd, "Visual Art");
html = g.dayFoundHTML(fd);
has(html, "No Visual Art on the list for that day.", "an empty kind says so");
has(html, 'data-day-kind="" data-day="' + fd + '">Show all 2</button>', "and offers them all");
has(html, K("Visual Art") + 'true">', "the buttons stay, to pick another");
assert.strictEqual(g.dayKindOf(other), "", "another day isn't filtered");
g.setDayKind(other, "");
assert.strictEqual(g.dayKindOf(fd), "", "opening another day clears the choice");
has(g.dayFoundHTML(fd), "Play One");
g.FIND_DAY[fd].items = [play].concat([1, 2, 3, 4, 5, 6].map((i) => ev({ title: "Tune " + i, category: "Music" })));
g.setDayKind(fd, "Music");
html = g.dayFoundHTML(fd);
has(html, 'data-find-catalog="' + fd + '" data-find-kind="Music"', "more for the day in the catalog, with that kind");
lacks(html, "Play One");
g.setDayKind(fd, "");
g.FIND_DAY[fd].items = [];
lacks(g.dayFoundHTML(fd), "day-kinds", "no buttons on a day with nothing");
set("delete FIND_DAY_OPEN[" + JSON.stringify(fd) + "];");

// --- a planned day: event rows with Change plan and Tell a crew ---
const going = ev({ title: "Heroes of the Fourth Turning" }), day = g.add(g.T, 2);
plan(going, "going", iso(day));
html = g.weekDayHTML({ d: day, items: [going] });
lacks(html, "Nothing yet"); lacks(html, "data-find-day");
has(html, '<h3 class="wk-day-t">' + g.listingDay(day) + "</h3>");
const row = html.match(/<li class="wk-row"[\s\S]*<\/li>/)[0];
const link = row.match(/<a class="wk-row-a"[\s\S]*?<\/a>/)[0];
has(link, 'href="#e/' + going.id + '" data-ev-open="' + going.id + '"', "the row opens the event page");
has(link, '<span class="tile water-field cat-theater">', "with its tile");
has(link, '<span class="listing-t">Heroes of the Fourth Turning</span>');
lacks(link, "listing-image", "no photo: the water");
lacks(link, "mark mark-", "CC-162: no dolphin for your own plan; the day says it");
lacks(link, "<button", "no buttons inside a link");
has(row, ">Change plan</button>"); has(row, ">Tell a crew</button>");
lacks(row, "Pick a day"); lacks(row, "I've been", "not before the day");
has(row, 'class="myplan"', "the picker is there to open");

// --- Events you're interested in: Pick a day and I've been; a closed event can only change its plan ---
const maybe = ev({ title: "Matt & Ben" });
plan(maybe, "interested");
html = g.weekRowHTML(maybe);
has(html, ">Pick a day</button>"); has(html, "I've been</button>"); has(html, ">Tell a crew</button>");
lacks(html.match(/<a class="wk-row-a"[\s\S]*?<\/a>/)[0], "mark mark-", "CC-162: no dolphin for your own interest");
has(html, '<span class="wk-when"><span>', "the date in words");
has(html, "Matt &amp; Ben", "escaped");
const closed = ev({ begin_date: iso(g.add(g.T, -20)), end_date: iso(g.add(g.T, -2)) });
plan(closed, "interested");
has(g.weekRowHTML(closed), ">Change plan</button>", "no day left to pick");
// CC-162: the admin's pick on a row: the ink dolphin when they're interested, the gold ring when they're going
const picked = ev({ pick: { status: "interested", date: null, by: "Yours truly" } });
plan(picked, "interested");
has(g.weekRowHTML(picked), 'class="mark mark-host-int" role="img" aria-label="Yours truly is interested in this one."', "the ink dolphin");
picked.pick = { status: "going", date: null, by: "Yours truly" };
has(g.weekRowHTML(picked), 'class="mark mark-host" role="img" aria-label="Yours truly is committed to seeing this."', "the gold ring");
set("CREWS = [];");
lacks(g.weekRowHTML(maybe), "Tell a crew", "no crews, nobody to tell");
set("CREWS = [{ id: 7, name: 'Thursday Theater' }];");

// --- CC-260: Pick a day offers only days you can go: a fixed run's dates, else the event's show days, else its venue's
// hours by the venue's category, else any day of the run; a week with none says so and offers the next ---
const DOW = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const week = [0, 1, 2, 3, 4, 5, 6].map((i) => g.add(g.T, i)); // the week My week shows first
const ok = (e) => week.filter((d) => g.canGoOn(e, d)).map(iso);
const sched = (over) => Object.assign({ dates: [], weekly: {}, weekly_from: "", weeks: {}, hours: {} }, over);
const venue = (category) => ({ id: 2, name: "Lakeside Hall", neighborhood: "Old Town", area: "city", region: "north", category: category });
// 1. a fixed run: its dates only, even where the venue has show times
const run = ev({ schedule: sched({ dates: [{ date: iso(week[2]), time: "19:30" }, { date: iso(week[5]), time: null }],
  weekly: { [DOW[week[0].getDay()]]: ["19:30"] }, weekly_from: "venue" }), venue: venue("Theater"),
  run_dates: [{ date: iso(week[2]), time: "19:30" }, { date: iso(week[5]), time: null }] });
assert.deepStrictEqual(ok(run), [iso(week[2]), iso(week[5])], "a fixed run: its listed dates");
const listed = ev({ end_date: iso(g.add(g.T, 20)), schedule: sched({ dates: [{ date: iso(week[2]), time: "19:30" }], weekly: { [DOW[week[0].getDay()]]: ["19:30"] }, weekly_from: "venue" }),
  venue: venue("Theater") });
assert.deepStrictEqual(ok(listed), [iso(week[2])], "dates read from the venue's site: only those, up to the last of them");
assert.ok(g.canGoOn(listed, g.add(week[0], 7)), "after them, the venue's show times");
// 2. its own show days, by weekday (and not the venue's hours)
const own = ev({ schedule: sched({ weekly: { [DOW[week[1].getDay()]]: ["20:00"], [DOW[week[4].getDay()]]: ["14:00"] }, weekly_from: "event",
  hours: { [DOW[week[3].getDay()]]: ["10:00", "17:00"] } }), venue: venue("Visual Art") });
assert.deepStrictEqual(ok(own), [iso(week[1]), iso(week[4])], "its own show days");
// 3. the venue's: a theater by its show times, a gallery by its opening hours (Closed is out), no category by either
const venueShows = { [DOW[week[3].getDay()]]: ["19:30"] }, venueHours = { [DOW[week[0].getDay()]]: null, [DOW[week[6].getDay()]]: null };
const both = { weekly: venueShows, weekly_from: "venue", hours: venueHours };
assert.deepStrictEqual(ok(ev({ schedule: sched(both), venue: venue("Theater") })), [iso(week[3])], "a theater: its show times");
assert.deepStrictEqual(ok(ev({ schedule: sched(both), venue: venue("Music") })), [iso(week[3])], "a music venue: its show times");
assert.deepStrictEqual(ok(ev({ category: "Visual Art", schedule: sched(both), venue: venue("Visual Art") })), week.slice(1, 6).map(iso),
  "a gallery: the days it's open (a day not filled in counts as open)");
const boxOffice = Object.fromEntries(DOW.map((k) => [k, null])); boxOffice[DOW[week[1].getDay()]] = ["12:00", "18:00"];
assert.deepStrictEqual(ok(ev({ schedule: sched({ weekly: venueShows, weekly_from: "venue", hours: boxOffice }), venue: venue(null) })),
  [iso(week[1]), iso(week[3])], "no category: a day it's open, or a day with a show");
assert.deepStrictEqual(ok(ev({ schedule: sched({ hours: venueHours }), venue: venue(null) })), week.slice(1, 6).map(iso), "no category, hours only");
assert.deepStrictEqual(ok(ev({ schedule: sched({ hours: venueHours }), venue: venue("Theater") })), week.map(iso),
  "a theater with only opening hours: nothing known about its shows, so any day");
// 4. nothing known: every day of the run, from today (or its opening) to its closing
const open = ev({ begin_date: iso(week[2]), end_date: iso(week[4]) });
assert.deepStrictEqual(ok(open), [iso(week[2]), iso(week[3]), iso(week[4])], "nothing known: the run");
// the picker: a button a day, each saving that date; none this week says so, and offers the next one
plan(run, "interested");
html = g.weekRowHTML(run);
has(html, 'data-myplan-going="' + run.id + '" data-date="' + iso(week[2]) + '" aria-pressed="false">');
has(html, ">" + g.goingDay(iso(week[5])) + "</button>");
lacks(html, 'type="date"', "no date field to pick a day it isn't on");
lacks(html, 'data-date="' + iso(week[0]) + '"');
const later = ev({ schedule: sched({ dates: [{ date: iso(g.add(g.T, 16)), time: "19:30" }] }) });
plan(later, "interested");
html = g.weekRowHTML(later);
has(html, "No shows this week."); lacks(html, "data-myplan-going=\"" + later.id + "\" data-date");
has(html, 'data-pick-week="2">Next: ' + g.goingDay(iso(g.add(g.T, 16))) + " →</button>", "the next day that fits, in its week");
set("PLANNER_WEEK = 2;");
has(g.weekRowHTML(later), 'data-date="' + iso(g.add(g.T, 16)) + '"', "that week offers it");
set("PLANNER_WEEK = 0;");
const shut = ev({ category: "Visual Art", schedule: sched({ hours: Object.fromEntries(DOW.map((k) => [k, null])) }), venue: venue("Visual Art") });
plan(shut, "interested");
html = g.weekRowHTML(shut);
has(html, "Not open this week."); lacks(html, "Next:", "never open: nothing to skip to");
has(html, ">Pick a day</button>", "still a plan to change");

// CC-260: a card's Commit to: a drop-down of the days it's on; a run where any day will do keeps the date field
delete g.MYPLANS[run.id]; set("MYPLAN_SEQ = 0;");
html = g.myplanHTML(run);
has(html, '<select class="go-day" id="myplan-date-0"'); lacks(html, 'type="date"');
assert.deepStrictEqual([...html.matchAll(/<option value="([\d-]+)"/g)].map((m) => m[1]), [iso(week[2]), iso(week[5])], "a fixed run: its dates");
has(g.myplanHTML(open), '<input type="date"', "nothing known: every day, so the date field");

// --- CC-264: a day with two or more shows offers each; the plan keeps the show, and its lines say it ---
const two = ev({ title: "Matinee", schedule: sched({ weekly: { [DOW[week[2].getDay()]]: ["16:00", "11:00"], [DOW[week[4].getDay()]]: ["19:30"] }, weekly_from: "event" }) });
assert.deepStrictEqual(g.goTimes(two, iso(week[2])), ["11:00", "16:00"], "soonest first");
assert.deepStrictEqual(g.goTimes(two, iso(week[4])), ["19:30"]);
assert.strictEqual(g.goWhen(iso(week[2]), "16:00"), g.goingDay(iso(week[2])) + " · 4 PM");
plan(two, "interested");
html = g.weekRowHTML(two);
has(html, 'data-date="' + iso(week[2]) + '" data-time="11:00" aria-pressed="false">', "Pick a day: a button per show");
has(html, ">" + g.goingDay(iso(week[2])) + " · 4 PM</button>");
has(html, 'data-date="' + iso(week[4]) + '" aria-pressed="false">', "one show: one button, the day");
has(html, ">" + g.goingDay(iso(week[4])) + "</button>");
assert.strictEqual(g.goTimeFor(two.id, iso(week[4]), ""), "19:30", "one show: the plan keeps its time");
assert.strictEqual(g.goTimeFor(two.id, iso(week[2]), "16:00"), "16:00", "the show chosen");
assert.strictEqual(g.goTimeFor(open.id, iso(week[2]), ""), null, "no time listed: none");
delete g.MYPLANS[two.id]; set("MYPLAN_SEQ = 0;");
html = g.myplanHTML(two);
assert.deepStrictEqual([...html.matchAll(/<option value="([\dT:-]+)"/g)].map((m) => m[1]).slice(0, 3),
  [iso(week[2]) + "T11:00", iso(week[2]) + "T16:00", iso(week[4])], "a card's drop-down: each show of a day with two");
has(html, ">" + g.goingDay(iso(week[2])) + " · 11 AM</option>");
set("MYPLANS[" + JSON.stringify(two.id) + "] = " + JSON.stringify({ status: "going", date: iso(week[2]), time: "16:00", crews: [] }) + ";");
has(g.myplanHTML(two), '<option value="' + iso(week[2]) + 'T16:00" selected>', "your show chosen");
has(g.weekRowHTML(two, week[2]), "<span>4 PM</span>", "My week: the show you chose, not every show that day");
has(g.myplanHTML(two), "calendar.ics?date=" + iso(week[2]) + "&amp;time=16%3A00", "Add to calendar: that show");
assert.strictEqual(g.myplanSaid(g.MYPLANS[two.id]), "Going on " + g.dayName(week[2]) + " at 4 PM");
plan(two, "going", iso(week[4]));
lacks(g.myplanHTML(two), "&amp;time=", "no time saved: the calendar file takes the day's first show");
// a date field (any day will do) gets a Show drop-down on a day with two or more shows
const venueTwo = ev({ title: "Every night", schedule: sched({ weekly: Object.fromEntries(DOW.map((k) => [k, k === DOW[week[3].getDay()] ? ["14:00", "19:30"] : ["19:30"]])), weekly_from: "venue" }), venue: venue("Theater") });
assert.ok(g.goAnyDay(venueTwo), "open every day: a date field");
assert.strictEqual(g.goTimeFieldHTML(venueTwo, iso(week[1])), "", "one show: no Show drop-down");
html = g.goTimeFieldHTML(venueTwo, iso(week[3]), "19:30");
has(html, '<select class="go-time" aria-label="Show time for Every night">'); has(html, '<option value="19:30" selected>7:30 PM</option>');
has(g.goDayFieldHTML(venueTwo, 'id="x"', iso(week[3])), '<input type="date" id="x"'); has(g.goDayFieldHTML(venueTwo, 'id="x"', iso(week[3])), 'class="go-time"');
// a one-day run with two shows: Commit to each
const oneDay = ev({ title: "One day", begin_date: iso(week[2]), end_date: iso(week[2]), schedule: sched({ dates: [{ date: iso(week[2]), time: "11:00" }, { date: iso(week[2]), time: "16:00" }] }),
  run_dates: [{ date: iso(week[2]), time: "11:00" }, { date: iso(week[2]), time: "16:00" }] });
html = g.myplanHTML(oneDay);
has(html, 'data-time="11:00" aria-pressed="false">'); has(html, "Commit to " + g.goingDay(iso(week[2])) + " · 4 PM</button>");

// --- CC-160: Withdraw interest on an interested plan, with Undo at the top of Events you're interested in ---
has(g.weekRowHTML(maybe), 'class="went" data-plan-withdraw="' + maybe.id + '">Withdraw interest</button>', "a fourth option");
const past = ev({ title: "Past going" });
plan(past, "going", iso(g.add(g.T, -1)));
lacks(g.weekRowHTML(past), "data-plan-withdraw", "a going plan for a day that's passed couldn't be put back");
lacks(g.weekRowHTML(going, day), "data-plan-withdraw", "not in the week itself");
assert.strictEqual(g.withdrawnHTML(), "", "nothing withdrawn, no line");
set("WITHDRAWN = { id: " + JSON.stringify(maybe.id) + ", title: 'Matt & Ben', mine: { status: 'interested', date: null, crews: [7] } }; delete MYPLANS[" + JSON.stringify(maybe.id) + "];");
html = g.withdrawnHTML();
has(html, 'Withdrew your interest in <span class="week-undo-t">Matt &amp; Ben</span>.', "says what went, escaped");
has(html, 'id="deciding-undo-btn" data-plan-undo="' + maybe.id + '">Undo</button>', "Undo, right away");
lacks(html, "week-error");
set("WITHDRAWN.error = 'that event is no longer listed.';");
has(g.withdrawnHTML(), '<p class="week-error" role="alert">Check this: that event is no longer listed.</p>', "a failed Undo says Check this:");
plan(maybe, "interested");
assert.strictEqual(g.withdrawnHTML(), "", "marked again some other way: the line goes");
const css = fs.readFileSync(path.join(__dirname, "..", "public", "css", "site.css"), "utf8");
assert.ok(/\.wk-acts \.went \{[^}]*min-height: 44px/.test(css), "the option is at least 44px, like its row's other buttons");
assert.ok(/\.week-tbtn \{[^}]*min-height: 44px/.test(css), "Undo is at least 44px");

// --- the week range ---
assert.strictEqual(g.weekRangeText(new Date(g.T.getFullYear(), 9, 30), new Date(g.T.getFullYear(), 10, 5)), "Oct 30 – Nov 5");
assert.strictEqual(g.weekRangeText(new Date(g.T.getFullYear(), 10, 6), new Date(g.T.getFullYear(), 10, 12)), "Nov 6 – 12");

// --- the journal: only the entry being written is open; a finished one is its three words ---
const done = ev({ title: "Sarah Sipling: Solo Exhibition", category: "Visual Art" }), fresh = ev({ title: "Disney Worlds Collide" });
set("WENT_JOURNAL[" + JSON.stringify(done.id) + "] = { words: 'quiet generous exact', review: '', recommend: true };" +
  "WENT_JOURNAL[" + JSON.stringify(fresh.id) + "] = { words: '', review: '', recommend: false };" +
  "WENT[" + JSON.stringify(done.id) + "] = true; WENT[" + JSON.stringify(fresh.id) + "] = true; JOURNAL_OPEN = null;");
const shown = [done, fresh];
assert.strictEqual(g.journalOpenId(shown), fresh.id, "the newest without words opens");
set("JOURNAL_OPEN = " + JSON.stringify(done.id) + ";");
assert.strictEqual(g.journalOpenId(shown), done.id, "Edit opens that one instead");
set("JOURNAL_OPEN = '';");
assert.strictEqual(g.journalOpenId(shown), "", "Close folds them all");
html = g.journalEntryHTML(done, false);
has(html, '<p class="journal-words">Quiet. Generous. Exact.</p>', "three words as an italic deck");
has(html, "<span>Recommended</span>");
has(html, 'aria-expanded="false" aria-label="Edit your entry for Sarah Sipling: Solo Exhibition">Edit</button>');
lacks(html, "<form", "folded: no form");
html = g.journalEntryHTML(fresh, true);
assert.strictEqual((html.match(/name="word"/g) || []).length, 3, "three boxes");
has(html, '<label for="j-' + fresh.id + '-review">Your review (optional)</label>', "labelled fields");
has(html, "Would you recommend it?");
has(html, "Share publicly", "CC-112 stays"); has(html, "Add a photo");
// CC-263: on the journal, "I've been" is Delete entry: a delete, not a pressed toggle, and the same click (so the same confirmation)
has(html, '<button type="button" class="went" data-went="' + fresh.id + '" aria-label="Delete your entry for ' + g.esc(fresh.title) + '">Delete entry</button>');
lacks(html, "I've been", "not on the journal"); lacks(html, "✓", "no tick"); lacks(html, 'aria-pressed="true"', "not a pressed toggle");
has(g.wentHTML(fresh), "I've been</button>", "elsewhere it stays I've been"); has(g.wentHTML(fresh), 'aria-pressed="true"');
has(html, 'data-journal-error', "a band for errors");
has(html, ">Close</button>");
lacks(html, 'class="pill', "no pills");
has(g.journalEntryHTML(fresh, false), "No three words yet.");
// CC-263: Write reads Write an entry; its accessible name, and Edit and Close, stay
has(g.journalEntryHTML(fresh, false), 'aria-label="Write your entry for ' + g.esc(fresh.title) + '">Write an entry</button>');
set("WENT_PHOTO[" + JSON.stringify(fresh.id) + "] = { status: 'waiting', url: '/p/1.jpg' };");
html = g.journalEntryHTML(fresh, true);
has(html, '<img class="journal-thumb" src="/p/1.jpg" alt="">', "your photo on the tile");
// CC-253: the event's own photo sits on journal and week tiles; yours covers it
const shot = ev({ title: "Shot", image_url: "https://example.com/a.webp" });
assert.match(g.weekRowHTML(shot), /<img class="listing-image" src="https:\/\/example\.com\/a\.webp"[^>]*><span class="tile-k">/, "interested rows have the photo, with the category tag");
plan(shot, "going", iso(day));
has(g.weekDayHTML({ d: day, items: [shot] }), 'class="listing-image"', "and so do a day's rows");
// CC-261: committed rows in the week ahead go without the category tag
assert.doesNotMatch(g.weekDayHTML({ d: day, items: [shot] }), /tile-k/, "no category tag on a day's rows");
set("WENT_PHOTO[" + JSON.stringify(shot.id) + "] = { status: 'approved', url: '/p/2.jpg' };");
assert.match(g.journalEntryHTML(shot, false), /class="listing-image"[^>]*><span class="tile-k">[^<]*<\/span><img class="journal-thumb" src="\/p\/2\.jpg"/, "your photo goes over the event's");
has(html, "<figcaption>Waiting for approval</figcaption>", "its state in words");

// CC-261: an event that's over, or a going plan's day that's passed, drops out of the list unless you've been
const over = ev({ title: "Over", begin_date: iso(g.add(g.T, -20)), end_date: iso(g.add(g.T, -2)) });
const onNow = ev({ title: "On now" });
const wentTo = ev({ title: "Went", begin_date: iso(g.add(g.T, -20)), end_date: iso(g.add(g.T, -2)) });
const goneDay = ev({ title: "Gone day", begin_date: iso(g.add(g.T, -20)), end_date: iso(g.add(g.T, -2)) });
const ahead = ev({ title: "Ahead" });
set("MYPLANS = {}; WENT = {}; MYPLAN_LIST = [" + [over, onNow, wentTo, goneDay, ahead].map((e) => "KNOWN[" + JSON.stringify(e.id) + "]").join(", ") + "];");
[over, onNow, wentTo].forEach((e) => plan(e, "interested"));
plan(goneDay, "going", iso(g.add(g.T, -3)));
plan(ahead, "going", iso(g.add(g.T, 2)));
set("WENT[" + JSON.stringify(wentTo.id) + "] = true;");
assert.deepStrictEqual(Array.from(g.interestedList(), (e) => e.title), ["On now", "Went"],
  "over and not been, or a passed going day not been: gone; on now, or been: kept; a going day ahead: in the week");
set("WENT[" + JSON.stringify(goneDay.id) + "] = true;");
assert.deepStrictEqual(Array.from(g.interestedList(), (e) => e.title), ["On now", "Went", "Gone day"], "a passed going day you've been to stays");
// CC-261: "Still deciding" is now "Events you're interested in", in the heading, the deck and the live messages
const page = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
has(page, '<span id="deciding-title" tabindex="-1">Events you\'re interested in</span>', "the new heading");
has(page, "and the events you're interested in.</p>", "and the deck");
assert.ok(!/still deciding/i.test(page + read("account.js") + read("util.js")), "the old name is gone");
has(read("account.js"), "Undo is at the top of Events you\\u2019re interested in.", "Withdraw's live message");
has(read("account.js"), '"Back in Events you\\u2019re interested in: "', "and Undo's");

console.log("ok: My week (CC-146, CC-156, CC-160, CC-261)");
