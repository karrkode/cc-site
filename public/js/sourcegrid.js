// Culture Crew site: the grid on Event sources (admins, CC-221): a block per source, coloured by how its reading goes
// and sized by the venue's approved events. Hover, focus or a tap shows three options, and each opens a panel under the
// block's row that pushes the rest down. admin.js keeps loading the sources, the filters and the Settings buttons' actions.
"use strict";
var SG_OPEN = null, SG_SAID = "", SG_REQ = 0; // SG_OPEN: { id, tab }. SG_SAID: what the last save said, kept across the repaint
var SG_PAUSE = 300; // the panel's transition in site.css
var SG_TABS = [["events", "Events"], ["health", "Health"], ["settings", "Settings"]];
var SG_STATES = { ok: "Reading fine", nothing: "Reads fine, no events found", error: "Can't be read", manual: "Checked by hand", "new": "Not read yet", off: "Turned off" };

function sgFind(id) { return SOURCES ? SOURCES.sources.filter(function (s) { return s.id === id; })[0] : null; }
// Largest first, ties A to Z, and turned-off sources last
function sgSorted(list) {
  return list.slice().sort(function (a, b) {
    return (a.state === "off") - (b.state === "off") || b.events_year - a.events_year || a.label.localeCompare(b.label);
  });
}
// The last block that starts above the bottom of block i: the panel goes after it, so the row stays whole above the panel.
function sgRowEnd(boxes, i) {
  var end = i;
  boxes.forEach(function (b, j) { if (b.top < boxes[i].bottom) end = j; });
  return end;
}
function sgBlockHTML(s) {
  var name = esc(s.label), open = SG_OPEN && SG_OPEN.id === s.id;
  return '<div class="sg-block sg-size' + esc(s.size) + " sg-" + esc(s.state) + (open ? " is-open on" : "") + '" data-sg-block="' + esc(s.id) + '">' +
    '<p class="sg-name">' + name + '<span class="sr-only">: ' + esc(SG_STATES[s.state]) + "</span></p>" +
    '<div class="sg-opts" role="group" aria-label="' + name + '">' + SG_TABS.map(function (t) {
      return '<button class="sg-opt" type="button" data-sg-tab="' + t[0] + '" aria-controls="sg-panel" aria-expanded="' + !!(open && SG_OPEN.tab === t[0]) + '" aria-label="' + esc(t[1]) + " for " + name + '">' + esc(t[1]) + "</button>";
    }).join("") + "</div></div>";
}
function sgFact(term, text) { return "<div><dt>" + esc(term) + "</dt><dd>" + esc(text) + "</dd></div>"; }
function sgNext(s) { return !s.active ? "Off" : s.manual ? "By hand only" : s.next_check_on ? short(parseISO(s.next_check_on)) : "Within the hour"; }
function sgEventsHTML(s) {
  var counts = plural(s.events_year, "approved event", "approved events") + " here, from the last year or coming up. " +
    "This source has found " + plural(s.found, "event", "events") + ": " + s.approved + " approved" + (s.waiting ? ", " + s.waiting + " waiting for review" : "") + ".";
  var why = s.state === "new" ? "It hasn't been read yet." :
    s.state === "nothing" ? "Its page reads fine, but no events have turned up. The sourcing URL may be the wrong page: check it under Settings." : "";
  return "<p>" + esc(counts) + "</p>" + (why ? '<p class="hint">' + esc(why) + "</p>" : "") + (s.found ? '<ul class="sg-events" id="sg-events"><li class="hint">Loading…</li></ul>' +
    '<div class="row"><button class="btn neutral" type="button" data-sg-found="' + esc(s.id) + '">See them all on Found events</button></div>' : "");
}
function sgHealthHTML(s) {
  var st = SOURCE_STATUS[s.last_status] || [s.last_status, ""];
  return '<dl class="sg-facts">' + sgFact("Now", SG_STATES[s.state]) + sgFact("Last read", whenText(s.last_checked_at) + (s.last_status ? " (" + st[0].toLowerCase() + ")" : "")) +
    sgFact("Next read", sgNext(s)) + sgFact("Last change found", whenText(s.last_changed_at)) + sgFact("Last 30 days", plural(s.checks_30d, "check", "checks") + ", " + plural(s.pages_read_30d, "page", "pages") + " read by Claude") + "</dl>" +
    (s.last_error ? '<p class="source-error">' + esc(s.last_error) + "</p>" : "") +
    '<div class="row"><button class="btn neutral" type="button" data-src-check="' + esc(s.id) + '"' + (s.active ? "" : " disabled") + ' aria-label="Check ' + esc(s.label) + ' now">Check now</button></div>';
}
function sgSettingsHTML(s) {
  var id = esc(s.id), every = EVERY.some(function (e) { return e[0] === s.every_days; }) ? EVERY : EVERY.concat([[s.every_days, "Every " + s.every_days + " days"]]);
  return '<form class="sg-form" id="sg-form" novalidate>' +
    (s.reader === "aic_api" ? "<p>Read from the museum's own API.</p>" :
      '<div class="field"><label for="sg-pages">Sourcing URL</label><textarea id="sg-pages" rows="' + Math.max(s.pages.length, 1) + '" aria-describedby="sg-pages-hint">' + esc(s.pages.join("\n")) + "</textarea>" +
      '<p class="hint small" id="sg-pages-hint">The page with the events. For more than one, up to 5, give one on each line.</p></div>') +
    (s.venue_id === null ? "" : '<div class="field"><label for="sg-site">Venue URL</label><input id="sg-site" type="url" inputmode="url" value="' + esc(s.website) + '"></div>') +
    (s.reader === "aic_api" && s.venue_id === null ? "" : '<div class="row"><button class="btn" type="submit" id="sg-save">Save</button></div>') + "</form>" +
    '<div class="row"><label class="sr-only" for="src-every-' + id + '">How often to check ' + esc(s.label) + "</label>" +
    '<select id="src-every-' + id + '" data-src-every="' + id + '">' + every.map(function (e) {
      return '<option value="' + e[0] + '"' + (e[0] === s.every_days ? " selected" : "") + ">" + esc(e[1]) + "</option>"; }).join("") + "</select>" +
    '<button class="btn ghost" type="button" data-src-manual="' + id + '" data-on="' + s.manual + '" aria-label="' + (s.manual ? "Check " + esc(s.label) + " automatically again" : "Check " + esc(s.label) + " by hand only") + '">' + (s.manual ? "Check automatically" : "Check by hand only") + "</button>" +
    '<button class="btn ghost" type="button" data-src-toggle="' + id + '" data-on="' + s.active + '" aria-label="' + (s.active ? "Turn off " : "Turn on ") + esc(s.label) + '">' + (s.active ? "Turn off" : "Turn on") + "</button>" +
    '<button class="btn danger" type="button" data-src-delete="' + id + '" aria-label="Delete ' + esc(s.label) + '">Delete…</button></div>' + (SRC_ASK === s.id ? srcAskHTML(s) : "");
}
function sgPanelHTML(s, tab) {
  var name = SG_TABS.filter(function (t) { return t[0] === tab; })[0][1];
  return '<div class="sg-inner"><div class="sg-body"><div class="sg-head"><h2 id="sg-panel-title" tabindex="-1">' + esc(s.label) + ": " + esc(name.toLowerCase()) + "</h2>" +
    '<button class="btn ghost" type="button" data-sg-close>Close</button></div><p class="hint" id="sg-status" role="status">' + esc(SG_SAID) + "</p>" +
    (tab === "events" ? sgEventsHTML(s) : tab === "health" ? sgHealthHTML(s) : sgSettingsHTML(s)) + "</div></div>";
}
function sgLoadEvents(s) {
  var req = ++SG_REQ;
  api("/admin/discovery/items?" + qs([["show", "all"], ["source", s.id], ["limit", 5]])).then(readJSON).then(function (res) {
    var list = $("sg-events"); if (req !== SG_REQ || !list) return;
    if (!res.ok) { list.innerHTML = '<li class="hint">' + esc(errorText(res)) + "</li>"; return; }
    list.innerHTML = res.body.items.map(function (i) {
      return "<li>" + (i.url ? '<a href="' + esc(safeUrl(i.url)) + '" target="_blank" rel="noopener">' + esc(i.title) + "</a>" : esc(i.title)) +
        '<span class="hint"> · ' + esc(foundDates(i)) + " · " + esc(FOUND_STATES[i.status] || "New") + "</span></li>";
    }).join("");
  }, function () { var list = $("sg-events"); if (req === SG_REQ && list) list.innerHTML = '<li class="hint">' + esc(errorText(null)) + "</li>"; });
}
// animate: open from nothing. A repaint (after Save, or a phone turned on its side) puts the panel back at once.
function sgPlacePanel(s, animate) {
  var list = $("sources-list"), old = $("sg-panel"); if (old) old.remove();
  var blocks = [].slice.call(list.querySelectorAll(".sg-block")), at = blocks.indexOf(list.querySelector('[data-sg-block="' + s.id + '"]'));
  blocks[sgRowEnd(blocks.map(function (b) { return b.getBoundingClientRect(); }), at)].insertAdjacentHTML("afterend",
    '<div class="sg-panel' + (animate ? "" : " open") + '" id="sg-panel" role="region" aria-labelledby="sg-panel-title">' + sgPanelHTML(s, SG_OPEN.tab) + "</div>");
  if (animate) { var panel = $("sg-panel"); panel.getBoundingClientRect(); panel.classList.add("open"); } // the browser sees it shut first, so the height can move
  if (SG_OPEN.tab === "events" && s.found) sgLoadEvents(s);
}
function paintSourceGrid(shown) {
  var list = $("sources-list");
  list.innerHTML = shown.length ? sgSorted(shown).map(sgBlockHTML).join("") : '<p class="hint sg-none">No sources match these filters.</p>';
  var s = SG_OPEN && shown.filter(function (x) { return x.id === SG_OPEN.id; })[0];
  if (s) sgPlacePanel(s, false); else SG_OPEN = null;
}
function sgMarks() { // which block and option are open, without repainting the grid: that would stop the panel's motion
  [].forEach.call($("sources-list").querySelectorAll(".sg-block"), function (b) {
    var here = !!SG_OPEN && +b.getAttribute("data-sg-block") === SG_OPEN.id;
    b.classList.toggle("is-open", here);
    if (here) b.classList.add("on");
    [].forEach.call(b.querySelectorAll("[data-sg-tab]"), function (t) { t.setAttribute("aria-expanded", String(here && t.getAttribute("data-sg-tab") === SG_OPEN.tab)); });
  });
}
function sgOpenTab(id, tab) {
  var s = sgFind(id); if (!s) return;
  var had = !!$("sg-panel"); SRC_ASK = null; SG_SAID = "";
  SG_OPEN = { id: id, tab: tab }; sgMarks(); sgPlacePanel(s, !had);
  $("sg-panel-title").focus({ preventScroll: true });
  setTimeout(function () { var p = $("sg-panel"); if (p) p.scrollIntoView({ block: "nearest" }); }, had ? 0 : SG_PAUSE);
}
function sgClose(back) {
  var panel = $("sg-panel"), was = SG_OPEN; if (!panel || !was) return;
  SG_OPEN = null; SRC_ASK = null; sgMarks();
  panel.removeAttribute("id"); panel.classList.remove("open"); // the id is free for one opened while this one shuts
  setTimeout(function () { panel.remove(); }, window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : SG_PAUSE);
  var opt = back && $("sources-list").querySelector('[data-sg-block="' + was.id + '"] [data-sg-tab="' + was.tab + '"]');
  if (opt) opt.focus();
}
function sgSave(s) {
  var pagesBox = $("sg-pages"), siteBox = $("sg-site"), steps = [];
  var pages = pagesBox ? pagesBox.value.split("\n").map(function (p) { return p.trim(); }).filter(Boolean) : s.pages;
  var site = siteBox ? siteBox.value.trim() : s.website;
  if (pagesBox && (!pages.length || pages.length > 5 || pages.some(function (p) { return !/^https?:\/\/\S+$/i.test(p); }))) {
    $("sg-status").textContent = "Give 1 to 5 web addresses, each starting with https:// or http://."; pagesBox.focus(); return; }
  if (site && !/^https?:\/\/\S+$/i.test(site)) { $("sg-status").textContent = "A website starts with https:// or http://."; siteBox.focus(); return; }
  if (pages.join("\n") !== s.pages.join("\n")) steps.push(["/admin/discovery/sources/" + s.id, { pages: pages }]);
  if (site !== s.website) steps.push(["/venues/" + s.venue_id, { website: site }]);
  if (!steps.length) { $("sg-status").textContent = "Nothing to save."; return; }
  $("sg-save").disabled = true;
  (function next(i) {
    if (i === steps.length) { SG_SAID = "Saved."; loadSources("#sg-save"); return; }
    api(steps[i][0], { method: "PATCH", body: steps[i][1] }).then(readJSON).then(function (res) {
      if (res.ok) { next(i + 1); return; }
      $("sg-save").disabled = false; $("sg-status").textContent = errorText(res);
    }, function () { $("sg-save").disabled = false; $("sg-status").textContent = errorText(null); });
  })(0);
}
$("sources-list").addEventListener("click", function (ev) {
  var tab = ev.target.closest("[data-sg-tab]");
  if (tab) {
    var id = +tab.closest(".sg-block").getAttribute("data-sg-block"), which = tab.getAttribute("data-sg-tab");
    if (SG_OPEN && SG_OPEN.id === id && SG_OPEN.tab === which) sgClose(true); else sgOpenTab(id, which);
    return;
  }
  if (ev.target.closest("[data-sg-close]")) { sgClose(true); return; }
  var found = ev.target.closest("[data-sg-found]");
  if (found) { FOUND.source = found.getAttribute("data-sg-found"); FOUND.show = "all"; FOUND.price = FOUND.dates = "any"; openFound(); return; }
  var block = ev.target.closest(".sg-block"); // a tap, where there's no hover: the options show until another block is tapped
  if (!block) return;
  [].forEach.call(this.querySelectorAll(".sg-block.on:not(.is-open)"), function (b) { b.classList.remove("on"); });
  block.classList.add("on");
});
$("sources-list").addEventListener("submit", function (ev) {
  if (ev.target.id !== "sg-form") return;
  ev.preventDefault();
  var s = SG_OPEN && sgFind(SG_OPEN.id); if (s) sgSave(s);
});
$("sources-list").addEventListener("keydown", function (ev) { if (ev.key === "Escape" && SG_OPEN) sgClose(true); });
window.addEventListener("resize", function () { // the columns change, so the row the panel goes under may too
  var s = SG_OPEN && sgFind(SG_OPEN.id);
  if (s && !$("view-sources").hidden) sgPlacePanel(s, false);
});
