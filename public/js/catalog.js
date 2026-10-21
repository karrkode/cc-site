// Culture Crew site: The home page's "Last chance" list and the catalog with its filters.
// Loaded by index.html in order (core, util, catalog, planner, account, crews, submit, admin, hours, found, issues, photos, start); they share one
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
  var words = { "Theater": "plays and musicals", "Comedy": "comedy nights", "Concert": "concerts", "Visual Art": "exhibitions" };
  var kinds = TYPES.map(function (t) { return words[t] || t.toLowerCase(); });
  var listed = kinds.length > 1 ? kinds.slice(0, -1).join(", ") + " and " + kinds[kinds.length - 1] : kinds[0];
  $("home-lede").textContent = "A running list of " + listed + " around Chicago. Look through all of it, or answer four questions and get one outing.";
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
    TYPES.map(function (t) { return '<button type="button" class="chip" data-type="' + esc(t) + '">' + esc(t) + "</button>"; }).join("");
}
function syncCatalogControls() {
  $("f-q").value = cat.q; $("f-cost").value = cat.cost; $("f-crews").value = cat.crews; $("f-sort").value = cat.sort;
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
  if (cat.crews && AUTH.user) p.push(["crews", cat.crews]); // CC-75: events your crews have plans for
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
  $("grid").innerHTML = CAT_ITEMS.length ? CAT_ITEMS.map(cardHTML).join("") : Object.keys(cat.picks).length ?
    '<div class="empty" style="grid-column:1/-1"><p><strong>No picks match.</strong></p><p class="hint">Widen the other filters, or turn off the dolphin filters to see everything.</p></div>' :
    '<div class="empty" style="grid-column:1/-1"><p><strong>Nothing matches those filters.</strong></p><p class="hint">Try a wider date range or a higher price limit.</p></div>';
  $("more-row").hidden = CAT_ITEMS.length >= CAT_TOTAL; $("more-btn").disabled = false;
  if (focusFrom) { var first = $("grid").children[focusFrom]; var a = first && first.querySelector("h3 a"); if (a) a.focus(); }
}
function renderCatalog() { loadCatalog(false); }
$("filters").addEventListener("submit", function (ev) { ev.preventDefault(); });
var Q_TIMER = null; // wait for a pause in typing before asking the API
$("f-q").addEventListener("input", function () { cat.q = this.value; clearTimeout(Q_TIMER); Q_TIMER = setTimeout(renderCatalog, 250); });
$("more-btn").addEventListener("click", function () { loadCatalog(true); });
["when", "cost", "sort", "crews"].forEach(function (k) {
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
  if (ev.key === "Escape") { ev.stopPropagation(); openWhere(false); $("f-where-btn").focus(); }
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
// CC-75: "Your crews' plans" shows for members of a crew: everything, all your crews, or one crew.
function buildCrewFilter() {
  var mine = AUTH.user ? CREWS : [];
  $("f-crews-field").hidden = !mine.length;
  $("f-crews").innerHTML = '<option value="">Everything</option>' + (mine.length ? '<option value="all">All my crews</option>' : "") +
    mine.map(function (c) { return '<option value="' + esc(c.id) + '">' + esc(c.name) + "</option>"; }).join("");
  if (cat.crews && !(cat.crews === "all" && mine.length) && !mine.some(function (c) { return String(c.id) === cat.crews; })) {
    cat.crews = ""; if (visible("catalog")) renderCatalog();
  }
  $("f-crews").value = cat.crews;
}
$("clear-filters").addEventListener("click", function () { resetCatalog(); renderCatalog(); $("f-q").focus(); });
