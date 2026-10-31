// Checks run in CI before the site deploys (CC-153): the "Comedy and Educational, withdrawn" list on Review has
// Delete on each event and Delete all for the list, each behind the same inline confirm as deleting a source. Both use
// the admin DELETE /events/<id>, one at a time, and the list and its count follow without a reload.
//
//     node scripts/test_removed.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const PUB = path.join(__dirname, "..", "public");
const read = (f) => fs.readFileSync(path.join(PUB, f), "utf8");
const html = read("index.html"), css = read("css/site.css"), admin = read("js/admin.js");
const has = (s, part, msg) => assert.ok(s.includes(part), msg || "has " + part);

// --- the page: a Delete all button, a place for its confirm, and a status line for the progress ---
const section = html.slice(html.indexOf('id="removed"'), html.indexOf('id="othertypes"'));
has(section, '<button class="btn danger" type="button" id="removed-del-all" aria-expanded="false">Delete all…</button>');
has(section, '<div id="removed-ask"></div><p class="hint" id="removed-status" role="status"></p>');
has(css, ".src-confirm, .rm-confirm { flex-basis: 100%; display: grid; gap: 10px; padding: 12px 14px; border-radius: var(--r-ctl); background: var(--danger-soft); color: var(--on-danger-soft); }",
  "the confirm is the source delete's: square, on the pale band, never red text");

// --- a fake of just the elements the code touches ---
function el(id) {
  const e = { id, textContent: "", innerHTML: "", hidden: false, disabled: false, attrs: {}, handlers: {}, focused: 0,
    setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k]; },
    addEventListener(t, f) { this.handlers[t] = f; }, focus() { FOCUS = this; },
    querySelector() { return null; }, insertAdjacentHTML(_, h) { this.innerHTML += h; } };
  return e;
}
let FOCUS = null;
const ELS = {};
const $ = (id) => ELS[id] || (ELS[id] = el(id));
function item(id, title) { // one event row in #removed-list
  const alt = el("alt-" + id), del = el("del-" + id);
  del.attrs = { "data-rm-del": String(id), "data-title": title };
  const it = { alt, del, remove() { const l = $("removed-list").children; l.splice(l.indexOf(it), 1); },
    get nextElementSibling() { const l = $("removed-list").children; return l[l.indexOf(it) + 1] || null; },
    get previousElementSibling() { const l = $("removed-list").children; return l[l.indexOf(it) - 1] || null; },
    querySelector(sel) { return sel === "[data-rm-del]" ? del : sel === ".alt-text" ? alt : sel === "select" ? el("sel-" + id) : null; } };
  return it;
}
const CALLS = [];
const ANSWER = {}; // id -> status; 204 when not set
const g = {
  $, Promise, console,
  KNOWN: {}, WENT: {}, MYPLANS: {}, TYPE_ORDER: ["Theater", "Music", "Visual Art"], RELOADS: 0,
  esc: (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"),
  plural: (n, one, many) => n + " " + (n === 1 ? one : many),
  api(p, o) { CALLS.push((o && o.method || "GET") + " " + p); const st = ANSWER[p.split("/").pop()] || 204;
    return Promise.resolve({ ok: st < 300, status: st, body: { detail: "Server said no" } }); },
  readJSON: (r) => Promise.resolve({ ok: r.ok, status: r.status, body: r.body }),
  errorText: (res) => (res ? res.body.detail : "No connection"),
  toEvent: (raw) => ({ id: raw.id, title: raw.title }),
  queueItemHTML: (e, actions, note) => "<item>" + actions + "|" + note + "</item>",
  editButtonHTML: () => "<edit>",
  refocusAfterEdit() {}, reloadEvents() { g.RELOADS += 1; },
};
vm.createContext(g);
vm.runInContext(admin.slice(admin.indexOf("// CC-133: what removing"), admin.indexOf("// CC-125: events whose type")), g);
const flush = () => new Promise((r) => setTimeout(r, 0));

(async () => {
  // --- each event has its own Delete…, named for screen readers ---
  const row = g.removedItemHTML({ id: 7, title: "BYOT", withdrawn_reason: "Comedy", category: "Comedy" });
  has(row, '<button class="btn danger" type="button" data-rm-del="7" data-title="BYOT" aria-label="Delete BYOT">Delete…</button>');
  has(row, "|Type was Comedy", "keeps why it was withdrawn");
  const ask = g.rmAskHTML("7", "BYOT");
  has(ask, "<strong>Delete BYOT?</strong> Everyone's “I've been” marks, plans and photos for it go too. This can't be undone.");
  has(ask, 'data-rm-del-yes="7">Delete event</button>'); has(ask, 'data-rm-del-no="7">Keep it</button>');

  // --- Delete one: the admin delete, then the row goes and the count follows ---
  const list = $("removed-list");
  list.children = [item(1, "One"), item(2, "Two"), item(3, "Three")];
  const one = list.children[0];
  list.querySelector = () => null;
  const yes = { getAttribute: () => "1", closest: () => one, set disabled(v) {} };
  list.handlers.click({ target: { closest: (sel) => (sel === "[data-rm-del-yes]" ? yes : null) } });
  await flush(); await flush(); await flush();
  assert.deepStrictEqual(CALLS, ["DELETE /events/1"], "deletes with the admin event delete");
  assert.strictEqual(list.children.length, 2, "the row is gone");
  has($("removed-note").textContent, "2 events are hidden from the site.", "the count follows");
  assert.strictEqual($("removed-del-all").textContent, "Delete all 2…");
  assert.strictEqual($("edit-live").textContent, "Deleted One.");
  assert.strictEqual(g.RELOADS, 1, "the site's lists load again");

  // --- Delete all: a confirm that says how many, then one at a time with progress; a failure stays with its reason ---
  CALLS.length = 0; list.children = [item(4, "Four"), item(5, "Five"), item(6, "Six")]; ANSWER["5"] = 500; ANSWER["6"] = 404;
  $("removed-del-all").handlers.click();
  has($("removed-ask").innerHTML, "<strong>Delete all 3 events?</strong>", "the confirm says how many go");
  has($("removed-ask").innerHTML, 'id="rm-all-yes">Delete 3 events</button>');
  assert.strictEqual(FOCUS, $("rm-all-no"), "focus starts on Keep them");
  const seen = [];
  Object.defineProperty($("removed-status"), "textContent", { set(v) { seen.push(v); }, get() { return seen[seen.length - 1] || ""; } });
  $("removed-ask").handlers.click({ target: { closest: (sel) => (sel === "#rm-all-yes" ? $("rm-all-yes") : null) } });
  for (let i = 0; i < 12; i++) await flush();
  assert.deepStrictEqual(CALLS, ["DELETE /events/4", "DELETE /events/5", "DELETE /events/6"], "one delete per event, in order");
  assert.deepStrictEqual(seen.slice(0, 3), ["Deleting 1 of 3…", "Deleting 2 of 3…", "Deleting 3 of 3…"], "progress as it goes");
  assert.strictEqual(seen[seen.length - 1], "Deleted 2 events. 1 event couldn't be deleted; it says why.", "404 counts as gone");
  assert.strictEqual($("edit-live").textContent, seen[seen.length - 1], "announced even if the section hides");
  assert.strictEqual(list.children.length, 1, "only the failed one is left");
  has(list.children[0].alt.innerHTML, '<p class="form-error">Server said no</p>', "it says why");
  assert.ok(!$("removed").hidden); has($("removed-note").textContent, "1 event is hidden");
  assert.strictEqual($("removed-ask").innerHTML, "", "the confirm closes");
  assert.strictEqual($("removed-del-all").disabled, false);

  // --- deleting the last one hides the section ---
  CALLS.length = 0; delete ANSWER["5"];
  $("removed-del-all").handlers.click();
  has($("removed-ask").innerHTML, "<strong>Delete this event?</strong>");
  $("removed-ask").handlers.click({ target: { closest: (sel) => (sel === "#rm-all-yes" ? $("rm-all-yes") : null) } });
  for (let i = 0; i < 6; i++) await flush();
  assert.strictEqual(list.children.length, 0);
  assert.ok($("removed").hidden, "the section hides once it's empty");
  assert.strictEqual(FOCUS, $("review-title"), "focus goes to the page title");

  console.log("test_removed: ok");
})().catch((e) => { console.error(e); process.exit(1); });
