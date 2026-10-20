// Culture Crew site: Shared helpers: dates, the event shape, DOM helpers and switching views.
// Loaded by index.html in order (core, util, catalog, planner, account, submit, admin, start); they share one
// global scope, so anything declared here is visible to the files after it.
"use strict";
var PAGE_URL = "";
var DAY = 86400000;

// ---------- dates ----------
function parseISO(s) { if (!s) return null; var p = s.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
function today() { var n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); }
function add(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
function same(a, b) { return !!a && !!b && a.getTime() === b.getTime(); }
function diff(a, b) { return Math.round((a - b) / DAY); }
function ymd(d) { return "" + d.getFullYear() + ("0" + (d.getMonth() + 1)).slice(-2) + ("0" + d.getDate()).slice(-2); }
function fromYmd(s) { return new Date(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)); }
var T = today();
var F = {
  md: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }),
  mdy: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }),
  wmd: new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" }),
  full: new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }),
  fully: new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }),
  wd: new Intl.DateTimeFormat("en-US", { weekday: "long" }),
  month: new Intl.DateTimeFormat("en-US", { month: "long" }),
  monthY: new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }),
  long: new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" })
};
function short(d) { return d.getFullYear() === T.getFullYear() ? F.md.format(d) : F.mdy.format(d); }
function dayName(d) { return d.getFullYear() === T.getFullYear() ? F.full.format(d) : F.fully.format(d); }
function windowText(ws, we) {
  if (same(ws, we)) return dayName(ws);
  if (ws.getMonth() === we.getMonth() && ws.getFullYear() === we.getFullYear()) {
    return F.month.format(ws) + " " + ws.getDate() + "–" + we.getDate() + (ws.getFullYear() === T.getFullYear() ? "" : ", " + ws.getFullYear());
  }
  return F.md.format(ws) + " – " + short(we);
}
function thisWeekend() {
  var dow = T.getDay();
  if (dow === 0) return [T, T];
  if (dow >= 5) return [T, add(T, 7 - dow)];
  var fri = add(T, 5 - dow);
  return [fri, add(fri, 2)];
}
function nextWeekend() { var fri = add(thisWeekend()[1], 5); return [fri, add(fri, 2)]; }

// ---------- events ----------
var TYPE_ORDER = ["Theater", "Comedy", "Concert", "Visual Art"];
var AREA_NAMES = { city: "City", suburbs: "Suburbs", out_of_town: "Out of town" };
// The page no longer downloads every event (CC-33): each view asks the API for what it shows.
// FACETS: the categories and neighborhoods in use, plus counts (GET /events/facets).
// CC-73: the sides of town, in the order Plan an outing and the catalog offer them.
var REGIONS = [["downtown", "Downtown/Loop"], ["north", "Northside"], ["west", "Westside"], ["south", "Southside"],
  ["suburbs", "Suburbs"], ["out_of_town", "Out of town"]];
var REGION_NAMES = {}; REGIONS.forEach(function (r) { REGION_NAMES[r[0]] = r[1]; });
// KNOWN: every event fetched so far, by id, for "I've been" buttons and outing swaps.
var FACETS = null, KNOWN = {}, TYPES = [];
// The API's event -> the shape the rest of this page was written for.
function fromApi(e) {
  return {
    id: String(e.id), sourceId: e.source_id, title: e.title, venue: e.venue.name, hood: e.venue.neighborhood,
    area: AREA_NAMES[e.venue.area] || "City", begin: e.begin_date, end: e.end_date, openRun: e.open_run,
    beginTbd: !e.begin_date, cost: e.cost_text || "TBD", min: e.min_price, type: e.category, url: e.url,
    venueId: e.venue.id, costRaw: e.cost_text, // for the admin edit form (CC-56)
    status: e.status, publishAt: e.publish_at ? new Date(e.publish_at) : null,
    submitter: e.submitted_by, // only the admin routes send this (undefined elsewhere; null = none on record)
    creditMe: !!e.credit_me, suggestedBy: e.submitted_by_name || null, // the opt-in "Suggested by" credit (CC-30)
    region: e.venue.region || null, // the side of town (CC-73)
    pick: e.pick ? { status: e.pick.status, date: e.pick.date, by: e.pick.by } : null, // the owner's public pick (CC-66)
    b: parseISO(e.begin_date), n: parseISO(e.end_date)
  };
}
function toEvent(raw) { var e = fromApi(raw); KNOWN[e.id] = e; return e; }
function isoDate(d) { return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
// Query string from [key, value] pairs (repeated keys allowed); empty values are left out.
function qs(pairs) {
  return pairs.filter(function (p) { return p[1] !== null && p[1] !== undefined && p[1] !== ""; })
    .map(function (p) { return encodeURIComponent(p[0]) + "=" + encodeURIComponent(p[1]); }).join("&");
}
// Every list asks with the visitor's own "today", so a Chicago evening isn't "tomorrow" on the server.
function fetchEvents(pairs) {
  return api("/events?" + qs([["include_past", "true"]].concat(pairs))).then(readJSON).then(function (res) {
    if (!res.ok) throw new Error(res.status);
    return { items: res.body.items.map(toEvent), total: res.body.total };
  });
}
function setFacets(f) {
  FACETS = f;
  TYPES = f.categories.slice();
  TYPES.sort(function (a, b) { var i = TYPE_ORDER.indexOf(a), j = TYPE_ORDER.indexOf(b); return (i < 0 ? 99 : i) - (j < 0 ? 99 : j) || a.localeCompare(b); });
}
var WENT = {}, WENT_LIST = [];
// Your plans (CC-55; "Oh the places you'll go" on the account page): MYPLANS[id] = { status: "interested" | "going", date: "YYYY-MM-DD" | null }.
var MYPLANS = {}, MYPLAN_LIST = [], MYPLAN_SEQ = 0;
var TYPE_PLURAL = { "Theater": "theater", "Comedy": "comedy", "Concert": "concerts", "Visual Art": "visual art" };

function isPast(e) { return !!e.n && e.n < T; }
function oneNight(e) { return same(e.b, e.n); }
function overlaps(e, ws, we) { return (!e.b || !we || e.b <= we) && (!e.n || !ws || e.n >= ws); }
function costOk(e, key) {
  if (key === "free") return e.min === 0;
  if (key === "u40") return e.min !== null && e.min < 40;
  if (key === "u100") return e.min !== null && e.min < 100;
  return true;
}
function dateText(e) {
  if (oneNight(e)) return e.b.getFullYear() === T.getFullYear() ? F.wmd.format(e.b) : F.mdy.format(e.b);
  var old = e.b && diff(T, e.b) > 300;
  if (e.openRun) return "Open run";
  if (!e.b || old) return e.n ? "Through " + short(e.n) : "Dates not posted";
  if (!e.n) return "From " + short(e.b);
  var sameYear = e.b.getFullYear() === e.n.getFullYear();
  return (sameYear ? F.md.format(e.b) : short(e.b)) + " – " + short(e.n);
}
function eventStatus(e) {
  if (isPast(e)) return { label: "Closed", tone: "" };
  if (oneNight(e)) return same(e.b, T) ? { label: "Tonight only", tone: "soon-t" } : { label: "One night", tone: "next-t" };
  if (e.b && e.b > T) return { label: "Opens " + short(e.b), tone: "next-t" };
  if (e.openRun || !e.n) return { label: "Open run", tone: "" };
  var left = diff(e.n, T);
  if (left === 0) return { label: "Closes today", tone: "soon-t" };
  if (left <= 6) return { label: "Closes " + F.wd.format(e.n), tone: "soon-t" };
  return { label: "Now playing", tone: "" };
}
function costText(e) { return e.min === null ? "Price not posted" : e.cost; }
function placeText(e) { return e.hood ? e.venue + " · " + e.hood : e.venue; }
function placeHTML(e) { return esc(e.venue) + (e.hood ? ' <span class="hood">· ' + esc(e.hood) + "</span>" : ""); }
function sortKey(t) { return t.replace(/^(the|a|an)\s+/i, "").toLowerCase(); }
function byClosing(a, b) { return (a.n ? a.n.getTime() : Infinity) - (b.n ? b.n.getTime() : Infinity) || sortKey(a.title).localeCompare(sortKey(b.title)); }

// ---------- small DOM helpers ----------
function $(id) { return document.getElementById(id); }
function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
function safeUrl(u) { return /^https?:\/\//i.test(u) ? u : "#"; }
function plural(n, one, many) { return n + " " + (n === 1 ? one : many); }
function cardHTML(e) {
  var st = eventStatus(e), mine = AUTH.user ? MYPLANS[e.id] : null, going = mine && mine.status === "going";
  // Marks sit next to the date at the bottom of the card (CC-64; the top row had no room for them).
  // The dolphins are the owner's public picks (CC-66): every visitor sees them. Your own plans stay private:
  // a plain "Interested" label, or "Going <date>". An owner's own plan is already their dolphin.
  var own = mine && !going && !AUTH.user.dolphins ? '<span class="pill mine">Interested</span>' : "";
  var mark = pickHTML(e) + own;
  return '<article class="card" data-card="' + esc(e.id) + '">' +
    '<div class="card-top"><span class="kind">' + esc(e.type) + '</span><span class="pill ' + st.tone + '">' + esc(st.label) + "</span></div>" +
    '<h3><a href="' + esc(safeUrl(e.url)) + '" target="_blank" rel="noopener">' + esc(e.title) + "</a></h3>" +
    '<div class="card-body"><p class="where">' + placeHTML(e) + "</p>" +
    (e.suggestedBy ? '<p class="credit">Suggested by ' + esc(e.suggestedBy) + "</p>" : "") + "</div>" +
    '<div class="card-foot"><span class="when">' + mark + (going ? '<span class="going-on">Going ' + esc(goingDay(mine.date)) + "</span>" :
      "<span>" + esc(dateText(e)) + "</span>") + "</span>" +
    '<span class="cost' + (e.min === 0 ? " free" : "") + '">' + esc(costText(e)) + "</span></div>" +
    (e.pick ? '<p class="pick-note" id="pick-note-' + PICK_SEQ + '" hidden>' + esc(pickText(e.pick)) + "</p>" : "") +
    (AUTH.user ? '<div class="card-actions">' + (goingLater(e) && !WENT[e.id] ? "" : wentHTML(e)) +
      (WENT[e.id] ? "" : myplanToggleHTML(e)) + // been already: nothing left to plan
      (isAdmin() ? editButtonHTML(e, "went") : "") + "</div>" + (WENT[e.id] ? "" : myplanHTML(e)) : "") +
    "</article>";
}
// The owner's pick as a dolphin button: hovering shows what it means; tapping (phones) opens it in the card.
var PICK_SEQ = 0;
function pickText(p) {
  var who = p.by || "The Culture Crew";
  return p.status === "going" && p.date ? who + " is committed to seeing this on " + dayName(parseISO(p.date)) + "." :
    p.status === "going" ? who + " is committed to seeing this." : who + " is interested in this one.";
}
function pickHTML(e) {
  if (!e.pick) return "";
  PICK_SEQ += 1;
  var going = e.pick.status === "going", text = pickText(e.pick);
  return '<button type="button" class="pick" data-pick aria-expanded="false" aria-controls="pick-note-' + PICK_SEQ + '" aria-label="' + esc(text) + '">' +
    (going ? '<img class="dolphin going" src="img/dolphin-going.webp" width="30" height="30" alt="">' :
      '<img class="dolphin" src="img/dolphin-interested.webp" width="24" height="24" alt="">') +
    '<span class="tip" aria-hidden="true">' + esc(text) + "</span></button>";
}
document.addEventListener("click", function (ev) {
  var b = ev.target.closest("[data-pick]"); if (!b) return;
  var note = document.getElementById(b.getAttribute("aria-controls")), open = b.getAttribute("aria-expanded") !== "true";
  b.setAttribute("aria-expanded", String(open)); if (note) note.hidden = !open;
});
// Committed to a day after today: "I've been" would be premature, so the card doesn't offer it.
function goingLater(e) { var mine = MYPLANS[e.id]; return !!mine && mine.status === "going" && parseISO(mine.date) > T; }
function goingDay(iso) { var d = parseISO(iso); return d.getFullYear() === T.getFullYear() ? F.wmd.format(d) : F.mdy.format(d); }
// The days you can say you're going: from today (or opening) to closing, at most two years out (the API's rule).
function goingRange(e) {
  var lo = e.b && e.b > T ? e.b : T, far = add(T, 730), hi = e.n && e.n < far ? e.n : far;
  return lo <= hi ? [lo, hi] : null;
}
function myplanToggleHTML(e) {
  var mine = MYPLANS[e.id];
  if (!mine && !goingRange(e)) return ""; // closed: nothing left to plan
  MYPLAN_SEQ += 1;
  return '<button type="button" class="went" data-myplan-toggle="' + esc(e.id) + '" aria-expanded="false" aria-controls="myplan-' + MYPLAN_SEQ + '">' +
    (mine ? "Change plan" : "Interested?") + "</button>";
}
// The picker under a card: Interested, Going on a date (one-night events need no date field), or Clear.
function myplanHTML(e) {
  var mine = MYPLANS[e.id], range = goingRange(e), n = MYPLAN_SEQ, id = esc(e.id);
  if (!mine && !range) return "";
  var going = "";
  if (range && same(range[0], range[1])) {
    going = '<button type="button" class="went" data-myplan-going="' + id + '" data-date="' + isoDate(range[0]) + '" aria-pressed="' +
      !!(mine && mine.status === "going") + '">Commit to ' + esc(goingDay(isoDate(range[0]))) + "</button>";
  } else if (range) {
    var value = mine && mine.date ? mine.date : isoDate(range[0]);
    going = '<button type="button" class="went" data-myplan-going="' + id + '" aria-pressed="' + !!(mine && mine.status === "going") +
      '" aria-describedby="myplan-date-' + n + '">Commit to</button>' +
      '<input type="date" id="myplan-date-' + n + '" aria-label="Date for ' + esc(e.title) + '" min="' + isoDate(range[0]) +
      '" max="' + isoDate(range[1]) + '" value="' + esc(value) + '">';
  }
  return '<div class="myplan" id="myplan-' + n + '" role="group" aria-label="Your plan for ' + esc(e.title) + '" hidden>' +
    '<div class="row"><button type="button" class="went" data-myplan-set="' + id + '" aria-pressed="' + !!(mine && mine.status === "interested") +
    '">Interested</button>' + (mine ? '<button type="button" class="textbtn" data-myplan-clear="' + id + '">Clear plan</button>' : "") + "</div>" +
    (going ? '<div class="row">' + going + "</div>" : "") +
    '<p class="form-error" role="alert"></p></div>';
}
function wentHTML(e) {
  var on = !!WENT[e.id];
  return '<button type="button" class="went" data-went="' + esc(e.id) + '" aria-pressed="' + on + '">' +
    '<span aria-hidden="true">' + (on ? "✓ " : "+ ") + "</span>I've been</button>";
}

// ---------- views ----------
var VIEWS = { home: "home-title", catalog: "catalog-title", plan: "plan-title", account: "account-title", submit: "submit-title", review: "review-title", venues: "venues-title", stats: "stats-title", sources: "sources-title", found: "found-title", reset: "reset-title", verify: "verify-title" };
function show(name, focusId) {
  Object.keys(VIEWS).forEach(function (v) { $("view-" + v).hidden = v !== name; });
  ["catalog", "plan", "submit", "review", "account"].forEach(function (v) {
    if (v === name || (v === "review" && (name === "venues" || name === "stats" || name === "sources" || name === "found"))) $("nav-" + v).setAttribute("aria-current", "page"); else $("nav-" + v).removeAttribute("aria-current");
  });
  window.scrollTo(0, 0);
  var h = $(focusId || VIEWS[name]); if (h) h.focus({ preventScroll: true });
  track("view", name);
}
// A click out to an event's own page (tickets, showtimes) from a card or an outing (CC-68).
document.addEventListener("click", function (ev) {
  var a = ev.target.closest('a[target="_blank"]');
  if (a && a.closest(".card, .outing, .alts")) track("ticket");
});
document.addEventListener("click", function (ev) {
  var b = ev.target.closest("[data-go]"); if (!b || !FACETS) return; // the views need the filter options; they load first
  var go = b.getAttribute("data-go");
  if (go === "plan") startPlan(); else if (go === "catalog") { renderCatalog(); show("catalog"); }
  else if (go === "account") openAccount(); else if (go === "submit") openSubmit(); else if (go === "review") openReview(); else if (go === "venues") openVenues(); else if (go === "stats") openStats(); else if (go === "sources") openSources(); else if (go === "found") openFound();
  else show("home");
});
