// Culture Crew site: Venue hours (admins, CC-78): opening hours and usual show times, on the Venues page.
// Loaded by index.html in order (core, util, catalog, planner, account, submit, admin, hours, found, start); they share one
// global scope, so anything declared here is visible to the files after it.
"use strict";
// Each venue keeps open_hours ({day: [opens, closes] | null for closed}; a day left out isn't known) and
// show_times ({day: [start times]}), both 24-hour "HH:MM". Event discovery fills them in from the venue's
// site; once an admin saves them here, discovery leaves them alone. They're stored for the planner (CC-79).
var HOUR_DAYS = [["mon", "Monday"], ["tue", "Tuesday"], ["wed", "Wednesday"], ["thu", "Thursday"], ["fri", "Friday"], ["sat", "Saturday"], ["sun", "Sunday"]];
var HDLG = null; // { v, opener }

function clockText(t) { // "19:30" -> "7:30 PM", "14:00" -> "2 PM"
  var p = t.split(":"), h = +p[0], m = p[1];
  return (h % 12 || 12) + (m === "00" ? "" : ":" + m) + (h < 12 ? " AM" : " PM");
}
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
      '<input type="time" id="hd-opens-' + k + '"><span aria-hidden="true">to</span><label class="sr-only" for="hd-closes-' + k + '">' + d[1] + " closes</label>" +
      '<input type="time" id="hd-closes-' + k + '"></span></div>';
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
    $("hd-opens-" + k).value = known && h[k] ? h[k][0] : ""; $("hd-closes-" + k).value = known && h[k] ? h[k][1] : "";
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
  if (sel.value === "open" && !$("hd-opens-" + k).value) $("hd-opens-" + k).focus();
});
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
    var k = d[0], state = $("hd-state-" + k).value, o = $("hd-opens-" + k).value, c = $("hd-closes-" + k).value;
    if (state === "closed") open[k] = null;
    if (state === "open") {
      if (!o || !c) { problem = [d[1] + ": give both the opening and the closing time.", o ? "hd-closes-" + k : "hd-opens-" + k]; return true; }
      if (o === c) { problem = [d[1] + ": the closing time is the same as the opening time.", "hd-closes-" + k]; return true; }
      open[k] = [o, c];
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
