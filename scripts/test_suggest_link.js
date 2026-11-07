// Checks run in CI before the site deploys (CC-215): on Submit an event, the form opens as soon as a link is pasted, what the
// member types during the read stays, and a slow, failed, empty or overtaken read never touches it.
//
//     node scripts/test_suggest_link.js
"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const PUB = path.join(__dirname, "..", "public");
const html = fs.readFileSync(path.join(PUB, "index.html"), "utf8"), submit = fs.readFileSync(path.join(PUB, "js/submit.js"), "utf8");
const css = fs.readFileSync(path.join(PUB, "css/site.css"), "utf8");
assert.ok(html.indexOf('id="s-link-error"') < html.indexOf('id="submit-form"'), "a failed read is said next to the link");
assert.ok(/\.fill-tag/.test(css) && /\.field\.filled/.test(css), "filled fields have a mark");

// the form's own logic, run on fake fields
function makeEl(id) {
  const on = {}, classes = new Set();
  const el = {
    id, value: "", textContent: "", hidden: false, disabled: false, dataset: {}, tags: [],
    classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), has: (c) => classes.has(c) },
    addEventListener: (t, f) => { on[t] = f; }, fire: (t, ev) => on[t] && on[t](ev || { target: el, preventDefault() {} }),
    dispatchEvent: (ev) => el.fire(ev.type), closest: () => el, querySelector: (q) => q.startsWith("option") ? null : { insertAdjacentHTML: (w, h) => el.tags.push(h) },
    insertAdjacentHTML() {}, contains: (x) => x === el, focus() { doc.activeElement = el; }, setAttribute() {}, removeAttribute() {}
  };
  return el;
}
const els = {}, $ = (id) => els[id] || (els[id] = makeEl(id));
const doc = { body: {}, activeElement: null, querySelector: () => null, querySelectorAll: () => [] };
doc.activeElement = doc.body;
let kind = "range", how = "link";
doc.querySelector = (q) => q.includes('name="s-how"') ? { value: how } : null;
const reads = [];
const api = (p, o) => { const r = { p, o }; reads.push(r); return { then: (ok, no) => ({ then: (f) => { r.answer = f; } }) }; };
const timers = [], RUN = { s: [] }, SHOW_DAYS = { s: { days: {} } };
const scope = new Function("$", "document", "api", "readJSON", "errorText", "unconfirmed", "confirmFirst", "crewMarkInvalid", "setRun", "setShowDays",
  "isFixedRun", "datesUnknown", "RUN", "SHOW_DAYS", "AUTH", "SUBMIT_SENT", "setTimeout", "clearTimeout", "Event",
  submit.slice(submit.indexOf("// ---------- CC-124"), submit.indexOf('$("s-venue").addEventListener("change"')) +
  "; return { linkRead, linkStop, fillFromDraft };");
const t = scope($, doc, api, null, (r) => r ? r.body.detail : "Couldn't reach Culture Crew.", () => false, () => {}, () => {},
  (f, dates) => { RUN.s = dates; kind = dates.length ? "fixed" : "range"; }, (f, w) => { SHOW_DAYS.s.days = Object.assign({}, w); },
  () => kind === "fixed", () => kind === "unknown", RUN, SHOW_DAYS, { user: {} }, false,
  (f, ms) => { timers.push({ f, ms }); return timers.length; }, () => {}, function (type) { this.type = type; });

const page = "https://x.example/show", draft = { url: page, title: "The Show", category: "Music", venue: "The Hall", neighborhood: "Uptown",
  begin_date: "2026-12-01", end_date: "2026-12-05", cost_text: "$20", run_dates: [], weekly: {}, weeks: {}, missing: [], other_events: 0 };
const paste = (url) => { $("s-link").value = url; $("s-link").fire("paste"); timers.pop().f(); };
function clearForm() { for (const k of ["s-title", "s-venue", "s-hood", "s-begin", "s-end", "s-cost", "s-url"]) $(k).value = ""; }

// pasting opens the form straight away, with the link kept and a progress line
$("submit-form").hidden = true;
paste(page);
assert.strictEqual(reads.length, 1, "a pasted link is read");
assert.strictEqual($("s-url").value, page);
assert.strictEqual($("s-link-msg").textContent, "Reading the page…");
assert.strictEqual($("s-link-btn").disabled, true);
assert.strictEqual($("submit-form").hidden, false, "the form is open during the read");

// after a few seconds it says so, without claiming a stage
const slow = timers.find((x) => x.ms === 4000); slow.f();
assert.strictEqual($("s-link-msg").textContent, "Still reading…");

// typing during a slow read: the member's values stay, the rest fill in, and their place isn't taken
$("s-title").value = "My Title"; $("s-cost").value = "Pay what you can"; $("s-title").focus();
reads[0].answer({ ok: true, body: draft });
assert.strictEqual($("s-title").value, "My Title", "typed name stays");
assert.strictEqual($("s-cost").value, "Pay what you can", "typed price stays");
assert.strictEqual($("s-venue").value, "The Hall", "an empty field fills");
assert.strictEqual($("s-begin").value, "2026-12-01");
assert.strictEqual(doc.activeElement, $("s-title"), "focus stays where the member is");
assert.ok($("s-venue").classList.has("filled") && !$("s-title").classList.has("filled"), "only what was filled is marked");
assert.ok(/left what you typed/.test($("s-filled").textContent), $("s-filled").textContent);
assert.strictEqual($("s-link-msg").textContent, "");
assert.strictEqual($("s-link-btn").disabled, false);

// a second link: what the last read filled follows it, what the member typed doesn't
paste("https://y.example/other");
reads[1].answer({ ok: true, body: { ...draft, url: "https://y.example/other", title: "Other", venue: "", missing: ["venue"], begin_date: null, end_date: null } });
assert.strictEqual($("s-title").value, "My Title");
assert.strictEqual($("s-venue").value, "", "a read's leftovers don't stay");
assert.strictEqual($("s-begin").value, "");
assert.strictEqual($("s-url").value, "https://y.example/other");

// a type the member chose stays
$("s-category").dataset.chosen = "1"; $("s-category").value = "Theater";
paste(page); reads[2].answer({ ok: true, body: draft });
assert.strictEqual($("s-category").value, "Theater", "chosen type stays");

// a fixed run the member chose stays, and so do the dates they gave
clearForm(); kind = "fixed"; RUN.s = [{ date: "2026-12-24", time: "19:00" }];
paste(page); reads[3].answer({ ok: true, body: { ...draft, run_dates: [{ date: "2026-12-01", time: "20:00" }] } });
assert.strictEqual(RUN.s[0].date, "2026-12-24");
kind = "range"; RUN.s = [];

// a failed read says so by the link, and leaves everything as it is
clearForm(); $("s-title").value = "Typed";
paste(page); reads[4].answer({ ok: false, status: 422, body: { detail: "We couldn't open that page." } });
assert.ok(/couldn't open that page.*kept the link/.test($("s-link-error").textContent), $("s-link-error").textContent);
assert.strictEqual($("s-title").value, "Typed");
assert.strictEqual($("s-url").value, page);
assert.strictEqual($("submit-form").hidden, false, "the form stays open");
assert.strictEqual(how, "link", "and the link stays on screen");

// a page with nothing on it is said calmly, not as if it had been filled in
clearForm();
paste(page); reads[5].answer({ ok: true, body: { url: page, title: "", category: null, venue: "", neighborhood: "", missing: ["title", "category", "venue", "neighborhood", "dates", "price"] } });
assert.ok(/couldn't find the details/.test($("s-filled").textContent), $("s-filled").textContent);

// a read that's been overtaken changes nothing: the link edited, or sent, or switched to by hand
clearForm(); paste(page);
$("s-link").value = "https://x.example/sho"; $("s-link-form").fire("input");
assert.strictEqual($("s-link-btn").disabled, false);
reads[6].answer({ ok: true, body: draft });
assert.strictEqual($("s-venue").value, "", "a late answer is dropped");
paste(page); t.linkStop(); reads[7].answer({ ok: false, status: 422, body: { detail: "No." } });
assert.ok(!/No\./.test($("s-link-error").textContent));

// the rest of the page: a sent form drops the read; the old form-hiding is gone; a bad paste isn't read
const at = reads.length; paste("not a link"); assert.strictEqual(reads.length, at, "only a web address is read");
assert.ok(/linkStop\(\); resetSubmitForm\(\)/.test(submit), "sending drops the read");
assert.ok(/howChoice\(\) === "manual"\) \{ linkStop\(\)/.test(submit), "Enter it myself drops the read");
assert.ok(!submit.includes("LINK_FILLED"));
console.log("ok: suggest by link");
