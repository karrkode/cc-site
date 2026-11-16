// Check run in CI before the site deploys (CC-259): going back from an event to the view it was opened from draws that
// view again. A plan saved on the event page redraws only the views that are showing, so My week (and the account and
// journal pages) would otherwise come back as they were: the new plan only appeared after a refresh.
//
//     node scripts/test_week_return.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const src = fs.readFileSync(path.join(__dirname, "..", "public", "js", "catalog.js"), "utf8");
const closeEvent = src.match(/function closeEvent\([\s\S]*?\n}\n/)[0];

function back(from) {
  const calls = [];
  const sandbox = {
    EV: { from, id: "416", link: null, pushed: true, y: 0 },
    CAT_ITEMS: [1],
    window: { scrollTo() {} },
    document: { querySelector: () => null },
    $: () => ({ contains: () => false }),
    posterSource: () => null,
    posterMove: (_s, _b, done) => done(),
    show: (v) => calls.push("show:" + v),
    renderCatalog: () => calls.push("renderCatalog"),
    renderPlannerPage: () => calls.push("renderPlannerPage"),
    renderAccount: () => calls.push("renderAccount"),
    renderJournalPage: () => calls.push("renderJournalPage"),
  };
  vm.createContext(sandbox);
  vm.runInContext(closeEvent + "\ncloseEvent();", sandbox);
  return calls;
}

assert.deepStrictEqual(back("planner"), ["renderPlannerPage", "show:planner"], "My week is drawn again before it shows");
assert.deepStrictEqual(back("account"), ["renderAccount", "show:account"]);
assert.deepStrictEqual(back("journal"), ["renderJournalPage", "show:journal"]);
assert.deepStrictEqual(back("catalog"), ["show:catalog"], "the catalog keeps its own list");
console.log("ok: going back from an event redraws My week, the account and the journal");
