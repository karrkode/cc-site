// ---------- listings as rows (CC-140) ----------
// The catalog and the home page list events the way a newspaper's listings page does (design brief, section 5): rows
// under day heads ("Opening Friday, Oct 30"), each with its tile (the category field and the event's water), dates,
// name, venue and crew line, and price. The name is the link to the event's page, stretched over the whole row; the
// admin's dolphin beside it is the row's one button (CC-155). I've been, Interested/Going and sharing are on the event
// page (CC-117). Account's "Still deciding" keeps cardHTML.
"use strict";
var LISTING_DAY = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric" });
function listingDay(d) { return LISTING_DAY.format(d) + (d.getFullYear() === T.getFullYear() ? "" : ", " + d.getFullYear()); }

// The head an event sits under. "opening" (Opening soonest): the day it opens, or "On now" once it's running, which
// is the API's order (CC-132). "closing": the day it closes, soonest first. Any other sort keeps its order with no heads.
function listingHead(e, by) {
  if (by === "opening") return e.b && e.b > T ? "Opening " + listingDay(e.b) : "On now";
  if (by === "closing") return !e.n ? "Open run" : same(e.n, T) ? "Closes today" : "Closing " + listingDay(e.n);
  return "";
}

// The crew line: who from your crews is going or interested, as overlapping dots and "2 from your crew". The API
// sends names, not member ids, so a dot's tint (crewTone, crews.js) comes from the name. Been-only crew-mates are on the event page.
var LISTING_DOTS = 4;
function crewNames(e) {
  var seen = {}, names = [];
  e.crewPlans.forEach(function (c) {
    c.going.concat(c.interested).forEach(function (n) { if (!seen[n]) { seen[n] = true; names.push(n); } });
  });
  return names;
}
function listingCrewHTML(e) {
  var names = AUTH.user ? crewNames(e) : [];
  if (!names.length) return "";
  return '<span class="crewline"><span class="dots" aria-hidden="true">' + names.slice(0, LISTING_DOTS).map(function (n) {
    return '<span class="face tone-' + crewTone(n) + '">' + esc(initials(n)) + "</span>";
  }).join("") + "</span>" + names.length + " from your crew</span>";
}

function listingHTML(e) {
  var mine = AUTH.user ? MYPLANS[e.id] : null, going = !!mine && mine.status === "going";
  // CC-162: a dolphin on a row is only ever the admin's pick; your own plan shows as "Going Fri" under the date
  return '<div class="listing" data-listing="' + esc(e.id) + '">' +
    '<span class="tile water-field' + catClass(e.type) + '">' + waterHTML(e, "tile") + '<span class="tile-k">' + esc(e.label) + "</span></span>" +
    '<span class="listing-main"><span class="listing-t"><a class="listing-a" href="#e/' + esc(e.id) + '" data-ev-open="' + esc(e.id) + '">' +
    esc(e.title) + "</a>" + listingPickHTML(e) + "</span>" +
    '<span class="listing-where">' + esc(placeText(e)) + "</span>" +
    (e.suggestedBy ? '<span class="listing-where">Suggested by ' + esc(e.suggestedBy) + "</span>" : "") + listingCrewHTML(e) + "</span>" +
    '<span class="listing-meta"><span class="listing-when">' + esc(dateText(e)) +
    (going ? '<span class="going-day">Going ' + esc(goingDay(mine.date)) + "</span>" : "") + "</span>" +
    '<span class="listing-cost">' + esc(costText(e)) + "</span></span></div>";
}

// CC-155: the admin's pick beside the name, as a button that says what it means: its name is the event page's
// sentence ("Yours truly is committed to seeing this."), shown in a tip on hover, keyboard focus or a tap. The tip
// lives on the page body, like the crew counts' (crews.js), so the row's edges and the views' transforms don't clip it.
function listingPickHTML(e) {
  if (!e.pick) return "";
  return '<button type="button" class="row-pick" data-row-pick aria-label="' + esc(pickText(e.pick)) + '">' + pickMarkHTML(e.pick) + "</button>";
}
var ROW_TIP = { el: null, by: null, tapped: false }; // by: the button it's open for; tapped: opened by a click or tap
function rowTip(b, tapped) {
  if (!ROW_TIP.el) { ROW_TIP.el = document.createElement("div"); ROW_TIP.el.className = "crew-tip"; ROW_TIP.el.setAttribute("aria-hidden", "true"); document.body.appendChild(ROW_TIP.el); }
  ROW_TIP.by = b; ROW_TIP.tapped = !!(b && tapped);
  if (!b) { ROW_TIP.el.hidden = true; return; }
  var r = b.getBoundingClientRect(), tip = ROW_TIP.el;
  tip.textContent = b.getAttribute("aria-label"); tip.hidden = false;
  tip.style.left = Math.max(8, Math.min(r.left, window.innerWidth - tip.offsetWidth - 8)) + "px";
  tip.style.top = (r.top - tip.offsetHeight - 4 < 8 ? r.bottom + 4 : r.top - tip.offsetHeight - 4) + "px"; // below it at the top of the window
}
document.addEventListener("click", function (ev) {
  var b = ev.target.closest && ev.target.closest("[data-row-pick]");
  rowTip(b && !(ROW_TIP.by === b && ROW_TIP.tapped) ? b : null, true); // a tap opens it, a second tap or a tap elsewhere closes it
});
document.addEventListener("pointerover", function (ev) {
  if (ev.pointerType !== "mouse") return;
  var b = ev.target.closest && ev.target.closest("[data-row-pick]");
  if (b) { if (ROW_TIP.by !== b) rowTip(b); } else if (ROW_TIP.by && !ROW_TIP.tapped && ROW_TIP.by !== document.activeElement) rowTip(null);
});
document.addEventListener("focusin", function (ev) {
  var b = ev.target.closest && ev.target.closest("[data-row-pick]");
  if (b && b.matches(":focus-visible")) rowTip(b); else if (!b) rowTip(null);
});
document.addEventListener("keydown", function (ev) { if (ev.key === "Escape" && ROW_TIP.by) rowTip(null); });
document.addEventListener("scroll", function () { if (ROW_TIP.by) rowTip(null); }, true);

// Rows under their heads. Events with the same head are next to each other in every sort that has heads, so a new
// head starts whenever it changes.
function listingsHTML(items, by) {
  var html = "", head = null;
  items.forEach(function (e, i) {
    var h = listingHead(e, by);
    if (i === 0 || h !== head) {
      html += (i ? "</ul></section>" : "") + '<section class="listing-day">' + (h ? '<h3 class="listing-day-head">' + esc(h) + "</h3>" : "") + '<ul class="listings">';
      head = h;
    }
    html += "<li>" + listingHTML(e) + "</li>";
  });
  return items.length ? html + "</ul></section>" : "";
}

// Grey rows while the first page loads, so the list doesn't jump in from nothing. Screen readers hear the tally.
function listingGhostsHTML(n) {
  var row = '<li><span class="listing ghost"><span class="tile"></span><span class="listing-main"><span class="bar"></span><span class="bar short"></span></span></span></li>';
  return '<section class="listing-day" aria-hidden="true"><ul class="listings">' + new Array(n + 1).join(row) + "</ul></section>";
}
