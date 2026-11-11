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
var AREA_NAMES = { city: "City", suburbs: "Suburbs" };
// The page no longer downloads every event (CC-33): each view asks the API for what it shows.
// FACETS: the categories and neighborhoods in use, plus counts (GET /events/facets).
// CC-73: the sides of town, in the order Find an outing and the catalog offer them.
var REGIONS = [["downtown", "Downtown/Loop"], ["north", "Northside"], ["west", "Westside"], ["south", "Southside"],
  ["suburbs", "Suburbs"]];
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
    costUsual: !!usual, type: e.category, url: e.url, imageUrl: e.image_url, imageCredit: e.image_credit_url || "", opera: !!e.opera, label: typeLabel(e.category, e.opera),
    venueId: e.venue.id, costRaw: e.cost_text, // for the admin edit form (CC-56)
    venueType: e.venue.category || "", // CC-260: the venue's category, which says whether its hours or its show times count
    address: e.venue.full_address || "", mapUrl: e.venue.map_url || "", // CC-218: "" when the venue has none
    status: e.status, publishAt: e.publish_at ? new Date(e.publish_at) : null,
    submitter: e.submitted_by, // only the admin routes send this (undefined elsewhere; null = none on record)
    creditMe: !!e.credit_me, suggestedBy: e.submitted_by_name || null, // the opt-in "Suggested by" credit (CC-30)
    region: e.venue.region || null, // the side of town (CC-73)
    far: e.venue.area === "out_of_town" || e.venue.region === "out_of_town", // CC-217: never suggested; gone once the clean-up has been run
    pick: e.pick ? { status: e.pick.status, date: e.pick.date, time: e.pick.time || null, by: e.pick.by } : null, // the owner's public pick (CC-66)
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
var WENT_AT = {}; // CC-248: when you marked each event "I've been", by event (the journal mixes them by date with your own)
// Your plans (CC-55; "Oh the places you'll go" on the account page): MYPLANS[id] = { status: "interested" | "going", date: "YYYY-MM-DD" | null,
// time: "HH:MM" | null (CC-264: which show that day) }.
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
  if (left === 0) return { label: "Today only!", tone: "soon-t" };
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
// CC-246: "Photo: venue.example ↗", linking to the page an event's photo was copied from; "" when it has none.
// It sits small in the photo's corner on the event page's poster.
function photoCreditHTML(e) {
  if (!e.imageUrl || !/^https?:\/\//i.test(e.imageCredit)) return "";
  var host = (e.imageCredit.split("/")[2] || "").split("@").pop().split(":")[0].replace(/^www\./i, "");
  return host ? '<a class="photo-credit" href="' + esc(safeUrl(e.imageCredit)) + '" target="_blank" rel="noopener" aria-label="Photo from ' + esc(host) + '">Photo: ' + esc(host) + " ↗</a>" : "";
}
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
// CC-139: a dolphin mark (the symbols in index.html; brief section 4). The kinds "host" and "host-int" are internal names
// for the admin's picks: the dolphin through the gold ring when they're going, the ink dolphin when they're interested
// (CC-162); "interested" (lake) and "going" (ink) are your own, on buttons and cards. With a label it's an image; without one it's hidden, for
// when the words next to it already say it.
function markHTML(kind, label) {
  var cls = { host: "mark-host", "host-int": "mark-host-int", interested: "mark-int", going: "mark-going" }[kind];
  return '<svg class="mark ' + cls + '"' + (label ? ' role="img" aria-label="' + esc(label) + '"' : ' aria-hidden="true"') +
    '><use href="#' + (kind === "host" ? "dolphin-ring" : "dolphin") + '"></use></svg>';
}
// CC-162: the admin's pick as its mark: the gold ring when they're going, the ink dolphin when they're interested.
function pickMarkHTML(p, label) { return markHTML(p.status === "going" ? "host" : "host-int", label); }
// The owner's pick as a dolphin button: hovering shows what it means; tapping (phones) opens it in the card.
var PICK_SEQ = 0;
function pickText(p) {
  var who = p.by || "The Culture Crew";
  return p.status === "going" && p.date ? who + " is committed to seeing this on " + dayName(parseISO(p.date)) + (p.time ? " at " + clockText(p.time) : "") + "." :
    p.status === "going" ? who + " is committed to seeing this." : who + " is interested in this one.";
}
function pickHTML(e) {
  if (!e.pick) return "";
  PICK_SEQ += 1;
  var text = pickText(e.pick);
  return '<button type="button" class="pick" data-pick aria-expanded="false" aria-controls="pick-note-' + PICK_SEQ + '" aria-label="' + esc(text) + '">' +
    pickMarkHTML(e.pick) +
    '<span class="tip" aria-hidden="true">' + esc(text) + "</span></button>";
}
document.addEventListener("click", function (ev) {
  var b = ev.target.closest("[data-pick]"); if (!b) return;
  var note = document.getElementById(b.getAttribute("aria-controls")), open = b.getAttribute("aria-expanded") !== "true";
  b.setAttribute("aria-expanded", String(open)); if (note) dropToggle(note, open);
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
function goWhen(iso, time) { return goingDay(iso) + (time ? " \u00b7 " + clockText(time) : ""); } // CC-264: "Sat, Nov 14 · 4 PM"
// The days you can say you're going: from today (or opening) to closing, at most two years out (the API's rule).
function goingRange(e) {
  var lo = e.b && e.b > T ? e.b : T, far = add(T, 730), hi = e.n && e.n < far ? e.n : far;
  return lo <= hi ? [lo, hi] : null;
}
function myplanToggleHTML(e, label) { // label: what it says once you have a plan (My week's Events you're interested in: "Pick a day", CC-146)
  var mine = MYPLANS[e.id];
  if (!mine && !goingRange(e)) return ""; // closed: nothing left to plan
  MYPLAN_SEQ += 1;
  return '<button type="button" class="went" data-myplan-toggle="' + esc(e.id) + '" aria-expanded="false" aria-controls="myplan-' + MYPLAN_SEQ + '">' +
    (mine ? label || "Change plan" : "Interested?") + "</button>";
}
// The picker under a card: Interested, Going on a date (one-night events need no date field), or Clear.
// CC-170: once you're going on a day, "Add to calendar": the API's calendar file for that day, opened as a plain link,
// so iPhone offers Add to Calendar and other browsers download it for Google Calendar or Outlook.
function calendarLinkHTML(e, mine) {
  if (!mine || mine.status !== "going" || !mine.date) return "";
  return '<a class="textbtn cal-link" href="' + esc(API + "/events/" + encodeURIComponent(e.id) + "/calendar.ics?date=" + encodeURIComponent(mine.date) +
    (mine.time ? "&time=" + encodeURIComponent(mine.time) : "")) + // CC-264: the show you chose

    '" aria-label="Add ' + esc(e.title) + ' to your calendar">Add to calendar</a>';
}
// days: in place of the Going row, My week's own (the days, in Events you're interested in, of the shown week, CC-260)
function myplanHTML(e, days) {
  var mine = MYPLANS[e.id], range = goingRange(e), n = MYPLAN_SEQ, id = esc(e.id);
  if (!mine && !range) return "";
  var going = "";
  if (days !== undefined) going = days;
  else if (range) { // CC-260: only days it's on
    var first = firstGoDay(e), going1 = mine && mine.status === "going";
    var field = first ? goDayFieldHTML(e, 'id="myplan-date-' + n + '" aria-label="Date for ' + esc(e.title) + '"', mine && mine.date ? mine.date : first, mine && mine.time) : "";
    if (field && same(range[0], range[1])) { // CC-264: a one-day run with two or more shows: one button each
      var shows = goTimes(e, first);
      going = (shows.length > 1 ? shows : [""]).map(function (t) {
        return '<button type="button" class="went" data-myplan-going="' + id + '" data-date="' + first + '"' + (t ? ' data-time="' + t + '"' : "") + ' aria-pressed="' +
          !!(going1 && (!t || mine.time === t)) + '">' + markHTML("going") + "Commit to " + esc(goWhen(first, t)) + "</button>";
      }).join("");
    } else if (field) {
      going = '<button type="button" class="went" data-myplan-going="' + id + '" aria-pressed="' + !!(mine && mine.status === "going") +
        '" aria-describedby="myplan-date-' + n + '">' + markHTML("going") + "Commit to</button>" + field;
    }
  }
  return '<div class="myplan" id="myplan-' + n + '" role="group" aria-label="Your plan for ' + esc(e.title) + '" hidden>' +
    '<div class="row"><button type="button" class="went" data-myplan-set="' + id + '" aria-pressed="' + !!(mine && mine.status === "interested") +
    '">' + markHTML("interested") + "Interested</button>" + calendarLinkHTML(e, mine) + (mine ? '<button type="button" class="textbtn" data-myplan-clear="' + id + '">Clear plan</button>' : "") + "</div>" +
    (going && days !== undefined ? going : going ? '<div class="row">' + going + "</div>" : "") +
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
var VIEWS = { home: "home-title", join: "jp-title", catalog: "catalog-title", event: "event-title", plan: "plan-title", account: "account-title", crews: "crews-title", planner: "planner-title", journal: "journal-title", submit: "submit-title", review: "review-title", venues: "venues-title", stats: "stats-title", sources: "sources-title", found: "found-title", issues: "issues-title", approvals: "approvals-title", members: "members-title", card: "card-title", sourcing: "sourcing-title", engagement: "engagement-title", people: "people-title", health: "health-title", reset: "reset-title", verify: "verify-title" };
// CC-206: the option on the admin's Review menu each admin page belongs to
var RV_GROUP = { review: "review", sourcing: "sourcing", found: "sourcing", sources: "sourcing", engagement: "engagement", stats: "engagement", health: "engagement", card: "engagement",
  issues: "engagement", approvals: "engagement", people: "people", venues: "people", members: "people" };
// CC-157: each view has an address (#account, #catalog, ...; Home is the site's own, with no hash), and showing a view
// pushes it, so Back and Forward move between views and a reload opens what's showing (start.js routes it back).
// The event view keeps its own #e/<id> (openEvent); the join, reset and verify pages keep the address they came with.
var ROUTE = null; // the address openFromHash is opening: the view it lands on (or redirects to) takes its place in the history
function viewOf(hash) { // the view an address opens
  var h = hash.replace(/^#/, "");
  if (!h) return onJoinPage() ? "join" : "home";
  return /^e\//.test(h) ? "event" : /^o-/.test(h) ? "plan" : /^found\//.test(h) ? "found" : /^sources?[-/]/.test(h) ? "sources" : /^issues\//i.test(h) ? "issues" : h;
}
function syncAddress(name) {
  var routed = ROUTE !== null && location.hash === ROUTE; ROUTE = null;
  if (name === "event" || name === "join" || name === "reset" || name === "verify") return;
  if (routed && viewOf(location.hash) === name) return; // e.g. #found/skipped or a shared outing already says it
  var url = "/" + location.search + (name === "home" ? "" : "#" + name);
  if (url === location.pathname + location.search + location.hash) return;
  try { if (routed) history.replaceState(null, "", url); else history.pushState({ view: name }, "", url); } catch (e) {}
}
// still: back to a list that's been there all along (closeEvent), so its rows don't come in again
function show(name, focusId, still) {
  var lists = rowLists(), showing = lists.filter(rowsShowing);
  Object.keys(VIEWS).forEach(function (v) { $("view-" + v).hidden = v !== name && !(v === "catalog" && name === "join"); }); // CC-121: the catalog shows under the join page
  ["catalog", "plan", "submit", "review", "account"].forEach(function (v) {
    if (v === name || (v === "catalog" && name === "event") || (v === "account" && (name === "crews" || name === "planner" || name === "journal")) || (v === "review" && RV_GROUP[name] && (name !== "approvals" || isAdmin()))) $("nav-" + v).setAttribute("aria-current", "page"); else $("nav-" + v).removeAttribute("aria-current");
  });
  paintMast(name);
  window.scrollTo(0, 0);
  // leaving the event view or the join page (CC-117, CC-121) included: Back comes back to them
  syncAddress(name);
  if (typeof paintPending === "function") paintPending(); // the crew-invite notice hides on the crews page (CC-59, CC-104)
  paintJoinedNote(name); // CC-237
  var h = $(focusId || VIEWS[name]); if (h) h.focus({ preventScroll: true });
  if (!still) lists.forEach(function (root) { if (showing.indexOf(root) < 0 && rowsShowing(root)) rowsShown(root); });
  track("view", name);
}
// ---------- opening and closing (CC-227; brief section 6) ----------
// Things open from their trigger and exit back into it. One helper for all of them: dropOpen and dropClose for what drops
// down, openDialog and closeDialog for dialogs. Whatever closes changes state at once, as if there were no animation:
// hidden, aria-expanded, the dialog's own close(), and so focus and Escape. The element then stays painted, inert, until its
// exit ends. A dialog has to close first: while it's modal the page behind it is inert, so nothing can take focus there.
// Fill is none, so an interrupted move always lands on the element's real state. With reduced motion they swap at once.
var MOTION_CALM = window.matchMedia("(prefers-reduced-motion: reduce)");
var MOVES = new WeakMap(); // an element's running move: its Animation, which way it's going, and what to do when it ends
function motionOn(el) { return !!el.animate && !MOTION_CALM.matches; }
// An exit plays the entrance backwards, and an ease-out backwards sits still for half its time, so exits ease in and out
function motionTiming(leaving) {
  var root = getComputedStyle(document.documentElement);
  return { duration: parseFloat(root.getPropertyValue("--dur-drop")), easing: root.getPropertyValue(leaving ? "--ease-in-out" : "--ease-out").trim() };
}
// CC-231: the one pulse that confirms a success (brief section 6): a --stripe ring leaves the button or line, once. Call it only
// once it worked, and only where words on the page say so, so success never rests on motion alone. The element's own inset
// outline rides along, because an animated box-shadow replaces it. Fill is none, so it leaves nothing behind.
function pulse(el) {
  if (!el || !motionOn(el)) return;
  var root = getComputedStyle(document.documentElement), own = getComputedStyle(el).boxShadow, rest = own && own !== "none" ? ", " + own : "";
  el.animate({ boxShadow: ["0 0 0 0 " + root.getPropertyValue("--stripe").trim() + rest, "0 0 0 8px transparent" + rest] },
    Object.assign(motionTiming(), { duration: parseFloat(root.getPropertyValue("--dur-pulse")) }));
}
function moveEl(el, frames, opening, done) {
  var m = MOVES.get(el);
  if (m) { // already moving: turn round from where it is, so a quick open and close never jumps or sticks
    m.done = done;
    if (m.opening !== opening) { m.opening = opening; m.anim.reverse(); }
    return;
  }
  m = { anim: el.animate(frames, motionTiming(!opening)), opening: opening, done: done };
  if (!opening) m.anim.reverse();
  MOVES.set(el, m);
  m.anim.onfinish = function () { moveEnd(el, m); };
  m.anim.oncancel = function () { moveEnd(el, m); };
}
function moveEnd(el, m) {
  if (MOVES.get(el) === m) MOVES.delete(el);
  var done = m.done; m.done = null;
  if (done) done();
}
function moveStop(el) { var m = MOVES.get(el); if (m) { m.anim.cancel(); moveEnd(el, m); } }
function afterExit(el, then) { // for what has to wait until the exit is over
  var m = MOVES.get(el), done = m && m.done;
  if (!m || m.opening) { then(); return; }
  m.done = function () { if (done) done(); then(); };
}
// A panel over the page comes out from behind its own top edge. One in the flow (the Where list in the filter sheet, a pick
// note, which is relative only to sit above the row's link) opens up its height, so what's below it moves with it instead of jumping. The side and bottom insets keep any shadow.
function dropFrames(el) {
  var css = getComputedStyle(el);
  if (css.position === "absolute" || css.position === "fixed") return [
    { transform: "translateY(-100%)", clipPath: "inset(100% -40px -40px -40px)" },
    { transform: "none", clipPath: "inset(0 -40px -40px -40px)" }];
  var shut = { overflow: "clip" }, full = { overflow: "clip", height: el.getBoundingClientRect().height + "px" };
  shut.height = "0px";
  ["marginTop", "marginBottom", "paddingTop", "paddingBottom", "borderTopWidth", "borderBottomWidth"].forEach(function (k) { shut[k] = "0px"; full[k] = css[k]; });
  return [shut, full];
}
// `ready` places it and focuses into it. That has to happen before the move: focus on something shifted off the screen scrolls
// the page to it. One turned round mid-exit is still shifted, but it was just on screen, so the page stays where it is.
function dropOpen(el, ready) {
  var moving = MOVES.has(el), x = window.scrollX, y = window.scrollY;
  el.hidden = false; el.inert = false; el.style.display = ""; // it may be on its way out
  if (ready) ready();
  if (moving) window.scrollTo(x, y);
  if (motionOn(el)) moveEl(el, dropFrames(el), true, null);
}
// `hide` is for an element that a class shows rather than `hidden`: it runs when the exit ends
function dropClose(el, hide) {
  if (!motionOn(el) || !el.getClientRects().length) { moveStop(el); if (hide) hide(); else el.hidden = true; return; }
  var frames = dropFrames(el), display = getComputedStyle(el).display;
  el.inert = true;
  if (!hide) { el.hidden = true; el.style.setProperty("display", display, "important"); } // [hidden] is !important too
  moveEl(el, frames, false, function () { el.inert = false; el.style.display = ""; if (hide) hide(); });
}
function dropToggle(el, open, ready) { if (open) dropOpen(el, ready); else dropClose(el); }
function dropGone(el) { dropClose(el, function () { el.remove(); }); } // for a panel that only exists while it's open
// For a box that's filled when it opens (a confirm under a button). Filled while open, it just changes; it empties once it's shut.
function dropFill(box, html) { var shut = box.hidden; box.innerHTML = html; if (shut) dropOpen(box); }
function dropEmpty(box) {
  if (box.hidden) return;
  dropClose(box); afterExit(box, function () { if (box.hidden) box.innerHTML = ""; });
}
// CC-228: a panel that a repaint opens or shuts (the open crew, Manage crew, a source's list). It has [data-drop] and an id,
// and shut it's an empty hidden element with the same id. The repaint has already thrown the old one away, so that goes back
// in beside its stand-in, without its id, to leave. Opened mid-exit, the new one starts from where the old one had got to.
// Only a change moves anything: a first paint, or a repaint that leaves a panel as it was, is drawn as it stands.
function dropRepaint(root, paint) {
  var was = {}, leaving = {};
  root.querySelectorAll("[data-drop]").forEach(function (el) { if (!el.closest("[data-drop-gone]")) was[el.id] = el; });
  root.querySelectorAll("[data-drop-gone]").forEach(function (el) { leaving[el.getAttribute("data-drop-gone")] = el; });
  paint();
  root.querySelectorAll("[data-drop]").forEach(function (el) {
    var old = was[el.id]; if (!old || old.hidden === el.hidden) return;
    if (el.hidden) {
      old.removeAttribute("data-drop"); old.setAttribute("data-drop-gone", el.id); old.removeAttribute("id");
      el.after(old); dropGone(old);
      return;
    }
    var back = leaving[el.id], m = back && MOVES.get(back), at = m ? m.anim.currentTime : null;
    if (m) moveStop(back);
    dropOpen(el);
    if (at !== null && MOVES.has(el)) MOVES.get(el).anim.currentTime = at;
  });
}
// A <details> shuts the moment it's told to, so the summary's click is taken over: `open` stays on until the exit ends.
// Its contents sit in a .details-body, as the browser gives no way to move the box it draws them in.
document.addEventListener("click", function (ev) {
  var s = ev.target.closest && ev.target.closest("summary"), d = s && s.parentElement, body = d && d.querySelector(":scope > .details-body");
  if (!body || !motionOn(body)) return;
  ev.preventDefault();
  if (d.open && !body.inert) { dropClose(body, function () { d.open = false; }); return; }
  d.open = true; dropOpen(body);
});
// The control just pressed, with where it was: a menu item has gone by the time its dialog closes, and a row may be redrawn.
// Taken from the click, not from focus, as Safari doesn't focus a button you press.
var PRESSED = null, DIALOG_FROM = new WeakMap();
document.addEventListener("click", function (ev) {
  var b = ev.target.closest("button, a, label");
  PRESSED = b ? { el: b, rect: b.getBoundingClientRect() } : null;
}, true);
function dialogFrames(box, to) {
  if (!to) return [{ opacity: 0, transform: "scale(.96)" }, { opacity: 1, transform: "none" }]; // nothing opened it: a link or a reload
  var x = Math.min(Math.max(to.left + to.width / 2, 0), window.innerWidth), y = Math.min(Math.max(to.top + to.height / 2, 0), window.innerHeight);
  var size = Math.min(Math.max(to.width / box.width, to.height / box.height, 0.1), 0.5); // a phone's menu row is as wide as the dialog: it still grows
  return [{ opacity: 0, transform: "translate(" + (x - box.left - box.width / 2) + "px, " + (y - box.top - box.height / 2) + "px) scale(" + size + ")" },
    { opacity: 1, offset: 0.4 }, { opacity: 1, transform: "none" }];
}
// `back` is for a dialog whose opener won't be there when it closes (Invite a friend, from the you menu)
function openDialog(d, back) {
  moveStop(d);
  var from = PRESSED; PRESSED = null;
  DIALOG_FROM.set(d, { from: from, back: back });
  d.showModal();
  if (!motionOn(d)) return;
  moveEl(d, dialogFrames(d.getBoundingClientRect(), from && from.rect), true, null);
  d.animate({ opacity: [0, 1] }, Object.assign(motionTiming(), { pseudoElement: "::backdrop" }));
}
function dialogTarget(d) {
  var t = DIALOG_FROM.get(d) || {}, el = t.back || (t.from && t.from.el);
  return el && el.isConnected && el.getClientRects().length ? el.getBoundingClientRect() : t.from && t.from.rect;
}
// Called just before a dialog closes, however that happens. Out of the top layer it has no backdrop, so a scrim of the same
// colour stands in for it, and takes any click while the dialog leaves.
function dialogLeaves(d) {
  if (!DIALOG_FROM.has(d) || !d.open || MOVES.has(d) && !MOVES.get(d).opening || !motionOn(d)) return;
  var midway = MOVES.has(d) ? MOVES.get(d).anim.currentTime : null; // closed while still opening: turn round from there
  moveStop(d);
  var box = d.getBoundingClientRect(), top = d.scrollTop, scrim = document.createElement("div");
  scrim.className = "dialog-scrim"; scrim.style.background = getComputedStyle(d, "::backdrop").backgroundColor;
  document.body.appendChild(scrim);
  d.classList.add("dialog-leaving"); d.inert = true;
  d.style.left = box.left + "px"; d.style.top = box.top + "px"; d.style.width = box.width + "px"; d.style.height = box.height + "px";
  d.scrollTop = top;
  scrim.animate({ opacity: [0, 1] }, motionTiming(true)).reverse();
  moveEl(d, dialogFrames(box, dialogTarget(d)), false, function () {
    scrim.remove(); d.classList.remove("dialog-leaving"); d.inert = false;
    d.style.left = d.style.top = d.style.width = d.style.height = "";
  });
  if (midway !== null) MOVES.get(d).anim.currentTime = midway;
}
function closeDialog(d) { dialogLeaves(d); if (d.open) d.close(); }
document.addEventListener("cancel", function (ev) { if (ev.target.tagName === "DIALOG") dialogLeaves(ev.target); }, true); // Escape, or back on Android
document.addEventListener("submit", function (ev) { if (ev.target.method === "dialog") dialogLeaves(ev.target.closest("dialog")); }, true);

// ---------- list rows arrive (CC-230; brief section 6) ----------
// When a list appears its rows come in one after another, --stagger apart. Only the first ROW_CAP are spaced and the rest come
// with the last of them, so even a long list is readable within half a second. It's opacity and `translate`, so the layout never
// moves (a restored scroll position stays put), and the press and the hover growth, on transform and scale, carry on underneath.
// A list is a [data-rows] element and its rows have [data-row]. Lists repaint all the time (home once per reply, every list when a
// plan's saved), so only rows the last paint didn't have come in, and a repaint during an entrance carries on from where it was.
var ROW_CAP = 10, ROW_STATE = new WeakMap(); // a list's rows from its last paint, and its entrance: their order, its start and end
var ROW_IN = [{ opacity: 0, translate: "0 8px" }, { opacity: 1, translate: "0 0" }];
function rowLists() { return Array.prototype.slice.call(document.querySelectorAll("[data-rows]")); }
function rowsShowing(root) { return root.getClientRects().length > 0; }
function rowsPainted(root) {
  var list = ROW_STATE.get(root) || { seen: {}, order: {}, n: 0, at: 0, ends: 0, runs: [] };
  ROW_STATE.set(root, list);
  var rows = Array.prototype.slice.call(root.querySelectorAll("[data-row]")), seen = {}, now = performance.now(), on = rowsShowing(root) && motionOn(root);
  if (now >= list.ends) { list.order = {}; list.n = 0; list.at = now; }
  rows.forEach(function (r) {
    var k = r.getAttribute("data-row"); seen[k] = true;
    if (on && !list.seen[k] && !(k in list.order)) list.order[k] = list.n++;
  });
  list.seen = seen; list.runs = []; list.ends = 0;
  if (!on || !list.n) return;
  var timing = motionTiming(), gap = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--stagger"));
  list.ends = list.at + (Math.min(list.n, ROW_CAP) - 1) * gap + timing.duration;
  rows.forEach(function (r) {
    var i = list.order[r.getAttribute("data-row")]; if (i === undefined) return;
    var a = r.animate(ROW_IN, { duration: timing.duration, easing: timing.easing, delay: Math.min(i, ROW_CAP - 1) * gap, fill: "backwards" });
    a.currentTime = now - list.at; list.runs.push(a);
  });
}
function rowsShown(root) { // its view has just opened: every row comes in
  var list = ROW_STATE.get(root); if (list) { list.seen = {}; list.ends = 0; }
  rowsPainted(root);
}
function rowsSettle() { // before the tile becomes the poster, which photographs the page as it stands
  rowLists().forEach(function (root) {
    var list = ROW_STATE.get(root); if (!list) return;
    list.runs.forEach(function (a) { a.finish(); }); list.runs = []; list.ends = 0;
  });
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
  $("rv-menu").querySelectorAll("[data-me]").forEach(function (b) {
    if (b.getAttribute("data-me") === RV_GROUP[name]) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
  });
  closeMastSheet(false);
  measureMast(); // CC-242: full or compact may have changed
}
function mastSheetOpen() { return $("mast-burger").getAttribute("aria-expanded") === "true"; } // .open stays on through the exit
function closeMastSheet(refocus) {
  if (!mastSheetOpen()) return;
  $("mast-burger").setAttribute("aria-expanded", "false");
  dropClose($("mast-nav"), function () { $("mast").classList.remove("open"); });
  if (refocus) $("mast-burger").focus();
}
$("mast-burger").addEventListener("click", function () {
  if (mastSheetOpen()) { closeMastSheet(false); return; }
  shutSheetBars();
  $("mast").classList.add("open"); $("mast-burger").setAttribute("aria-expanded", "true"); dropOpen($("mast-nav"));
});
// CC-242: in the sheet, Review and your name are bars (aria-expanded) that open and shut their list, so the open sheet
// stays short. They start shut each time the sheet opens. On a wide screen the bars are hidden and the lists are menus.
var SHEET_BARS = [["rv-head", "rv-menu"], ["me-head", "me-menu"]];
function shutSheetBars() {
  if (!MAST_PHONE.matches) return;
  SHEET_BARS.forEach(function (b) { $(b[0]).setAttribute("aria-expanded", "false"); moveStop($(b[1])); $(b[1]).hidden = true; });
}
SHEET_BARS.forEach(function (b) {
  $(b[0]).addEventListener("click", function () {
    var open = $(b[0]).getAttribute("aria-expanded") !== "true";
    $(b[0]).setAttribute("aria-expanded", String(open)); dropToggle($(b[1]), open);
  });
});

// CC-242: on a phone the masthead is pinned, and the full one shrinks to the compact one over the first MAST_CUT px of
// scroll (its full height less its compact height, measured). site.css draws it from --shrink, 0 to 1. Its bottom margin
// gives back the height it has lost, so the page under it never moves and its bottom keeps pace with the content until
// it's compact. With reduced motion there's no in-between: full at the top, compact as soon as the page moves.
var MAST_CUT = 0, MAST_FULL_H = 0, MAST_WATER_H = 0, MAST_TICK = 0;
function mastShrink(y, cut, calm) {
  if (!(cut > 0) || !(y > 0)) return 0;
  return calm ? 1 : Math.min(1, y / cut);
}
function measureMast() {
  var m = $("mast"), tag = m.querySelector(".mast-tag"), brand = $("brand");
  ["--shrink", "--tag-h", "--brand-in", "--mast-full-h", "--mast-cut"].forEach(function (k) { m.style.removeProperty(k); });
  m.style.marginBottom = ""; m.classList.remove("mast-small"); MAST_CUT = 0;
  if (!MAST_PHONE.matches || !m.classList.contains("mast-full")) return;
  var words = document.createRange(); words.selectNodeContents(brand); // the wordmark itself, centred in the band
  m.style.setProperty("--tag-h", tag.getBoundingClientRect().height + "px");
  m.style.setProperty("--brand-in", Math.max(0, (brand.clientWidth - words.getBoundingClientRect().width) / 2) + "px");
  MAST_FULL_H = m.getBoundingClientRect().height;
  MAST_WATER_H = m.clientHeight; m.style.setProperty("--mast-full-h", MAST_WATER_H + "px");
  m.style.setProperty("--shrink", "1");
  MAST_CUT = MAST_FULL_H - m.getBoundingClientRect().height;
  paintShrink();
}
function paintShrink() {
  MAST_TICK = 0;
  if (!MAST_CUT) return;
  var m = $("mast"), s = mastShrink(window.scrollY, MAST_CUT, MOTION_CALM.matches);
  m.style.setProperty("--shrink", String(s));
  var h = m.getBoundingClientRect().height;
  m.style.marginBottom = (MAST_FULL_H - h) + "px";
  m.style.setProperty("--mast-cut", (MAST_WATER_H - m.clientHeight) + "px"); // the water keeps its full height, clipped to the band
  m.classList.toggle("mast-small", s === 1);
}
window.addEventListener("scroll", function () { if (MAST_CUT && !MAST_TICK) MAST_TICK = requestAnimationFrame(paintShrink); }, { passive: true });
window.addEventListener("resize", measureMast);
MAST_PHONE.addEventListener("change", measureMast);
MOTION_CALM.addEventListener("change", paintShrink);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(measureMast); // the wordmark's width needs its font
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
  else if (go === "account") openAccount(); else if (go === "crews") openCrews(); else if (go === "planner") openPlanner(); else if (go === "journal") openJournal(); else if (go === "submit") openSubmit(); else if (go === "review") openReview(); else if (go === "sourcing") openSourcing(); else if (go === "engagement") openEngagement(); else if (go === "people") openPeople(); else if (go === "venues") openVenues(); else if (go === "stats") openStats(); else if (go === "sources") openSources(); else if (go === "found") openFound(); else if (go === "issues") openIssues(); else if (go === "approvals") openApprovals(); else if (go === "members") openMembers(); else if (go === "card") openCard(); else if (go === "health") openHealth();
  else show("home");
});
