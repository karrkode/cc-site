// Checks run in CI before the site deploys (CC-286): "today" and the clock are Chicago's, not the visitor's.
// Fakes the instant and the browser's time zone (Pacific, Tokyo, Chicago), around Chicago midnight and across the
// daylight-time change, and checks that today(), T, the masthead date, the planner clock and the date strings agree.
//
//     node scripts/test_chicago_clock.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const JS = path.join(__dirname, "..", "public", "js");
const read = (f) => fs.readFileSync(path.join(JS, f), "utf8");

function stub() {
  return new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => "" : stub()), set: () => true, apply: () => stub() });
}
// Loads util.js, outing.js and sourcing.js with "now" fixed at an instant
function load(instant) {
  const RealDate = Date;
  class FakeDate extends RealDate {
    constructor(...a) { if (a.length) super(...a); else super(instant); }
    static now() { return new RealDate(instant).getTime(); }
  }
  const g = { window: { devicePixelRatio: 1, matchMedia: () => stub(), addEventListener: () => {} }, matchMedia: () => stub(),
    document: stub(), localStorage: stub(), location: stub(), history: stub(), navigator: stub(), Intl, URL, console, Date: FakeDate };
  vm.createContext(g);
  vm.runInContext("var AUTH = { user: null }, MYPLANS = {}, API = ''; function $(id) { return document; }", g);
  ["util.js", "outing.js", "sourcing.js"].forEach((f) => vm.runInContext(read(f), g));
  return g;
}

// [instant, Chicago day, Chicago clock, masthead date]
const CASES = [
  ["2026-11-18T05:30:00Z", "2026-11-17", "23:30", "Tuesday, November 17"], // 11:30 PM CST: Tokyo is already on the 18th
  ["2026-11-18T06:10:00Z", "2026-11-18", "00:10", "Wednesday, November 18"], // just after Chicago midnight: Pacific is still on the 17th
  ["2026-07-04T04:59:00Z", "2026-07-03", "23:59", "Friday, July 3"], // daylight time: midnight is 05:00Z, not 06:00Z
  ["2026-07-04T05:00:00Z", "2026-07-04", "00:00", "Saturday, July 4"],
  ["2026-03-08T07:30:00Z", "2026-03-08", "01:30", "Sunday, March 8"], // the night the clocks go forward
];
let ran = 0;
for (const tz of ["America/Chicago", "America/Los_Angeles", "Asia/Tokyo", "UTC"]) {
  process.env.TZ = tz;
  for (const [instant, day, clock, mast] of CASES) {
    const g = load(instant), at = `${instant} in ${tz}`;
    assert.strictEqual(g.isoDate(g.T), day, "T is Chicago's day: " + at);
    assert.strictEqual(g.isoDate(g.today()), day, "today(): " + at);
    assert.strictEqual(g.chicagoClock(), clock, "clock: " + at);
    assert.strictEqual(g.chicagoNow().h, +clock.slice(0, 2), "hour: " + at);
    assert.strictEqual(g.F.mastDay.format(new g.Date()), mast, "the masthead agrees with T: " + at);
    assert.strictEqual(g.F.wmd.format(g.T), g.F.wmd.format(g.parseISO(day)), "listing-style day: " + at);
    assert.strictEqual(g.ymd(g.T), day.replace(/-/g, ""), "ymd: " + at);
    assert.strictEqual(g.clockNow(), clock, "the planner's clock: " + at);
    // Today and Tonight are offered by Chicago's hour (before 5 PM / before 9 PM)
    const ids = g.whenChoices().map((c) => c[0]);
    const hour = +clock.slice(0, 2);
    assert.strictEqual(ids.includes("today"), hour < 17, "Today choice: " + at);
    assert.strictEqual(ids.includes("tonight"), hour < 21, "Tonight choice: " + at);
    ran++;
  }
}
// The planner's day: a plain calendar day prints as that day, with no offset to move it
process.env.TZ = "Asia/Tokyo";
const g = load("2026-07-04T17:00:00Z");
assert.strictEqual(g.chicagoDate("2026-07-04", { month: "short", day: "numeric" }), "Jul 4", "a plain date stays on its day in daylight time");
assert.strictEqual(g.chicagoDate("2026-01-01", { month: "short", day: "numeric" }), "Jan 1", "and in winter");

// No UTC offset is hard-coded anywhere in the page scripts (CC-286)
for (const f of fs.readdirSync(JS).filter((x) => x.endsWith(".js"))) assert.ok(!/T\d\d:\d\d:\d\d-0[56]:00/.test(read(f)), f + " hard-codes a Chicago offset");
console.log("test_chicago_clock: " + ran + " cases ok");
