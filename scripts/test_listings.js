// Checks run in CI before the site deploys (CC-140): listing rows in public/js/listings.js.
// Rows sit under the right day head for each sort; the whole row is one link with no buttons in it; the tile carries
// the event's water; the host's ring, your own dolphin and the crew line show only when they should.
//
//     node scripts/test_listings.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const JS = path.join(__dirname, "..", "public", "js");
const read = (f) => fs.readFileSync(path.join(JS, f), "utf8");
// crews.js does a lot at load, so only the two helpers rows use are taken from it
const crews = read("crews.js");
const helper = (name) => crews.match(new RegExp("function " + name + "\\([\\s\\S]*?\\n}\\n"))[0];

// Any element the scripts touch at load: every property is a no-op function or another stub
function stub() {
  return new Proxy(function () {}, {
    get: (t, k) => (k === Symbol.toPrimitive ? () => "" : stub()),
    set: () => true,
    apply: () => stub(),
  });
}

function load() {
  const sandbox = {
    window: { devicePixelRatio: 1, matchMedia: () => stub() },
    matchMedia: () => stub(),
    document: stub(), localStorage: stub(), location: stub(), history: stub(), navigator: stub(),
    Intl, console,
  };
  vm.createContext(sandbox);
  vm.runInContext("var AUTH = { user: null }; function $(id) { return document; }", sandbox);
  vm.runInContext(read("util.js"), sandbox);
  vm.runInContext(read("water.js"), sandbox);
  vm.runInContext(helper("initials") + helper("crewTone"), sandbox);
  vm.runInContext(read("listings.js"), sandbox);
  return sandbox;
}

const g = load();
const iso = (d) => g.isoDate(d);
let n = 0;
function ev(over) {
  n += 1;
  return g.fromApi(Object.assign({
    id: n, source_id: null, title: "Event " + n, category: "Theater", begin_date: iso(g.add(g.T, -10)), end_date: iso(g.add(g.T, 20)),
    open_run: false, cost_text: "$20–$40", min_price: 20, url: "https://example.com",
    venue: { id: 1, name: "Steppenwolf", neighborhood: "Lincoln Park", area: "city", region: "north" },
  }, over));
}
const sections = (html) => (html.match(/<section class="listing-day"/g) || []).length;
const heads = (html) => [...html.matchAll(/<h3 class="listing-day-head">([^<]*)<\/h3>/g)].map((m) => m[1]);

// --- heads ---
const fri = g.add(g.T, 3);
const opening = ev({ begin_date: iso(fri) });
assert.strictEqual(g.listingHead(opening, "opening"), "Opening " + new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric" }).format(fri) +
  (fri.getFullYear() === g.T.getFullYear() ? "" : ", " + fri.getFullYear()));
assert.strictEqual(g.listingHead(ev({}), "opening"), "On now", "already running");
assert.strictEqual(g.listingHead(ev({ begin_date: iso(g.T), end_date: iso(g.T) }), "opening"), "On now", "tonight only");
assert.strictEqual(g.listingHead(ev({ end_date: iso(g.T) }), "closing"), "Closes today");
assert.match(g.listingHead(ev({ end_date: iso(g.add(g.T, 2)) }), "closing"), /^Closing \w+day, \w{3} \d+/);
assert.strictEqual(g.listingHead(ev({ end_date: null, open_run: true }), "closing"), "Open run");
assert.strictEqual(g.listingHead(ev({}), "az"), "", "A to Z has no heads");
const far = new Date(g.T.getFullYear() + 1, 1, 3);
assert.match(g.listingHead(ev({ begin_date: iso(far), end_date: iso(g.add(far, 9)) }), "opening"), new RegExp(", " + far.getFullYear() + "$"), "next year says so");

// --- grouping: one head per run of events that share it ---
const list = [ev({ begin_date: iso(fri) }), ev({ begin_date: iso(fri) }), ev({ begin_date: iso(g.add(fri, 1)) }), ev({}), ev({})];
let html = g.listingsHTML(list, "opening");
assert.strictEqual(sections(html), 3);
assert.strictEqual(heads(html)[2], "On now");
assert.strictEqual((html.match(/<li>/g) || []).length, 5);
html = g.listingsHTML(list, "price");
assert.strictEqual(sections(html), 1, "no heads: one list");
assert.deepStrictEqual(heads(html), []);
assert.strictEqual(g.listingsHTML([], "opening"), "", "nothing to list");
assert.strictEqual(sections(g.listingGhostsHTML(3)), 1);
assert.match(g.listingGhostsHTML(3), /aria-hidden="true"/);

// --- a row, signed out ---
const art = ev({ title: "Dawoud Bey <Street>", category: "Visual Art", min_price: 0, cost_text: "Free", pick: { status: "going", date: null, by: "Andrew" },
  crew_plans: [{ crew_id: 1, crew_name: "Thursday Theater", going: ["Maya Chen"], interested: [], been: [] }] });
let row = g.listingHTML(art);
assert.strictEqual((row.match(/<a /g) || []).length, 1, "one link");
assert.ok(row.startsWith('<a class="listing" href="#e/' + art.id + '" data-ev-open="' + art.id + '"'), "the whole row is the link to the event");
assert.ok(!/<button|<input|<select/.test(row), "no controls inside a link");
assert.match(row, /class="tile water-field cat-art"><canvas class="water" aria-hidden="true" data-water="tile"/);
assert.match(row, /<span class="tile-k">Visual Art<\/span>/);
assert.match(row, /Dawoud Bey &lt;Street&gt;/, "titles are escaped");
assert.match(row, /class="mark mark-host" role="img" aria-label="Andrew is committed to seeing this\."/, "the host's ring says what it means");
assert.match(row, /Steppenwolf · Lincoln Park/);
assert.match(row, /<span class="listing-cost">Free<\/span>/);
assert.ok(!/crewline|mark-int|mark-going/.test(row), "signed out: no crew line and no plans of your own");

// --- a row, signed in ---
g.AUTH.user = { id: 7, dolphins: false };
const crewed = ev({ crew_plans: [
  { crew_id: 1, crew_name: "A", going: ["Maya Chen", "Ben King"], interested: [], been: ["Jo Park"] },
  { crew_id: 2, crew_name: "B", going: [], interested: ["Maya Chen", "Tess Ell"], been: [] },
] });
g.MYPLANS[crewed.id] = { status: "interested", date: null };
row = g.listingHTML(crewed);
assert.match(row, />3 from your crew<\/span>/, "names count once across crews; been-only isn't counted");
assert.strictEqual((row.match(/class="face tone-\d"/g) || []).length, 3);
assert.match(row, /<span class="dots" aria-hidden="true"><span class="face tone-\d">MC<\/span>/);
assert.match(row, /class="mark mark-int" role="img" aria-label="You&#39;re interested"/);
const going = ev({});
g.MYPLANS[going.id] = { status: "going", date: iso(fri) };
row = g.listingHTML(going);
assert.match(row, /class="mark mark-going" role="img" aria-label="You&#39;re going"/);
assert.match(row, /<span class="going-day">Going /);
assert.ok(!/crewline/.test(row), "no crew-mates: no crew line");
const many = ev({ crew_plans: [{ crew_id: 1, crew_name: "A", going: ["A A", "B B", "C C", "D D", "E E"], interested: [], been: [] }] });
row = g.listingHTML(many);
assert.strictEqual((row.match(/class="face /g) || []).length, 4, "at most four dots");
assert.match(row, />5 from your crew</);
g.AUTH.user.dolphins = true; // the owner: their plan is already the gold ring
assert.ok(!/mark-going/.test(g.listingHTML(going)));

console.log("listings: ok");
