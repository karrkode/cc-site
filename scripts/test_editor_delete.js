// Checks run in CI before the site deploys (CC-202): the edit dialog's Delete sends ?live=true only for an approved
// (live) event. Pending and withdrawn events send no flag, so the API's 409 guard still protects against a slip.
//
//     node scripts/test_editor_delete.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const admin = fs.readFileSync(path.join(__dirname, "..", "public", "js", "admin.js"), "utf8");
const from = admin.indexOf('$("ed-delete-yes").addEventListener');
assert.ok(from > 0, "the Delete-for-good handler is there");
const src = admin.slice(from, admin.indexOf("// Bring every list", from));

const CALLS = [], HANDLERS = {};
const g = {
  Promise, encodeURIComponent, EDITING: null,
  $: (id) => ({ textContent: "", addEventListener(t, f) { HANDLERS[id] = f; } }),
  setEditorBusy() {}, editorFail() {}, closeEditor() {}, eventChanged() {}, readJSON: (r) => Promise.resolve(r),
  api(p, o) { CALLS.push(o.method + " " + p); return Promise.resolve({ ok: true, status: 204 }); },
};
vm.createContext(g);
vm.runInContext(src, g);

(async () => {
  for (const [status, want] of [["approved", "DELETE /events/7?live=true"], ["pending", "DELETE /events/7"], ["withdrawn", "DELETE /events/7"]]) {
    CALLS.length = 0; g.EDITING = { e: { id: 7, title: "Hamlet", status } };
    HANDLERS["ed-delete-yes"](); await new Promise((r) => setTimeout(r, 0));
    assert.deepStrictEqual(CALLS, [want], status + " event");
  }
  console.log("ok: editor delete sends ?live=true only for approved events");
})().catch((e) => { console.error(e); process.exit(1); });
