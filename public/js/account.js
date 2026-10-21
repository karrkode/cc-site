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
}
function onAuthChange() {
  showReportLink(); // "Report an issue or request a feature" in the footer, signed in only (CC-84; issues.js)
  paintApproverRow(); // Photo approvals, for approvers and admins (CC-91; approvals.js)
  paintMeMenu(); // your name and its menu, or Sign in (CC-105)
  $("nav-review").hidden = !isAdmin();
  WENT = {}; WENT_LIST = []; WENT_PHOTO = {}; WENT_JOURNAL = {}; JOURNAL_DRAFT = {}; MYPLANS = {}; MYPLAN_LIST = [];
  if (!AUTH.user) {
    NOTICE_SET = false; $("account-notice").textContent = "";
    if (visible("review") || visible("venues") || visible("stats") || visible("sources") || visible("found") || visible("issues")) show("home");
    if (visible("submit")) renderSubmit();
    CREWS = []; buildCrewFilter(); PENDING = []; paintPending(); $("my-issues-section").hidden = true;
    if ($("issue-dialog").open) $("issue-dialog").close();
    rerenderLists();
    if (visible("crews")) renderCrewsPage();
    if (visible("planner")) renderPlannerPage();
    return;
  }
  if (isAdmin()) updateReviewCount();
  var back = AFTER_SIGN_IN; AFTER_SIGN_IN = null; // signed in from the crews or planner page: back to it (CC-104, CC-105)
  if (back === "crews") openCrews(); else if (back === "planner") openPlanner();
  else if (visible("account")) renderAccount(true);
  if (visible("crews")) renderCrewsPage();
  if (visible("planner")) renderPlannerPage();
  if (visible("submit")) renderSubmit();
  if (visible("review")) renderReview();
  rerenderLists();
  loadWent(); loadMyPlans().then(rerenderLists);
  loadCrews().then(function () { buildCrewFilter(); rerenderLists(); }); // crews to share plans with (CC-75)
  loadPending(true); // crew invites waiting for you (CC-59): the notice on sign-in
  if (isAdmin()) updateIssuesCount();
}
function loadWent() {
  return api("/me/attended").then(readJSON).then(function (res) {
    if (!res.ok) return;
    WENT = {}; WENT_PHOTO = {}; WENT_JOURNAL = {}; WENT_LIST = res.body.map(function (row) {
      var e = toEvent(row.event); if (row.photo) WENT_PHOTO[e.id] = row.photo; // your photos (CC-76)
      WENT_JOURNAL[e.id] = { words: row.words || "", review: row.review || "", recommend: !!row.recommend }; // CC-98
      return e;
    });
    WENT_LIST.forEach(function (e) { WENT[e.id] = true; });
    rerenderLists();
  }, function () {});
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
    if (on) { WENT[id] = true; WENT_JOURNAL[id] = { words: "", review: "", recommend: false }; if (KNOWN[id]) WENT_LIST.unshift(KNOWN[id]); }
    else { delete WENT[id]; delete WENT_PHOTO[id]; delete WENT_JOURNAL[id]; delete JOURNAL_DRAFT[id]; WENT_LIST = WENT_LIST.filter(function (e) { return e.id !== id; }); } // its photo goes too (CC-76)
    if (on && MYPLANS[id]) { // been: the server cleared the plan, so the card moves from plans to gone (CC-63)
      delete MYPLANS[id];
      $("myplan-live").textContent = "Moved to your Cultural Journal: " + KNOWN[id].title;
    }
    // Redraw every copy of the card (home, catalog and account can all show it): marking it also takes
    // away the plan button, and un-marking brings it back.
    return redrawCards(id, b.closest("[data-card],[data-journal]"), "[data-went]");
  }).catch(function () { b.disabled = false; });
});

// ---------- your plans (CC-55) ----------
function loadMyPlans() {
  return api("/me/plans").then(readJSON).then(function (res) {
    if (!res.ok) return;
    MYPLANS = {}; MYPLAN_LIST = res.body.map(function (row) {
      var e = toEvent(row.event); MYPLANS[e.id] = { status: row.status, date: row.date, crews: row.crews || [] }; return e;
    });
  }, function () {});
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
  Array.prototype.forEach.call(document.querySelectorAll('[data-card="' + id + '"]'), function (c) { c.outerHTML = cardHTML(KNOWN[id]); });
  return loadMyPlans().then(function () {
    if (visible("account")) renderAccount();
    if (visible("planner")) renderPlannerPage();
    var item = '[data-card="' + id + '"],[data-day-item="' + id + '"],[data-journal="' + id + '"]', planner = PLANNER_LISTS.indexOf(listId) >= 0;
    var card = listId && $(listId) ? $(listId).querySelector(item) : null;
    if (!card && planner) card = $("myplans-title").parentElement.querySelector(item) || (WENT[id] ? $("went-grid").querySelector(item) : null); // moved within the planner, or to "I've been"
    var target = card ? card.querySelector(focusOn || "[data-myplan-toggle]") : planner ? $("myplans-title") : listId === "went-grid" ? $("journal-title") : null;
    if (target) target.focus();
  });
}
function saveMyPlan(id, body, panel) {
  var card = panel.closest("[data-card],[data-day-item]"), err = panel.querySelector(".form-error");
  var buttons = panel.querySelectorAll("button"); Array.prototype.forEach.call(buttons, function (b) { b.disabled = true; });
  err.textContent = "";
  var req = body ? api("/me/plans/" + encodeURIComponent(id) + "?today=" + isoDate(T), { method: "PUT", body: body })
                 : api("/me/plans/" + encodeURIComponent(id), { method: "DELETE" });
  req.then(readJSON).then(function (res) {
    if (!res.ok) throw res;
    if (body) MYPLANS[id] = { status: body.status, date: body.date || null, crews: (MYPLANS[id] && MYPLANS[id].crews) || [] }; else delete MYPLANS[id];
    $("myplan-live").textContent = myplanSaid(MYPLANS[id]) + ": " + KNOWN[id].title;
    return redrawCards(id, card);
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
  if (t.hasAttribute("data-myplan-set")) return saveMyPlan(t.getAttribute("data-myplan-set"), { status: "interested" }, box);
  if (t.hasAttribute("data-myplan-clear")) return saveMyPlan(t.getAttribute("data-myplan-clear"), null, box);
  var input = box.querySelector('input[type="date"]'), day = t.getAttribute("data-date") || (input && input.value);
  if (input && (!day || day < input.min || day > input.max)) {
    box.querySelector(".form-error").textContent = !day ? "Choose a date." :
      "Choose a date from " + goingDay(input.min) + " to " + goingDay(input.max) + ".";
    input.focus(); return;
  }
  saveMyPlan(t.getAttribute("data-myplan-going"), { status: "going", date: day }, box);
});
document.addEventListener("keydown", function (ev) { // Escape closes the picker and returns to its button
  if (ev.key !== "Escape") return;
  var box = ev.target.closest && ev.target.closest(".myplan"); if (!box) return;
  var toggle = document.querySelector('[aria-controls="' + box.id + '"]');
  if (toggle) { closeMyPlan(toggle); toggle.focus(); }
});

// ---------- Cultural Planner (CC-97) ----------
// The account page's week ahead, from today: each day lists the events you're going to that day, compactly;
// an empty day offers the catalog for just that day. Previous and Next step a week at a time (never before this
// week; at most two years out, as far as a plan can go), and "Skip to" jumps to the week of your next plan after
// the one showing. Interested plans, with no day yet, sit under Still deciding as full cards; so does a going plan
// for a day that's passed, where "I've been" is.
var PLANNER_LISTS = ["planner-week", "myplans-grid"], PLANNER_WEEK = 0, PLANNER_MAX = 104;
function dayTimesText(e, d) { // "7:30 PM", "Open 10 AM to 5 PM", or "" (planner.js knows the schedules)
  if (isExhibit(e)) { var h = hoursOn(e, d); return h && h[2] ? "Open " + clockText(h[0]) + " to " + clockText(h[1]) : ""; }
  return (timesOn(e, d) || []).filter(Boolean).map(clockText).join(" and ");
}
function dayItemHTML(e, d) {
  var times = dayTimesText(e, d);
  return '<li class="day-item" data-day-item="' + esc(e.id) + '">' +
    '<a href="' + esc(safeUrl(e.url)) + '" target="_blank" rel="noopener">' + esc(e.title) + "</a>" +
    '<span class="day-where">' + esc(placeText(e)) + "</span>" + (times ? '<span class="day-time">' + esc(times) + "</span>" : "") +
    '<div class="card-actions">' + myplanToggleHTML(e) + "</div>" + myplanHTML(e) + "</li>";
}
function goingAhead() { // your going plans from today on, soonest first: [{ e, n }] with n days from today
  return MYPLAN_LIST.map(function (e) {
    var mine = MYPLANS[e.id], d = mine && mine.status === "going" ? parseISO(mine.date) : null;
    return { e: e, n: d ? diff(d, T) : -1 };
  }).filter(function (x) { return x.n >= 0; }).sort(function (a, b) { return a.n - b.n; });
}
function renderPlanner() {
  var start = PLANNER_WEEK * 7, days = [], ahead = goingAhead();
  for (var i = 0; i < 7; i++) days.push({ d: add(T, start + i), items: [] });
  ahead.forEach(function (x) { if (x.n >= start && x.n < start + 7) days[x.n - start].items.push(x.e); });
  var deciding = MYPLAN_LIST.filter(function (e) { var mine = MYPLANS[e.id]; return !(mine && mine.status === "going" && parseISO(mine.date) >= T); });
  var next = ahead.filter(function (x) { return x.n >= start + 7; })[0];
  $("week-range").textContent = (PLANNER_WEEK === 0 ? "This week: " : "") + windowText(days[0].d, days[6].d);
  $("week-prev").disabled = PLANNER_WEEK === 0; $("week-next").disabled = PLANNER_WEEK >= PLANNER_MAX;
  $("week-now").hidden = PLANNER_WEEK === 0;
  $("week-skip").hidden = !next;
  if (next) $("week-skip").textContent = "Skip to your next plan: " + goingDay(MYPLANS[next.e.id].date);
  $("planner-week").innerHTML = days.map(function (day, i) {
    var now = same(day.d, T), label = (now ? "Today, " : "") + F.wmd.format(day.d), whole = dayName(day.d);
    return '<section class="day' + (now ? " today" : "") + '" aria-label="' + esc((now ? "Today, " : "") + whole) + '">' +
      '<h3 class="day-head">' + esc(label) + "</h3>" +
      (day.items.length ? '<ul class="day-items">' + day.items.map(function (e) { return dayItemHTML(e, day.d); }).join("") + "</ul>" :
        '<button type="button" class="btn ghost day-find" data-find-day="' + isoDate(day.d) + '" aria-label="Find something for ' + esc(whole) + '">Find something for that day!</button>') +
      "</section>";
  }).join("");
  $("deciding-wrap").hidden = !deciding.length; $("myplans-grid").innerHTML = deciding.map(cardHTML).join("");
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
// The catalog for just that day: When is a one-day range, and the other filters start fresh.
document.addEventListener("click", function (ev) {
  var b = ev.target.closest("[data-find-day]"); if (!b) return;
  var d = parseISO(b.getAttribute("data-find-day"));
  resetCatalog(); cat.when = "custom"; cat.custom = { ws: d, we: d };
  loadCatalog(); show("catalog");
});

// ---------- Cultural Journal (CC-98) ----------
// The five events you've been to most recently (older entries are kept, just not listed), each with three words
// (required to save, one a box), a review and "Would you recommend?" (both optional), all private to you, and your photo from it while it's
// waiting or approved. What you type is kept as a draft until you save, so the page redrawing doesn't lose it.
var JOURNAL_SHOWN = 5, REVIEW_MAX = 1000, REVIEW_COUNT_FROM = 800, WORD_MAX = 20; // three words: a box each, one word a box
function journalOf(id) { return JOURNAL_DRAFT[id] || WENT_JOURNAL[id] || { words: "", review: "", recommend: false }; }
function journalHasText(id) { var j = journalOf(id), s = WENT_JOURNAL[id] || {}; return !!(j.words || j.review || j.recommend || s.words || s.review || s.recommend); }
function reviewCountText(n) { return n >= REVIEW_COUNT_FROM ? (REVIEW_MAX - n) + " characters left" : ""; }
function journalEntryHTML(e) {
  var id = esc(e.id), j = journalOf(e.id), p = WENT_PHOTO[e.id], k = "j-" + id, words = j.words ? j.words.split(" ") : [];
  var photo = p && p.status !== "rejected" && p.url ? '<figure class="journal-photo"><img src="' + esc(API + p.url) + '" alt="Your photo from ' + esc(e.title) + '">' +
    (p.status === "approved" ? "" : '<figcaption class="pill">' + esc(PHOTO_STATES[p.status] || p.status) + "</figcaption>") + "</figure>" : "";
  return '<article class="journal-entry" data-journal="' + id + '" aria-labelledby="' + k + '-h">' + photo +
    '<div class="journal-body"><h3 id="' + k + '-h"><a href="' + esc(safeUrl(e.url)) + '" target="_blank" rel="noopener">' + esc(e.title) + "</a></h3>" +
    '<p class="where">' + placeHTML(e) + "</p>" +
    '<form class="journal-form" data-journal-form="' + id + '" novalidate>' +
    '<fieldset class="field three-words"><legend>Three words</legend><div class="row">' + [0, 1, 2].map(function (i) {
      return '<input name="word" type="text" maxlength="' + WORD_MAX + '" autocomplete="off" spellcheck="true" required aria-label="Word ' + (i + 1) + '" value="' + esc(words[i] || "") + '">';
    }).join("") + "</div></fieldset>" +
    '<div class="field"><label for="' + k + '-review">Your review</label><textarea id="' + k + '-review" name="review" rows="3" maxlength="' + REVIEW_MAX + '" aria-describedby="' + k + '-count">' + esc(j.review) + "</textarea>" +
    '<span class="hint small" id="' + k + '-count" aria-live="polite">' + esc(reviewCountText(j.review.length)) + "</span></div>" +
    '<label class="radio"><input type="checkbox" name="recommend"' + (j.recommend ? " checked" : "") + "> Would you recommend?</label>" +
    '<div class="row"><button class="btn" type="submit">Save</button><span class="hint small" data-journal-said role="status"></span></div>' +
    '<p class="form-error" role="alert"></p></form>' +
    '<div class="card-actions">' + wentHTML(e) + photoButtonHTML(e) + "</div></div></article>";
}
function renderJournal() {
  var shown = WENT_LIST.slice(0, JOURNAL_SHOWN);
  $("went-grid").innerHTML = shown.length ? shown.map(journalEntryHTML).join("") :
    '<p class="hint">Mark events with "I\'ve been" and they\'ll show up here, ready for your notes.</p>';
}
// A photo that won't load (its 15-minute link ran out, or the file's gone) leaves no broken image: the entry just
// shows without it until the next reload.
document.addEventListener("error", function (ev) {
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
  if (ev.target.name === "review") $("j-" + id + "-count").textContent = reviewCountText(j.review.length);
});
document.addEventListener("change", function (ev) { // the checkbox: a draft too
  var form = ev.target.closest && ev.target.closest("[data-journal-form]"); if (form && ev.target.name === "recommend") JOURNAL_DRAFT[form.getAttribute("data-journal-form")] = readJournal(form);
});
document.addEventListener("submit", function (ev) {
  var form = ev.target.closest && ev.target.closest("[data-journal-form]"); if (!form) return;
  ev.preventDefault();
  var id = form.getAttribute("data-journal-form"), body = readJournal(form), err = form.querySelector(".form-error"), said = form.querySelector("[data-journal-said]");
  var btn = form.querySelector('button[type="submit"]');
  err.textContent = ""; said.textContent = "";
  var empty = Array.prototype.filter.call(form.querySelectorAll('input[name="word"]'), function (w) { return !w.value.trim(); })[0];
  if (empty) { err.textContent = "Three words: give all three to save your entry."; empty.focus(); return; } // CC-98: the words are required
  btn.disabled = true;
  api("/me/attended/" + encodeURIComponent(id) + "/journal", { method: "PUT", body: body }).then(readJSON).then(function (res) {
    btn.disabled = false;
    if (!res.ok) { err.textContent = errorText(res); return; }
    WENT_JOURNAL[id] = res.body; delete JOURNAL_DRAFT[id];
    form.elements.review.value = res.body.review; // as saved (trimmed)
    said.textContent = "Saved.";
  }, function () { btn.disabled = false; err.textContent = errorText(null); });
});

// ---------- Culture Planner page (CC-105) ----------
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
// Signed in, the header shows your name (or "Your account"); it opens a menu: Crews, Culture Planner, Account
// Settings, Sign out. Arrow keys, Home and End move through it; Escape or Tab closes it and returns to your name.
function meName() { var n = AUTH.user && (AUTH.user.display_name || "").trim(); return n || "Your account"; }
function paintMeMenu() {
  var u = AUTH.user, b = $("nav-account");
  $("me-name").textContent = u ? meName() : "Sign in";
  b.querySelector(".me-caret").toggleAttribute("hidden", !u); // an SVG has no .hidden property
  if (u) { b.setAttribute("aria-haspopup", "menu"); b.setAttribute("aria-controls", "me-menu"); b.setAttribute("aria-expanded", "false"); }
  else { b.removeAttribute("aria-haspopup"); b.removeAttribute("aria-controls"); b.removeAttribute("aria-expanded"); }
  closeMeMenu(false);
}
function meItems() { return Array.prototype.slice.call($("me-menu").querySelectorAll('[role="menuitem"]')); }
function openMeMenu(at) {
  var menu = $("me-menu"); menu.style.right = ""; menu.hidden = false; $("nav-account").setAttribute("aria-expanded", "true");
  var r = menu.getBoundingClientRect(), edge = 16; // on a phone your name can sit at the left: keep the menu on screen
  if (r.left < edge) menu.style.right = (r.left - edge) + "px";
  var items = meItems(); items[at === "last" ? items.length - 1 : 0].focus();
}
function closeMeMenu(refocus) {
  if ($("me-menu").hidden) return;
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
  var items = meItems(), i = items.indexOf(document.activeElement);
  var to = ev.key === "ArrowDown" ? (i + 1) % items.length : ev.key === "ArrowUp" ? (i - 1 + items.length) % items.length :
    ev.key === "Home" ? 0 : ev.key === "End" ? items.length - 1 : -1;
  if (to >= 0) { ev.preventDefault(); items[to].focus(); return; }
  if (ev.key === "Escape") { ev.preventDefault(); closeMeMenu(true); }
  else if (ev.key === "Tab") closeMeMenu(false);
});
$("me-menu").addEventListener("click", function (ev) {
  var b = ev.target.closest("[data-me]"); if (!b) return;
  var go = b.getAttribute("data-me"); closeMeMenu(false);
  if (go === "account") openAccount(); else if (go === "crews") openCrews(); else if (go === "planner") openPlanner(); else signOut();
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
  authForm(this, "/auth/register", { email: email, password: pw, display_name: $("reg-name").value.trim() }, $("register-error"));
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
