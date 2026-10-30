// Checks run in CI before the site deploys (CC-145): the crews page in Lakefront, in public/js/crews.js.
// A crew is a row (name, You started it, about, dots, Next up) that opens into plans as event rows and members, with
// roles as words; Manage crew is closed by default and keeps every action; errors say "Check this:".
//
//     node scripts/test_crews.js
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
vm.runInContext("var AUTH = { user: null }, MYPLANS = {}; function $(id) { return document; }", g);
vm.runInContext(read("util.js"), g);
vm.runInContext(read("water.js"), g);
vm.runInContext(read("crews.js"), g);
vm.runInContext("CREW_OPEN = null; CREW_MANAGE = null; CREW_ASK = null; CREW_EDIT = null; CREW_SHARE = false; CREW_LINKS = {};", g);
const set = (code) => vm.runInContext(code, g);

const iso = (d) => g.isoDate(d);
let n = 0;
function raw(over) {
  n += 1;
  return Object.assign({
    id: n, source_id: null, title: "Event " + n, category: "Theater", begin_date: iso(g.add(g.T, 3)), end_date: iso(g.add(g.T, 20)),
    open_run: false, cost_text: "$20", min_price: 20, url: "https://example.com",
    venue: { id: 1, name: "A Red Orchid Theatre", neighborhood: "Old Town", area: "city", region: "north" },
  }, over);
}
const member = (name, over) => Object.assign({ user_id: "u-" + name, name: name, owner: false, you: false, joined_at: "2026-10-01T00:00:00Z" }, over);
function crew(over) {
  return Object.assign({
    id: 7, name: "Thursday Theater", description: "Plays on Thursday nights", owner: true, max_members: 25, invites: [], email_invites: [],
    members: [member("Yours Truly", { owner: true, you: true }), member("Maya Chen"), member("Jordan Reyes")],
    plans: [
      { event: raw({ title: "Heroes of the Fourth Turning" }), been: [],
        people: [{ name: "Maya Chen", status: "going", date: iso(g.add(g.T, 4)), you: false }, { name: "Jordan Reyes", status: "going", date: iso(g.add(g.T, 5)), you: false }] },
      { event: raw({ title: "The Niceties" }), been: [{ name: "Maya Chen", approved: true }],
        people: [{ name: "Jordan Reyes", status: "interested", date: null, you: false }] },
    ],
  }, over);
}
const has = (html, s, msg) => assert.ok(html.includes(s), msg || "has " + s);
const lacks = (html, s, msg) => assert.ok(!html.includes(s), msg || "lacks " + s);

// --- a crew, closed: one button with the name, You started it, about, dots and Next up; nothing else drawn ---
let c = crew();
let html = g.crewHTML(c);
has(html, 'class="crew-sum" id="crew-h-7" data-crew-act="open" data-crew="7" aria-expanded="false"');
has(html, '<span class="crew-name">Thursday Theater</span> <span class="crew-you">You started it</span>');
has(html, '<span class="crew-about">Plays on Thursday nights</span>');
has(html, "Next up</span> " + g.goingDay(iso(g.add(g.T, 4))) + ' · <span class="crew-next-title">Heroes of the Fourth Turning</span>', "the soonest going plan");
has(html, "· 2 going</span>");
has(html, '<span class="sr-only">3 members.</span>', "a screen reader hears the count");
lacks(html, "crew-detail", "closed by default");
lacks(html, "class=\"state", "roles and statuses are words, not pills");
lacks(g.crewHTML(crew({ owner: false })), "You started it");
has(g.crewHTML(crew({ plans: [] })), "Nothing planned yet");

// --- dots: tints by name (as on the listings), yours always showing, last ---
const many = crew({ members: ["A B", "C D", "E F", "G H", "I J", "K L", "M N"].map((x) => member(x)).concat([member("Yours Truly", { you: true })]) });
html = g.crewHTML(many);
assert.strictEqual((html.match(/class="face tone-/g) || []).length, 6, "six dots");
has(html, '<span class="face more">+2</span>', "and how many more");
has(html, '<span class="face tone-' + g.crewTone("Yours Truly") + '" data-you title="Yours Truly">YT</span><span class="face more">', "yours is last before +N");

// --- open: plans as event rows, members with roles as words ---
set("CREW_OPEN = '7';");
html = g.crewHTML(c);
has(html, 'aria-expanded="true" aria-controls="crew-d-7"');
has(html, '<h4 class="crew-sub" id="crew-p-7"><span>Plans</span><span class="crew-sub-n">2</span></h4>');
has(html, '<h4 class="crew-sub" id="crew-m-7"><span>3 members</span><span class="crew-sub-n">room for 22 more</span></h4>');
has(html, '<span class="who">Yours Truly</span><span class="crew-role">Crew leader · you</span>');
lacks(html, '<span class="who">Maya Chen</span><span class="crew-role">', "no role, no words");
has(g.crewHTML(crew({ max_members: 3 })), '<span class="crew-sub-n">full</span>');
const rows = html.match(/<li class="crew-plan">[\s\S]*?<\/li>/g);
assert.strictEqual(rows.length, 2, "a row per plan");
const link = rows[0].match(/<a class="crew-plan-a"[\s\S]*?<\/a>/)[0];
has(link, 'href="#e/' + c.plans[0].event.id + '" data-ev-open="' + c.plans[0].event.id + '"', "the row opens the event page");
has(link, '<span class="tile water-field cat-theater">', "with its tile, which grows into the poster (CC-144)");
has(link, '<span class="listing-t">Heroes of the Fourth Turning</span>', "and the title the poster's takes over");
lacks(link, "<button", "no buttons inside a link");
has(rows[0], 'class="mark mark-going" aria-hidden="true"', "the ink dolphin when anyone's going");
has(rows[0], "<b><i>Two</i></b></button> others are going!", "who's in, in the product owner's words");
has(rows[1], 'class="mark mark-int" aria-hidden="true"', "the lake dolphin when they're only interested");
has(rows[1], "Jordan Reyes is interested!");
has(rows[1], '<p class="crew-line crew-been"><span>Maya Chen has been, with a photo.</span></p>', "and who's been");
has(g.crewHTML(crew({ plans: [] })), "No plans shared yet.");

// --- Manage crew: closed by default; every action there when open ---
has(html, 'data-crew-act="manage" data-crew="7" aria-expanded="false" aria-controls="crew-mg-7">Manage crew');
has(html, '<div id="crew-mg-7" hidden></div>');
set("CREW_MANAGE = '7';");
html = g.crewHTML(c);
has(html, ">Make an invite link</button>");
has(html, 'data-crew-email="7"'); has(html, '<label for="crew-email-7">Invite by email</label>');
has(html, ">Make crew leader</button>"); has(html, ">Remove</button>");
has(html, ">Rename</button>"); has(html, ">Dissolve crew…</button>");
lacks(html, ">Leave crew…</button>", "the leader dissolves rather than leaves");
const mine = g.crewHTML(crew({ owner: false, members: [member("Yours Truly", { you: true }), member("Maya Chen", { owner: true })] }));
has(mine, ">Leave crew…</button>"); lacks(mine, ">Rename</button>"); lacks(mine, ">Make crew leader</button>", "members only manage themselves");
has(g.crewHTML(crew({ max_members: 3 })), "The crew is full."); lacks(g.crewHTML(crew({ max_members: 3 })), "Make an invite link");

// the link: labelled, Copy (or Share on a phone), the QR code made in the browser
set("CREW_LINKS[7] = { id: 1, url: 'https://chiculturecrew.com/#join=secret', expires_at: '2026-11-06T00:00:00Z', qr: null };");
html = g.crewHTML(c);
has(html, '<label for="crew-link-7">Invite link: anyone with it can join, until');
has(html, ">Copy link</button>"); has(html, ">Show a QR code</button>"); has(html, ">Make a new link</button>");
set("CREW_SHARE = true;");
has(g.crewHTML(c), ">Share the link</button>"); lacks(g.crewHTML(c), ">Copy link</button>");
set("CREW_SHARE = false; CREW_LINKS[7].qr = 'data:image/png;base64,AAAA';");
html = g.crewHTML(c);
const srcs = html.match(/(src|href)="[^"]*"/g).filter((a) => /^(src|href)="(https?:)?\/\//.test(a));
assert.deepStrictEqual(srcs, [], "nothing on the page sends the link to an outside service");
has(html, '<img src="data:image/png;base64,AAAA"');

// --- confirmations stay inline, in today's words ---
set("CREW_ASK = { crew: 7, act: 'delete-yes', text: \"Dissolve Thursday Theater for everyone? This can't be undone.\" };");
has(g.crewHTML(c), "<div class=\"confirm\"><p><b>Dissolve Thursday Theater for everyone?</b> This can&#39;t be undone.</p>");
set("CREW_ASK = null;");

// --- errors say so; names are escaped ---
assert.strictEqual(g.checkThis("Give the crew a name."), "Check this: Give the crew a name.");
lacks(g.crewHTML(crew({ name: "<b>x</b>" })), "<b>x</b>", "a crew's name is text");

console.log("ok: the crews page (CC-145)");
