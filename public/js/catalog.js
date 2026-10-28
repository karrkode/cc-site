// Culture Crew site: The home page's "Last chance" list and the catalog with its filters.
// Loaded by index.html in order (core, util, catalog, planner, account, crews, submit, admin, hours, found, issues, photos, approvals, start); they share one
// global scope, so anything declared here is visible to the files after it.
"use strict";
// ---------- home ----------
var SOON = [];
function loadHome() { // events running today, soonest to close (open runs come last, then fall back to anything)
  return fetchEvents([["from", isoDate(T)], ["to", isoDate(T)], ["sort", "closing"], ["limit", 12]]).then(function (page) {
    var soon = page.items.filter(function (e) { return e.n && (!e.b || e.b <= T) && !e.openRun; }).slice(0, 4);
    if (soon.length) return soon;
    return fetchEvents([["from", isoDate(T)], ["sort", "closing"], ["limit", 4]]).then(function (p) { return p.items; });
  }).then(function (soon) { SOON = soon; renderHome(); }, function () {});
}
function renderHome() {
  $("door-catalog-count").textContent = plural(FACETS.current, "event", "events") + " on the list";
  $("door-crews-desc").textContent = AUTH.user ? "See what your crews are planning, and who's been where." : // CC-103
    "Crews are the friends you go out with. Sign in to start one or join one.";
  $("soon-list").innerHTML = SOON.map(function (e) { return "<li>" + cardHTML(e) + "</li>"; }).join("");
  $("foot").textContent = plural(FACETS.total, "event", "events") +
    " on the list, past and present. Dates and prices change, so check the event's page before you go.";
}
$("soon-more").addEventListener("click", function () { resetCatalog(); cat.sort = "closing"; cat.when = "week"; loadCatalog(); show("catalog"); });

// ---------- catalog ----------
var cat = { q: "", types: {}, hoods: {}, regions: {}, picks: {}, when: "upcoming", cost: "any", where: "any", sort: "closing", custom: null, crews: "" };
function resetCatalog() { cat = { q: "", types: {}, hoods: {}, regions: {}, picks: {}, when: "upcoming", cost: "any", where: "any", sort: "closing", custom: null, crews: "" }; }
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
  $("f-q").value = cat.q; $("f-cost").value = cat.cost; $("f-sort").value = cat.sort;
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
var WHERE_AREAS = { city: ["city"], suburbs: ["suburbs"], far: ["out_of_town"], local: ["city", "suburbs"] };
function catalogParams() {
  var p = [], w = catWindow();
  if (cat.when === "past") p.push(["ended_before", isoDate(T)]);
  else { if (w[0]) p.push(["from", isoDate(w[0])]); if (w[1]) p.push(["to", isoDate(w[1])]); }
  Object.keys(cat.types).forEach(function (t) { p.push(["category", t]); });
  Object.keys(cat.picks).forEach(function (m) { p.push(["picks", m]); });
  if (COST_MAX[cat.cost]) p.push(["max_price", COST_MAX[cat.cost]]);
  (WHERE_AREAS[cat.where] || []).forEach(function (a) { p.push(["area", a]); });
  Object.keys(cat.regions).forEach(function (r) { p.push(["region", r]); }); // sides of town (CC-73, CC-85)
  Object.keys(cat.hoods).forEach(function (h) { p.push(["hood", h]); }); // and neighborhoods: any of them
  if (cat.q.trim()) p.push(["q", cat.q.trim()]);
  if (cat.crews && AUTH.user) p.push(["crews", cat.crews]); // CC-75, CC-94: events your crews have plans for or have been to
  p.push(["sort", cat.sort === "az" || cat.sort === "price" || cat.sort === "opening" ? cat.sort : "closing"]);
  return p;
}
function loadCatalog(more) { // a fresh first page, or (more) the next one; replies to stale requests are dropped
  syncCatalogControls();
  var req = ++CAT_REQ, offset = more ? CAT_ITEMS.length : 0;
  if (!more) { $("tally").textContent = "Loading…"; }
  $("more-btn").disabled = true;
  return fetchEvents(catalogParams().concat([["limit", PAGE], ["offset", offset]])).then(function (page) {
    if (req !== CAT_REQ) return;
    CAT_ITEMS = more ? CAT_ITEMS.concat(page.items) : page.items; CAT_TOTAL = page.total;
    paintCatalog(more ? offset : 0);
  }, function () {
    if (req !== CAT_REQ) return;
    $("tally").textContent = "The events couldn't be loaded. Check your connection and try again.";
    $("more-btn").disabled = false;
  });
}
function paintCatalog(focusFrom) {
  $("tally").innerHTML = "<strong>" + CAT_TOTAL + "</strong> " + (CAT_TOTAL === 1 ? "event" : "events") + (cat.when === "past" ? " already closed" : "") +
    (CAT_ITEMS.length < CAT_TOTAL ? ", showing " + CAT_ITEMS.length : "");
  syncMineChips();
  $("grid").innerHTML = CAT_ITEMS.length ? CAT_ITEMS.map(cardHTML).join("") : cat.crews ?
    '<div class="empty" style="grid-column:1/-1"><p><strong>Nothing from your crews matches.</strong></p><p class="hint">No crew-mate has marked an event like this as interested, committed or been. Widen the other filters, or turn off Your Crews Catalog to see everything.</p></div>' :
    Object.keys(cat.picks).length ?
    '<div class="empty" style="grid-column:1/-1"><p><strong>No picks match.</strong></p><p class="hint">Widen the other filters, or turn off the dolphin filters to see everything.</p></div>' :
    '<div class="empty" style="grid-column:1/-1"><p><strong>Nothing matches those filters.</strong></p><p class="hint">Try a wider date range or a higher price limit.</p></div>';
  $("more-row").hidden = CAT_ITEMS.length >= CAT_TOTAL; $("more-btn").disabled = false;
  $("sheet-show").textContent = CAT_TOTAL ? "Show " + plural(CAT_TOTAL, "event", "events") : "No events match";
  if (focusFrom) { var first = $("grid").children[focusFrom]; var a = first && first.querySelector("h3 a"); if (a) a.focus(); }
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
  $("f-where-panel").innerHTML = '<div class="row where-quick"><button type="button" class="chip" data-where="any">Anywhere</button>' +
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
  cat.when = "upcoming"; cat.custom = null; cat.cost = "any"; cat.where = "any"; cat.regions = {}; cat.hoods = {}; cat.sort = "closing";
  renderCatalog();
});
PHONE.addEventListener("change", function () { if (!PHONE.matches && $("filter-sheet").open) $("filter-sheet").close(); });

// ---------- the event view (CC-117) ----------
// A card opens its event here, at #e/<id>: the details, your plans and your crews', and Tickets as the way out
// to the venue. Back returns to where you came from (the catalog keeps its filters, pages and place). Share gives
// the event's public page (/e/<id>-<title>, CC-108), which anyone can open and which links back here.
var EV = { id: null, e: null, from: null, y: 0, pushed: false, req: 0 }; // e: the event as GET /events/<id> gave it, with your crews' plans
function evSlug(title) { // as the API makes it (app/seo.py slug): "Dead Girl's Quinceañera" -> "dead-girls-quinceanera"
  var s = title.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (s.length > 60) s = s.slice(0, 60).replace(/-[^-]*$/, "");
  return s || "event";
}
function evShareUrl(e) { return location.origin + "/e/" + e.id + "-" + evSlug(e.title); }
// "Maya C. is going" / "Ben K. and Jordan R. have been", for one crew
function evCrewLine(c) {
  function who(names) {
    names = names.map(shortName);
    return names.length > 2 ? names.slice(0, -1).join(", ") + " and " + names[names.length - 1] : names.join(" and ");
  }
  var parts = [];
  if (c.going.length) parts.push(who(c.going) + (c.going.length === 1 ? " is going" : " are going"));
  if (c.interested.length) parts.push(who(c.interested) + (c.interested.length === 1 ? " is interested" : " are interested"));
  if (c.been.length) parts.push(who(c.been) + (c.been.length === 1 ? " has been" : " have been"));
  return parts.join(" · ");
}
// CC-112: members' shared journal entries, newest first: three words, the review, who and whether they'd recommend
// it. Admins also see hidden ones (marked) and can hide or unhide each; the member's entry isn't touched.
function evTakesHTML(e) {
  if (!e.takes || !e.takes.length) return "";
  var admin = isAdmin();
  return '<section class="section ev-takes" aria-labelledby="ev-takes-h"><h2 id="ev-takes-h">From people who went</h2><ol>' +
    e.takes.map(function (t) {
      return '<li class="ev-take' + (t.hidden ? " is-hidden" : "") + '">' +
        '<p class="ev-take-words">' + t.words.split(" ").map(function (w) { return "<span>" + esc(w) + "</span>"; }).join("") + "</p>" +
        (t.review ? '<p class="ev-take-review">' + esc(t.review) + "</p>" : "") +
        '<p class="ev-take-by"><b>' + esc(t.name) + "</b>" + (t.recommend ? " · Would recommend" : "") + "</p>" +
        (admin && t.user_id ? '<div class="row ev-take-admin">' + (t.hidden ? '<span class="pill">Hidden from everyone but admins</span>' : "") +
          '<button class="btn ghost" type="button" data-take-hide="' + esc(t.user_id) + '" data-hidden="' + (t.hidden ? "0" : "1") + '">' +
          (t.hidden ? "Unhide" : "Hide") + "</button></div>" : "") +
        "</li>";
    }).join("") + "</ol></section>";
}
function eventViewHTML(e) {
  var st = eventStatus(e), past = isPast(e), facts = [["When", dateText(e)], ["Price", costText(e)]];
  var times = e.runDates.length ? runDatesText(e) : SHOW_TYPES[e.type] && !oneNight(e) && !past ? showDaysText(e.sched.weekly, e.sched.weeks) : "";
  if (times) facts.splice(1, 0, ["Shows", times]);
  var html = '<div class="card-top' + catClass(e.type) + '"><span class="kind">' + esc(e.label) + '</span><span class="pill ' + st.tone + '">' + esc(st.label) + "</span></div>" +
    '<h1 id="event-title" tabindex="-1">' + esc(e.title) + "</h1>" +
    '<p class="ev-place">' + placeHTML(e) + "</p>" +
    (past ? '<p class="ev-closed">This run has closed.</p>' : "") +
    '<dl class="ev-facts">' + facts.map(function (f) { return "<dt>" + esc(f[0]) + "</dt><dd>" + esc(f[1]) + "</dd>"; }).join("") + "</dl>" +
    (e.suggestedBy ? '<p class="credit">Suggested by ' + esc(e.suggestedBy) + "</p>" : "") +
    '<div class="row ev-actions">' +
      (e.url && !past ? '<a class="btn" href="' + esc(safeUrl(e.url)) + '" target="_blank" rel="noopener">Tickets and showtimes ↗</a>' : "") +
      '<button class="btn ghost" type="button" id="ev-share">Share</button>' +
    "</div>" +
    '<input class="share-url" id="ev-share-url" type="text" readonly aria-label="Link to this event" hidden>' +
    '<p class="hint small" id="ev-share-msg" role="status"></p>';
  if (!AUTH.user) {
    return html + evTakesHTML(e) + '<div class="panel ev-signin"><p>Sign in to mark it interested or going, and to see who from your crews is going.</p>' +
      '<div class="row"><button class="btn" type="button" id="ev-signin-btn">Sign in or create an account</button></div></div>';
  }
  // data-card: the card buttons find their event, and redraw it, the same way here (account.js redrawCards)
  html += '<section class="section ev-panel" data-card="' + esc(e.id) + '" aria-labelledby="ev-mine-h"><h2 id="ev-mine-h">Your plans</h2>' +
    (MYPLANS[e.id] ? '<p class="hint">' + esc(myplanSaid(MYPLANS[e.id])) + ".</p>" : WENT[e.id] ? "<p class=\"hint\">You've been.</p>" : "") +
    cardActionsHTML(e) + "</section>";
  var crews = e.crewPlans.filter(function (c) { return evCrewLine(c); });
  html += '<section class="section ev-crews" aria-labelledby="ev-crews-h"><h2 id="ev-crews-h">Your crews</h2>' +
    (crews.length ? '<ul class="ev-crew-list">' + crews.map(function (c) {
      return '<li><span class="ev-crew-name">' + esc(c.crew_name) + "</span> " + esc(evCrewLine(c)) + "</li>";
    }).join("") + "</ul>" :
      '<p class="hint">' + (CREWS.length ? "Nobody from your crews has this on their list yet." : "Start a crew to see who's going with you.") + "</p>") +
    "</section>";
  return html + evTakesHTML(e);
}
function renderEventView() {
  var e = EV.e && EV.e.id === EV.id ? EV.e : KNOWN[EV.id]; // a list fetched before sign-in may have replaced KNOWN's copy
  if (!e) return;
  var a = document.activeElement, first = !$("event-title"); // the details weren't there yet: focus waited on Back
  var keep = !a || a === document.body || a.id === "event-title" || (first && a.id === "ev-back");
  $("ev-body").innerHTML = eventViewHTML(e);
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
    EV.pushed = false; if (!visible("event")) EV.from = null;
    if (location.hash !== "#e/" + id) { try { history.replaceState(null, "", "#e/" + id); } catch (err) {} } // back from signing in: a reload stays here
  }
  EV.id = id; EV.e = null;
  $("ev-status").textContent = KNOWN[id] ? "" : "Loading…";
  $("ev-body").innerHTML = "";
  renderEventView();
  show("event", KNOWN[id] ? "event-title" : "ev-back");
  loadEventView();
}
// Back to the view the event was opened from, at the same place, with focus on the card that opened it.
function closeEvent() {
  var from = EV.from || "catalog", id = EV.id;
  EV.from = null; EV.pushed = false;
  if (from === "catalog" && !CAT_ITEMS.length) renderCatalog();
  show(from);
  window.scrollTo(0, EV.y);
  var link = document.querySelector('#view-' + from + ' [data-ev-open="' + id + '"]');
  if (link) link.focus({ preventScroll: true });
}
document.addEventListener("click", function (ev) {
  var a = ev.target.closest("a[data-ev-open]");
  if (!a || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return; // a new tab: the href does it
  ev.preventDefault();
  openEvent(a.getAttribute("data-ev-open"), true);
});
$("ev-back").addEventListener("click", function () {
  if (EV.pushed) { history.back(); return; } // the hashchange comes back to closeEvent()
  try { history.replaceState(null, "", location.pathname + location.search); } catch (err) {}
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
