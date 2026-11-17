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
// cc-backend/README.md (never put them in this repo). Exit code 1 if any serious or critical violation is found. Not covered: open menus, dialogs and the phone menu sheet, the stats and card admin pages, and the reset and verify links.
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
  { name: "join", head: "jp-title", path: "/join" },
  { name: "invite", head: "ip-title", path: "/invite" },
  { name: "sign-in", head: "account-title", path: "/#account" },
  { name: "submit", head: "submit-title", path: "/#submit" },
  { name: "planner", head: "planner-title", path: "/#planner", who: "user" },
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
];
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
  await page.waitForSelector("#login-email");
  await page.fill("#login-email", email);
  await page.fill("#login-password", password);
  await page.click("#login-form button[type=submit]");
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
    if (/couldn.t be loaded|couldn.t reach/i.test(view.innerText)) return "it shows an error";
    return "";
  }, p);
}

(async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  const id = await eventId();
  const table = [], failures = [], skipped = [], notShown = [];
  for (const who of ["user", "admin"]) {
    if (PAGES.some((p) => p.who === who && (!ONLY || ONLY.includes(p.name))) && !(ACCOUNTS[who][0] && ACCOUNTS[who][1])) skipped.push(who + " pages (no " + (who === "user" ? "A11Y_USER" : "A11Y_ADMIN") + ")");
  }
  // One browser context for each of anonymous, user and admin, per theme and width: the sign-in is rate-limited, and the
  // refresh cookie rotates, so a context signs in once and then moves between pages by the address's hash.
  for (const [theme, w, h] of VIEWS) {
    const ctxs = {}, pages = {};
    for (const who of ["", "user", "admin"]) {
      if (who && !(ACCOUNTS[who][0] && ACCOUNTS[who][1])) continue;
      if (!PAGES.some((p) => (p.who || "") === who && (!ONLY || ONLY.includes(p.name)))) continue;
      ctxs[who] = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: theme, reducedMotion: "reduce", bypassCSP: true /* axe is injected by hand */ });
      await ctxs[who].addInitScript((t) => { try { localStorage.setItem("cc_theme", t); } catch (e) {} }, theme);
      pages[who] = who ? await signIn(ctxs[who], who) : await ctxs[who].newPage();
    }
    for (const p of PAGES) {
      if (ONLY && !ONLY.includes(p.name)) continue;
      const page = pages[p.who || ""];
      if (!page) continue;
      if (p.path.includes("{event}") && id == null) { if (!skipped.includes(p.name + " (no event to open)")) skipped.push(p.name + " (no event to open)"); continue; }
      await page.goto(BASE + p.path.replace("{event}", id));
      await page.waitForTimeout(1800); // the API answers and the view paints
      const label = p.name + " " + theme + " " + w + "px";
      const why = await rendered(page, p);
      if (why) { notShown.push(label + ": " + why); continue; }
      if (!(await page.evaluate(() => typeof axe !== "undefined"))) await page.addScriptTag({ content: axeSource });
      const res = await page.evaluate(() => axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] }, resultTypes: ["violations"] }));
      table.push([label, res.violations.length]);
      for (const v of res.violations) {
        failures.push({ label, id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 3).map((n) => n.target.join(" ")), count: v.nodes.length });
      }
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
