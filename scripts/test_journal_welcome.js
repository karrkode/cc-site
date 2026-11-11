// Checks run in CI before the site deploys (CC-252): the masthead's words, the front page's four ways in, and the
// journal's welcome box. Signed out the box takes the sign-in panel's place and leads to making an account; signed in it
// can be put away, it squeezes shut (dropClose, which skips the squeeze with reduced motion), and it stays away in this
// browser only.
//
//     node scripts/test_journal_welcome.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const PUB = path.join(__dirname, "..", "public");
const read = (f) => fs.readFileSync(path.join(PUB, f), "utf8");
const html = read("index.html"), account = read("js/account.js"), css = read("css/site.css");
const test = (name, fn) => { fn(); console.log("ok: " + name); };
const between = (s, from, to) => { const i = s.indexOf(from); assert.ok(i >= 0, "finds " + from); return s.slice(i, s.indexOf(to, i) + to.length); };

test("the masthead reads Chi ★ Culture Crew, with the new tagline", () => {
  const brand = between(html, '<button class="brand"', "</button>");
  assert.match(brand, /aria-label="Chi Culture Crew">Chi<svg class="star"[^>]*><use href="#chi-star"><\/use><\/svg>Culture Crew<\/button>/);
  assert.ok(html.includes('<p class="mast-tag">Choose an event. Commit with your crew. Communicate your thoughts.</p>'));
  assert.ok(html.includes("<title>Chi Culture Crew · "), "the page title");
  assert.ok(html.includes('<h1 class="sr-only" id="home-title" tabindex="-1">Chi Culture Crew: '), "the screen-reader h1");
  assert.ok(!html.includes("kept by the crew"), "the old tagline is gone");
  assert.ok(read("404.html").includes("<title>Not found · Chi Culture Crew</title>"));
});

test("four ways in, the journal's above Read the listings", () => {
  const ways = between(html, '<nav class="ways rise" id="ways"', "</nav>");
  assert.ok(ways.includes('<h2 class="front-h" id="ways-h">Four ways in</h2>'));
  const gos = [...ways.matchAll(/<button class="way" type="button" data-go="(\w+)">/g)].map((m) => m[1]);
  assert.deepStrictEqual(gos, ["plan", "crews", "journal", "catalog"]);
  assert.ok(ways.includes('<span class="way-t">Update your cultural journal&nbsp;→</span><span class="way-d">Where you\'ve been, in three words each.</span>'));
  assert.ok(css.includes(".ways.rise .way:nth-of-type(4) { animation-delay: 0.36s; }"), "the fourth rises 120ms after the third");
});

test("the welcome box heads the journal, and the old sign-in panel is gone", () => {
  const view = between(html, '<section class="view" id="view-journal"', '<section class="journal-sec"');
  assert.ok(view.includes("Thoughts are fleeting! Use this journal to help record your thoughts and remember where you've been."));
  assert.ok(view.includes('But first you need to create an account! <button class="textbtn" type="button" id="journal-register">Click here to register</button>.'));
  assert.match(view, /<button class="jw-x" type="button" id="journal-welcome-x" aria-label="[^"]+" hidden>/);
  assert.ok(!html.includes("journal-signin") && !account.includes("journal-signin"));
});

// The welcome code from account.js, run against a few stand-in elements
const code = between(account, 'var JW_KEY = "cc_journal_welcome"', "dropClose($(\"journal-welcome\"));\n});");
function page(user, stored, blocked) {
  const el = (id) => ({ id, hidden: false, listeners: {}, addEventListener(t, f) { this.listeners[t] = f; }, focus() { calls.push("focus " + id); } });
  const els = {}, calls = [], store = Object.assign({}, stored);
  ["journal-welcome", "journal-welcome-out", "journal-welcome-x", "journal-main", "journal-register", "journal-title", "reg-name"].forEach((id) => { els[id] = el(id); });
  const g = {
    $: (id) => els[id], AUTH: { user },
    localStorage: { getItem(k) { if (blocked) throw new Error("blocked"); return k in store ? store[k] : null; },
      setItem(k, v) { if (blocked) throw new Error("blocked"); store[k] = v; } },
    renderJournal() { calls.push("renderJournal"); }, moveStop() {}, show() {},
    signInFrom(p) { calls.push("signInFrom " + p); }, dropClose(b) { calls.push("dropClose " + b.id); b.hidden = true; },
  };
  vm.createContext(g); vm.runInContext(code, g);
  return { g, els, calls, store };
}

test("signed out: the box shows with the register line and no close; it opens Make an account, back to the journal", () => {
  const p = page(null, { cc_journal_welcome: "off" });
  p.g.renderJournalPage();
  assert.strictEqual(p.els["journal-welcome"].hidden, false, "shows even if put away while signed in");
  assert.strictEqual(p.els["journal-welcome-out"].hidden, false);
  assert.strictEqual(p.els["journal-welcome-x"].hidden, true);
  assert.strictEqual(p.els["journal-main"].hidden, true);
  p.els["journal-register"].listeners.click();
  assert.deepStrictEqual(p.calls, ["signInFrom journal", "focus reg-name"]);
});

test("signed in: the box shows with a close and no register line, above the journal", () => {
  const p = page({ id: 1 }, {});
  p.g.renderJournalPage();
  assert.strictEqual(p.els["journal-welcome"].hidden, false);
  assert.strictEqual(p.els["journal-welcome-out"].hidden, true);
  assert.strictEqual(p.els["journal-welcome-x"].hidden, false);
  assert.strictEqual(p.els["journal-main"].hidden, false);
});

test("putting it away squeezes it shut, moves focus to the title, and is remembered in this browser", () => {
  const p = page({ id: 1 }, {});
  p.g.renderJournalPage();
  p.els["journal-welcome-x"].listeners.click();
  assert.deepStrictEqual(p.calls.slice(-2), ["focus journal-title", "dropClose journal-welcome"]);
  assert.strictEqual(p.store.cc_journal_welcome, "off");
  const again = page({ id: 1 }, p.store);
  again.g.renderJournalPage();
  assert.strictEqual(again.els["journal-welcome"].hidden, true, "stays away on the next visit");
  assert.strictEqual(page({ id: 1 }, {}).g.journalWelcomeOff(), false, "another browser shows it");
});

test("with storage blocked it still stays away until the page closes", () => {
  const p = page({ id: 1 }, {}, true);
  p.g.renderJournalPage();
  p.els["journal-welcome-x"].listeners.click();
  p.g.renderJournalPage();
  assert.strictEqual(p.els["journal-welcome"].hidden, true);
});

test("dropClose skips the squeeze with reduced motion", () => {
  const util = read("js/util.js");
  assert.match(util, /function motionOn\(el\) \{ return !!el\.animate && !MOTION_CALM\.matches; \}/);
  assert.match(util, /function dropClose\(el, hide\) \{\n  if \(!motionOn\(el\)[^\n]*else el\.hidden = true; return; \}/);
});
