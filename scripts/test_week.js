// Checks run in CI before the site deploys (CC-146): My week in Lakefront, in public/js/account.js.
// One line a day in listings style: plans as event rows with Change plan and Tell a crew, an empty day as one
// "Find something →" line; Still deciding beside it with Pick a day and I've been; the journal (its own page at
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
  Intl, console,
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
has(link, 'class="mark mark-going" role="img" aria-label="You&#39;re going"', "the ink dolphin");
lacks(link, "<button", "no buttons inside a link");
has(row, ">Change plan</button>"); has(row, ">Tell a crew</button>");
lacks(row, "Pick a day"); lacks(row, "I've been", "not before the day");
has(row, 'class="myplan"', "the picker is there to open");

// --- Still deciding: Pick a day and I've been, the lake dolphin; a closed event can only change its plan ---
const maybe = ev({ title: "Matt & Ben" });
plan(maybe, "interested");
html = g.weekRowHTML(maybe);
has(html, ">Pick a day</button>"); has(html, "I've been</button>"); has(html, ">Tell a crew</button>");
has(html, 'class="mark mark-int" role="img" aria-label="You&#39;re interested"', "the lake dolphin");
has(html, "Matt &amp; Ben", "escaped");
const closed = ev({ begin_date: iso(g.add(g.T, -20)), end_date: iso(g.add(g.T, -2)) });
plan(closed, "interested");
has(g.weekRowHTML(closed), ">Change plan</button>", "no day left to pick");
set("AUTH.user.dolphins = true;");
lacks(g.weekRowHTML(maybe).match(/<a class="wk-row-a"[\s\S]*?<\/a>/)[0], "mark-int", "an owner's own plan is their ring");
set("AUTH.user.dolphins = false; CREWS = [];");
lacks(g.weekRowHTML(maybe), "Tell a crew", "no crews, nobody to tell");
set("CREWS = [{ id: 7, name: 'Thursday Theater' }];");

// --- CC-160: Withdraw interest on an interested plan, with Undo at the top of Still deciding ---
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
has(html, "Share publicly", "CC-112 stays"); has(html, "Add a photo"); has(html, "I've been</button>");
has(html, 'data-journal-error', "a band for errors");
has(html, ">Close</button>");
lacks(html, 'class="pill', "no pills");
has(g.journalEntryHTML(fresh, false), "No three words yet.");
set("WENT_PHOTO[" + JSON.stringify(fresh.id) + "] = { status: 'waiting', url: '/p/1.jpg' };");
html = g.journalEntryHTML(fresh, true);
has(html, '<img class="journal-thumb" src="/p/1.jpg" alt="">', "your photo on the tile");
has(html, "<figcaption>Waiting for approval</figcaption>", "its state in words");

console.log("ok: My week (CC-146, CC-160)");
