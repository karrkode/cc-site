// Chi Culture Crew site: the Show Run (CC-301): a month calendar of every performance, in the event edit form.
// Loaded after hours.js; it shares the global scope, so the names here are prefixed sr / SR / SHOWRUN where they could clash.
// The pure helpers come first (scripts/test_show_run.js checks them); the form code is below them.
//
// The words: an event's "Show Run" is every show it has, one row each: {date, time, end_time}; time is "" when it isn't
// posted. The API's `show_run` (GET, POST and PATCH /events/<id> only; lists send []) and `schedule.dates_from` ("event":
// the shows were saved in a form, so the event is on those dates only; "found": a venue's page gave them) are the two
// sides of it. The editor sends `show_run` only when it changed, and never the legacy `run_dates`.
"use strict";
var SHOWRUN_MAX = 500, SHOWS_A_DAY = 6, PATTERN_DAYS_MAX = 1100; // the API's limits; and how far one Fill goes (three years)

// ---------- pure helpers ----------
function srCopy(s) { return { date: s.date, time: s.time || "", end_time: s.end_time || "" }; }
function sortShows(list) { // by date, then time; a new list of the same shows
  return list.slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : a.time < b.time ? -1 : a.time > b.time ? 1 : 0; });
}
// The dates of a weekly pattern between two ISO dates ({mon: ["20:00"]}, and weeks {thu: [1, 3]} for some weeks of the month),
// as shows with no end time. Days that have passed are skipped; the range is cut at PATTERN_DAYS_MAX days.
function patternDates(from, to, weekly, weeks) {
  var out = [], a = parseISO(from), b = parseISO(to), now = isoDate(T);
  if (!a || !b || b < a) return out;
  for (var d = a, n = 0; d <= b && n < PATTERN_DAYS_MAX; d = add(d, 1), n++) {
    var iso = isoDate(d), times = (weekly || {})[DOW[d.getDay()]];
    if (iso < now || !times || !times.length || !onWeekOf(weeks, d)) continue;
    times.forEach(function (t) { out.push({ date: iso, time: t, end_time: "" }); });
  }
  return out;
}
// Add the pattern's shows that the Show Run doesn't have. It never removes or changes a show: a day that has a show with
// no time, or six shows already, is left alone (`left` counts those). Returns {shows, added: [dates], left}.
function mergePattern(shows, fresh) {
  var out = shows.map(srCopy), byDay = {}, added = [], left = 0;
  out.forEach(function (s) { (byDay[s.date] = byDay[s.date] || []).push(s); });
  fresh.forEach(function (f) {
    var day = byDay[f.date] = byDay[f.date] || [];
    if (day.some(function (s) { return s.time === f.time; })) return;
    if (day.some(function (s) { return !s.time; }) || day.length >= SHOWS_A_DAY) { left += 1; return; }
    var s = srCopy(f); out.push(s); day.push(s); added.push(f.date);
  });
  return { shows: sortShows(out), added: added, left: left };
}
// A month as weeks of seven cells, Monday first (like the show-day chips): an ISO date, or null outside the month.
function monthCells(year, month) {
  var lead = (new Date(year, month, 1).getDay() + 6) % 7, days = new Date(year, month + 1, 0).getDate(), cells = [], weeks = [];
  for (var i = 0; i < lead; i++) cells.push(null);
  for (var d = 1; d <= days; d++) cells.push(isoDate(new Date(year, month, d)));
  while (cells.length % 7) cells.push(null);
  for (i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}
// Where a key takes the focus from day iso: a day or a week; the week's Monday or Sunday; the same day a month on or back.
function gridMove(iso, key) {
  var d = parseISO(iso), dow = (d.getDay() + 6) % 7;
  if (key === "ArrowLeft") return isoDate(add(d, -1));
  if (key === "ArrowRight") return isoDate(add(d, 1));
  if (key === "ArrowUp") return isoDate(add(d, -7));
  if (key === "ArrowDown") return isoDate(add(d, 7));
  if (key === "Home") return isoDate(add(d, -dow));
  if (key === "End") return isoDate(add(d, 6 - dow));
  if (key === "PageUp" || key === "PageDown") {
    var m = d.getMonth() + (key === "PageDown" ? 1 : -1), last = new Date(d.getFullYear(), m + 1, 0).getDate();
    return isoDate(new Date(d.getFullYear(), m, Math.min(d.getDate(), last)));
  }
  return iso;
}
// What the API would refuse, as {error, date} for the first day at fault, or null. `kept`: {date: true} for the days the event
// already had (a past day it had stays editable; a new past day is refused).
function showsProblem(shows, kept) {
  var now = isoDate(T), by = {}, dates = [];
  if (shows.length > SHOWRUN_MAX) return { error: "A Show Run can have up to " + SHOWRUN_MAX + " shows.", date: sortShows(shows)[SHOWRUN_MAX].date };
  sortShows(shows).forEach(function (s) { if (!by[s.date]) { by[s.date] = []; dates.push(s.date); } by[s.date].push(s); });
  for (var i = 0; i < dates.length; i++) {
    var date = dates[i], day = by[date], label = goingDay(date);
    if (date < now && !(kept && kept[date])) return { error: label + " has passed, so a show can't be added on it.", date: date };
    if (day.length > SHOWS_A_DAY) return { error: label + ": six shows a day at most.", date: date };
    if (day.length > 1 && day.some(function (s) { return !s.time; })) return { error: label + ": give each show a start time, or keep only one show with no time.", date: date };
    for (var j = 0; j < day.length; j++) {
      var s = day[j];
      if (s.end_time && !s.time) return { error: label + ": an end time needs a start time.", date: date };
      if (s.end_time && s.end_time <= s.time) return { error: label + ": the show ends before it starts.", date: date };
      if (j && s.time === day[j - 1].time) return { error: label + ": two shows start at " + clockText(s.time) + ".", date: date };
    }
  }
  return null;
}
// The Show Run as entered, from the open form: {show_run: [{date, time, end_time}]}, or {error, id, date} for the day at fault.
function readShowRun() {
  var bad = showsProblem(SR.shows, SR.kept);
  if (bad) return { error: bad.error, id: "sr-d-" + bad.date, date: bad.date };
  return { show_run: sortShows(SR.shows).map(srCopy) };
}
// What to send for the Show Run: nothing when it's as it was; else the whole run. Emptying it also clears the dates, so the event
// is listed as "Dates not posted".
function showRunBody(before, after) {
  var norm = function (l) { return JSON.stringify(sortShows(l).map(srCopy)); };
  if (norm(before) === norm(after)) return {};
  return after.length ? { show_run: sortShows(after).map(srCopy) } : { show_run: [], begin_date: null, end_date: null };
}
// How the edit form takes dates, from the type and the form's state {open, kind}:
//   "showrun" Theater or Music: the calendar;  "open" Theater or Music, open run: Opens and the show days, as before;
//   "range" other types: Opens and Closes;  "dates" other types, "on chosen dates": the calendar.
function editorDateMode(type, st) {
  st = st || {};
  if (SHOW_TYPES[type]) return st.open ? "open" : "showrun";
  return st.kind === "dates" ? "dates" : "range";
}
// Notes under the calendar. e: the event as fromApi makes it; before: the shows it has now; shows: the shows in the form.
function showRunNotes(e, before, shows, found) {
  var notes = [], sorted = sortShows(shows), changed = showRunBody(before, shows).show_run !== undefined;
  if (found && before.length) notes.push("These dates came from the venue's website. Changing them makes this Show Run its only dates.");
  var listed = e.begin && e.end ? short(parseISO(e.begin)) + " – " + short(parseISO(e.end)) : e.begin ? "opening " + short(parseISO(e.begin)) : e.end ? "closing " + short(parseISO(e.end)) : "";
  if (sorted.length) {
    var a = sorted[0].date, b = sorted[sorted.length - 1].date;
    if (changed && listed && (a !== e.begin || b !== e.end)) notes.push("Listed now as " + listed + "; saving the Show Run sets " + short(parseISO(a)) + " – " + short(parseISO(b)) + ".");
  } else if (before.length) notes.push("No shows: saving lists it as Dates not posted.");
  else if (listed) notes.push("Listed now as " + listed + ". Add shows to list it on those days only.");
  else notes.push("No shows yet: it is listed as Dates not posted.");
  return notes;
}

// ---------- the form ----------
var SR = { e: null, before: [], shows: [], kept: {}, month: null, focus: "", day: "", dayRefs: [], last: "", snap: null, open: false, kind: "range", found: false, mode0: "", eatCancel: false };
var SR_KEYS = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"];
function srSay(text) { $("edit-live").textContent = text; }
function srDay(iso) { return dayName(parseISO(iso)); } // "Thursday, November 6"
function srShort(t) { // "20:00" -> "8p", "19:30" -> "7:30p": the cell's own room is small
  if (!t) return "TBA";
  var p = t.split(":"), h = +p[0];
  return (h % 12 || 12) + (p[1] === "00" ? "" : ":" + p[1]) + (h < 12 ? "a" : "p");
}
function srByDay() { // {date: [shows]} with the times in order
  var by = {};
  sortShows(SR.shows).forEach(function (s) { (by[s.date] = by[s.date] || []).push(s); });
  return by;
}
function srLocked(iso) { return iso < isoDate(T) && !SR.kept[iso]; } // a day that has passed, which the event didn't have
function srTimes(list) { return list.map(function (s) { return s.time ? clockText(s.time) : "time not posted"; }).join(" and "); }
function srLabel(iso, list) { // "Thursday, November 6, 8 PM show", "Saturday, November 8, 3 PM and 8 PM shows", "Friday, November 7, no show"
  var what = !list.length ? "no show" : list.length === 1 && !list[0].time ? "show, time not posted" : srTimes(list) + (list.length > 1 ? " shows" : " show");
  return srDay(iso) + ", " + what + (iso < isoDate(T) ? ", past" : "") + (srLocked(iso) ? ", can't be changed" : "");
}
function srCell(iso, by) {
  if (!iso) return '<td class="sr-blank" role="gridcell"></td>';
  var list = by[iso] || [], locked = srLocked(iso), now = isoDate(T);
  var cls = "sr-day" + (list.length ? " sr-has" : "") + (iso < now ? " sr-past" : "") + (iso === now ? " sr-today" : "");
  var times = list.length > 2 ? list.length + " shows" : list.map(function (s) { return srShort(s.time); }).join(" ");
  return '<td class="sr-cell" role="gridcell"><button type="button" class="' + cls + '" id="sr-d-' + iso + '" data-sr-day="' + iso + '" tabindex="' + (iso === SR.focus ? 0 : -1) +
    '" aria-pressed="' + (list.length ? "true" : "false") + '"' + (locked ? ' aria-disabled="true"' : "") + (iso === now ? ' aria-current="date"' : "") +
    ' aria-label="' + esc(srLabel(iso, list)) + '"><span class="sr-n" aria-hidden="true">' + +iso.slice(8) + '</span><span class="sr-t" aria-hidden="true">' + esc(times) +
    '</span><span class="sr-dot" aria-hidden="true">' + (list.length > 1 ? list.length : list.length ? "●" : "") + "</span></button></td>";
}
function srPaint() {
  var m = SR.month, by = srByDay(), sorted = sortShows(SR.shows), now = isoDate(T);
  if (SR.focus.slice(0, 7) !== isoDate(m).slice(0, 7)) SR.focus = isoDate(m); // the tab stop is always a day on show
  $("sr-month-h").textContent = F.monthY.format(m);
  $("sr-body").innerHTML = monthCells(m.getFullYear(), m.getMonth()).map(function (w) {
    return "<tr>" + w.map(function (iso) { return srCell(iso, by); }).join("") + "</tr>";
  }).join("");
  var up = sorted.filter(function (s) { return s.date >= now; }).length;
  $("sr-summary").textContent = sorted.length ? plural(sorted.length, "show", "shows") + ", " + goingDay(sorted[0].date) + " to " + goingDay(sorted[sorted.length - 1].date) +
    (up === sorted.length ? "." : " (" + up + " upcoming).") : "No shows yet.";
  $("sr-notes").innerHTML = showRunNotes(SR.e, SR.before, SR.shows, SR.found).map(function (n) { return '<p class="notice">' + esc(n) + "</p>"; }).join("");
}
function srFocusDay(iso) { // move the tab stop and the focus to a day, going to its month first
  var d = parseISO(iso), was = SR.month;
  SR.focus = iso; SR.month = new Date(d.getFullYear(), d.getMonth(), 1);
  if (!was || was.getTime() !== SR.month.getTime()) { srPaint(); srSay(F.monthY.format(SR.month)); }
  else Array.prototype.forEach.call($("sr-body").querySelectorAll("[data-sr-day]"), function (b) { b.tabIndex = b.getAttribute("data-sr-day") === iso ? 0 : -1; });
  var b = $("sr-d-" + iso); if (b) b.focus();
}
function srEdited() { SR.snap = null; $("sr-undo").hidden = true; $("sr-msg").textContent = ""; }
// ----- the day's panel: each show's Starts and Ends, Remove, Add another show, No show this day -----
function srPanelPaint() {
  var iso = SR.day, list = SR.shows.filter(function (s) { return s.date === iso; }), day = srDay(iso); SR.dayRefs = list;
  $("sr-panel-h").textContent = day + (list.length > 1 ? ", " + list.length + " shows" : "");
  $("sr-shows").innerHTML = list.map(function (s, i) {
    var id = "sr-" + i, who = list.length > 1 ? "Show " + (i + 1) + " on " + day : "Show on " + day;
    return '<div class="sr-show" role="group" aria-label="' + esc(who) + '">' +
      '<div class="field"><label for="' + id + '-t">Starts</label><input id="' + id + '-t" type="time" data-sr-t="' + i + '" value="' + esc(s.time) + '"></div>' +
      '<div class="field"><label for="' + id + '-e">Ends <span class="opt-label">(optional)</span></label><input id="' + id + '-e" type="time" data-sr-e="' + i + '" value="' + esc(s.end_time) + '"></div>' +
      '<button class="textbtn" type="button" data-sr-rm="' + i + '" aria-label="Remove ' + esc((s.time ? clockText(s.time) + " show" : "show with no time") + " on " + day) + '">Remove</button></div>';
  }).join("");
  $("sr-add").hidden = list.length >= SHOWS_A_DAY;
  srPanelMsg();
}
function srPanelMsg() {
  var bad = showsProblem(SR.dayRefs, SR.kept);
  var text = bad ? bad.error : "Leave Starts empty if the time isn't posted yet.";
  if ($("sr-panel-msg").textContent !== text) $("sr-panel-msg").textContent = text; // a status: said when it changes, not on each key
}
function srOpenPanel(iso) {
  SR.day = iso; $("sr-panel").hidden = false; srPaint(); srPanelPaint();
  $("sr-shows").querySelector("input").focus();
}
function srClosePanel(refocus) {
  var iso = SR.day; if (!iso) return;
  SR.day = ""; SR.shows = sortShows(SR.shows); $("sr-panel").hidden = true; srPaint();
  if (refocus) srFocusDay(iso);
}
function srDayClick(iso) {
  if (srLocked(iso)) { srSay(srDay(iso) + " has passed."); return; }
  if (SR.day && SR.day !== iso) srClosePanel(false);
  SR.focus = iso;
  if (!SR.shows.some(function (s) { return s.date === iso; })) {
    SR.shows.push({ date: iso, time: SR.last, end_time: "" }); srEdited();
    srSay("Added a show on " + srDay(iso) + (SR.last ? " at " + clockText(SR.last) + "." : ". Give it a start time."));
  }
  srOpenPanel(iso);
}
function srRemoveShows(refs, say) { // refs: shows to take out; closes the panel when its day is empty
  var iso = SR.day;
  SR.shows = SR.shows.filter(function (s) { return refs.indexOf(s) < 0; }); srEdited(); srSay(say);
  if (!SR.shows.some(function (s) { return s.date === iso; })) srClosePanel(true);
  else { srPaint(); srPanelPaint(); }
}
$("sr-shows").addEventListener("input", function (ev) {
  var t = ev.target, i = t.getAttribute("data-sr-t"), j = t.getAttribute("data-sr-e"), s = SR.dayRefs[+(i !== null ? i : j)];
  if (!s) return;
  if (i !== null) { s.time = t.value; if (t.value) SR.last = t.value; } else s.end_time = t.value;
  srEdited(); srPaint(); srPanelMsg();
});
$("sr-shows").addEventListener("click", function (ev) {
  var b = ev.target.closest("[data-sr-rm]"); if (!b) return;
  var i = +b.getAttribute("data-sr-rm"), s = SR.dayRefs[i], n = SR.dayRefs.length; if (!s) return;
  srRemoveShows([s], "Removed the " + (s.time ? clockText(s.time) + " " : "") + "show on " + srDay(s.date) + ".");
  if (n > 1 && SR.day) $("sr-" + Math.min(i, n - 2) + "-t").focus();
});
$("sr-add").addEventListener("click", function () {
  if (SR.dayRefs.length >= SHOWS_A_DAY) return;
  SR.shows.push({ date: SR.day, time: "", end_time: "" }); srEdited(); srPaint(); srPanelPaint();
  srSay("Added another show on " + srDay(SR.day) + ". Give it a start time."); $("sr-" + (SR.dayRefs.length - 1) + "-t").focus();
});
$("sr-none").addEventListener("click", function () {
  var refs = SR.dayRefs.slice(), day = SR.day;
  srRemoveShows(refs, "No show on " + srDay(day) + ": removed " + plural(refs.length, "show", "shows") + ".");
});
$("sr-done").addEventListener("click", function () { srClosePanel(true); });
// ----- the grid and the month -----
$("sr-body").addEventListener("click", function (ev) { var b = ev.target.closest("[data-sr-day]"); if (b) srDayClick(b.getAttribute("data-sr-day")); });
$("sr-grid").addEventListener("keydown", function (ev) {
  var b = ev.target.closest && ev.target.closest("[data-sr-day]");
  if (!b || SR_KEYS.indexOf(ev.key) < 0 || ev.altKey || ev.ctrlKey || ev.metaKey) return;
  ev.preventDefault(); srFocusDay(gridMove(b.getAttribute("data-sr-day"), ev.key));
});
function srShift(n) {
  srClosePanel(false);
  var d = SR.month, f = parseISO(SR.focus), to = new Date(d.getFullYear(), d.getMonth() + n, 1), last = new Date(to.getFullYear(), to.getMonth() + 1, 0).getDate();
  SR.month = to; SR.focus = isoDate(new Date(to.getFullYear(), to.getMonth(), Math.min(f.getDate(), last)));
  srPaint(); srSay(F.monthY.format(to));
}
$("sr-prev").addEventListener("click", function () { srShift(-1); });
$("sr-next").addEventListener("click", function () { srShift(1); });
// Escape closes the panel, back to its day, and not the dialog. Enter in a time box is Done, not Save.
$("ed-showrun").addEventListener("keydown", function (ev) {
  if (ev.key === "Escape" && SR.day) {
    ev.preventDefault(); ev.stopPropagation(); SR.eatCancel = true; setTimeout(function () { SR.eatCancel = false; }, 80);
    srClosePanel(true); return;
  }
  if (ev.key === "Enter" && ev.target.tagName === "INPUT" && ev.target.type !== "checkbox") {
    ev.preventDefault();
    if (SR.day && $("sr-panel").contains(ev.target)) srClosePanel(true); else if ($("sr-pattern").contains(ev.target)) $("sr-fill").click();
  }
});
// a browser that sends `cancel` for Escape whatever the key handler did: Escape that closed the panel doesn't close the dialog
window.addEventListener("cancel", function (ev) {
  if (SR.eatCancel && ev.target.id === "edit-dialog") { ev.preventDefault(); ev.stopPropagation(); }
}, true);
$("ed-showrun").addEventListener("input", function () { $("sr-msg").textContent = ""; });
// ----- Fill a pattern -----
showDaysInit("ed-pat");
function srFillFail(text, el) { $("sr-msg").textContent = text; if (el) el.focus(); }
$("sr-fill").addEventListener("click", function () {
  var from = $("sr-pat-from").value, to = $("sr-pat-to").value, days = readShowDays("ed-pat");
  $("sr-msg").textContent = "";
  if (days.error) return srFillFail(days.error, $(days.id));
  if (!Object.keys(days.weekly).length) return srFillFail("Choose the days of the week, with a start time for each.", $("ed-pat-days").firstElementChild);
  if (!from || !to) return srFillFail("Choose the first and the last date to fill.", $(from ? "sr-pat-to" : "sr-pat-from"));
  if (to < from) return srFillFail("The last date is before the first.", $("sr-pat-to"));
  if (diff(parseISO(to), parseISO(from)) >= PATTERN_DAYS_MAX) return srFillFail("Fill up to three years at a time.", $("sr-pat-to"));
  srClosePanel(false);
  var got = mergePattern(SR.shows, patternDates(from, to, days.weekly, days.weeks));
  if (got.shows.length > SHOWRUN_MAX) return srFillFail("A Show Run can have up to " + SHOWRUN_MAX + " shows. This would make " + got.shows.length + ".", $("sr-pat-to"));
  var left = got.left ? " " + plural(got.left, "show was", "shows were") + " left out: that day has a show with no time, or six shows." : "";
  if (!got.added.length) { srSay("No new shows: every day in that range already has them." + left); $("sr-msg").textContent = "No new shows: every day in that range already has them." + left; return; }
  SR.snap = SR.shows.map(srCopy); SR.shows = got.shows; $("sr-undo").hidden = false;
  var d = parseISO(got.added[0]); SR.month = new Date(d.getFullYear(), d.getMonth(), 1); SR.focus = got.added[0];
  srPaint();
  srSay("Added " + plural(got.added.length, "show", "shows") + ", " + goingDay(got.added[0]) + " to " + goingDay(got.added[got.added.length - 1]) + "." + left);
});
$("sr-undo").addEventListener("click", function () {
  if (!SR.snap) return;
  SR.shows = SR.snap; SR.snap = null; $("sr-undo").hidden = true; srPaint(); srSay("Undid the fill."); $("sr-fill").focus();
});
// ----- modes -----
function setRunKindLabels(edit) {
  $("ed-rk-range").textContent = edit ? "Between an opening and a closing date (an exhibition)" : "Between an opening and a closing date";
  $("ed-rk-fixed").textContent = edit ? "On chosen dates (a talk or performance)" : "Only on chosen dates (a fixed run)";
}
// Show what the mode and the type call for. In the edit form only (ED_MODE set).
function srRefresh() {
  var type = $("ed-category").value, mode = editorDateMode(type, SR), show = mode === "showrun" || mode === "dates";
  ED_MODE = mode;
  $("ed-showrun").hidden = !show; $("ed-runkind").hidden = !!SHOW_TYPES[type]; $("ed-range").hidden = show; $("ed-run").hidden = true;
  $("ed-end-field").hidden = SR.open; $("sr-open-field").hidden = !SHOW_TYPES[type]; $("ed-sched").hidden = mode !== "open";
  if (show) srPaint();
}
function srRunKindChanged() { // the Visual Art radios
  SR.kind = isFixedRun("ed") ? "dates" : "range"; srRefresh();
  srSay(SR.kind === "dates" ? "On chosen dates: the Show Run calendar is showing." : "Between an opening and a closing date: Opens and Closes are showing.");
}
function srOpenRun(on) {
  var from = document.activeElement;
  SR.open = on; $("ed-sr-open").checked = on; $("ed-open-run").checked = on; if (on) $("ed-end").value = "";
  srClosePanel(false); srRefresh();
  if (from === $("ed-sr-open") && on) $("ed-begin").focus();
  else if (from === $("ed-open-run") && ED_MODE === "showrun") $("ed-sr-open").focus();
  srSay(on ? "Open run: Opens and the show days are showing." : ED_MODE === "showrun" || ED_MODE === "dates" ? "The Show Run calendar is showing." : "Closes is showing.");
}
$("ed-sr-open").addEventListener("change", function () { if (ED_MODE) srOpenRun(this.checked); });
$("ed-open-run").addEventListener("change", function () { if (ED_MODE) srOpenRun(this.checked); });
$("ed-category").addEventListener("change", function () { // a new type switches the mode and keeps the shows
  if (!ED_MODE) return;
  if (!SHOW_TYPES[this.value] && SR.shows.length) SR.kind = "dates";
  var radio = document.querySelector('input[name="ed-runkind"][value="' + (SR.kind === "dates" ? "fixed" : "range") + '"]'); if (radio) radio.checked = true;
  srClosePanel(false); srRefresh();
});
// Called by openEditor with the event from GET /events/<id>, which carries its whole Show Run.
function srOpen(e) {
  var shows = sortShows(e.showRun || []), now = isoDate(T);
  SR.e = e; SR.before = shows.map(srCopy); SR.shows = shows.map(srCopy); SR.kept = {}; SR.day = ""; SR.dayRefs = []; SR.snap = null;
  SR.last = ""; SR.shows.forEach(function (s) { SR.kept[s.date] = true; if (s.time) SR.last = s.time; });
  SR.open = !!e.openRun; SR.kind = e.exactRun ? "dates" : "range"; SR.found = e.sched.dates_from === "found" && shows.length > 0;
  var next = e.firstMonth ? SR.shows[0] : SR.shows.filter(function (s) { return s.date >= now; })[0], at = next ? next.date : SR.shows.length ? SR.shows[SR.shows.length - 1].date : e.firstMonth && e.begin ? e.begin : now;
  SR.focus = at; SR.month = new Date(+at.slice(0, 4), +at.slice(5, 7) - 1, 1);
  var radio = document.querySelector('input[name="ed-runkind"][value="' + (SR.kind === "dates" ? "fixed" : "range") + '"]'); if (radio) radio.checked = true;
  $("ed-sr-open").checked = $("ed-open-run").checked = SR.open;
  // Fill a pattern starts with the event's own dates and show days, else its venue's usual show times
  var own = e.sched.weekly_from === "event", venue = e.sched.weekly_from === "venue" ? e.sched.weekly : {};
  $("sr-pat-from").value = e.begin || ""; $("sr-pat-to").value = e.end || "";
  setShowDays("ed-pat", own ? e.sched.weekly : venue, own ? e.sched.weeks : {});
  $("sr-pattern").open = false; $("sr-undo").hidden = true; $("sr-msg").textContent = ""; $("sr-panel").hidden = true;
  setRunKindLabels(true);
  srRefresh(); SR.mode0 = ED_MODE;
}
// CC-308: the approve form for a found event (found.js) shows the same calendar. i: the found item; shows: where it starts.
function srOpenFound(i, shows) {
  var own = Object.keys(i.weekly || {}).length, found = (i.performances || []).length > 0;
  srOpen({ firstMonth: true, showRun: shows, openRun: !!(i.open_run && !i.end_date), exactRun: found && !SHOW_TYPES[$("ed-category").value], begin: i.begin_date || "", end: i.end_date || "",
    sched: { dates_from: found ? "found" : "", weekly: own ? i.weekly : i.venue_show_times || {}, weekly_from: own ? "event" : "venue", weeks: own ? i.weeks || {} : {} } });
}
// The form was opened for a found event (srOpenFound), or the calendar is the one showing: what to approve with.
function foundCalendarOn() { return ED_MODE === "showrun" || ED_MODE === "dates"; }
// Called by foundMode when the form approves a found event: dates there work as before.
function srOff() {
  ED_MODE = null; SR.day = ""; $("sr-found-note").hidden = true; // CC-308: its note is for the approve form only
  $("ed-showrun").hidden = true; $("ed-end-field").hidden = false; setRunKindLabels(false);
}
// The date fields to save from the edit form: {body}, or {error, id, date} (a field's id, or a day of the Show Run).
function editorDates(e) {
  var mode = ED_MODE, body = {};
  if (mode === "showrun" || mode === "dates") {
    // CC-301: only a changed run is checked; found shows (6+ a day) must not block saving the title or price
    var same = showRunBody(SR.before, SR.shows); // {} when unchanged
    var got = Object.keys(same).length ? readShowRun() : { show_run: SR.before }; if (got.error) return got;
    body = showRunBody(SR.before, got.show_run); // the API sets its Opens and Closes, and takes away any show days
    if (e.openRun) body.open_run = false;
    return { body: body };
  }
  var begin = $("ed-begin").value || null, end = $("ed-end").value || null, open = $("ed-open-run").checked;
  if (open) end = null;
  if (mode === "range" && begin && end && end < begin) return { error: "The closing date is before the opening date.", id: "ed-end" };
  var weekly = $("ed-sched").hidden ? null : weeklyChange("ed"); // null when the show days are as they were
  if (weekly && weekly.error) return weekly;
  if (begin !== (e.begin || null)) body.begin_date = begin;
  if (end !== (e.end || null)) body.end_date = end;
  if (open !== !!e.openRun) body.open_run = open;
  if (weekly) { body.weekly = weekly.weekly; body.weeks = weekly.weeks; }
  if (SR.before.length && (SR.mode0 === "showrun" || SR.mode0 === "dates")) { // it was a Show Run and no longer is: remove it, and set the dates it leaves
    body.show_run = []; body.begin_date = begin; body.end_date = end; body.open_run = open;
    if (!$("ed-sched").hidden) {
      var w = weekly || { weekly: SHOW_DAYS.ed.from.weekly || {}, weeks: SHOW_DAYS.ed.from.weeks || {} };
      body.weekly = w.weekly; body.weeks = w.weeks;
    }
  }
  return { body: body };
}
