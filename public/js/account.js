// Culture Crew site: Signing in, your plans, "I've been", the account page, profile, email links and passwords.
// Loaded by index.html in order (core, util, catalog, planner, account, crews, submit, admin, hours, found, issues, photos, approvals, start); they share one
// global scope, so anything declared here is visible to the files after it.
"use strict";
// ---------- signed-in state ----------
function isAdmin() { return !!AUTH.user && AUTH.user.role === "admin"; }
function visible(name) { return !$("view-" + name).hidden; }
function rerenderLists() {
  renderHome();
  if (visible("catalog")) paintCatalog();
  if (visible("account")) renderAccount();
  if (visible("planner")) renderPlannerPage(); // CC-105
  if (visible("journal")) renderJournalPage(); // CC-159
  if (visible("event")) loadEventView(); // CC-117: signed in or out, the crews' plans change
}
function onAuthChange() {
  showReportLink(); // "Report an issue or request a feature" in the footer, signed in only (CC-84; issues.js)
  paintApproverRow(); // Photo approvals, for approvers and admins (CC-91; approvals.js)
  paintMeMenu(); // your name and its menu, or Sign in (CC-105)
  $("rv-wrap").hidden = !isAdmin();
  WENT = {}; WENT_LIST = []; WENT_PHOTO = {}; WENT_JOURNAL = {}; JOURNAL_DRAFT = {}; WENT_SHARE = {}; WENT_AT = {}; MYPLANS = {}; MYPLAN_LIST = [];
  OWN_LIST = []; OWN_CATS = []; OWN_STATE = "loading"; OWN_OPEN = null; OWN_DRAFT = {}; OWN_SAID = {}; OWN_CATS_OPEN = false; OWN_NEW_PHOTO = null; // CC-248
  PLANS_STATE = "loading"; WENT_STATE = "loading"; JOURNAL_OPEN = null; // CC-146: My week waits for them
  if (!AUTH.user) {
    NOTICE_SET = false; $("account-notice").textContent = "";
    if (visible("review") || visible("sourcing") || visible("engagement") || visible("people") || visible("venues") || visible("stats") || visible("sources") || visible("found") || visible("issues")) show("home");
    if (visible("submit")) renderSubmit();
    CREWS = []; buildCrewFilter(); PENDING = []; paintPending(); $("my-issues-section").hidden = true;
    if ($("issue-dialog").open) closeDialog($("issue-dialog"));
    rerenderLists();
    if (visible("crews")) renderCrewsPage();
    if (visible("planner")) renderPlannerPage();
    if (visible("journal")) renderJournalPage();
    if (visible("join")) paintJoinPage(); // CC-121
    return;
  }
  if (isAdmin()) { updateReviewCount(); updateFoundCount(); } // CC-206: the Review menu shows them from the start
  returnAfterSignIn();
  if (visible("join") && $("jp-in").hidden) paintJoinPage(); // CC-121 (just joined: the welcome stays)
  if (visible("crews")) renderCrewsPage();
  if (visible("planner")) renderPlannerPage();
  if (visible("journal")) renderJournalPage();
  if (visible("submit")) renderSubmit();
  if (visible("review")) renderReview();
  rerenderLists();
  loadHome(); // CC-143: the lead pick's deck and the rows' crew lines need your crews' plans
  loadWent(); loadOwn(); loadMyPlans().then(rerenderLists);
  loadCrews().then(function () { buildCrewFilter(); rerenderLists(); }); // crews to share plans with (CC-75)
  loadPending(true); // crew invites waiting for you (CC-59): the notice on sign-in
  if (isAdmin()) updateIssuesCount();
}
// Where signing in leads (AFTER_SIGN_IN): back to the page that asked (CC-104, CC-105, CC-117, CC-159, CC-237), or Home
function returnAfterSignIn() {
  var back = AFTER_SIGN_IN; AFTER_SIGN_IN = null;
  if (back === "home") { ROUTE = location.hash; show("home"); return; } // CC-237: Home takes the sign-in page's place, so Back doesn't land on the account page
  // CC-157: the sign-in page was pushed on the way: going back takes it off the history, and the popstate reopens that page
  if (back && location.hash === "#account" && history.state && history.state.view === "account") history.back();
  else if (back === "crews") openCrews(); else if (back === "planner") openPlanner(); else if (back === "journal") openJournal();
  else if (back === "submit") openSubmit();
  else if (back && back.indexOf("e/") === 0) openEvent(back.slice(2), false); // signed in from an event (CC-117)
  else if (visible("account")) renderAccount(true);
}
function loadWent() {
  return api("/me/attended").then(readJSON).then(function (res) {
    if (!res.ok) { if (WENT_STATE !== "ready") WENT_STATE = "error"; if (visible("journal")) renderJournalPage(); return; }
    WENT_STATE = "ready";
    WENT = {}; WENT_PHOTO = {}; WENT_JOURNAL = {}; WENT_SHARE = {}; WENT_AT = {}; WENT_LIST = res.body.map(function (row) {
      var e = toEvent(row.event); if (row.photo) WENT_PHOTO[e.id] = row.photo; // your photos (CC-76)
      WENT_AT[e.id] = row.created_at; // CC-248: when you marked it, to mix it by date with your own events
      WENT_JOURNAL[e.id] = { words: row.words || "", review: row.review || "", recommend: !!row.recommend }; // CC-98
      WENT_SHARE[e.id] = { shared: !!row.shared, anonymous: !!row.anonymous }; // CC-112
      return e;
    });
    WENT_LIST.forEach(function (e) { WENT[e.id] = true; });
    rerenderLists();
  }, function () { if (WENT_STATE !== "ready") WENT_STATE = "error"; if (visible("journal")) renderJournalPage(); });
}
function reloadEvents() { // something was published: fresh counts, home list and catalog page
  PLAN_RANGE = null;
  return api("/events/facets?today=" + isoDate(T)).then(readJSON).then(function (res) {
    if (!res.ok) return;
    setFacets(res.body); buildCatalogControls(); renderHome(); loadHome();
    if (visible("catalog")) loadCatalog();
  }, function () {});
}
document.addEventListener("click", function (ev) {
  var b = ev.target.closest("[data-went]"); if (!b || !AUTH.user) return;
  var id = b.getAttribute("data-went"), on = !WENT[id];
  // CC-98: un-marking always asks (the product owner's words); it deletes the journal entry too, so say so when there's one.
  if (!on && !window.confirm("Pressing this removes your attendance! Are you sure?" + (journalHasText(id) ? " Your journal entry for it will be deleted too." : ""))) return;
  b.disabled = true;
  api("/me/attended/" + encodeURIComponent(id), { method: on ? "PUT" : "DELETE" }).then(function (r) {
    if (!r.ok) throw new Error(r.status);
    if (on) { WENT[id] = true; WENT_JOURNAL[id] = { words: "", review: "", recommend: false }; WENT_SHARE[id] = { shared: false, anonymous: false }; if (KNOWN[id]) WENT_LIST.unshift(KNOWN[id]); }
    else { delete WENT[id]; delete WENT_PHOTO[id]; delete WENT_JOURNAL[id]; delete JOURNAL_DRAFT[id]; delete WENT_SHARE[id]; WENT_LIST = WENT_LIST.filter(function (e) { return e.id !== id; }); } // its photo goes too (CC-76)
    if (on && MYPLANS[id]) { // been: the server cleared the plan, so the card moves from plans to gone (CC-63)
      delete MYPLANS[id];
      $("myplan-live").textContent = "Moved to your Cultural Journal: " + KNOWN[id].title;
    }
    // Redraw every copy of the card (home, catalog and account can all show it): marking it also takes
    // away the plan button, and un-marking brings it back.
    if (on) JOURNAL_OPEN = id; // CC-146: the entry to write now is the one that's open
    return redrawCards(id, b.closest("[data-card],[data-day-item],[data-journal]"), "[data-went]");
  }).catch(function () { b.disabled = false; });
});

// ---------- your plans (CC-55) ----------
function loadMyPlans() {
  return api("/me/plans").then(readJSON).then(function (res) {
    if (!res.ok) { if (PLANS_STATE !== "ready") PLANS_STATE = "error"; return; }
    PLANS_STATE = "ready";
    MYPLANS = {}; MYPLAN_LIST = res.body.map(function (row) {
      var e = toEvent(row.event); MYPLANS[e.id] = { status: row.status, date: row.date, crews: row.crews || [] }; return e;
    });
  }, function () { if (PLANS_STATE !== "ready") PLANS_STATE = "error"; });
}
function myplanSaid(mine) {
  return !mine ? "Plan cleared" : mine.status === "going" ? "Going on " + dayName(parseISO(mine.date)) : "Marked interested";
}
// Redraw every copy of this event's card (home, catalog and account can all show it), then put focus back
// on the same card's plan button (or focusOn), on the card in "places you've gone" if "I've been" moved
// it there, or on the plans heading if the card left that list.
// An owner's plans are the public picks (CC-66): after one changes, get the event's pick again first.
function refreshPick(id) {
  if (!AUTH.user || !AUTH.user.dolphins || !KNOWN[id]) return Promise.resolve();
  return api("/events/lookup?ids=" + encodeURIComponent(id)).then(readJSON).then(function (res) {
    if (!res.ok || !res.body[0]) return;
    var pick = fromApi(res.body[0]).pick;
    KNOWN[id].pick = pick; // the same object every list holds
    // CC-152: the event view draws its own copy (EV.e, with your crews' plans), which a list fetched since can have
    // taken KNOWN's place from: without this, Clear plan left the old pick on the page until a reload
    if (EV.e && EV.e.id === id) EV.e.pick = pick;
  }, function () {});
}
function redrawCards(id, from, focusOn) {
  return refreshPick(id).then(function () { return redrawCardsNow(id, from, focusOn); });
}
function redrawCardsNow(id, from, focusOn) {
  var list = from && from.parentElement.closest("[id]"), listId = list ? list.id : null; // the grid this card was in
  Array.prototype.forEach.call(document.querySelectorAll('[data-card="' + id + '"]:not(.ev-panel)'), function (c) { c.outerHTML = cardHTML(KNOWN[id]); });
  Array.prototype.forEach.call(document.querySelectorAll('[data-listing="' + id + '"]'), function (r) { // CC-140: its rows' marks
    var li = r.parentElement; r.outerHTML = listingHTML(KNOWN[id]); paintWater(li);
  });
  return loadMyPlans().then(function () {
    if (visible("event")) renderEventView(); // CC-117: the event view's buttons, redrawn as a view, not a card
    if (visible("account")) renderAccount();
    if (visible("planner")) renderPlannerPage();
    if (visible("journal")) renderJournalPage(); // CC-159
    var item = '[data-card="' + id + '"],[data-day-item="' + id + '"],[data-journal="' + id + '"]', planner = PLANNER_LISTS.indexOf(listId) >= 0;
    var card = listId && $(listId) ? $(listId).querySelector(item) : null;
    if (!card && planner) card = $("planner-main").querySelector(item); // moved within the planner
    // CC-159: "I've been" moves it to the journal, now its own page: focus the line that goes there
    var target = card ? card.querySelector(focusOn || "[data-myplan-toggle]") : planner ? (WENT[id] ? $("planner-tojournal") : $("myplans-title")) : listId === "went-grid" ? $("journal-title") : null;
    if (target) target.focus();
  });
}
function saveMyPlan(id, body, panel, focusOn) {
  var card = panel.closest("[data-card],[data-day-item]"), err = panel.querySelector(".form-error");
  var buttons = panel.querySelectorAll("button"); Array.prototype.forEach.call(buttons, function (b) { b.disabled = true; });
  err.textContent = "";
  var req = body ? api("/me/plans/" + encodeURIComponent(id) + "?today=" + isoDate(T), { method: "PUT", body: body })
                 : api("/me/plans/" + encodeURIComponent(id), { method: "DELETE" });
  req.then(readJSON).then(function (res) {
    if (!res.ok) throw res;
    if (body) MYPLANS[id] = { status: body.status, date: body.date || null, crews: (MYPLANS[id] && MYPLANS[id].crews) || [] }; else delete MYPLANS[id];
    $("myplan-live").textContent = myplanSaid(MYPLANS[id]) + ": " + KNOWN[id].title;
    return pickerShut(panel).then(function () { return redrawCards(id, card, focusOn); });
  }).catch(function (res) {
    Array.prototype.forEach.call(buttons, function (b) { b.disabled = false; });
    err.textContent = res && res.status ? errorText(res) : "Couldn't save your plan. Check your connection and try again.";
  });
}
function closeMyPlan(toggle) {
  var panel = $(toggle.getAttribute("aria-controls"));
  toggle.setAttribute("aria-expanded", "false"); if (panel) dropClose(panel);
}
// CC-228: a saved picker slides shut before its card is redrawn, or the redraw would take it away at once. The event page's
// buttons have no toggle: they stay out. Focus waits on the toggle, as the panel can't hold it while it leaves.
function pickerShut(panel) {
  var toggle = panel.id && document.querySelector('[aria-controls="' + panel.id + '"]');
  if (!toggle || panel.hidden) return Promise.resolve();
  toggle.setAttribute("aria-expanded", "false"); toggle.focus(); dropClose(panel);
  return new Promise(function (done) { afterExit(panel, done); });
}
document.addEventListener("click", function (ev) {
  // one picker open at a time: a click anywhere else closes it
  Array.prototype.forEach.call(document.querySelectorAll('[data-myplan-toggle][aria-expanded="true"]'), function (open) {
    var panel = $(open.getAttribute("aria-controls"));
    if (!open.contains(ev.target) && !(panel && panel.contains(ev.target))) closeMyPlan(open);
  });
  if (!AUTH.user) return;
  var t = ev.target.closest("[data-myplan-toggle],[data-myplan-set],[data-myplan-going],[data-myplan-clear]"); if (!t) return;
  if (t.hasAttribute("data-myplan-toggle")) {
    var open = t.getAttribute("aria-expanded") !== "true", panel = $(t.getAttribute("aria-controls"));
    t.setAttribute("aria-expanded", String(open));
    dropToggle(panel, open, function () { panel.querySelector("button, input").focus(); });
    return;
  }
  var box = t.closest(".myplan");
  // CC-142: on the event page the buttons stay out, so focus comes back to the one you pressed (Clear: Interested)
  var back = box.classList.contains("ev-plan") ? (t.hasAttribute("data-myplan-going") ? "[data-myplan-going]" : "[data-myplan-set]") : undefined;
  var on = back && t.getAttribute("aria-pressed") !== "true"; // CC-144: turning one on, on the event page, moves its dolphin
  if (t.hasAttribute("data-myplan-set")) { if (on) evNod(t, t.getAttribute("data-myplan-set")); return saveMyPlan(t.getAttribute("data-myplan-set"), { status: "interested" }, box, back); }
  if (t.hasAttribute("data-myplan-clear")) return saveMyPlan(t.getAttribute("data-myplan-clear"), null, box, back);
  var input = box.querySelector('input[type="date"]'), day = t.getAttribute("data-date") || (input && input.value);
  if (input && (!day || day < input.min || day > input.max)) {
    box.querySelector(".form-error").textContent = !day ? "Choose a date." :
      "Choose a date from " + goingDay(input.min) + " to " + goingDay(input.max) + ".";
    input.focus(); return;
  }
  if (on) evLeap(t, t.getAttribute("data-myplan-going"));
  saveMyPlan(t.getAttribute("data-myplan-going"), { status: "going", date: day }, box, back);
});
// CC-154: on the event page the date field shows once you're going, so changing it saves the new day
document.addEventListener("change", function (ev) {
  var input = ev.target; if (input.id !== "ev-going-day" || !AUTH.user) return;
  var box = input.closest(".myplan"), day = input.value, id = box.querySelector("[data-myplan-going]").getAttribute("data-myplan-going");
  if (!day || day < input.min || day > input.max) {
    box.querySelector(".form-error").textContent = !day ? "Choose a date." :
      "Choose a date from " + goingDay(input.min) + " to " + goingDay(input.max) + ".";
    return;
  }
  saveMyPlan(id, { status: "going", date: day }, box, "#ev-going-day");
});
document.addEventListener("keydown", function (ev) { // Escape closes the picker and returns to its button
  if (ev.key !== "Escape") return;
  var box = ev.target.closest && ev.target.closest(".myplan"); if (!box) return;
  var toggle = document.querySelector('[aria-controls="' + box.id + '"]');
  if (toggle) { closeMyPlan(toggle); toggle.focus(); }
});

// ---------- My week: the week ahead (CC-97; Lakefront since CC-146) ----------
// A week at a time from today, one line per day in listings style (design brief, section 10): the events you're going
// to that day as event rows (CC-140) with Change plan and Tell a crew, or, on an empty day, one "Find something →"
// line (CC-131). Previous and Next step a week at a time (never before this week; at most two years out, as far as a
// plan can go), and "Skip to" jumps to the week of your next plan after the one showing. Beside it, Still deciding:
// interested plans, with no day yet, and going plans for a day that's passed, where "I've been" is.
var PLANNER_LISTS = ["planner-week", "myplans-grid"], PLANNER_WEEK = 0, PLANNER_MAX = 104;
var PLANS_STATE = "loading", WENT_STATE = "loading"; // until /me/plans and /me/attended first answer: then "ready", or "error"
function dayTimesText(e, d) { // "7:30 PM", "Open 10 AM to 5 PM", or "" (planner.js knows the schedules)
  if (isExhibit(e)) { var h = hoursOn(e, d); return h && h[2] ? "Open " + clockText(h[0]) + " to " + clockText(h[1]) : ""; }
  return (timesOn(e, d) || []).filter(Boolean).map(clockText).join(" and ");
}
// Who from your crews is in, as their dots and the line in words ("Maya C. and Jordan R. from Thursday Theater are going.")
function weekCrewHTML(e) {
  var names = crewNames(e), note = crewNoteText(e);
  if (!names.length || !note) return "";
  return '<p class="crew-line"><span class="dots" aria-hidden="true">' + names.slice(0, LISTING_DOTS).map(function (n) { return crewDotHTML(n); }).join("") +
    "</span><span>" + esc(note) + "</span></p>";
}
// An event row: the tile, name, venue and time are one link to the event page; the buttons follow,
// since they can't sit inside a link. d is the day it's planned for; without one it's a Still deciding row.
function weekRowHTML(e, d) {
  var mine = MYPLANS[e.id] || {}, going = mine.status === "going", id = esc(e.id);
  var when = d ? dayTimesText(e, d) : going ? "Going " + goingDay(mine.date) : dateText(e);
  var acts = d ? myplanToggleHTML(e) + crewShareToggleHTML(e, "Tell a crew") : // the toggles first: their pickers take the same number
    myplanToggleHTML(e, goingRange(e) ? "Pick a day" : "Change plan") + wentHTML(e) + crewShareToggleHTML(e, "Tell a crew") + // closed: no day left to pick
    (going ? "" : '<button type="button" class="went" data-plan-withdraw="' + id + '">Withdraw interest</button>'); // CC-160: undone from the line above
  return '<li class="wk-row" data-day-item="' + id + '"' + (d ? "" : ' data-row="' + id + '"') + '><a class="wk-row-a" href="#e/' + id + '" data-ev-open="' + id + '">' +
    '<span class="tile water-field' + catClass(e.type) + '">' + waterHTML(e, "tile") + '<span class="tile-k">' + esc(e.label) + "</span></span>" +
    '<span class="listing-t">' + esc(e.title) + (e.pick ? pickMarkHTML(e.pick, pickText(e.pick)) : "") + "</span>" +
    '<span class="wk-where">' + esc(placeText(e)) + "</span>" +
    '<span class="wk-when">' + (when ? "<span>" + esc(when) + "</span>" : "") + "</span></a>" +
    weekCrewHTML(e) + '<div class="card-actions wk-acts">' + acts + "</div>" + myplanHTML(e) + crewShareHTML(e) + "</li>";
}
// One day: its name, then its plans as rows, or "Nothing yet…" and Find something (the list opens under it).
function weekDayHTML(day) {
  var now = same(day.d, T), whole = (now ? "Today, " : "") + dayName(day.d), iso = isoDate(day.d), own = day.own || [], n = day.items.length + own.length;
  return '<section class="wk-day' + (now ? " today" : "") + '" data-row="' + iso + '" aria-label="' + esc(whole) + '">' + // CC-230: on My week the row that arrives is the day
    '<div class="wk-day-h"><h3 class="wk-day-t">' + esc((now ? "Today, " : "") + listingDay(day.d)) + "</h3>" +
    (n ? "" : '<span class="wk-none">Nothing yet\u2026</span>' + dayFindHTML(iso, dayName(day.d))) + "</div>" +
    (n ? '<ul class="wk-rows">' + day.items.map(function (e) { return weekRowHTML(e, day.d); }).join("") + own.map(ownWeekRowHTML).join("") + "</ul>" :
      '<div class="day-found" id="find-' + iso + '" aria-live="polite"' + (FIND_DAY_OPEN[iso] ? "" : " hidden") + ">" + (FIND_DAY_OPEN[iso] ? dayFoundHTML(iso) : "") + "</div>") +
    "</section>";
}
function goingAhead() { // your going plans from today on, soonest first: [{ e, n }] with n days from today
  return MYPLAN_LIST.map(function (e) {
    var mine = MYPLANS[e.id], d = mine && mine.status === "going" ? parseISO(mine.date) : null;
    return { e: e, n: d ? diff(d, T) : -1 };
  }).filter(function (x) { return x.n >= 0; }).sort(function (a, b) { return a.n - b.n; });
}
function weekRangeText(ws, we) { // "Oct 30 – Nov 5", "Nov 6 – 12", and the year when it isn't this one
  var md = function (d) { return F.md.format(d) + (d.getFullYear() === T.getFullYear() ? "" : ", " + d.getFullYear()); };
  return md(ws) + " \u2013 " + (ws.getMonth() === we.getMonth() && ws.getFullYear() === we.getFullYear() ? we.getDate() + (we.getFullYear() === T.getFullYear() ? "" : ", " + we.getFullYear()) : md(we));
}
function renderPlanner() {
  var start = PLANNER_WEEK * 7, days = [], ahead = goingAhead(), ready = PLANS_STATE === "ready";
  for (var i = 0; i < 7; i++) days.push({ d: add(T, start + i), items: [], own: [] });
  ahead.forEach(function (x) { if (x.n >= start && x.n < start + 7) days[x.n - start].items.push(x.e); });
  var ownAhead = OWN_LIST.filter(function (o) { return o.date >= isoDate(T); }); // CC-248: your own events on their day
  ownAhead.forEach(function (o) { var n = diff(parseISO(o.date), T); if (n >= start && n < start + 7) days[n - start].own.unshift(o); });
  var deciding = MYPLAN_LIST.filter(function (e) { var mine = MYPLANS[e.id]; return !(mine && mine.status === "going" && parseISO(mine.date) >= T); });
  var next = ahead.filter(function (x) { return x.n >= start + 7; })[0], planned = ahead.filter(function (x) { return x.n >= start && x.n < start + 7; }).length;
  $("week-range").textContent = (PLANNER_WEEK === 0 ? "This week · " : "") + weekRangeText(days[0].d, days[6].d);
  $("week-prev").disabled = PLANNER_WEEK === 0; $("week-next").disabled = PLANNER_WEEK >= PLANNER_MAX;
  $("week-now").hidden = PLANNER_WEEK === 0;
  $("week-skip").hidden = !next;
  if (next) $("week-skip").textContent = "Skip to your next plan: " + goingDay(MYPLANS[next.e.id].date);
  // loading and errors: the days wait, rather than saying "Nothing yet…" before the plans are in
  $("week-state").hidden = ready;
  $("week-state").innerHTML = ready ? "" : PLANS_STATE === "error" ? '<p class="week-error" role="alert">' + esc(checkThis("your plans couldn\u2019t be loaded. Reload the page to try again.")) + "</p>" :
    '<p class="week-hint" role="status">Finding your plans\u2026</p>';
  planned += days.reduce(function (t, day) { return t + day.own.length; }, 0);
  $("week-n").textContent = ready ? plural(planned, "plan", "plans") : "";
  $("deciding-n").textContent = ready ? String(deciding.length) : "";
  $("planner-week").innerHTML = !ready ? "" : days.map(weekDayHTML).join("") +
    (ahead.length || ownAhead.length ? "" : '<p class="week-hint">Commit to a day on any event and it shows up here.</p>');
  days.forEach(function (day) { paintFindDay(isoDate(day.d)); });
  $("myplans-grid").innerHTML = ready ? deciding.map(function (e) { return weekRowHTML(e); }).join("") : "";
  $("deciding-undo").innerHTML = ready ? withdrawnHTML() : "";
  $("deciding-hint").textContent = !ready ? "" : deciding.some(goingRange) ? "Pick a day for one, and it moves into your week." : deciding.length ? "" :
    "Nothing waiting. Mark an event Interested, and it waits here until you pick a day.";
  paintWater($("planner-main")); rowsPainted($("planner-week")); rowsPainted($("myplans-grid")); // the two columns arrive side by side
}
// CC-160: Withdraw interest clears the plan (and so its sharing with crews, server side) at once, and a line at the top
// of Still deciding offers Undo, which puts back the plan and the crews it was shared with. Only an interested plan has
// it: a going plan for a day that's passed couldn't be put back. WITHDRAWN keeps the last one until it's undone or
// marked again some other way.
var WITHDRAWN = null; // { id, title, mine, error }
function withdrawnHTML() {
  var w = WITHDRAWN; if (!w || MYPLANS[w.id]) return "";
  return '<p class="week-undo">Withdrew your interest in <span class="week-undo-t">' + esc(w.title) + "</span>. " +
    '<button type="button" class="week-tbtn" id="deciding-undo-btn" data-plan-undo="' + esc(w.id) + '">Undo</button></p>' +
    (w.error ? '<p class="week-error" role="alert">' + esc(checkThis(w.error)) + "</p>" : "");
}
function withdrawPlan(id, b) {
  var mine = MYPLANS[id]; if (!mine) return;
  b.disabled = true;
  api("/me/plans/" + encodeURIComponent(id), { method: "DELETE" }).then(readJSON).then(function (res) {
    if (!res.ok) throw res;
    WITHDRAWN = { id: id, title: KNOWN[id].title, mine: mine }; delete MYPLANS[id];
    $("myplan-live").textContent = "Withdrew your interest: " + KNOWN[id].title + ". Undo is at the top of Still deciding.";
    return redrawCards(id).then(function () { if ($("deciding-undo-btn")) $("deciding-undo-btn").focus(); });
  }).catch(function (res) {
    b.disabled = false;
    $("deciding-undo").innerHTML = '<p class="week-error" role="alert">' + esc(checkThis(res && res.status ? errorText(res) :
      "your interest couldn\u2019t be withdrawn. Check your connection and try again.")) + "</p>";
  });
}
function undoWithdraw(b) {
  var w = WITHDRAWN; if (!w) return;
  b.disabled = true;
  api("/me/plans/" + encodeURIComponent(w.id) + "?today=" + isoDate(T), { method: "PUT", body: { status: w.mine.status, date: w.mine.date } }).then(readJSON).then(function (res) {
    if (!res.ok) throw res;
    MYPLANS[w.id] = { status: w.mine.status, date: w.mine.date, crews: [] };
    return !(w.mine.crews || []).length ? null : api("/me/plans/" + encodeURIComponent(w.id) + "/crews", { method: "PUT", body: { crews: w.mine.crews } }).then(readJSON).then(function (r) {
      if (!r.ok) throw r;
      MYPLANS[w.id].crews = r.body.crews;
    });
  }).then(function () {
    WITHDRAWN = null;
    $("myplan-live").textContent = "Back in Still deciding: " + w.title;
    if (visible("crews")) loadCrews();
    return redrawCards(w.id).then(function () {
      var row = $("myplans-grid").querySelector('[data-day-item="' + w.id + '"] [data-plan-withdraw]');
      (row || $("deciding-title")).focus();
    });
  }).catch(function (res) {
    if (MYPLANS[w.id]) { // the plan came back but its crews didn't: say so, and Tell a crew is on its row again
      WITHDRAWN = null;
      return redrawCards(w.id).then(function () {
        $("deciding-undo").innerHTML = '<p class="week-error" role="alert">' + esc(checkThis("your plan is back, but not shared with your crews. Use Tell a crew on it.")) + "</p>";
      });
    }
    w.error = res && res.status ? errorText(res) : "your plan couldn\u2019t be put back. Check your connection and try again.";
    renderPlanner(); if ($("deciding-undo-btn")) $("deciding-undo-btn").focus();
  });
}
document.addEventListener("click", function (ev) {
  if (!AUTH.user) return;
  var t = ev.target.closest("[data-plan-withdraw],[data-plan-undo]"); if (!t) return;
  if (t.hasAttribute("data-plan-withdraw")) withdrawPlan(t.getAttribute("data-plan-withdraw"), t); else undoWithdraw(t);
});
function showWeek(n, focusId) {
  PLANNER_WEEK = Math.max(0, Math.min(PLANNER_MAX, n)); renderPlanner();
  var b = $(focusId); // stay on the button pressed, or the nearest one still usable (Skip goes once it's used up)
  (b && !b.hidden && !b.disabled ? b : !$("week-next").disabled ? $("week-next") : $("week-prev")).focus();
}
$("week-prev").addEventListener("click", function () { showWeek(PLANNER_WEEK - 1, "week-prev"); });
$("week-next").addEventListener("click", function () { showWeek(PLANNER_WEEK + 1, "week-next"); });
$("week-now").addEventListener("click", function () { showWeek(0, "week-next"); });
$("week-skip").addEventListener("click", function () {
  var next = goingAhead().filter(function (x) { return x.n >= PLANNER_WEEK * 7 + 7; })[0];
  if (next) showWeek(Math.floor(next.n / 7), "week-skip");
});
// CC-131: "Find something →" opens a list under the day, in place, of only what's on that day (the planner's rule,
// CC-79: a show with a time that day, an exhibition on a day it's open; on today, only what's still to come). Each
// links to its event; the button closes it again. An empty day says so and offers the catalog.
// FIND_DAY_OPEN and FIND_DAY keep, by day, which lists are open and what came back, so redrawing the week keeps them.
// A busy day lists the first FIND_DAY_SHOWN (shows by start time, then exhibitions), then a link to the catalog
// for just that day (When is a one-day range, and the other filters start fresh). The list is FIND_DAY_TALL items
// high, with the next one peeking out; the rest and the link are a scroll away.
var FIND_DAY = {}, FIND_DAY_OPEN = {}, FIND_DAY_SHOWN = 5, FIND_DAY_TALL = 3;
// CC-156: an open day with events has three buttons, the three kinds (TYPE_ORDER), to show only one; pressing it
// again shows them all. One day holds the choice at a time: opening or filtering another day clears it.
var FIND_DAY_KIND = { iso: "", type: "" };
function dayKindOf(iso) { return FIND_DAY_KIND.iso === iso ? FIND_DAY_KIND.type : ""; }
function dayKindsHTML(iso) {
  var on = dayKindOf(iso);
  return '<div class="week-steps day-kinds" role="group" aria-label="Show only">' + TYPE_ORDER.map(function (t) {
    return '<button type="button" class="week-step day-kind' + catClass(t) + '" data-day-kind="' + esc(t) + '" data-day="' + iso + '" aria-pressed="' + (on === t) + '">' + esc(t) + "</button>";
  }).join("") + "</div>";
}
function dayFoundHTML(iso) { // what's in the open list: loading, an error, nothing, or that day's events
  var d = parseISO(iso), got = FIND_DAY[iso], kind = dayKindOf(iso), types = {};
  if (!got || got.loading) return '<p class="week-hint">Finding events\u2026</p>';
  if (got.error) return '<p class="week-error">' + esc(checkThis("the events couldn\u2019t be loaded. Check your connection and try again.")) + "</p>";
  if (!got.items.length) return '<p class="week-hint">Nothing on the list for that day.</p><p class="week-hint"><a href="#catalog" data-find-catalog>Browse the catalog</a></p>';
  types[kind] = true;
  var items = kind ? got.items.filter(function (e) { return inType(e, types); }) : got.items;
  if (!items.length) return dayKindsHTML(iso) + '<p class="week-hint day-kind-none">No ' + esc(kind) + ' on the list for that day. ' +
    '<button type="button" class="week-tbtn" data-day-kind="" data-day="' + iso + '">Show all ' + got.items.length + "</button></p>";
  return dayKindsHTML(iso) + '<div class="day-scroll"><ul class="day-items">' + items.slice(0, FIND_DAY_SHOWN).map(function (e) {
    var times = dayTimesText(e, d), id = esc(e.id);
    return '<li class="day-item"><a href="#e/' + id + '" data-ev-open="' + id + '">' + esc(e.title) + "</a>" +
      '<span class="day-where">' + esc(placeText(e)) + "</span>" + (times ? '<span class="day-time">' + esc(times) + "</span>" : "") + "</li>";
  }).join("") + "</ul>" + (items.length > FIND_DAY_SHOWN ? '<p class="week-hint"><a href="#catalog" data-find-catalog="' + iso + '"' +
    (kind ? ' data-find-kind="' + esc(kind) + '"' : "") + ">See more for that day in the catalog</a></p>" : "") + "</div>";
}
function dayFindHTML(iso, whole) { // the button on the day's line; weekDayHTML puts its list under the line
  return '<button type="button" class="week-tbtn day-find" data-find-day="' + iso + '" data-whole="' + esc(whole) + '" aria-controls="find-' + iso + '"></button>';
}
// slide (CC-228): pressed, so it moves. A list waits for its events, so it opens once to the height it will have.
function paintFindDay(iso, slide) { // the button says what it does next; the list shows when it's open
  var b = document.querySelector('[data-find-day="' + iso + '"]'), box = $("find-" + iso); if (!b || !box) return;
  var open = !!FIND_DAY_OPEN[iso], ready = open && !!FIND_DAY[iso] && !FIND_DAY[iso].loading, was = !box.hidden;
  b.setAttribute("aria-expanded", String(open));
  b.textContent = open ? "Hide that day\u2019s events" : "Find something \u2192";
  b.setAttribute("aria-label", (open ? "Hide the events for " : "Find something for ") + b.getAttribute("data-whole"));
  if (!ready && slide) {
    if (was) { dropClose(box); afterExit(box, function () { if (box.hidden) box.innerHTML = ""; }); }
    return;
  }
  box.hidden = !ready; box.innerHTML = ready ? dayFoundHTML(iso) : "";
  fitFindDay(box);
  if (ready && slide && !was) dropOpen(box);
}
function setDayKind(iso, type, slide) { // the one day's choice; the day that had it before shows them all again
  var was = FIND_DAY_KIND.iso; FIND_DAY_KIND = { iso: type ? iso : "", type: type };
  if (was && was !== iso) paintFindDay(was);
  paintFindDay(iso, slide);
}
function fitFindDay(box) { // FIND_DAY_TALL items high (the day-scroll is their offsetParent), measured, since titles wrap more in a narrow column
  var sc = box.querySelector(".day-scroll"); if (!sc) return;
  var next = sc.querySelectorAll(".day-item")[FIND_DAY_TALL];
  sc.style.maxHeight = ""; if (next) sc.style.maxHeight = (next.offsetTop + 28) + "px";
}
window.addEventListener("resize", function () { Array.prototype.forEach.call(document.querySelectorAll(".day-found:not([hidden])"), fitFindDay); });
function findDay(iso) { // a day's events, once (again after an error)
  var d = parseISO(iso), got = FIND_DAY[iso] = { loading: true, items: [] };
  return fetchEvents([["from", iso], ["to", iso], ["sort", "opening"], ["limit", 1000]]).then(function (page) {
    var first = function (e) { return !isExhibit(e) && (timesOn(e, d) || []).filter(Boolean).sort()[0] || "~"; }; // exhibitions and untimed last
    got.items = page.items.filter(function (e) { return onDay(e, d, "day"); });
    got.items.sort(function (a, b) { var x = first(a), y = first(b); return x < y ? -1 : x > y ? 1 : 0; }); // stable: else opening order
    got.loading = false;
  }, function () { got.loading = false; got.error = true; });
}
document.addEventListener("click", function (ev) {
  var c = ev.target.closest("[data-find-catalog]");
  if (c) { // the catalog: for just that day from a busy day, or all of it from an empty one
    ev.preventDefault(); resetCatalog();
    var on = c.getAttribute("data-find-catalog"); if (on) { cat.when = "custom"; cat.custom = { ws: parseISO(on), we: parseISO(on) }; }
    var kind = c.getAttribute("data-find-kind"); if (kind) cat.types[kind] = true; // CC-156: and the kind pressed
    loadCatalog(); show("catalog"); return;
  }
  var k = ev.target.closest("[data-day-kind]");
  if (k) { // CC-156: a kind, again for all of them; focus goes back to the pressed one (or the first, after Show all)
    var day = k.getAttribute("data-day"), t = k.getAttribute("data-day-kind");
    setDayKind(day, dayKindOf(day) === t ? "" : t);
    var back = document.querySelector('[data-day="' + day + '"][data-day-kind="' + (t || TYPE_ORDER[0]) + '"]'); if (back) back.focus();
    return;
  }
  var b = ev.target.closest("[data-find-day]"); if (!b) return;
  var iso = b.getAttribute("data-find-day");
  if (FIND_DAY_OPEN[iso]) { delete FIND_DAY_OPEN[iso]; if (FIND_DAY_KIND.iso === iso) FIND_DAY_KIND = { iso: "", type: "" }; paintFindDay(iso, true); return; }
  FIND_DAY_OPEN[iso] = true;
  if (!FIND_DAY[iso] || FIND_DAY[iso].error) findDay(iso).then(function () { paintFindDay(iso, true); });
  setDayKind(iso, "", true); // another day: its list starts with them all, and the last day's choice clears
});

// ---------- Cultural Journal (CC-98) ----------
// The five events you've been to most recently (older entries are kept, just not listed), each with three words
// (required to save, one a box), a review and "Would you recommend?" (both optional), all private to you, and your photo from it while it's
// waiting or approved. What you type is kept as a draft until you save, so the page redrawing doesn't lose it.
var JOURNAL_SHOWN = 5, REVIEW_MAX = 1000, REVIEW_COUNT_FROM = 800, WORD_MAX = 20; // three words: a box each, one word a box
function journalOf(id) { return JOURNAL_DRAFT[id] || WENT_JOURNAL[id] || { words: "", review: "", recommend: false }; }
function journalHasText(id) { var j = journalOf(id), s = WENT_JOURNAL[id] || {}; return !!(j.words || j.review || j.recommend || s.words || s.review || s.recommend); }
function reviewCountText(n) { return n >= REVIEW_COUNT_FROM ? (REVIEW_MAX - n) + " characters left" : ""; }
// CC-146: only the entry being written is open. A finished one folds to its row: the tile, its name and venue, and its
// three words as an italic deck, with Edit. JOURNAL_OPEN is the open entry's id; null opens the newest without words,
// and "" (Close) leaves them all folded. Your photo shows on the tile, and in full when the entry is open.
var JOURNAL_OPEN = null;
function journalOpenId(shown) {
  if (JOURNAL_OPEN !== null && (JOURNAL_OPEN === "" || shown.some(function (e) { return e.id === JOURNAL_OPEN; }))) return JOURNAL_OPEN;
  var first = shown.filter(function (e) { return !(WENT_JOURNAL[e.id] || {}).words; })[0];
  return first ? first.id : "";
}
function journalEntryHTML(e, open) {
  var id = esc(e.id), j = journalOf(e.id), saved = WENT_JOURNAL[e.id] || {}, p = WENT_PHOTO[e.id], k = "j-" + id, words = j.words ? j.words.split(" ") : [];
  var hasPhoto = p && p.status !== "rejected" && p.url, photoState = hasPhoto && p.status !== "approved" ? PHOTO_STATES[p.status] || p.status : "";
  var thumb = hasPhoto ? '<img class="journal-thumb" src="' + esc(API + p.url) + '" alt="">' : ""; // the tile shows if it won't load
  var notes = [saved.recommend ? "Recommended" : "", (WENT_SHARE[e.id] || {}).shared ? "Shared" : ""].filter(Boolean);
  var head = '<div class="journal-row"><a class="journal-a" href="#e/' + id + '" data-ev-open="' + id + '">' +
    '<span class="tile water-field' + catClass(e.type) + '">' + waterHTML(e, "tile") + '<span class="tile-k">' + esc(e.label) + "</span>" + thumb + "</span>" +
    '<span class="listing-t" id="' + k + '-h">' + esc(e.title) + "</span>" + '<span class="wk-where">' + esc(placeText(e)) + "</span></a>" +
    (open ? "" : saved.words ? '<p class="journal-words">' + esc(saved.words.split(" ").map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join(". ")) + ".</p>" : '<p class="week-hint journal-nowords">No three words yet.</p>') +
    '<div class="journal-meta">' + notes.map(function (n) { return "<span>" + n + "</span>"; }).join("") + (photoState ? "<span>Photo " + esc(photoState.toLowerCase()) + "</span>" : "") +
    '<button type="button" class="week-tbtn" data-journal-open="' + id + '" aria-expanded="' + open + '" aria-label="' +
    esc((open ? "Close your entry for " : saved.words ? "Edit your entry for " : "Write your entry for ") + e.title) + '">' + (open ? "Close" : saved.words ? "Edit" : "Write") + "</button></div></div>";
  if (!open) return '<article class="journal-entry" data-journal="' + id + '" aria-labelledby="' + k + '-h">' + head + '<div id="' + k + '-b" data-drop hidden></div></article>';
  var photo = hasPhoto ? '<figure class="journal-photo"><img src="' + esc(API + p.url) + '" alt="Your photo from ' + esc(e.title) + '">' +
    (photoState ? "<figcaption>" + esc(photoState) + "</figcaption>" : "") + "</figure>" : "";
  return '<article class="journal-entry open" data-journal="' + id + '" aria-labelledby="' + k + '-h">' + head +
    '<div class="journal-body" id="' + k + '-b" data-drop>' +
    '<form class="journal-form" data-journal-form="' + id + '" novalidate>' +
    '<fieldset class="field three-words"><legend>Three words</legend><div class="row">' + [0, 1, 2].map(function (i) {
      return '<input name="word" type="text" maxlength="' + WORD_MAX + '" autocomplete="off" spellcheck="true" required aria-label="Word ' + (i + 1) + '" value="' + esc(words[i] || "") + '">';
    }).join("") + "</div></fieldset>" +
    '<div class="field"><label for="' + k + '-review">Your review (optional)</label><textarea id="' + k + '-review" name="review" rows="3" maxlength="' + REVIEW_MAX + '" aria-describedby="' + k + '-count">' + esc(j.review) + "</textarea>" +
    '<span class="hint small" id="' + k + '-count" aria-live="polite">' + esc(reviewCountText(j.review.length)) + "</span></div>" +
    '<label class="radio"><input type="checkbox" name="recommend"' + (j.recommend ? " checked" : "") + "> Would you recommend it?</label>" +
    '<div class="row"><button class="btn" type="submit">Save</button><span class="week-said" data-journal-said role="status"></span></div>' +
    '<p class="week-error" role="alert" data-journal-error></p></form>' + journalShareHTML(e) +
    '<div class="card-actions wk-acts">' + photoButtonHTML(e) + wentHTML(e) + "</div>" + photo + "</div></article>";
}
// CC-112: "Share publicly", off by default and saved the moment it's ticked or unticked (so unsharing can't be
// forgotten). Once on, how it's signed: your first name and initial, or "A Culture Crew member". It needs the three
// words saved first, since they're what's shared.
function journalShareHTML(e) {
  var id = esc(e.id), sh = WENT_SHARE[e.id] || { shared: false, anonymous: false }, saved = !!(WENT_JOURNAL[e.id] || {}).words, k = "js-" + id;
  var me = AUTH.user && (AUTH.user.display_name || "").trim() ? shortName(AUTH.user.display_name) : "";
  var sign = function (anon, text) {
    return '<label class="radio"><input type="radio" name="' + k + '-as" value="' + (anon ? "anon" : "name") + '"' + (sh.anonymous === anon ? " checked" : "") + "> " + esc(text) + "</label>";
  };
  return '<div class="journal-share' + (sh.shared ? " on" : "") + '" data-share="' + id + '">' +
    '<label class="radio"><input type="checkbox" name="share"' + (sh.shared ? " checked" : "") + (saved || sh.shared ? "" : " disabled") + ' aria-describedby="' + k + '-hint"> Share publicly</label>' +
    '<p class="hint small" id="' + k + '-hint">' + (saved || sh.shared ? "Your three words, review and recommendation go on the event\u2019s page for anyone deciding whether to go." :
      "Save your three words first, then you can share them on the event\u2019s page.") + "</p>" +
    (sh.shared ? '<fieldset class="share-as"><legend>Signed as</legend>' + (me ? sign(false, me) : "") + sign(true, "A Culture Crew member") + "</fieldset>" +
      '<p class="hint small"><a href="#e/' + id + '" data-ev-open="' + id + '">See it on the event</a></p>' : "") +
    '<p class="form-error" role="alert" data-share-error></p></div>';
}
function redrawShare(id, focusName) {
  var box = document.querySelector('[data-share="' + id + '"]'), e = KNOWN[id]; if (!box || !e) return;
  box.outerHTML = journalShareHTML(e);
  var f = focusName && document.querySelector('[data-share="' + id + '"] input[' + focusName + "]"); if (f) f.focus();
}
document.addEventListener("change", function (ev) {
  var box = ev.target.closest && ev.target.closest("[data-share]"); if (!box) return;
  var id = box.getAttribute("data-share"), was = WENT_SHARE[id] || { shared: false, anonymous: false };
  var radio = box.querySelector('input[type="radio"]:checked'), named = !!(AUTH.user && (AUTH.user.display_name || "").trim());
  var body = { shared: box.querySelector('input[name="share"]').checked, anonymous: !named || (radio ? radio.value === "anon" : was.anonymous) }; // no display name: unsigned
  var focusName = ev.target.type === "radio" ? 'value="' + ev.target.value + '"' : 'name="share"';
  box.querySelectorAll("input").forEach(function (i) { i.disabled = true; });
  api("/me/attended/" + encodeURIComponent(id) + "/share", { method: "PUT", body: body }).then(readJSON).then(function (res) {
    if (res.ok) WENT_SHARE[id] = res.body;
    redrawShare(id, focusName);
    var err = document.querySelector('[data-share="' + id + '"] [data-share-error]');
    if (unconfirmed(res)) confirmFirst(err); else if (!res.ok) err.textContent = errorText(res);
  }, function () { redrawShare(id, focusName); document.querySelector('[data-share="' + id + '"] [data-share-error]').textContent = errorText(null); });
});
function renderJournal() {
  // CC-248: your own events mixed in by date, the ones still to come above, and Add an event at the top
  var items = journalItems(), shown = items.past.filter(function (x) { return x.went; }).map(function (x) { return x.went; });
  var open = OWN_OPEN !== null ? "" : journalOpenId(shown);
  var row = function (x) { return x.went ? journalEntryHTML(x.went, x.went.id === open) : ownEntryHTML(x.own, String(OWN_OPEN) === String(x.own.id)); };
  dropRepaint($("went-grid"), function () { // CC-228: the entry that opens and the one that folds both slide
    $("went-grid").innerHTML = ownBarHTML() +
      (OWN_STATE === "error" ? '<p class="week-error" role="alert">' + esc(checkThis("your own events couldn\u2019t be loaded. Reload the page to try again.")) + "</p>" : "") +
      (items.coming.length ? '<h2 class="journal-sub">Coming up</h2>' + items.coming.map(function (o) { return row({ own: o }); }).join("") +
        '<h2 class="journal-sub">Where you\u2019ve been</h2>' : "") +
      (items.past.length ? items.past.map(row).join("") :
      WENT_STATE === "loading" ? '<p class="week-hint" role="status">Finding your journal\u2026</p>' :
      WENT_STATE === "error" ? '<p class="week-error" role="alert">' + esc(checkThis("your journal couldn\u2019t be loaded. Reload the page to try again.")) + "</p>" :
      '<p class="week-hint">Mark events with \u201cI\u2019ve been\u201d, or add your own, and they\u2019ll show up here, ready for your notes.</p>');
  });
  paintWater($("went-grid"));
}
// Edit (or Write) opens an entry and folds the one that was open; Close folds it. What you'd typed stays as a draft.
document.addEventListener("click", function (ev) {
  var b = ev.target.closest && ev.target.closest("[data-journal-open]"); if (!b) return;
  var id = b.getAttribute("data-journal-open"), opening = b.getAttribute("aria-expanded") !== "true";
  JOURNAL_OPEN = opening ? id : ""; OWN_OPEN = null; renderJournal(); // CC-248: one open entry at a time
  var entry = document.querySelector('[data-journal="' + id + '"]');
  var to = entry && (opening ? entry.querySelector('input[name="word"]') : entry.querySelector("[data-journal-open]")); if (to) to.focus();
});
// A photo that won't load (its 15-minute link ran out, or the file's gone) leaves no broken image: the entry just
// shows without it until the next reload.
document.addEventListener("error", function (ev) {
  if (ev.target.classList && ev.target.classList.contains("journal-thumb")) { ev.target.remove(); return; } // CC-146: the tile shows instead
  var fig = ev.target.closest && ev.target.tagName === "IMG" && ev.target.closest(".journal-photo"); if (!fig) return;
  var entry = fig.closest(".journal-entry"); fig.remove(); if (entry) entry.classList.add("no-photo");
}, true);
function readJournal(form) {
  var words = Array.prototype.map.call(form.querySelectorAll('input[name="word"]'), function (w) { return w.value.trim(); }).filter(Boolean);
  return { words: words.join(" "), review: form.elements.review.value, recommend: form.elements.recommend.checked };
}
document.addEventListener("input", function (ev) {
  var form = ev.target.closest && ev.target.closest("[data-journal-form]"); if (!form) return;
  var id = form.getAttribute("data-journal-form"), j = readJournal(form);
  if (ev.target.name === "word" && /\s/.test(ev.target.value)) { // one word a box: no spaces (hyphens are fine)
    var at = ev.target.selectionStart - (ev.target.value.slice(0, ev.target.selectionStart).match(/\s/g) || []).length;
    ev.target.value = ev.target.value.replace(/\s+/g, ""); ev.target.setSelectionRange(at, at); j = readJournal(form);
  }
  JOURNAL_DRAFT[id] = j; form.querySelector("[data-journal-said]").textContent = "";
  if (ev.target.name === "word" && ev.target.value.trim()) crewMarkInvalid(ev.target, false);
  if (ev.target.name === "review") $("j-" + id + "-count").textContent = reviewCountText(j.review.length);
});
document.addEventListener("change", function (ev) { // the checkbox: a draft too
  var form = ev.target.closest && ev.target.closest("[data-journal-form]"); if (form && ev.target.name === "recommend") JOURNAL_DRAFT[form.getAttribute("data-journal-form")] = readJournal(form);
});
document.addEventListener("submit", function (ev) {
  var form = ev.target.closest && ev.target.closest("[data-journal-form]"); if (!form) return;
  ev.preventDefault();
  var id = form.getAttribute("data-journal-form"), body = readJournal(form), err = form.querySelector("[data-journal-error]"), said = form.querySelector("[data-journal-said]");
  var btn = form.querySelector('button[type="submit"]'), boxes = form.querySelectorAll('input[name="word"]');
  err.textContent = ""; said.textContent = "";
  Array.prototype.forEach.call(boxes, function (w) { crewMarkInvalid(w, !w.value.trim()); }); // CC-146: the empty boxes get the ink border
  var empty = Array.prototype.filter.call(boxes, function (w) { return !w.value.trim(); })[0];
  if (empty) { err.textContent = checkThis("give all three words to save your entry."); empty.focus(); return; } // CC-98: the words are required
  btn.disabled = true;
  api("/me/attended/" + encodeURIComponent(id) + "/journal", { method: "PUT", body: body }).then(readJSON).then(function (res) {
    btn.disabled = false;
    if (!res.ok) { err.textContent = checkThis(errorText(res)); return; }
    var first = !(WENT_JOURNAL[id] || {}).words;
    WENT_JOURNAL[id] = res.body; delete JOURNAL_DRAFT[id];
    form.elements.review.value = res.body.review; // as saved (trimmed)
    said.textContent = WENT_SHARE[id] && WENT_SHARE[id].shared ? "Saved, and updated on the event\u2019s page." : "Saved.";
    pulse(btn);
    if (first) redrawShare(id); // CC-112: now it can be shared
  }, function () { btn.disabled = false; err.textContent = checkThis(errorText(null)); });
});

// ---------- Your own events and categories in the journal (CC-248) ----------
// Events that aren't in the catalog, added by you and private to you: never shared, never shown to crews. Each has a
// title and a date (past or future), and a venue, a category, your three words, a review, "Would you recommend?" and a
// photo when you like (no approver: only you see it). They're mixed in by date with the events you've been to, marked
// "Added by you", and ones still to come sit above under "Coming up" and show in My week on their day. A category is
// one of the catalog's three or one of your own; deleting your own keeps its events, with no category.
var OWN_LIST = [], OWN_CATS = [], OWN_STATE = "loading", OWN_OPEN = null, OWN_DRAFT = {}, OWN_CATS_OPEN = false, OWN_SAID = {};
var OWN_TITLE_MAX = 120, OWN_VENUE_MAX = 120, OWN_CAT_MAX = 30, OWN_CATALOG = ["Theater", "Music", "Visual Art"];
function loadOwn() {
  return Promise.all([api("/me/own-events").then(readJSON), api("/me/categories").then(readJSON)]).then(function (r) {
    if (!r[0].ok || !r[1].ok) { if (OWN_STATE !== "ready") OWN_STATE = "error"; }
    else { OWN_STATE = "ready"; OWN_LIST = r[0].body; OWN_CATS = r[1].body; }
    ownRepaint();
  }, function () { if (OWN_STATE !== "ready") OWN_STATE = "error"; ownRepaint(); });
}
function ownRepaint() { if (visible("journal")) renderJournal(); if (visible("planner")) renderPlanner(); }
function ownById(id) { return OWN_LIST.filter(function (o) { return String(o.id) === String(id); })[0]; }
function ownSort() { OWN_LIST.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id; }); }
function ownComing(o) { return o.date > isoDate(T); }
// The journal's two lists: still to come (soonest first), and the five latest you've been to, catalog and your own
// mixed by date (a catalog event's date is the day you marked it "I've been").
function journalItems() {
  var today = isoDate(T);
  var past = WENT_LIST.map(function (e) { return { went: e, on: WENT_AT[e.id] ? isoDate(new Date(WENT_AT[e.id])) : today }; })
    .concat(OWN_LIST.filter(function (o) { return !ownComing(o); }).map(function (o) { return { own: o, on: o.date }; }));
  past.sort(function (a, b) { return a.on < b.on ? 1 : a.on > b.on ? -1 : 0; });
  return { coming: OWN_LIST.filter(ownComing).slice().reverse(), past: past.slice(0, JOURNAL_SHOWN) };
}
function ownTileHTML(o, thumb) {
  var cat = OWN_CATALOG.indexOf(o.category) >= 0 ? o.category : "";
  return '<span class="tile water-field' + catClass(cat) + '">' + waterHTML({ id: "own-" + o.id, type: cat }, "tile") +
    '<span class="tile-k">' + esc(o.category_name || "Yours") + "</span>" + (thumb && o.photo_url ? '<img class="journal-thumb" src="' + esc(API + o.photo_url) + '" alt="">' : "") + "</span>";
}
function ownWhereText(o) { return [o.venue, goingDay(o.date)].filter(Boolean).join(" · "); }
function ownWordsHTML(words) {
  return '<p class="journal-words">' + esc(words.split(" ").map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join(". ")) + ".</p>";
}
function ownEntryHTML(o, open) {
  var id = esc(o.id), k = "o-" + id, coming = ownComing(o);
  var head = '<div class="journal-row"><div class="journal-a own-a">' + ownTileHTML(o, true) +
    '<span class="listing-t" id="' + k + '-h">' + esc(o.title) + "</span>" + '<span class="wk-where">' + esc(ownWhereText(o)) + "</span></div>" +
    (open ? "" : o.words ? ownWordsHTML(o.words) : '<p class="week-hint journal-nowords">' + (coming ? "Coming up. Your three words can wait until you’ve been." : "No three words yet.") + "</p>") +
    '<div class="journal-meta"><span>Added by you</span>' + (o.recommend ? "<span>Recommended</span>" : "") +
    '<button type="button" class="week-tbtn" data-own-open="' + id + '" aria-expanded="' + open + '" aria-label="' +
    esc((open ? "Close " : "Edit ") + o.title) + '">' + (open ? "Close" : "Edit") + "</button></div></div>";
  if (!open) return '<article class="journal-entry own" data-own="' + id + '" aria-labelledby="' + k + '-h">' + head + "</article>";
  return '<article class="journal-entry own open" data-own="' + id + '" aria-labelledby="' + k + '-h">' + head +
    '<div class="journal-body">' + ownFormHTML(o) + ownPhotoHTML(o) + "</div></article>";
}
// The form, for a new event (o null) or one of yours. What you type is a draft until you save, as with the journal.
function ownCatOptionsHTML(sel) {
  var opt = function (v, text) { return '<option value="' + esc(v) + '"' + (v === sel ? " selected" : "") + ">" + esc(text) + "</option>"; };
  return opt("", "No category") + '<optgroup label="Culture Crew’s">' + OWN_CATALOG.map(function (c) { return opt("c:" + c, c); }).join("") + "</optgroup>" +
    (OWN_CATS.length ? '<optgroup label="Yours">' + OWN_CATS.map(function (c) { return opt("o:" + c.id, c.name); }).join("") + "</optgroup>" : "") +
    (OWN_CATS.length < 20 ? opt("new", "New category…") : "");
}
function ownValues(o) {
  var key = o ? String(o.id) : "new";
  if (OWN_DRAFT[key]) return OWN_DRAFT[key];
  return o ? { title: o.title, date: o.date, venue: o.venue, cat: o.category_id ? "o:" + o.category_id : o.category ? "c:" + o.category : "", newcat: "",
    words: o.words, review: o.review, recommend: o.recommend } : { title: "", date: isoDate(T), venue: "", cat: "", newcat: "", words: "", review: "", recommend: false };
}
function ownFormHTML(o) {
  var key = o ? String(o.id) : "new", v = ownValues(o), k = "of-" + esc(key), words = v.words ? v.words.split(" ") : [];
  return '<form class="journal-form own-form" data-own-form="' + esc(key) + '" novalidate>' +
    '<div class="fields">' +
    '<div class="field own-title"><label for="' + k + '-title">What was it?</label><input id="' + k + '-title" name="title" type="text" maxlength="' + OWN_TITLE_MAX + '" required autocomplete="off" value="' + esc(v.title) + '"></div>' +
    '<div class="field"><label for="' + k + '-date">When</label><input id="' + k + '-date" name="date" type="date" required min="1950-01-01" max="' + isoDate(add(T, 730)) + '" value="' + esc(v.date) + '"></div>' +
    '<div class="field"><label for="' + k + '-venue">Where (optional)</label><input id="' + k + '-venue" name="venue" type="text" maxlength="' + OWN_VENUE_MAX + '" autocomplete="off" value="' + esc(v.venue) + '"></div>' +
    '<div class="field"><label for="' + k + '-cat">Category (optional)</label><select id="' + k + '-cat" name="cat">' + ownCatOptionsHTML(v.cat) + "</select></div>" +
    '<div class="field"' + (v.cat === "new" ? "" : " hidden") + ' data-own-newcat><label for="' + k + '-newcat">Name your category</label><input id="' + k + '-newcat" name="newcat" type="text" maxlength="' + OWN_CAT_MAX + '" autocomplete="off" value="' + esc(v.newcat) + '"></div>' +
    "</div>" +
    '<fieldset class="field three-words"><legend>Three words (optional for now)</legend><div class="row">' + [0, 1, 2].map(function (i) {
      return '<input name="word" type="text" maxlength="' + WORD_MAX + '" autocomplete="off" spellcheck="true" aria-label="Word ' + (i + 1) + '" value="' + esc(words[i] || "") + '">';
    }).join("") + "</div></fieldset>" +
    '<div class="field"><label for="' + k + '-review">Your review (optional)</label><textarea id="' + k + '-review" name="review" rows="3" maxlength="' + REVIEW_MAX + '">' + esc(v.review) + "</textarea></div>" +
    '<label class="radio"><input type="checkbox" name="recommend"' + (v.recommend ? " checked" : "") + "> Would you recommend it?</label>" +
    '<p class="hint small">Only you can see this. It isn’t shared with your crews or anyone else.</p>' +
    (o ? "" : ownNewPhotoHTML()) +
    '<div class="row own-row">' + ownPhotoPickHTML(key, o ? !!o.photo_url : !!OWN_NEW_PHOTO) + // CC-248: the photo first, left of Save
    '<button class="btn" type="submit">' + (o ? "Save" : "Add it") + "</button>" + (o ? "" : '<button class="btn ghost" type="button" data-own-cancel>Cancel</button>') +
    '<span class="week-said" data-own-said role="status">' + esc(OWN_SAID[key] || "") + "</span></div>" +
    '<p class="week-error" role="alert" data-own-error></p></form>';
}
// Add a photo is a button beside Save; on a new event the photo waits (shown) and is sent once the event is added.
var OWN_NEW_PHOTO = null; // { blob, url } chosen on the Add an event form
function ownPhotoPickHTML(key, has) {
  var k = "op-" + esc(key);
  return '<label class="btn ghost own-photo-btn" for="' + k + '">' + (has ? "Change photo" : "Add a photo") + "</label>" +
    '<input class="own-photo-in" id="' + k + '" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" data-own-photo="' + esc(key) + '">';
}
function ownNewPhotoHTML() {
  return OWN_NEW_PHOTO ? '<figure class="journal-photo"><img src="' + esc(OWN_NEW_PHOTO.url) + '" alt="The photo you chose"><figcaption>Sent when you add the event.</figcaption></figure>' : "";
}
function ownPhotoHTML(o) {
  var id = esc(o.id);
  return (o.photo_url ? '<figure class="journal-photo"><img src="' + esc(API + o.photo_url) + '" alt="Your photo from ' + esc(o.title) + '"></figure>' : "") +
    '<div class="card-actions wk-acts own-acts">' +
    (o.photo_url ? '<button type="button" class="went" data-own-photo-remove="' + id + '">Remove photo</button>' : "") +
    '<button type="button" class="went" data-own-delete="' + id + '">Delete this event</button></div>' +
    '<p class="week-error" role="alert" data-own-photo-error="' + id + '"></p>';
}
function ownDropNewPhoto() { if (OWN_NEW_PHOTO) URL.revokeObjectURL(OWN_NEW_PHOTO.url); OWN_NEW_PHOTO = null; }
// Above the lists: Add an event (its form opens in place) and Your categories (rename or delete them).
function ownBarHTML() {
  var adding = OWN_OPEN === "new";
  return '<div class="own-bar"><button type="button" class="btn ghost" data-own-open="new" aria-expanded="' + adding + '">Add an event</button>' +
    '<button type="button" class="week-tbtn" data-own-cats aria-expanded="' + OWN_CATS_OPEN + '" aria-controls="own-cats">Your categories</button>' +
    '<p class="hint small own-bar-hint">For anything that isn’t in the catalog. Only you see it.</p></div>' +
    (OWN_CATS_OPEN ? ownCatsHTML() : "") +
    (adding ? '<article class="journal-entry own open" data-own="new" aria-labelledby="of-new-h"><h2 class="own-new-h" id="of-new-h" tabindex="-1">Add an event</h2>' + ownFormHTML(null) + "</article>" : "");
}
function ownCatsHTML() {
  var rows = OWN_CATS.map(function (c) {
    var id = esc(c.id);
    return '<li class="own-cat"><form class="own-cat-f" data-own-cat="' + id + '" novalidate><label class="sr-only" for="oc-' + id + '">Name</label>' +
      '<input id="oc-' + id + '" name="name" type="text" maxlength="' + OWN_CAT_MAX + '" value="' + esc(c.name) + '">' +
      '<button class="week-tbtn" type="submit">Rename</button><button class="week-tbtn" type="button" data-own-cat-delete="' + id + '">Delete</button>' +
      '<span class="hint small">' + esc(plural(c.events, "event", "events")) + "</span></form></li>";
  }).join("");
  return '<section class="own-cats" id="own-cats" aria-label="Your categories">' +
    (rows ? '<ul class="own-cat-list">' + rows + "</ul>" : '<p class="week-hint">No categories of your own yet. Choose New category… when you add an event.</p>') +
    '<p class="week-error" role="alert" id="own-cats-error"></p></section>';
}
function readOwnForm(form) {
  var words = Array.prototype.map.call(form.querySelectorAll('input[name="word"]'), function (w) { return w.value.trim(); }).filter(Boolean);
  var el = form.elements;
  return { title: el.title.value, date: el.date.value, venue: el.venue.value, cat: el.cat.value, newcat: el.newcat.value,
    words: words.join(" "), review: el.review.value, recommend: el.recommend.checked, n: words.length };
}
function ownFocus(sel) { var el = document.querySelector(sel); if (el) el.focus(); }
document.addEventListener("click", function (ev) {
  var t = ev.target.closest && ev.target.closest("[data-own-open],[data-own-cancel],[data-own-cats],[data-own-delete],[data-own-photo-remove],[data-own-cat-delete],[data-own-go]");
  if (!t) return;
  if (t.hasAttribute("data-own-go")) { ev.preventDefault(); OWN_OPEN = t.getAttribute("data-own-go"); JOURNAL_OPEN = ""; openJournal(); ownFocus('[data-own="' + OWN_OPEN + '"] input[name="title"]'); return; }
  if (t.hasAttribute("data-own-cats")) { OWN_CATS_OPEN = !OWN_CATS_OPEN; renderJournal(); ownFocus("[data-own-cats]"); return; }
  if (t.hasAttribute("data-own-cancel")) { delete OWN_DRAFT["new"]; ownDropNewPhoto(); OWN_OPEN = null; JOURNAL_OPEN = ""; renderJournal(); ownFocus('[data-own-open="new"]'); return; }
  if (t.hasAttribute("data-own-open")) {
    var id = t.getAttribute("data-own-open"), opening = t.getAttribute("aria-expanded") !== "true";
    OWN_OPEN = opening ? id : null; JOURNAL_OPEN = ""; OWN_SAID = {}; renderJournal();
    ownFocus(opening ? (id === "new" ? "#of-new-h" : '[data-own="' + id + '"] input[name="title"]') : '[data-own-open="' + id + '"]');
    return;
  }
  if (t.hasAttribute("data-own-delete")) {
    var o = ownById(t.getAttribute("data-own-delete")); if (!o) return;
    if (!window.confirm("Delete “" + o.title + "” from your journal? Your notes and photo for it go too.")) return;
    t.disabled = true;
    api("/me/own-events/" + encodeURIComponent(o.id), { method: "DELETE" }).then(function (r) {
      if (!r.ok) throw r;
      OWN_LIST = OWN_LIST.filter(function (x) { return x.id !== o.id; }); delete OWN_DRAFT[o.id]; OWN_OPEN = null;
      OWN_CATS.forEach(function (c) { if (c.id === o.category_id) c.events -= 1; });
      $("edit-live").textContent = "Deleted " + o.title + " from your journal.";
      renderJournal(); ownFocus('[data-own-open="new"]');
    }).catch(function (r) { t.disabled = false; document.querySelector('[data-own-photo-error="' + o.id + '"]').textContent = checkThis(errorText(r && r.status ? r : null)); });
    return;
  }
  if (t.hasAttribute("data-own-photo-remove")) {
    var p = ownById(t.getAttribute("data-own-photo-remove")); if (!p) return;
    t.disabled = true;
    api("/me/own-events/" + encodeURIComponent(p.id) + "/photo", { method: "DELETE" }).then(readJSON).then(function (res) {
      if (!res.ok) throw res;
      ownReplace(res.body); $("edit-live").textContent = "Photo removed."; renderJournal(); ownFocus('[data-own="' + p.id + '"] .own-photo-in');
    }).catch(function (r) { t.disabled = false; document.querySelector('[data-own-photo-error="' + p.id + '"]').textContent = checkThis(errorText(r && r.status ? r : null)); });
    return;
  }
  if (t.hasAttribute("data-own-cat-delete")) {
    var c = OWN_CATS.filter(function (x) { return String(x.id) === t.getAttribute("data-own-cat-delete"); })[0]; if (!c) return;
    var note = c.events === 1 ? " 1 of your events is in it. It stays in your journal, with no category." :
      c.events ? " " + c.events + " of your events are in it. They stay in your journal, with no category." : "";
    if (!window.confirm("Delete your category “" + c.name + "”?" + note)) return;
    t.disabled = true;
    api("/me/categories/" + encodeURIComponent(c.id), { method: "DELETE" }).then(function (r) {
      if (!r.ok) throw r;
      OWN_CATS = OWN_CATS.filter(function (x) { return x.id !== c.id; });
      OWN_LIST.forEach(function (o) { if (o.category_id === c.id) { o.category_id = null; o.category_name = ""; } });
      $("edit-live").textContent = "Deleted your category " + c.name + ".";
      renderJournal(); ownFocus("[data-own-cats]");
    }).catch(function (r) { t.disabled = false; $("own-cats-error").textContent = checkThis(errorText(r && r.status ? r : null)); });
  }
});
function ownReplace(o) {
  var i = OWN_LIST.map(function (x) { return x.id; }).indexOf(o.id);
  if (i >= 0) OWN_LIST[i] = o; else OWN_LIST.push(o);
  ownSort();
}
document.addEventListener("input", function (ev) {
  var form = ev.target.closest && ev.target.closest("[data-own-form]"); if (!form) return;
  if (ev.target.name === "word" && /\s/.test(ev.target.value)) ev.target.value = ev.target.value.replace(/\s+/g, ""); // one word a box
  var key = form.getAttribute("data-own-form");
  OWN_DRAFT[key] = readOwnForm(form); delete OWN_SAID[key]; form.querySelector("[data-own-said]").textContent = "";
  if (ev.target.getAttribute("aria-invalid")) crewMarkInvalid(ev.target, false);
});
document.addEventListener("change", function (ev) {
  var form = ev.target.closest && ev.target.closest("[data-own-form]");
  if (form && !ev.target.hasAttribute("data-own-photo")) {
    OWN_DRAFT[form.getAttribute("data-own-form")] = readOwnForm(form);
    if (ev.target.name === "cat") { var box = form.querySelector("[data-own-newcat]"); box.hidden = ev.target.value !== "new"; if (!box.hidden) form.elements.newcat.focus(); }
    return;
  }
  var input = ev.target.closest && ev.target.closest("[data-own-photo]"); if (!input) return;
  var key = input.getAttribute("data-own-photo"), o = ownById(key), file = input.files && input.files[0], err = form.querySelector("[data-own-error]");
  if (!file || (!o && key !== "new")) return;
  err.textContent = "";
  if (file.size > PHOTO_MAX_ORIGINAL) { err.textContent = checkThis("that photo is over 5 MB. Choose a smaller one."); return; }
  if (key === "new") { // kept until the event is added
    OWN_DRAFT["new"] = readOwnForm(form);
    shrinkPhoto(file).then(function (blob) {
      ownDropNewPhoto(); OWN_NEW_PHOTO = { blob: blob, url: URL.createObjectURL(blob) };
      $("edit-live").textContent = "Photo ready. It\u2019s sent when you add the event."; renderJournal(); ownFocus("#op-new");
    }, function () { err.textContent = checkThis("this browser can\u2019t open that kind of photo. Try a JPEG or PNG."); });
    return;
  }
  $("edit-live").textContent = "Sending your photo…";
  shrinkPhoto(file).then(function (blob) {
    return api("/me/own-events/" + encodeURIComponent(o.id) + "/photo", { method: "PUT", raw: blob }).then(readJSON);
  }, function () { throw { shrink: true }; }).then(function (res) {
    if (unconfirmed(res)) { confirmFirst(err); return; }
    if (!res.ok) { err.textContent = checkThis(errorText(res)); return; }
    ownReplace(res.body); $("edit-live").textContent = "Photo added."; renderJournal(); ownFocus('[data-own="' + o.id + '"] .own-photo-in');
  }).catch(function (x) { err = document.querySelector('[data-own-form="' + key + '"] [data-own-error]') || err; err.textContent = checkThis(x && x.shrink ? "this browser can’t open that kind of photo. Try a JPEG or PNG." : errorText(null)); });
});
document.addEventListener("submit", function (ev) {
  var catForm = ev.target.closest && ev.target.closest("[data-own-cat]");
  if (catForm) {
    ev.preventDefault();
    var cid = catForm.getAttribute("data-own-cat"), name = catForm.elements.name.value.replace(/\s+/g, " ").trim();
    if (!name) { $("own-cats-error").textContent = checkThis("give your category a name."); catForm.elements.name.focus(); return; }
    api("/me/categories/" + encodeURIComponent(cid), { method: "PUT", body: { name: name } }).then(readJSON).then(function (res) {
      if (!res.ok) { $("own-cats-error").textContent = checkThis(errorText(res)); return; }
      OWN_CATS = OWN_CATS.map(function (c) { return c.id === res.body.id ? res.body : c; });
      OWN_LIST.forEach(function (o) { if (o.category_id === res.body.id) o.category_name = res.body.name; });
      $("edit-live").textContent = "Renamed it " + res.body.name + "."; renderJournal(); ownFocus("#oc-" + cid);
    }, function () { $("own-cats-error").textContent = checkThis(errorText(null)); });
    return;
  }
  var form = ev.target.closest && ev.target.closest("[data-own-form]"); if (!form) return;
  ev.preventDefault();
  var key = form.getAttribute("data-own-form"), v = readOwnForm(form), err = form.querySelector("[data-own-error]"), btn = form.querySelector('button[type="submit"]');
  err.textContent = "";
  var bad = !v.title.trim() ? ["title", "give it a name."] : !v.date ? ["date", "choose the day."] : v.cat === "new" && !v.newcat.trim() ? ["newcat", "name your new category."] :
    v.n && v.n < 3 ? ["word", "give all three words, or none for now."] : null;
  if (bad) { var f = bad[0] === "word" ? Array.prototype.filter.call(form.querySelectorAll('input[name="word"]'), function (w) { return !w.value.trim(); })[0] : form.elements[bad[0]]; crewMarkInvalid(f, true); err.textContent = checkThis(bad[1]); f.focus(); return; }
  btn.disabled = true;
  var madeCat = false;
  var made = v.cat !== "new" ? Promise.resolve(null) : api("/me/categories", { method: "POST", body: { name: v.newcat } }).then(readJSON).then(function (res) {
    if (!res.ok) throw res;
    OWN_CATS.push(res.body); OWN_CATS.sort(function (a, b) { return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1; });
    madeCat = true; v.cat = "o:" + res.body.id; if (OWN_DRAFT[key]) { OWN_DRAFT[key].cat = v.cat; OWN_DRAFT[key].newcat = ""; }
    return res.body;
  });
  made.then(function () {
    var body = { title: v.title, date: v.date, venue: v.venue, words: v.words, review: v.review, recommend: v.recommend,
      category: v.cat.indexOf("c:") === 0 ? v.cat.slice(2) : null, category_id: v.cat.indexOf("o:") === 0 ? Number(v.cat.slice(2)) : null };
    return api(key === "new" ? "/me/own-events" : "/me/own-events/" + encodeURIComponent(key), { method: key === "new" ? "POST" : "PUT", body: body }).then(readJSON);
  }).then(function (res) {
    btn.disabled = false;
    if (!res.ok) throw res;
    var was = key === "new" ? null : ownById(key);
    OWN_CATS.forEach(function (c) { if (was && c.id === was.category_id) c.events -= 1; if (c.id === res.body.category_id) c.events += 1; });
    ownReplace(res.body); delete OWN_DRAFT[key];
    if (key === "new") {
      var added = res.body, photo = OWN_NEW_PHOTO; OWN_NEW_PHOTO = null;
      OWN_OPEN = null; $("edit-live").textContent = "Added " + added.title + " to your journal" + (ownComing(added) ? ". It’s in My week on its day." : ".");
      renderJournal(); ownFocus('[data-own-open="' + added.id + '"]'); pulse(document.querySelector('[data-own="' + added.id + '"]') || document.body);
      if (photo) api("/me/own-events/" + encodeURIComponent(added.id) + "/photo", { method: "PUT", raw: photo.blob }).then(readJSON).then(function (r2) {
        URL.revokeObjectURL(photo.url);
        if (r2.ok) { ownReplace(r2.body); renderJournal(); return; }
        OWN_OPEN = String(added.id); renderJournal(); // open it, so the photo can be tried again from there
        var e3 = document.querySelector('[data-own-form="' + added.id + '"] [data-own-error]');
        if (e3) { if (unconfirmed(r2)) confirmFirst(e3); else e3.textContent = checkThis("the event was added, but its photo wasn\u2019t: " + errorText(r2)); }
      }, function () { URL.revokeObjectURL(photo.url); });
    } else { OWN_SAID[key] = "Saved."; renderJournal(); ownFocus('[data-own-form="' + key + '"] button[type="submit"]'); }
  }).catch(function (res) {
    btn.disabled = false;
    var msg = checkThis(errorText(res && res.status ? res : null));
    if (madeCat) renderJournal(); // the new category is in the list now, chosen
    var e2 = document.querySelector('[data-own-form="' + key + '"] [data-own-error]'); if (e2) e2.textContent = msg;
  });
});
// My week: an own event still to come shows on its day, a row that opens it in the journal.
function ownWeekRowHTML(o) {
  var id = esc(o.id);
  return '<li class="wk-row own" data-own-day="' + id + '"><a class="wk-row-a" href="#journal" data-own-go="' + id + '">' + ownTileHTML(o, false) +
    '<span class="listing-t">' + esc(o.title) + "</span>" + '<span class="wk-where">' + esc(o.venue || "") + "</span>" +
    '<span class="wk-when"><span>Added by you</span></span></a></li>';
}

// ---------- My week page (CC-105; renamed in CC-118) ----------
// The week ahead, on its own page (#planner). Signed out, a word on what it's for and a way to sign in that comes back here.
var AFTER_SIGN_IN = null; // where to go once signed in: "crews", "planner", "journal", "submit", "e/<id>" or "home"
function openPlanner() { renderPlannerPage(); show("planner"); }
function renderPlannerPage() {
  var u = AUTH.user;
  $("planner-signin").hidden = !!u; $("planner-main").hidden = !u;
  if (u) renderPlanner();
}
$("planner-signin-btn").addEventListener("click", function () { signInFrom("planner"); });
// CC-159: the Cultural Journal, on its own page (#journal), from the you menu and My week's line to it. Signed out,
// the same: a word on what it's for and a sign-in that comes back here.
function openJournal() { renderJournalPage(); show("journal"); }
function renderJournalPage() {
  var u = AUTH.user;
  $("journal-signin").hidden = !!u; $("journal-main").hidden = !u;
  if (u) renderJournal();
}
$("journal-signin-btn").addEventListener("click", function () { signInFrom("journal"); });

// ---------- your name in the header, and its menu (CC-105) ----------
// Signed in, the header shows your name (or "Your account"); it opens a menu: Crews, My week, Cultural journal (CC-159), Invite a friend, Account
// settings, Sign out. Arrow keys, Home and End move through it; Escape or Tab closes it and returns to your name.
// CC-137: on a phone the menu sits in the masthead's sheet instead, as a plain list under your name. CC-242: your name
// is a bar there that opens and shuts the list (sheetBar, util.js).
function meName() { var n = AUTH.user && (AUTH.user.display_name || "").trim(); return n || "Your account"; }
function paintMeMenu() {
  var u = AUTH.user, b = $("nav-account");
  $("me-name").textContent = u ? meName() : "Sign in";
  b.querySelector(".me-caret").toggleAttribute("hidden", !u); // an SVG has no .hidden property
  if (u) { b.setAttribute("aria-haspopup", "menu"); b.setAttribute("aria-controls", "me-menu"); b.setAttribute("aria-expanded", "false"); }
  else { b.removeAttribute("aria-haspopup"); b.removeAttribute("aria-controls"); b.removeAttribute("aria-expanded"); }
  closeMeMenu(false);
  paintMeMode();
}
function meInSheet() { return MAST_PHONE.matches && !!AUTH.user; }
function paintMeMode() {
  var sheet = meInSheet(), menu = $("me-menu");
  $("nav-account").hidden = sheet;
  $("me-head").hidden = !sheet; $("me-head-name").textContent = sheet ? meName() : "";
  menu.setAttribute("role", sheet ? "group" : "menu");
  menu.setAttribute("aria-labelledby", sheet ? "me-head-name" : "nav-account");
  meItems().forEach(function (it) { // in the sheet each item is a plain button that Tab reaches
    if (sheet) { it.removeAttribute("role"); it.removeAttribute("tabindex"); } else { it.setAttribute("role", "menuitem"); it.setAttribute("tabindex", "-1"); }
  });
  moveStop(menu); menu.hidden = true; $("me-head").setAttribute("aria-expanded", "false"); // CC-242: the bar starts shut
  if (!sheet && AUTH.user) $("nav-account").setAttribute("aria-expanded", "false");
}
MAST_PHONE.addEventListener("change", paintMeMode);
function meItems() { return Array.prototype.slice.call($("me-menu").querySelectorAll("[data-me]")); }
function openMeMenu(at) {
  var menu = $("me-menu"); menu.style.right = ""; $("nav-account").setAttribute("aria-expanded", "true");
  dropOpen(menu, function () {
    var r = menu.getBoundingClientRect(), edge = 16; // on a phone your name can sit at the left: keep the menu on screen
    if (r.left < edge) menu.style.right = (r.left - edge) + "px";
    var items = meItems(); items[at === "last" ? items.length - 1 : 0].focus();
  });
}
function closeMeMenu(refocus) {
  if ($("me-menu").hidden || meInSheet()) return;
  dropClose($("me-menu")); $("nav-account").setAttribute("aria-expanded", "false");
  if (refocus) $("nav-account").focus();
}
$("nav-account").addEventListener("click", function () {
  if (!AUTH.user) { openAccount(); return; }
  if ($("me-menu").hidden) openMeMenu(); else closeMeMenu(true);
});
$("nav-account").addEventListener("keydown", function (ev) {
  if (!AUTH.user) return;
  if (ev.key === "ArrowDown" || ev.key === "ArrowUp") { ev.preventDefault(); openMeMenu(ev.key === "ArrowUp" ? "last" : "first"); }
});
$("me-menu").addEventListener("keydown", function (ev) {
  if (meInSheet()) return;
  var items = meItems(), i = items.indexOf(document.activeElement);
  var to = ev.key === "ArrowDown" ? (i + 1) % items.length : ev.key === "ArrowUp" ? (i - 1 + items.length) % items.length :
    ev.key === "Home" ? 0 : ev.key === "End" ? items.length - 1 : -1;
  if (to >= 0) { ev.preventDefault(); items[to].focus(); return; }
  if (ev.key === "Escape") { ev.preventDefault(); closeMeMenu(true); }
  else if (ev.key === "Tab") closeMeMenu(false);
});
$("me-menu").addEventListener("click", function (ev) {
  var b = ev.target.closest("[data-me]"); if (!b) return;
  var go = b.getAttribute("data-me"); closeMeMenu(false); closeMastSheet(false);
  if (go === "account") openAccount(); else if (go === "crews") openCrews(); else if (go === "planner") openPlanner(); else if (go === "journal") openJournal();
  else if (go === "invite") inviteFriend(); else signOut();
});
// CC-115: invite a friend to the site: the phone's share sheet, or the link to copy. Tagged so these visits
// show up as "invite" on Site stats. Only the public site link: crew invite links stay with their crew.
var INVITE_TAGS = "?utm_source=invite&utm_medium=referral&utm_campaign=friend";
var INVITE_TEXT = "I use Culture Crew to find Chicago theater, music and art, and to go out with friends. Come see what's on:";
// CC-126: an admin's invite opens the invite page (/invite), tagged invite / link, or invite / qr for the code
function adminInviteUrl(medium) { return location.origin + "/invite?utm_source=invite&utm_medium=" + medium + "&utm_campaign=friend"; }
// CC-147: closing the dialog (or the QR screen after it) returns focus to what opened it. The you menu has closed by
// then, so that's your name, or the menu button on a phone, where the sheet has closed too.
var INVITE_FROM = null;
function inviteReturnFocus() {
  var el = INVITE_FROM; INVITE_FROM = null;
  if (!el || !el.isConnected || !el.getClientRects().length || el.closest("[inert]")) el = meInSheet() ? $("mast-burger") : $("nav-account");
  if (el && el.getClientRects().length) el.focus();
}
function inviteFriend() {
  var admin = isAdmin(), url = admin ? adminInviteUrl("link") : location.origin + "/" + INVITE_TAGS;
  if (navigator.share && !admin) { navigator.share({ title: "Culture Crew", text: INVITE_TEXT, url: url }).catch(function () {}); return; }
  // CC-126: admins choose: on a phone, Share the link or Show a QR code; elsewhere, Copy link or Show a QR code
  var share = admin && !!navigator.share;
  $("invite-share").hidden = !share; $("invite-copy").hidden = share; $("invite-qr").hidden = !admin;
  $("invite-hint").textContent = admin ? "This link opens a page that tells them why to join, with a sign-up box. On your phone, show them the QR code to scan." :
    "Send them this link. They can look around without an account, and sign up when they want to go out with you.";
  $("invite-url").value = url; $("invite-msg").textContent = "";
  INVITE_FROM = document.activeElement;
  openDialog($("invite-dialog"), meInSheet() ? $("mast-burger") : $("nav-account")); // the you menu has closed, so it goes back into your name
  if (share) { $("invite-url").scrollLeft = 0; $("invite-share").focus(); } else { $("invite-url").focus(); $("invite-url").select(); $("invite-url").scrollLeft = 0; } // CC-147: selected, showing its start
}
$("invite-share").addEventListener("click", function () {
  navigator.share({ title: "Culture Crew", text: INVITE_TEXT, url: $("invite-url").value }).catch(function () {});
});
// CC-126: the code fills the screen, made here in the browser (qrSvgText, admin.js), never by an outside service.
// The screen is kept awake while it shows, where the browser allows. CC-147: the code is deep lake ink on white.
var QR_WAKE = null;
$("invite-dialog").addEventListener("close", function () { if (!$("qr-full").open) inviteReturnFocus(); });
$("invite-qr").addEventListener("click", function () {
  $("qr-full-code").innerHTML = qrSvgText(adminInviteUrl("qr"), "#0E2A40");
  $("qr-full").querySelector(".qr-full-url").textContent = location.host + "/invite";
  $("qr-full").showModal(); $("invite-dialog").close(); $("qr-full-title").focus();
  try { if (navigator.wakeLock) navigator.wakeLock.request("screen").then(function (l) { QR_WAKE = l; }, function () {}); } catch (e) {}
});
$("qr-full-done").addEventListener("click", function () { $("qr-full").close(); });
$("qr-full").addEventListener("close", function () {
  if (QR_WAKE) { QR_WAKE.release().catch(function () {}); QR_WAKE = null; }
  $("qr-full-code").innerHTML = "";
  inviteReturnFocus();
});
$("invite-copy").addEventListener("click", function () {
  var field = $("invite-url"), msg = $("invite-msg");
  var fallback = function () { field.focus(); field.select(); msg.textContent = "Press Ctrl+C (or ⌘C) to copy the selected link."; };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(field.value).then(function () { msg.textContent = "Link copied."; pulse($("invite-copy")); }, fallback);
  else fallback();
});
document.addEventListener("click", function (ev) { if (!$("me-wrap").contains(ev.target)) closeMeMenu(false); });

// ---------- account (CC-148: Lakefront, design/lakefront-brief.md section 10) ----------
// Signed out: Sign in beside "New here? Make an account". Signed in: "Hi, name" and Sign out, then 7/5: your profile
// and password, beside the events you've sent us, your reports and photo approvals. Statuses are words, never pills.
// Errors are the pale red band starting "Check this:" (checkThis, crews.js), with the ink border on the field at fault.
var NOTICE_SET = false; // a one-off message (e.g. "email confirmed") showing instead of the usual notice
function openAccount(notice) {
  AFTER_SIGN_IN = null; // CC-237: only a prompt sets a way back (signInFrom), so one left over from earlier can't lead a plain sign-in astray
  NOTICE_SET = !!notice; $("account-notice").textContent = notice || "";
  renderAccount(true); show("account");
}
function signInFrom(place) { openAccount(); AFTER_SIGN_IN = place; } // a "sign in" prompt: back to that place afterwards
function renderAccount(withSubmissions) {
  var u = AUTH.user;
  $("signed-out").hidden = !!u; $("signed-in").hidden = !u;
  $("account-title").textContent = u ? (u.display_name ? "Hi, " + u.display_name : "Your account") : "Sign in";
  $("account-sub").hidden = !!u; $("account-who-row").hidden = !u; // signed in, who you are and Sign out take the deck's place
  paintJoin(); // an invite link's "Join <crew>" panel (crews.js), signed in or not
  if (!u) {
    PLANNER_WEEK = 0; $("planner-week").innerHTML = ""; $("myplans-grid").innerHTML = ""; $("went-grid").innerHTML = ""; $("my-submissions").innerHTML = ""; $("my-submissions-n").textContent = "";
    CREWS = []; CREW_LINKS = {}; CREW_ASK = null; CREW_EDIT = null; $("crew-list").innerHTML = "";
    return;
  }
  $("account-who").textContent = "Signed in as " + u.email + (u.role === "admin" ? " · admin" : "");
  if (!u.email_verified && !NOTICE_SET) {
    $("account-notice").innerHTML = "Please confirm your email address: open the link we sent to " + esc(u.email) +
      '. <button class="textbtn" type="button" id="verify-resend">Send a new link</button>';
  } else if (u.email_verified && !NOTICE_SET) {
    $("account-notice").textContent = "";
  }
  if (!withSubmissions) return;
  fillProfile();
  loadMyIssues(); // CC-84
  var list = $("my-submissions"), more = $("my-submissions-more");
  var failed = function (res) { list.innerHTML = '<li class="acct-none week-error">' + esc(checkThis(errorText(res))) + "</li>"; more.hidden = true; };
  if (!list.children.length) list.innerHTML = '<li class="acct-none" role="status">Finding the events you\u2019ve sent us\u2026</li>';
  api("/me/submissions").then(readJSON).then(function (res) {
    if (!res.ok) { failed(res); return; }
    var rows = res.body.map(fromApi);
    $("my-submissions-n").textContent = rows.length ? String(rows.length) : "";
    list.innerHTML = rows.length ? rows.map(sentRowHTML).join("") : '<li class="acct-none">Nothing yet. Tell us about something we\u2019re missing.</li>';
    more.hidden = false; more.textContent = rows.length ? "Send us another \u2192" : "Send us an event \u2192";
    capList(list, 5, plural(rows.length, "event you've sent us", "events you've sent us") + ", newest first. Scroll for more."); // CC-87
  }, function () { failed(null); });
}
// An event you've sent us, as a row: its type, name (linked to its own site) and where and when, with its status in
// words: Approved, "Goes up Nov 15, 7:00 PM" when it's scheduled, Waiting for review, Not accepted or Withdrawn.
function sentStateText(e) {
  if (e.status === "approved" && e.publishAt && e.publishAt > new Date()) return "Goes up " + WHEN.format(e.publishAt);
  return { approved: "Approved", pending: "Waiting for review", rejected: "Not accepted", withdrawn: "Withdrawn" }[e.status] || e.status;
}
function sentRowHTML(e) {
  var when = datesToLookUp(e) ? "Dates to look up" : e.b || e.n ? dateText(e) : "Dates not given";
  return acctRowHTML(e.label, e.url ? '<a href="' + esc(safeUrl(e.url)) + '" target="_blank" rel="noopener">' + esc(e.title) + "</a>" : esc(e.title),
    placeText(e) + " \u00b7 " + when, sentStateText(e), e.status === "withdrawn" || e.status === "rejected");
}
// One row on the account page's right-hand side: a small line above (k), the name (t, as HTML), a line under (m),
// and the status word (st), muted when it's finished with. extra: HTML under the row, such as our note on a report.
function acctRowHTML(k, t, m, st, quiet, extra) {
  return '<li class="acct-row"><span class="acct-row-main">' + (k ? '<span class="acct-row-k">' + esc(k) + "</span>" : "") +
    '<span class="acct-row-t">' + t + "</span>" + (m ? '<span class="acct-row-m">' + esc(m) + "</span>" : "") + "</span>" +
    '<span class="acct-row-s' + (quiet ? " quiet" : "") + '">' + esc(st) + "</span>" + (extra || "") + "</li>";
}
// A form's error: the band starting "Check this:", and the ink border on the field at fault (focused), if there is one
function acctBad(errEl, input, text) {
  errEl.textContent = checkThis(text);
  if (input) { crewMarkInvalid(input, true); input.focus(); }
}
// CC-191: the server refuses a new password that's too common (or too long) as a 422 on the password field. Those
// errors go on the password box itself, so it's clear which box to change. Returns the words, or null for other errors.
function passwordRefused(res) {
  var d = res && res.status === 422 && res.body && res.body.detail, loc = Array.isArray(d) && d[0] && d[0].loc;
  if (!loc || ["password", "new_password"].indexOf(loc[loc.length - 1]) < 0) return null;
  var msg = String(d[0].msg || "").replace(/^Value error, /, "");
  return msg.charAt(0).toUpperCase() + msg.slice(1) + ".";
}
function acctClear(form, errEl) { // typing in a form clears its error and the fields' borders
  errEl.textContent = "";
  Array.prototype.forEach.call(form.querySelectorAll('[aria-invalid="true"]'), function (i) { crewMarkInvalid(i, false); });
}
// ---------- profile (CC-40) ----------
function fillProfile() {
  $("p-name").value = AUTH.user.display_name || ""; $("p-email").value = AUTH.user.email; $("pw-user").value = AUTH.user.email; // pw-user: password managers know whose password it is
  $("p-password").value = ""; $("p-password-field").hidden = true; acctClear($("profile-form"), $("profile-error")); $("profile-msg").textContent = "";
  clearPasswordForm(); acctClear($("password-form"), $("password-error")); $("password-msg").textContent = "";
}
function emailChanged() { return $("p-email").value.trim().toLowerCase() !== AUTH.user.email; }
$("profile-form").addEventListener("input", function () {
  acctClear(this, $("profile-error")); $("profile-msg").textContent = "";
  $("p-password-field").hidden = !emailChanged();
});
$("profile-form").addEventListener("submit", function (ev) {
  ev.preventDefault();
  var err = $("profile-error"), msg = $("profile-msg"), email = $("p-email").value.trim();
  var body = { display_name: $("p-name").value.trim() };
  if (emailChanged()) {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { acctBad(err, $("p-email"), "Enter a full email address."); return; }
    if (!$("p-password").value) { acctBad(err, $("p-password"), "Enter your current password to change your email."); return; }
    body.email = email; body.current_password = $("p-password").value;
  }
  var btn = $("profile-btn"); btn.disabled = true; err.textContent = ""; msg.textContent = "Saving…";
  api("/auth/me", { method: "PATCH", body: body }).then(readJSON, function () { return null; }).then(function (res) {
    btn.disabled = false;
    if (!res || !res.ok) {
      msg.textContent = "";
      if (res && res.status === 403) { $("p-password").value = ""; acctBad(err, $("p-password"), errorText(res)); }
      else acctBad(err, res && res.status === 409 ? $("p-email") : null, errorText(res));
      return;
    }
    AUTH.user = res.body;
    renderAccount(false); fillProfile(); paintMeMenu(); // a new name shows in the header (CC-105)
    msg.textContent = "Saved."; pulse(btn);
  });
});
// ---------- email links, forgotten passwords (CC-44) ----------
// Links arrive as #verify=TOKEN or #reset=TOKEN. The fragment never reaches a server; it's
// taken off the address bar straight away so it doesn't linger in history or get shared.
function takeLinkToken(prefix) {
  var h = (location.hash || "").replace(/^#/, "");
  if (h.indexOf(prefix + "=") !== 0) return null;
  try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
  return h.slice(prefix.length + 1);
}
// The link opens a page with a button rather than confirming straight away: mail scanners
// (Outlook, Gmail, Proofpoint…) open every link in an email, but they don't press buttons.
var VERIFY_TOKEN = null;
function openVerify(token) {
  VERIFY_TOKEN = token; $("verify-error").textContent = ""; $("verify-btn").disabled = false;
  show("verify", "verify-btn");
}
$("verify-btn").addEventListener("click", function () {
  if (!VERIFY_TOKEN) return;
  this.disabled = true; confirmEmail(VERIFY_TOKEN); VERIFY_TOKEN = null;
});
function confirmEmail(token) {
  openAccount("Confirming your email address…");
  api("/auth/verify-email", { method: "POST", body: { token: token } }).then(readJSON, function () { return null; }).then(function (res) {
    if (!res || !res.ok) {
      openAccount((res && res.status === 400 ? "That confirmation link has expired or was already used." : errorText(res)) +
        (AUTH.user ? " You can send a new one below." : " Sign in to send a new one."));
      return;
    }
    openAccount("Thanks! Your email address is confirmed.");
    if (AUTH.user && AUTH.user.id === res.body.id) { AUTH.user = res.body; renderAccount(false); }
  });
}
var RESET_TOKEN = null;
function openReset(token) {
  RESET_TOKEN = token; AFTER_SIGN_IN = null; // CC-237: the reset's own message is what they see next
  $("reset-form").reset(); acctClear($("reset-form"), $("reset-error"));
  show("reset", "reset-new");
}
$("reset-form").addEventListener("input", function () { acctClear(this, $("reset-error")); });
$("reset-form").addEventListener("submit", function (ev) {
  ev.preventDefault();
  var err = $("reset-error"), next = $("reset-new").value, again = $("reset-confirm").value;
  var bad = next.length < 8 ? ["reset-new", "Use a password of at least 8 characters."] :
    next !== again ? ["reset-confirm", "The two passwords don't match."] : null;
  if (bad) { acctBad(err, $(bad[0]), bad[1]); return; }
  var btn = $("reset-btn"); btn.disabled = true;
  api("/auth/reset-password", { method: "POST", body: { token: RESET_TOKEN, new_password: next }, cookies: true })
    .then(readJSON, function () { return null; }).then(function (res) {
      btn.disabled = false;
      if (!res || !res.ok) {
        if (passwordRefused(res)) { acctBad(err, $("reset-new"), passwordRefused(res)); return; }
        err.textContent = checkThis(res && res.status === 400 ?
          "That reset link has expired or was already used. Ask for a new one from the sign-in page." : errorText(res));
        return;
      }
      RESET_TOKEN = null; $("reset-form").reset();
      setSession(res.body);
      openAccount("Your password has been changed and you're signed in. Any other devices have been signed out.");
    });
});
$("forgot-open").addEventListener("click", function () {
  var form = $("forgot-form"), open = form.hidden;
  this.setAttribute("aria-expanded", String(open));
  if (open) { $("forgot-email").value = $("login-email").value.trim(); $("forgot-msg").textContent = ""; }
  dropToggle(form, open, function () { $("forgot-email").focus(); });
});
$("forgot-form").addEventListener("input", function () { acctClear(this, $("forgot-error")); });
$("forgot-form").addEventListener("submit", function (ev) {
  ev.preventDefault();
  var email = $("forgot-email").value.trim(), err = $("forgot-error"), msg = $("forgot-msg");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { acctBad(err, $("forgot-email"), "Enter the email address you signed up with."); return; }
  var btn = $("forgot-btn"); btn.disabled = true; msg.textContent = "Sending…";
  api("/auth/forgot-password", { method: "POST", body: { email: email } }).then(readJSON, function () { return null; }).then(function (res) {
    btn.disabled = false;
    if (!res || !res.ok) { msg.textContent = ""; err.textContent = checkThis(errorText(res)); return; }
    msg.textContent = res.body.detail + " It expires in an hour."; pulse(btn);
  });
});
var RESEND_WAIT = 60; // seconds before "Send again" can be used, so a slow email isn't sent five times
function resendButton(label) { return ' <button class="textbtn" type="button" id="verify-resend">' + label + "</button>"; }
function resendCooldown() {
  var b = $("verify-resend"), left = RESEND_WAIT; if (!b) return;
  b.disabled = true; b.textContent = "Send again (" + left + "s)";
  var t = setInterval(function () {
    var cur = $("verify-resend");
    if (!cur) { clearInterval(t); return; }
    left -= 1;
    if (left > 0) { cur.textContent = "Send again (" + left + "s)"; return; }
    clearInterval(t); cur.disabled = false; cur.textContent = "Send again";
  }, 1000);
}
$("account-notice").addEventListener("click", function (ev) {
  var b = ev.target.closest("#verify-resend"); if (!b) return;
  b.disabled = true;
  api("/auth/verify-email/send", { method: "POST" }).then(readJSON, function () { return null; }).then(function (res) {
    NOTICE_SET = true;
    if (res && res.ok) {
      $("account-notice").innerHTML = esc(res.body.detail) + " It can take a few minutes, so check your junk folder too. Didn't get it?" +
        resendButton("Send again");
      resendCooldown(); pulse($("account-notice"));
    } else if (res && res.status === 400) { // confirmed in the meantime (e.g. on another device)
      $("account-notice").textContent = errorText(res) + ".";
      if (AUTH.user) AUTH.user.email_verified = true;
    } else {
      $("account-notice").innerHTML = esc(errorText(res)) + resendButton("Try again");
    }
  });
});

// CC-186: sharing, photos, reports, reading a link and suggesting an event need a confirmed address (in production).
// The API answers 403; say so where it happened, with the account page's "send a new link" right there.
function unconfirmed(res) { return !!(res && res.status === 403 && AUTH.user && !AUTH.user.email_verified); }
function confirmFirst(el) {
  el.innerHTML = "Confirm your email address first: open the link we sent to " + esc(AUTH.user.email) + "." +
    ' <button class="textbtn" type="button" data-verify-send>Send a new link</button>';
}
document.addEventListener("click", function (ev) {
  var b = ev.target.closest && ev.target.closest("[data-verify-send]"); if (!b) return;
  var box = b.parentNode; b.disabled = true;
  api("/auth/verify-email/send", { method: "POST" }).then(readJSON, function () { return null; }).then(function (res) {
    if (res && res.ok) { box.textContent = res.body.detail + " Open it, then try again. It can take a few minutes, so check your junk folder too."; pulse(box); }
    else if (res && res.status === 400) { box.textContent = errorText(res) + ". Try again now."; if (AUTH.user) AUTH.user.email_verified = true; }
    else { box.textContent = errorText(res); }
  });
});

// ---------- change password (CC-42) ----------
function clearPasswordForm() { ["pw-current", "pw-new", "pw-confirm"].forEach(function (id) { $(id).value = ""; }); }
$("password-form").addEventListener("input", function () { acctClear(this, $("password-error")); $("password-msg").textContent = ""; });
$("password-form").addEventListener("submit", function (ev) {
  ev.preventDefault();
  var err = $("password-error"), msg = $("password-msg");
  var current = $("pw-current").value, next = $("pw-new").value, again = $("pw-confirm").value;
  var bad = !current ? ["pw-current", "Enter your current password."] :
    next.length < 8 ? ["pw-new", "Use a new password of at least 8 characters."] :
    next !== again ? ["pw-confirm", "The two new passwords don't match."] :
    next === current ? ["pw-new", "The new password is the same as the current one."] : null;
  if (bad) { acctBad(err, $(bad[0]), bad[1]); return; }
  var btn = $("password-btn"); btn.disabled = true; err.textContent = ""; msg.textContent = "Changing…";
  api("/auth/password", { method: "POST", body: { current_password: current, new_password: next }, cookies: true, refreshable: true })
    .then(readJSON, function () { return null; }).then(function (res) {
      btn.disabled = false;
      if (!res || !res.ok) {
        msg.textContent = "";
        if (res && res.status === 403) { $("pw-current").value = ""; acctBad(err, $("pw-current"), errorText(res)); }
        else if (passwordRefused(res)) acctBad(err, $("pw-new"), passwordRefused(res));
        else err.textContent = checkThis(errorText(res));
        return;
      }
      setSession(res.body); // this tab's new session; every other one has been signed out
      clearPasswordForm();
      msg.textContent = "Password changed. You're signed out on your other devices."; pulse(btn);
    });
});
function authForm(form, path, body, errEl) {
  var btn = form.querySelector('button[type="submit"]');
  errEl.textContent = ""; btn.disabled = true;
  api(path, { method: "POST", body: body, cookies: true }).then(readJSON, function () { return null; }).then(function (res) {
    btn.disabled = false;
    if (!res || !res.ok) {
      if (passwordRefused(res)) { acctBad(errEl, form.querySelector('input[autocomplete="new-password"]'), passwordRefused(res)); return; }
      errEl.textContent = checkThis(errorText(res)); return;
    }
    form.reset();
    ["login", "register", "forgot"].forEach(function (f) { acctClear($(f + "-form"), $(f + "-error")); }); // nothing left over for next time
    // CC-237: an invite's Join panel and a one-off message (a confirmation link that failed, say) are on this page, so stay
    var stay = !!JOIN || NOTICE_SET;
    if (!stay) {
      AFTER_SIGN_IN = AFTER_SIGN_IN || "home";
      if (path === "/auth/register") JOINED_VIEW = viewOf("#" + AFTER_SIGN_IN);
    }
    setSession(res.body); // onAuthChange takes them on from here
    if (stay) { renderAccount(); $("account-title").focus(); }
  });
}
// CC-237: a new account no longer lands on the account page, so the word about confirming comes with it, on the view it
// lands on and only until they move on. Submit an event says it for itself (renderSubmit).
var JOINED_VIEW = null;
function paintJoinedNote(name) {
  var said = $("joined-note"), u = AUTH.user;
  said.hidden = name !== JOINED_VIEW || name === "submit" || !u || u.email_verified;
  said.innerHTML = said.hidden ? "" : 'Welcome! Check your email for a link to confirm your address. <button class="textbtn" type="button" data-verify-send>Send a new link</button>';
  if (name !== JOINED_VIEW) JOINED_VIEW = null;
}
// CC-121: a sign-up in a visit that came by the join page says so, with where that visit came from, so Site stats
// can count sign-ups by source. Only the source goes with it (never stored with the account), and not when visits
// aren't counted.
function registerBody(email, pw, name) {
  var body = { email: email, password: pw, display_name: name }, via = null;
  try { via = JSON.parse(sessionStorage.getItem("cc_join") || "null"); } catch (e) {}
  if (via && !COUNTING.off) body.join_source = via;
  return body;
}
function looksLikeEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
$("login-form").addEventListener("submit", function (ev) {
  ev.preventDefault();
  var email = $("login-email").value.trim(), pw = $("login-password").value;
  if (!looksLikeEmail(email)) { acctBad($("login-error"), $("login-email"), "Enter the email you signed up with."); return; }
  if (!pw) { acctBad($("login-error"), $("login-password"), "Enter your password."); return; }
  authForm(this, "/auth/login", { email: email, password: pw }, $("login-error"));
});
$("register-form").addEventListener("submit", function (ev) {
  ev.preventDefault();
  var email = $("reg-email").value.trim(), pw = $("reg-password").value;
  if (!looksLikeEmail(email)) { acctBad($("register-error"), $("reg-email"), "Enter a valid email address."); return; }
  if (pw.length < 8) { acctBad($("register-error"), $("reg-password"), "Use a password of at least 8 characters."); return; }
  authForm(this, "/auth/register", registerBody(email, pw, $("reg-name").value.trim()), $("register-error"));
});
["login", "register"].forEach(function (f) {
  $(f + "-form").addEventListener("input", function () { acctClear(this, $(f + "-error")); });
});
// Signing out (the account page's button, or the name menu): back to Sign in.
function signOut() {
  var b = $("sign-out"); b.disabled = true;
  return api("/auth/logout", { method: "POST", cookies: true }).catch(function () {}).then(function () {
    b.disabled = false; setSession(null); openAccount(); $("edit-live").textContent = "Signed out.";
  });
}
$("sign-out").addEventListener("click", signOut);
// CC-203: every session for the account ends at once, this tab's included, so it comes back to Sign in.
function signOutEverywhere() {
  var b = $("sign-out-everywhere"), err = $("everywhere-error"); b.disabled = true; err.textContent = "";
  api("/auth/logout-everywhere", { method: "POST", cookies: true, refreshable: true }).then(readJSON, function () { return null; }).then(function (res) {
    b.disabled = false;
    if (!res || !res.ok) { err.textContent = checkThis(errorText(res)); return; }
    setSession(null); openAccount("You're signed out on every device, this one too.");
  });
}
$("sign-out-everywhere").addEventListener("click", signOutEverywhere);

// ---------- the join page (CC-121) ----------
// chiculturecrew.com/join: one question, a sign-up box, and the catalog under it. Production serves a copy of the
// page there (with the join page's preview tags; scripts/stamp_assets.py). Arriving here marks the visit, for
// this tab, as one that came by the join page, so a sign-up later in it counts for the join page (registerBody).
// CC-126: chiculturecrew.com/invite is the same page with the admins' invite pitch, counted as the join page too.
if (onJoinPage()) { // before the events load, so Home doesn't show first
  $("view-home").hidden = true; $("view-join").hidden = false;
  if (location.pathname === "/invite") { $("jp-pitch").hidden = true; $("ip-pitch").hidden = false; }
  try { if (!sessionStorage.getItem("cc_join")) sessionStorage.setItem("cc_join", JSON.stringify(VISIT_SOURCE || {})); } catch (e) {}
}
function openJoinPage() { paintJoinPage(); renderCatalog(); show("join", $("ip-pitch").hidden ? null : "ip-title"); }
function paintJoinPage(justJoined) {
  var u = AUTH.user;
  $("jp-form").hidden = !!u; $("jp-in").hidden = !u;
  if (!u) return;
  var name = (u.display_name || "").trim();
  $("jp-in-title").textContent = justJoined ? (name ? "Welcome, " + name : "Welcome to the crew") : "You're already in";
  $("jp-in-text").textContent = justJoined ? "Check your email for a link to confirm your address. Then look around below, or let us find you an outing." :
    "You're signed in" + (name ? " as " + name : "") + ". Look around below, or let us find you an outing.";
}
$("jp-form").addEventListener("submit", function (ev) {
  ev.preventDefault();
  var form = this, email = $("jp-email").value.trim(), pw = $("jp-password").value, err = $("jp-error");
  // CC-147: an error is the pale red band, starting "Check this:", and the field at fault gets the ink border
  var bad = function (input, text) { crewMarkInvalid(input, true); err.textContent = checkThis(text); input.focus(); };
  if (!looksLikeEmail(email)) { bad($("jp-email"), "Enter a valid email address."); return; }
  if (pw.length < 8) { bad($("jp-password"), "Use a password of at least 8 characters."); return; }
  err.textContent = ""; $("jp-go").disabled = true;
  api("/auth/register", { method: "POST", body: registerBody(email, pw, $("jp-name").value.trim()), cookies: true })
    .then(readJSON, function () { return null; }).then(function (res) {
      $("jp-go").disabled = false;
      if (!res || !res.ok) { if (passwordRefused(res)) bad($("jp-password"), passwordRefused(res)); else err.textContent = checkThis(errorText(res)); return; }
      form.reset(); setSession(res.body); paintJoinPage(true); $("jp-in-title").focus();
    });
});
$("jp-form").addEventListener("input", function (ev) { $("jp-error").textContent = ""; crewMarkInvalid(ev.target, false); });
$("jp-signin").addEventListener("click", function () { openAccount(); $("login-email").focus(); });
