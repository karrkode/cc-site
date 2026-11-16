// Checks run in CI before the site deploys (CC-258): a venue's hours follow its category. Visual Art gives opening
// hours, Theater and Music give usual show times, no category gives both. This drives the Hours drop-down on the
// Venues page, the line under a venue, and the folded section of the Hours form.
//
//     node scripts/test_venue_hours.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");
const js = (f) => fs.readFileSync(path.join(__dirname, "..", "public", "js", f), "utf8");
const admin = js("admin.js"), hours = js("hours.js");
const part = (src, from, to) => { const a = src.indexOf(from), b = src.indexOf(to); assert(a >= 0 && b > a, "marker not found: " + from + " .. " + to); return src.slice(a, b); };

const week = { mon: null, tue: ["10:00", "17:00"], wed: ["10:00", "17:00"], thu: ["10:00", "17:00"], fri: ["10:00", "17:00"], sat: ["10:00", "17:00"], sun: null };
const els = {};
const $ = (id) => els[id] || (els[id] = { hidden: false, value: "", textContent: "", innerHTML: "", attrs: {},
  setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; }, parentNode: null });
const form = { order: [], insertBefore(n) { this.order = this.order.filter((x) => x !== n).concat([n]); } };
$("hours-form"); els["hours-form"].insertBefore = (n) => { form.insertBefore(n); };
const box = { $ };
vm.createContext(box);
vm.runInContext(part(admin, "function hoursKinds", "// CC-219: why a venue"), box);
vm.runInContext(part(hours, "function hoursNote", "function hoursRows") + part(hours, "function paintHoursSections", "$(\"hd-more\").addEventListener"), box);

const V = (o) => Object.assign({ open_hours: {}, show_times: {}, category: "" }, o);
// The drop-down's rule
assert(box.hoursComplete(V({ category: "Visual Art", open_hours: week })), "a gallery is complete by its opening hours");
assert(!box.hoursComplete(V({ category: "Visual Art", show_times: { fri: ["19:30"] } })), "show times don't make a gallery complete");
assert(box.hoursComplete(V({ category: "Theater", show_times: { fri: ["19:30"] } })), "a theater is complete by its show times");
assert(box.hoursComplete(V({ category: "Music", show_times: { sat: ["20:00"] } })));
assert(!box.hoursComplete(V({ category: "Theater", open_hours: week })), "opening hours don't make a theater complete");
assert(!box.hoursComplete(V({ category: "Theater", show_times: { fri: [] } })), "an empty day is not a show time");
assert(box.hoursComplete(V({ open_hours: week })) && box.hoursComplete(V({ show_times: { fri: ["19:30"] } })), "no category: either kind counts");
assert(!box.hoursComplete(V({})), "no category and nothing filled in");
// The line under the venue only counts the hours the venue gives
const note = (o) => box.hoursNote(V(o));
assert(/set by an admin/.test(note({ category: "Theater", show_times_by: "admin" })));
assert.strictEqual(note({ category: "Theater", open_hours_by: "admin" }), "", "a theater's box office hours aren't its hours line");
assert(/website/.test(note({ category: "Visual Art", open_hours_by: "discovery", show_times_by: "admin" })));
assert(/set by an admin/.test(note({ show_times_by: "admin" })), "no category counts both");
assert(!box.hoursComplete(V({ category: "Theater", show_times: { fri: [] } })));
// The form: order and folding
const fold = () => ({ hidden: els["hd-more"].hidden, text: els["hd-more"].textContent });
els["hd-from"] = { nextSibling: null }; els["hd-sec-open"] = $("hd-sec-open"); $("hd-sec-shows"); $("hd-more");
function paint(o) { form.order = []; box.paintHoursSections(V(o)); return form.order.slice(); }
let o = paint({ category: "Theater" });
assert.deepStrictEqual(o.slice(0, 2).map((n) => n === els["hd-sec-shows"]), [true, false], "a theater shows show times first");
assert(els["hd-sec-open"].hidden && !els["hd-sec-shows"].hidden && fold().text === "Show opening hours" && !fold().hidden);
paint({ category: "Theater", open_hours: week });
assert(!els["hd-sec-open"].hidden && fold().hidden, "opening hours already filled in: opens on its own");
o = paint({ category: "Visual Art" });
assert(o[0] === els["hd-sec-open"] && els["hd-sec-shows"].hidden && fold().text === "Add usual show times");
paint({ category: "Visual Art", show_times: { sat: ["19:00"] } });
assert(!els["hd-sec-shows"].hidden && fold().hidden);
paint({ category: "" });
assert(!els["hd-sec-open"].hidden && !els["hd-sec-shows"].hidden && fold().hidden, "no category shows both");
// Markup
const html = js("../index.html");
assert(/id="hd-sec-open"/.test(html) && /id="hd-sec-shows"/.test(html) && /id="hd-more"/.test(html));
assert(/<label for="v-hours">Hours<\/label>/.test(html), "the drop-down is called Hours");
console.log("venue hours: ok");
