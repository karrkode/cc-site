// Checks run in CI before the site deploys (CC-217): "Out of town" is gone from the venue form and the filters, and the
// clean-up on Venues deletes the events, then the empty venues, each behind the inline confirm from CC-153. Sources
// linked to them go off first, and one that won't stops it before anything is deleted.
//
//     node scripts/test_out_of_town.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const PUB = path.join(__dirname, "..", "public");
const read = (f) => fs.readFileSync(path.join(PUB, f), "utf8");
const html = read("index.html"), admin = read("js/admin.js"), util = read("js/util.js"), catalog = read("js/catalog.js");
const has = (s, part, msg) => assert.ok(s.includes(part), msg || "has " + part);

// --- the option is gone ---
assert.ok(!html.includes('value="out_of_town"'), "not in the venue form");
assert.ok(!catalog.includes("out_of_town"), "not in the catalog's Where filter");
assert.ok(!/AREA_NAMES = .*out_of_town/.test(util), "not in the area names");
assert.ok(!/REGIONS = \[[^;]*out_of_town/.test(util), "not in the sides of town, so not in My week or Find an outing");
has(util, "far: e.venue.area === \"out_of_town\"", "an old venue is still told apart until the clean-up has run");
has(read("js/planner.js"), "return !e.far &&", "and never suggested");

// --- an old out-of-town venue saved from the form sends nothing it can't ---
has(admin, 'if ($("vd-area").value && $("vd-area").value !== v.area)');
has(admin, 'if ($("vd-region").value !== (REGION_NAMES[v.region] ? v.region : ""))');

// --- a fake of just the elements the code touches ---
let FOCUS = null;
function el(id) {
  return { id, textContent: "", innerHTML: "", hidden: false, disabled: false, attrs: {}, handlers: {},
    setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k]; },
    addEventListener(t, f) { this.handlers[t] = f; }, focus() { FOCUS = this; }, querySelectorAll() { return []; } };
}
const ELS = {};
const $ = (id) => ELS[id] || (ELS[id] = el(id));
const CALLS = [];
const ANSWER = {}; // "METHOD path" -> status
let STATE = null;
const g = {
  $, Promise, console, VENUES: [], RELOADS: 0, GONE: [],
  esc: (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"),
  plural: (n, one, many) => n + " " + (n === 1 ? one : many),
  venueLabel: (v) => v.name + " · " + v.neighborhood,
  api(p, o) {
    const method = o && o.method || "GET", key = method + " " + p, st = ANSWER[key] || (method === "GET" ? 200 : 204);
    if (method !== "GET") CALLS.push(key + (o.body ? " " + JSON.stringify(o.body) : ""));
    return Promise.resolve({ ok: st < 300, status: st, body: method === "GET" ? STATE : { detail: "Server said no" } });
  },
  readJSON: (r) => Promise.resolve({ ok: r.ok, status: r.status, body: r.body }),
  errorText: (res) => (res ? res.body.detail : "No connection"),
  deleteRemoved(id) { return g.api("/events/" + id, { method: "DELETE" }).then((r) => (r.ok || r.status === 404 ? true : g.readJSON(r))); },
  reloadEvents() { g.RELOADS += 1; }, loadVenues() {},
};
vm.createContext(g);
vm.runInContext(admin.slice(admin.indexOf("// ---------- Out of town clean-up"), admin.indexOf("function openVenueDialog(")), g);
const flush = async (n = 30) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0)); };
const click = (sel) => $("oot-ask").handlers.click({ target: { closest: (s) => (s === sel ? {} : null) } });

const racine = { id: 1, name: "Racine Art Museum", neighborhood: "Racine, WI", events: 2, sources: [{ id: 9, name: "Racine shows" }] };
const pabst = { id: 2, name: "Pabst Theater", neighborhood: "Milwaukee, WI", events: 0, sources: [] };
const kenosha = { id: 3, name: "Kenosha Hall", neighborhood: "Kenosha, WI", events: 0, sources: [{ id: 8, name: "Kenosha shows" }] };

(async () => {
  // --- nothing out of town: the section stays hidden ---
  STATE = { venues: [], event_ids: [], waiting: 0 };
  await g.loadOutOfTown();
  assert.ok($("oot").hidden, "hidden when there's nothing to clean up");

  // --- the list and its counts ---
  STATE = { venues: [racine, pabst], event_ids: [11, 12], waiting: 1 };
  await g.loadOutOfTown();
  assert.ok(!$("oot").hidden);
  has($("oot-note").textContent, "2 venues and 2 events are still marked out of town.");
  has($("oot-note").textContent, "1 found event from their sources is waiting on Found events");
  has($("oot-list").innerHTML, "Racine, WI · 2 events"); has($("oot-list").innerHTML, "Source on: Racine shows");
  has($("oot-list").innerHTML, 'data-oot-del="2"', "an empty venue can go");
  assert.ok(!$("oot-list").innerHTML.includes('data-oot-del="1"'), "a venue with events can't");

  // --- Delete all events: says how many, and Keep them changes nothing ---
  $("oot-del-events").handlers.click.call($("oot-del-events"));
  has($("oot-ask").innerHTML, "<strong>Delete all 2 out-of-town events?</strong>");
  has($("oot-ask").innerHTML, "marks, plans and photos for them go too."); has($("oot-ask").innerHTML, "1 discovery source is turned off first.");
  has($("oot-ask").innerHTML, 'id="oot-yes">Delete 2 events</button>'); has($("oot-ask").innerHTML, ">Keep them</button>");
  assert.strictEqual(FOCUS, $("oot-no"), "focus starts on Keep");
  click("#oot-no");
  assert.strictEqual($("oot-ask").innerHTML, ""); assert.strictEqual(FOCUS, $("oot-del-events")); assert.deepStrictEqual(CALLS, []);

  // --- a source that won't turn off stops it before anything is deleted ---
  ANSWER["PATCH /admin/discovery/sources/9"] = 500;
  $("oot-del-events").handlers.click.call($("oot-del-events")); click("#oot-yes"); await flush();
  assert.deepStrictEqual(CALLS, ['PATCH /admin/discovery/sources/9 {"active":false}'], "no delete was sent");
  assert.strictEqual($("oot-status").textContent, "Racine shows couldn't be turned off, so nothing was deleted. Server said no");
  delete ANSWER["PATCH /admin/discovery/sources/9"];

  // --- yes: source off, then one delete per event, with a failure reported ---
  CALLS.length = 0; ANSWER["DELETE /events/12"] = 500;
  const seen = [];
  Object.defineProperty($("oot-status"), "textContent", { set(v) { seen.push(v); }, get() { return seen[seen.length - 1] || ""; } });
  $("oot-del-events").handlers.click.call($("oot-del-events")); click("#oot-yes"); await flush();
  assert.deepStrictEqual(CALLS, ['PATCH /admin/discovery/sources/9 {"active":false}', "DELETE /events/11", "DELETE /events/12"], "source first, then each event");
  assert.deepStrictEqual(seen.slice(0, 3), ["Turning off source 1 of 1…", "Deleting 1 of 2…", "Deleting 2 of 2…"]);
  assert.strictEqual(seen[seen.length - 1], "Deleted 1 event. 1 event couldn't be deleted: Server said no");
  assert.strictEqual($("edit-live").textContent, seen[seen.length - 1], "announced even if the section hides");
  assert.ok(g.RELOADS >= 1, "the site's lists load again"); assert.strictEqual(g.VENUES, null);

  // --- one event left: the words follow ---
  STATE = { venues: [racine, pabst], event_ids: [12], waiting: 0 };
  await g.loadOutOfTown();
  $("oot-del-events").handlers.click.call($("oot-del-events"));
  has($("oot-ask").innerHTML, "<strong>Delete the out-of-town event?</strong>"); has($("oot-ask").innerHTML, ">Keep it</button>");
  click("#oot-no");

  // --- Delete all empty venues: only the empty ones, their sources off first; a 404 counts as gone ---
  STATE = { venues: [{ ...racine, events: 1 }, pabst, kenosha], event_ids: [12], waiting: 0 };
  await g.loadOutOfTown();
  CALLS.length = 0; ANSWER["DELETE /venues/3"] = 404;
  $("oot-del-venues").handlers.click.call($("oot-del-venues"));
  has($("oot-ask").innerHTML, "<strong>Delete all 2 empty out-of-town venues?</strong>"); has($("oot-ask").innerHTML, 'id="oot-yes">Delete 2 venues</button>');
  STATE = { venues: [], event_ids: [], waiting: 0 };
  click("#oot-yes"); await flush();
  assert.deepStrictEqual(CALLS, ['PATCH /admin/discovery/sources/8 {"active":false}', "DELETE /venues/2", "DELETE /venues/3"]);
  assert.strictEqual(seen[seen.length - 1], "Deleted 2 venues.");
  assert.ok($("oot").hidden, "the section hides once it's all gone"); assert.strictEqual(FOCUS, $("venues-title"));

  // --- Delete venue on one row ---
  STATE = { venues: [pabst], event_ids: [], waiting: 0 };
  await g.loadOutOfTown();
  CALLS.length = 0;
  const row = el("row"); row.attrs["data-oot-del"] = "2";
  $("oot-list").handlers.click({ target: { closest: () => row } });
  has($("oot-ask").innerHTML, "<strong>Delete Pabst Theater · Milwaukee, WI?</strong>"); has($("oot-ask").innerHTML, 'id="oot-yes">Delete venue</button>');
  STATE = { venues: [], event_ids: [], waiting: 0 };
  click("#oot-yes"); await flush();
  assert.deepStrictEqual(CALLS, ["DELETE /venues/2"]);
  assert.strictEqual(seen[seen.length - 1], "Deleted 1 venue.");

  console.log("test_out_of_town: ok");
})().catch((e) => { console.error(e); process.exit(1); });
