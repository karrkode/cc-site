// Checks run in CI before the site deploys (CC-248): your own events in the Cultural journal and My week, in
// public/js/account.js. They mix in by date with the events you've been to, carry "Added by you" and no event link,
// ones still to come sit under "Coming up" and show in My week on their day; the form's category is one of the
// catalog's three, one of yours, or a new one.
//
//     node scripts/test_own_events.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const JS = path.join(__dirname, "..", "public", "js");
const read = (f) => fs.readFileSync(path.join(JS, f), "utf8");
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
set("AUTH.user = { id: 'u1', display_name: 'Yours Truly', role: 'user' };");
const has = (html, s, msg) => assert.ok(html.includes(s), msg || "has " + s);
const lacks = (html, s, msg) => assert.ok(!html.includes(s), msg || "lacks " + s);
const iso = (d) => g.isoDate(d);

function own(over) {
  return Object.assign({ id: 1, title: "Open mic", date: iso(g.T), venue: "Cole's", category: null, category_id: null, category_name: "",
    words: "", review: "", recommend: false, photo_url: "", created_at: "2026-11-10T12:00:00Z" }, over);
}
const yesterday = own({ id: 1, title: "Poetry slam", date: iso(g.add(g.T, -1)), words: "fierce funny brave", category_id: 4, category_name: "Spoken word" });
const longAgo = own({ id: 2, title: "Backyard show", date: iso(g.add(g.T, -40)) });
const soon = own({ id: 3, title: "Film night", date: iso(g.add(g.T, 2)), category: "Visual Art", category_name: "Visual Art" });
const later = own({ id: 4, title: "Gallery walk", date: iso(g.add(g.T, 9)) });
set("OWN_LIST = " + JSON.stringify([later, soon, yesterday, longAgo]) + "; OWN_CATS = [{ id: 4, name: 'Spoken word', events: 1 }]; OWN_STATE = 'ready';");

// a catalog event marked "I've been" ten days ago sits between yesterday's own event and the one 40 days ago
const ev = g.toEvent({ id: 77, source_id: null, title: "Hamlet", category: "Theater", begin_date: iso(g.add(g.T, -30)), end_date: iso(g.add(g.T, 20)),
  open_run: false, cost_text: "$20", min_price: 20, url: "https://example.com",
  venue: { id: 1, name: "A Red Orchid Theatre", neighborhood: "Old Town", area: "city", region: "north" } });
set("WENT_LIST = [KNOWN[77]]; WENT[77] = true; WENT_AT[77] = " + JSON.stringify(g.add(g.T, -10).toISOString()) + ";");
assert.ok(ev);

// --- the journal's lists: still to come (soonest first), then the latest five mixed by date ---
const items = g.journalItems();
assert.deepStrictEqual([...items.coming.map((o) => o.id)], [3, 4], "coming up, soonest first");
assert.deepStrictEqual([...items.past.map((x) => (x.went ? "went:" + x.went.id : "own:" + x.own.id))], ["own:1", "went:77", "own:2"], "mixed by date, latest first");
set("for (var i = 10; i < 16; i++) OWN_LIST.push(" + JSON.stringify(own({ title: "Old one" })) + "); OWN_LIST.slice(-6).forEach(function (o, i) { o.id = 10 + i; o.date = '2001-01-0' + (i + 1); });");
assert.strictEqual(g.journalItems().past.length, 5, "five at most, as before");
set("OWN_LIST = OWN_LIST.slice(0, 4);");

// --- a folded own entry: Added by you, no event link, its words as the deck, Edit ---
let html = g.ownEntryHTML(yesterday, false);
has(html, 'data-own="1"'); has(html, "<span>Added by you</span>"); has(html, "Spoken word", "its own category on the tile");
lacks(html, 'href="#e/', "no event page to link to");
has(html, '<p class="journal-words">Fierce. Funny. Brave.</p>');
has(html, 'data-own-open="1" aria-expanded="false"');
has(g.ownEntryHTML(longAgo, false), "No three words yet.");
has(g.ownEntryHTML(soon, false), "Coming up. Your three words can wait until you’ve been.");
has(g.ownEntryHTML(soon, false), "cat-", "a catalog category colours the tile");

// --- open: the form with every field, the words optional, the photo and Delete ---
html = g.ownEntryHTML(yesterday, true);
has(html, 'data-own-form="1"'); has(html, 'name="title"'); has(html, 'type="date"'); has(html, 'name="venue"');
has(html, '<option value="o:4" selected>Spoken word</option>', "your category chosen");
has(html, '<option value="c:Theater">Theater</option>'); has(html, '<option value="new">New category…</option>');
has(html, "Three words (optional for now)"); lacks(html, " required aria-label=\"Word", "the words aren't required");
has(html, 'value="fierce"'); has(html, "Only you can see this.");
has(html, 'class="btn ghost own-photo-btn" for="op-1">Add a photo</label>', "Add a photo is a button");
assert.ok(html.indexOf(">Add a photo<") < html.indexOf(">Save</button>"), "Add a photo sits left of Save");
has(html, 'data-own-delete="1"');
lacks(html, "Share publicly", "own events are never shared");
html = g.ownEntryHTML(own({ id: 5, photo_url: "/photos/own/5?exp=1&sig=x" }), true);
has(html, "Change photo"); has(html, 'data-own-photo-remove="5"'); has(html, 'src="/photos/own/5?exp=1&amp;sig=x"');

// --- Add an event: the bar, and the new form when it's open ---
set("OWN_OPEN = null;");
html = g.ownBarHTML();
has(html, 'data-own-open="new" aria-expanded="false">Add an event</button>'); lacks(html, 'data-own-form="new"');
set("OWN_OPEN = 'new';");
html = g.ownBarHTML();
has(html, 'data-own-form="new"'); has(html, ">Add it</button>"); has(html, "data-own-cancel");
assert.ok(html.indexOf(">Add a photo<") >= 0 && html.indexOf(">Add a photo<") < html.indexOf(">Add it</button>"), "a new event can take a photo, left of Add it");
has(html, 'value="' + iso(g.T) + '"', "the date starts as today");
set("OWN_OPEN = null; OWN_CATS_OPEN = true;");
html = g.ownBarHTML();
has(html, 'id="own-cats"'); has(html, 'value="Spoken word"'); has(html, "1 event"); has(html, 'data-own-cat-delete="4"');

// --- My week: an own event on its day, with the catalog plans ---
html = g.weekDayHTML({ d: g.add(g.T, 2), items: [], own: [soon] });
has(html, 'data-own-day="3"'); has(html, 'data-own-go="3"'); has(html, "Film night"); has(html, "Added by you");
lacks(html, "Nothing yet…", "a day with your own event isn't empty");
has(g.weekDayHTML({ d: g.add(g.T, 3), items: [], own: [] }), "Nothing yet…");
has(g.weekDayHTML({ d: g.add(g.T, 3), items: [] }), "Nothing yet…", "callers without own events still work");

console.log("test_own_events: all checks passed");
