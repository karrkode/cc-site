// Culture Crew site: Venue hours (admins, CC-78): opening hours and usual show times, on the Venues page.
// Loaded by index.html in order (core, util, catalog, planner, account, crews, submit, admin, hours, found, issues, start); they share one
// global scope, so anything declared here is visible to the files after it.
"use strict";
// Times are typed ("10 AM", "9:30 PM") rather than picked: browsers' time pickers look filled in before
// every part is set (Safari shows a placeholder AM/PM) and then report no time at all.
// Each venue keeps open_hours ({day: [opens, closes] | null for closed}; a day left out isn't known) and
// show_times ({day: [start times]}), both 24-hour "HH:MM". Event discovery fills them in from the venue's
// site; once an admin saves them here, discovery leaves them alone. They're stored for the planner (CC-79).
var HOUR_DAYS = [["mon", "Monday"], ["tue", "Tuesday"], ["wed", "Wednesday"], ["thu", "Thursday"], ["fri", "Friday"], ["sat", "Saturday"], ["sun", "Sunday"]];
var HDLG = null; // { v, opener }

// "2 PM, 7:30 PM" -> ["14:00", "19:30"]. 24-hour times work too ("19:30"). An hour on its own, or 1:00–11:59
// without AM or PM, is ambiguous, so it's an error rather than a guess.
function parseTimes(text) {
  var out = [], bad = null;
  text.split(/\s*(?:,|;|\band\b|&)\s*/i).forEach(function (part) {
    part = part.trim(); if (!part || bad) return;
    var m = /^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s*m?\.?$/i.exec(part) || /^(\d{1,2}):(\d{2})$/.exec(part);
    if (!m) { bad = part; return; }
    var h = +m[1], min = m[2] ? +m[2] : 0, ap = m[3] && m[3].toLowerCase();
    if (min > 59) { bad = part; return; }
    if (ap) { if (h < 1 || h > 12) { bad = part; return; } h = h % 12 + (ap === "p" ? 12 : 0); }
    else if (h > 23 || (h >= 1 && h <= 11)) { bad = part; return; } // "7:30": morning or evening?
    var t = ("0" + h).slice(-2) + ":" + ("0" + min).slice(-2);
    if (out.indexOf(t) < 0) out.push(t);
  });
  return bad ? { error: bad } : { times: out.sort() };
}
function byText(by, what) { return by === "admin" ? what + " were set by an admin." : by === "discovery" ? what + " were filled in from the venue's website." : ""; }
function hoursNote(v) { // the line under a venue on the Venues page
  var admin = v.open_hours_by === "admin" || v.show_times_by === "admin", found = v.open_hours_by === "discovery" || v.show_times_by === "discovery";
  return admin || found ? '<p class="alt-meta">' + (admin ? "Hours set by an admin" : "Hours from the venue's website") + "</p>" : "";
}
function hoursRows() {
  $("hd-open").innerHTML = HOUR_DAYS.map(function (d) {
    var k = d[0];
    return '<div class="hours-row" data-day="' + k + '"><span class="day" id="hd-day-' + k + '">' + d[1] + "</span>" +
      '<select id="hd-state-' + k + '" aria-labelledby="hd-day-' + k + '" data-hours-state><option value="">Not known</option><option value="closed">Closed</option><option value="open">Open</option></select>' +
      '<span class="times"><label class="sr-only" for="hd-opens-' + k + '">' + d[1] + " opens</label>" +
      '<input type="text" id="hd-opens-' + k + '" maxlength="12" placeholder="10 AM" autocomplete="off"><span aria-hidden="true">to</span>' +
      '<label class="sr-only" for="hd-closes-' + k + '">' + d[1] + " closes</label>" +
      '<input type="text" id="hd-closes-' + k + '" maxlength="12" placeholder="5 PM" autocomplete="off"></span></div>';
  }).join("");
  $("hd-shows").innerHTML = HOUR_DAYS.map(function (d) {
    var k = d[0];
    return '<div class="hours-row"><label class="day" for="hd-show-' + k + '">' + d[1] + "</label>" +
      '<input type="text" id="hd-show-' + k + '" maxlength="80" placeholder="No shows" aria-describedby="hd-shows-hint" autocomplete="off"></div>';
  }).join("");
}
function syncHoursRow(k) {
  var open = $("hd-state-" + k).value === "open";
  $("hd-opens-" + k).parentNode.hidden = !open;
}
function openHoursDialog(v, opener) {
  HDLG = { v: v, opener: opener };
  if (!$("hd-open").children.length) hoursRows();
  $("hd-heading").textContent = "Hours at " + v.name;
  $("hd-from").textContent = [byText(v.open_hours_by, "Opening hours"), byText(v.show_times_by, "Show times")].filter(Boolean).join(" ") ||
    "Nothing filled in yet.";
  HOUR_DAYS.forEach(function (d) {
    var k = d[0], h = v.open_hours || {}, known = Object.prototype.hasOwnProperty.call(h, k);
    $("hd-state-" + k).value = !known ? "" : h[k] === null ? "closed" : "open";
    $("hd-opens-" + k).value = known && h[k] ? clockText(h[k][0]) : ""; $("hd-closes-" + k).value = known && h[k] ? clockText(h[k][1]) : "";
    syncHoursRow(k);
    $("hd-show-" + k).value = ((v.show_times || {})[k] || []).map(clockText).join(", ");
  });
  $("hd-error").textContent = ""; setHoursBusy(false);
  $("hours-dialog").showModal(); $("hd-open").querySelector("select").focus();
}
function sameHours(a, b) { // the same days and values, in any order
  b = b || {};
  return Object.keys(a).length === Object.keys(b).length && HOUR_DAYS.every(function (d) { return JSON.stringify(a[d[0]]) === JSON.stringify(b[d[0]]); });
}
function setHoursBusy(on) { Array.prototype.forEach.call($("hours-form").querySelectorAll("button, input, select"), function (x) { x.disabled = on; }); }
function hoursFail(text, focusId) { setHoursBusy(false); $("hd-error").textContent = text; if (focusId) $(focusId).focus(); }
$("hd-open").addEventListener("change", function (ev) {
  var sel = ev.target.closest("[data-hours-state]"); if (!sel) return;
  var k = sel.closest("[data-day]").getAttribute("data-day"); syncHoursRow(k);
  if (sel.value === "open") { fillLikeEarlierDay(k); $("hd-opens-" + k).focus(); }
});
// Opening a day fills in real times (not just hints), so Tab keeps them: the nearest earlier open day's
// hours, or 10 AM to 5 PM. Only empty boxes are filled.
function fillLikeEarlierDay(k) {
  var i = HOUR_DAYS.map(function (d) { return d[0]; }).indexOf(k), from = ["10 AM", "5 PM"];
  for (var j = i - 1; j >= 0; j--) {
    var p = HOUR_DAYS[j][0];
    if ($("hd-state-" + p).value === "open" && $("hd-opens-" + p).value.trim() && $("hd-closes-" + p).value.trim()) {
      from = [$("hd-opens-" + p).value.trim(), $("hd-closes-" + p).value.trim()]; break;
    }
  }
  if (!$("hd-opens-" + k).value.trim()) $("hd-opens-" + k).value = from[0];
  if (!$("hd-closes-" + k).value.trim()) $("hd-closes-" + k).value = from[1];
}
$("hours-form").addEventListener("focusin", function (ev) { // typing replaces a filled-in time
  if (ev.target.matches && ev.target.matches('input[type="text"]')) ev.target.select();
});
$("hd-open").addEventListener("blur", function (ev) { // tidy a typed time: "9pm" -> "9 PM"
  var input = ev.target; if (!input.matches || !input.matches(".times input")) return;
  var got = parseTimes(input.value); if (!got.error && got.times.length === 1) input.value = clockText(got.times[0]);
}, true);
$("hd-shows").addEventListener("blur", function (ev) {
  var input = ev.target; if (!input.matches || !input.matches("input")) return;
  var got = parseTimes(input.value); if (!got.error) input.value = got.times.map(clockText).join(", ");
}, true);
$("hours-form").addEventListener("input", function () { $("hd-error").textContent = ""; });
$("hd-cancel").addEventListener("click", function () { $("hours-dialog").close(); });
$("hours-dialog").addEventListener("close", function () {
  var was = HDLG; HDLG = null; if (!was) return;
  var back = was.opener && document.contains(was.opener) ? was.opener : $("venue-list").querySelector('[data-venue-hours="' + was.v.id + '"]');
  (back || $("venues-title")).focus();
});
$("venue-list").addEventListener("click", function (ev) {
  var b = ev.target.closest("[data-venue-hours]"); if (!b) return;
  var id = +b.getAttribute("data-venue-hours"), v = VLIST.filter(function (x) { return x.id === id; })[0];
  if (v) openHoursDialog(v, b);
});
$("hours-form").addEventListener("submit", function (ev) {
  ev.preventDefault();
  var v = HDLG && HDLG.v; if (!v) return;
  var open = {}, shows = {}, problem = null;
  HOUR_DAYS.some(function (d) {
    var k = d[0], state = $("hd-state-" + k).value;
    if (state === "closed") open[k] = null;
    if (state === "open") {
      var ends = [["opens", "opening"], ["closes", "closing"]].map(function (e) {
        var id = "hd-" + e[0] + "-" + k, text = $(id).value.trim(), got = parseTimes(text);
        if (!text) return { id: id, error: d[1] + ": give the " + e[1] + " time, like " + (e[0] === "opens" ? "10 AM." : "5 PM.") };
        if (got.error || got.times.length !== 1) return { id: id, error: d[1] + ": \u201c" + text + "\u201d isn't a time we can read. Write it like 5 PM or 9:30 PM." };
        return { id: id, time: got.times[0] };
      });
      var bad = ends.filter(function (e) { return e.error; })[0];
      if (bad) { problem = [bad.error, bad.id]; return true; }
      if (ends[0].time === ends[1].time) { problem = [d[1] + ": the closing time is the same as the opening time.", ends[1].id]; return true; }
      open[k] = [ends[0].time, ends[1].time];
    }
    var parsed = parseTimes($("hd-show-" + k).value);
    if (parsed.error) { problem = [d[1] + ": “" + parsed.error + "” isn't a time we can read. Write it like 7:30 PM.", "hd-show-" + k]; return true; }
    if (parsed.times.length > 6) { problem = [d[1] + ": six show times at most.", "hd-show-" + k]; return true; }
    if (parsed.times.length) shows[k] = parsed.times;
    return false;
  });
  if (problem) { hoursFail(problem[0], problem[1]); return; }
  var body = {}; // only what changed, so untouched hours keep who filled them in
  if (!sameHours(open, v.open_hours)) body.open_hours = open;
  if (!sameHours(shows, v.show_times)) body.show_times = shows;
  if (!Object.keys(body).length) { $("hours-dialog").close(); return; }
  setHoursBusy(true);
  api("/venues/" + v.id, { method: "PATCH", body: body }).then(readJSON).then(function (res) {
    if (!res.ok) { hoursFail(errorText(res)); return; }
    VLIST = VLIST.map(function (x) { return x.id === v.id ? res.body : x; });
    paintVenues(); $("edit-live").textContent = "Saved the hours at " + v.name + ".";
    HDLG.opener = null; $("hours-dialog").close();
  }, function () { hoursFail(errorText(null)); });
});

// ---------- an event's own show times (CC-79), in the event edit form ----------
// Plan an outing only suggests a performance when it knows the start times: the dates and times found on
// the venue's site, else this weekly pattern, else the venue's usual show times. Blank = the venue's.
function weeklyRows() {
  if ($("ed-weekly").children.length) return;
  $("ed-weekly").innerHTML = HOUR_DAYS.map(function (d) {
    var k = d[0];
    return '<div class="hours-row"><label class="day" for="ed-week-' + k + '">' + d[1] + "</label>" +
      '<input type="text" id="ed-week-' + k + '" maxlength="80" placeholder="No shows" aria-describedby="ed-sched-hint" autocomplete="off"></div>';
  }).join("");
}
function weeklyText(w) {
  var days = HOUR_DAYS.filter(function (d) { return w && w[d[0]] && w[d[0]].length; });
  return days.map(function (d) { return d[1].slice(0, 3) + " " + w[d[0]].map(clockText).join(", "); }).join("; ");
}
function fillWeekly(e) { // e: an event as fromApi makes it, or null for a found event (hidden then)
  $("ed-sched").hidden = !e || (e.type === "Visual Art" && !e.sched.dates.length); // exhibitions go by the venue's hours
  if (!e) return;
  weeklyRows();
  var own = e.sched.weekly_from === "event" ? e.sched.weekly : {};
  HOUR_DAYS.forEach(function (d) { $("ed-week-" + d[0]).value = (own[d[0]] || []).map(clockText).join(", "); });
  var venue = e.sched.weekly_from === "venue" ? weeklyText(e.sched.weekly) : "";
  $("ed-sched-hint").textContent = (e.sched.dates.length ? plural(e.sched.dates.length, "upcoming date", "upcoming dates") +
    " came from the venue's website; those come first. " : "") +
    (venue ? "Leave blank to use the venue's show times (" + venue + ")." : "Leave blank if you don't know. Without any show times, Plan an outing won't suggest it.") +
    " Write times like 7:30 PM.";
}
// The weekly pattern typed in, {} if blank, or { error, id } for something unreadable.
function readWeekly() {
  var out = {}, bad = null;
  HOUR_DAYS.some(function (d) {
    var id = "ed-week-" + d[0], got = parseTimes($(id).value);
    if (got.error) { bad = { error: d[1] + ": \u201c" + got.error + "\u201d isn't a time we can read. Write it like 7:30 PM.", id: id }; return true; }
    if (got.times.length > 6) { bad = { error: d[1] + ": six show times at most.", id: id }; return true; }
    if (got.times.length) out[d[0]] = got.times;
    return false;
  });
  return bad || out;
}
$("ed-weekly").addEventListener("blur", function (ev) { // tidy "7:30pm" -> "7:30 PM"
  var input = ev.target; if (!input.matches || !input.matches("input")) return;
  var got = parseTimes(input.value); if (!got.error) input.value = got.times.map(clockText).join(", ");
}, true);
