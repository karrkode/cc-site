// Checks run in CI before the site deploys (CC-142): the event page as a poster, in public/js/catalog.js.
// The poster carries the event's category, water and words; Interested and Going are buttons on the page with the
// right one pressed; Tickets, Share and the sign-in stay where they were; your crews show their people as dots.
//
//     node scripts/test_event.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const JS = path.join(__dirname, "..", "public", "js");
const read = (f) => fs.readFileSync(path.join(JS, f), "utf8");
// The other scripts do a lot at load, so only the helpers the event view uses are taken from them
const helper = (file, name) => read(file).match(new RegExp("function " + name + "\\([\\s\\S]*?\\n}\\n"))[0];

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
  vm.runInContext("var AUTH = { user: null }; function $(id) { return document; }" +
    "var CREWS = [], CREWSHARE_SEQ = 0, SHOW_TYPES = { Theater: 1, Music: 1 };" +
    'function crewShareToggleHTML(e) { return MYPLANS[e.id] ? "<button data-crewshare-toggle>" : ""; } function crewShareHTML() { return ""; }' +
    'function photoButtonHTML(e) { return "<button data-photo>"; } function editButtonHTML() { return "<button data-edit>"; }' +
    'function showDaysText() { return "Thu–Sat"; }', sandbox);
  vm.runInContext(read("util.js"), sandbox);
  vm.runInContext(read("water.js"), sandbox);
  vm.runInContext(helper("crews.js", "initials") + helper("crews.js", "crewTone") + helper("crews.js", "shortName") +
    helper("account.js", "isAdmin") + helper("account.js", "myplanSaid"), sandbox);
  vm.runInContext(read("listings.js"), sandbox);
  vm.runInContext(read("catalog.js"), sandbox);
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
const has = (html, s, msg) => assert.ok(html.includes(s), msg || "has " + s);
const lacks = (html, s, msg) => assert.ok(!html.includes(s), msg || "lacks " + s);
const pressed = (html, attr) => (html.match(new RegExp("<button[^>]*" + attr + '="[^"]*"[^>]*aria-pressed="(true|false)"')) || [])[1];

// --- the poster: category field, water, kicker, title, venue; one element for CC-144's transition ---
let e = ev({ title: "The Niceties" });
let html = g.eventViewHTML(e);
has(html, '<div class="poster water-field cat-theater" data-poster="' + e.id + '">', "the poster carries the category and its id");
has(html, 'data-water="poster"', "the poster's water");
has(html, '<p class="poster-k">Theater · Now playing</p>', "kicker: category and status");
has(html, '<h1 id="event-title" tabindex="-1">The Niceties</h1>');
has(html, '<p class="poster-where">Steppenwolf · Lincoln Park</p>');
assert.ok(html.startsWith('<div class="poster '), "the poster comes first");
lacks(html, "pill", "no pills on the page");

// --- facts, actions, takes ---
has(html, "<dt>When</dt>"); has(html, "<dt>Price</dt><dd>$20–$40</dd>");
has(html, 'href="https://example.com" target="_blank" rel="noopener">Tickets and showtimes ↗</a>', "Tickets as it was");
has(html, 'id="ev-share"'); has(html, 'id="ev-share-url"'); has(html, 'id="ev-share-msg"');
e.takes = [{ words: "sharp funny long", review: "", name: "Theo R.", recommend: true, hidden: false, user_id: null }];
has(g.eventViewHTML(e), '<h2 id="ev-takes-h">Takes</h2>');
const past = ev({ begin_date: iso(g.add(g.T, -30)), end_date: iso(g.add(g.T, -2)) });
html = g.eventViewHTML(past);
has(html, "· Closed</p>"); has(html, "This run has closed."); lacks(html, "Tickets and showtimes", "no tickets once closed");

// --- signed out: no plan buttons, a way to sign in; the host's pick still shows ---
e = ev({ pick: { status: "interested", date: null, by: "The Culture Crew" } });
html = g.eventViewHTML(e);
lacks(html, "data-myplan-"); has(html, 'id="ev-signin-btn"');
has(html, 'class="mark mark-host-int"', "the admin interested: the ink dolphin (CC-162)"); has(html, "The Culture Crew is interested in this one.");

// --- signed in: Interested and Going on the page, pressed as your plan says ---
g.AUTH.user = { id: 1, name: "Local User", role: "member" };
e = ev({});
html = g.eventViewHTML(e);
assert.strictEqual(pressed(html, "data-myplan-set"), "false"); assert.strictEqual(pressed(html, "data-myplan-going"), "false");
lacks(html, 'type="date"', "CC-154: no date field until you're going");
has(html, 'data-myplan-going="' + e.id + '" data-date="' + iso(g.T) + '"', "turning Going on takes the first day still open");
has(html, 'class="ev-plan myplan"', "account.js saves it like the cards' picker");
has(html, 'class="ev-main ev-panel" data-card="' + e.id + '"', "the card buttons find their event; account.js doesn't swap it for a card");
lacks(html, "data-myplan-clear", "nothing to clear yet"); lacks(html, "data-myplan-toggle", "no pop-up on the page");
g.MYPLANS[e.id] = { status: "interested", date: null, crews: [] };
html = g.eventViewHTML(e);
lacks(html, "ev-you", "interested isn’t going");
lacks(html, 'type="date"', "CC-154: Interested shows no date field");
assert.strictEqual(pressed(html, "data-myplan-set"), "true"); assert.strictEqual(pressed(html, "data-myplan-going"), "false");
has(html, "Marked interested. "); has(html, "data-myplan-clear");
const day = iso(g.add(g.T, 4));
g.MYPLANS[e.id] = { status: "going", date: day, crews: [] };
html = g.eventViewHTML(e);
assert.strictEqual(pressed(html, "data-myplan-going"), "true"); assert.strictEqual(pressed(html, "data-myplan-set"), "false");
has(html, '<input type="date" id="ev-going-day"', "CC-154: going, a run shows its date field");
has(html, 'value="' + day + '"', "the date field shows your day");
lacks(html, 'data-myplan-going="' + e.id + '" data-date=', "and Going saves the field's day");
g.MYPLANS[e.id] = { status: "interested", date: null, crews: [] };
lacks(g.eventViewHTML(e), 'type="date"', "turning Going off (Interested) hides it again");
delete g.MYPLANS[e.id];
lacks(g.eventViewHTML(e), 'type="date"', "and so does Clear plan");
g.MYPLANS[e.id] = { status: "going", date: day, crews: [] };
html = g.eventViewHTML(e);
has(html, '<div class="ev-you"><p class="ev-who">', "CC-144: once you're going, you head Your crews"); has(html, "<span>You’re going</span>");
assert.ok(html.indexOf("ev-you") < html.indexOf("ev-crews-h") + 200 && html.indexOf("ev-you") > html.indexOf("ev-crews-h"), "right under the heading");
lacks(html, "data-went", "going later: no I've been yet");
has(html, "data-crewshare-toggle", "sharing with your crews");

const tonight = ev({ begin_date: iso(g.T), end_date: iso(g.T) });
html = g.eventViewHTML(tonight);
has(html, 'data-myplan-going="' + tonight.id + '" data-date="' + iso(g.T) + '"', "one night: Going needs no date");
lacks(html, 'type="date"');

html = g.eventViewHTML(past);
lacks(html, "data-myplan-", "closed, nothing planned: no plan buttons"); has(html, "data-went", "but I've been");
g.WENT[e.id] = { date: null };
html = g.eventViewHTML(e);
lacks(html, "data-myplan-set", "been already: no plan"); has(html, "data-photo", "a photo instead");
delete g.WENT[e.id];

// --- your crews: a line per status, with dots ---
e = ev({ crew_plans: [
  { crew_id: 1, crew_name: "Thursday Night Out", going: ["Maya Chen", "Theo Reyes"], interested: ["Jo Park"], been: [] },
  { crew_id: 2, crew_name: "Family", going: [], interested: [], been: [] },
] });
html = g.eventViewHTML(e);
has(html, "<h3>Thursday Night Out</h3>"); lacks(html, "<h3>Family</h3>", "a crew with nobody on it is left out");
has(html, "<span>Maya C. and Theo R. are going</span>"); has(html, "<span>Jo P. is interested</span>");
assert.strictEqual((html.match(/class="face tone-\d"/g) || []).length, 3, "a dot per person");
has(html, '<span class="face tone-' + g.crewTone("Maya Chen") + '">MC</span>');
g.CREWS.push({ id: 1 });
html = g.eventViewHTML(ev({}));
has(html, "Nobody from your crews has this on their list yet.");

// --- CC-152: an owner's own plan is their pick; on the page it shows as their plan, not in the host's voice ---
g.AUTH.user = { id: 2, display_name: "Yours truly", role: "admin", dolphins: true };
g.CREWS.length = 0;
e = ev({ pick: { status: "interested", date: null, by: "Yours truly" } });
g.MYPLANS[e.id] = { status: "interested", date: null, crews: [] };
html = g.eventViewHTML(e);
lacks(html, "Yours truly is interested", "your own pick isn't a line under Your crews");
lacks(html, "mark-host", "nor the host's ring"); has(html, "Marked interested. ", "it shows as your plan");
has(html, "Start a crew to see who's going with you.", "in no crew: the hint, as for anyone");
e.pick.by = "Another Owner";
has(g.eventViewHTML(e), "Another Owner is interested in this one.", "another owner's pick still shows");
// Clear plan: the pick comes back null, and the page (drawn from its own copy, EV.e) loses the line without a reload,
// even when a list fetched since has put another copy of the event in KNOWN
e = ev({ pick: { status: "interested", date: null, by: "Yours truly" } });
g.EV.id = e.id; g.EV.e = e; g.KNOWN[e.id] = Object.assign({}, e); // the plans list's copy
delete g.MYPLANS[e.id];
vm.runInContext(helper("account.js", "refreshPick") + "function readJSON(r) { return r; }" +
  "function api() { return Promise.resolve({ ok: true, body: [API_ROW] }); }", g);
g.API_ROW = { id: Number(e.id), title: e.title, category: "Theater", begin_date: null, end_date: null, open_run: true, cost_text: null,
  min_price: null, venue: { id: 1, name: "Steppenwolf", area: "city" }, pick: null };
g.refreshPick(e.id).then(function () {
  assert.strictEqual(g.EV.e.pick, null, "the event view's copy loses the pick");
  assert.strictEqual(g.KNOWN[e.id].pick, null, "and so does KNOWN's");
  html = g.eventViewHTML(g.EV.e);
  lacks(html, "Yours truly is interested"); lacks(html, "data-myplan-clear", "no plan left to clear");
  console.log("event page: own plan and Clear plan (CC-152): ok");
}).catch(function (err) { console.error(err); process.exit(1); });

// --- names and text are escaped ---
html = g.eventViewHTML(ev({ title: "<b>Bold</b>" }));
lacks(html, "<b>Bold</b>"); has(html, "&lt;b&gt;Bold&lt;/b&gt;");

console.log("event page: ok");
