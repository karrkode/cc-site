// Culture Crew site: The home page's "Last chance" list and the catalog with its filters.
// Loaded by index.html in order (core, util, catalog, planner, account, crews, submit, admin, hours, found, issues, photos, approvals, start); they share one
// global scope, so anything declared here is visible to the files after it.
"use strict";
// ---------- home: the front page (CC-143) ----------
// Three lists, each asked for on its own so one slow or failed request doesn't hold up the others: the lead pick,
// Last chance (events running today, soonest to close; open runs come last, then fall back to anything) and the
// first rows of the listings, opening soonest, as the catalog opens.
var SOON = [], LEAD = null, HOME_LIST = [], HOME_ROWS = 8;
function loadHome() {
  var t = isoDate(T);
  fetchEvents([["from", t], ["to", t], ["sort", "closing"], ["limit", 12]]).then(function (page) {
    var soon = page.items.filter(function (e) { return e.n && (!e.b || e.b <= T) && !e.openRun; }).slice(0, 4);
    if (soon.length) return soon;
    return fetchEvents([["from", t], ["sort", "closing"], ["limit", 4]]).then(function (p) { return p.items; });
  }).then(function (soon) { SOON = soon; renderHome(); }, function () {});
  Promise.all([fetchEvents([["from", t], ["picks", "going"], ["limit", 100]]), fetchEvents([["from", t], ["picks", "interested"], ["limit", 100]])])
    .then(function (r) { LEAD = leadPick(r[0].items, r[1].items); renderHome(); }, function () {});
  fetchEvents([["from", t], ["sort", "opening"], ["limit", HOME_ROWS]]).then(function (p) { HOME_LIST = p.items; renderHome(); }, function () {});
}

// The lead pick: the host's soonest upcoming "going" event (by the day they're going), otherwise their soonest
// "interested" one (by the day it's next on), otherwise none, and the column goes.
function leadNext(e) { return e.b && e.b > T ? e.b : T; }
function leadPick(going, interested) {
  var g = going.filter(function (e) { return e.pick && e.pick.status === "going" && !isPast(e) && (!e.pick.date || parseISO(e.pick.date) >= T); })
    .map(function (e) { return { e: e, d: e.pick.date ? parseISO(e.pick.date) : leadNext(e) }; });
  var i = interested.filter(function (e) { return e.pick && e.pick.status === "interested" && !isPast(e); })
    .map(function (e) { return { e: e, d: leadNext(e) }; });
  var first = function (list) { return list.sort(function (a, b) { return a.d - b.d || byClosing(a.e, b.e); })[0]; };
  var best = first(g) || first(i);
  return best ? best.e : null;
}
// Its deck, built from data (a note from the host is a later idea): where it is, then, signed in, who from your crews
// is in on it. With no crew-mates in, the run says when.
function leadDeck(e) {
  var where = "At " + e.venue + (e.hood ? " in " + e.hood : ""), going = {}, interested = {};
  if (AUTH.user) e.crewPlans.forEach(function (c) {
    c.going.forEach(function (n) { going[n] = true; });
    c.interested.forEach(function (n) { if (!going[n]) interested[n] = true; });
  });
  var g = Object.keys(going).length, i = Object.keys(interested).filter(function (n) { return !going[n]; }).length, crew = [];
  if (g) crew.push(g + " from your crew " + (g === 1 ? "is" : "are") + " going");
  if (i) crew.push((g ? i + " " : i + " from your crew ") + (i === 1 ? "is" : "are") + " interested");
  if (crew.length) return where + ". " + crew.join(", and ") + ".";
  if (oneNight(e)) return where + " on " + dateText(e) + ".";
  return where + (e.openRun || !e.b || !e.n ? "." : ", " + dateText(e).replace(" – ", " to ") + ".");
}
// The whole field is one link to the event. CC-144: .lead-pick is the element to give the poster's view-transition-name.
function leadHTML(e) {
  var p = e.pick, going = p.status === "going";
  var by = [going ? "Going" + (p.date ? " " + goingDay(p.date) : "") : "Interested", dateText(e), costText(e)].join(" · ");
  return '<a class="lead-pick water-field' + catClass(e.type) + '" href="#e/' + esc(e.id) + '" data-ev-open="' + esc(e.id) + '" data-lead="' + esc(e.id) + '">' +
    '<span class="lead-sea">' + waterHTML(e, "poster") + "</span>" +
    '<span class="lead-in"><span class="lead-k">The crew’s pick · ' + esc(e.label) + "</span>" +
    '<h2 class="lead-t">' + esc(e.title) + "</h2>" +
    '<span class="lead-deck">' + esc(leadDeck(e)) + "</span>" +
    '<span class="lead-by">' + markHTML("host", pickText(p)) + "<span>" + esc(by) + "</span></span></span></a>";
}
// A Last chance item: "Closes today" or "Closes Friday" in red, then the name, then venue · price.
function lastWhen(e) {
  if (!e.n || e.openRun) return "Open run";
  var left = diff(e.n, T);
  return left <= 0 ? "Closes today" : left <= 6 ? "Closes " + F.wd.format(e.n) : "Closes " + short(e.n);
}
function lastHTML(e) {
  return '<li><a class="last" href="#e/' + esc(e.id) + '" data-ev-open="' + esc(e.id) + '"><span class="last-w">' + esc(lastWhen(e)) + "</span>" +
    '<span class="last-t">' + esc(e.title) + "</span>" + '<span class="last-where">' + esc(placeText(e) + " · " + costText(e)) + "</span></a></li>";
}
function renderHome() {
  var slot = $("lead-slot"), html = LEAD ? leadHTML(LEAD) : "";
  if (slot.getAttribute("data-html") !== html) { slot.innerHTML = html; slot.setAttribute("data-html", html); paintWater(slot); } // the water redraws only when it changes
  slot.hidden = !LEAD; $("front").classList.toggle("no-lead", !LEAD); // with no lead pick, the other two share the width
  $("way-catalog-d").textContent = plural(FACETS.current, "event", "events") + ", opening soonest first.";
  $("way-crews-d").textContent = AUTH.user ? "Who’s going, and to what." : "The friends you go out with. Sign in to start one or join one."; // CC-103
  $("soon-list").innerHTML = SOON.map(lastHTML).join("");
  $("front-all").textContent = "All " + FACETS.current + " →";
  $("home-list").innerHTML = listingsHTML(HOME_LIST, "opening"); paintWater($("home-list")); // CC-140: rows under day heads
  $("foot").textContent = plural(FACETS.total, "event", "events") +
    " on the list, past and present. Dates and prices change, so check the event's page before you go.";
}
$("soon-more").addEventListener("click", function () { resetCatalog(); cat.sort = "closing"; cat.when = "week"; loadCatalog(); show("catalog"); });
$("front-all").addEventListener("click", function () { resetCatalog(); loadCatalog(); show("catalog"); });

// ---------- catalog ----------
// CC-132: the catalog opens on "Opening soonest"; the home page's Last chance list and its button keep closing order
var cat = { q: "", types: {}, hoods: {}, regions: {}, picks: {}, when: "upcoming", cost: "any", where: "any", sort: "opening", custom: null, crews: "" };
function resetCatalog() { cat = { q: "", types: {}, hoods: {}, regions: {}, picks: {}, when: "upcoming", cost: "any", where: "any", sort: "opening", custom: null, crews: "" }; }
// CC-66: the dolphin filters, for every visitor: the owner's picks (interested and/or committed).
function syncMineChips() {
  Array.prototype.forEach.call($("mine-chips").children, function (b) {
    b.setAttribute("aria-pressed", String(!!cat.picks[b.getAttribute("data-mine")]));
  });
  $("crews-chip").setAttribute("aria-pressed", String(cat.crews === "all"));
}
function catWindow() {
  var w = cat.when;
  if (w === "upcoming") return [T, null];
  if (w === "tonight") return [T, T];
  if (w === "weekend") return thisWeekend();
  if (w === "week") return [T, add(T, 6)];
  if (w === "custom" && cat.custom) return [cat.custom.ws, cat.custom.we];
  if (w.indexOf("m-") === 0) { var p = w.split("-"); var first = new Date(+p[1], +p[2] - 1, 1); return [first < T ? T : first, new Date(+p[1], +p[2], 0)]; }
  return [null, null];
}
function buildCatalogControls() {
  var opts = [["upcoming", "Now and upcoming"], ["tonight", "Tonight"], ["weekend", "This weekend"], ["week", "Next 7 days"]];
  for (var i = 0; i < 12; i++) { var m = new Date(T.getFullYear(), T.getMonth() + i, 1); opts.push(["m-" + m.getFullYear() + "-" + (m.getMonth() + 1), F.monthY.format(m)]); }
  opts.push(["past", "Already closed"]);
  $("f-when").innerHTML = opts.map(function (o) { return '<option value="' + o[0] + '">' + esc(o[1]) + "</option>"; }).join("") + '<option value="custom" id="f-when-custom" hidden></option>';
  buildWherePanel();
  $("type-chips").innerHTML = '<button type="button" class="chip" data-type="">All types</button>' +
    TYPES.map(function (t) { return '<button type="button" class="chip' + catClass(t) + '" data-type="' + esc(t) + '">' + esc(t) + "</button>"; }).join("");
  // CC-130: what the colours mean, for the categories that have one
  var keyed = TYPES.filter(function (t) { return CAT_KEYS[t]; });
  $("cat-legend").innerHTML = keyed.length ? "Colours: " + keyed.map(function (t) { return '<span class="' + catClass(t).trim() + '">' + esc(t) + "</span>"; }).join("") : "";
}
function syncCatalogControls() {
  costOption(); $("f-q").value = cat.q; $("f-cost").value = cat.cost; $("f-sort").value = cat.sort;
  paintWhere();
  var c = $("f-when-custom");
  if (cat.when === "custom" && cat.custom) { c.hidden = false; c.textContent = "Outing dates: " + windowText(cat.custom.ws, cat.custom.we); } else { c.hidden = true; }
  $("f-when").value = cat.when;
  var any = Object.keys(cat.types).length === 0;
  Array.prototype.forEach.call($("type-chips").children, function (b) {
    var t = b.getAttribute("data-type");
    b.setAttribute("aria-pressed", String(t ? !!cat.types[t] : any));
  });
  syncMineChips();
  paintActiveFilters();
}
var PAGE = 24, CAT_ITEMS = [], CAT_TOTAL = 0, CAT_REQ = 0;
var COST_MAX = { free: "0", u40: "39.99", u100: "99.99" }; // "under $40" = a lowest price below 40
// CC-128: the planner's top price comes over as "le40" (a lowest price of $40 or less); it gets its own option
function costMax(c) { return COST_MAX[c] || (/^le\d+$/.test(c) ? c.slice(2) : null); }
function costOption() {
  var sel = $("f-cost"), old = sel.querySelector("option[data-top]"), top = /^le\d+$/.test(cat.cost);
  if (old && (!top || old.value !== cat.cost)) old.remove();
  if (top && !sel.querySelector("option[data-top]")) {
    var o = document.createElement("option"); o.value = cat.cost; o.textContent = "Tickets from $" + cat.cost.slice(2) + " or less"; o.setAttribute("data-top", "");
    sel.appendChild(o);
  }
}
var WHERE_AREAS = { city: ["city"], suburbs: ["suburbs"], far: ["out_of_town"], local: ["city", "suburbs"] };
function catalogParams() {
  var p = [], w = catWindow();
  if (cat.when === "past") p.push(["ended_before", isoDate(T)]);
  else { if (w[0]) p.push(["from", isoDate(w[0])]); if (w[1]) p.push(["to", isoDate(w[1])]); }
  Object.keys(cat.types).forEach(function (t) { p.push(["category", t]); });
  Object.keys(cat.picks).forEach(function (m) { p.push(["picks", m]); });
  if (costMax(cat.cost)) p.push(["max_price", costMax(cat.cost)]);
  (WHERE_AREAS[cat.where] || []).forEach(function (a) { p.push(["area", a]); });
  Object.keys(cat.regions).forEach(function (r) { p.push(["region", r]); }); // sides of town (CC-73, CC-85)
  Object.keys(cat.hoods).forEach(function (h) { p.push(["hood", h]); }); // and neighborhoods: any of them
  if (cat.q.trim()) p.push(["q", cat.q.trim()]);
  if (cat.crews && AUTH.user) p.push(["crews", cat.crews]); // CC-75, CC-94: events your crews have plans for or have been to
  p.push(["sort", cat.sort === "az" || cat.sort === "price" || cat.sort === "closing" ? cat.sort : "opening"]);
  return p;
}
function loadCatalog(more) { // a fresh first page, or (more) the next one; replies to stale requests are dropped
  syncCatalogControls();
  var req = ++CAT_REQ, offset = more ? CAT_ITEMS.length : 0;
  if (!more) { $("tally").textContent = "Loading…"; if (!CAT_ITEMS.length) $("grid").innerHTML = listingGhostsHTML(3); }
  $("more-btn").disabled = true;
  return fetchEvents(catalogParams().concat([["limit", PAGE], ["offset", offset]])).then(function (page) {
    if (req !== CAT_REQ) return;
    CAT_ITEMS = more ? CAT_ITEMS.concat(page.items) : page.items; CAT_TOTAL = page.total;
    paintCatalog(more ? offset : 0);
  }, function () {
    if (req !== CAT_REQ) return;
    $("tally").textContent = "The events couldn't be loaded. Check your connection and try again.";
    if ($("grid").querySelector(".ghost")) $("grid").innerHTML = "";
    $("more-btn").disabled = false;
  });
}
function paintCatalog(focusFrom) {
  $("tally").innerHTML = "<strong>" + CAT_TOTAL + "</strong> " + (CAT_TOTAL === 1 ? "event" : "events") + (cat.when === "past" ? " already closed" : "") +
    (CAT_ITEMS.length < CAT_TOTAL ? ", showing " + CAT_ITEMS.length : "");
  syncMineChips();
  // CC-140: rows under day heads for Opening soonest and Closing soonest; already closed and the other sorts have none
  $("grid").innerHTML = CAT_ITEMS.length ? listingsHTML(CAT_ITEMS, cat.when === "past" ? "" : cat.sort) : cat.crews ?
    '<div class="list-state"><p><strong>Nothing from your crews matches.</strong></p><p class="hint">No crew-mate has marked an event like this as interested, committed or been. Widen the other filters, or turn off Your Crews Catalog to see everything.</p></div>' :
    Object.keys(cat.picks).length ?
    '<div class="list-state"><p><strong>No picks match.</strong></p><p class="hint">Widen the other filters, or turn off the dolphin filters to see everything.</p></div>' :
    '<div class="list-state"><p><strong>Nothing matches those filters.</strong></p><p class="hint">Try a wider date range or a higher price limit.</p></div>';
  paintWater($("grid"));
  $("more-row").hidden = CAT_ITEMS.length >= CAT_TOTAL; $("more-btn").disabled = false;
  $("sheet-show").textContent = CAT_TOTAL ? "Show " + plural(CAT_TOTAL, "event", "events") : "No events match";
  if (focusFrom) { var first = $("grid").querySelectorAll(".listing")[focusFrom]; if (first) first.focus(); } // the first new row
}
function renderCatalog() { loadCatalog(false); }
$("filters").addEventListener("submit", function (ev) { ev.preventDefault(); });
var Q_TIMER = null; // wait for a pause in typing before asking the API
$("f-q").addEventListener("input", function () { cat.q = this.value; clearTimeout(Q_TIMER); Q_TIMER = setTimeout(renderCatalog, 250); });
$("more-btn").addEventListener("click", function () { loadCatalog(true); });
["when", "cost", "sort"].forEach(function (k) {
  $("f-" + k).addEventListener("change", function () { cat[k] = this.value; if (k === "when" && this.value !== "custom") cat.custom = null; renderCatalog(); });
});

// ---------- Where: several places at once (CC-85) ----------
// "Where" is a button showing what's chosen ("Anywhere", "Lincoln Park, Lakeview +1"); it opens a checkbox list by
// side of town. Ticking a side takes all of it (cat.regions); ticking neighborhoods picks just those (cat.hoods).
// Events in any of them show. "Anywhere" and "City and suburbs" (cat.where) clear the ticks.
var WHERE_GROUPS = [], WHERE_TIMER = null;
function buildWherePanel() {
  var byRegion = {};
  FACETS.neighborhoods.forEach(function (h) { (byRegion[h.region || "other"] = byRegion[h.region || "other"] || []).push(h.name); });
  WHERE_GROUPS = REGIONS.map(function (r) { return { key: r[0], name: r[1], hoods: (byRegion[r[0]] || []).sort() }; })
    .concat(byRegion.other ? [{ key: "", name: "Other neighborhoods", hoods: byRegion.other.sort() }] : [])
    .filter(function (g) { return g.hoods.length; });
  var n = 0;
  $("f-where-panel").innerHTML = '<div class="chips segs where-quick" role="group" aria-label="Anywhere or city and suburbs"><button type="button" class="chip" data-where="any">Anywhere</button>' +
    '<button type="button" class="chip" data-where="local">City and suburbs</button></div>' +
    WHERE_GROUPS.map(function (g, gi) {
      var head = g.key ? '<label class="radio where-side"><input type="checkbox" data-where-region="' + esc(g.key) + '"> ' + esc(g.name) +
        ' <span class="hint small">(all)</span></label>' : '<p class="where-side" id="where-g-' + gi + '">' + esc(g.name) + "</p>";
      return '<div class="where-group" role="group" aria-label="' + esc(g.name) + '">' + head + '<div class="where-hoods">' + g.hoods.map(function (h) {
        n += 1;
        return '<label class="radio"><input type="checkbox" data-where-hood="' + esc(h) + '" data-where-in="' + esc(g.key) + '"> ' + esc(h) + "</label>";
      }).join("") + "</div></div>";
    }).join("") +
    '<div class="row where-foot"><button type="button" class="btn ghost" id="where-clear">Clear</button><button type="button" class="btn" id="where-done">Done</button></div>';
}
function whereLabel() {
  var names = Object.keys(cat.regions).map(function (r) { return REGION_NAMES[r] || r; }).concat(Object.keys(cat.hoods).sort());
  if (!names.length) return cat.where === "local" ? "City and suburbs" : "Anywhere";
  return names.length > 2 ? names.slice(0, 2).join(", ") + " +" + (names.length - 2) : names.join(", ");
}
function paintWhere() {
  $("f-where-btn").textContent = whereLabel();
  var places = Object.keys(cat.regions).length + Object.keys(cat.hoods).length;
  Array.prototype.forEach.call($("f-where-panel").querySelectorAll("[data-where]"), function (b) {
    b.setAttribute("aria-pressed", String(!places && b.getAttribute("data-where") === cat.where));
  });
  Array.prototype.forEach.call($("f-where-panel").querySelectorAll("[data-where-region]"), function (b) { b.checked = !!cat.regions[b.getAttribute("data-where-region")]; });
  Array.prototype.forEach.call($("f-where-panel").querySelectorAll("[data-where-hood]"), function (b) {
    b.checked = !!cat.hoods[b.getAttribute("data-where-hood")] || !!cat.regions[b.getAttribute("data-where-in")];
  });
}
function openWhere(open) {
  var panel = $("f-where-panel"), btn = $("f-where-btn");
  panel.hidden = !open; btn.setAttribute("aria-expanded", String(open));
  if (open) { // open towards whichever side has room, so it never runs off the screen
    panel.style.left = "0"; panel.style.right = "auto";
    var r = panel.getBoundingClientRect(), field = btn.parentElement.getBoundingClientRect();
    if (r.right > document.documentElement.clientWidth - 16) {
      panel.style.left = "auto"; panel.style.right = "0";
      if (panel.getBoundingClientRect().left < 16) { panel.style.right = "auto"; panel.style.left = (16 - field.left) + "px"; }
    }
  }
  if (open) { paintWhere(); (panel.querySelector('[aria-pressed="true"], input:checked') || panel.querySelector("button, input")).focus(); }
}
function whereChanged() { paintWhere(); clearTimeout(WHERE_TIMER); WHERE_TIMER = setTimeout(renderCatalog, 250); }
$("f-where-btn").addEventListener("click", function () { openWhere($("f-where-panel").hidden); });
$("f-where-panel").addEventListener("click", function (ev) {
  var quick = ev.target.closest("[data-where]");
  if (quick) { cat.where = quick.getAttribute("data-where"); cat.regions = {}; cat.hoods = {}; whereChanged(); return; }
  if (ev.target.id === "where-clear") { cat.where = "any"; cat.regions = {}; cat.hoods = {}; whereChanged(); return; }
  if (ev.target.id === "where-done") { openWhere(false); $("f-where-btn").focus(); }
});
$("f-where-panel").addEventListener("change", function (ev) {
  var box = ev.target, region = box.getAttribute("data-where-region"), hood = box.getAttribute("data-where-hood");
  cat.where = "any";
  if (region) { // a whole side of town; its neighborhoods are part of it, so they're not listed separately
    if (box.checked) {
      cat.regions[region] = 1;
      WHERE_GROUPS.filter(function (g) { return g.key === region; })[0].hoods.forEach(function (h) { delete cat.hoods[h]; });
    } else delete cat.regions[region];
  } else if (hood) {
    var side = box.getAttribute("data-where-in");
    if (!box.checked && side && cat.regions[side]) { // untick one place from a whole side: the side's other places stay
      delete cat.regions[side];
      WHERE_GROUPS.filter(function (g) { return g.key === side; })[0].hoods.forEach(function (h) { if (h !== hood) cat.hoods[h] = 1; });
    } else if (box.checked) cat.hoods[hood] = 1; else delete cat.hoods[hood];
  }
  whereChanged();
});
document.addEventListener("click", function (ev) { // a click elsewhere closes the list
  if ($("f-where-panel").hidden || ev.target.closest(".where-field")) return;
  openWhere(false);
});
$("f-where-panel").addEventListener("keydown", function (ev) {
  if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); openWhere(false); $("f-where-btn").focus(); } // in the Filters sheet, not the sheet too
});
$("type-chips").addEventListener("click", function (ev) {
  var b = ev.target.closest(".chip"); if (!b) return;
  var t = b.getAttribute("data-type");
  if (!t) cat.types = {}; else if (cat.types[t]) delete cat.types[t]; else cat.types[t] = 1;
  if (Object.keys(cat.types).length === TYPES.length) cat.types = {};
  renderCatalog();
});
$("mine-chips").addEventListener("click", function (ev) {
  var b = ev.target.closest("[data-mine]"); if (!b) return;
  var m = b.getAttribute("data-mine");
  if (cat.picks[m]) delete cat.picks[m]; else cat.picks[m] = 1;
  renderCatalog();
});
// CC-94: the Your Crews Catalog chip (it replaced CC-75's dropdown) shows for members of a crew: events other
// members of any of your crews are interested in, committed to, or have been to.
$("crews-chip").addEventListener("click", function () { cat.crews = cat.crews ? "" : "all"; renderCatalog(); });
function buildCrewFilter() {
  var mine = AUTH.user ? CREWS : [];
  $("crews-chips").hidden = !mine.length;
  if (cat.crews && !mine.length) { cat.crews = ""; if (visible("catalog")) renderCatalog(); }
  syncMineChips();
}
$("clear-filters").addEventListener("click", function () { resetCatalog(); renderCatalog(); $("f-q").focus(); });

// ---------- phones: the Filters sheet and the active-filter chips (CC-116) ----------
// At phone width When, Cost, Where and Sort sit behind one Filters button, so the first events show on the first
// screen. The button opens a sheet (the same fields, moved into it while it's open); the results update behind it
// as you change them. What's chosen shows as removable chips above the results, and as a count on the button.
var PHONE = window.matchMedia("(max-width: 640px)"), ACTIVE = []; // ACTIVE: [label, undo] for each chip
function optionText(id, value) { var o = $(id).querySelector('option[value="' + value + '"]'); return o ? o.textContent : value; }
function activeFilters() { // the ones the sheet hides; search, types and the dolphins stay in view
  var out = [];
  if (cat.when !== "upcoming") out.push([cat.when === "custom" && cat.custom ? windowText(cat.custom.ws, cat.custom.we) : optionText("f-when", cat.when), function () { cat.when = "upcoming"; cat.custom = null; }]);
  if (cat.cost !== "any") out.push([optionText("f-cost", cat.cost), function () { cat.cost = "any"; }]);
  if (cat.where === "local") out.push(["City and suburbs", function () { cat.where = "any"; }]);
  Object.keys(cat.regions).forEach(function (r) { out.push([REGION_NAMES[r] || r, function () { delete cat.regions[r]; }]); });
  Object.keys(cat.hoods).sort().forEach(function (h) { out.push([h, function () { delete cat.hoods[h]; }]); });
  return out;
}
function paintActiveFilters() {
  ACTIVE = activeFilters();
  $("active-filters").innerHTML = ACTIVE.map(function (f, i) {
    return '<button type="button" class="chip" data-drop="' + i + '" aria-label="Remove ' + esc(f[0]) + '">' + esc(f[0]) + '<span aria-hidden="true">×</span></button>';
  }).join("");
  $("filters-count").textContent = ACTIVE.length || "";
  $("filters-btn").setAttribute("aria-label", ACTIVE.length ? "Filters, " + ACTIVE.length + " on" : "Filters");
  // review finding 14: only when there's something to clear (the sort order isn't a filter)
  $("clear-filters").hidden = !(cat.q.trim() || Object.keys(cat.types).length || Object.keys(cat.picks).length || cat.crews || ACTIVE.length);
}
$("active-filters").addEventListener("click", function (ev) {
  var b = ev.target.closest("[data-drop]"); if (!b) return;
  var i = +b.getAttribute("data-drop");
  ACTIVE[i][1](); renderCatalog(); // repaints the chips at once
  ($("active-filters").children[Math.min(i, ACTIVE.length - 1)] || $("filters-btn")).focus(); // the next chip, or the button
});
$("filters-btn").addEventListener("click", function () {
  $("sheet-body").appendChild($("more-fields"));
  $("filter-sheet").showModal();
  $("f-when").focus();
});
$("filter-sheet").addEventListener("close", function () { // Escape, Close, Show N events or a tap outside
  openWhere(false);
  $("filters-btn").parentElement.insertBefore($("more-fields"), $("filters-btn"));
  if (PHONE.matches) $("filters-btn").focus();
});
$("filter-sheet").addEventListener("click", function (ev) {
  if (ev.target === this || ev.target.id === "sheet-close" || ev.target.id === "sheet-show") this.close(); // the dialog itself is only its backdrop
});
$("sheet-reset").addEventListener("click", function () {
  cat.when = "upcoming"; cat.custom = null; cat.cost = "any"; cat.where = "any"; cat.regions = {}; cat.hoods = {}; cat.sort = "opening";
  renderCatalog();
});
PHONE.addEventListener("change", function () { if (!PHONE.matches && $("filter-sheet").open) $("filter-sheet").close(); });

// ---------- the event view (CC-117) ----------
// A card opens its event here, at #e/<id>: the details, your plans and your crews', and Tickets as the way out
// to the venue. Back returns to where you came from (the catalog keeps its filters, pages and place). Share gives
// the event's public page (/e/<id>-<title>, CC-108), which anyone can open and which links back here.
var EV = { id: null, e: null, from: null, y: 0, pushed: false, req: 0, link: null }; // e: the event as GET /events/<id> gave it, with your crews' plans; link: the row that opened it
function evSlug(title) { // as the API makes it (app/seo.py slug): "Dead Girl's Quinceañera" -> "dead-girls-quinceanera"
  var s = title.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (s.length > 60) s = s.slice(0, 60).replace(/-[^-]*$/, "");
  return s || "event";
}
function evShareUrl(e) { return location.origin + "/e/" + e.id + "-" + evSlug(e.title); }
// One crew under Your crews (CC-142): a line each for who's going, interested and been, with their dots (circles are
// people). "" when nobody from it has the event on their list.
function evCrewHTML(c) {
  function line(names, one, many) {
    if (!names.length) return "";
    var short = names.map(shortName);
    var who = short.length > 2 ? short.slice(0, -1).join(", ") + " and " + short[short.length - 1] : short.join(" and ");
    return '<li class="ev-who"><span class="dots" aria-hidden="true">' + names.slice(0, 3).map(function (n) {
      return '<span class="face tone-' + crewTone(n) + '">' + esc(initials(n)) + "</span>";
    }).join("") + "</span><span>" + esc(who + (names.length === 1 ? one : many)) + "</span></li>";
  }
  var lines = line(c.going, " is going", " are going") + line(c.interested, " is interested", " are interested") + line(c.been, " has been", " have been");
  return lines ? '<div class="ev-crew"><h3>' + esc(c.crew_name) + "</h3><ul>" + lines + "</ul></div>" : "";
}
// The host's pick under Your crews, in the host's voice ("Yours truly is interested in this one."). CC-152: not when
// it's your own plan (an owner with the dolphins setting): that shows as your plan, not as somebody else's line.
function evHostHTML(e) {
  var me = AUTH.user && AUTH.user.dolphins && MYPLANS[e.id] ? (AUTH.user.display_name || "").trim() : null;
  if (!e.pick || e.pick.by === me) return "";
  return '<div class="ev-crew"><p class="ev-who">' + markHTML("host") + "<span>" + esc(pickText(e.pick)) + "</span></p></div>";
}
// CC-112: members' shared journal entries, newest first: three words, the review, who and whether they'd recommend
// it. Admins also see hidden ones (marked) and can hide or unhide each; the member's entry isn't touched.
function evTakesHTML(e) {
  if (!e.takes || !e.takes.length) return "";
  var admin = isAdmin();
  return '<section class="ev-takes" aria-labelledby="ev-takes-h"><h2 id="ev-takes-h">Takes</h2><ol>' +
    e.takes.map(function (t) {
      return '<li class="ev-take' + (t.hidden ? " is-hidden" : "") + '">' +
        '<p class="ev-take-words">' + t.words.split(" ").map(function (w) { return "<span>" + esc(w) + "</span>"; }).join("") + "</p>" +
        (t.review ? '<p class="ev-take-review">' + esc(t.review) + "</p>" : "") +
        '<p class="ev-take-by"><b>' + esc(t.name) + "</b>" + (t.recommend ? " · Would recommend" : "") + "</p>" +
        (admin && t.user_id ? '<div class="row ev-take-admin">' + (t.hidden ? '<span class="hint">Hidden from everyone but admins</span>' : "") +
          '<button class="btn ghost" type="button" data-take-hide="' + esc(t.user_id) + '" data-hidden="' + (t.hidden ? "0" : "1") + '">' +
          (t.hidden ? "Unhide" : "Hide") + "</button></div>" : "") +
        "</li>";
    }).join("") + "</ol></section>";
}
// CC-142: Interested and Going as buttons on the page (the cards' picker, laid out in it: the same data-myplan-*
// buttons, so account.js saves them). A one-night event needs no date. CC-154: a run shows its date field only once
// you're going: turning Going on takes the first day still open, and changing the date saves it (account.js).
function evPlanHTML(e) {
  var mine = MYPLANS[e.id], range = goingRange(e), id = esc(e.id);
  if (WENT[e.id] || (!mine && !range)) return ""; // been already, or closed with nothing planned
  var going = "";
  if (range) {
    var one = same(range[0], range[1]), on = !!mine && mine.status === "going", field = on && !one;
    going = '<button class="btn ghost" type="button" data-myplan-going="' + id + '"' + (field ? "" : ' data-date="' + isoDate(range[0]) + '"') +
      ' aria-pressed="' + on + '">' + markHTML("going") + "Going</button>" +
      (field ? '<input type="date" id="ev-going-day" aria-label="The day you’re going" min="' + isoDate(range[0]) + '" max="' + isoDate(range[1]) +
        '" value="' + esc(mine.date || isoDate(range[0])) + '">' : "");
  }
  return '<div class="ev-plan myplan" role="group" aria-label="Your plan for ' + esc(e.title) + '"><div class="row">' +
    '<button class="btn ghost" type="button" data-myplan-set="' + id + '" aria-pressed="' + (!!mine && mine.status === "interested") + '">' +
    markHTML("interested") + "Interested</button>" + going + "</div>" +
    (mine ? '<p class="ev-said">' + esc(myplanSaid(mine)) + '. <button class="textbtn" type="button" data-myplan-clear="' + id + '">Clear plan</button></p>' : "") +
    '<p class="form-error" role="alert"></p></div>';
}
// The page: "← The listings", the poster, then the facts and actions (and takes) beside your crews. The poster is one
// element, data-poster="<id>", for CC-144's tile-becomes-poster transition.
function eventViewHTML(e) {
  var st = eventStatus(e), past = isPast(e), facts = [["When", dateText(e)], ["Price", costText(e)]];
  var times = e.runDates.length ? runDatesText(e) : SHOW_TYPES[e.type] && !oneNight(e) && !past ? showDaysText(e.sched.weekly, e.sched.weeks) : "";
  if (times) facts.splice(1, 0, ["Shows", times]);
  var html = '<div class="poster water-field' + catClass(e.type) + '" data-poster="' + esc(e.id) + '">' + waterHTML(e, "poster") +
    '<div class="poster-in"><p class="poster-k">' + esc(e.label) + " · " + esc(st.label) + "</p>" +
    '<h1 id="event-title" tabindex="-1">' + esc(e.title) + "</h1>" +
    '<p class="poster-where">' + esc(placeText(e)) + "</p></div></div>";
  // data-card: the card buttons (I've been, crew sharing, a photo, Edit) find their event, and redraw it, the same way
  // here; .ev-panel keeps account.js from swapping it for a card
  var main = '<div class="ev-main ev-panel" data-card="' + esc(e.id) + '">' +
    (past ? '<p class="ev-closed">This run has closed.</p>' : "") +
    '<dl class="ev-facts">' + facts.map(function (f) { return "<dt>" + esc(f[0]) + "</dt><dd>" + esc(f[1]) + "</dd>"; }).join("") + "</dl>" +
    (e.suggestedBy ? '<p class="credit">Suggested by ' + esc(e.suggestedBy) + "</p>" : "") +
    '<div class="ev-actions">' +
      (e.url && !past ? '<a class="btn" href="' + esc(safeUrl(e.url)) + '" target="_blank" rel="noopener">Tickets and showtimes ↗</a>' : "") +
      '<button class="btn ghost" type="button" id="ev-share">Share</button>' +
    "</div>" +
    '<input class="share-url" id="ev-share-url" type="text" readonly aria-label="Link to this event" hidden>' +
    '<p class="hint small" id="ev-share-msg" role="status"></p>';
  // CC-144: once you're going, you head Your crews (turning Going on slides it in)
  var you = AUTH.user && MYPLANS[e.id] && MYPLANS[e.id].status === "going" ? '<div class="ev-you"><p class="ev-who"><span class="dots" aria-hidden="true">' +
    '<span class="face face-you">You</span></span><span>You’re going</span></p></div>' : "";
  var side = '<aside class="ev-side" aria-labelledby="ev-crews-h"><h2 id="ev-crews-h">Your crews</h2>' + you +
    evHostHTML(e);
  if (!AUTH.user) {
    main += "</div>";
    side += '<p class="hint">Sign in to mark it interested or going, and to see who from your crews is going.</p>' +
      '<button class="btn" type="button" id="ev-signin-btn">Sign in or create an account</button></aside>';
  } else {
    var more = (goingLater(e) && !WENT[e.id] ? "" : wentHTML(e)) + (WENT[e.id] ? photoButtonHTML(e) : crewShareToggleHTML(e)) +
      (isAdmin() ? editButtonHTML(e, "went") : "");
    main += evPlanHTML(e) + (more ? '<div class="ev-more">' + more + (WENT[e.id] ? "" : crewShareHTML(e)) + "</div>" : "") + "</div>";
    var crews = e.crewPlans.map(evCrewHTML).join("");
    side += crews || '<p class="hint">' + (CREWS.length ? "Nobody from your crews has this on their list yet." : "Start a crew to see who's going with you.") + "</p>";
    side += "</aside>";
  }
  return html + '<div class="ev-cols">' + main + side + evTakesHTML(e) + "</div>";
}
function renderEventView() {
  var e = EV.e && EV.e.id === EV.id ? EV.e : KNOWN[EV.id]; // a list fetched before sign-in may have replaced KNOWN's copy
  if (!e) return;
  if (POSTER.moving) { POSTER.redraw = true; return; } // CC-144: replacing the poster mid-move would cut it short; after
  var a = document.activeElement, first = !$("event-title"); // the details weren't there yet: focus waited on Back
  var keep = !a || a === document.body || a.id === "event-title" || (first && a.id === "ev-back");
  $("ev-body").innerHTML = eventViewHTML(e);
  paintWater($("ev-body"));
  evMotionCarry(e.id);
  if (keep && visible("event")) $("event-title").focus({ preventScroll: true });
}
// The event from the API: its details, and (signed in) your crews' plans, which depend on who's signed in.
function loadEventView() {
  var id = EV.id, req = ++EV.req;
  return api("/events/" + encodeURIComponent(id)).then(readJSON).then(function (res) {
    if (req !== EV.req) return; // another event was opened since
    $("ev-status").textContent = "";
    if (!res.ok) {
      EV.e = null;
      $("ev-body").innerHTML = '<h1 id="event-title" tabindex="-1">That event isn’t on the list</h1>' +
        '<p>It may have been taken down, or the link is wrong.</p><div class="row"><button class="btn" type="button" data-go="catalog">Browse the catalog</button></div>';
      $("event-title").focus({ preventScroll: true });
      return;
    }
    EV.e = toEvent(res.body); renderEventView();
  }, function () { if (req === EV.req) $("ev-status").textContent = errorText(null); });
}
// Open event id: push (from a card) adds #e/<id> to the history so Back comes back here; otherwise (a link or a
// reload) the address already says it.
function openEvent(id, push) {
  id = String(id);
  if (push) {
    var from = Object.keys(VIEWS).filter(visible)[0];
    EV.from = from && from !== "event" ? from : EV.from; EV.y = window.scrollY;
    try { history.pushState(null, "", "#e/" + id); EV.pushed = true; } catch (err) { EV.pushed = false; }
  } else {
    EV.pushed = false; EV.link = null; if (!visible("event")) EV.from = null;
    if (location.hash !== "#e/" + id) { try { history.replaceState(null, "", "#e/" + id); } catch (err) {} } // back from signing in: a reload stays here
  }
  EV.id = id; EV.e = null;
  $("ev-back").textContent = !EV.from || EV.from === "catalog" || EV.from === "home" ? "← The listings" : "← Back"; // CC-142
  $("ev-status").textContent = KNOWN[id] ? "" : "Loading…";
  $("ev-body").innerHTML = "";
  renderEventView();
  show("event", KNOWN[id] ? "event-title" : "ev-back");
  loadEventView();
}
// Back to the view the event was opened from, at the same place, with focus on the card that opened it (the poster
// shrinks back into its tile, CC-144).
function closeEvent() {
  var from = EV.from || "catalog", id = EV.id, link = EV.link;
  EV.from = null; EV.pushed = false; EV.link = null;
  if (from === "catalog" && !CAT_ITEMS.length) renderCatalog();
  // the row that opened it, unless a redraw replaced it since (a plan changed): then the same event's in that view
  if (!link || !link.isConnected || !$("view-" + from).contains(link)) link = document.querySelector('#view-' + from + ' [data-ev-open="' + id + '"]');
  posterMove(posterSource(link), true, function () {
    show(from);
    window.scrollTo(0, EV.y);
    if (link) link.focus({ preventScroll: true });
  });
}
document.addEventListener("click", function (ev) {
  var a = ev.target.closest("a[data-ev-open]");
  if (!a || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return; // a new tab: the href does it
  ev.preventDefault();
  var id = a.getAttribute("data-ev-open");
  posterMove(posterSource(a), false, function () { openEvent(id, true); EV.link = a; });
});

// ---------- tile becomes poster (CC-144) ----------
// Opening an event from a row's tile or the home lead, the tile grows into the poster and its title into the page's;
// Back shrinks them again. A same-document View Transition (brief, section 6): the two share the names "poster" and
// "ev-title" only for the swap, and only one of each is on the screen at a time (the other view is hidden). 440ms
// there, 340ms back, in site.css. Without the API, with reduced motion, or from anything without a tile (Last chance,
// a card, a reload or a deep link to #e/<id>), the view just changes.
var POSTER = { seq: 0, moving: false, redraw: false }; // redraw: the event page changed during the move
function posterSource(a) { // the tile and title that become the poster's, or null
  if (!a) return null;
  var tile = a.classList.contains("lead-pick") ? a : a.querySelector(".tile"), title = a.querySelector(".listing-t, .lead-t");
  return tile && title ? { tile: tile, title: title } : null;
}
function posterMove(src, back, swap) {
  if (!src || !document.startViewTransition || !motionOK()) { swap(); return; }
  var root = document.documentElement, seq = ++POSTER.seq;
  var name = function (on) { src.tile.style.viewTransitionName = on ? "poster" : ""; src.title.style.viewTransitionName = on ? "ev-title" : ""; };
  // a newer move skips this one; its names and classes are the newer one's to clear
  var done = function () {
    if (seq !== POSTER.seq) return;
    name(false); root.classList.remove("vt-poster", "vt-back"); POSTER.moving = false;
    if (POSTER.redraw) { POSTER.redraw = false; renderEventView(); } // the event's details came back while it moved
  };
  name(true); root.classList.add("vt-poster"); root.classList.toggle("vt-back", back); // .vt-poster names the poster (site.css)
  document.startViewTransition(function () { swap(); POSTER.moving = true; }).finished.then(done, done);
}

// ---------- the dolphins (CC-144) ----------
// Turning Going on, a dolphin leaps out of the button, over it and back in, and two lake rings ripple where it (CC-154: the lake dolphin, no red)
// lands; then "You're going" slides into Your crews. Turning Interested on, its lake dolphin nods. Turning either off
// just changes state, and so does everything with reduced motion. Saving redraws the page under them, so the leap and
// rings are fixed to the screen above it, and the nod carries on in the redrawn button (evMotionCarry).
var EV_MOTION = { nod: null, you: null }; // nod: { id, at } while it's playing; you: the event whose "You're going" slides in
var NOD = { keys: [{ transform: "translateY(0) rotate(0)" }, { transform: "translateY(-5px) rotate(-12deg)" }, { transform: "translateY(0) rotate(0)" }],
  opts: { duration: 360, easing: "cubic-bezier(.3,.7,.4,1)" } };
function evLeap(btn, id) {
  if (!motionOK() || !btn.animate) return;
  EV_MOTION.you = id;
  var icon = (btn.querySelector(".mark") || btn).getBoundingClientRect(), x = icon.left + icon.width / 2, y = icon.top + icon.height / 2;
  document.body.insertAdjacentHTML("beforeend", markHTML("interested")); // CC-154: the lake dolphin leaps
  var d = document.body.lastElementChild; d.classList.add("leaper");
  // from 64px left of the button's dolphin, up 86px, and nose-down back into it (#dolphin already leans −21°)
  var sx = x - 64, sy = y + 6, at = function (dx, dy, rot) { return "translate(" + (sx + dx - 22) + "px," + (sy + dy - 14) + "px) rotate(" + (rot + 21) + "deg)"; };
  d.animate([
    { transform: at(0, 0, -40), opacity: 0 },
    { transform: at(14, -40, -32), opacity: 1, offset: 0.2 },
    { transform: at(40, -86, -8), offset: 0.5 },
    { transform: at(62, -50, 34), offset: 0.78 },
    { transform: at(64, -6, 62), opacity: 1, offset: 0.94 },
    { transform: at(64, 4, 70), opacity: 0 }
  ], { duration: 760, easing: "cubic-bezier(.33,0,.4,1)" }).onfinish = function () { d.remove(); evRipples(x, y + 4); };
}
function evRipples(x, y) {
  [0, 130].forEach(function (delay) {
    var r = document.createElement("span"); r.className = "ripple"; r.setAttribute("aria-hidden", "true");
    document.body.appendChild(r);
    var at = "translate(" + x + "px," + y + "px) ";
    r.animate([{ transform: at + "scale(.2)", opacity: 0.9 }, { transform: at + "scale(1.6)", opacity: 0 }],
      { duration: 620, delay: delay, easing: "cubic-bezier(.2,.8,.2,1)", fill: "backwards" }).onfinish = function () { r.remove(); };
  });
}
function evNod(btn, id) {
  var m = btn.querySelector(".mark");
  if (!motionOK() || !m || !m.animate) return;
  EV_MOTION.nod = { id: id, at: performance.now() };
  m.animate(NOD.keys, NOD.opts);
}
// After the page is redrawn: a nod still playing goes on in the new button from where it was; "You're going" slides in.
function evMotionCarry(id) {
  var n = EV_MOTION.nod, b = $("ev-body");
  if (n && n.id === id) {
    var left = performance.now() - n.at, m = b.querySelector("[data-myplan-set] .mark");
    if (left >= NOD.opts.duration) EV_MOTION.nod = null;
    else if (m && m.animate) m.animate(NOD.keys, NOD.opts).currentTime = left;
  }
  var you = b.querySelector(".ev-you");
  if (EV_MOTION.you === id && you) {
    EV_MOTION.you = null;
    if (motionOK() && you.animate) you.animate([{ opacity: 0, height: "0px" }, { opacity: 1, height: you.offsetHeight + "px" }], { duration: 320, easing: "cubic-bezier(.2,.8,.2,1)" });
  }
}
$("ev-back").addEventListener("click", function () {
  if (EV.pushed) { history.back(); return; } // the popstate comes back to closeEvent()
  var to = EV.from || "catalog"; // CC-157: a link or a reload: this entry becomes the view it goes back to
  try { history.replaceState(null, "", to === "home" || to === "join" ? location.pathname + location.search : "/" + location.search + "#" + to); } catch (err) {}
  closeEvent();
});
$("ev-body").addEventListener("click", function (ev) {
  var t = ev.target;
  if (t.id === "ev-signin-btn") { AFTER_SIGN_IN = "e/" + EV.id; openAccount(); return; }
  var hide = t.closest("[data-take-hide]");
  if (hide) { // CC-112: an admin hides or unhides a take, then the view reloads with it marked
    hide.disabled = true;
    api("/admin/takes/" + encodeURIComponent(EV.id) + "/" + encodeURIComponent(hide.getAttribute("data-take-hide")),
      { method: "PUT", body: { hidden: hide.getAttribute("data-hidden") === "1" } }).then(readJSON).then(function (res) {
      if (!res.ok) { hide.disabled = false; $("ev-status").textContent = errorText(res); return; }
      loadEventView();
    }, function () { hide.disabled = false; $("ev-status").textContent = errorText(null); });
    return;
  }
  if (t.id !== "ev-share" || !KNOWN[EV.id]) return;
  var e = KNOWN[EV.id], url = evShareUrl(e), field = $("ev-share-url"), msg = $("ev-share-msg");
  var fallback = function () { field.value = url; field.hidden = false; field.focus(); field.select(); msg.textContent = "Copy the link above."; };
  if (navigator.share) { navigator.share({ title: e.title, url: url }).catch(function () {}); return; } // phones: the share sheet
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(function () { msg.textContent = "Link copied."; }, fallback);
  else fallback();
});
