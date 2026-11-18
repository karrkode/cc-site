// Chi Culture Crew site: crew date polls (CC-297). A member starts a poll for a performance from one of their crews;
// crew-mates tick the showtimes that work; the poll shows the best time with first names; the starter locks one in, and
// each member who said yes can Commit to it (Going, shared with the crew). Loaded after crews.js (index.html); they share
// one global scope. Data: GET /crews/polls (every poll of your crews, open or closed in the last two weeks).
"use strict";
var POLL_BUSY = {}, POLL_ERR = {}; // POLL_BUSY: a poll's answer being saved (and whether another tick came meanwhile); POLL_ERR: the last error shown on a poll's card
var POLLS = [], POLL_OPEN = {}, POLL_ASK = null; // POLL_OPEN: event ids whose start panel is open; POLL_ASK: a poll being cancelled
function pollsFor(test) { return AUTH.user ? POLLS.filter(test) : []; }
function pollsOfEvent(id) { return pollsFor(function (p) { return String(p.event_id) === String(id); }); }
function pollsOfCrew(id) { return pollsFor(function (p) { return p.crew_id === id; }); }
function pollsWaiting() { return pollsFor(function (p) { return p.status === "open" && !p.you_answered; }); }
function pollById(id) { return POLLS.filter(function (p) { return String(p.id) === String(id); })[0]; }

function loadPolls() {
  if (!AUTH.user) { POLLS = []; return Promise.resolve(); }
  return api("/crews/polls").then(readJSON).then(function (res) {
    if (res.ok) { POLLS = res.body; pollsRepaint(); }
  }, function () {});
}
function pollsRepaint() {
  if (typeof visible === "function" && visible("event") && EV.e) renderEventView();
  if (visible("crews")) paintCrews();
  paintPending(); // the count on your name and Waiting for you, whichever page is showing
}
function pollPut(p) { // a poll as the API now has it
  var i = POLLS.findIndex(function (x) { return x.id === p.id; });
  if (i < 0) POLLS.unshift(p); else POLLS[i] = p;
}
function pollWhen(o) { return goWhen(o.date, o.time); }
function pollNames(names) { return names.length ? names.join(", ") : "nobody yet"; }

// ---------- one poll ----------
function pollBestHTML(p) {
  if (!p.best.length) return '<p class="poll-none">Nobody has ticked a time yet.</p>';
  return '<ol class="poll-best">' + p.best.map(function (b, i) {
    var all = b.everyone ? "all " + b.count + " of you" : b.count + " of " + p.members_total;
    return '<li><span class="poll-best-t">' + (i === 0 ? '<span class="poll-tag">Best</span> ' : "") + esc(pollWhen(b)) + "</span> " +
      '<span class="poll-best-n">' + esc(all) + ": " + esc(pollNames(b.names)) + "</span>" +
      (p.can_manage && p.status === "open" ? ' <button class="btn ghost poll-lock" type="button" data-poll-act="lock" data-poll="' + p.id + '" data-option="' + b.option_id +
        '" aria-label="Lock in ' + esc(pollWhen(b)) + '">Lock in</button>' : "") + "</li>";
  }).join("") + "</ol>";
}
function pollGridHTML(p, where) { // dates as rows, times as buttons (on a phone the rows stack: a list of days with time chips)
  var days = [], by = {};
  p.options.forEach(function (o) { if (!by[o.date]) { by[o.date] = []; days.push(o.date); } by[o.date].push(o); });
  var none = p.you_answered && !p.options.some(function (o) { return o.yours; });
  return '<ul class="poll-days" aria-label="Showtimes that work for you">' + days.map(function (d) {
    var dl = "poll-dl-" + esc(where) + "-" + p.id + "-" + d;
    return '<li class="poll-day"><span class="poll-day-l" id="' + dl + '">' + esc(goingDay(d)) + '</span><span class="poll-times" role="group" aria-labelledby="' + dl + '">' + by[d].map(function (o) {
      return '<button class="poll-cell" type="button" data-poll-act="tick" data-poll="' + p.id + '" data-option="' + o.id + '" aria-pressed="' + o.yours + '"' + (o.date < isoDate(T) ? " disabled" : "") + ">" +
        esc(o.time ? clockText(o.time) : "Any time") + (o.count ? ' <span class="poll-cell-n" aria-hidden="true">' + o.count + '</span><span class="sr-only">, ' + plural(o.count, "person", "people") + " can make it</span>" : "") + "</button>";
    }).join("") + "</span></li>";
  }).join("") + "</ul>" +
    '<div class="row"><button class="btn ghost" type="button" data-poll-act="none" data-poll="' + p.id + '" aria-pressed="' + none + '">None of these work</button></div>';
}
function pollManageHTML(p, where) {
  if (!p.can_manage || p.status !== "open") return "";
  if (POLL_ASK === p.id) {
    return '<div class="row poll-manage"><span>Cancel this poll for everyone?</span><button class="btn" type="button" data-poll-act="cancel-yes" data-poll="' + p.id + '">Yes, cancel it</button>' +
      '<button class="btn ghost" type="button" data-poll-act="cancel-no" data-poll="' + p.id + '">Keep it</button></div>';
  }
  return '<div class="row poll-manage"><label class="poll-other" for="poll-pick-' + where + "-" + p.id + '">Lock in another time</label>' +
    '<select id="poll-pick-' + where + "-" + p.id + '">' + p.options.map(function (o) { return '<option value="' + o.id + '">' + esc(pollWhen(o)) + "</option>"; }).join("") + "</select>" +
    '<button class="btn ghost" type="button" data-poll-act="lock-pick" data-poll="' + p.id + '">Lock in</button>' +
    '<button class="textbtn" type="button" data-poll-act="cancel" data-poll="' + p.id + '">Cancel poll</button></div>';
}
function pollCommitted(p) { // you're already Going on the locked day and time
  var mine = MYPLANS[p.event_id];
  return !!mine && mine.status === "going" && p.locked && mine.date === p.locked.date && (mine.time || "") === (p.locked.time || "");
}
function pollCardHTML(p, where) {
  var lv = where === "crew" ? "h5" : "h2"; // under the crew's "Date polls" h4, or the event page's h1
  var id = esc(p.id), head = where === "crew" ? p.event_title : where === "event" ? p.crew_name : p.event_title + " · " + p.crew_name;
  var h = '<div class="poll poll-' + esc(p.status) + '" data-poll-card="' + id + '"><' + lv + ' class="poll-h" id="poll-h-' + where + "-" + id + '">Date poll: ' + esc(head) + "</" + lv + ">";
  if (p.status === "open") {
    h += '<p class="poll-count">' + p.answered_count + " of " + p.members_total + " have answered · started by " + esc(p.started_by) + "</p>" +
      pollBestHTML(p) + pollGridHTML(p, where) + pollManageHTML(p, where);
  } else if (p.status === "locked" && p.locked) {
    h += '<p class="poll-lockedline"><strong>Locked in: ' + esc(pollWhen(p.locked)) + "</strong> · " + esc(pollNames(p.locked.names)) + " can make it.</p>";
    if (p.locked.yours) {
      h += pollCommitted(p) ? '<p class="hint">You’re going on this date.</p>' :
        '<div class="row"><button class="btn" type="button" data-poll-act="commit" data-poll="' + id + '">Commit to ' + esc(pollWhen(p.locked)) + "</button></div>";
    }
  } else {
    h += '<p class="hint">' + (p.status === "cancelled" ? "Cancelled." : "Every date in this poll has passed.") + "</p>";
  }
  return h + '<p class="form-error" role="alert" data-poll-err="' + id + '">' + esc(POLL_ERR[p.id] || "") + "</p></div>";
}

// ---------- on the event's page ----------
function pollsEventHTML(e) { // the crew's polls for this event, and the button to start one
  if (!AUTH.user || !CREWS.length) return "";
  var mine = pollsOfEvent(e.id), open = mine.filter(function (p) { return p.status === "open"; });
  var h = mine.map(function (p) { return pollCardHTML(p, "event"); }).join("");
  var canStart = !isPast(e) && !isExhibit(e) && goDays(e, 1).length;
  var free = CREWS.filter(function (c) { return !open.some(function (p) { return p.crew_id === c.id; }); });
  if (canStart && free.length) {
    var on = !!POLL_OPEN[e.id];
    h += '<div class="poll-start"><button class="btn ghost" type="button" data-poll-act="start-open" data-event="' + esc(e.id) + '" aria-expanded="' + on + '" aria-controls="poll-form-' + esc(e.id) + '">Find a date with my crew</button>' +
      (on ? pollFormHTML(e, free) : "") + "</div>";
  }
  return h ? '<section class="polls" aria-label="Date polls">' + h + "</section>" : "";
}
function pollWindow(e) { // default: the next show to the last, at most 60 days
  var days = goDays(e, 120), dates = e.sched.dates; if (!days.length) return null;
  var from = days[0], to = dates.length ? parseISO(dates[dates.length - 1].date) : days[days.length - 1], cap = add(from, 59);
  return [isoDate(from), isoDate(to > cap ? cap : to)];
}
function pollOptions(e, from, to) { // [{date, time}] for every show in the window
  var out = [], a = parseISO(from), b = parseISO(to), dates = e.sched.dates, last = dates.length ? dates[dates.length - 1].date : "";
  if (!a || !b) return out;
  for (var d = a; d <= b; d = add(d, 1)) {
    var iso = isoDate(d); // past its listed dates nothing is known (a Going picker still takes any day, a poll doesn't)
    if (!canGoOn(e, d) || (last && iso > last)) continue;
    var times = goTimes(e, iso);
    (times.length ? times : [""]).forEach(function (t) { out.push({ date: iso, time: t }); });
  }
  return out;
}
function pollFormHTML(e, crews) {
  var w = pollWindow(e), id = esc(e.id); if (!w) return "";
  return '<form class="poll-form panel" id="poll-form-' + id + '" data-poll-form="' + id + '" novalidate>' +
    (crews.length > 1 ? '<label>Crew<select id="poll-crew-' + id + '">' + crews.map(function (c) { return '<option value="' + esc(c.id) + '">' + esc(c.name) + "</option>"; }).join("") + "</select></label>" :
      '<p>Crew: <strong>' + esc(crews[0].name) + '</strong><input type="hidden" id="poll-crew-' + id + '" value="' + esc(crews[0].id) + '"></p>') +
    '<div class="row"><label>From<input type="date" id="poll-from-' + id + '" value="' + w[0] + '" min="' + isoDate(T) + '"></label>' +
    '<label>To<input type="date" id="poll-to-' + id + '" value="' + w[1] + '"></label></div>' +
    '<p class="hint" id="poll-n-' + id + '" role="status"></p><ul class="poll-preview" id="poll-list-' + id + '" aria-label="The showtimes in this poll"></ul>' +
    '<div class="row"><button class="btn" type="submit">Start the poll</button><button class="btn ghost" type="button" data-poll-act="start-close" data-event="' + id + '">Cancel</button></div>' +
    '<p class="form-error" role="alert" id="poll-ferr-' + id + '"></p></form>';
}
function pollFormCount(form) {
  var id = form.getAttribute("data-poll-form"), e = KNOWN[id] || EV.e; if (!e) return [];
  var opts = pollOptions(e, $("poll-from-" + id).value, $("poll-to-" + id).value), n = $("poll-n-" + id);
  var days = {}; opts.forEach(function (o) { (days[o.date] = days[o.date] || []).push(o.time ? clockText(o.time) : "Any time"); });
  $("poll-list-" + id).innerHTML = Object.keys(days).map(function (k) { return "<li><strong>" + esc(goingDay(k)) + "</strong>: " + esc(days[k].join(", ")) + "</li>"; }).join("");
  n.textContent = !opts.length ? "No showtimes in that window." : opts.length > 40 ? "That’s " + opts.length + " showtimes: choose a shorter window (40 at most)." :
    plural(opts.length, "showtime", "showtimes") + " on " + plural(Object.keys(days).length, "day", "days") + " for your crew to choose from.";
  return opts;
}
document.addEventListener("input", function (ev) {
  var f = ev.target.closest && ev.target.closest("[data-poll-form]"); if (f && ev.target.type === "date") pollFormCount(f);
});
document.addEventListener("submit", function (ev) {
  var f = ev.target.closest && ev.target.closest("[data-poll-form]"); if (!f) return;
  ev.preventDefault();
  var id = f.getAttribute("data-poll-form"), opts = pollFormCount(f), err = $("poll-ferr-" + id), btn = f.querySelector('[type="submit"]');
  err.textContent = "";
  if (!opts.length || opts.length > 40) { err.textContent = checkThis($("poll-n-" + id).textContent); return; }
  var crewId = $("poll-crew-" + id).value; btn.disabled = true;
  api("/crews/" + encodeURIComponent(crewId) + "/polls", { method: "POST", body: { event_id: +id, window_from: $("poll-from-" + id).value, window_to: $("poll-to-" + id).value, options: opts } })
    .then(readJSON).then(function (res) {
      if (!res.ok) { btn.disabled = false; err.textContent = checkThis(errorText(res)); return; }
      pollPut(res.body); delete POLL_OPEN[id]; renderEventView();
      $("myplan-live").textContent = "Poll started for " + res.body.crew_name + ".";
      var h = pollFocus('[data-poll-card="' + res.body.id + '"] .poll-h'); if (h) h.setAttribute("tabindex", "-1");
    }, function () { btn.disabled = false; err.textContent = checkThis(errorText(null)); });
});

// ---------- actions ----------
function pollRedraw(p, focusSel) {
  pollPut(p); pollsRepaint(); paintPending();
  if (focusSel) pollFocus(focusSel);
}
function pollFocus(sel) { // the copy in the view that's showing (the same poll may also sit, hidden, in another view)
  var el = Array.prototype.filter.call(document.querySelectorAll(sel), function (x) { return x.offsetParent !== null; })[0] || document.querySelector(sel);
  if (el) { if (el.classList.contains("poll-h")) el.setAttribute("tabindex", "-1"); el.focus(); }
  return el;
}
function pollFail(id, res) {
  POLL_ERR[id] = checkThis(errorText(res)); pollsRepaint(); // drawn with the card, so the reload below doesn't wipe it
  loadPolls().then(function () { pollFocus('[data-poll-card="' + id + '"] .poll-h'); }); // it may have closed or ended meanwhile
}
function pollSend(p, path, body, said, focusSel) {
  delete POLL_ERR[p.id];
  return api("/crews/" + encodeURIComponent(p.crew_id) + "/polls/" + p.id + "/" + path, { method: path === "answer" ? "PUT" : "POST", body: body })
    .then(readJSON).then(function (res) {
      if (!res.ok) { pollFail(p.id, res); return; }
      pollRedraw(res.body, focusSel); if (said) $("myplan-live").textContent = said;
    }, function () { pollFail(p.id, null); });
}
function pollAnswer(p, said) {
  var busy = POLL_BUSY[p.id];
  if (busy) { busy.again = said; return; } // a save is under way: send the latest ticks once it's done
  var st = POLL_BUSY[p.id] = { again: null };
  delete POLL_ERR[p.id];
  var ids = pollById(p.id).options.filter(function (o) { return o.yours; }).map(function (o) { return o.id; });
  api("/crews/" + encodeURIComponent(p.crew_id) + "/polls/" + p.id + "/answer", { method: "PUT", body: { option_ids: ids } }).then(readJSON).then(function (res) {
    delete POLL_BUSY[p.id];
    if (!res.ok) { pollFail(p.id, res); return; }
    if (st.again) { pollAnswer(pollById(p.id), st.again); return; } // keep what's on screen; the last save settles it
    pollPut(res.body); pollsRepaint(); $("myplan-live").textContent = said;
  }, function () { delete POLL_BUSY[p.id]; pollFail(p.id, null); });
}
function pollCommit(p, b) {
  var id = p.event_id, l = p.locked, prev = MYPLANS[id], crews = ((prev && prev.crews) || []).slice();
  if (crews.indexOf(p.crew_id) < 0) crews.push(p.crew_id);
  b.disabled = true;
  api("/me/plans/" + encodeURIComponent(id) + "?today=" + isoDate(T), { method: "PUT", body: { status: "going", date: l.date, time: l.time || null } }).then(readJSON).then(function (res) {
    if (!res.ok) throw res;
    return api("/me/plans/" + encodeURIComponent(id) + "/crews", { method: "PUT", body: { crews: crews } }).then(readJSON);
  }).then(function (res) {
    if (!res.ok) throw res;
    MYPLANS[id] = { status: "going", date: l.date, time: l.time || null, crews: crews };
    $("myplan-live").textContent = "Going: " + p.event_title + ", " + goWhen(l.date, l.time) + ". Shared with " + p.crew_name + ".";
    redrawCards(id).then(function () { pollsRepaint(); pollFocus('[data-poll-card="' + p.id + '"] .poll-h'); });
  }).catch(function (res) { b.disabled = false; pollFail(p.id, res && res.status ? res : null); });
}
document.addEventListener("click", function (ev) {
  var b = ev.target.closest("[data-poll-act]"); if (!b || !AUTH.user) return;
  var act = b.getAttribute("data-poll-act"), p = pollById(b.getAttribute("data-poll")), eid = b.getAttribute("data-event");
  if (act === "start-open" || act === "start-close") {
    if (act === "start-open") POLL_OPEN[eid] = !POLL_OPEN[eid]; else delete POLL_OPEN[eid];
    renderEventView();
    var fm = document.querySelector('[data-poll-form="' + eid + '"]'); if (fm) pollFormCount(fm); // say how many showtimes at once
    var f = act === "start-open" && POLL_OPEN[eid] ? $("poll-from-" + eid) : document.querySelector('[data-event="' + eid + '"][data-poll-act="start-open"]');
    if (f) f.focus();
    return;
  }
  if (!p) return;
  var cell = '[data-poll-act="tick"][data-option="' + b.getAttribute("data-option") + '"]';
  if (act === "tick") { // ticks show at once and are saved one request at a time, so quick taps all count
    var o = p.options.filter(function (x) { return String(x.id) === b.getAttribute("data-option"); })[0]; if (!o) return;
    o.yours = !o.yours; p.you_answered = true; pollsRepaint(); pollFocus(cell); pollAnswer(p, "Saved");
  } else if (act === "none") {
    p.options.forEach(function (x) { x.yours = false; }); p.you_answered = true; pollsRepaint(); pollFocus('[data-poll-act="none"][data-poll="' + p.id + '"]');
    pollAnswer(p, "Saved: none of these work for you");
  }
  else if (act === "lock") pollSend(p, "lock", { option_id: +b.getAttribute("data-option") }, "Locked in", '[data-poll-card="' + p.id + '"] .poll-h');
  else if (act === "lock-pick") pollSend(p, "lock", { option_id: +b.closest("[data-poll-card]").querySelector("select").value }, "Locked in", '[data-poll-card="' + p.id + '"] .poll-h');
  else if (act === "cancel") { POLL_ASK = p.id; pollsRepaint(); paintPending(); pollFocus('[data-poll-act="cancel-yes"][data-poll="' + p.id + '"]'); }
  else if (act === "cancel-no") { POLL_ASK = null; pollsRepaint(); pollFocus('[data-poll-act="cancel"][data-poll="' + p.id + '"]'); }
  else if (act === "cancel-yes") { POLL_ASK = null; pollSend(p, "cancel", undefined, "Poll cancelled", '[data-poll-card="' + p.id + '"] .poll-h'); }
  else if (act === "commit") pollCommit(p, b);
});
// ---------- on the crew's page, and under Waiting for you ----------
function pollsCrewHTML(c) {
  var mine = pollsOfCrew(c.id); if (!mine.length) return "";
  return '<section class="crew-col crew-polls" aria-labelledby="crew-dp-' + esc(c.id) + '">' + crewSubHTML("crew-dp-" + c.id, "Date polls", String(mine.length)) +
    mine.map(function (p) { return pollCardHTML(p, "crew"); }).join("") + "</section>";
}
function pollsWaitingHTML() {
  return pollsWaiting().map(function (p) {
    return '<div class="pending" data-poll-waiting="' + esc(p.id) + '"><p><span><strong>' + esc(p.started_by) + "</strong> is finding a date for <strong>" + esc(p.event_title) +
      "</strong> with " + esc(p.crew_name) + '.</span></p><div class="row"><a class="btn" href="#e/' + esc(p.event_id) + '" data-ev-open="' + esc(p.event_id) + '">Pick the times that work</a></div></div>';
  }).join("");
}
