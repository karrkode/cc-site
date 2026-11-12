// Checks run in CI before the site deploys (CC-149): the rest of the site in Lakefront. Find an outing, Send us an
// event, the admin pages and the 404 have a Instrument Sans title and an italic deck with no eyebrow; the admin pages are
// reached from an index on Review and lead back with "← Review"; statuses are words, counts are plain numbers, and
// errors say "Check this:" on the pale red band, never in red.
//
//     node scripts/test_rest.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const PUB = path.join(__dirname, "..", "public");
const read = (f) => fs.readFileSync(path.join(PUB, f), "utf8");
const html = read("index.html"), css = read("css/site.css"), page404 = read("404.html"), css404 = read("css/404.css"); // CC-193: the 404's styles are a file, not a <style>
const js = ["planner", "submit", "admin", "hours", "found", "issues", "photos", "approvals"].map((f) => read("js/" + f + ".js")).join("\n");
const has = (s, part, msg) => assert.ok(s.includes(part), msg || "has " + part);
const lacks = (s, part, msg) => assert.ok(!s.includes(part), msg || "lacks " + part);
const view = (id) => { // from the view's <section> to the next view's
  const at = html.indexOf('id="view-' + id + '"'); assert.ok(at >= 0, "finds view-" + id);
  const i = html.lastIndexOf("<section", at), next = html.indexOf('<section class="view', at);
  return html.slice(i, next < 0 ? html.indexOf("</main>", at) : next);
};

// --- no eyebrows anywhere, and every page head is a title and an italic deck ---
lacks(html, "eyebrow", "index.html has no eyebrows");
lacks(js, "eyebrow", "the scripts draw no eyebrows");
lacks(css, ".eyebrow", "the eyebrow style is gone");
has(css, ".view-head .lf-deck { font-style: italic;", "decks are italic");
const pages = ["plan", "submit", "review", "found", "sources", "stats", "venues", "issues", "approvals", "members", "card"];
pages.forEach((id) => {
  const v = view(id);
  assert.ok(/class="view[^"]*\blf-page\b/.test(v), id + " carries lf-page");
  has(v, 'class="lf-deck"', id + " has a deck");
});

// --- the Review menu and its group pages (CC-206), and "← group" on each admin page (Photo approvals goes back to where you came from) ---
const menu = html.slice(html.indexOf('id="rv-wrap"'), html.indexOf('id="nav-account"'));
["review", "sourcing", "engagement", "people"].forEach((go) => has(menu, 'data-go="' + go + '"', "the Review menu links " + go));
["review-count", "rv-review-count", "found-count", "engagement-count"].forEach((id) => has(menu, 'id="' + id + '"', "the Review menu keeps " + id));
lacks(html, "admin-nav", "the old index on Review is gone");
["sourcing", "engagement", "people"].forEach((id) => { assert.ok(/class="view[^"]*\blf-page\b/.test(view(id)), id + " carries lf-page"); has(view(id), 'class="lf-deck"', id + " has a deck"); });
const groups = { sourcing: ["found", "sources"], engagement: ["issues", "approvals", "stats", "card"], people: ["venues", "members"] };
const label = { sourcing: "Event Sourcing", engagement: "Engagement", people: "Venues and Members" };
Object.keys(groups).forEach((g) => groups[g].forEach((id) => {
  has(view(g), 'data-go="' + id + '"', g + " links " + id);
  if (id !== "approvals") has(view(id), 'data-go="' + g + '"><span aria-hidden="true">←</span>' + label[g] + "</button>", id + " leads back to " + g);
}));
["issues-count", "approvals-count"].forEach((id) => has(view("engagement"), 'id="' + id + '"', "Engagement keeps " + id));
has(view("approvals"), 'id="approvals-back"', "Photo approvals keeps its own Back");
lacks(html, "Back to review", "the old bottom links are gone");
has(css, ".btn .count:not(:empty) { margin-left: 6px; font-variant-numeric: tabular-nums; }", "a count on a button is a plain number, no pill");
has(view("review"), '<h2 id="waiting-title">Waiting <span class="lf-n" id="review-n"></span></h2>', "the queue opens on a rule with its count");
has(js, '$("review-count").textContent = $("review-n").textContent =', "the count follows approve and reject");

// --- rows, words and bands ---
has(css, ".lf-page .queue-item { gap: 10px 24px; padding: 14px 0; background: none; border: 0; border-bottom: 1px solid var(--line); }", "queue items are rows");
has(css, ".lf-page .state, .editor .state { padding: 0; background: none; box-shadow: none;", "statuses are words");
has(css, '.lf-page .form-error:not(:empty)::before, .editor:not(.invite-dlg) .form-error:not(:empty)::before { content: "Check this: ";', "errors start Check this:");
has(css, ".lf-page .field input[aria-invalid=\"true\"], .lf-page .field select[aria-invalid=\"true\"] { border: 2.5px solid var(--text);", "the field at fault gets the ink border");
has(css, ".editor::backdrop { background: rgb(14 42 64 / 0.55); }", "dialogs sit on the lake scrim");
lacks(html, "🙂", "no emoji");

// --- the submit form's statuses in sentence case, and the field at fault marked ---
const sub = read("js/submit.js");
const ctx = { esc: (s) => String(s), $: () => ({}), document: { querySelector: () => null }, Intl };
vm.createContext(ctx);
vm.runInContext(sub.slice(sub.indexOf("var WHEN = "), sub.indexOf("function minPrice")), ctx);
assert.strictEqual(ctx.stateHTML({ status: "pending" }), '<span class="state pending">Waiting</span>');
assert.strictEqual(ctx.stateHTML({ status: "approved" }), '<span class="state approved">Live</span>');
has(sub, "function submitBad(id, text)", "submit marks the field at fault");
has(sub, 'if (bad) { submitBad(bad[0], bad[1]); return; }');

// --- Find an outing: each stop and swap is a row with its tile ---
const planner = read("js/planner.js");
has(planner, "function outingTileHTML(e)");
has(planner, '"</p>" + outingTileHTML(e) + \'<div class="stop-body">\'', "a stop has its tile");
has(planner, "'<div class=\"alt\">' + outingTileHTML(e)", "a swap has its tile");
has(planner, 'paintWater($("res-body"));', "the tiles' water is drawn");
has(planner, '<div class="chips segs">', "sides of town are the joined square buttons");

// --- the 404: the compact masthead, a title and deck, no box and no exclamation mark ---
has(page404, "<header><div class=\"wrap\"><a class=\"brand\" href=\"/\">Chi<svg", "the 404 has the wordmark on the lake, the star after Chi (CC-252)");
has(css404, "border-bottom: 6px solid var(--stripe);", "and the stripe under it");
lacks(css404, "border-top: 4px", "no boxed panel");
const h1 = page404.slice(page404.indexOf("<h1>"), page404.indexOf("</h1>"));
lacks(h1, "!", "the headline has no exclamation mark");
lacks(page404, "Click here", "the link says where it goes");

console.log("test_rest: ok");
