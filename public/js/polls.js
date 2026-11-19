// Chi Culture Crew site: crew date polls (CC-297). A member starts a poll for a performance from one of their crews;
// crew-mates tick the showtimes that work; the poll shows the best time with first names; the crew leader locks one in, and
// each member who said yes can Commit to it (Going, shared with the crew). Loaded after crews.js (index.html); they share
// one global scope. Data: GET /crews/polls (every poll of your crews, open or closed in the last two weeks).
"use strict";
var POLL_BUSY = {}, POLL_ERR = {}; // POLL_BUSY: a poll whose answer is being saved; POLL_ERR: the last error shown on a poll's card
var POLLS = [], POLL_OPEN = {}, POLL_ASK = null; // POLL_OPEN: "event-crew" keys whose start panel is open; POLL_ASK: a poll being cancelled
var POLL_INT = {}; // by event id: {at, list}: per crew, how many members have shared interest in it (a poll can start once more than half have)
var POLL_SHOW = {}, POLL_EDIT = {}, POLL_DRAFT = {}; // by poll id: its card is expanded; you are (re)choosing times; the option ids ticked but not yet submitted
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
function pollDraft(p) { // the ticks you haven't submitted yet (start from your saved answer)
  if (!POLL_DRAFT[p.id]) POLL_DRAFT[p.id] = p.options.filter(function (o) { return o.yours; }).map(function (o) { return o.id; });
  return POLL_DRAFT[p.id];
}
function pollEditing(p) { return !p.you_answered || !!POLL_EDIT[p.id]; }
function pollGridHTML(p, where) { // dates as rows, times as buttons (on a phone the rows stack: a list of days with time chips). Ticks are kept until Submit.
  var days = [], by = {}, draft = pollDraft(p);
  p.options.forEach(function (o) { if (!by[o.date]) { by[o.date] = []; days.push(o.date); } by[o.date].push(o); });
  return '<ul class="poll-days" aria-label="Showtimes that work for you">' + days.map(function (d) {
    var dl = "poll-dl-" + esc(where) + "-" + p.id + "-" + d;
    return '<li class="poll-day"><span class="poll-day-l" id="' + dl + '">' + esc(goingDay(d)) + '</span><span class="poll-times" role="group" aria-labelledby="' + dl + '">' + by[d].map(function (o) {
      return '<button class="poll-cell" type="button" data-poll-act="tick" data-poll="' + p.id + '" data-option="' + o.id + '" aria-pressed="' + (draft.indexOf(o.id) >= 0) + '"' + (o.date < isoDate(T) ? " disabled" : "") + ">" +
        esc(o.time ? clockText(o.time) : "Any time") + "</button>";
    }).join("") + "</span></li>";
  }).join("") + "</ul>" +
    '<div class="row"><button class="btn" type="button" data-poll-act="submit" data-poll="' + p.id + '">Submit</button>' +
    '<button class="btn ghost" type="button" data-poll-act="none" data-poll="' + p.id + '">None work</button></div>';
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
  var lv = where === "crew" ? "h5" : "h2"; // under the crew's "Let's lock in" h4, or the event page's h1
  var id = esc(p.id), head = where === "crew" ? p.event_title : where === "event" ? p.crew_name : p.event_title + " · " + p.crew_name;
  var err = '<p class="form-error" role="alert" data-poll-err="' + id + '">' + esc(POLL_ERR[p.id] || "") + "</p>";
  var h = '<div class="poll poll-' + esc(p.status) + '" data-poll-card="' + id + '">';
  if (p.status === "open") {
    var shown = !!POLL_SHOW[p.id], body = "poll-body-" + esc(where) + "-" + id;
    var what = where === "event" ? " this event with “" + esc(p.crew_name) + "”" : where === "crew" ? " “" + esc(p.event_title) + "”" : " “" + esc(p.event_title) + "” with “" + esc(p.crew_name) + "”";
    h += '<button class="btn ghost poll-toggle" type="button" data-poll-act="toggle" data-poll="' + id + '" aria-expanded="' + shown + '" aria-controls="' + body + '">' + (shown ? "Close poll for" : "Open poll for") + what + "</button>";
    h += '<div class="poll-body" id="' + body + '"' + (shown ? "" : " hidden") + ">";
    if (shown) {
      h += "<" + lv + ' class="poll-h sr-only" id="poll-h-' + where + "-" + id + '">Date poll: ' + esc(head) + "</" + lv + ">" +
        '<p class="poll-count">' + p.answered_count + " of " + p.members_total + " have answered · started by " + esc(p.started_by) + "</p>";
      if (pollEditing(p)) h += '<p class="hint">Tick the times that work for you, then Submit.</p>' + pollGridHTML(p, where);
      else h += '<div class="poll-result">' + pollBestHTML(p) + pollManageHTML(p, where) +
        '<div class="row"><button class="btn ghost" type="button" data-poll-act="modify" data-poll="' + id + '">Modify</button>' + (where === "crew" ? "" : '<a class="btn" href="#crews">Go to my crews</a>') + "</div></div>";
    }
    h += "</div>";
  } else {
    h += "<" + lv + ' class="poll-h" id="poll-h-' + where + "-" + id + '">' + esc(head) + "</" + lv + ">"; // locked, cancelled or ended: the name says which poll it was
    if (p.status === "locked" && p.locked) {
      h += '<p class="poll-lockedline"><strong>Locked in: ' + esc(pollWhen(p.locked)) + "</strong> · " + esc(pollNames(p.locked.names)) + " can make it.</p>";
      if (p.locked.yours) {
        h += pollCommitted(p) ? '<p class="hint">You’re going on this date.</p>' :
          '<div class="row"><button class="btn" type="button" data-poll-act="commit" data-poll="' + id + '">Commit to ' + esc(pollWhen(p.locked)) + "</button></div>";
      }
    } else {
      h += '<p class="hint">' + (p.status === "cancelled" ? "Cancelled." : "Every date in this poll has passed.") + "</p>";
    }
  }
  return h + err + "</div>";
}

// ---------- on the event's page ----------
function pollInterest(id) { // the cached count for an event, fetched again in the background when it is more than a few seconds old
  var c = POLL_INT[id];
  if (!c || (!c.busy && Date.now() - c.at > 5000)) {
    var keep = c ? c.list : null; POLL_INT[id] = { at: Date.now(), list: keep, busy: true };
    api("/crews/poll-interest?event_id=" + encodeURIComponent(id)).then(readJSON).then(function (res) {
      POLL_INT[id] = { at: Date.now(), list: res.ok ? res.body : keep };
      if (res.ok && JSON.stringify(res.body) !== JSON.stringify(keep)) pollsRepaint();
    }, function () { POLL_INT[id] = { at: Date.now(), list: keep }; });
  }
  return POLL_INT[id].list;
}
function pollInterestStale() { Object.keys(POLL_INT).forEach(function (k) { POLL_INT[k].at = 0; }); } // someone shared or unshared: count again at the next draw
function pollsEventHTML(e) { // the crews' polls for this event, and a button for each crew that has none open yet
  if (!AUTH.user || !CREWS.length) return "";
  var mine = pollsOfEvent(e.id), open = mine.filter(function (p) { return p.status === "open"; });
  var h = mine.map(function (p) { return pollCardHTML(p, "event"); }).join("");
  var canStart = !isPast(e) && !isExhibit(e) && goDays(e, 1).length;
  var interest = canStart ? pollInterest(e.id) : null;
  if (canStart && interest) CREWS.filter(function (c) { return !open.some(function (p) { return p.crew_id === c.id; }); }).forEach(function (c) {
    var inf = interest.filter(function (x) { return x.crew_id === c.id; })[0]; if (!inf) return;
    if (!inf.ready) { // not enough interest yet: say where it stands, and no button
      h += '<p class="hint poll-wait">' + esc(c.name) + ": " + inf.shared + " of " + inf.members_total + " have shared interest in this event. A poll opens once more than half have.</p>";
      return;
    }
    var key = esc(e.id + "-" + c.id), on = !!POLL_OPEN[e.id + "-" + c.id];
    h += '<div class="poll-start"><button class="btn ghost poll-toggle" type="button" data-poll-act="start-open" data-key="' + key + '" aria-expanded="' + on + '" aria-controls="poll-form-' + key + '">Open poll for this event with “' + esc(c.name) + "”</button>" +
      (on ? pollFormHTML(e, c) : "") + "</div>";
  });
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
function pollFormHTML(e, c) {
  var w = pollWindow(e), id = esc(e.id + "-" + c.id); if (!w) return "";
  return '<form class="poll-form panel" id="poll-form-' + id + '" data-poll-form="' + id + '" data-event="' + esc(e.id) + '" novalidate>' +
    '<p>Crew: <strong>' + esc(c.name) + '</strong><input type="hidden" id="poll-crew-' + id + '" value="' + esc(c.id) + '"></p>' +
    '<div class="row"><label>From<input type="date" id="poll-from-' + id + '" value="' + w[0] + '" min="' + isoDate(T) + '"></label>' +
    '<label>To<input type="date" id="poll-to-' + id + '" value="' + w[1] + '"></label></div>' +
    '<p class="hint" id="poll-n-' + id + '" role="status"></p><ul class="poll-preview" id="poll-list-' + id + '" aria-label="The showtimes in this poll"></ul>' +
    '<div class="row"><button class="btn" type="submit">Start the poll</button><button class="btn ghost" type="button" data-poll-act="start-close" data-key="' + id + '">Cancel</button></div>' +
    '<p class="form-error" role="alert" id="poll-ferr-' + id + '"></p></form>';
}
function pollFormCount(form) {
  var id = form.getAttribute("data-poll-form"), eid = form.getAttribute("data-event"), e = KNOWN[eid] || EV.e; if (!e) return [];
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
  var id = f.getAttribute("data-poll-form"), eid = f.getAttribute("data-event"), opts = pollFormCount(f), err = $("poll-ferr-" + id), btn = f.querySelector('[type="submit"]');
  err.textContent = "";
  if (!opts.length || opts.length > 40) { err.textContent = checkThis($("poll-n-" + id).textContent); return; }
  var crewId = $("poll-crew-" + id).value; btn.disabled = true;
  api("/crews/" + encodeURIComponent(crewId) + "/polls", { method: "POST", body: { event_id: +eid, window_from: $("poll-from-" + id).value, window_to: $("poll-to-" + id).value, options: opts } })
    .then(readJSON).then(function (res) {
      if (!res.ok) { btn.disabled = false; err.textContent = checkThis(errorText(res)); return; }
      pollPut(res.body); POLL_SHOW[res.body.id] = true; delete POLL_OPEN[id]; renderEventView();
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
function pollSubmit(p, ids, said) { // save the times you ticked (none: an empty list), then the card turns into the results
  if (POLL_BUSY[p.id]) return;
  POLL_BUSY[p.id] = true; delete POLL_ERR[p.id];
  api("/crews/" + encodeURIComponent(p.crew_id) + "/polls/" + p.id + "/answer", { method: "PUT", body: { option_ids: ids } }).then(readJSON).then(function (res) {
    delete POLL_BUSY[p.id];
    if (!res.ok) { pollFail(p.id, res); return; }
    delete POLL_EDIT[p.id]; delete POLL_DRAFT[p.id];
    pollPut(res.body); pollsRepaint(); $("myplan-live").textContent = said;
    pollFocus('[data-poll-card="' + p.id + '"] .poll-h');
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
  var act = b.getAttribute("data-poll-act"), p = pollById(b.getAttribute("data-poll")), eid = b.getAttribute("data-key");
  if (act === "start-open" || act === "start-close") {
    if (act === "start-open") POLL_OPEN[eid] = !POLL_OPEN[eid]; else delete POLL_OPEN[eid];
    renderEventView();
    var fm = document.querySelector('[data-poll-form="' + eid + '"]'); if (fm) pollFormCount(fm); // say how many showtimes at once
    var f = act === "start-open" && POLL_OPEN[eid] ? $("poll-from-" + eid) : document.querySelector('[data-key="' + eid + '"][data-poll-act="start-open"]');
    if (f) f.focus();
    return;
  }
  if (!p) return;
  if (act === "toggle") {
    POLL_SHOW[p.id] = !POLL_SHOW[p.id]; pollsRepaint();
    pollFocus(POLL_SHOW[p.id] ? '[data-poll-card="' + p.id + '"] .poll-cell, [data-poll-card="' + p.id + '"] [data-poll-act="modify"]' : '[data-poll-card="' + p.id + '"] .poll-toggle');
  } else if (act === "tick") { // ticks are kept on the page; nothing is sent until Submit
    var oid = +b.getAttribute("data-option"), d = pollDraft(p), at = d.indexOf(oid);
    if (at < 0) d.push(oid); else d.splice(at, 1);
    b.setAttribute("aria-pressed", String(at < 0)); delete POLL_ERR[p.id];
    var er = document.querySelector('[data-poll-err="' + p.id + '"]'); if (er) er.textContent = "";
  } else if (act === "submit") {
    var ids = pollDraft(p).slice();
    if (!ids.length) { POLL_ERR[p.id] = "Check this: tick at least one time, or choose None work."; pollsRepaint(); pollFocus('[data-poll-card="' + p.id + '"] [data-poll-act="submit"]'); return; }
    pollSubmit(p, ids, "Saved your times");
  } else if (act === "none") pollSubmit(p, [], "Saved: none of these work for you");
  else if (act === "modify") { POLL_EDIT[p.id] = true; delete POLL_DRAFT[p.id]; pollsRepaint(); pollFocus('[data-poll-card="' + p.id + '"] .poll-cell'); }
  else if (act === "lock") pollSend(p, "lock", { option_id: +b.getAttribute("data-option") }, "Locked in", '[data-poll-card="' + p.id + '"] .poll-h');
  else if (act === "lock-pick") pollSend(p, "lock", { option_id: +b.closest("[data-poll-card]").querySelector("select").value }, "Locked in", '[data-poll-card="' + p.id + '"] .poll-h');
  else if (act === "cancel") { POLL_ASK = p.id; pollsRepaint(); paintPending(); pollFocus('[data-poll-act="cancel-yes"][data-poll="' + p.id + '"]'); }
  else if (act === "cancel-no") { POLL_ASK = null; pollsRepaint(); pollFocus('[data-poll-act="cancel"][data-poll="' + p.id + '"]'); }
  else if (act === "cancel-yes") { POLL_ASK = null; pollSend(p, "cancel", undefined, "Poll cancelled", '[data-poll-card="' + p.id + '"] .poll-h'); }
  else if (act === "commit") pollCommit(p, b);
});
// ---------- on the crew's page, and under Waiting for you ----------
function pollsCrewHTML(c) { // the crew page's dropdown for its polls
  var mine = pollsOfCrew(c.id);
  return crewDD(c, "poll", "The Crew Commits!", mine.length ? String(mine.length) : "", "Polls only appear once a majority of the crew has shown interest.",
    mine.length ? mine.map(function (p) { return pollCardHTML(p, "crew"); }).join("") : '<p class="crew-none">No polls yet.</p>');
}
function pollsWaitingHTML() {
  return pollsWaiting().map(function (p) {
    return '<div class="pending" data-poll-waiting="' + esc(p.id) + '"><p><span><strong>' + esc(p.started_by) + "</strong> is finding a date for <strong>" + esc(p.event_title) +
      "</strong> with " + esc(p.crew_name) + '.</span></p><div class="row"><a class="btn" href="#e/' + esc(p.event_id) + '" data-ev-open="' + esc(p.event_id) + '">Pick the times that work</a></div></div>';
  }).join("");
}
