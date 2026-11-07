// Culture Crew site: Event Sourcing (admins, CC-206, CC-207): what needs the admin, the budget dial, the graph of new
// events found, and the found events themselves, by source. The numbers are the weekly recap's and the budget guard's,
// from the same code (/admin/discovery/summary), so the page, the email and the guard agree. Found events (found.js)
// stays the full tool, with its filters, proposed updates and history. CC-208: the found events group by source or by
// day, and several can be approved, deleted or hidden at once.
"use strict";
var SOURCING_REQ = 0; // replies to an older load are dropped
function openSourcing() { if (!isAdmin()) { openAccount(); return; } show("sourcing"); updateFoundCount(); loadSourcing(); }
function loadSourcing() {
  var req = ++SOURCING_REQ;
  $("sourcing-status").textContent = "Loading…";
  api("/admin/discovery/summary").then(readJSON).then(function (res) {
    if (req !== SOURCING_REQ) return;
    if (!res.ok) { $("sourcing-status").textContent = errorText(res); return; }
    $("sourcing-status").textContent = ""; paintSourcing(res.body);
  }, function () { if (req === SOURCING_REQ) $("sourcing-status").textContent = errorText(null); });
}
function needRowHTML(n, name, sub, href) {
  return '<li><a class="hub-row" href="' + href + '"><span class="hub-n">' + n + '</span><span class="hub-text"><span class="hub-name">' + esc(name) +
    '</span><span class="hub-sub">' + esc(sub) + "</span></span></a></li>";
}
function money(usd) { return "$" + usd.toFixed(2); }
function wholeMoney(usd) { return "$" + (usd % 1 ? usd.toFixed(2) : usd.toFixed(0)); } // "$10", but "$12.50"
function chicagoDate(iso, parts) { // iso: a plain date; noon keeps it on that day everywhere
  return new Intl.DateTimeFormat("en-US", Object.assign({ timeZone: "America/Chicago" }, parts)).format(new Date(iso + "T12:00:00-06:00"));
}
function paintSourcing(o) {
  var rows = [], bad = o.unreadable, names = function (list) { return list.join(", "); };
  if (o.updates_waiting) rows.push(needRowHTML(o.updates_waiting, o.updates_waiting === 1 ? "Proposed update" : "Proposed updates", "New prices or dates on events already listed", "#found/update"));
  if (bad.length) rows.push(needRowHTML(bad.length, bad.length === 1 ? "Source we couldn't read" : "Sources we couldn't read",
    bad.length === 1 ? bad[0].name + ": " + bad[0].reason : names(bad.map(function (s) { return s.name; })), bad.length === 1 ? "#source-" + bad[0].id : "#sources/unreadable"));
  if (o.by_hand.length) rows.push(needRowHTML(o.by_hand.length, o.by_hand.length === 1 ? "Source to check by hand" : "Sources to check by hand", names(o.by_hand), "#sources/manual"));
  $("needs-n").textContent = rows.length ? String(rows.length) : "";
  $("needs-list").innerHTML = rows.join("");
  $("needs-section").hidden = !rows.length;
  $("sourcing-live").hidden = false; // before the graph, which is drawn to the width it has

  var g = gaugeAt(o.spent_month_usd, o.budget_usd, o.budget_state);
  var month = new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "America/Chicago" }).format(new Date());
  var spent = money(o.spent_month_usd) + " of " + wholeMoney(o.budget_usd);
  $("budget-gauge").innerHTML = gaugeHTML(g, o.budget_usd, "Budget speedometer: " + spent + " spent in " + month + ", an estimate. That's " + g.pct + "% of the budget: " + g.words + ".");
  $("budget-spent").innerHTML = esc(money(o.spent_month_usd)) + " <span>of " + esc(wholeMoney(o.budget_usd)) + " in " + esc(month) + ", " + esc(g.words) + "</span>";
  $("budget-note").textContent = o.budget_note; $("budget-note").hidden = !o.budget_note;

  GRAPH_WEEKS_SHOWN = o.found_weeks; paintGraph();
  $("week-recap").textContent = "The full recap goes out by email on " + chicagoDate(o.next_recap, { weekday: "long", month: "short", day: "numeric" }) + " at 10 AM.";

  SRC.rows = o.waiting_by_source.map(function (s) { return { key: String(s.id === null ? 0 : s.id), id: s.id === null ? 0 : s.id, name: s.name, n: s.n }; });
  SRC.hidden = o.hidden; SRC.items = []; SRC.total = 0; srcUnpick();
  $("src-status").textContent = "";
  SRC.open = SRC.by === "day" ? "day" : null;
  if (SRC.by === "day") srcLoad(false); else paintSrc();
}
document.addEventListener("click", function (ev) { // the tools that sit lower down another page
  var b = ev.target.closest("[data-hub]"); if (!b) return;
  var hub = b.getAttribute("data-hub");
  if (hub === "rules") openFound("#rules-title"); else if (hub === "manual") openSources(null, "manual"); else openReview("withdrawn-title");
});

// ---------- the budget dial ----------
// The dial's zones are the budget guard's (budget.py): the zone comes from its state, never worked out here. 100% sits
// where the red begins to be needed, so the sweep up to the limit stops short of the end, and at the limit or past it
// the needle rests at the very end of the dial, in the red.
var GAUGE_LIMIT = 0.94, GAUGE_SAVE = 0.8; // of the sweep: where the limit's red starts; of the budget: where amber starts
var GAUGE_WORDS = { ok: "under 80%", saving: "over 80%", paused: "at the limit" };
function gaugeAt(spent, budget, state) {
  var share = budget > 0 ? spent / budget : 1;
  return { at: share >= 1 ? 1 : Math.max(share, 0) * GAUGE_LIMIT, zone: state, pct: share >= 1 ? Math.round(share * 100) : Math.floor(share * 100), words: GAUGE_WORDS[state] || "" };
}
function dialPoint(at, r) { // at: 0 (left) to 1 (right) along the top half of a circle
  var a = Math.PI * (1 - at);
  return (160 + r * Math.cos(a)).toFixed(1) + " " + (168 - r * Math.sin(a)).toFixed(1);
}
function dialArc(from, to, r) { return "M" + dialPoint(from, r) + " A" + r + " " + r + " 0 0 1 " + dialPoint(to, r); }
function gaugeHTML(g, budget, label) {
  var save = GAUGE_SAVE * GAUGE_LIMIT, gap = 0.006;
  var zones = [["ok", 0, save - gap], ["saving", save + gap, GAUGE_LIMIT - gap], ["paused", GAUGE_LIMIT + gap, 1]];
  var css = { ok: "ok", saving: "warn", paused: "stop" };
  return '<svg viewBox="0 0 320 200" role="img" aria-label="' + esc(label) + '">' + zones.map(function (z) {
    return '<path class="zone ' + css[z[0]] + (g.zone === z[0] ? " on" : "") + '" d="' + dialArc(z[1], z[2], 136) + '"/>'; }).join("") +
    '<path class="needle" d="M160 168 L' + dialPoint(g.at, 112) + '"/><rect class="pin" x="154" y="162" width="12" height="12"/>' +
    '<text x="10" y="194">$0</text><text x="310" y="194" text-anchor="end">' + esc(wholeMoney(budget)) + "</text></svg>";
}

// ---------- the graph of new events found ----------
// One point a week, the recap's weeks. Squares, because circles are people (the Lakefront brief). Drawn at the width it
// has, so its labels stay 16px on a phone.
var GRAPH_WEEKS_SHOWN = [], GRAPH_H = 220, GRAPH_PAD = { top: 16, right: 36, bottom: 30, left: 36 };
function niceTop(max) { // the round number the axis stops at: 1, 2, 5, 10, 20, 50...
  if (max <= 1) return 1;
  var step = Math.pow(10, Math.floor(Math.log10(max))), top = [1, 2, 5, 10].map(function (m) { return m * step; }).filter(function (v) { return v >= max; })[0];
  return top;
}
function graphPoints(weeks, width) {
  var top = niceTop(Math.max.apply(null, weeks.map(function (w) { return w.n; }).concat([0])));
  var inner = width - GRAPH_PAD.left - GRAPH_PAD.right, tall = GRAPH_H - GRAPH_PAD.top - GRAPH_PAD.bottom;
  return { top: top, points: weeks.map(function (w, i) {
    return { x: GRAPH_PAD.left + (weeks.length > 1 ? inner * i / (weeks.length - 1) : inner), y: GRAPH_PAD.top + tall * (1 - w.n / top), w: w };
  }) };
}
function weekText(w) { return chicagoDate(w.first, { month: "short", day: "numeric" }) + " to " + chicagoDate(w.last, { month: "short", day: "numeric" }); }
function graphLabel(weeks) {
  var last = weeks[weeks.length - 1], vals = weeks.map(function (w) { return w.n; });
  return "Line graph of new events found, one point a week for " + plural(weeks.length, "week", "weeks") + ": from " + Math.min.apply(null, vals) + " to " + Math.max.apply(null, vals) +
    " a week, and " + last.n + " in the latest week, " + weekText(last) + ".";
}
function paintGraph() {
  var el = $("found-graph"), weeks = GRAPH_WEEKS_SHOWN;
  if (!weeks.length) { el.innerHTML = '<p class="hint">Nothing yet. The graph starts with the first check.</p>'; return; }
  var width = Math.max(el.clientWidth || 640, 280), g = graphPoints(weeks, width), pts = g.points, last = pts[pts.length - 1], base = GRAPH_H - GRAPH_PAD.bottom;
  var at = function (p) { return p.x.toFixed(1) + " " + p.y.toFixed(1); };
  el.innerHTML = '<svg viewBox="0 0 ' + width + " " + GRAPH_H + '" role="img" aria-label="' + esc(graphLabel(weeks)) + '">' +
    '<path class="grid" d="M' + GRAPH_PAD.left + " " + GRAPH_PAD.top + " H" + (width - GRAPH_PAD.right) + '"/><path class="grid" d="M' + GRAPH_PAD.left + " " + base + " H" + (width - GRAPH_PAD.right) + '"/>' +
    '<text x="0" y="' + (GRAPH_PAD.top + 6) + '">' + g.top + '</text><text x="0" y="' + (base + 6) + '">0</text>' +
    '<path class="cross" d="" id="graph-cross"/>' +
    (pts.length > 1 ? '<path class="line" d="M' + pts.map(at).join(" L") + '"/>' : "") +
    pts.map(function (p) { return '<rect class="dot" x="' + (p.x - 5).toFixed(1) + '" y="' + (p.y - 5).toFixed(1) + '" width="10" height="10"/>'; }).join("") +
    '<text class="now" x="' + (last.x + 10).toFixed(1) + '" y="' + (last.y + 6).toFixed(1) + '">' + last.w.n + "</text>" +
    '<text x="' + GRAPH_PAD.left + '" y="' + (GRAPH_H - 6) + '">' + esc(chicagoDate(weeks[0].first, { month: "short", day: "numeric" })) + "</text>" +
    '<text x="' + (width - GRAPH_PAD.right) + '" y="' + (GRAPH_H - 6) + '" text-anchor="end">This week</text></svg>' +
    '<p class="graph-tip" id="graph-tip" hidden></p>' +
    '<table class="sr-only"><caption>New events found each week</caption><thead><tr><th scope="col">Week</th><th scope="col">New events</th></tr></thead><tbody>' +
    weeks.map(function (w) { return "<tr><td>" + esc(weekText(w)) + "</td><td>" + w.n + "</td></tr>"; }).join("") + "</tbody></table>";
}
function graphHover(ev) { // the week nearest the pointer, with a line down to it and its numbers
  var svg = $("found-graph").querySelector("svg"); if (!svg) return;
  var box = svg.getBoundingClientRect(), x = ev.clientX - box.left, pts = graphPoints(GRAPH_WEEKS_SHOWN, box.width).points;
  var p = pts.reduce(function (best, q) { return Math.abs(q.x - x) < Math.abs(best.x - x) ? q : best; }), tip = $("graph-tip");
  $("graph-cross").setAttribute("d", "M" + p.x.toFixed(1) + " " + GRAPH_PAD.top + " V" + (GRAPH_H - GRAPH_PAD.bottom));
  tip.textContent = weekText(p.w) + ": " + p.w.n + " new"; tip.hidden = false;
  tip.style.left = Math.max(0, Math.min(p.x - tip.offsetWidth / 2, box.width - tip.offsetWidth)) + "px";
}
function graphLeave() { var c = $("graph-cross"); if (c) { c.setAttribute("d", ""); $("graph-tip").hidden = true; } }
$("found-graph").addEventListener("pointermove", graphHover);
$("found-graph").addEventListener("pointerdown", graphHover);
$("found-graph").addEventListener("pointerleave", graphLeave);
window.addEventListener("resize", function () { if (visible("sourcing")) paintGraph(); });

// ---------- the found events list ----------
// A row per source, then Hidden. One row is open at a time, so an event hidden or unhidden never has to appear in an
// open list. Rows keep their order while the admin works, so the row in hand doesn't move; a reload puts the largest first.
// CC-208: By day is one list of the new events under day heads, held as if a row called "day" were open. Hidden stays
// with By source. A batch only covers ticked events, and only loaded ones can be ticked, so nothing goes unseen.
var SRC = { rows: [], hidden: 0, open: null, items: [], total: 0, loading: false, error: "", req: 0, by: "source", picked: {}, asking: "", said: "", busy: false };
function srcRow(key) { return SRC.rows.filter(function (r) { return r.key === key; })[0]; }
function srcKey(i) { return String(i.source_id === null ? 0 : i.source_id); }
function srcCountDown(i) { // a new event has left: its source's row follows
  var row = srcRow(srcKey(i)); if (!row) return;
  row.n -= 1; if (row.n <= 0) SRC.rows = SRC.rows.filter(function (r) { return r !== row; });
}
function srcActions(i) {
  var id = esc(i.id), title = esc(i.title), hidden = i.status === "hidden";
  return '<button class="btn" type="button" data-src-act="edit" aria-label="Edit and approve ' + title + '">Edit/Approve</button>' +
    '<button class="btn ghost" type="button" data-src-act="reject" aria-label="Delete ' + title + '">Delete</button>' +
    '<button class="btn ghost" type="button" data-src-act="' + (hidden ? "unhide" : "hide") + '" aria-label="' + (hidden ? "Unhide " : "Hide ") + title + '">' + (hidden ? "Unhide" : "Hide") + "</button>";
}
function srcItemHTML(i) {
  var pick = i.status === "new" ? '<label class="src-pick"><input type="checkbox" data-src-pick' + (SRC.picked[i.id] ? " checked" : "") + ' aria-label="Select ' + esc(i.title) + '"></label>' : "";
  return foundRowHTML(i, srcActions(i), pick);
}
function srcAllHTML(n, name) { return '<label class="src-all"><input type="checkbox" data-src-all aria-label="' + esc(name) + '"> Select all ' + n + "</label>"; }
function srcDayHead(i) {
  var day = i.begin_date || i.end_date; if (!day) return "No date";
  var parts = { weekday: "long", month: "short", day: "numeric" };
  if (day.slice(0, 4) !== isoDate(T).slice(0, 4)) parts.year = "numeric";
  return (!i.begin_date ? "Closing " : i.begin_date < isoDate(T) ? "Opened " : "Opening ") + chicagoDate(day, parts);
}
function srcDaysHTML() { // the API sends them in day order, undated last
  var days = [];
  SRC.items.forEach(function (i) {
    var head = srcDayHead(i), last = days[days.length - 1];
    if (last && last.head === head) last.items.push(i); else days.push({ head: head, items: [i] });
  });
  return days.map(function (d) {
    return '<div class="src-day" data-src-group><div class="src-day-head"><h3 class="listing-day-head">' + esc(d.head) + "</h3>" +
      (d.items.length > 1 ? srcAllHTML(d.items.length, "Select all " + d.items.length + ": " + d.head) : "") + '</div><div class="queue">' + d.items.map(srcItemHTML).join("") + "</div></div>";
  }).join("");
}
function srcPanelHTML() {
  if (SRC.error) return '<p class="form-error" role="alert">' + esc(SRC.error) + "</p>";
  var all = SRC.open !== "hidden" && SRC.items.length > 1 ? srcAllHTML(SRC.items.length, "Select all " + SRC.items.length + " shown") : "";
  return all + (SRC.by === "day" ? srcDaysHTML() : '<div class="queue">' + SRC.items.map(srcItemHTML).join("") + "</div>") +
    (SRC.items.length < SRC.total ? '<div class="row"><button class="btn ghost" type="button" data-src-more' + (SRC.loading ? " disabled" : "") + ">Show more</button>" +
      '<span class="hint">Showing ' + SRC.items.length + " of " + SRC.total + "</span></div>" : "");
}
function srcRowHTML(key, n, name, sub) {
  var open = SRC.open === key, k = esc(key), waiting = open && SRC.loading && !SRC.items.length && !SRC.error; // CC-228: it opens once, to its events
  return '<li data-src="' + k + '"><button class="hub-row" type="button" data-src-row aria-expanded="' + open + '" aria-controls="src-panel-' + k + '"><span class="hub-n">' + n +
    '</span><span class="hub-text"><span class="hub-name">' + esc(name) + "</span>" + (sub ? '<span class="hub-sub">' + esc(sub) + "</span>" : "") +
    '</span><span class="hub-go">' + (waiting ? "Loading…" : open ? "Close" : "Open") + '</span></button><div class="src-panel" id="src-panel-' + k + '" data-drop' + (open && !waiting ? ">" + srcPanelHTML() : " hidden>") + "</div></li>";
}
function paintSrc() {
  var was = document.activeElement && document.activeElement.closest && document.activeElement.closest("[data-src-row]");
  var key = was && was.parentNode.getAttribute("data-src");
  var waiting = SRC.rows.reduce(function (n, r) { return n + r.n; }, 0);
  $("src-n").textContent = waiting ? String(waiting) : "";
  dropRepaint($("src-list"), function () {
    var none = '<li><p class="hint">Nothing waiting. New finds show up here after each check.</p></li>';
    if (SRC.by === "day") {
      $("src-list").innerHTML = !waiting ? none : SRC.loading && !SRC.items.length ? '<li><p class="hint">Loading…</p></li>' : '<li class="src-days">' + srcPanelHTML() + "</li>";
      return;
    }
    $("src-list").innerHTML = SRC.rows.map(function (r) { return srcRowHTML(r.key, r.n, r.name, ""); }).join("") +
      (SRC.hidden ? srcRowHTML("hidden", SRC.hidden, "Hidden", "Not sure yet. They stay here until you decide.") : "");
    if (!waiting && !SRC.hidden) $("src-list").innerHTML = none;
  });
  srcPickSync();
  if (key) srcFocusRow(key);
}
function srcFocusRow(key) {
  var b = $("src-list").querySelector('[data-src="' + key + '"] [data-src-row]');
  (b || $("src-title")).focus();
}
function srcLoad(more) {
  var key = SRC.open, req = ++SRC.req, offset = more ? SRC.items.length : 0;
  SRC.loading = true; SRC.error = ""; if (!more) SRC.items = [];
  paintSrc();
  var query = key === "hidden" ? [["show", "hidden"]] : key === "day" ? [["show", "new"], ["order", "day"]] : [["show", "new"], ["source", srcRow(key).id]];
  api("/admin/discovery/items?" + qs(query.concat([["limit", FOUND_PAGE], ["offset", offset]]))).then(readJSON).then(function (res) {
    if (req !== SRC.req) return;
    SRC.loading = false;
    if (!res.ok) { SRC.error = errorText(res); paintSrc(); return; }
    SRC.items = SRC.items.concat(res.body.items); SRC.total = res.body.total;
    paintSrc();
    if (more) { var first = $("src-list").querySelectorAll("[data-found]")[offset], b = first && first.querySelector("button"); if (b) b.focus(); }
  }, function () { if (req === SRC.req) { SRC.loading = false; SRC.error = errorText(null); paintSrc(); } });
}
function srcToggle(key) {
  SRC.req++; SRC.loading = false; SRC.error = ""; SRC.items = []; SRC.total = 0; srcUnpick();
  if (SRC.open === key) { SRC.open = null; paintSrc(); return; }
  SRC.open = key; srcLoad(false);
}
// An event has left the open list: every count follows, and focus moves to the next event (or its row, or the heading).
function srcDone(i, said, moved) {
  var at = SRC.items.map(function (x) { return x.id; }).indexOf(i.id), next = SRC.items[at + 1] || SRC.items[at - 1], key = SRC.open;
  SRC.items = SRC.items.filter(function (x) { return x.id !== i.id; }); SRC.total -= 1;
  delete SRC.picked[i.id]; SRC.asking = ""; paintBatch();
  if (key === "hidden") SRC.hidden -= 1; else srcCountDown(i);
  if (moved === "hide") SRC.hidden += 1;
  if (moved === "unhide") {
    var to = srcKey(i), there = srcRow(to);
    if (there) there.n += 1; else SRC.rows.push({ key: to, id: Number(to), name: i.source_id === null ? "Deleted source" : i.source_name, n: 1 });
  }
  if (!SRC.total && key !== "day") SRC.open = null;
  $("edit-live").textContent = said; updateFoundCount();
  if (!SRC.items.length && SRC.total > 0) { srcLoad(false); srcFocusRow(key); return; } // all those loaded are done: the next part
  paintSrc();
  var b = next && $("src-list").querySelector('[data-found="' + esc(next.id) + '"] button');
  if (b) b.focus(); else srcFocusRow(key);
}
$("src-list").addEventListener("click", function (ev) {
  if (ev.target.closest("[data-src-more]")) { srcLoad(true); return; }
  var t = ev.target.closest("[data-src-row]");
  if (t) { srcToggle(t.parentNode.getAttribute("data-src")); return; }
  var b = ev.target.closest("[data-src-act]"); if (!b) return;
  var row = b.closest("[data-found]"), act = b.getAttribute("data-src-act");
  var i = SRC.items.filter(function (x) { return String(x.id) === row.getAttribute("data-found"); })[0];
  if (!i) return;
  $("src-status").textContent = "";
  if (act === "edit") { openFoundEditor(i, b, function (said) { srcDone(i, said); }); return; }
  foundPost(row, act).then(function (res) {
    if (!res.ok) { foundBusy(row, false); $("src-status").textContent = errorText(res); return; }
    srcDone(i, (act === "reject" ? "Deleted " : act === "hide" ? "Hid " : "Unhid ") + i.title + ".", act);
  }, function () { foundBusy(row, false); $("src-status").textContent = errorText(null); });
});

// ---------- several at once (CC-208) ----------
// The API decides what a batch approval may add; batch_hold is its answer ahead of time, so the bar can say how many are
// ready. Approving goes live and deleting can't be undone, so those two ask first. What stays is said, with why.
var SRC_HOLDS = { duplicate: "possibly already listed", new_venue: "at a new venue", type: "with no type", date: "with no date", show_days: "with no show days",
  type_differs: "whose type needs a look", short_run: "missing a time", form: "to check in the form" };
function srcPicked() { return SRC.items.filter(function (i) { return SRC.picked[i.id]; }); }
function srcUnpick() { SRC.picked = {}; SRC.asking = ""; SRC.said = ""; paintBatch(); }
function paintBatch() {
  var picked = srcPicked(), n = picked.length, ready = picked.filter(function (i) { return !i.batch_hold; }).length, off = SRC.busy ? " disabled" : "";
  $("src-batch").hidden = !n && !SRC.said;
  $("src-batch-said").textContent = SRC.said; $("src-batch-said").hidden = !SRC.said;
  $("src-batch-n").hidden = !n;
  $("src-batch-n").textContent = SRC.asking === "approve" ? "Add " + plural(ready, "event", "events") + " to the catalog? " + (ready === 1 ? "It goes" : "They go") + " live now." :
    SRC.asking === "reject" ? "Delete " + plural(n, "event", "events") + "? " + (n === 1 ? "It won't" : "They won't") + " come back." : plural(n, "event", "events") + " selected, " + ready + " ready to approve.";
  $("src-batch-tools").hidden = !n;
  $("src-batch-tools").innerHTML = SRC.asking ? '<button class="btn" type="button" data-batch="' + SRC.asking + '" data-batch-yes' + off + ">Yes, " + (SRC.asking === "approve" ? "approve " + ready : "delete " + n) + "</button>" +
      '<button class="btn ghost" type="button" data-batch="cancel"' + off + ">Cancel</button>" :
    '<button class="btn" type="button" data-batch="approve"' + (ready ? off : " disabled") + ">Approve " + ready + "</button>" +
    '<button class="btn ghost" type="button" data-batch="reject"' + off + ">Delete " + n + "</button>" +
    '<button class="btn ghost" type="button" data-batch="hide"' + off + ">Hide " + n + "</button>" +
    '<button class="textbtn" type="button" data-batch="clear"' + off + ">Clear</button>";
}
function srcPickSync() { // each Select all shows what's ticked in its group: all, some or none
  Array.prototype.forEach.call($("src-list").querySelectorAll("[data-src-all]"), function (all) {
    var boxes = (all.closest("[data-src-group]") || $("src-list")).querySelectorAll("[data-src-pick]"), on = 0;
    Array.prototype.forEach.call(boxes, function (b) { if (b.checked) on += 1; });
    all.checked = on === boxes.length; all.indeterminate = on > 0 && on < boxes.length;
  });
}
function srcBatchWords(action, o) {
  var done = o.done.length, gone = 0, why = {}, stayed = 0;
  o.held.forEach(function (h) { if (h.why === "gone") gone += 1; else { why[h.why] = (why[h.why] || 0) + 1; stayed += 1; } });
  var said = !done ? "Nothing changed." : action === "approve" ? "Added " + plural(done, "event", "events") + " to the catalog." : (action === "reject" ? "Deleted " : "Hid ") + plural(done, "event", "events") + ".";
  if (stayed) said += " " + stayed + " stayed: " + Object.keys(why).map(function (k) { return why[k] + " " + (SRC_HOLDS[k] || "to check in the form"); }).join(", ") + ". Use Edit/Approve on those.";
  if (gone) said += " " + plural(gone, "event was", "events were") + " already decided.";
  return said;
}
function srcBatchDone(action, o) {
  var left = {}; o.done.forEach(function (id) { left[id] = true; });
  o.held.forEach(function (h) { if (h.why === "gone") left[h.id] = true; });
  SRC.items.forEach(function (i) { if (left[i.id]) { srcCountDown(i); SRC.total -= 1; } });
  SRC.items = SRC.items.filter(function (i) { return !left[i.id]; });
  if (action === "hide") SRC.hidden += o.done.length;
  if (action === "approve" && o.done.length) reloadEvents();
  SRC.picked = {}; SRC.asking = ""; SRC.said = srcBatchWords(action, o);
  $("edit-live").textContent = SRC.said; updateFoundCount();
  if (!SRC.total && SRC.open !== "day") SRC.open = null;
  paintBatch();
  if (!SRC.items.length && SRC.total > 0) { srcLoad(false); $("src-title").focus(); return; } // all those loaded are done: the next part
  paintSrc();
  ($("src-list").querySelector("[data-src-pick]") || $("src-title")).focus();
}
function srcBatchSend(action) {
  var ids = srcPicked().map(function (i) { return i.id; }), stop = function (res) { SRC.busy = false; SRC.asking = ""; SRC.said = errorText(res); paintBatch(); };
  SRC.busy = true; paintBatch();
  api("/admin/discovery/items/batch", { method: "POST", body: { action: action, ids: ids } }).then(readJSON).then(function (res) {
    if (!res.ok) { stop(res); return; }
    SRC.busy = false; srcBatchDone(action, res.body);
  }, function () { stop(null); });
}
function srcGroupBy(by) {
  if (SRC.by === by) return;
  SRC.by = by; SRC.req++; SRC.loading = false; SRC.error = ""; SRC.items = []; SRC.total = 0; srcUnpick();
  Array.prototype.forEach.call(document.querySelectorAll("[data-src-by]"), function (b) {
    var on = b.getAttribute("data-src-by") === by; b.setAttribute("aria-pressed", String(on)); b.classList.toggle("ghost", !on);
  });
  SRC.open = by === "day" ? "day" : null;
  if (by === "day") srcLoad(false); else paintSrc();
}
document.addEventListener("click", function (ev) { var b = ev.target.closest("[data-src-by]"); if (b) srcGroupBy(b.getAttribute("data-src-by")); });
$("src-list").addEventListener("change", function (ev) {
  var t = ev.target, all = t.hasAttribute("data-src-all");
  if (!all && !t.hasAttribute("data-src-pick")) return;
  var boxes = all ? (t.closest("[data-src-group]") || $("src-list")).querySelectorAll("[data-src-pick]") : [t];
  Array.prototype.forEach.call(boxes, function (b) {
    b.checked = t.checked;
    var id = b.closest("[data-found]").getAttribute("data-found");
    if (t.checked) SRC.picked[id] = true; else delete SRC.picked[id];
  });
  SRC.asking = ""; SRC.said = ""; srcPickSync(); paintBatch();
});
$("src-batch").addEventListener("click", function (ev) {
  var b = ev.target.closest("[data-batch]"); if (!b) return;
  var act = b.getAttribute("data-batch"), first = function () { $("src-batch-tools").querySelector("button:not([disabled])").focus(); };
  if (act === "clear") { srcUnpick(); paintSrc(); $("src-title").focus(); return; }
  if (act === "cancel") { SRC.asking = ""; paintBatch(); first(); return; }
  if (act === "hide" || b.hasAttribute("data-batch-yes")) { srcBatchSend(act); return; }
  SRC.asking = act; paintBatch(); first();
});
