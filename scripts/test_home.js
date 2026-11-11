// Checks run in CI before the site deploys (CC-143): the home front page in public/js/catalog.js.
// The admin's picks follow the data rule ("going", then "interested", soonest first, at most 10), a card's deck is built from
// data, it's one link on its category field, and Last chance items say when they close.
//
//     node scripts/test_home.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const JS = path.join(__dirname, "..", "public", "js");
const read = (f) => fs.readFileSync(path.join(JS, f), "utf8");
// catalog.js and crews.js do a lot at load, so only the functions the front page uses are taken from them
const from = (file, names) => names.map((n) => read(file).match(new RegExp("function " + n + "\\([\\s\\S]*?\\n}\\n"))[0]).join("");

function stub() {
  return new Proxy(function () {}, {
    get: (t, k) => (k === Symbol.toPrimitive ? () => "" : stub()),
    set: () => true,
    apply: () => stub(),
  });
}
const g = {
  window: { devicePixelRatio: 1, matchMedia: () => stub(), addEventListener() {} },
  matchMedia: () => stub(),
  document: stub(), localStorage: stub(), location: stub(), history: stub(), navigator: stub(),
  Intl, URL, console,
};
vm.createContext(g);
vm.runInContext("var LEADS_MAX = 10, AUTH = { user: null }; function $(id) { return document; }", g);
vm.runInContext(read("util.js"), g);
vm.runInContext(read("water.js"), g);
vm.runInContext(from("crews.js", ["initials", "crewTone"]), g);
vm.runInContext(read("listings.js"), g);
vm.runInContext(from("catalog.js", ["leadNext", "leadPicks", "leadDeck", "leadHTML", "lastWhen", "lastHTML"]), g);

const iso = (d) => g.isoDate(d);
let n = 0;
function ev(over) {
  n += 1;
  return g.fromApi(Object.assign({
    id: n, source_id: null, title: "Event " + n, category: "Theater", begin_date: iso(g.add(g.T, -10)), end_date: iso(g.add(g.T, 20)),
    open_run: false, cost_text: "$28–$98", min_price: 28, url: "https://example.com",
    venue: { id: 1, name: "Biograph Theater", neighborhood: "Lincoln Park", area: "city", region: "north" },
  }, over));
}
const going = (days, over) => ev(Object.assign({ pick: { status: "going", date: days === null ? null : iso(g.add(g.T, days)), by: "Andrew" } }, over));
const interested = (over) => ev(Object.assign({ pick: { status: "interested", date: null, by: "Andrew" } }, over));

// --- the data rule (CC-238: the admin's picks, in order, at most 10) ---
const ids = (list) => Array.from(list, (e) => e.id);
const soon = going(3), later = going(9), gone = going(-2);
assert.deepStrictEqual(ids(g.leadPicks([later, gone, soon], [])), [soon.id, later.id], "soonest day they're going first; a day already past doesn't count");
const undated = going(null, { begin_date: iso(g.add(g.T, 5)) });
assert.deepStrictEqual(ids(g.leadPicks([undated, later], [])), [undated.id, later.id], "going with no day: the day it next plays stands in");
const nextWeek = interested({ begin_date: iso(g.add(g.T, 7)) }), running = interested({});
assert.deepStrictEqual(ids(g.leadPicks([gone], [nextWeek, running])), [running.id, nextWeek.id], "interested: running now beats opening later");
assert.deepStrictEqual(ids(g.leadPicks([later], [running])), [later.id, running.id], "going comes first, even when an interested one is sooner");
const closed = interested({ begin_date: iso(g.add(g.T, -30)), end_date: iso(g.add(g.T, -1)) });
assert.strictEqual(g.leadPicks([], [closed]).length, 0, "a closed run is never recommended");
assert.strictEqual(g.leadPicks([], []).length, 0, "neither: no picks");
assert.strictEqual(g.leadPicks([ev({})], [ev({})]).length, 0, "only events the admin picked");
const many = Array.from({ length: 12 }, (_, i) => going(i + 1));
assert.deepStrictEqual(ids(g.leadPicks(many, [running])), ids(many.slice(0, 10)), "at most 10, and the soonest ones");

// --- the deck ---
const run = going(3, { begin_date: iso(g.add(g.T, 2)), end_date: iso(g.add(g.T, 40)),
  crew_plans: [{ crew_id: 1, crew_name: "A", going: ["Maya Chen", "Ben King"], interested: ["Tess Ell"], been: [] },
    { crew_id: 2, crew_name: "B", going: ["Jo Park"], interested: ["Maya Chen"], been: ["Lee Fox"] }] });
assert.match(g.leadDeck(run), /^At Biograph Theater in Lincoln Park, \w{3} \d+ to \w{3} \d+/, "signed out: where, then the run");
g.AUTH.user = { id: 7, dolphins: false };
assert.strictEqual(g.leadDeck(run), "At Biograph Theater in Lincoln Park. 3 from your crew are going, and 1 is interested.",
  "signed in: names count once, going wins over interested, been doesn't count");
const one = interested({ begin_date: iso(g.add(g.T, 4)), end_date: iso(g.add(g.T, 4)), venue: { id: 2, name: "Symphony Center", neighborhood: "", area: "city", region: "downtown" },
  crew_plans: [{ crew_id: 1, crew_name: "A", going: [], interested: ["Maya Chen"], been: [] }] });
assert.strictEqual(g.leadDeck(one), "At Symphony Center. 1 from your crew is interested.");
one.crewPlans = [];
assert.match(g.leadDeck(one), /^At Symphony Center on \w{3}, \w{3} \d+\.$/, "one night, no crew-mates");
g.AUTH.user = null;

// --- the lead pick's markup ---
const html = g.leadHTML(run);
assert.ok(html.startsWith('<a class="lead-pick cat-theater" href="#e/' + run.id + '" data-ev-open="' + run.id + '"'), "the whole card is one link to the event");
assert.strictEqual((html.match(/<a /g) || []).length, 1);
assert.ok(!/<button|<input/.test(html), "no controls inside the link");
assert.match(html, /<span class="lead-sea water-field cat-theater"><canvas class="water" aria-hidden="true" data-water="poster"/, "the water sits in its own patch, above the words");
assert.doesNotMatch(html, /listing-image/, "no photo: the water alone");
// CC-253: a catalog card, with the event's photo over its water
const shot = g.leadHTML(interested({ image_url: "https://example.com/a.webp" }));
assert.match(shot, /<span class="lead-sea water-field cat-theater"><canvas class="water"[^>]*><\/canvas><img class="listing-image" src="https:\/\/example\.com\/a\.webp"[^>]*><\/span><span class="lead-in">/);
assert.doesNotMatch(g.leadHTML(interested({ image_url: "http://elsewhere.example/a.webp" })), /listing-image/, "only https or the site's own");
assert.match(html, /<span class="lead-k">Yours Truly · Theater<\/span><h2 class="lead-t">Event \d+<\/h2>/);
assert.match(html, /class="mark mark-host" role="img" aria-label="Andrew is committed to seeing this on \w+day, \w+ \d+\."/);
assert.match(html, /<span>Going \w{3}, \w{3} \d+ · \w{3} \d+ – \w{3} \d+ · \$28–\$98<\/span>/);
const fallback = g.leadHTML(interested({ title: "A <b>" }));
assert.match(fallback, /<h2 class="lead-t">A &lt;b&gt;<\/h2>/, "titles are escaped");
assert.match(fallback, /<span>Interested · /);
assert.match(fallback, /class="mark mark-host-int" role="img"/, "CC-162: interested: the dolphin without the ring");

// --- Last chance ---
assert.strictEqual(g.lastWhen(ev({ end_date: iso(g.T) })), "Today only!");
assert.match(g.lastWhen(ev({ end_date: iso(g.add(g.T, 3)) })), /^Closes \w+day$/);
assert.match(g.lastWhen(ev({ end_date: iso(g.add(g.T, 9)) })), /^Closes \w{3} \d+/);
assert.strictEqual(g.lastWhen(ev({ end_date: null, open_run: true })), "Open run");
const last = g.lastHTML(ev({ end_date: iso(g.T), cost_text: "Free", min_price: 0 }));
assert.match(last, /^<li><a class="last" href="#e\/\d+" data-ev-open="\d+"><span class="last-w">Today only!<\/span><span class="last-t">Event \d+<\/span><span class="last-where">Biograph Theater · Lincoln Park · Free<\/span><\/a><\/li>$/);
assert.ok(!/data-listing/.test(last), "not a row: account.js mustn't swap it for one");

console.log("home: ok");
