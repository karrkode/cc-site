// CC-254: Find an outing's budget step is one maximum-price bar: Free at the left, the widest stop at the right.
const assert = require("assert"), fs = require("fs"), path = require("path"), vm = require("vm");
const src = fs.readFileSync(path.join(__dirname, "..", "public/js/planner.js"), "utf8");
const grab = (from, to) => src.slice(src.indexOf(from), src.indexOf(to));
const g = {}; vm.createContext(g);
vm.runInContext(grab("var PLAN_STOPS", "// The planner only needs"), g);
vm.runInContext(grab("function costHTML", "function stopHTML"), g);
g.esc = (t) => String(t); g.costText = (e) => (e.costUsual ? "Usually " + e.cost : e.min === null ? "Price not posted" : e.cost);
const ev = (min) => ({ min });
const stops = (list) => JSON.stringify(g.priceStops(list));

assert.strictEqual(stops([ev(0), ev(12.5), ev(30), ev(12), ev(null)]), '["free",12,13,30,"any"]', "Free, each price that adds events, then Any price");
assert.strictEqual(stops([ev(15), ev(null)]), '[15,"any"]', "no Free stop when nothing in the window is free");
assert.strictEqual(stops([ev(0), ev(20)]), '["free",20]', "no Any price stop when every event has a price");
assert.strictEqual(stops([ev(0)]), '["free"]', "only free events: one stop");
assert.strictEqual(stops([]), '["any"]', "an empty window still has a bar to show");

assert.strictEqual(g.budgetText("free"), "Free"); assert.strictEqual(g.budgetText("any"), "Any price"); assert.strictEqual(g.budgetText(25), "Up to $25");

assert.ok(/<span class="pill">Free<\/span>$/.test(g.costHTML({ min: 0, cost: "Free" })), "a free event gets the Free tag");
assert.ok(/Free<\/span> Usually free$/.test(g.costHTML({ min: 0, cost: "free", costUsual: true })), "a usually-free one keeps its words");
assert.strictEqual(g.costHTML({ min: 20, cost: "$20" }), "$20", "a priced one is untouched");
assert.strictEqual(g.costHTML({ min: null }), "Price not posted");

// the one control: no Free/Priced choice left, the bar opens at once, and Next is there from this question on
assert.ok(!/data-budget|plan\.priced/.test(src), "no Free or Priced choice");
assert.ok(/plan-free-n/.test(src), "the count line of free events");
assert.ok(/\$\("plan-next"\)\.hidden = plan\.step < 1;/.test(src), "Next shows at the budget question");
console.log("planner budget ok");
