// Culture Crew site: Shared helpers: dates, the event shape, DOM helpers and switching views.
// Loaded by index.html in order (core, util, catalog, planner, account, crews, submit, admin, hours, found, issues, photos, approvals, start); they share one
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
function clockText(t) { // "19:30" -> "7:30 PM", "14:00" -> "2 PM" (venue hours and the planner, CC-78/79)
  var p = t.split(":"), h = +p[0], m = p[1];
  return (h % 12 || 12) + (m === "00" ? "" : ":" + m) + (h < 12 ? " AM" : " PM");
}
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
var TYPE_ORDER = ["Theater", "Music", "Visual Art"]; // CC-125, CC-133: the three, as the API has them
// CC-125: an opera's category is Music; it's also listed under Theater, and its card says "Opera"
function typeLabel(category, opera) { return opera ? "Opera" : category; }
function inType(e, types) { return !!types[e.type] || (e.opera && !!types.Theater); }
// CC-130: each category's colour (the --cat-* tokens in site.css), on its filter chip, its cards and the legend.
// An opera is Music, so it's Music's colour. Its name is always shown in text too.
var CAT_KEYS = { "Theater": "theater", "Music": "music", "Visual Art": "art" };
function catClass(type) { return CAT_KEYS[type] ? " cat-" + CAT_KEYS[type] : ""; }
var AREA_NAMES = { city: "City", suburbs: "Suburbs", out_of_town: "Out of town" };
// The page no longer downloads every event (CC-33): each view asks the API for what it shows.
// FACETS: the categories and neighborhoods in use, plus counts (GET /events/facets).
// CC-73: the sides of town, in the order Find an outing and the catalog offer them.
var REGIONS = [["downtown", "Downtown/Loop"], ["north", "Northside"], ["west", "Westside"], ["south", "Southside"],
  ["suburbs", "Suburbs"], ["out_of_town", "Out of town"]];
var REGION_NAMES = {}; REGIONS.forEach(function (r) { REGION_NAMES[r[0]] = r[1]; });
// KNOWN: every event fetched so far, by id, for "I've been" buttons and outing swaps.
var FACETS = null, KNOWN = {}, TYPES = [];
// The API's event -> the shape the rest of this page was written for.
function fromApi(e) {
  var usual = e.min_price === null && e.venue.standard_cost ? e.venue : null; // CC-89: the venue's standard cost stands in
  return {
    id: String(e.id), sourceId: e.source_id, title: e.title, venue: e.venue.name, hood: e.venue.neighborhood,
    area: AREA_NAMES[e.venue.area] || "City", begin: e.begin_date, end: e.end_date, openRun: e.open_run,
    beginTbd: !e.begin_date, cost: usual ? usual.standard_cost : e.cost_text || "TBD", min: usual ? usual.standard_min_price : e.min_price,
    costUsual: !!usual, type: e.category, url: e.url, opera: !!e.opera, label: typeLabel(e.category, e.opera),
    venueId: e.venue.id, costRaw: e.cost_text, // for the admin edit form (CC-56)
    status: e.status, publishAt: e.publish_at ? new Date(e.publish_at) : null,
    submitter: e.submitted_by, // only the admin routes send this (undefined elsewhere; null = none on record)
    creditMe: !!e.credit_me, suggestedBy: e.submitted_by_name || null, // the opt-in "Suggested by" credit (CC-30)
    region: e.venue.region || null, // the side of town (CC-73)
    pick: e.pick ? { status: e.pick.status, date: e.pick.date, by: e.pick.by } : null, // the owner's public pick (CC-66)
    sched: e.schedule || { dates: [], weekly: {}, weekly_from: "", hours: {} }, // when it's on, for the planner (CC-79)
    crewPlans: (e.crew_plans || []).map(function (c) { c.been = c.been || []; return c; }), // signed in: crew-mates' shared plans (CC-75), and who's been (CC-117)
    takes: e.takes || [], // members' shared journal entries, GET /events/<id> only (CC-112)
    runDates: (e.run_dates || []).map(function (r) { return { date: r.date, time: r.time, end_time: r.end_time || "" }; }), // a fixed run (CC-96)
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
var WENT = {}, WENT_LIST = [], WENT_PHOTO = {}; // WENT_PHOTO: your photos from events you've been to, by event (CC-76)
// CC-98: your Cultural Journal entries, by event: { words, review, recommend } as saved, and what's typed but not saved yet.
var WENT_JOURNAL = {}, JOURNAL_DRAFT = {};
// CC-112: whether each entry is shared on its event's page, by event: { shared, anonymous }.
var WENT_SHARE = {};
// Your plans (CC-55; "Oh the places you'll go" on the account page): MYPLANS[id] = { status: "interested" | "going", date: "YYYY-MM-DD" | null }.
var MYPLANS = {}, MYPLAN_LIST = [], MYPLAN_SEQ = 0;
var TYPE_PLURAL = { "Theater": "theater", "Music": "music", "Visual Art": "visual art" };

function isPast(e) { return !!e.n && e.n < T; }
function oneNight(e) { return same(e.b, e.n); }
function overlaps(e, ws, we) { return (!e.b || !we || e.b <= we) && (!e.n || !ws || e.n >= ws); }
function costOk(e, key) {
  if (key === "free") return e.min === 0;
  if (key === "u40") return e.min !== null && e.min < 40;
  if (key === "u100") return e.min !== null && e.min < 100;
  if (typeof key === "number") return e.min !== null && e.min <= key; // the planner's top price (CC-128)
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
function costText(e) { // the venue's standard cost reads "Usually free", "Usually $25 general admission" (CC-89)
  if (e.costUsual) return "Usually " + (/^[A-Z][a-z]/.test(e.cost) ? e.cost.charAt(0).toLowerCase() + e.cost.slice(1) : e.cost);
  return e.min === null ? "Price not posted" : e.cost;
}
function placeText(e) { return e.hood ? e.venue + " · " + e.hood : e.venue; }
function placeHTML(e) { return esc(e.venue) + (e.hood ? ' <span class="hood">· ' + esc(e.hood) + "</span>" : ""); }
function sortKey(t) { return t.replace(/^(the|a|an)\s+/i, "").toLowerCase(); }
function byClosing(a, b) { return (a.n ? a.n.getTime() : Infinity) - (b.n ? b.n.getTime() : Infinity) || sortKey(a.title).localeCompare(sortKey(b.title)); }

// ---------- small DOM helpers ----------
function $(id) { return document.getElementById(id); }
function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
function safeUrl(u) { return /^https?:\/\//i.test(u) ? u : "#"; }
// A list that stops at the height of its first n items and scrolls for the rest (CC-87), measured from the real
// items so it fits them exactly. A list that scrolls can be focused, so it can be scrolled from the keyboard.
function capList(list, n, label) {
  var items = Array.prototype.filter.call(list.children, function (c) { return c.offsetParent !== null; });
  list.classList.toggle("capped", items.length > n);
  if (items.length <= n) { list.style.maxHeight = ""; list.removeAttribute("tabindex"); list.removeAttribute("role"); list.removeAttribute("aria-label"); return; }
  var top = items[0].offsetTop, bottom = items[n - 1].offsetTop + items[n - 1].offsetHeight;
  list.style.maxHeight = Math.ceil(bottom - top + 2) + "px";
  list.tabIndex = 0; list.setAttribute("role", "region"); list.setAttribute("aria-label", label);
}
function plural(n, one, many) { return n + " " + (n === 1 ? one : many); }
// CC-96: a fixed run's upcoming dates and times, in the event view ("Fri, Oct 24, 8 PM · Sun, Nov 2, 7:30 PM · 2 more").
var RUN_SHOWN = 3;
function runDatesText(e) {
  var left = e.runDates.filter(function (r) { return parseISO(r.date) >= T; });
  return left.slice(0, RUN_SHOWN).map(function (r) {
    return goingDay(r.date) + ", " + clockText(r.time) + (r.end_time ? "–" + clockText(r.end_time) : "");
  }).join(" · ") + (left.length > RUN_SHOWN ? " · " + (left.length - RUN_SHOWN) + " more" : "");
}
function cardHTML(e) {
  var mine = AUTH.user ? MYPLANS[e.id] : null, going = mine && mine.status === "going";
  // Marks sit next to the date at the bottom of the card (CC-64; the top row had no room for them).
  // The dolphins are the owner's public picks (CC-66): every visitor sees them. Your own plans stay private:
  // "Interested" with the lake dolphin, or "Going <date>" with the ink one (CC-139). An owner's own plan is already
  // their dolphin.
  var own = mine && !going && !AUTH.user.dolphins ? '<span class="own-plan">' + markHTML("interested") + "Interested</span>" : "";
  var mark = pickHTML(e) + own;
  return '<article class="card' + catClass(e.type) + '" data-card="' + esc(e.id) + '">' +
    '<div class="card-top"><span class="kind">' + esc(e.label) + "</span></div>" + // CC-132: no status pill on cards; the event view keeps it
    // CC-117: the card opens the event's view in the site; its Tickets button there is the way out to the venue
    '<h3><a href="#e/' + esc(e.id) + '" data-ev-open="' + esc(e.id) + '">' + esc(e.title) + "</a></h3>" +
    '<div class="card-body"><p class="where">' + placeHTML(e) + "</p>" + // CC-129: show times are in the event view
    (e.suggestedBy ? '<p class="credit">Suggested by ' + esc(e.suggestedBy) + "</p>" : "") +
    (AUTH.user && crewNoteText(e) ? '<p class="crew-note">' + esc(crewNoteText(e)) + "</p>" : "") + "</div>" +
    '<div class="card-foot"><span class="when">' + mark + (going ? '<span class="going-on">' + markHTML("going") + "Going " + esc(goingDay(mine.date)) + "</span>" :
      "<span>" + esc(dateText(e)) + "</span>") + "</span>" +
    '<span class="cost' + (e.min === 0 ? " free" : "") + '">' + esc(costText(e)) + "</span></div>" +
    (e.pick ? '<p class="pick-note" id="pick-note-' + PICK_SEQ + '" hidden>' + esc(pickText(e.pick)) + "</p>" : "") +
    (AUTH.user ? cardActionsHTML(e) : "") + "</article>";
}
// The signed-in buttons under a card, and in the event view (CC-117): I've been, your plan, sharing it with crews.
function cardActionsHTML(e) {
  return '<div class="card-actions">' + (goingLater(e) && !WENT[e.id] ? "" : wentHTML(e)) +
    (WENT[e.id] ? photoButtonHTML(e) : myplanToggleHTML(e)) + // been already: a photo, rather than a plan (CC-76; photos.js)
    (WENT[e.id] ? "" : crewShareToggleHTML(e)) + // "Invite your Crew?": a plan, and crews to share it with (CC-75; crews.js)
    (isAdmin() ? editButtonHTML(e, "went") : "") + "</div>" + (WENT[e.id] ? "" : myplanHTML(e) + crewShareHTML(e));
}
// CC-139: a dolphin mark (the symbols in index.html; brief section 4). "host" is the host's pick, the dolphin through
// the gold ring; "interested" (lake) and "going" (ink) are your own. With a label it's an image; without one it's hidden,
// for when the words next to it already say it.
function markHTML(kind, label) {
  var cls = { host: "mark-host", interested: "mark-int", going: "mark-going" }[kind];
  return '<svg class="mark ' + cls + '"' + (label ? ' role="img" aria-label="' + esc(label) + '"' : ' aria-hidden="true"') +
    '><use href="#' + (kind === "host" ? "dolphin-ring" : "dolphin") + '"></use></svg>';
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
  var text = pickText(e.pick); // one mark for interested and going; the label says which (CC-139)
  return '<button type="button" class="pick" data-pick aria-expanded="false" aria-controls="pick-note-' + PICK_SEQ + '" aria-label="' + esc(text) + '">' +
    markHTML("host") +
    '<span class="tip" aria-hidden="true">' + esc(text) + "</span></button>";
}
document.addEventListener("click", function (ev) {
  var b = ev.target.closest("[data-pick]"); if (!b) return;
  var note = document.getElementById(b.getAttribute("aria-controls")), open = b.getAttribute("aria-expanded") !== "true";
  b.setAttribute("aria-expanded", String(open)); if (note) note.hidden = !open;
});
// Committed to a day after today: "I've been" would be premature, so the card doesn't offer it.
// "Ben K. and Maya C. from Thursday Theater are going" / "3 from Laughin Times are interested" (CC-75), per crew.
function crewNoteText(e) {
  function who(names) {
    names = names.map(shortName); // "Maya C."
    return names.length > 2 ? (NUMBER_WORDS[names.length] || String(names.length)).toLowerCase() + " more" :
      names.length === 2 ? names[0] + " and " + names[1] : names[0];
  }
  var planned = e.crewPlans.filter(function (c) { return c.going.length || c.interested.length; }); // been-only: the event view (CC-117)
  if (!planned.length) return "";
  return planned.map(function (c) {
    var parts = [];
    if (c.going.length) parts.push(who(c.going) + " from " + c.crew_name + (c.going.length === 1 ? " is going" : " are going"));
    if (c.interested.length) parts.push((c.going.length ? who(c.interested) : who(c.interested) + " from " + c.crew_name) +
      (c.interested.length === 1 ? " is interested" : " are interested"));
    return parts.join(", and ");
  }).join(". ") + ".";
}
function goingLater(e) { var mine = MYPLANS[e.id]; return !!mine && mine.status === "going" && parseISO(mine.date) > T; }
function goingDay(iso) { var d = parseISO(iso); return d.getFullYear() === T.getFullYear() ? F.wmd.format(d) : F.mdy.format(d); }
// The days you can say you're going: from today (or opening) to closing, at most two years out (the API's rule).
function goingRange(e) {
  var lo = e.b && e.b > T ? e.b : T, far = add(T, 730), hi = e.n && e.n < far ? e.n : far;
  return lo <= hi ? [lo, hi] : null;
}
function myplanToggleHTML(e, label) { // label: what it says once you have a plan (My week's Still deciding: "Pick a day", CC-146)
  var mine = MYPLANS[e.id];
  if (!mine && !goingRange(e)) return ""; // closed: nothing left to plan
  MYPLAN_SEQ += 1;
  return '<button type="button" class="went" data-myplan-toggle="' + esc(e.id) + '" aria-expanded="false" aria-controls="myplan-' + MYPLAN_SEQ + '">' +
    (mine ? label || "Change plan" : "Interested?") + "</button>";
}
// The picker under a card: Interested, Going on a date (one-night events need no date field), or Clear.
function myplanHTML(e) {
  var mine = MYPLANS[e.id], range = goingRange(e), n = MYPLAN_SEQ, id = esc(e.id);
  if (!mine && !range) return "";
  var going = "";
  if (range && same(range[0], range[1])) {
    going = '<button type="button" class="went" data-myplan-going="' + id + '" data-date="' + isoDate(range[0]) + '" aria-pressed="' +
      !!(mine && mine.status === "going") + '">' + markHTML("going") + "Commit to " + esc(goingDay(isoDate(range[0]))) + "</button>";
  } else if (range) {
    var value = mine && mine.date ? mine.date : isoDate(range[0]);
    going = '<button type="button" class="went" data-myplan-going="' + id + '" aria-pressed="' + !!(mine && mine.status === "going") +
      '" aria-describedby="myplan-date-' + n + '">' + markHTML("going") + "Commit to</button>" +
      '<input type="date" id="myplan-date-' + n + '" aria-label="Date for ' + esc(e.title) + '" min="' + isoDate(range[0]) +
      '" max="' + isoDate(range[1]) + '" value="' + esc(value) + '">';
  }
  return '<div class="myplan" id="myplan-' + n + '" role="group" aria-label="Your plan for ' + esc(e.title) + '" hidden>' +
    '<div class="row"><button type="button" class="went" data-myplan-set="' + id + '" aria-pressed="' + !!(mine && mine.status === "interested") +
    '">' + markHTML("interested") + "Interested</button>" + (mine ? '<button type="button" class="textbtn" data-myplan-clear="' + id + '">Clear plan</button>' : "") + "</div>" +
    (going ? '<div class="row">' + going + "</div>" : "") +
    '<p class="form-error" role="alert"></p></div>';
}
function wentHTML(e) {
  var on = !!WENT[e.id];
  return '<button type="button" class="went" data-went="' + esc(e.id) + '" aria-pressed="' + on + '">' +
    '<span aria-hidden="true">' + (on ? "✓ " : "+ ") + "</span>I've been</button>";
}

// ---------- views ----------
// CC-121, CC-126: the join page is at chiculturecrew.com/join, and with the admins' invite pitch at /invite
function onJoinPage() { return location.pathname === "/join" || location.pathname === "/invite"; }
var VIEWS = { home: "home-title", join: "jp-title", catalog: "catalog-title", event: "event-title", plan: "plan-title", account: "account-title", crews: "crews-title", planner: "planner-title", journal: "journal-title", submit: "submit-title", review: "review-title", venues: "venues-title", stats: "stats-title", sources: "sources-title", found: "found-title", issues: "issues-title", approvals: "approvals-title", members: "members-title", card: "card-title", reset: "reset-title", verify: "verify-title" };
// CC-157: each view has an address (#account, #catalog, ...; Home is the site's own, with no hash), and showing a view
// pushes it, so Back and Forward move between views and a reload opens what's showing (start.js routes it back).
// The event view keeps its own #e/<id> (openEvent); the join, reset and verify pages keep the address they came with.
var ROUTE = null; // the address openFromHash is opening: the view it lands on (or redirects to) takes its place in the history
function viewOf(hash) { // the view an address opens
  var h = hash.replace(/^#/, "");
  if (!h) return onJoinPage() ? "join" : "home";
  return /^e\//.test(h) ? "event" : /^o-/.test(h) ? "plan" : /^found\//.test(h) ? "found" : /^source-/.test(h) ? "sources" : /^issues\//i.test(h) ? "issues" : h;
}
function syncAddress(name) {
  var routed = ROUTE !== null && location.hash === ROUTE; ROUTE = null;
  if (name === "event" || name === "join" || name === "reset" || name === "verify") return;
  if (routed && viewOf(location.hash) === name) return; // e.g. #found/skipped or a shared outing already says it
  var url = "/" + location.search + (name === "home" ? "" : "#" + name);
  if (url === location.pathname + location.search + location.hash) return;
  try { if (routed) history.replaceState(null, "", url); else history.pushState({ view: name }, "", url); } catch (e) {}
}
function show(name, focusId) {
  Object.keys(VIEWS).forEach(function (v) { $("view-" + v).hidden = v !== name && !(v === "catalog" && name === "join"); }); // CC-121: the catalog shows under the join page
  ["catalog", "plan", "submit", "review", "account"].forEach(function (v) {
    if (v === name || (v === "catalog" && name === "event") || (v === "account" && (name === "crews" || name === "planner" || name === "journal")) || (v === "review" && (name === "venues" || name === "stats" || name === "sources" || name === "found" || name === "issues" || name === "members" || name === "card" || (name === "approvals" && isAdmin())))) $("nav-" + v).setAttribute("aria-current", "page"); else $("nav-" + v).removeAttribute("aria-current");
  });
  paintMast(name);
  window.scrollTo(0, 0);
  // leaving the event view or the join page (CC-117, CC-121) included: Back comes back to them
  syncAddress(name);
  if (typeof paintPending === "function") paintPending(); // the crew-invite notice hides on the crews page (CC-59, CC-104)
  var h = $(focusId || VIEWS[name]); if (h) h.focus({ preventScroll: true });
  track("view", name);
}
// ---------- the masthead (CC-137) ----------
// Full on home and the join page, compact on every other view. On a phone the nav is a sheet the hamburger opens;
// Escape, a click outside or tabbing out closes it. The date is Chicago's, like the listings.
var MAST_PHONE = window.matchMedia("(max-width: 960px)");
$("mast-date").textContent = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "America/Chicago" }).format(new Date());
function paintMast(name) {
  $("mast").classList.toggle("mast-full", name === "home" || name === "join");
  $("me-menu").querySelectorAll("[data-me]").forEach(function (b) { // the you menu shows the current page in bold
    if (b.getAttribute("data-me") === name) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
  });
  closeMastSheet(false);
}
function mastSheetOpen() { return $("mast").classList.contains("open"); }
function closeMastSheet(refocus) {
  if (!mastSheetOpen()) return;
  $("mast").classList.remove("open"); $("mast-burger").setAttribute("aria-expanded", "false");
  if (refocus) $("mast-burger").focus();
}
$("mast-burger").addEventListener("click", function () {
  if (mastSheetOpen()) { closeMastSheet(false); return; }
  $("mast").classList.add("open"); $("mast-burger").setAttribute("aria-expanded", "true");
});
document.addEventListener("keydown", function (ev) { if (ev.key === "Escape" && mastSheetOpen()) closeMastSheet(true); });
document.addEventListener("click", function (ev) { if (!$("mast").contains(ev.target)) closeMastSheet(false); });
$("mast").addEventListener("focusout", function (ev) { if (ev.relatedTarget && !$("mast").contains(ev.relatedTarget)) closeMastSheet(false); });
// A click out to an event's own page (tickets, showtimes) from a card or an outing (CC-68).
document.addEventListener("click", function (ev) {
  var a = ev.target.closest('a[target="_blank"]');
  if (a && a.closest(".card, .outing, .alts, .event-view")) track("ticket");
});
document.addEventListener("click", function (ev) {
  var b = ev.target.closest("[data-go]"); if (!b || !FACETS) return; // the views need the filter options; they load first
  var go = b.getAttribute("data-go");
  if (go === "plan") startPlan(); else if (go === "catalog") { renderCatalog(); show("catalog"); }
  else if (go === "account") openAccount(); else if (go === "crews") openCrews(); else if (go === "planner") openPlanner(); else if (go === "journal") openJournal(); else if (go === "submit") openSubmit(); else if (go === "review") openReview(); else if (go === "venues") openVenues(); else if (go === "stats") openStats(); else if (go === "sources") openSources(); else if (go === "found") openFound(); else if (go === "issues") openIssues(); else if (go === "approvals") openApprovals(); else if (go === "members") openMembers(); else if (go === "card") openCard();
  else show("home");
});
