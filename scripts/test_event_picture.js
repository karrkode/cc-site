// Checks run in CI before the site deploys (CC-265): an admin removes or replaces an event's picture in the edit
// dialog. The dialog shows the current picture or the category water; a new file previews first, and nothing reaches
// the API until Save. Save sends DELETE or PUT /events/<id>/image, then the other changes; Cancel sends nothing; a
// refused file keeps the old picture and says why; a found event being approved has no picture controls.
//
//     node scripts/test_event_picture.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const PUB = path.join(__dirname, "..", "public");
const read = (f) => fs.readFileSync(path.join(PUB, f), "utf8");
const html = read("index.html"), css = read("css/site.css"), admin = read("js/admin.js"), found = read("js/found.js");
const has = (s, part, msg) => assert.ok(s.includes(part), msg || "has " + part);

// --- the dialog: a labelled file input that takes only what the API takes, Remove, and Undo ---
const dlg = html.slice(html.indexOf('id="edit-dialog"'), html.indexOf("</dialog>", html.indexOf('id="edit-dialog"')));
has(dlg, '<fieldset id="ed-picture-controls" class="ed-picture">');
has(dlg, '<label for="ed-image-file">Upload a new picture</label>');
has(dlg, 'accept="image/jpeg,image/png,image/webp,image/gif,image/avif"', "the API's five types");
has(dlg, '<button class="btn ghost" type="button" id="ed-image-remove">Remove picture</button>');
has(found, '$("ed-picture-controls").hidden = on;', "approving a found event has no picture controls");
// the styles sit with the other dialog rules, before the QR screen (test_invite.js keeps that one token-free)
const at = css.indexOf("/* CC-265: admin image changes");
assert.ok(at > 0 && at < css.indexOf("/* CC-126: the invite QR code fills the screen"), "the CC-265 rules come before the QR screen");
has(css, 'input[type="file"]::file-selector-button', "the file button looks like the ghost buttons");

// --- a fake of just the elements the editor touches ---
let FOCUS = null;
const ELS = {};
function el(id) {
  return { id, value: "", textContent: "", innerHTML: "", hidden: false, disabled: false, checked: false, open: false, files: [],
    handlers: {}, addEventListener(t, f) { (this.handlers[t] = this.handlers[t] || []).push(f); },
    fire(t) { (this.handlers[t] || []).forEach((f) => f.call(this, { preventDefault() {} })); },
    focus() { FOCUS = this; }, querySelectorAll: () => [], dispatchEvent() {} };
}
const $ = (id) => ELS[id] || (ELS[id] = el(id));
const CALLS = [], ANSWER = {}, CHANGED = [];
let URLS = 0;
const g = {
  $, Promise, console, Object, Array, JSON, isNaN, Date,
  esc: (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"),
  document: { addEventListener() {}, contains: () => false, querySelectorAll: () => [], activeElement: null },
  URL: { createObjectURL: () => "blob:" + ++URLS, revokeObjectURL() {} },
  TYPE_ORDER: ["Theater", "Music", "Visual Art"], KNOWN: {}, VENUES: [], VIEWS: {}, visible: () => false, isAdmin: () => true,
  foundMode() {}, localInputValue: () => "", fillWeekly() {}, setRun() {}, datesToLookUp: () => false,
  isFixedRun: () => false, readRun: () => ({ run_dates: [] }), weeklyChange: () => null, minPrice: () => null,
  openDialog: (d) => { d.open = true; }, closeDialog: (d) => { d.open = false; d.fire("close"); },
  paintWater() {}, listingImageSrc: (u) => u, waterHTML: () => "<water>", catClass: (t) => " cat-" + String(t).toLowerCase(),
  api(p, o) {
    const call = (o && o.method || "GET") + " " + p + (o && o.raw ? " raw:" + o.raw.type : "") + (o && o.body ? " " + JSON.stringify(o.body) : "");
    CALLS.push(call);
    const st = ANSWER[(o && o.method || "GET") + " " + p] || 200;
    const imageUrl = o && o.method === "PUT" ? "/event-images/1/new.webp" : null;
    return Promise.resolve({ ok: st < 300, status: st, body: st < 300 ? { id: 1, title: "Hamlet", image_url: imageUrl } : { detail: "Server said no" } });
  },
  readJSON: (r) => Promise.resolve(r),
  errorText: (res) => (res ? res.body.detail : "No connection"),
  toEvent: (raw) => Object.assign({}, EVENT, { imageUrl: raw.image_url }),
  eventChanged: (id, e) => CHANGED.push([id, e.imageUrl]),
};
vm.createContext(g);
vm.runInContext(admin.slice(admin.indexOf("var EDITING = null"), admin.indexOf('$("ed-withdraw").addEventListener')), g);
const EVENT = { id: 1, title: "Hamlet", type: "Theater", status: "approved", venue: "Goodman Theatre", hood: "Loop",
  runDates: [], imageUrl: "/event-images/1/old.webp" };
const flush = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); };
const open = (over) => { CALLS.length = 0; CHANGED.length = 0; g.openEditor(Object.assign({}, EVENT, over), null); };
const choose = (type, size) => { $("ed-image-file").files = [{ type, size }]; $("ed-image-file").fire("change"); };
const save = async () => { $("edit-form").fire("submit"); await flush(); };

(async () => {
  // --- opening: the current picture, or the water when there is none ---
  open();
  has($("ed-picture-preview").innerHTML, 'src="/event-images/1/old.webp"', "shows the current picture");
  assert.strictEqual($("ed-image-note").textContent, "Current event picture.");
  assert.strictEqual($("ed-image-remove").disabled, false); assert.strictEqual($("ed-image-undo").hidden, true);
  open({ imageUrl: null });
  assert.ok(!$("ed-picture-preview").innerHTML.includes("<img"), "only the water when there's no picture");
  assert.strictEqual($("ed-image-note").textContent, "Default category water (no picture).");
  assert.strictEqual($("ed-image-remove").disabled, true, "nothing to remove");

  // --- a new file previews, and Cancel sends nothing ---
  open(); choose("image/png", 5000);
  has($("ed-picture-preview").innerHTML, 'src="blob:', "previews the chosen file");
  assert.strictEqual($("ed-image-undo").hidden, false);
  $("ed-cancel").fire("click"); await flush();
  assert.deepStrictEqual(CALLS, [], "Cancel never touches the API");

  // --- Undo goes back to the current picture, and an unchanged form just closes ---
  open(); $("ed-image-remove").fire("click");
  assert.strictEqual($("ed-image-note").textContent, "Default water selected. Save changes to remove the picture.");
  $("ed-image-undo").fire("click");
  assert.strictEqual($("ed-image-note").textContent, "Current event picture.");
  await save();
  assert.deepStrictEqual(CALLS, [], "nothing changed, nothing sent");

  // --- the browser refuses what the API would: the wrong type, or too big ---
  open(); choose("image/svg+xml", 500);
  assert.strictEqual($("ed-error").textContent, "Choose a JPEG, PNG, WebP, GIF or AVIF file smaller than 3.8 MB.");
  assert.strictEqual($("ed-image-note").textContent, "Current event picture.", "the picture stays");
  choose("image/jpeg", 3800001);
  assert.strictEqual($("ed-image-note").textContent, "Current event picture.");

  // --- Save: remove, then upload ---
  open(); $("ed-image-remove").fire("click"); await save();
  assert.deepStrictEqual(CALLS, ["DELETE /events/1/image"]);
  assert.deepStrictEqual(CHANGED, [[1, null]], "every list gets the water");
  assert.strictEqual($("edit-live").textContent, "Restored the default water for Hamlet.");
  assert.strictEqual($("edit-dialog").open, false);
  open(); choose("image/webp", 5000); await save();
  assert.deepStrictEqual(CALLS, ["PUT /events/1/image raw:image/webp"], "the file as it is");
  assert.strictEqual($("edit-live").textContent, "Updated the picture for Hamlet.");

  // --- the server refuses the file: the error shows by the file input and the dialog stays open ---
  open(); ANSWER["PUT /events/1/image"] = 422; choose("image/png", 5000); await save();
  assert.strictEqual($("ed-error").textContent, "Server said no"); assert.strictEqual(FOCUS, $("ed-image-file"));
  assert.strictEqual($("edit-dialog").open, true); assert.deepStrictEqual(CHANGED, [], "nothing changed on the page");
  delete ANSWER["PUT /events/1/image"]; $("ed-cancel").fire("click");

  // --- a picture and other changes: the picture first, then the fields ---
  open(); choose("image/png", 5000); $("ed-title").value = "Hamlet, again"; await save();
  assert.deepStrictEqual(CALLS, ["PUT /events/1/image raw:image/png", 'PATCH /events/1 {"title":"Hamlet, again"}']);
  assert.strictEqual($("edit-live").textContent, "Saved changes and picture for Hamlet, again.");

  // --- the fields fail after the picture saved: the dialog shows the saved picture, and a retry sends only the fields ---
  open(); ANSWER["PATCH /events/1"] = 500; $("ed-image-remove").fire("click"); $("ed-title").value = "Hamlet, again"; await save();
  assert.strictEqual($("ed-error").textContent, "Server said no"); assert.strictEqual($("edit-dialog").open, true);
  assert.deepStrictEqual(CHANGED, [[1, null]], "the lists already have the water");
  assert.strictEqual($("ed-image-note").textContent, "Default category water (no picture).", "the editor knows it's saved");
  CALLS.length = 0; delete ANSWER["PATCH /events/1"]; await save();
  assert.deepStrictEqual(CALLS, ['PATCH /events/1 {"title":"Hamlet, again"}'], "the retry doesn't send the picture again");

  console.log("ok: the event picture in the edit dialog (CC-265)");
})().catch((err) => { console.error(err); process.exit(1); });
