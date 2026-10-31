// ---------- listings as rows (CC-140) ----------
// The catalog and the home page list events the way a newspaper's listings page does (design brief, section 5): rows
// under day heads ("Opening Friday, Oct 30"), each with its tile (the category field and the event's water), dates,
// name, venue and crew line, and price. The whole row is one link to the event's page, so a row holds no buttons:
// I've been, Interested/Going and sharing are on the event page (CC-117). Account's "Still deciding" keeps cardHTML.
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
  var marks = e.pick ? pickMarkHTML(e.pick, pickText(e.pick)) : "";
  return '<a class="listing" href="#e/' + esc(e.id) + '" data-ev-open="' + esc(e.id) + '" data-listing="' + esc(e.id) + '">' +
    '<span class="tile water-field' + catClass(e.type) + '">' + waterHTML(e, "tile") + '<span class="tile-k">' + esc(e.label) + "</span></span>" +
    '<span class="listing-main"><span class="listing-t">' + esc(e.title) + marks + "</span>" +
    '<span class="listing-where">' + esc(placeText(e)) + "</span>" +
    (e.suggestedBy ? '<span class="listing-where">Suggested by ' + esc(e.suggestedBy) + "</span>" : "") + listingCrewHTML(e) + "</span>" +
    '<span class="listing-meta"><span class="listing-when">' + esc(dateText(e)) +
    (going ? '<span class="going-day">Going ' + esc(goingDay(mine.date)) + "</span>" : "") + "</span>" +
    '<span class="listing-cost">' + esc(costText(e)) + "</span></span></a>";
}

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
