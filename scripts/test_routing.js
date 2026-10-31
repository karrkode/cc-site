// Checks run in CI before the site deploys (CC-157): the address follows the view. Showing a view pushes its address
// (syncAddress, util.js), so Back and Forward move between views; the popstate routes it back (route and
// openFromHash, start.js), and a reload of any view's address opens that view, the admin pages and #e/<id> included.
// A redirect (an admin page for someone who isn't one) replaces the entry rather than adding one Back can't get past.
//
//     node scripts/test_routing.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const JS = path.join(__dirname, "..", "public", "js");
const read = (f) => fs.readFileSync(path.join(JS, f), "utf8");
const helper = (file, name) => read(file).match(new RegExp("function " + name + "\\([\\s\\S]*?\\n}\\n"))[0];
const tick = () => new Promise((r) => setImmediate(r));

// A tab: its history entries, and a location read from the current one. Back and Forward fire popstate, as browsers do.
function tab(url, opt) {
  const entries = [{ url, state: null }];
  let at = 0;
  const parts = () => { const u = new URL(entries[at].url, "https://chiculturecrew.com"); return u; };
  const location = {
    get pathname() { return parts().pathname; }, get search() { return parts().search; },
    get hash() { return parts().hash; }, get href() { return parts().href + (/#$/.test(entries[at].url) ? "#" : ""); },
  };
  const history = {
    get length() { return entries.length; }, get state() { return entries[at].state; },
    pushState(state, t, u) { entries.splice(at + 1); entries.push({ url: u, state }); at++; },
    replaceState(state, t, u) { entries[at] = { url: u, state }; },
    back() { if (at > 0) { at--; g.route(); } }, forward() { if (at < entries.length - 1) { at++; g.route(); } },
  };
  const views = [];
  const admin = !(opt && opt.notAdmin);
  const g = {
    location, history, console, Promise,
    AUTH: { token: "t" }, EV: { from: null }, views,
    maybeSignedIn: () => false, refreshSession: () => Promise.resolve(), takeLinkToken: () => null,
    isAdmin: () => admin, visible: (v) => views[views.length - 1] === v, renderCatalog() {}, track() {},
    closeEvent() { const from = g.EV.from || "catalog"; g.EV.from = null; g.show(from); },
    openEvent(id, push) {
      if (push) { g.EV.from = views[views.length - 1]; history.pushState(null, "", "#e/" + id); }
      else { if (!g.visible("event")) g.EV.from = null; if (location.hash !== "#e/" + id) history.replaceState(null, "", "#e/" + id); }
      g.show("event");
    },
  };
  // show() itself paints the page; here it only does what the address needs
  vm.createContext(g);
  vm.runInContext("var ROUTE = null; function show(name) { views.push(name); syncAddress(name); }" +
    helper("util.js", "onJoinPage") + helper("util.js", "viewOf") + helper("util.js", "syncAddress") +
    helper("start.js", "openFromHash") + helper("start.js", "route"), g);
  ["account", "planner", "journal", "crews", "submit", "join"].forEach((v) => { g["open" + v[0].toUpperCase() + v.slice(1)] = () => g.show(v); });
  g.openJoinPage = () => g.show("join"); g.startPlan = () => g.show("plan");
  ["review", "venues", "stats", "sources", "found", "issues", "approvals", "members", "card"].forEach((v) => {
    g["open" + v[0].toUpperCase() + v.slice(1)] = () => (admin ? g.show(v) : g.openAccount());
  });
  g.FOUND = {};
  return { g, history, location, views };
}
const view = (t) => t.views[t.views.length - 1];
const addr = (t) => t.location.pathname + t.location.search + t.location.hash;

let n = 0;
async function check(name, fn) { await fn(); n++; console.log("ok  " + name); }

(async () => {
  await check("the wiring: show() keeps the address, and start.js routes popstate (not just hashchange)", () => {
    assert.match(helper("util.js", "show"), /syncAddress\(name\)/);
    assert.match(read("start.js"), /addEventListener\("popstate", route\)/);
    assert.doesNotMatch(read("start.js"), /addEventListener\("hashchange"/);
  });

  await check("each view pushes its address, and Back and Forward move between them", async () => {
    const t = tab("/");
    t.g.show("catalog"); t.g.show("submit"); t.g.show("account");
    assert.strictEqual(t.history.length, 4);
    assert.strictEqual(addr(t), "/#account");
    t.history.back(); await tick();
    assert.strictEqual(view(t), "submit"); assert.strictEqual(addr(t), "/#submit");
    t.history.back(); await tick(); t.history.back(); await tick();
    assert.strictEqual(view(t), "home"); assert.strictEqual(addr(t), "/");
    t.history.forward(); await tick();
    assert.strictEqual(view(t), "catalog");
    assert.strictEqual(t.history.length, 4, "routing back to a view adds no entry");
  });

  await check("showing the view already in the address adds nothing", () => {
    const t = tab("/#crews");
    t.g.show("crews"); t.g.show("crews");
    assert.strictEqual(t.history.length, 1);
  });

  const reloads = { account: "account", planner: "planner", journal: "journal", crews: "crews", submit: "submit", plan: "plan", catalog: "catalog",
    review: "review", venues: "venues", stats: "stats", sources: "sources", found: "found", issues: "issues", approvals: "approvals",
    members: "members", card: "card", "e/5": "event", "found/skipped": "found", "issues/ISS-0007": "issues", "source-3": "sources" };
  await check("a reload opens the view in the address and leaves the address as it is", async () => {
    for (const h of Object.keys(reloads)) {
      const t = tab("/#" + h);
      t.g.openFromHash(); await tick();
      assert.strictEqual(view(t), reloads[h], "#" + h);
      assert.strictEqual(addr(t), "/#" + h, "#" + h);
      assert.strictEqual(t.history.length, 1, "#" + h);
    }
  });

  await check("every view with an address of its own is routed", async () => {
    const own = read("util.js").match(/var VIEWS = \{([^}]*)\}/)[1].match(/(\w+):/g).map((k) => k.slice(0, -1))
      .filter((v) => ["home", "join", "event", "reset", "verify"].indexOf(v) < 0);
    for (const v of own) {
      const t = tab("/#" + v);
      assert.ok(t.g.openFromHash(), "#" + v + " isn't routed"); await tick();
      assert.strictEqual(view(t), v);
    }
  });

  await check("the journal (CC-159): its own address from the you menu and My week, and Back returns to My week", async () => {
    const html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
    assert.match(html, /data-me="journal"/, "the you menu (and the phone sheet, the same list) opens it");
    assert.match(html, /id="planner-tojournal" data-go="journal"/, "My week keeps a line to it, so old #planner links reach it");
    assert.doesNotMatch(html.match(/id="view-planner"[\s\S]*?<\/section>\s*<!-- Cultural journal/)[0], /went-grid/, "My week no longer holds the journal");
    assert.match(html, /id="view-journal"[\s\S]*id="went-grid"/);
    const t = tab("/");
    t.g.show("planner"); t.g.openJournal();
    assert.strictEqual(addr(t), "/#journal");
    t.history.back(); await tick();
    assert.strictEqual(view(t), "planner"); assert.strictEqual(addr(t), "/#planner");
    t.history.forward(); await tick();
    assert.strictEqual(view(t), "journal"); assert.strictEqual(t.history.length, 3);
  });

  await check("an admin page for someone who isn't one: Your account replaces it, so Back isn't stuck", async () => {
    const t = tab("/#stats", { notAdmin: true });
    t.g.openFromHash(); await tick();
    assert.strictEqual(view(t), "account");
    assert.strictEqual(addr(t), "/#account");
    assert.strictEqual(t.history.length, 1);
  });

  await check("a hash that isn't a view, or a bare #, leaves the page alone", async () => {
    for (const u of ["/#main", "/#"]) {
      const t = tab(u); t.g.show("catalog"); t.history.replaceState(null, "", u);
      t.g.route(); await tick();
      assert.strictEqual(view(t), "catalog", u);
    }
  });

  await check("an event: Back from a view opened on it returns to it, and Back again closes it", async () => {
    const t = tab("/");
    t.g.show("catalog"); t.g.openEvent("5", true); t.g.show("planner");
    assert.strictEqual(addr(t), "/#planner");
    t.history.back(); await tick();
    assert.strictEqual(view(t), "event"); assert.strictEqual(addr(t), "/#e/5");
    t.history.back(); await tick();
    assert.strictEqual(view(t), "catalog"); assert.strictEqual(addr(t), "/#catalog");
  });

  await check("leaving the join page goes to the site's own address, and Back returns to /join", async () => {
    const t = tab("/join?utm_source=x");
    t.g.openFromHash(); await tick();
    assert.strictEqual(view(t), "join");
    t.g.show("catalog");
    assert.strictEqual(addr(t), "/?utm_source=x#catalog");
    t.history.back(); await tick();
    assert.strictEqual(view(t), "join"); assert.strictEqual(addr(t), "/join?utm_source=x");
  });

  console.log("\n" + n + " checks passed");
})().catch((e) => { console.error(e); process.exit(1); });
