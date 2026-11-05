// Checks run in CI before the site deploys (CC-222): pasting a venue's website on Add a venue fills in only what the admin
// hasn't typed, says what's missing or who else has this website, and saves nothing until Add venue.
//
//     node scripts/test_venue_from_website.js
"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const PUB = path.join(__dirname, "..", "public");
const html = fs.readFileSync(path.join(PUB, "index.html"), "utf8"), admin = fs.readFileSync(path.join(PUB, "js/admin.js"), "utf8");
for (const id of ["vn-website", "vn-read"]) assert.ok(html.includes('id="' + id + '"'), "has " + id);
assert.ok(html.indexOf('id="vn-website"') < html.indexOf('id="vn-name"'), "the form starts with the website");

// the form's own logic, run on fake fields
const start = admin.indexOf("var VNREAD = 0"), end = admin.indexOf('$("vn-website").addEventListener("paste"');
const els = {};
for (const id of ["vn-name", "vn-hood", "vn-address", "vn-city", "vn-zip", "vn-website", "vn-read"]) els[id] = { id, value: "", textContent: "" };
const calls = [];
let answers = [];
const api = (p, o) => { calls.push([p, o]); return { then: (ok, no) => { const r = answers.shift(); return { then: (f) => f(r) }; } }; };
const scope = new Function("$", "api", "readJSON", "errorText", "venueLabel", admin.slice(start, end) +
  "; return { vnReadSite, vnForget, vnFill, vnSaid };");
const t = scope((id) => els[id], api, null, () => "Something went wrong.", (v) => v.name + " (" + v.neighborhood + ")");
const draft = { website: "https://x.example/", name: "Lakeshore", neighborhood: "", address: "1 Lake St", city: "Chicago", zip_code: "", missing: ["zip_code"], same_website: [], problem: "" };

// an empty form fills, and what's missing is said
els["vn-website"].value = "https://x.example/"; answers = [{ ok: true, body: draft }];
t.vnReadSite();
assert.strictEqual(els["vn-name"].value, "Lakeshore");
assert.strictEqual(calls[0][0], "/venues/from-website");
assert.ok(/couldn't find the ZIP/.test(els["vn-read"].textContent), els["vn-read"].textContent);

// the same address isn't read twice (paste, then leaving the field)
t.vnReadSite();
assert.strictEqual(calls.length, 1, "one read for one address");

// a typed field stays; a field the last read filled follows the next read
els["vn-address"].value = "9 Typed Ave"; els["vn-website"].value = "https://y.example/";
answers = [{ ok: true, body: { ...draft, name: "Other", address: "2 Page St", missing: [] } }];
t.vnReadSite();
assert.strictEqual(els["vn-address"].value, "9 Typed Ave", "what the admin typed isn't replaced");
assert.strictEqual(els["vn-name"].value, "Other");

// a page that can't be read, and a website another venue has
assert.ok(/doesn't let us.*yourself.*Old \(Uptown\) already has this website\. You can still add/.test(
  t.vnSaid({ problem: "That site doesn't let us read its pages.", missing: ["name"], same_website: [{ name: "Old", neighborhood: "Uptown" }] }, 0)));

// a read that's been overtaken changes nothing
const late = []; const hold = { then: (ok) => ({ then: (f) => late.push(f) }) };
const scope2 = new Function("$", "api", "readJSON", "errorText", "venueLabel", admin.slice(start, end) + "; return { vnReadSite, vnForget };");
for (const id of Object.keys(els)) els[id].value = "";
const t2 = scope2((id) => els[id], () => hold, null, () => "", (v) => v.name);
els["vn-website"].value = "https://z.example/"; t2.vnReadSite(); t2.vnForget();
late[0]({ ok: true, body: draft });
assert.strictEqual(els["vn-name"].value, "", "after Add venue a late answer is dropped");

// only Add venue saves, and it sends the website
const reading = admin.slice(start, end);
assert.ok(!reading.includes('api("/venues",'), "reading saves nothing");
assert.ok(admin.includes('zip_code: place.zip_code, website: $("vn-website").value.trim() } })'), "Add venue sends it");
console.log("ok: venue from website");
