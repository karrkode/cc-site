// Checks run in CI before the site deploys (CC-218): the event page shows a venue's address and map link only when it
// has one, addresses are always escaped, and a suggestion reaches a venue only through an admin's Confirm or Save.
//
//     node scripts/test_venue_address.js
"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const PUB = path.join(__dirname, "..", "public");
const read = (f) => fs.readFileSync(path.join(PUB, f), "utf8");
const html = read("index.html"), admin = read("js/admin.js"), catalog = read("js/catalog.js"), util = read("js/util.js");
const has = (s, part, msg) => assert.ok(s.includes(part), msg || "has " + part);

// --- the event page ---
has(util, 'address: e.venue.full_address || "", mapUrl: e.venue.map_url || ""', "the API's address, or nothing");
has(catalog, 'if (e.address) facts.push(["Address", e.address, e.mapUrl]);', "no address: no fact and no link");
has(catalog, "esc(safeUrl(f[2]))", "the link is checked and escaped");

// --- the Venues page ---
for (const id of ["vd-address", "vd-city", "vd-zip", "va", "va-list", "va-status", "v-noaddress"]) has(html, 'id="' + id + '"');
has(admin, '<span class="state">No address yet</span>', "a venue with none says so");
has(admin, "(!noAddress || !v.address)", "and the filter lists them");
assert.ok(!/innerHTML[^;]*\+ s\.address/.test(admin), "a suggested address is never put in the page unescaped");
has(admin, "esc(s.address)");

// --- adding a venue: the address is required on the form, and the event paths don't ask ---
for (const id of ["va-add", "vn-name", "vn-hood", "vn-address", "vn-city", "vn-zip", "vn-error"]) has(html, 'id="' + id + '"');
has(admin, '!a.address ? [p + "-address", "Enter the street address."] : !a.city ? [p + "-city", "Enter the city."]');
has(admin, '[p + "-zip", "Enter a 5-digit ZIP code."]');
has(admin, 'addressProblem("vn", place)', "the form needs all three");
has(admin, "place.address || place.city || place.zip_code ? addressProblem(\"vd\", place)", "Edit takes all three or none");
has(admin, "s.zip_code ? '<button class=\"btn\" type=\"button\" data-va-confirm", "a suggestion with no ZIP can't be confirmed as it is");
has(admin, 'api("/venues/from-event", { method: "POST", body: { name: name, neighborhood: hood } })', "editing an event needs no address");
has(admin, 'api("/venues", { method: "POST", body: { name: name, neighborhood: hood, address: place.address, city: place.city, zip_code: place.zip_code } })');

// --- only an admin's action saves one ---
const load = admin.slice(admin.indexOf("function loadAddressSuggestions"), admin.indexOf("function paintAddressSuggestions"));
assert.ok(!load.includes("POST"), "loading suggestions saves nothing");
has(admin, 'var path = "/venues/" + s.venue_id + "/address" + (act === "dismiss" ? "/dismiss" : "");');
console.log("ok: venue addresses");
