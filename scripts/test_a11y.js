// CC-291: the accessibility scan. Runs axe-core in a real Chrome over each page of the site, in light and dark themes, at
// desktop (1280px) and phone (375px) width, and prints the violations only. Colour contrast is also checked, for the
// theme tokens, by check_contrast.py; axe checks it again here on the painted page.
//
// It needs a running site with its API (the local stack on :4173, or a story's own port), Google Chrome, and a one-time
// `npm ci` in scripts/a11y. It is not part of CI (CI has no API); run it before a release and after changing a page:
//
//     (cd scripts/a11y && npm ci)
//     node scripts/test_a11y.js                          # http://localhost:4173, signed-out pages
//     A11Y_URL=http://localhost:4291 A11Y_USER=you@example.com A11Y_PASSWORD=... node scripts/test_a11y.js
//     A11Y_ADMIN=admin@example.com A11Y_ADMIN_PASSWORD=...  # also scans the admin pages
//     A11Y_ONLY=home,event node scripts/test_a11y.js     # a few pages; A11Y_TABLE=1 prints the full table
//
// Pages that need a sign-in are skipped, and the skip is printed, when their account isn't given. Test accounts are in
// cc-backend/README.md (never put them in this repo). Exit code 1 if any serious or critical violation is found.
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
  console.error("test_a11y: run `npm ci` in scripts/a11y first (" + e.message.split("\n")[0] + ")");
  process.exit(2);
}

const BASE = (process.env.A11Y_URL || "http://localhost:4173").replace(/\/$/, "");
const ENV = process.env;
const ONLY = ENV.A11Y_ONLY ? ENV.A11Y_ONLY.split(",") : null;
const SKIP_VENUES = /second city|annoyance/i; // not test cases (CC-291)

// who: "" signed out, "user", "admin"
const PAGES = [
  { name: "home", path: "/" },
  { name: "catalog", path: "/#catalog" },
  { name: "plan", path: "/#plan" },
  { name: "event", path: "/#e/{event}" },
  { name: "join", path: "/join" },
  { name: "invite", path: "/invite" },
  { name: "sign-in", path: "/#account" },
  { name: "submit", path: "/#submit" },
  { name: "planner", path: "/#planner", who: "user" },
  { name: "journal", path: "/#journal", who: "user" },
  { name: "crews", path: "/#crews", who: "user" },
  { name: "account", path: "/#account", who: "user" },
  { name: "review", path: "/#review", who: "admin" },
  { name: "sourcing", path: "/#sourcing", who: "admin" },
  { name: "engagement", path: "/#engagement", who: "admin" },
  { name: "people", path: "/#people", who: "admin" },
  { name: "venues", path: "/#venues", who: "admin" },
  { name: "found", path: "/#found", who: "admin" },
  { name: "sources", path: "/#sources", who: "admin" },
  { name: "issues", path: "/#issues", who: "admin" },
  { name: "approvals", path: "/#approvals", who: "admin" },
  { name: "members", path: "/#members", who: "admin" },
  { name: "health", path: "/#health", who: "admin" },
];
const ACCOUNTS = { user: [ENV.A11Y_USER, ENV.A11Y_PASSWORD], admin: [ENV.A11Y_ADMIN, ENV.A11Y_ADMIN_PASSWORD] };
const VIEWS = [["light", 1280, 900], ["dark", 1280, 900], ["light", 375, 812], ["dark", 375, 812]];

async function eventId() { // the first listed event that isn't one of the venues we don't use as test cases
  const res = await fetch(BASE.replace(/:\d+$/, "") + ":" + (ENV.A11Y_API_PORT || "8000") + "/events?limit=50");
  const body = await res.json();
  const e = (body.items || []).find((x) => !SKIP_VENUES.test(x.title + " " + ((x.venue || {}).name || "")));
  return e ? e.id : null;
}

async function signIn(browser, who) {
  const [email, password] = ACCOUNTS[who];
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE + "/#account");
  await page.waitForSelector("#login-email");
  await page.fill("#login-email", email);
  await page.fill("#login-password", password);
  await page.click("#login-form button[type=submit]");
  await page.waitForTimeout(1500);
  const name = await page.evaluate(() => (document.getElementById("nav-account") || {}).innerText || "");
  if (!name || /^sign in/i.test(name.trim())) throw new Error("test_a11y: couldn't sign in the " + who + " account at " + BASE + " (CORS, or a wrong password?)");
  return { ctx, state: await ctx.storageState() };
}

(async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  const id = await eventId();
  const sessions = {};
  const table = [], failures = [], skipped = [];
  for (const who of ["user", "admin"]) {
    if (!PAGES.some((p) => p.who === who && (!ONLY || ONLY.includes(p.name)))) continue;
    if (!ACCOUNTS[who][0] || !ACCOUNTS[who][1]) { skipped.push(who + " pages (no " + (who === "user" ? "A11Y_USER" : "A11Y_ADMIN") + ")"); continue; }
    sessions[who] = await signIn(browser, who);
  }
  for (const p of PAGES) {
    if (ONLY && !ONLY.includes(p.name)) continue;
    if (p.who && !sessions[p.who]) continue;
    if (p.path.includes("{event}") && id == null) { skipped.push(p.name + " (no event to open)"); continue; }
    const url = BASE + p.path.replace("{event}", id);
    for (const [theme, w, h] of VIEWS) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: theme, storageState: p.who ? sessions[p.who].state : undefined, reducedMotion: "reduce", bypassCSP: true /* axe is injected by hand */ });
      await ctx.addInitScript((t) => { try { localStorage.setItem("cc_theme", t); } catch (e) {} }, theme);
      const page = await ctx.newPage();
      await page.goto(url);
      await page.waitForTimeout(1800); // the API answers and the view paints
      await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
      await page.addScriptTag({ content: axeSource });
      const res = await page.evaluate(() => axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] }, resultTypes: ["violations"] }));
      const label = p.name + " " + theme + " " + w + "px";
      table.push([label, res.violations.length]);
      for (const v of res.violations) {
        failures.push({ label, id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 3).map((n) => n.target.join(" ")), count: v.nodes.length });
      }
      await ctx.close();
    }
  }
  await browser.close();
  if (ENV.A11Y_TABLE) table.forEach(([l, n]) => console.log(l.padEnd(34), n));
  skipped.forEach((s) => console.log("skipped:", s));
  failures.forEach((f) => console.log(`${f.impact.toUpperCase()} ${f.label}: ${f.id} (${f.count}) ${f.help}\n    ${f.nodes.join("\n    ")}`));
  const bad = failures.filter((f) => f.impact === "serious" || f.impact === "critical");
  if (failures.length) console.log(`\n${failures.length} violation(s), ${bad.length} serious or critical`);
  process.exit(bad.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
