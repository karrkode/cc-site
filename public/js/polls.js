// Chi Culture Crew site: crew date polls (CC-297). A member starts a poll for a performance from one of their crews;
// crew-mates tick the showtimes that work; the poll shows the best time with first names; the crew leader locks one in, and
// each member who said yes can Commit to it (Going, shared with the crew). Loaded after crews.js (index.html); they share
// one global scope. Data: GET /crews/polls (every poll of your crews, open or closed in the last two weeks).
"use strict";
var POLL_BUSY = {}, POLL_ERR = {}; // POLL_BUSY: a poll whose answer is being saved; POLL_ERR: the last error shown on a poll's card
var POLLS = [], POLL_ASK = null, POLL_AUTO = {}; // POLL_ASK: a poll being cancelled; POLL_AUTO: "crew-event" pairs the site has already tried to open a poll for this visit
var POLL_INT = {}; // by event id: {at, list}: per crew, how many members have shared interest in it (a poll can start once more than half have)
var POLL_READY_HOURS = [], POLL_DAYS = {}, POLL_DAY = {}; // CC-298: exhibitions a crew is ready to poll (no poll yet); the days being chosen ("crew-event" -> [iso]); the day shown on a phone (poll id -> index)
var POLL_SHOW = {}, POLL_EDIT = {}, POLL_DRAFT = {}; // by poll id: its card is expanded; you are (re)choosing times; the option ids ticked but not yet submitted
var POLL_WHO = "", POLL_EPOCH = 0; // CC-315: whose polls these are, and a count that goes up each time that changes, so an answer to an earlier member's request is ignored
function pollsSync() { // called from onAuthChange: a different member (or none) empties everything of the last member's
  var who = AUTH.user ? String(AUTH.user.id) : "";
  if (who === POLL_WHO) return;
  POLL_WHO = who; POLL_EPOCH++;
  POLLS = []; POLL_READY_HOURS = []; POLL_ASK = null; POLL_AUTO = {}; POLL_INT = {};
  POLL_BUSY = {}; POLL_ERR = {}; POLL_DAYS = {}; POLL_DAY = {}; POLL_SHOW = {}; POLL_EDIT = {}; POLL_DRAFT = {};
  if (typeof visible === "function" && visible("event") && EV.e) renderEventView(); // CC-315: an event page showing the last member's cards is drawn again now, not when its own request answers
}
function pollsFor(test) { return AUTH.user ? POLLS.filter(test) : []; }
function pollsOfEvent(id) { return pollsFor(function (p) { return String(p.event_id) === String(id); }); }
function pollsOfCrew(id) { return pollsFor(function (p) { return p.crew_id === id; }); }
function pollsWaiting() { return pollsFor(function (p) { return p.status === "open" && !p.you_answered; }).concat(pollsReadyHours()); }
function pollsReadyHours() { // CC-298: exhibitions a crew is ready to poll, where nobody has picked the days yet
  return AUTH.user ? POLL_READY_HOURS.filter(function (r) { return !POLLS.some(function (p) { return p.crew_id === r.crew_id && String(p.event_id) === String(r.event_id); }); }) : [];
}
function pollById(id) { return POLLS.filter(function (p) { return String(p.id) === String(id); })[0]; }

function loadPolls() {
  if (!AUTH.user) { POLLS = []; return Promise.resolve(); }
  var ep = POLL_EPOCH;
  return api("/crews/polls").then(readJSON).then(function (res) {
    if (ep !== POLL_EPOCH) return;
    if (res.ok) { POLLS = res.body; pollsRepaint(); }
    return pollAutoCheck();
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
function pollClock(t) { var h = +t.slice(0, 2); return (h % 12 || 12) + ":" + t.slice(3) + (h < 12 ? " AM" : " PM"); } // "13:00" -> "1:00 PM" (a range always shows its minutes)
function pollSpan(a, b) { var x = pollClock(a), y = pollClock(b); return x.slice(-2) === y.slice(-2) ? x.slice(0, -3) + "\u2013" + y : x + "\u2013" + y; } // "1:00\u20133:30 PM"
function pollWhen(o) { return o.end ? goingDay(o.date) + ", " + pollSpan(o.time, o.end) : goWhen(o.date, o.time); } // CC-298: an exhibition poll's answer is a range of a day
function pollNames(names) { return names.length ? names.join(", ") : "nobody yet"; }

// ---------- one poll ----------
function pollBestHTML(p) {
  if (!p.best.length) return '<p class="poll-none">Nobody has ticked a time yet.</p>';
  return '<ol class="poll-best">' + p.best.map(function (b, i) {
    var all = b.everyone ? "all " + b.count + " of you" : b.count + " of " + p.members_total;
    return '<li><span class="poll-best-t">' + (i === 0 ? '<span class="poll-tag">Best</span> ' : "") + esc(pollWhen(b)) + "</span> " +
      '<span class="poll-best-n">' + esc(all) + ": " + esc(pollNames(b.names)) + "</span>" +
      (p.can_manage && p.status === "open" ? ' <button class="btn ghost poll-lock" type="button" data-poll-act="lock" data-poll="' + p.id + '" data-option="' + b.option_id + (b.end ? '" data-start="' + esc(b.time) + '" data-end="' + esc(b.end) : "") +
        '" aria-label="Lock in ' + esc(pollWhen(b)) + '">Lock in</button>' : "") + "</li>";
  }).join("") + "</ol>";
}
function pollDraft(p) { // the ticks you haven't submitted yet (start from your saved answer)
  if (!POLL_DRAFT[p.id]) POLL_DRAFT[p.id] = p.options.filter(function (o) { return o.yours; }).map(function (o) { return o.id; });
  return POLL_DRAFT[p.id];
}
function pollEditing(p) { return !p.you_answered || !!POLL_EDIT[p.id]; }
// ---------- an exhibition poll (CC-298): half-hours of up to five days ----------
function pollBlockDraft(p) { // "optionId|13:30" for each half-hour ticked but not yet submitted (start from your saved answer)
  if (!POLL_DRAFT[p.id]) POLL_DRAFT[p.id] = [].concat.apply([], p.options.map(function (o) { return o.blocks.filter(function (b) { return b.yours; }).map(function (b) { return o.id + "|" + b.start; }); }));
  return POLL_DRAFT[p.id];
}
function pollDayIndex(p) { var i = POLL_DAY[p.id] || 0; return Math.max(0, Math.min(i, p.options.length - 1)); }
function pollMin(t) { return +t.slice(0, 2) * 60 + +t.slice(3); }
function pollHoursGridHTML(p, where) { // a timetable: a column of times, then a column of squares for each day, one square per half-hour (rows are the union of the days' hours, so the days line up). On a phone one day shows at a time, with Previous and Next.
  var draft = pollBlockDraft(p), cur = pollDayIndex(p), n = p.options.length, past = isoDate(T), h3 = where === "crew" ? "h6" : "h3";
  var first = 1440, last = 0;
  p.options.forEach(function (o) { var sl = pollSlots(o); if (sl.length) { first = Math.min(first, pollMin(sl[0])); last = Math.max(last, pollMin(sl[sl.length - 1]) + 30); } });
  var rows = []; for (var m = first; m < last; m += 30) rows.push(("0" + Math.floor(m / 60)).slice(-2) + ":" + ("0" + (m % 60)).slice(-2));
  var h = '<div class="poll-hours" role="group" aria-label="Half-hours that work for you">' +
    '<div class="poll-hnav row"><button class="btn ghost" type="button" data-poll-act="day-prev" data-poll="' + p.id + '"' + (cur === 0 ? " disabled" : "") + ">Previous day</button>" +
    '<span class="poll-hnav-n" aria-live="polite">Day ' + (cur + 1) + " of " + n + '</span><button class="btn ghost" type="button" data-poll-act="day-next" data-poll="' + p.id + '"' + (cur >= n - 1 ? " disabled" : "") + ">Next day</button></div>" +
    '<div class="poll-tt" style="--n:' + n + "; --rows:" + rows.length + '"><div class="poll-tt-c" aria-hidden="true"></div>' + rows.map(function (t) { return '<div class="poll-tt-t" aria-hidden="true">' + (t.slice(3) === "00" ? esc(clockText(t)) : "") + "</div>"; }).join("");
  p.options.forEach(function (o, i) {
    var label = "poll-hl-" + esc(where) + "-" + p.id + "-" + o.id, off = o.date < past, grid = {}, cls = "poll-tt-d" + (i === cur ? " is-cur" : "");
    pollSlots(o).forEach(function (t) { grid[t] = 1; });
    h += '<div class="poll-tt-h ' + cls + '"><' + h3 + ' class="poll-hday-l" id="' + label + '">' + esc(goingDay(o.date)) + '</' + h3 + '><span class="poll-hday-h">' + esc(clockText(o.opens)) + "\u2013" + esc(clockText(o.closes)) + '</span>' +
      '<span class="poll-hday-all"><button class="textbtn" type="button" data-poll-act="day-all" data-poll="' + p.id + '" data-option="' + o.id + '"' + (off ? " disabled" : "") + ">Free all day</button>" +
      '<button class="textbtn" type="button" data-poll-act="day-none" data-poll="' + p.id + '" data-option="' + o.id + '"' + (off ? " disabled" : "") + ">Clear day</button></span></div>";
    rows.forEach(function (t) {
      if (!grid[t]) { h += '<div class="poll-tt-x ' + cls + '" aria-hidden="true"></div>'; return; } // the venue is closed
      h += '<button class="poll-sq poll-block ' + cls + (t.slice(3) === "00" ? " poll-tt-hr" : "") + '" type="button" data-poll-act="btick" data-poll="' + p.id + '" data-option="' + o.id + '" data-start="' + esc(t) + '" aria-pressed="' + (draft.indexOf(o.id + "|" + t) >= 0) +
        '" aria-label="' + esc(goingDay(o.date) + ", " + clockText(t)) + '"' + (off ? " disabled" : "") + "></button>";
    });
  });
  return h + '</div><div class="row"><button class="btn" type="button" data-poll-act="submit" data-poll="' + p.id + '">Submit</button>' +
    '<button class="btn ghost" type="button" data-poll-act="none" data-poll="' + p.id + '">None work</button></div></div>';
}
function pollDayPickHTML(c, e, where) { // the crew is ready and there's no poll: any member picks up to five days; that starts the poll
  var key = c.id + "-" + e.id, mine = POLL_DAYS[key] || [], days = pollDayChoices(e), id = esc(key), h = '<div class="poll poll-start" data-poll-pick="' + id + '">' +
    '<h' + (where === "event" ? "2" : "3") + ' class="poll-h">Find a date with ' + esc(c.name) + '</h' + (where === "event" ? "2" : "3") + '><p>More than half of the crew has shared interest. Pick up to five days that could work; everyone then marks the half-hours they\u2019re free.</p>';
  if (!days.length) return h + '<p class="hint">No open days in the next 30 days.</p></div>';
  h += '<div class="poll-pickdays" role="group" aria-label="Days for the poll">' + days.map(function (iso) {
    var on = mine.indexOf(iso) >= 0;
    return '<button class="poll-sq poll-pickday" type="button" data-poll-act="pickday" data-key="' + id + '" data-day="' + iso + '" aria-pressed="' + on + '"' + (!on && mine.length >= POLL_DAYS_MAX ? " disabled" : "") + ">" + esc(goingDay(iso)) + "</button>";
  }).join("") + "</div>" +
    '<p class="poll-count" aria-live="polite">' + mine.length + " of " + POLL_DAYS_MAX + ' days chosen</p><p class="form-error" role="alert" data-poll-pick-err="' + id + '">' + esc(POLL_ERR["pick-" + key] || "") + "</p>" +
    '<div class="row"><button class="btn" type="button" data-poll-act="startdays" data-crew="' + esc(c.id) + '" data-event="' + esc(e.id) + '"' + (mine.length ? "" : " disabled") + ">Start the poll</button></div></div>";
  return h;
}
var POLL_DAYS_MAX = 5, POLL_AHEAD = 30;
function pollDayChoices(e) { // today and the 29 days after, while it runs and the venue is open (the server decides again)
  var out = [], range = goingRange(e); if (!range) return out;
  for (var i = 0; i < POLL_AHEAD; i++) { var d = add(T, i); if (d >= range[0] && d <= range[1] && canGoOn(e, d) && hoursOn(e, d)) out.push(isoDate(d)); }
  return out;
}
function pollSlots(o) { // the half-hour starts of a day option
  var out = [], a = o.opens.split(":"), z = o.closes.split(":"), m = Math.ceil((+a[0] * 60 + +a[1]) / 30) * 30, stop = +z[0] * 60 + +z[1];
  for (; m + 30 <= stop; m += 30) out.push(("0" + Math.floor(m / 60)).slice(-2) + ":" + ("0" + (m % 60)).slice(-2));
  return out;
}
function pollEndOf(start) { var m = +start.slice(0, 2) * 60 + +start.slice(3) + 30; return ("0" + Math.floor(m / 60)).slice(-2) + ":" + ("0" + (m % 60)).slice(-2); }
function pollEnds(o, start) { return pollSlots(o).map(pollEndOf).filter(function (t) { return (+t.slice(0, 2) * 60 + +t.slice(3)) - (+start.slice(0, 2) * 60 + +start.slice(3)) >= 60; }); }
function pollTimeOptions(list, chosen) { return list.map(function (t) { return '<option value="' + esc(t) + '"' + (t === chosen ? " selected" : "") + ">" + esc(clockText(t)) + "</option>"; }).join(""); }
function pollGridHTML(p, where) {
  if (p.kind === "hours") return pollHoursGridHTML(p, where); // dates as rows, times as buttons (on a phone the rows stack: a list of days with time chips). Ticks are kept until Submit.
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
  if (p.kind === "hours") {
    var upcoming = p.options.filter(function (o) { return o.date >= isoDate(T); }), o0 = upcoming[0] || p.options[0], st = pollSlots(o0), s0 = st[0] || "", ends = s0 ? pollEnds(o0, s0) : [], pre = "poll-pick-" + where + "-" + p.id;
    return '<div class="row poll-manage poll-manage-hours"><span class="poll-other" id="' + pre + '-l">Lock in another time</span><span role="group" aria-labelledby="' + pre + '-l" class="row">' +
      '<label class="sr-only" for="' + pre + '-d">Day</label><select id="' + pre + '-d" data-poll-lock-sel="day" data-poll="' + p.id + '">' + (upcoming.length ? upcoming : p.options).map(function (o) { return '<option value="' + o.id + '">' + esc(goingDay(o.date)) + "</option>"; }).join("") + "</select>" +
      '<label class="sr-only" for="' + pre + '-s">From</label><select id="' + pre + '-s" data-poll-lock-sel="start" data-poll="' + p.id + '">' + pollTimeOptions(st.slice(0, -1), s0) + "</select>" +
      '<label class="sr-only" for="' + pre + '-e">To</label><select id="' + pre + '-e" data-poll-lock-sel="end" data-poll="' + p.id + '">' + pollTimeOptions(ends, ends[0]) + "</select></span>" +
      '<button class="btn ghost" type="button" data-poll-act="lock-pick" data-poll="' + p.id + '">Lock in</button>' +
      '<button class="textbtn" type="button" data-poll-act="cancel" data-poll="' + p.id + '">Cancel poll</button></div>';
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
    h += '<button class="btn ghost poll-toggle' + (!shown && !p.you_answered ? " poll-new" : "") + '" type="button" data-poll-act="toggle" data-poll="' + id + '" aria-expanded="' + shown + '" aria-controls="' + body + '">' + (shown ? "Close poll for" : p.you_answered ? "Open poll for" : "New poll for") + what + "</button>";
    h += '<div class="poll-body" id="' + body + '"' + (shown ? "" : " hidden") + ">";
    if (shown) {
      h += "<" + lv + ' class="poll-h sr-only" id="poll-h-' + where + "-" + id + '">Date poll: ' + esc(head) + "</" + lv + ">" +
        '<p class="poll-count">' + p.answered_count + " of " + p.members_total + " have answered</p>";
      if (pollEditing(p)) h += '<p class="hint">' + (p.kind === "hours" ? "Tick the half-hours you\u2019re free, then Submit." : "Tick the times that work for you, then Submit.") + "</p>" + pollGridHTML(p, where);
      else h += '<div class="poll-result">' + pollBestHTML(p) + pollManageHTML(p, where) +
        '<div class="row"><button class="btn ghost" type="button" data-poll-act="modify" data-poll="' + id + '">Modify</button>' + (where === "crew" ? "" : '<a class="btn" href="#crews">Go to my crews</a>') + "</div></div>";
    }
    h += "</div>";
  } else {
    h += "<" + lv + ' class="poll-h" id="poll-h-' + where + "-" + id + '">' + esc(head) + "</" + lv + ">"; // locked, cancelled or ended: the name says which poll it was
    if (p.status === "locked" && p.locked) {
      h += '<p class="poll-lockedline"><strong>Locked in: ' + esc(pollWhen(p.locked)) + "</strong> \u00b7 " + (p.kind === "hours" && !p.locked.names.length ? "Nobody is free for all of it." : esc(pollNames(p.locked.names)) + " can make it.") + "</p>";
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
    var keep = c ? c.list : null, ep = POLL_EPOCH; POLL_INT[id] = { at: Date.now(), list: keep, busy: true };
    api("/crews/poll-interest?event_id=" + encodeURIComponent(id)).then(readJSON).then(function (res) {
      if (ep !== POLL_EPOCH) return;
      POLL_INT[id] = { at: Date.now(), list: res.ok ? res.body : keep };
      if (res.ok && JSON.stringify(res.body) !== JSON.stringify(keep)) pollsRepaint();
    }, function () { if (ep === POLL_EPOCH) POLL_INT[id] = { at: Date.now(), list: keep }; });
  }
  return POLL_INT[id].list;
}
function pollInterestStale() { Object.keys(POLL_INT).forEach(function (k) { POLL_INT[k].at = 0; }); pollAutoCheck(); } // someone shared or unshared: count again at the next draw
function pollsEventHTML(e) { // the crews' polls for this event; a poll opens by itself once a crew has a majority, so before that only where it stands
  if (!AUTH.user || !CREWS.length) return "";
  var mine = pollsOfEvent(e.id), h = mine.map(function (p) { return pollCardHTML(p, "event"); }).join("");
  var exhibit = isExhibit(e), canStart = !isPast(e) && (exhibit ? pollDayChoices(e).length : goDays(e, 1).length);
  var interest = canStart ? pollInterest(e.id) : null;
  if (interest) CREWS.filter(function (c) { return !mine.some(function (p) { return p.crew_id === c.id; }); }).forEach(function (c) {
    var inf = interest.filter(function (x) { return x.crew_id === c.id; })[0];
    if (inf && inf.ready && exhibit) h += pollsReadyHours().some(function (r) { return r.crew_id === c.id && String(r.event_id) === String(e.id); }) ? pollDayPickHTML(c, e, "event") : ""; // CC-298: someone has to choose the days; only while the server lists it (a locked or cancelled poll leaves the list, and the picker with it)
    else if (inf && !inf.ready) h += '<p class="hint poll-wait">' + esc(c.name) + ": " + inf.shared + " of " + inf.members_total + " have shared interest in this event. A poll opens " + (exhibit ? "once more than half have, and a member picks its days" : "by itself once more than half have") + ".</p>";
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
// A poll opens by itself: the API lists the events a crew has a majority for and no poll yet, and the first member's page that sees one
// starts it (the browser knows an event's showtimes). The server allows one poll for each crew and event, so a second page just gets a 409.
function pollAutoStart(r) {
  var key = r.crew_id + "-" + r.event_id, ep = POLL_EPOCH; POLL_AUTO[key] = true;
  return api("/events/" + encodeURIComponent(r.event_id)).then(readJSON).then(function (res) {
    if (!res.ok || ep !== POLL_EPOCH) return false;
    var e = toEvent(res.body), w = (!isPast(e) && !isExhibit(e)) ? pollWindow(e) : null; if (!w) return false;
    var opts = pollOptions(e, w[0], w[1]).slice(0, 40); if (!opts.length) return false;
    return api("/crews/" + encodeURIComponent(r.crew_id) + "/polls", { method: "POST", body: { event_id: r.event_id, window_from: w[0], window_to: opts[opts.length - 1].date, options: opts } })
      .then(readJSON).then(function (made) { if (ep !== POLL_EPOCH) return false; if (made.ok) pollPut(made.body); return made.ok; });
  }).catch(function () { return false; });
}
function pollAutoCheck() {
  if (!AUTH.user) return Promise.resolve();
  var ep = POLL_EPOCH;
  return api("/crews/poll-ready").then(readJSON).then(function (res) {
    if (!res.ok || ep !== POLL_EPOCH) return;
    var before = JSON.stringify(POLL_READY_HOURS);
    POLL_READY_HOURS = res.body.filter(function (r) { return r.kind === "hours"; }); // an exhibition needs its days picked by a person, so it isn't started here
    if (JSON.stringify(POLL_READY_HOURS) !== before) pollsRepaint();
    return Promise.all(res.body.filter(function (r) { return r.kind !== "hours" && !POLL_AUTO[r.crew_id + "-" + r.event_id]; }).slice(0, 5).map(pollAutoStart)).then(function (made) {
      if (ep === POLL_EPOCH && made.some(Boolean)) pollsRepaint();
    });
  }, function () {});
}
// ---------- actions ----------
function pollRedraw(p, focusSel) {
  pollPut(p); pollsRepaint(); paintPending();
  if (focusSel) pollFocus(focusSel);
}
function pollFocus(sel) { // the copy in the view that's showing (the same poll may also sit, hidden, in another view)
  var el = Array.prototype.filter.call(document.querySelectorAll(sel), function (x) { return x.offsetParent !== null; })[0] || document.querySelector(sel);
  if (el) { if (el.classList.contains("poll-h") || el.classList.contains("poll-hday-l")) el.setAttribute("tabindex", "-1"); el.focus(); }
  return el;
}
function pollFail(id, res) {
  POLL_ERR[id] = checkThis(errorText(res)); pollsRepaint(); // drawn with the card, so the reload below doesn't wipe it
  loadPolls().then(function () { pollFocus('[data-poll-card="' + id + '"] .poll-h'); }); // it may have closed or ended meanwhile
}
function pollSend(p, path, body, said, focusSel) {
  var ep = POLL_EPOCH; delete POLL_ERR[p.id];
  return api("/crews/" + encodeURIComponent(p.crew_id) + "/polls/" + p.id + "/" + path, { method: path === "answer" ? "PUT" : "POST", body: body })
    .then(readJSON).then(function (res) {
      if (ep !== POLL_EPOCH) return;
      if (!res.ok) { pollFail(p.id, res); return; }
      pollRedraw(res.body, focusSel); if (said) $("myplan-live").textContent = said;
    }, function () { if (ep === POLL_EPOCH) pollFail(p.id, null); });
}
function pollSubmit(p, ids, said) { // save the times you ticked (none: an empty list), then the card turns into the results
  if (POLL_BUSY[p.id]) return;
  var ep = POLL_EPOCH; POLL_BUSY[p.id] = true; delete POLL_ERR[p.id];
  api("/crews/" + encodeURIComponent(p.crew_id) + "/polls/" + p.id + "/answer", { method: "PUT", body: p.kind === "hours" ? { blocks: ids } : { option_ids: ids } }).then(readJSON).then(function (res) {
    if (ep !== POLL_EPOCH) return;
    delete POLL_BUSY[p.id];
    if (!res.ok) { pollFail(p.id, res); return; }
    delete POLL_EDIT[p.id]; delete POLL_DRAFT[p.id];
    pollPut(res.body); pollsRepaint(); $("myplan-live").textContent = said;
    pollFocus('[data-poll-card="' + p.id + '"] .poll-h');
  }, function () { if (ep !== POLL_EPOCH) return; delete POLL_BUSY[p.id]; pollFail(p.id, null); });
}
function pollLockBody(p, option, start, end) { return p.kind === "hours" ? { option_id: +option, start: start, end: end } : { option_id: +option }; }
function pollPickedLock(p, card) { // "Lock in another time": the selects in the card
  var sel = function (k) { var el = card.querySelector('[data-poll-lock-sel="' + k + '"]'); return el ? el.value : card.querySelector("select").value; };
  return p.kind === "hours" ? pollLockBody(p, sel("day"), sel("start"), sel("end")) : { option_id: +card.querySelector("select").value };
}
document.addEventListener("change", function (ev) { // the day or start of "Lock in another time" changes what the other selects offer
  var el = ev.target.closest && ev.target.closest("[data-poll-lock-sel]"); if (!el || el.getAttribute("data-poll-lock-sel") === "end") return;
  var p = pollById(el.getAttribute("data-poll")), card = el.closest("[data-poll-card]"); if (!p || !card) return;
  var day = card.querySelector('[data-poll-lock-sel="day"]'), st = card.querySelector('[data-poll-lock-sel="start"]'), en = card.querySelector('[data-poll-lock-sel="end"]');
  var o = p.options.filter(function (x) { return String(x.id) === day.value; })[0]; if (!o) return;
  var starts = pollSlots(o).slice(0, -1), keep = starts.indexOf(st.value) >= 0 ? st.value : starts[0];
  if (el === day) st.innerHTML = pollTimeOptions(starts, keep);
  var ends = pollEnds(o, el === day ? keep : st.value), was = en.value;
  en.innerHTML = pollTimeOptions(ends, ends.indexOf(was) >= 0 ? was : ends[0]);
});
function pollPickAct(act, b) { // CC-298: choosing the days of an exhibition poll, then starting it
  if (act === "pickday") {
    var key = b.getAttribute("data-key"), day = b.getAttribute("data-day"), mine = POLL_DAYS[key] || (POLL_DAYS[key] = []), at = mine.indexOf(day);
    if (at >= 0) mine.splice(at, 1); else if (mine.length < POLL_DAYS_MAX) mine.push(day);
    delete POLL_ERR["pick-" + key]; pollsRepaint();
    pollFocus('[data-poll-act="pickday"][data-key="' + key + '"][data-day="' + day + '"]');
    return;
  }
  var crew = b.getAttribute("data-crew"), event = b.getAttribute("data-event"), k = crew + "-" + event, days = (POLL_DAYS[k] || []).slice().sort();
  if (!days.length || POLL_BUSY["pick-" + k]) return;
  var ep = POLL_EPOCH; POLL_BUSY["pick-" + k] = true; b.disabled = true;
  api("/crews/" + encodeURIComponent(crew) + "/polls", { method: "POST", body: { event_id: +event, kind: "hours", days: days } }).then(readJSON).then(function (res) {
    if (ep !== POLL_EPOCH) return;
    delete POLL_BUSY["pick-" + k];
    if (res.ok) { delete POLL_DAYS[k]; POLL_SHOW[res.body.id] = true; pollPut(res.body); pollsRepaint(); pollFocus('[data-poll-card="' + res.body.id + '"] .poll-cell'); $("myplan-live").textContent = "Poll started"; return; }
    POLL_ERR["pick-" + k] = checkThis(errorText(res)); // a 409 means someone started it a moment ago: it shows up on the reload
    loadPolls().then(function () { pollsRepaint(); });
  }, function () { if (ep !== POLL_EPOCH) return; delete POLL_BUSY["pick-" + k]; POLL_ERR["pick-" + k] = "Check this: couldn\u2019t reach the server. Try again."; pollsRepaint(); });
}
function pollCommit(p, b) {
  var id = p.event_id, l = p.locked, prev = MYPLANS[id], crews = ((prev && prev.crews) || []).slice();
  if (crews.indexOf(p.crew_id) < 0) crews.push(p.crew_id);
  var ep = POLL_EPOCH; b.disabled = true;
  api("/me/plans/" + encodeURIComponent(id) + "?today=" + isoDate(T), { method: "PUT", body: { status: "going", date: l.date, time: l.time || null } }).then(readJSON).then(function (res) {
    if (!res.ok) throw res;
    if (ep !== POLL_EPOCH) return null; // CC-315: a different member now: the second request would go out with their token
    return api("/me/plans/" + encodeURIComponent(id) + "/crews", { method: "PUT", body: { crews: crews } }).then(readJSON);
  }).then(function (res) {
    if (ep !== POLL_EPOCH) return;
    if (!res.ok) throw res;
    MYPLANS[id] = { status: "going", date: l.date, time: l.time || null, crews: crews };
    $("myplan-live").textContent = "Going: " + p.event_title + ", " + goWhen(l.date, l.time) + ". Shared with " + p.crew_name + ".";
    redrawCards(id).then(function () { pollsRepaint(); pollFocus('[data-poll-card="' + p.id + '"] .poll-h'); });
  }).catch(function (res) { if (ep !== POLL_EPOCH) return; b.disabled = false; pollFail(p.id, res && res.status ? res : null); });
}
document.addEventListener("click", function (ev) {
  var b = ev.target.closest("[data-poll-act]"); if (!b || !AUTH.user) return;
  var act = b.getAttribute("data-poll-act"), p = pollById(b.getAttribute("data-poll"));
  if (act === "pickday" || act === "startdays") return pollPickAct(act, b);
  if (!p) return;
  if (act === "toggle") {
    POLL_SHOW[p.id] = !POLL_SHOW[p.id]; pollsRepaint();
    pollFocus(POLL_SHOW[p.id] ? '[data-poll-card="' + p.id + '"] .poll-cell, [data-poll-card="' + p.id + '"] [data-poll-act="modify"]' : '[data-poll-card="' + p.id + '"] .poll-toggle');
  } else if (act === "tick") { // ticks are kept on the page; nothing is sent until Submit
    var oid = +b.getAttribute("data-option"), d = pollDraft(p), at = d.indexOf(oid);
    if (at < 0) d.push(oid); else d.splice(at, 1);
    b.setAttribute("aria-pressed", String(at < 0)); delete POLL_ERR[p.id];
    var er = document.querySelector('[data-poll-err="' + p.id + '"]'); if (er) er.textContent = "";
  } else if (act === "btick") { // CC-298: a half-hour; kept on the page until Submit
    var bk = b.getAttribute("data-option") + "|" + b.getAttribute("data-start"), bd = pollBlockDraft(p), bat = bd.indexOf(bk);
    if (bat < 0) bd.push(bk); else bd.splice(bat, 1);
    b.setAttribute("aria-pressed", String(bat < 0)); delete POLL_ERR[p.id];
    var be = document.querySelector('[data-poll-err="' + p.id + '"]'); if (be) be.textContent = "";
  } else if (act === "day-all" || act === "day-none") {
    var dopt = p.options.filter(function (o) { return String(o.id) === b.getAttribute("data-option"); })[0], dd = pollBlockDraft(p);
    dopt.blocks.forEach(function (blk) { var k = dopt.id + "|" + blk.start, at = dd.indexOf(k); if (act === "day-all" && at < 0) dd.push(k); if (act === "day-none" && at >= 0) dd.splice(at, 1); });
    pollsRepaint(); pollFocus('[data-poll-act="' + act + '"][data-poll="' + p.id + '"][data-option="' + dopt.id + '"]');
    $("myplan-live").textContent = (act === "day-all" ? "Marked free all day: " : "Cleared: ") + goingDay(dopt.date);
  } else if (act === "day-prev" || act === "day-next") {
    POLL_DAY[p.id] = pollDayIndex(p) + (act === "day-next" ? 1 : -1); pollsRepaint();
    pollFocus('[data-poll-card="' + p.id + '"] .poll-tt-h.is-cur .poll-hday-l');
  } else if (act === "submit" && p.kind === "hours") {
    var bl = pollBlockDraft(p).map(function (k) { return { option_id: +k.split("|")[0], start: k.split("|")[1] }; });
    if (!bl.length) { POLL_ERR[p.id] = "Check this: tick at least one half-hour, or choose None work."; pollsRepaint(); pollFocus('[data-poll-card="' + p.id + '"] [data-poll-act="submit"]'); return; }
    pollSubmit(p, bl, "Saved your times");
  } else if (act === "submit") {
    var ids = pollDraft(p).slice();
    if (!ids.length) { POLL_ERR[p.id] = "Check this: tick at least one time, or choose None work."; pollsRepaint(); pollFocus('[data-poll-card="' + p.id + '"] [data-poll-act="submit"]'); return; }
    pollSubmit(p, ids, "Saved your times");
  } else if (act === "none") pollSubmit(p, [], "Saved: none of these work for you");
  else if (act === "modify") { POLL_EDIT[p.id] = true; delete POLL_DRAFT[p.id]; pollsRepaint(); pollFocus('[data-poll-card="' + p.id + '"] .poll-cell'); }
  else if (act === "lock") pollSend(p, "lock", pollLockBody(p, b.getAttribute("data-option"), b.getAttribute("data-start"), b.getAttribute("data-end")), "Locked in", '[data-poll-card="' + p.id + '"] .poll-h');
  else if (act === "lock-pick") pollSend(p, "lock", pollPickedLock(p, b.closest("[data-poll-card]")), "Locked in", '[data-poll-card="' + p.id + '"] .poll-h');
  else if (act === "cancel") { POLL_ASK = p.id; pollsRepaint(); paintPending(); pollFocus('[data-poll-act="cancel-yes"][data-poll="' + p.id + '"]'); }
  else if (act === "cancel-no") { POLL_ASK = null; pollsRepaint(); pollFocus('[data-poll-act="cancel"][data-poll="' + p.id + '"]'); }
  else if (act === "cancel-yes") { POLL_ASK = null; pollSend(p, "cancel", undefined, "Poll cancelled", '[data-poll-card="' + p.id + '"] .poll-h'); }
  else if (act === "commit") pollCommit(p, b);
});
// ---------- on the crew's page, and under Waiting for you ----------
function pollsCrewHTML(c) { // the crew page's dropdown for its polls that are still open
  var mine = pollsOfCrew(c.id).filter(function (p) { return p.status === "open"; });
  return crewDD(c, "poll", "The Crew Commits!", mine.length ? String(mine.length) : "", "Polls only appear once a majority of the crew has shown interest.",
    mine.length ? mine.map(function (p) { return pollCardHTML(p, "crew"); }).join("") : '<p class="crew-none">No open polls.</p>');
}
function pollsLockedHTML(c) { return pollsOfCrew(c.id).filter(function (p) { return p.status === "locked"; }); } // locked in: they sit on the Shared Calendar
function pollsWaitingHTML() {
  return pollsWaiting().map(function (p) {
    if (p.kind === "hours" && !p.options) { // CC-298: ready, with no days picked yet
      return '<div class="pending" data-poll-ready="' + esc(p.crew_id + "-" + p.event_id) + '"><p><span><strong>' + esc(p.crew_name) + "</strong> is ready to find a date for <strong>" + esc(p.event_title) +
        '</strong>. Pick the days to start the poll.</span></p><div class="row"><a class="btn" href="#e/' + esc(p.event_id) + '" data-ev-open="' + esc(p.event_id) + '">Pick the days</a></div></div>';
    }
    return '<div class="pending" data-poll-waiting="' + esc(p.id) + '"><p><span><strong>' + esc(p.started_by) + "</strong> is finding a date for <strong>" + esc(p.event_title) +
      "</strong> with " + esc(p.crew_name) + '.</span></p><div class="row"><a class="btn" href="#e/' + esc(p.event_id) + '" data-ev-open="' + esc(p.event_id) + '">Pick the times that work</a></div></div>';
  }).join("");
}
