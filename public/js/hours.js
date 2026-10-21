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

// ---------- show days (CC-79, CC-88): the days a performance is on, each with its start times ----------
// In the event edit form ("ed": also approving a found event) and Submit an event ("s"). Plan an outing only
// suggests a performance when it knows the start times: dated performances found on the venue's site, else
// these show days, else the venue's usual show times. Only Theater, Comedy and Concert have them (musicals are
// theater); Visual Art goes by the venue's opening hours.
var SHOW_TYPES = { Theater: 1, Comedy: 1, Concert: 1 };
var SHOW_DAYS = {}; // per form: { days: {mon: ["8 PM", ...]} as typed, from: the pattern the form started with }
function showDaysInit(f) {
  SHOW_DAYS[f] = { days: {}, from: {} };
  $(f + "-days").innerHTML = HOUR_DAYS.map(function (d) {
    return '<button type="button" class="chip" aria-pressed="false" data-show-day="' + d[0] + '" aria-label="' + d[1] + '">' + d[1].slice(0, 3) + "</button>";
  }).join("");
  $(f + "-days").addEventListener("click", function (ev) {
    var b = ev.target.closest("[data-show-day]"); if (!b) return;
    var k = b.getAttribute("data-show-day"), sd = SHOW_DAYS[f];
    if (sd.days[k]) delete sd.days[k];
    else { var before = HOUR_DAYS.map(function (d) { return sd.days[d[0]]; }).filter(Boolean).pop(); sd.days[k] = before ? before.slice() : [""]; }
    paintShowDays(f);
    if (sd.days[k] && !sd.days[k][0]) $(f + "-week-" + k + "-0").focus(); // a new day: its start time next
  });
  $(f + "-weekly").addEventListener("input", function (ev) {
    var at = ev.target.getAttribute("data-time"); if (!at) return;
    at = at.split(":"); SHOW_DAYS[f].days[at[0]][+at[1]] = ev.target.value;
  });
  $(f + "-weekly").addEventListener("blur", function (ev) { // tidy "7:30pm" -> "7:30 PM"
    var at = ev.target.getAttribute && ev.target.getAttribute("data-time"); if (!at) return;
    var got = parseTimes(ev.target.value); if (got.error || !got.times.length) return;
    ev.target.value = got.times.map(clockText).join(", "); at = at.split(":"); SHOW_DAYS[f].days[at[0]][+at[1]] = ev.target.value;
  }, true);
  $(f + "-weekly").addEventListener("click", function (ev) {
    var b = ev.target.closest("[data-show-act]"); if (!b) return;
    var sd = SHOW_DAYS[f], k = b.getAttribute("data-day"), act = b.getAttribute("data-show-act");
    if (act === "add") { sd.days[k].push(""); paintShowDays(f); $(f + "-week-" + k + "-" + (sd.days[k].length - 1)).focus(); }
    if (act === "remove") { var i = +b.getAttribute("data-i"); sd.days[k].splice(i, 1); paintShowDays(f); $(f + "-week-" + k + "-" + (i - 1)).focus(); }
    if (act === "same") {
      HOUR_DAYS.forEach(function (d) { if (sd.days[d[0]]) sd.days[d[0]] = sd.days[k].slice(); });
      paintShowDays(f); $(f + "-same").focus();
      $("edit-live").textContent = "Every show day now has " + dayLabel(k) + "'s times.";
    }
  });
}
function dayLabel(k) { return HOUR_DAYS.filter(function (d) { return d[0] === k; })[0][1]; }
function paintShowDays(f) {
  var sd = SHOW_DAYS[f], on = HOUR_DAYS.filter(function (d) { return sd.days[d[0]]; });
  Array.prototype.forEach.call($(f + "-days").children, function (b) { b.setAttribute("aria-pressed", String(!!sd.days[b.getAttribute("data-show-day")])); });
  $(f + "-weekly").innerHTML = on.map(function (d) {
    var k = d[0];
    return '<div class="hours-row"><span class="day" id="' + f + "-day-" + k + '">' + d[1] + '</span><span class="times show-times">' +
      sd.days[k].map(function (t, i) {
        return '<input type="text" id="' + f + "-week-" + k + "-" + i + '" data-time="' + k + ":" + i + '" maxlength="40" placeholder="8 PM" autocomplete="off" value="' +
          esc(t) + '" aria-label="' + d[1] + (sd.days[k].length > 1 ? " start time " + (i + 1) : " start time") + '">' +
          (i ? '<button type="button" class="textbtn" data-show-act="remove" data-day="' + k + '" data-i="' + i + '" aria-label="Remove ' + d[1] + " start time " + (i + 1) + '">Remove</button>' : "");
      }).join("") +
      (sd.days[k].length < 6 ? '<button type="button" class="textbtn" data-show-act="add" data-day="' + k + '" aria-label="Add another ' + d[1] + ' start time">Add another time</button>' : "") +
      "</span></div>";
  }).join("") + (on.length > 1 ? '<button type="button" class="textbtn" id="' + f + '-same" data-show-act="same" data-day="' + on[0][0] + '">Use ' +
    on[0][1] + "'s times for every day</button>" : "");
}
// Start the form with a pattern ({day: ["HH:MM"]}); it's also what counts as "unchanged" when saving.
function setShowDays(f, weekly) {
  var days = {};
  HOUR_DAYS.forEach(function (d) { if (weekly && weekly[d[0]] && weekly[d[0]].length) days[d[0]] = weekly[d[0]].map(clockText); });
  SHOW_DAYS[f].days = days; SHOW_DAYS[f].from = weekly || {}; paintShowDays(f);
}
function showDaysFor(f, type) { $(f + "-sched").hidden = !SHOW_TYPES[type]; }
// The show days as entered: {weekly} ({} for none), or {error, id} for a day without a time or a time we can't read.
function readShowDays(f) {
  var out = {}, bad = null, sd = SHOW_DAYS[f];
  HOUR_DAYS.some(function (d) {
    var k = d[0]; if (!sd.days[k]) return false;
    var times = [];
    sd.days[k].some(function (t, i) {
      var got = parseTimes(t || "");
      if (got.error) { bad = { error: d[1] + ": \u201c" + got.error + "\u201d isn't a time we can read. Write it like 8 PM.", id: f + "-week-" + k + "-" + i }; return true; }
      got.times.forEach(function (x) { if (times.indexOf(x) < 0) times.push(x); });
      return false;
    });
    if (bad) return true;
    if (!times.length) { bad = { error: "Give a start time for " + d[1] + ", or unselect it.", id: f + "-week-" + k + "-0" }; return true; }
    if (times.length > 6) { bad = { error: d[1] + ": six start times at most.", id: f + "-week-" + k + "-0" }; return true; }
    out[k] = times.sort();
    return false;
  });
  return bad || { weekly: out };
}
// "Thu 8 PM · Fri, Sat 8 PM and 10:30 PM": days in a row with the same times share them (cards, CC-88).
function showDaysText(w) {
  var groups = [];
  HOUR_DAYS.forEach(function (d) {
    var times = w && w[d[0]]; if (!times || !times.length) return;
    var t = times.map(clockText).join(" and "), last = groups[groups.length - 1];
    if (last && last.t === t) last.days.push(d[1].slice(0, 3)); else groups.push({ days: [d[1].slice(0, 3)], t: t });
  });
  return groups.map(function (g) { return g.days.join(", ") + " " + g.t; }).join(" · ");
}
// The edit form: its own show days if it has some, else the venue's usual show times to start from.
function fillWeekly(e) { // e: an event as fromApi makes it
  showDaysFor("ed", e.type);
  var own = e.sched.weekly_from === "event", venue = e.sched.weekly_from === "venue" ? e.sched.weekly : {};
  setShowDays("ed", own ? e.sched.weekly : venue);
  SHOW_DAYS.ed.from = own ? e.sched.weekly : {}; SHOW_DAYS.ed.venue = venue;
  $("ed-sched-hint").textContent = (e.sched.dates.length ? plural(e.sched.dates.length, "upcoming date", "upcoming dates") +
    " came from the venue's website; those come first. " : "") +
    (own ? "" : Object.keys(venue).length ? "These are the venue's usual show times; change them if this show is different. " :
      "Choose the days, and give a start time for each. ") + "Without any, Plan an outing won't suggest it.";
}
// What to save from the edit form: null if the show days are as they were (the venue's, untouched, stay the venue's).
function weeklyChange(f) {
  var got = readShowDays(f); if (got.error) return got;
  var sd = SHOW_DAYS[f];
  if (sd.venue && Object.keys(sd.venue).length && sameHours(got.weekly, sd.venue)) got.weekly = {}; // still the venue's
  return sameHours(got.weekly, sd.from) ? null : got;
}
showDaysInit("ed"); showDaysInit("s");
$("ed-category").addEventListener("change", function () { showDaysFor("ed", this.value); });
$("s-category").addEventListener("change", function () { showDaysFor("s", this.value); });
