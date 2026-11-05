// Checks run in CI before the site deploys (CC-219): every venue on the admin Venues page has Delete or Hide, a hidden one
// has Unhide, and each row says if it's hidden or pending.
//
//     node scripts/test_hide_venue.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const admin = fs.readFileSync(path.join(__dirname, "..", "public", "js", "admin.js"), "utf8");
const part = (from, to) => admin.slice(admin.indexOf(from), admin.indexOf(to));

// Just the painting, with a fake of the elements it touches
const els = {};
const $ = (id) => els[id] || (els[id] = { value: "", checked: false, textContent: "", innerHTML: "" });
const box = { $, esc: String, plural: (n, one, many) => n + " " + (n === 1 ? one : many), REGION_NAMES: {}, hoursComplete: () => true,
  hoursNote: () => "", typeLabel: String, siteLink: String, VLIST: [] };
vm.createContext(box);
vm.runInContext(part("function venueLabel", "function paintVenues") + part("function paintVenues", '$("v-q").addEventListener'), box);

function row(v) {
  box.VLIST = [Object.assign({ id: 7, name: "Old Hall", neighborhood: "Loop", events: 0 }, v)];
  box.paintVenues();
  return els["venue-list"].innerHTML;
}
const buttons = (html) => ["hide", "unhide", "delete"].filter((b) => html.includes("data-venue-" + b + "="));

assert.deepStrictEqual(buttons(row({ events: 3 })), ["hide"], "a venue with events can be hidden, not deleted");
assert.deepStrictEqual(buttons(row({ events: 0 })), ["delete"], "a venue with no events keeps Delete");
assert.deepStrictEqual(buttons(row({ events: 3, hidden: true })), ["unhide"], "a hidden venue gets Unhide");
assert.deepStrictEqual(buttons(row({ events: 0, hidden: true })), ["unhide", "delete"], "and can go if its events have left");

assert.ok(!/>Hidden<|>Pending</.test(row({ events: 3 })), "an ordinary venue says neither");
assert.ok(row({ hidden: true }).includes(">Hidden<"), "a hidden venue says so");
assert.ok(row({ pending: true }).includes(">Pending<"), "and a pending one");
const both = row({ hidden: true, pending: true });
assert.ok(both.includes(">Hidden<") && both.includes(">Pending<"), "a venue can be both");

// --- the dialog posts to the routes the API has ---
assert.ok(admin.includes('api("/venues/" + v.id + "/" + d.mode, { method: "POST" })'));
console.log("ok: hide venue");
