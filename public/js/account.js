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
  if (visible("event")) loadEventView(); // CC-117: signed in or out, the crews' plans change
}
function onAuthChange() {
  showReportLink(); // "Report an issue or request a feature" in the footer, signed in only (CC-84; issues.js)
  paintApproverRow(); // Photo approvals, for approvers and admins (CC-91; approvals.js)
  paintMeMenu(); // your name and its menu, or Sign in (CC-105)
  $("nav-review").hidden = !isAdmin();
  WENT = {}; WENT_LIST = []; WENT_PHOTO = {}; WENT_JOURNAL = {}; JOURNAL_DRAFT = {}; WENT_SHARE = {}; MYPLANS = {}; MYPLAN_LIST = [];
  PLANS_STATE = "loading"; WENT_STATE = "loading"; JOURNAL_OPEN = null; // CC-146: My week waits for them
  if (!AUTH.user) {
    NOTICE_SET = false; $("account-notice").textContent = "";
    if (visible("review") || visible("venues") || visible("stats") || visible("sources") || visible("found") || visible("issues")) show("home");
    if (visible("submit")) renderSubmit();
    CREWS = []; buildCrewFilter(); PENDING = []; paintPending(); $("my-issues-section").hidden = true;
    if ($("issue-dialog").open) $("issue-dialog").close();
    rerenderLists();
    if (visible("crews")) renderCrewsPage();
    if (visible("planner")) renderPlannerPage();
    if (visible("join")) paintJoinPage(); // CC-121
    return;
  }
  if (isAdmin()) updateReviewCount();
  var back = AFTER_SIGN_IN; AFTER_SIGN_IN = null; // signed in from the crews or planner page: back to it (CC-104, CC-105)
  if (back === "crews") openCrews(); else if (back === "planner") openPlanner();
  else if (back && back.indexOf("e/") === 0) openEvent(back.slice(2), false); // signed in from an event (CC-117)
  else if (visible("account")) renderAccount(true);
  if (visible("join") && $("jp-in").hidden) paintJoinPage(); // CC-121 (just joined: the welcome stays)
  if (visible("crews")) renderCrewsPage();
  if (visible("planner")) renderPlannerPage();
  if (visible("submit")) renderSubmit();
  if (visible("review")) renderReview();
  rerenderLists();
  loadHome(); // CC-143: the lead pick's deck and the rows' crew lines need your crews' plans
  loadWent(); loadMyPlans().then(rerenderLists);
  loadCrews().then(function () { buildCrewFilter(); rerenderLists(); }); // crews to share plans with (CC-75)
  loadPending(true); // crew invites waiting for you (CC-59): the notice on sign-in
  if (isAdmin()) updateIssuesCount();
}
function loadWent() {
  return api("/me/attended").then(readJSON).then(function (res) {
    if (!res.ok) { if (WENT_STATE !== "ready") WENT_STATE = "error"; if (visible("planner")) renderPlannerPage(); return; }
    WENT_STATE = "ready";
    WENT = {}; WENT_PHOTO = {}; WENT_JOURNAL = {}; WENT_SHARE = {}; WENT_LIST = res.body.map(function (row) {
      var e = toEvent(row.event); if (row.photo) WENT_PHOTO[e.id] = row.photo; // your photos (CC-76)
      WENT_JOURNAL[e.id] = { words: row.words || "", review: row.review || "", recommend: !!row.recommend }; // CC-98
      WENT_SHARE[e.id] = { shared: !!row.shared, anonymous: !!row.anonymous }; // CC-112
      return e;
    });
    WENT_LIST.forEach(function (e) { WENT[e.id] = true; });
    rerenderLists();
  }, function () { if (WENT_STATE !== "ready") WENT_STATE = "error"; if (visible("planner")) renderPlannerPage(); });
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
    if (res.ok && res.body[0]) KNOWN[id].pick = fromApi(res.body[0]).pick; // the same object every list holds
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
    var item = '[data-card="' + id + '"],[data-day-item="' + id + '"],[data-journal="' + id + '"]', planner = PLANNER_LISTS.indexOf(listId) >= 0;
    var card = listId && $(listId) ? $(listId).querySelector(item) : null;
    if (!card && planner) card = $("planner-main").querySelector(item) || (WENT[id] ? $("went-grid").querySelector(item) : null); // moved within the planner, or to "I've been"
    var target = card ? card.querySelector(focusOn || "[data-myplan-toggle]") : planner ? $("myplans-title") : listId === "went-grid" ? $("journal-title") : null;
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
    return redrawCards(id, card, focusOn);
  }).catch(function (res) {
    Array.prototype.forEach.call(buttons, function (b) { b.disabled = false; });
    err.textContent = res && res.status ? errorText(res) : "Couldn't save your plan. Check your connection and try again.";
  });
}
function closeMyPlan(toggle) {
  var panel = $(toggle.getAttribute("aria-controls"));
  toggle.setAttribute("aria-expanded", "false"); if (panel) panel.hidden = true;
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
    t.setAttribute("aria-expanded", String(open)); panel.hidden = !open;
    if (open) panel.querySelector("button, input").focus();
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
// An event row: the tile, name, venue and time (with your dolphin) are one link to the event page; the buttons follow,
// since they can't sit inside a link. d is the day it's planned for; without one it's a Still deciding row.
function weekRowHTML(e, d) {
  var mine = MYPLANS[e.id] || {}, going = mine.status === "going", id = esc(e.id);
  var when = d ? dayTimesText(e, d) : going ? "Going " + goingDay(mine.date) : dateText(e);
  var own = AUTH.user.dolphins ? "" : markHTML(going ? "going" : "interested", going ? "You're going" : "You're interested"); // an owner's own plan is their ring (CC-139)
  var acts = d ? myplanToggleHTML(e) + crewShareToggleHTML(e, "Tell a crew") : // the toggles first: their pickers take the same number
    myplanToggleHTML(e, goingRange(e) ? "Pick a day" : "Change plan") + wentHTML(e) + crewShareToggleHTML(e, "Tell a crew"); // closed: no day left to pick
  return '<li class="wk-row" data-day-item="' + id + '"><a class="wk-row-a" href="#e/' + id + '" data-ev-open="' + id + '">' +
    '<span class="tile water-field' + catClass(e.type) + '">' + waterHTML(e, "tile") + '<span class="tile-k">' + esc(e.label) + "</span></span>" +
    '<span class="listing-t">' + esc(e.title) + (e.pick ? markHTML("host", pickText(e.pick)) : "") + "</span>" +
    '<span class="wk-where">' + esc(placeText(e)) + "</span>" +
    '<span class="wk-when">' + (when ? "<span>" + esc(when) + "</span>" : "") + own + "</span></a>" +
    weekCrewHTML(e) + '<div class="card-actions wk-acts">' + acts + "</div>" + myplanHTML(e) + crewShareHTML(e) + "</li>";
}
// One day: its name, then its plans as rows, or "Nothing yet…" and Find something (the list opens under it).
function weekDayHTML(day) {
  var now = same(day.d, T), whole = (now ? "Today, " : "") + dayName(day.d), iso = isoDate(day.d);
  return '<section class="wk-day' + (now ? " today" : "") + '" aria-label="' + esc(whole) + '">' +
    '<div class="wk-day-h"><h3 class="wk-day-t">' + esc((now ? "Today, " : "") + listingDay(day.d)) + "</h3>" +
    (day.items.length ? "" : '<span class="wk-none">Nothing yet\u2026</span>' + dayFindHTML(iso, dayName(day.d))) + "</div>" +
    (day.items.length ? '<ul class="wk-rows">' + day.items.map(function (e) { return weekRowHTML(e, day.d); }).join("") + "</ul>" :
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
  for (var i = 0; i < 7; i++) days.push({ d: add(T, start + i), items: [] });
  ahead.forEach(function (x) { if (x.n >= start && x.n < start + 7) days[x.n - start].items.push(x.e); });
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
  $("week-n").textContent = ready ? plural(planned, "plan", "plans") : "";
  $("deciding-n").textContent = ready ? String(deciding.length) : "";
  $("planner-week").innerHTML = !ready ? "" : days.map(weekDayHTML).join("") +
    (ahead.length ? "" : '<p class="week-hint">Commit to a day on any event and it shows up here.</p>');
  days.forEach(function (day) { paintFindDay(isoDate(day.d)); });
  $("myplans-grid").innerHTML = ready ? deciding.map(function (e) { return weekRowHTML(e); }).join("") : "";
  $("deciding-hint").textContent = !ready ? "" : deciding.some(goingRange) ? "Pick a day for one, and it moves into your week." : deciding.length ? "" :
    "Nothing waiting. Mark an event Interested, and it waits here until you pick a day.";
  paintWater($("planner-main"));
}
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
function dayFoundHTML(iso) { // what's in the open list: loading, an error, nothing, or that day's events
  var d = parseISO(iso), got = FIND_DAY[iso];
  if (!got || got.loading) return '<p class="week-hint">Finding events\u2026</p>';
  if (got.error) return '<p class="week-error">' + esc(checkThis("the events couldn\u2019t be loaded. Check your connection and try again.")) + "</p>";
  if (!got.items.length) return '<p class="week-hint">Nothing on the list for that day.</p><p class="week-hint"><a href="#catalog" data-find-catalog>Browse the catalog</a></p>';
  return '<div class="day-scroll"><ul class="day-items">' + got.items.slice(0, FIND_DAY_SHOWN).map(function (e) {
    var times = dayTimesText(e, d), id = esc(e.id);
    return '<li class="day-item"><a href="#e/' + id + '" data-ev-open="' + id + '">' + esc(e.title) + "</a>" +
      '<span class="day-where">' + esc(placeText(e)) + "</span>" + (times ? '<span class="day-time">' + esc(times) + "</span>" : "") + "</li>";
  }).join("") + "</ul>" + (got.items.length > FIND_DAY_SHOWN ? '<p class="week-hint"><a href="#catalog" data-find-catalog="' + iso + '">See more for that day in the catalog</a></p>' : "") + "</div>";
}
function dayFindHTML(iso, whole) { // the button on the day's line; weekDayHTML puts its list under the line
  return '<button type="button" class="week-tbtn day-find" data-find-day="' + iso + '" data-whole="' + esc(whole) + '" aria-controls="find-' + iso + '"></button>';
}
function paintFindDay(iso) { // the button says what it does next; the list shows when it's open
  var b = document.querySelector('[data-find-day="' + iso + '"]'), box = $("find-" + iso); if (!b || !box) return;
  var open = !!FIND_DAY_OPEN[iso];
  b.setAttribute("aria-expanded", String(open));
  b.textContent = open ? "Hide that day\u2019s events" : "Find something \u2192";
  b.setAttribute("aria-label", (open ? "Hide the events for " : "Find something for ") + b.getAttribute("data-whole"));
  box.hidden = !open; box.innerHTML = open ? dayFoundHTML(iso) : "";
  fitFindDay(box);
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
    loadCatalog(); show("catalog"); return;
  }
  var b = ev.target.closest("[data-find-day]"); if (!b) return;
  var iso = b.getAttribute("data-find-day");
  if (FIND_DAY_OPEN[iso]) { delete FIND_DAY_OPEN[iso]; paintFindDay(iso); return; }
  FIND_DAY_OPEN[iso] = true;
  if (!FIND_DAY[iso] || FIND_DAY[iso].error) findDay(iso).then(function () { paintFindDay(iso); });
  paintFindDay(iso);
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
  if (!open) return '<article class="journal-entry" data-journal="' + id + '" aria-labelledby="' + k + '-h">' + head + "</article>";
  var photo = hasPhoto ? '<figure class="journal-photo"><img src="' + esc(API + p.url) + '" alt="Your photo from ' + esc(e.title) + '">' +
    (photoState ? "<figcaption>" + esc(photoState) + "</figcaption>" : "") + "</figure>" : "";
  return '<article class="journal-entry open" data-journal="' + id + '" aria-labelledby="' + k + '-h">' + head +
    '<div class="journal-body">' +
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
    if (!res.ok) document.querySelector('[data-share="' + id + '"] [data-share-error]').textContent = errorText(res);
  }, function () { redrawShare(id, focusName); document.querySelector('[data-share="' + id + '"] [data-share-error]').textContent = errorText(null); });
});
function renderJournal() {
  var shown = WENT_LIST.slice(0, JOURNAL_SHOWN), open = journalOpenId(shown);
  $("went-grid").innerHTML = shown.length ? shown.map(function (e) { return journalEntryHTML(e, e.id === open); }).join("") :
    WENT_STATE === "loading" ? '<p class="week-hint" role="status">Finding your journal\u2026</p>' :
    WENT_STATE === "error" ? '<p class="week-error" role="alert">' + esc(checkThis("your journal couldn\u2019t be loaded. Reload the page to try again.")) + "</p>" :
    '<p class="week-hint">Mark events with \u201cI\u2019ve been\u201d and they\u2019ll show up here, ready for your notes.</p>';
  paintWater($("went-grid"));
}
// Edit (or Write) opens an entry and folds the one that was open; Close folds it. What you'd typed stays as a draft.
document.addEventListener("click", function (ev) {
  var b = ev.target.closest && ev.target.closest("[data-journal-open]"); if (!b) return;
  var id = b.getAttribute("data-journal-open"), opening = b.getAttribute("aria-expanded") !== "true";
  JOURNAL_OPEN = opening ? id : ""; renderJournal();
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
    if (first) redrawShare(id); // CC-112: now it can be shared
  }, function () { btn.disabled = false; err.textContent = checkThis(errorText(null)); });
});

// ---------- My week page (CC-105; renamed in CC-118) ----------
// The week ahead and the Cultural Journal, on their own page (#planner). Signed out, a word on what it's for and a
// way to sign in that comes back here.
var AFTER_SIGN_IN = null; // "crews" or "planner": where to go once signed in from there
function openPlanner() { renderPlannerPage(); show("planner"); }
function renderPlannerPage() {
  var u = AUTH.user;
  $("planner-signin").hidden = !!u; $("planner-main").hidden = !u;
  if (u) { renderPlanner(); renderJournal(); }
}
$("planner-signin-btn").addEventListener("click", function () { AFTER_SIGN_IN = "planner"; openAccount(); });

// ---------- your name in the header, and its menu (CC-105) ----------
// Signed in, the header shows your name (or "Your account"); it opens a menu: Crews, My week, Invite a friend, Account
// settings, Sign out. Arrow keys, Home and End move through it; Escape or Tab closes it and returns to your name.
// CC-137: on a phone the menu sits open in the masthead's sheet instead, as a plain list under your name.
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
  $("me-head").hidden = !sheet; $("me-head").textContent = sheet ? meName() : "";
  menu.setAttribute("role", sheet ? "group" : "menu");
  menu.setAttribute("aria-labelledby", sheet ? "me-head" : "nav-account");
  meItems().forEach(function (it) { // in the sheet each item is a plain button that Tab reaches
    if (sheet) { it.removeAttribute("role"); it.removeAttribute("tabindex"); } else { it.setAttribute("role", "menuitem"); it.setAttribute("tabindex", "-1"); }
  });
  menu.hidden = !sheet;
  if (!sheet && AUTH.user) $("nav-account").setAttribute("aria-expanded", "false");
}
MAST_PHONE.addEventListener("change", paintMeMode);
function meItems() { return Array.prototype.slice.call($("me-menu").querySelectorAll("[data-me]")); }
function openMeMenu(at) {
  var menu = $("me-menu"); menu.style.right = ""; menu.hidden = false; $("nav-account").setAttribute("aria-expanded", "true");
  var r = menu.getBoundingClientRect(), edge = 16; // on a phone your name can sit at the left: keep the menu on screen
  if (r.left < edge) menu.style.right = (r.left - edge) + "px";
  var items = meItems(); items[at === "last" ? items.length - 1 : 0].focus();
}
function closeMeMenu(refocus) {
  if ($("me-menu").hidden || meInSheet()) return;
  $("me-menu").hidden = true; $("nav-account").setAttribute("aria-expanded", "false");
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
  if (go === "account") openAccount(); else if (go === "crews") openCrews(); else if (go === "planner") openPlanner();
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
  if (!el || !el.isConnected || !el.getClientRects().length) el = meInSheet() ? $("mast-burger") : $("nav-account");
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
  $("invite-dialog").showModal();
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
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(field.value).then(function () { msg.textContent = "Link copied."; }, fallback);
  else fallback();
});
document.addEventListener("click", function (ev) { if (!$("me-wrap").contains(ev.target)) closeMeMenu(false); });

// ---------- account ----------
var NOTICE_SET = false; // a one-off message (e.g. "email confirmed") showing instead of the usual notice
function openAccount(notice) {
  NOTICE_SET = !!notice; $("account-notice").textContent = notice || "";
  renderAccount(true); show("account");
}
function renderAccount(withSubmissions) {
  var u = AUTH.user;
  $("signed-out").hidden = !!u; $("signed-in").hidden = !u;
  $("account-eyebrow").textContent = u ? "Account settings" : "Your account";
  $("account-title").textContent = u ? (u.display_name ? "Hi, " + u.display_name : "Your account") : "Sign in";
  $("account-sub").textContent = u ? "Your profile and password, the events you've sent us, and your reports." :
    "Keep a list of what you've seen, and send us events we're missing.";
  paintJoin(); // an invite link's "Join <crew>" panel (crews.js), signed in or not
  if (!u) {
    PLANNER_WEEK = 0; $("planner-week").innerHTML = ""; $("myplans-grid").innerHTML = ""; $("went-grid").innerHTML = ""; $("my-submissions").innerHTML = "";
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
  api("/me/submissions").then(readJSON).then(function (res) {
    if (!res.ok) return;
    var rows = res.body.map(fromApi);
    $("my-submissions").innerHTML = rows.length ? rows.map(function (e) { return queueItemHTML(e, stateHTML(e)); }).join("") :
      '<p class="hint">Nothing yet. <button class="textbtn" type="button" data-go="submit">Submit an event</button></p>';
    capList($("my-submissions"), 5, plural(rows.length, "event you've sent us", "events you've sent us") + ", newest first. Scroll for more."); // CC-87
  }, function () {});
}
// ---------- profile (CC-40) ----------
function fillProfile() {
  $("p-name").value = AUTH.user.display_name || ""; $("p-email").value = AUTH.user.email;
  $("p-password").value = ""; $("p-password-field").hidden = true; $("profile-error").textContent = ""; $("profile-msg").textContent = "";
  clearPasswordForm(); $("password-error").textContent = ""; $("password-msg").textContent = "";
}
function emailChanged() { return $("p-email").value.trim().toLowerCase() !== AUTH.user.email; }
$("profile-form").addEventListener("input", function () {
  $("profile-error").textContent = ""; $("profile-msg").textContent = "";
  $("p-password-field").hidden = !emailChanged();
});
$("profile-form").addEventListener("submit", function (ev) {
  ev.preventDefault();
  var err = $("profile-error"), msg = $("profile-msg"), email = $("p-email").value.trim();
  var body = { display_name: $("p-name").value.trim() };
  if (emailChanged()) {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { err.textContent = "Enter a full email address."; $("p-email").focus(); return; }
    if (!$("p-password").value) { err.textContent = "Enter your current password to change your email."; $("p-password").focus(); return; }
    body.email = email; body.current_password = $("p-password").value;
  }
  var btn = $("profile-btn"); btn.disabled = true; err.textContent = ""; msg.textContent = "Saving…";
  api("/auth/me", { method: "PATCH", body: body }).then(readJSON, function () { return null; }).then(function (res) {
    btn.disabled = false;
    if (!res || !res.ok) {
      msg.textContent = ""; err.textContent = errorText(res);
      if (res && res.status === 403) { $("p-password").value = ""; $("p-password").focus(); }
      else if (res && res.status === 409) $("p-email").focus();
      return;
    }
    AUTH.user = res.body;
    renderAccount(false); fillProfile(); paintMeMenu(); // a new name shows in the header (CC-105)
    msg.textContent = "Saved.";
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
  RESET_TOKEN = token;
  $("reset-form").reset(); $("reset-error").textContent = "";
  show("reset", "reset-new");
}
$("reset-form").addEventListener("input", function () { $("reset-error").textContent = ""; });
$("reset-form").addEventListener("submit", function (ev) {
  ev.preventDefault();
  var err = $("reset-error"), next = $("reset-new").value, again = $("reset-confirm").value;
  var bad = next.length < 8 ? ["reset-new", "Use a password of at least 8 characters."] :
    next !== again ? ["reset-confirm", "The two passwords don't match."] : null;
  if (bad) { err.textContent = bad[1]; $(bad[0]).focus(); return; }
  var btn = $("reset-btn"); btn.disabled = true;
  api("/auth/reset-password", { method: "POST", body: { token: RESET_TOKEN, new_password: next }, cookies: true })
    .then(readJSON, function () { return null; }).then(function (res) {
      btn.disabled = false;
      if (!res || !res.ok) {
        err.textContent = res && res.status === 400 ?
          "That reset link has expired or was already used. Ask for a new one from the sign-in page." : errorText(res);
        return;
      }
      RESET_TOKEN = null; $("reset-form").reset();
      setSession(res.body);
      openAccount("Your password has been changed and you're signed in. Any other devices have been signed out.");
    });
});
$("forgot-open").addEventListener("click", function () {
  var form = $("forgot-form"), open = form.hidden;
  form.hidden = !open; this.setAttribute("aria-expanded", String(open));
  if (open) { $("forgot-email").value = $("login-email").value.trim(); $("forgot-msg").textContent = ""; $("forgot-email").focus(); }
});
$("forgot-form").addEventListener("input", function () { $("forgot-error").textContent = ""; });
$("forgot-form").addEventListener("submit", function (ev) {
  ev.preventDefault();
  var email = $("forgot-email").value.trim(), err = $("forgot-error"), msg = $("forgot-msg");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { err.textContent = "Enter the email address you signed up with."; $("forgot-email").focus(); return; }
  var btn = $("forgot-btn"); btn.disabled = true; msg.textContent = "Sending…";
  api("/auth/forgot-password", { method: "POST", body: { email: email } }).then(readJSON, function () { return null; }).then(function (res) {
    btn.disabled = false;
    if (!res || !res.ok) { msg.textContent = ""; err.textContent = errorText(res); return; }
    msg.textContent = res.body.detail + " It expires in an hour.";
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
      resendCooldown();
    } else if (res && res.status === 400) { // confirmed in the meantime (e.g. on another device)
      $("account-notice").textContent = errorText(res) + ".";
      if (AUTH.user) AUTH.user.email_verified = true;
    } else {
      $("account-notice").innerHTML = esc(errorText(res)) + resendButton("Try again");
    }
  });
});

// ---------- change password (CC-42) ----------
function clearPasswordForm() { ["pw-current", "pw-new", "pw-confirm"].forEach(function (id) { $(id).value = ""; }); }
$("password-form").addEventListener("input", function () { $("password-error").textContent = ""; $("password-msg").textContent = ""; });
$("password-form").addEventListener("submit", function (ev) {
  ev.preventDefault();
  var err = $("password-error"), msg = $("password-msg");
  var current = $("pw-current").value, next = $("pw-new").value, again = $("pw-confirm").value;
  var bad = !current ? ["pw-current", "Enter your current password."] :
    next.length < 8 ? ["pw-new", "Use a new password of at least 8 characters."] :
    next !== again ? ["pw-confirm", "The two new passwords don't match."] :
    next === current ? ["pw-new", "The new password is the same as the current one."] : null;
  if (bad) { err.textContent = bad[1]; $(bad[0]).focus(); return; }
  var btn = $("password-btn"); btn.disabled = true; err.textContent = ""; msg.textContent = "Changing…";
  api("/auth/password", { method: "POST", body: { current_password: current, new_password: next }, cookies: true, refreshable: true })
    .then(readJSON, function () { return null; }).then(function (res) {
      btn.disabled = false;
      if (!res || !res.ok) {
        msg.textContent = ""; err.textContent = errorText(res);
        if (res && res.status === 403) { $("pw-current").value = ""; $("pw-current").focus(); }
        return;
      }
      setSession(res.body); // this tab's new session; every other one has been signed out
      clearPasswordForm();
      msg.textContent = "Password changed. You're signed out on your other devices.";
    });
});
function authForm(form, path, body, errEl) {
  var btn = form.querySelector('button[type="submit"]');
  errEl.textContent = ""; btn.disabled = true;
  api(path, { method: "POST", body: body, cookies: true }).then(readJSON, function () { return null; }).then(function (res) {
    btn.disabled = false;
    if (!res || !res.ok) { errEl.textContent = errorText(res); return; }
    form.reset();
    setSession(res.body);
    renderAccount();
    $("account-title").focus();
  });
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
  if (!looksLikeEmail(email)) { $("login-error").textContent = "Enter the email you signed up with."; $("login-email").focus(); return; }
  if (!pw) { $("login-error").textContent = "Enter your password."; $("login-password").focus(); return; }
  authForm(this, "/auth/login", { email: email, password: pw }, $("login-error"));
});
$("register-form").addEventListener("submit", function (ev) {
  ev.preventDefault();
  var email = $("reg-email").value.trim(), pw = $("reg-password").value;
  if (!looksLikeEmail(email)) { $("register-error").textContent = "Enter a valid email address."; $("reg-email").focus(); return; }
  if (pw.length < 8) { $("register-error").textContent = "Use a password of at least 8 characters."; $("reg-password").focus(); return; }
  authForm(this, "/auth/register", registerBody(email, pw, $("reg-name").value.trim()), $("register-error"));
});
["login", "register"].forEach(function (f) {
  $(f + "-form").addEventListener("input", function () { $(f + "-error").textContent = ""; });
});
// Signing out (the account page's button, or the name menu): back to Sign in.
function signOut() {
  var b = $("sign-out"); b.disabled = true;
  return api("/auth/logout", { method: "POST", cookies: true }).catch(function () {}).then(function () {
    b.disabled = false; setSession(null); openAccount(); $("edit-live").textContent = "Signed out.";
  });
}
$("sign-out").addEventListener("click", signOut);

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
      if (!res || !res.ok) { err.textContent = checkThis(errorText(res)); return; }
      form.reset(); setSession(res.body); paintJoinPage(true); $("jp-in-title").focus();
    });
});
$("jp-form").addEventListener("input", function (ev) { $("jp-error").textContent = ""; crewMarkInvalid(ev.target, false); });
$("jp-signin").addEventListener("click", function () { openAccount(); $("login-email").focus(); });
