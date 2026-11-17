// CC-255: Find an outing's chevron progress bar, and the slide between steps (still when motion is reduced).
const assert = require("assert"), fs = require("fs"), path = require("path"), vm = require("vm");
const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
const src = read("public/js/outing.js"), css = read("public/css/site.css"), html = read("public/index.html");
const g = {}; vm.createContext(g);
const bar = { hidden: true, innerHTML: "" };
g.$ = (id) => (id === "plan-bar" ? bar : null);
g.esc = (t) => String(t); g.budgetText = (b) => (b === "any" ? "Any price" : b === "free" ? "Free" : "Up to $" + b);
g.windowText = () => "Nov 21"; g.REGION_NAMES = { north: "Northside", west: "Westside" };
g.whenChoices = () => [["weekend", "This weekend"]];
g.plan = { when: "weekend", ws: 0, we: 0, budget: 40, types: { Music: 1, Theater: 1 }, regions: { north: 1 } };
vm.runInContext(src.slice(src.indexOf("var PLAN_STEPS"), src.indexOf("// CC-255: show the next step")), g);

g.renderPlanBar(2);
const h = bar.innerHTML;
assert.strictEqual(bar.hidden, false);
assert.strictEqual((h.match(/<li/g) || []).length, 5, "five chevrons");
assert.ok(h.includes("This weekend") && h.includes("Up to $40"), "answered steps show the choice");
assert.strictEqual((h.match(/data-pstep=/g) || []).length, 2, "only the answered, earlier steps are buttons");
assert.strictEqual((h.match(/aria-current="step"/g) || []).length, 1, "one current step");
assert.ok(/<span class="chev" aria-current="step"><span class="sr-only">Step 3 of 5: <\/span><span class="chev-name">Kind/.test(h), "the current chevron is the third, named Kind");
assert.ok(h.includes("Your plan") && h.includes("Side of town"), "later steps show their names");

g.renderPlanBar(4);
assert.ok(bar.innerHTML.includes("Music, Theater") && bar.innerHTML.includes("Northside"), "at the result all four answers show");
assert.ok(/aria-current="step"[^>]*><span class="sr-only">Step 5 of 5/.test(bar.innerHTML), "the result is step 5");
g.plan.types = {}; g.plan.regions = {}; g.renderPlanBar(4);
assert.ok(bar.innerHTML.includes("Surprise me") && bar.innerHTML.includes("Anywhere"), "open answers read Surprise me and Anywhere");
g.renderPlanBar(-1); assert.strictEqual(bar.hidden, true, "a shared outing has no bar");

assert.ok(/matchMedia\("\(prefers-reduced-motion: reduce\)"\)/.test(src), "planSlide swaps at once under reduced motion");
assert.ok(/@media \(prefers-reduced-motion: no-preference\) \{\s*\.plan-in-fwd/.test(css) && !/^\.plan-in-fwd/m.test(css), "the slide keyframes are applied only when motion is allowed");
assert.ok(html.includes('id="plan-bar"') && html.includes('aria-label="Progress"') && !/Question 1 of 4|tick-0/.test(html), "the bar replaces the Question line and ticks");
assert.ok(/planSlide\(-1/.test(src) && /planSlide\(1/.test(src), "forward slides one way and back the other");
console.log("outing bar ok");
