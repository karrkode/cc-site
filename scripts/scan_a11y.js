// CC-291: the accessibility scan. Runs axe-core in a real Chrome over each page of the site, in light and dark themes, at
// desktop (1280px) and phone (375px) width, and prints the violations only. Colour contrast is also checked, for the
// theme tokens, by check_contrast.py; axe checks it again here on the painted page.
//
// It needs a running site with its API (the local stack on :4173, or a story's own port), Google Chrome, and a one-time
// `npm ci` in scripts/a11y. It is not part of CI (CI has no API); run it before a release and after changing a page:
//
//     (cd scripts/a11y && npm ci)
//     node scripts/scan_a11y.js                          # http://localhost:4173, signed-out pages
//     A11Y_URL=http://localhost:4291 A11Y_USER=you@example.com A11Y_PASSWORD=... node scripts/scan_a11y.js
//     A11Y_ADMIN=admin@example.com A11Y_ADMIN_PASSWORD=...  # also scans the admin pages
//     A11Y_ONLY=home,event node scripts/scan_a11y.js     # a few pages; A11Y_TABLE=1 prints the full table
//
// Pages that need a sign-in are skipped, and the skip is printed and fails the run (A11Y_ALLOW_SKIP=1 to allow it), when their account isn't given. A page that doesn't show what it should (a sign-in prompt, an error) fails too. A story's own stack on port 8000+X needs A11Y_API_PORT. Test accounts are in
// cc-backend/README.md (never put them in this repo). Exit code 1 if any serious or critical violation is found.
//
// CC-293: it also opens things, by keyboard (focus the opener, press Enter), and scans each while it is open: the You and
// Admin menus, the phone menu sheet, the dialogs (event editor, venue, hours, photo, invite, QR, issue, Jira, and the Find
// an outing filter sheet) and an open Source-grid panel. For each dialog it checks that focus lands inside it on open and
// goes back to the opener on close, by Escape and by the dialog's own close button; a miss counts like a serious violation.
// The stats and card admin pages, the reset and verify links (with a made-up token) and the signed-in event page are in the page list.
// A state that can't be opened (no opener on screen) is NOT SCANNED and fails the run, like a page that doesn't show, so the stack
// needs some data: an event, a venue, a source, a support issue with no Jira ticket yet, and a journal entry for the test user.
// The phone menu and the filter sheet exist only at phone width (375px), so they aren't scanned at 1280px. A11Y_ONLY takes the
// state names too (you-menu, admin-menu, phone-menu, invite-dialog, qr-dialog, editor-dialog, venue-dialog, hours-dialog,
// photo-dialog, issue-dialog, jira-dialog, filter-sheet, source-panel).
"use strict";
const fs = require("fs");
const path = require("path");
const { createRequire } = require("module");
const req = createRequire(path.join(__dirname, "a11y", "package.json"));
let chromium, axeSource;
try {
  chromium = req("playwright-core").chromium;
  axeSource = fs.readFileSync(req.resolve("axe-core/axe.min.js"), "utf8");
} catch (e) {
  console.error("scan_a11y: run `npm ci` in scripts/a11y first (" + e.message.split("\n")[0] + ")");
  process.exit(2);
}

const BASE = (process.env.A11Y_URL || "http://localhost:4173").replace(/\/$/, "");
const ENV = process.env;
const ONLY = ENV.A11Y_ONLY ? ENV.A11Y_ONLY.split(",") : null;
const SKIP_VENUES = /second city|annoyance/i; // not test cases (CC-291)

// who: "" signed out, "user", "admin"
const PAGES = [
  { name: "home", head: "home-title", path: "/" },
  { name: "catalog", head: "catalog-title", path: "/#catalog" },
  { name: "plan", head: "plan-title", path: "/#plan" },
  { name: "event", head: "event-title", path: "/#e/{event}" },
  { name: "event-in", head: "event-title", path: "/#e/{event}", who: "user" }, // CC-293: signed in, the page has the going and photo controls
  { name: "reset", head: "reset-title", path: "/#reset=a11y-scan", reload: true }, // CC-293: the emailed links, with a made-up token (nothing is sent until the button is pressed)
  { name: "verify", head: "verify-title", path: "/#verify=a11y-scan", reload: true },
  { name: "join", head: "jp-title", path: "/join" },
  { name: "invite", head: "ip-title", path: "/invite" },
  { name: "sign-in", head: "account-title", path: "/#account" },
  { name: "submit", head: "submit-title", path: "/#submit" },
  { name: "week", head: "week-title", path: "/#week", who: "user" },
  { name: "journal", head: "journal-title", path: "/#journal", who: "user" },
  { name: "crews", head: "crews-title", path: "/#crews", who: "user" },
  { name: "account", head: "account-title", path: "/#account", who: "user" },
  { name: "review", head: "review-title", path: "/#review", who: "admin" },
  { name: "sourcing", head: "sourcing-title", path: "/#sourcing", who: "admin" },
  { name: "engagement", head: "engagement-title", path: "/#engagement", who: "admin" },
  { name: "people", head: "people-title", path: "/#people", who: "admin" },
  { name: "venues", head: "venues-title", path: "/#venues", who: "admin" },
  { name: "found", head: "found-title", path: "/#found", who: "admin" },
  { name: "sources", head: "sources-title", path: "/#sources", who: "admin" },
  { name: "issues", head: "issues-title", path: "/#issues", who: "admin" },
  { name: "approvals", head: "approvals-title", path: "/#approvals", who: "admin" },
  { name: "members", head: "members-title", path: "/#members", who: "admin" },
  { name: "health", head: "health-title", path: "/#health", who: "admin" },
  { name: "stats", head: "stats-title", path: "/#stats", who: "admin" }, // CC-293
  { name: "card", head: "card-title", path: "/#card", who: "admin" },
];

// CC-293: things that open. `wide` and `phone` (375px, where the nav is a sheet behind the burger) are the clicks to get there,
// each pressed by keyboard (focus, then Enter); the last one is the opener a dialog should give focus back to. `ready` is
// what must be showing afterwards, `scope` what axe is run over, and for a dialog `close` is its own close button.
// `back` names where focus goes when the opener leaves the page (a menu item closes its menu).
const SHEET = ["#mast-burger"];
const STATES = [
  { name: "you-menu", who: "user", path: "/", wide: ["#nav-account"], phone: [...SHEET, "#me-head"], ready: "#me-menu:not([hidden])", scope: { wide: "#me-menu", phone: "#mast" } },
  { name: "admin-menu", who: "admin", path: "/", wide: ["#nav-review"], phone: [...SHEET, "#rv-head"], ready: "#rv-menu:not([hidden])", scope: { wide: "#rv-menu", phone: "#mast" } },
  { name: "phone-menu", who: "", path: "/", phone: SHEET, ready: "#mast-nav", scope: { phone: "#mast" } },
  { name: "invite-dialog", who: "admin", path: "/", wide: ["#nav-account", "[data-me=invite]"], phone: [...SHEET, "#me-head", "[data-me=invite]"], dialog: "#invite-dialog", close: "#invite-dialog .invite-done", back: { wide: "#nav-account", phone: "#mast-burger" } },
  { name: "qr-dialog", who: "admin", path: "/", wide: ["#nav-account", "[data-me=invite]", "#invite-qr"], phone: [...SHEET, "#me-head", "[data-me=invite]", "#invite-qr"], dialog: "#qr-full", close: "#qr-full-done", back: { wide: "#nav-account", phone: "#mast-burger" } },
  { name: "editor-dialog", who: "admin", path: "/#e/{event}", head: "event-title", wide: ["[data-edit]:visible"], phone: ["[data-edit]:visible"], dialog: "#edit-dialog", close: "#ed-cancel" },
  { name: "venue-dialog", who: "admin", path: "/#venues", head: "venues-title", wide: ["[data-venue-edit]:visible"], phone: ["[data-venue-edit]:visible"], dialog: "#venue-dialog", close: "#vd-cancel" },
  { name: "hours-dialog", who: "admin", path: "/#venues", head: "venues-title", wide: ["[data-venue-hours]:visible"], phone: ["[data-venue-hours]:visible"], dialog: "#hours-dialog", close: "#hd-cancel" },
  { name: "photo-dialog", who: "user", path: "/#journal", head: "journal-title", wide: ["[data-photo]:visible"], phone: ["[data-photo]:visible"], dialog: "#photo-dialog", close: "#ph-cancel" },
  { name: "issue-dialog", who: "user", path: "/", wide: ["#report-open"], phone: ["#report-open"], dialog: "#issue-dialog", close: "#is-cancel" },
  { name: "jira-dialog", who: "admin", path: "/#issues", head: "issues-title", wide: ["[data-jira-make]:visible"], phone: ["[data-jira-make]:visible"], dialog: "#jira-dialog", close: "#jr-cancel" },
  { name: "filter-sheet", who: "", path: "/#catalog", head: "catalog-title", phone: ["#filters-btn"], dialog: "#filter-sheet", close: "#sheet-close" },
  { name: "source-panel", who: "admin", path: "/#sources", head: "sources-title", wide: ["[data-sg-tab]:visible"], phone: ["[data-sg-tab]:visible"], ready: "#sg-panel", scope: { wide: "#sg-panel", phone: "#sg-panel" } },
];
const ALL = PAGES.concat(STATES);
const ACCOUNTS = { user: [ENV.A11Y_USER, ENV.A11Y_PASSWORD], admin: [ENV.A11Y_ADMIN, ENV.A11Y_ADMIN_PASSWORD] };
const VIEWS = [["light", 1280, 900], ["dark", 1280, 900], ["light", 375, 812], ["dark", 375, 812]];

async function eventId() { // the first listed event that isn't one of the venues we don't use as test cases
  let res;
  try { res = await fetch(BASE.replace(/:\d+$/, "") + ":" + (ENV.A11Y_API_PORT || "8000") + "/events?limit=50"); } catch (e) { return null; }
  const body = await res.json().catch(() => ({}));
  const e = (body.items || []).find((x) => !SKIP_VENUES.test(x.title + " " + ((x.venue || {}).name || "")));
  return e ? e.id : null;
}

// One sign-in per context: the API rotates the refresh cookie (a reused one ends the account's sessions) and limits sign-ins.
async function signIn(ctx, who) {
  const [email, password] = ACCOUNTS[who];
  const page = await ctx.newPage();
  await page.goto(BASE + "/#account");
  await page.waitForSelector("#signin-email");
  await page.fill("#signin-email", email);
  await page.fill("#signin-password", password);
  await page.click("#signin-form button[type=submit]");
  await page.waitForFunction(() => { const n = document.getElementById("nav-account"); return n && !/^sign in/i.test(n.innerText.trim()); }, null, { timeout: 8000 })
    .catch(() => { throw new Error("scan_a11y: couldn't sign in the " + who + " account at " + BASE + " (CORS, or a wrong password?)"); });
  return page;
}

// Is the page we meant to scan on screen? (Not a sign-in prompt, an error band or a loading state: axe passes those.)
async function rendered(page, p) {
  return page.evaluate((p) => {
    const h = document.getElementById(p.head);
    const view = h && h.closest(".view");
    if (!h || !view || view.hidden || !h.textContent.trim()) return "the heading #" + p.head + " isn't showing";
    if (p.who && /^sign in/i.test(h.textContent.trim())) return "signed out";
    const nav = document.getElementById("nav-account"); // CC-293: the event page's heading is the same signed in or out
    if (p.who && (!nav || /^sign in/i.test(nav.innerText.trim()))) return "signed out";
    if (/couldn.t be loaded|couldn.t reach/i.test(view.innerText)) return "it shows an error";
    return "";
  }, p);
}

const AXE_OPTS = { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] }, resultTypes: ["violations"] };
const PHONE_W = 500; // the nav is a sheet at 960px and under; the scan's phone width is 375px

// CC-293: the keyboard's way of pressing a button: focus it, then Enter.
async function press(page, sel, mark) {
  const loc = page.locator(sel).first();
  await loc.waitFor({ state: "visible", timeout: 4000 });
  if (mark) await page.evaluate(() => document.querySelectorAll("[data-a11y-opener]").forEach((e) => e.removeAttribute("data-a11y-opener")));
  if (mark) await loc.evaluate((e) => e.setAttribute("data-a11y-opener", ""));
  await loc.focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(350);
}

// Back to a clean page: no dialog, no menu, no sheet. (A hash change, not a reload: the sign-in cookie rotates on a reload.)
async function reset(page, path) {
  await page.evaluate(() => { document.querySelectorAll("dialog[open]").forEach((d) => d.close()); });
  await page.keyboard.press("Escape");
  await page.goto(BASE + "/#a11y-reset");
  await page.goto(BASE + (path === "/" ? "/#" : path)); // "/#", not "/": dropping the fragment would reload the page
  await page.waitForTimeout(1800);
}

// Open the state by its clicks. Returns "" or why it didn't open.
async function openState(page, st, steps, w) {
  try {
    for (let i = 0; i < steps.length; i++) await press(page, steps[i], i === steps.length - 1);
    if (st.dialog) await page.waitForSelector(st.dialog + "[open]", { timeout: 3000 });
    else await page.waitForSelector(st.ready, { state: "visible", timeout: 3000 });
  } catch (e) { return "couldn't open it (" + e.message.split("\n")[0].replace(/^locator\.|^page\./, "") + ")"; }
  return "";
}

// Focus is inside the dialog (open), or back on the opener (closed: by Escape or by its own button).
async function focusIn(page, dialog) {
  return page.evaluate((sel) => { const d = document.querySelector(sel), a = document.activeElement; return !!(d && a && d.contains(a)); }, dialog);
}
async function focusBack(page, st, w) {
  await page.waitForSelector(st.dialog + "[open]", { state: "detached", timeout: 3000 }).catch(() => {});
  await page.waitForFunction((sel) => { const d = document.querySelector(sel); return d && !d.open; }, st.dialog, { timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(400);
  const back = st.back && st.back[w <= PHONE_W ? "phone" : "wide"];
  return page.evaluate((back) => {
    const a = document.activeElement, o = back ? document.querySelector(back) : document.querySelector("[data-a11y-opener]");
    return !!(a && o && (a === o || o.contains(a)));
  }, back || "");
}

(async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  const id = await eventId();
  const table = [], failures = [], skipped = [], notShown = [];
  for (const who of ["user", "admin"]) {
    if (ALL.some((p) => p.who === who && (!ONLY || ONLY.includes(p.name))) && !(ACCOUNTS[who][0] && ACCOUNTS[who][1])) skipped.push(who + " pages (no " + (who === "user" ? "A11Y_USER" : "A11Y_ADMIN") + ")");
  }
  // One browser context for each of anonymous, user and admin, per theme and width: the sign-in is rate-limited, and the
  // refresh cookie rotates, so a context signs in once and then moves between pages by the address's hash.
  for (const [theme, w, h] of VIEWS) {
    const ctxs = {}, pages = {};
    for (const who of ["", "user", "admin"]) {
      if (who && !(ACCOUNTS[who][0] && ACCOUNTS[who][1])) continue;
      if (!ALL.some((p) => (p.who || "") === who && (!ONLY || ONLY.includes(p.name)))) continue;
      ctxs[who] = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: theme, reducedMotion: "reduce", bypassCSP: true /* axe is injected by hand */ });
      await ctxs[who].addInitScript((t) => { try { localStorage.setItem("cc_theme", t); } catch (e) {} }, theme);
      pages[who] = who ? await signIn(ctxs[who], who) : await ctxs[who].newPage();
    }
    for (const p of PAGES) {
      if (ONLY && !ONLY.includes(p.name)) continue;
      const page = pages[p.who || ""];
      if (!page) continue;
      if (p.path.includes("{event}") && id == null) { if (!skipped.includes(p.name + " (no event to open)")) skipped.push(p.name + " (no event to open)"); continue; }
      await page.goto(p.reload ? "about:blank" : BASE + "/#a11y-reset"); // CC-293: leave whatever the last page left open
      await page.goto(BASE + p.path.replace("{event}", id)); // the emailed links (reload: true) are read, and taken off the address, when the page loads
      await page.waitForTimeout(1800); // the API answers and the view paints
      const label = p.name + " " + theme + " " + w + "px";
      const why = await rendered(page, p);
      if (why) { notShown.push(label + ": " + why); continue; }
      if (!(await page.evaluate(() => typeof axe !== "undefined"))) await page.addScriptTag({ content: axeSource });
      const res = await page.evaluate((o) => axe.run(document, o), AXE_OPTS);
      table.push([label, res.violations.length]);
      for (const v of res.violations) {
        failures.push({ label, id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 3).map((n) => n.target.join(" ")), count: v.nodes.length });
      }
    }
    // CC-293: the open states
    for (const st of STATES) {
      if (ONLY && !ONLY.includes(st.name)) continue;
      const page = pages[st.who || ""];
      const phone = w <= PHONE_W, steps = phone ? st.phone : st.wide;
      if (!page || !steps) continue; // no account for it (already listed as skipped), or it doesn't exist at this width
      if (st.path.includes("{event}") && id == null) { if (!skipped.includes(st.name + " (no event to open)")) skipped.push(st.name + " (no event to open)"); continue; }
      const label = st.name + " " + theme + " " + w + "px";
      const open = async () => {
        await reset(page, st.path.replace("{event}", id));
        if (st.head) { const why = await rendered(page, { head: st.head, who: st.who }); if (why) return "its page isn't showing: " + why; }
        return openState(page, st, steps, w);
      };
      let why = await open();
      if (why) { notShown.push(label + ": " + why); continue; }
      if (!(await page.evaluate(() => typeof axe !== "undefined"))) await page.addScriptTag({ content: axeSource });
      const scope = st.dialog || (st.scope && st.scope[phone ? "phone" : "wide"]);
      const res = await page.evaluate(([sel, o]) => axe.run({ include: [[sel]] }, o), [scope, AXE_OPTS]);
      table.push([label, res.violations.length]);
      for (const v of res.violations) {
        failures.push({ label, id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 3).map((n) => n.target.join(" ")), count: v.nodes.length });
      }
      if (!st.dialog) continue;
      const focusFail = (what) => failures.push({ label, id: "dialog-focus", impact: "serious", help: what, nodes: [st.dialog], count: 1 });
      if (!(await focusIn(page, st.dialog))) focusFail("focus didn't move into the dialog when it opened");
      await page.keyboard.press("Escape");
      if (!(await focusBack(page, st, w))) focusFail("focus didn't go back to the opener when Escape closed the dialog");
      why = await open(); // again, to close it by its own button
      if (why) { notShown.push(label + " (second open): " + why); continue; }
      try { await press(page, st.close, false); } catch (e) { notShown.push(label + ": couldn't press its close button (" + st.close + ")"); continue; }
      if (!(await focusBack(page, st, w))) focusFail("focus didn't go back to the opener when the close button closed the dialog");
    }
    for (const c of Object.values(ctxs)) await c.close();
  }
  await browser.close();
  if (ENV.A11Y_TABLE) table.forEach(([l, n]) => console.log(l.padEnd(34), n));
  skipped.forEach((s) => console.log("skipped:", s));
  failures.forEach((f) => console.log(`${f.impact.toUpperCase()} ${f.label}: ${f.id} (${f.count}) ${f.help}\n    ${f.nodes.join("\n    ")}`));
  notShown.forEach((s) => console.log("NOT SCANNED:", s));
  const bad = failures.filter((f) => f.impact === "serious" || f.impact === "critical");
  console.log(`${table.length} scans, ${failures.length} violation(s), ${bad.length} serious or critical, ${notShown.length} not scanned (page not showing), ${skipped.length} skipped`);
  process.exit(bad.length || notShown.length || (skipped.length && !ENV.A11Y_ALLOW_SKIP) ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
