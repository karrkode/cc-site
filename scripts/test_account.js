// Checks run in CI before the site deploys (CC-148): Account settings and the sign-in pages in Lakefront.
// Every field has a visible label tied to it and sensible autocomplete (password managers still fill sign-in and
// change-password); "Saved." and the like are role="status"; there are no eyebrows; errors say "Check this:" and
// mark the field at fault; statuses are words, never pills.
//
//     node scripts/test_account.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const PUB = path.join(__dirname, "..", "public");
const read = (f) => fs.readFileSync(path.join(PUB, f), "utf8");
const html = read("index.html"), css = read("css/site.css"), account = read("js/account.js"), issues = read("js/issues.js");
const has = (s, part, msg) => assert.ok(s.includes(part), msg || "has " + part);
const lacks = (s, part, msg) => assert.ok(!s.includes(part), msg || "lacks " + part);
const between = (s, from, to) => { const i = s.indexOf(from); assert.ok(i >= 0, "finds " + from); return s.slice(i, s.indexOf(to, i)); };
const fn = (src, name) => { const i = src.indexOf("function " + name + "("); assert.ok(i >= 0, "finds " + name); return src.slice(i, src.indexOf("\n}\n", i) + 3); };

const views = ["view-account", "view-verify", "view-reset"].map((id) => between(html, '<section class="view acct-view" id="' + id + '"', "\n    </section>"));
const all = views.join("\n");

// --- the page head: a Newsreader title and an italic deck, no eyebrow ---
lacks(all, 'class="eyebrow"', "no eyebrows");
views.forEach((v) => has(v, '<div class="acct-head">'));
has(views[0], '<p class="acct-deck" id="account-sub">', "signed out, an italic deck");
has(views[0], '<button class="btn ghost" type="button" id="sign-out">Sign out</button>', "signed in, Sign out by who you are");

// --- every input has a visible label tied to it (the hidden username for password managers aside) ---
const inputs = [...all.matchAll(/<input id="([^"]+)"([^>]*)>/g)];
assert.ok(inputs.length >= 13, "finds the forms' fields");
inputs.forEach(([, id, rest]) => {
  if (id === "pw-user") { assert.ok(/ hidden /.test(rest) && /autocomplete="username"/.test(rest), "the change-password form names its user"); return; }
  has(all, '<label for="' + id + '">', id + " has a label");
  assert.ok(/autocomplete="[^"]+"/.test(rest), id + " has autocomplete");
});
const auto = { "login-email": "username", "login-password": "current-password", "reg-name": "name", "reg-email": "email", "reg-password": "new-password",
  "p-name": "name", "p-email": "email", "p-password": "current-password", "pw-current": "current-password", "pw-new": "new-password",
  "pw-confirm": "new-password", "reset-new": "new-password", "reset-confirm": "new-password", "forgot-email": "email" };
Object.keys(auto).forEach((id) => assert.ok(new RegExp('<input id="' + id + '"[^>]*autocomplete="' + auto[id] + '"').test(all), id + " autocompletes " + auto[id]));
has(account, '$("pw-user").value = AUTH.user.email;', "the hidden username holds your email");

// --- statuses and confirmations are read out; errors are alerts ---
["forgot-msg", "profile-msg", "password-msg", "account-notice"].forEach((id) => assert.ok(new RegExp('id="' + id + '" role="status"').test(all), id + " is a status"));
["login-error", "forgot-error", "register-error", "profile-error", "password-error", "reset-error", "verify-error"].forEach((id) =>
  assert.ok(new RegExp('class="form-error" id="' + id + '" role="alert"').test(all), id + " is an alert"));

// --- errors: "Check this:", the ink border on the field at fault, never red text ---
has(css, '.acct-view .field input[aria-invalid="true"] { border: 2.5px solid var(--text);', "the field at fault gets the ink border");
has(css, ".acct-view .field input { min-height: 48px;", "48px fields");
lacks(between(css, "/* CC-148: Account settings", "/* CC-121: the join page"), "var(--star)", "no red");
["login", "register", "profile", "password", "reset", "forgot"].forEach((f) => {
  const handler = between(account, '$("' + f + '-form").addEventListener("submit"', "\n});");
  assert.ok(!/err(?:El)?\.textContent = (?!checkThis|"")/.test(handler), f + ": every error says Check this:");
});
has(account, 'acctBad($("login-error"), $("login-email"), "Enter the email you signed up with.")');
has(account, "errEl.textContent = checkThis(errorText(res));", "sign in and register: the server's errors say Check this: too");

// --- statuses are words, and the rows render ---
const sandbox = { esc: (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])),
  WHEN: { format: () => "Sun, Nov 15, 7:00 PM" } };
vm.createContext(sandbox);
vm.runInContext(fn(account, "sentStateText") + fn(account, "acctRowHTML"), sandbox);
const st = (status, publishAt) => sandbox.sentStateText({ status, publishAt });
assert.strictEqual(st("approved"), "Approved");
assert.strictEqual(st("pending"), "Waiting for review");
assert.strictEqual(st("rejected"), "Not accepted");
assert.strictEqual(st("withdrawn"), "Withdrawn");
assert.strictEqual(st("approved", new Date(Date.now() + 864e5)), "Goes up Sun, Nov 15, 7:00 PM", "scheduled: when it goes up");
const row = sandbox.acctRowHTML("Theater", "Happy <Days>", "Neo · Nov 20", "Waiting for review", false);
has(row, '<span class="acct-row-s">Waiting for review</span>', "the status is a word");
has(row, '<span class="acct-row-t">Happy <Days></span>', "the name is passed as HTML (escaped by the caller)");
has(sandbox.acctRowHTML("", "x", "", "Withdrawn", true), 'class="acct-row-s quiet"', "a finished one is muted");
lacks(account + issues, 'class="pill', "no pills");
has(issues, "acctRowHTML(i.key", "your reports are rows too");

console.log("account and sign-in: ok");
