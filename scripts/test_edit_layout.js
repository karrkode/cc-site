// CC-327: the Edit/Approve dialog is two columns on a desktop. Static check of the markup: the fields stay in their
// columns, and "Goes live on" is not inside #ed-range (srRefresh hides that div for Theater and Music, which hid the field).
"use strict";
const fs = require("fs"), path = require("path");
const html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
const dlg = html.slice(html.indexOf('id="edit-dialog"'), html.indexOf("</dialog>", html.indexOf('id="edit-dialog"')));
const at = (id) => dlg.indexOf('id="' + id + '"');
let bad = 0;
const check = (ok, msg) => { if (!ok) { bad++; console.error("FAIL: " + msg); } };
const what = at("ed-col-what"), when = at("ed-col-when");
check(what > 0 && when > what, "two columns, what then when");
for (const id of ["ed-title", "ed-category", "ed-venue", "ed-cost", "ed-url", "ed-picture-controls"])
  check(at(id) > what && at(id) < when, id + " is in the what column");
for (const id of ["ed-runkind", "ed-range", "ed-run", "ed-showrun", "ed-sched", "ed-publish-at"])
  check(at(id) > when && at(id) < at("ed-error"), id + " is in the when column");
// #ed-range holds Opens, Closes and Open run, and nothing else: it ends before #ed-run starts
const range = dlg.slice(at("ed-range"), at("ed-run"));
check(!range.includes("ed-publish-at"), "ed-publish-at is outside #ed-range");
check(at("ed-heading") < what && at("ed-save") > at("ed-error"), "heading above and buttons below the columns");
if (bad) process.exit(1);
console.log("ok: edit dialog columns");
