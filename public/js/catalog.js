// Culture Crew site: The home page's "Last chance" list and the catalog with its filters.
// Loaded by index.html in order (core, util, catalog, planner, account, submit, admin, start); they share one
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
var cat = { q: "", types: {}, hoods: {}, when: "upcoming", cost: "any", where: "any", sort: "closing", custom: null };
function resetCatalog() { cat = { q: "", types: {}, hoods: {}, when: "upcoming", cost: "any", where: "any", sort: "closing", custom: null }; }
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
  var city = {}, burbs = {}, far = {};
  FACETS.neighborhoods.forEach(function (h) { (h.area === "suburbs" ? burbs : h.area === "out_of_town" ? far : city)[h.name] = 1; });
  function group(label, set) {
    var names = Object.keys(set).sort(); if (!names.length) return "";
    return '<optgroup label="' + label + '">' + names.map(function (n) { return '<option value="h:' + esc(n) + '">' + esc(n) + "</option>"; }).join("") + "</optgroup>";
  }
  $("f-where").innerHTML = '<option value="any">Anywhere</option><option value="local">City and suburbs</option><option value="city">In the city</option><option value="suburbs">In the suburbs</option>' +
    (Object.keys(far).length ? '<option value="far">Out of town</option>' : "") +
    group("City neighborhoods", city) + group("Suburbs", burbs) + group("Out of town", far) + '<option value="custom" id="f-where-custom" hidden></option>';
  $("type-chips").innerHTML = '<button type="button" class="chip" data-type="">All types</button>' +
    TYPES.map(function (t) { return '<button type="button" class="chip" data-type="' + esc(t) + '">' + esc(t) + "</button>"; }).join("");
}
function syncCatalogControls() {
  $("f-q").value = cat.q; $("f-cost").value = cat.cost; var wc = $("f-where-custom"), hn = Object.keys(cat.hoods);
  if (hn.length) { wc.hidden = false; wc.textContent = "Your neighborhoods: " + hn.sort().join(", "); $("f-where").value = "custom"; } else { wc.hidden = true; $("f-where").value = cat.where; } $("f-sort").value = cat.sort;
  var c = $("f-when-custom");
  if (cat.when === "custom" && cat.custom) { c.hidden = false; c.textContent = "Outing dates: " + windowText(cat.custom.ws, cat.custom.we); } else { c.hidden = true; }
  $("f-when").value = cat.when;
  var any = Object.keys(cat.types).length === 0;
  Array.prototype.forEach.call($("type-chips").children, function (b) {
    var t = b.getAttribute("data-type");
    b.setAttribute("aria-pressed", String(t ? !!cat.types[t] : any));
  });
}
var PAGE = 24, CAT_ITEMS = [], CAT_TOTAL = 0, CAT_REQ = 0;
var COST_MAX = { free: "0", u40: "39.99", u100: "99.99" }; // "under $40" = a lowest price below 40
var WHERE_AREAS = { city: ["city"], suburbs: ["suburbs"], far: ["out_of_town"], local: ["city", "suburbs"] };
function catalogParams() {
  var p = [], w = catWindow();
  if (cat.when === "past") p.push(["ended_before", isoDate(T)]);
  else { if (w[0]) p.push(["from", isoDate(w[0])]); if (w[1]) p.push(["to", isoDate(w[1])]); }
  Object.keys(cat.types).forEach(function (t) { p.push(["category", t]); });
  if (COST_MAX[cat.cost]) p.push(["max_price", COST_MAX[cat.cost]]);
  (WHERE_AREAS[cat.where] || []).forEach(function (a) { p.push(["area", a]); });
  if (cat.where.indexOf("h:") === 0) p.push(["hood", cat.where.slice(2)]);
  Object.keys(cat.hoods).forEach(function (h) { p.push(["hood", h]); });
  if (cat.q.trim()) p.push(["q", cat.q.trim()]);
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
  $("grid").innerHTML = CAT_ITEMS.length ? CAT_ITEMS.map(cardHTML).join("") :
    '<div class="empty" style="grid-column:1/-1"><p><strong>Nothing matches those filters.</strong></p><p class="hint">Try a wider date range or a higher price limit.</p></div>';
  $("more-row").hidden = CAT_ITEMS.length >= CAT_TOTAL; $("more-btn").disabled = false;
  if (focusFrom) { var first = $("grid").children[focusFrom]; var a = first && first.querySelector("h3 a"); if (a) a.focus(); }
}
function renderCatalog() { loadCatalog(false); }
$("filters").addEventListener("submit", function (ev) { ev.preventDefault(); });
var Q_TIMER = null; // wait for a pause in typing before asking the API
$("f-q").addEventListener("input", function () { cat.q = this.value; clearTimeout(Q_TIMER); Q_TIMER = setTimeout(renderCatalog, 250); });
$("more-btn").addEventListener("click", function () { loadCatalog(true); });
["when", "cost", "where", "sort"].forEach(function (k) {
  $("f-" + k).addEventListener("change", function () { cat[k] = this.value; if (k === "when" && this.value !== "custom") cat.custom = null; if (k === "where") cat.hoods = {}; renderCatalog(); });
});
$("type-chips").addEventListener("click", function (ev) {
  var b = ev.target.closest(".chip"); if (!b) return;
  var t = b.getAttribute("data-type");
  if (!t) cat.types = {}; else if (cat.types[t]) delete cat.types[t]; else cat.types[t] = 1;
  if (Object.keys(cat.types).length === TYPES.length) cat.types = {};
  renderCatalog();
});
$("clear-filters").addEventListener("click", function () { resetCatalog(); renderCatalog(); $("f-q").focus(); });
