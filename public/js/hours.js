// Culture Crew site: Venue hours (admins, CC-78): opening hours and usual show times, on the Venues page.
// Loaded by index.html in order (core, util, catalog, planner, account, crews, submit, admin, hours, found, issues, photos, approvals, start); they share one
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
// In the event edit form ("ed": also approving a found event) and Submit an event ("s"). Find an outing only
// suggests a performance when it knows the start times: dated performances found on the venue's site, else
// these show days, else the venue's usual show times. Only Theater, Comedy and Music have them (musicals are
// theater); Visual Art goes by the venue's opening hours.
var SHOW_TYPES = { Theater: 1, Comedy: 1, Music: 1 }; // CC-125: Concert is now Music
var SHOW_DAYS = {}; // per form: { days: {mon: ["8 PM", ...]} as typed, weeks: {mon: [1, 3]} (some weeks of the month only),
                    //   some: {mon: true} while "Some weeks" is chosen, from: the pattern the form started with }
var WEEK_NAMES = [[1, "1st"], [2, "2nd"], [3, "3rd"], [4, "4th"], [5, "Last"]];
function showDaysInit(f) {
  SHOW_DAYS[f] = { days: {}, weeks: {}, some: {}, from: {} };
  $(f + "-days").innerHTML = HOUR_DAYS.map(function (d) {
    return '<button type="button" class="chip" aria-pressed="false" data-show-day="' + d[0] + '" aria-label="' + d[1] + '">' + d[1].slice(0, 3) + "</button>";
  }).join("");
  $(f + "-days").addEventListener("click", function (ev) {
    var b = ev.target.closest("[data-show-day]"); if (!b) return;
    var k = b.getAttribute("data-show-day"), sd = SHOW_DAYS[f];
    if (sd.days[k]) { delete sd.days[k]; delete sd.weeks[k]; delete sd.some[k]; }
    else { // a new day starts like the one before it
      var before = HOUR_DAYS.map(function (d) { return d[0]; }).filter(function (d) { return sd.days[d]; }).pop();
      sd.days[k] = before ? sd.days[before].slice() : [""];
      if (before && sd.some[before]) { sd.some[k] = true; sd.weeks[k] = (sd.weeks[before] || []).slice(); }
    }
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
  $(f + "-weekly").addEventListener("change", function (ev) { // Every week, or some weeks of the month
    var k = ev.target.getAttribute("data-weeks-of"); if (!k) return;
    var sd = SHOW_DAYS[f];
    if (ev.target.value === "some") sd.some[k] = true; else { delete sd.some[k]; delete sd.weeks[k]; }
    paintShowDays(f);
    (sd.some[k] ? document.querySelector("#" + f + '-weekly [data-week-of="' + k + '"]') : $(f + "-wk-" + k)).focus();
  });
  $(f + "-weekly").addEventListener("click", function (ev) {
    var w = ev.target.closest("[data-week-of]");
    if (w) {
      var sdw = SHOW_DAYS[f], kw = w.getAttribute("data-week-of"), n = +w.getAttribute("data-week"), on = sdw.weeks[kw] || [];
      sdw.weeks[kw] = on.indexOf(n) >= 0 ? on.filter(function (x) { return x !== n; }) : on.concat([n]).sort();
      w.setAttribute("aria-pressed", String(sdw.weeks[kw].indexOf(n) >= 0));
      return;
    }
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
      '</span><span class="weeks-of"><label class="sr-only" for="' + f + "-wk-" + k + '">' + d[1] + ": which weeks</label>" +
      '<select id="' + f + "-wk-" + k + '" data-weeks-of="' + k + '"><option value="">Every week</option><option value="some"' + (sd.some[k] ? " selected" : "") +
      ">Some weeks of the month</option></select>" + (sd.some[k] ? '<span class="day-picks" role="group" aria-label="' + d[1] + ': weeks of the month">' +
        WEEK_NAMES.map(function (w) {
          return '<button type="button" class="chip" data-week-of="' + k + '" data-week="' + w[0] + '" aria-pressed="' + ((sd.weeks[k] || []).indexOf(w[0]) >= 0) + '"' +
            ' aria-label="' + (w[0] === 5 ? "The last" : "The " + w[1]) + " " + d[1] + ' of the month">' + w[1] + "</button>";
        }).join("") + "</span>" : "") + "</span></div>";
  }).join("") + (on.length > 1 ? '<button type="button" class="textbtn" id="' + f + '-same" data-show-act="same" data-day="' + on[0][0] + '">Use ' +
    on[0][1] + "'s times for every day</button>" : "");
}
// Start the form with a pattern ({day: ["HH:MM"]}, and weeks {day: [1, 3]}); it's also what counts as "unchanged" when saving.
function setShowDays(f, weekly, weeks) {
  var sd = SHOW_DAYS[f]; sd.days = {}; sd.weeks = {}; sd.some = {};
  HOUR_DAYS.forEach(function (d) {
    var k = d[0]; if (!weekly || !weekly[k] || !weekly[k].length) return;
    sd.days[k] = weekly[k].map(clockText);
    if (weeks && weeks[k] && weeks[k].length) { sd.weeks[k] = weeks[k].slice(); sd.some[k] = true; }
  });
  sd.from = { weekly: weekly || {}, weeks: weeks || {} }; paintShowDays(f);
}
function showDaysFor(f, type) { $(f + "-sched").hidden = !SHOW_TYPES[type] || isFixedRun(f) || datesUnknown(f); } // a fixed run has its own times (CC-96)
// The show days as entered: {weekly, weeks} ({} for none), or {error, id} for a day without a time, a time we can't read,
// or "Some weeks" without any weeks chosen.
function readShowDays(f) {
  var out = {}, weeks = {}, bad = null, sd = SHOW_DAYS[f];
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
    if (sd.some[k] && !(sd.weeks[k] || []).length) {
      bad = { error: "Choose which weeks of the month " + d[1] + " is on, or choose Every week.", id: f + "-wk-" + k }; return true;
    }
    out[k] = times.sort();
    if (sd.some[k]) weeks[k] = sd.weeks[k].slice().sort();
    return false;
  });
  return bad || { weekly: out, weeks: weeks };
}
// "Thu 8 PM · Fri, Sat 8 PM and 10:30 PM": days in a row with the same times share them (cards, CC-88). With weeks of
// the month: "1st and 3rd Thu 8 PM", "Last Sun 7 PM".
function weeksText(on) { // [1, 3] -> "1st and 3rd ", [5] -> "Last ", [1, 5] -> "1st and last "
  if (!on || !on.length) return "";
  var t = on.map(function (n) { return n === 5 ? "last" : WEEK_NAMES[n - 1][1]; }).join(" and ");
  return t.charAt(0).toUpperCase() + t.slice(1) + " ";
}
function showDaysText(w, weeks) {
  var groups = [];
  HOUR_DAYS.forEach(function (d) {
    var times = w && w[d[0]]; if (!times || !times.length) return;
    var t = times.map(clockText).join(" and "), wk = weeksText(weeks && weeks[d[0]]), last = groups[groups.length - 1];
    if (last && last.t === t && last.wk === wk) last.days.push(d[1].slice(0, 3)); else groups.push({ days: [d[1].slice(0, 3)], t: t, wk: wk });
  });
  return groups.map(function (g) { return g.wk + g.days.join(", ") + " " + g.t; }).join(" · ");
}
// The edit form: its own show days if it has some, else the venue's usual show times to start from.
function fillWeekly(e) { // e: an event as fromApi makes it
  showDaysFor("ed", e.type);
  var own = e.sched.weekly_from === "event", venue = e.sched.weekly_from === "venue" ? e.sched.weekly : {};
  setShowDays("ed", own ? e.sched.weekly : venue, own ? e.sched.weeks : {});
  SHOW_DAYS.ed.from = own ? { weekly: e.sched.weekly, weeks: e.sched.weeks || {} } : { weekly: {}, weeks: {} }; SHOW_DAYS.ed.venue = venue;
  $("ed-sched-hint").textContent = (e.sched.dates.length ? plural(e.sched.dates.length, "upcoming date", "upcoming dates") +
    " came from the venue's website; those come first. " : "") +
    (own ? "" : Object.keys(venue).length ? "These are the venue's usual show times; change them if this show is different. " :
      "Choose the days, and give a start time for each. ") + "Without any, Find an outing won't suggest it.";
}
// What to save from the edit form: null if the show days are as they were (the venue's, untouched, stay the venue's).
function weeklyChange(f) {
  var got = readShowDays(f); if (got.error) return got;
  var sd = SHOW_DAYS[f];
  if (sd.venue && Object.keys(sd.venue).length && sameHours(got.weekly, sd.venue) && !Object.keys(got.weeks).length) got.weekly = {}; // still the venue's
  return sameHours(got.weekly, sd.from.weekly) && sameHours(got.weeks, sd.from.weeks) ? null : got;
}
showDaysInit("ed"); showDaysInit("s");
$("ed-category").addEventListener("change", function () { showDaysFor("ed", this.value); });
$("s-category").addEventListener("change", function () { showDaysFor("s", this.value); });

// ---------- fixed runs (CC-96) ----------
// "When is it on?": between an opening and a closing date (with show days, as before), or only on chosen dates, a
// fixed run. A run is up to 30 dates, each with a start time and, if known, an end time; the opening and closing
// dates are then its first and last. RUN[f] holds the dates while the form is open ("s" submit, "ed" the editor).
var RUN_MAX = 30, RUN = { s: [], ed: [] };
function isFixedRun(f) { var r = document.querySelector('input[name="' + f + '-runkind"]:checked'); return !!r && r.value === "fixed"; }
// CC-102: "Don't know!" (Submit only): sent with no dates at all, and the crew looks them up
function datesUnknown(f) { var r = document.querySelector('input[name="' + f + '-runkind"]:checked'); return !!r && r.value === "unknown"; }
function paintRunKind(f) {
  var fixed = isFixedRun(f), unknown = datesUnknown(f);
  $(f + "-range").hidden = fixed || unknown; $(f + "-run").hidden = !fixed;
  showDaysFor(f, $(f + "-category").value);
  $(f + "-run-day").min = isoDate(T);
}
function setRun(f, dates) { // dates: [{date, time, end_time}] from the API; [] starts the form as a date range
  RUN[f] = (dates || []).map(function (r) { return { date: r.date, time: r.time || "", end_time: r.end_time || "" }; });
  document.querySelector('input[name="' + f + '-runkind"][value="' + (RUN[f].length ? "fixed" : "range") + '"]').checked = true;
  $(f + "-run-day").value = ""; paintRun(f); paintRunKind(f);
}
function paintRun(f) {
  $(f + "-run-list").innerHTML = RUN[f].map(function (r, i) {
    var day = goingDay(r.date), id = f + "-run-" + i;
    return '<li class="run-date" data-run-row="' + i + '"><span class="run-day">' + esc(day) + "</span>" +
      '<span class="run-time"><label for="' + id + '-t">Starts</label><input id="' + id + '-t" type="time" data-run-time="' + i + '" value="' + esc(r.time) + '" aria-label="Start time on ' + esc(day) + '"></span>' +
      '<span class="run-time"><label for="' + id + '-e">Ends <span class="opt-label">(optional)</span></label><input id="' + id + '-e" type="time" data-run-end="' + i + '" value="' + esc(r.end_time) + '" aria-label="End time on ' + esc(day) + ' (optional)"></span>' +
      '<button class="textbtn" type="button" data-run-remove="' + f + '" data-i="' + i + '" aria-label="Remove ' + esc(day) + '">Remove</button></li>';
  }).join("");
  $(f + "-run-list").hidden = !RUN[f].length;
}
// The run as entered: {run_dates} or {error, id}.
function readRun(f) {
  if (!RUN[f].length) return { error: "Add at least one date for the fixed run.", id: f + "-run-day" };
  for (var i = 0; i < RUN[f].length; i++) {
    var r = RUN[f][i];
    if (!r.time) return { error: "Give a start time for " + goingDay(r.date) + ".", id: f + "-run-" + i + "-t" };
    if (r.end_time && r.end_time <= r.time) return { error: "On " + goingDay(r.date) + ", the end time is before the start.", id: f + "-run-" + i + "-e" };
  }
  return { run_dates: RUN[f].map(function (r) { return { date: r.date, time: r.time, end_time: r.end_time }; }) };
}
document.addEventListener("change", function (ev) {
  var m = /^(s|ed)-runkind$/.exec(ev.target.name || ""); if (!m) return;
  var f = m[1];
  if (isFixedRun(f) && !RUN[f].length && $(f + "-begin").value >= isoDate(T)) $(f + "-run-day").value = $(f + "-begin").value; // a head start
  if (!isFixedRun(f) && RUN[f].length) { $(f + "-begin").value = RUN[f][0].date; $(f + "-end").value = RUN[f][RUN[f].length - 1].date; }
  paintRunKind(f);
});
document.addEventListener("input", function (ev) {
  var t = ev.target, row = t.closest && t.closest(".run-dates"); if (!row) return;
  var f = row.id.replace(/-run-list$/, ""), i = t.getAttribute("data-run-time") || t.getAttribute("data-run-end");
  if (i === null || !RUN[f][+i]) return;
  RUN[f][+i][t.hasAttribute("data-run-time") ? "time" : "end_time"] = t.value;
});
document.addEventListener("click", function (ev) {
  var add = ev.target.closest("[data-run-add]"), rm = ev.target.closest("[data-run-remove]");
  if (add) {
    var f = add.getAttribute("data-run-add"), input = $(f + "-run-day"), day = input.value;
    var say = function (text) { $(f === "s" ? "submit-error" : "ed-error").textContent = text; input.focus(); };
    if (!day) return say("Pick a date to add.");
    if (day < isoDate(T) && !(f === "ed" && EDITING && EDITING.e.runDates && EDITING.e.runDates.some(function (r) { return r.date === day; }))) return say("That date has passed.");
    if (RUN[f].some(function (r) { return r.date === day; })) return say(goingDay(day) + " is already in the run.");
    if (RUN[f].length >= RUN_MAX) return say("A fixed run can have up to " + RUN_MAX + " dates.");
    var last = RUN[f][RUN[f].length - 1]; // a new date starts at the time the last one had, which is usually right
    RUN[f].push({ date: day, time: last ? last.time : "", end_time: last ? last.end_time : "" });
    RUN[f].sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    input.value = ""; paintRun(f);
    var at = RUN[f].map(function (r) { return r.date; }).indexOf(day); $(f + "-run-" + at + "-t").focus();
    $("edit-live").textContent = "Added " + goingDay(day) + ".";
  } else if (rm) {
    var g = rm.getAttribute("data-run-remove"), n = +rm.getAttribute("data-i"), gone = RUN[g][n];
    RUN[g].splice(n, 1); paintRun(g);
    var next = $(g + "-run-" + Math.min(n, RUN[g].length - 1) + "-t"); (next || $(g + "-run-day")).focus();
    $("edit-live").textContent = "Removed " + goingDay(gone.date) + ".";
  }
});
paintRunKind("s"); paintRunKind("ed");
