// Culture Crew site: Admin tools: the review queue, venues, and editing events.
// Loaded by index.html in order (core, util, catalog, planner, account, submit, admin, start); they share one
// global scope, so anything declared here is visible to the files after it.
"use strict";
// ---------- review queue (admins) ----------
function submitterText(who) { // null: came from the sheet, or the account was deleted
  if (!who) return "No submitter on record";
  var mail = '<a href="mailto:' + esc(who.email) + '">' + esc(who.email) + "</a>";
  return "Submitted by " + (who.display_name.trim() ? esc(who.display_name) + " (" + mail + ")" : mail);
}
function creditText(e) { return e.suggestedBy ? " · wants public credit" : e.creditMe ? " · wants credit, but has no name to show" : ""; }
function queueItemHTML(e, actions) {
  return '<div class="queue-item"><div class="alt-text"><p class="kind">' + esc(e.type) + '</p><p class="alt-title">' +
    (e.url ? '<a href="' + esc(safeUrl(e.url)) + '" target="_blank" rel="noopener">' + esc(e.title) + "</a>" : esc(e.title)) + "</p>" +
    '<p class="alt-meta">' + esc(placeText(e)) + " · " + esc(e.b || e.n ? dateText(e) : "Dates not given") + " · " + esc(costText(e)) + "</p>" +
    (e.submitter !== undefined ? '<p class="alt-meta">' + submitterText(e.submitter) + creditText(e) + "</p>" :
      e.suggestedBy ? '<p class="alt-meta">Credited as "Suggested by ' + esc(e.suggestedBy) + '"</p>' : "") + "</div>" +
    '<div class="row">' + actions + "</div></div>";
}
function openReview() { if (!isAdmin()) { openAccount(); return; } renderReview(); updateFoundCount(); show("review"); }
function updateReviewCount(n) {
  if (n !== undefined) { $("review-count").textContent = n ? String(n) : ""; return; }
  api("/admin/events?limit=1").then(readJSON).then(function (res) { if (res.ok) updateReviewCount(res.body.total); }, function () {});
}
var EMPTY = { "review-list": "Nothing waiting for review.", "scheduled-list": "Nothing scheduled.", "withdrawn-list": "Nothing withdrawn." };
function renderReview() {
  renderScheduled(); renderWithdrawn();
  $("review-list").innerHTML = '<p class="hint">Loading…</p>';
  api("/admin/events?limit=500").then(readJSON).then(function (res) {
    if (!res.ok) { $("review-list").innerHTML = '<p class="form-error">' + esc(errorText(res)) + "</p>"; return; }
    updateReviewCount(res.body.total);
    $("review-list").innerHTML = res.body.items.length ? res.body.items.map(function (raw) {
      var e = toEvent(raw);
      return queueItemHTML(e, '<button class="btn" type="button" data-review="approve" data-id="' + esc(e.id) + '">Approve</button>' +
        '<button class="btn ghost" type="button" data-review="reject" data-id="' + esc(e.id) + '">Reject</button>' + editButtonHTML(e, "btn ghost"));
    }).join("") : '<p class="hint">Nothing waiting for review.</p>';
    refocusAfterEdit();
  }, function () { $("review-list").innerHTML = '<p class="form-error">' + esc(errorText(null)) + "</p>"; });
}
function renderScheduled() {
  api("/admin/events/scheduled").then(readJSON).then(function (res) {
    if (!res.ok) { $("scheduled-list").innerHTML = '<p class="form-error">' + esc(errorText(res)) + "</p>"; return; }
    $("scheduled-list").innerHTML = res.body.length ? res.body.map(function (raw) {
      var e = toEvent(raw);
      return queueItemHTML(e, stateHTML(e) + '<button class="btn ghost" type="button" data-review="approve" data-id="' + esc(e.id) + '">Publish now</button>' +
        editButtonHTML(e, "btn ghost"));
    }).join("") : '<p class="hint">' + EMPTY["scheduled-list"] + "</p>";
    refocusAfterEdit();
  }, function () {});
}
function renderWithdrawn() { // CC-56: put back with Restore (approve), or edit / delete
  api("/admin/events?status=withdrawn&limit=500").then(readJSON).then(function (res) {
    if (!res.ok) { $("withdrawn-list").innerHTML = '<p class="form-error">' + esc(errorText(res)) + "</p>"; return; }
    $("withdrawn-list").innerHTML = res.body.items.length ? res.body.items.map(function (raw) {
      var e = toEvent(raw);
      return queueItemHTML(e, '<button class="btn ghost" type="button" data-review="approve" data-id="' + esc(e.id) + '">Restore</button>' +
        editButtonHTML(e, "btn ghost"));
    }).join("") : '<p class="hint">' + EMPTY["withdrawn-list"] + "</p>";
    refocusAfterEdit();
  }, function () {});
}
function reviewClick(ev) {
  var b = ev.target.closest("[data-review]"); if (!b) return;
  var action = b.getAttribute("data-review"), item = b.closest(".queue-item"), list = item.parentNode;
  Array.prototype.forEach.call(item.querySelectorAll("button"), function (x) { x.disabled = true; });
  api("/admin/events/" + encodeURIComponent(b.getAttribute("data-id")) + "/" + action, { method: "POST" }).then(function (r) {
    if (!r.ok) throw new Error(r.status);
    var next = item.nextElementSibling || item.previousElementSibling;
    item.remove();
    if (!list.children.length) list.innerHTML = '<p class="hint">' + EMPTY[list.id] + "</p>";
    updateReviewCount();
    if (action === "approve") reloadEvents();
    var focusTo = next && next.querySelector && next.querySelector("button"); (focusTo || $("review-title")).focus();
  }).catch(function () { Array.prototype.forEach.call(item.querySelectorAll("button"), function (x) { x.disabled = false; }); });
}
$("review-list").addEventListener("click", reviewClick);
$("scheduled-list").addEventListener("click", reviewClick);
$("withdrawn-list").addEventListener("click", reviewClick);

// ---------- venues (admins, CC-57) ----------
// The list comes from GET /venues/manage (every venue, with how many events use it) and is filtered here.
// One dialog does rename, merge (with a preview of what moves) and delete (only for unused venues).
var VLIST = [], VDLG = null; // VDLG: { mode: "edit" | "merge" | "delete", v, opener }
function openVenues() { if (!isAdmin()) { openAccount(); return; } show("venues"); loadVenues(); }
function loadVenues(focusId) {
  $("v-count").textContent = "Loading…";
  return api("/venues/manage").then(readJSON).then(function (res) {
    if (!res.ok) { $("v-count").textContent = errorText(res); return; }
    VLIST = res.body; paintVenues();
    var b = focusId && $("venue-list").querySelector('[data-venue-edit="' + focusId + '"]');
    if (b) b.focus();
  }, function () { $("v-count").textContent = errorText(null); });
}
function venueLabel(v) { return v.neighborhood ? v.name + " · " + v.neighborhood : v.name; }
function venueMatches(v, q) { q = q.trim().toLowerCase(); return !q || (v.name + " " + v.neighborhood).toLowerCase().indexOf(q) >= 0; }
function paintVenues() {
  var q = $("v-q").value, onlyUnplaced = $("v-noregion").checked;
  var rows = VLIST.filter(function (v) { return venueMatches(v, q) && (!onlyUnplaced || !v.region); });
  var unplaced = VLIST.filter(function (v) { return !v.region; }).length;
  $("v-count").textContent = plural(rows.length, "venue", "venues") + (q.trim() || onlyUnplaced ? " match" : "") +
    (rows.length > 200 ? ", showing the first 200. Search to narrow it down." : ".") +
    (unplaced && !onlyUnplaced ? " " + plural(unplaced, "venue has", "venues have") + " no side of town yet." : "");
  $("venue-list").innerHTML = rows.slice(0, 200).map(function (v) {
    var id = esc(v.id);
    return '<div class="queue-item"><div class="alt-text"><p class="alt-title">' + esc(v.name) + '</p><p class="alt-meta">' +
      esc(v.neighborhood || "No neighborhood") + " · " + esc(v.region ? REGION_NAMES[v.region] : "No side of town") + " · " + plural(v.events, "event", "events") +
      (v.sheet_events ? " (" + v.sheet_events + " from the sheet)" : "") + "</p></div>" +
      '<div class="row"><button class="btn ghost" type="button" data-venue-edit="' + id + '" aria-label="Edit ' + esc(venueLabel(v)) + '">Edit</button>' +
      '<button class="btn ghost" type="button" data-venue-merge="' + id + '" aria-label="Merge ' + esc(venueLabel(v)) + ' into another venue">Merge…</button>' +
      (v.events ? "" : '<button class="btn danger" type="button" data-venue-delete="' + id + '" aria-label="Delete ' + esc(venueLabel(v)) + '">Delete</button>') +
      "</div></div>";
  }).join("");
}
$("v-q").addEventListener("input", paintVenues);
$("v-noregion").addEventListener("change", paintVenues);
$("venue-list").addEventListener("click", function (ev) {
  var b = ev.target.closest("[data-venue-edit],[data-venue-merge],[data-venue-delete]"); if (!b) return;
  var mode = b.hasAttribute("data-venue-edit") ? "edit" : b.hasAttribute("data-venue-merge") ? "merge" : "delete";
  var id = +b.getAttribute("data-venue-" + mode), v = VLIST.filter(function (x) { return x.id === id; })[0];
  if (v) openVenueDialog(mode, v, b);
});
function openVenueDialog(mode, v, opener) {
  VDLG = { mode: mode, v: v, opener: opener };
  $("vd-heading").textContent = mode === "edit" ? "Edit " + v.name : mode === "merge" ? "Merge " + v.name + " into another venue" : "Delete " + v.name + "?";
  $("vd-edit").hidden = mode !== "edit"; $("vd-merge").hidden = mode !== "merge"; $("vd-delete").hidden = mode !== "delete";
  $("vd-go").textContent = mode === "edit" ? "Save changes" : mode === "merge" ? "Merge" : "Delete venue";
  $("vd-go").className = mode === "delete" ? "btn danger solid" : "btn";
  $("vd-sheet").hidden = !v.sheet_events || mode === "delete";
  $("vd-sheet").textContent = plural(v.sheet_events, "of its events comes", "of its events come") + " from the Google Sheet. " +
    "The nightly sync uses the sheet's venue names, so after a rename or merge those events go back to a venue with the sheet's name. Fix the name in the sheet as well.";
  $("vd-error").textContent = ""; setVenueBusy(false);
  if (mode === "edit") { $("vd-name").value = v.name; $("vd-hood").value = v.neighborhood; $("vd-area").value = v.area; $("vd-region").value = v.region || ""; }
  if (mode === "merge") { $("vd-find").value = ""; fillMergeTargets(); }
  if (mode === "delete") $("vd-delete").textContent = "No events use " + venueLabel(v) + ", so it can go. This can't be undone.";
  $("venue-dialog").showModal();
  (mode === "edit" ? $("vd-name") : mode === "merge" ? $("vd-find") : $("vd-cancel")).focus();
}
function fillMergeTargets() {
  var v = VDLG.v, q = $("vd-find").value, keep = $("vd-into").value;
  var others = VLIST.filter(function (x) { return x.id !== v.id && venueMatches(x, q); }).slice(0, 200);
  $("vd-into").innerHTML = others.map(function (x) {
    return '<option value="' + esc(x.id) + '">' + esc(venueLabel(x)) + " (" + plural(x.events, "event", "events") + ")</option>";
  }).join("");
  if (keep && $("vd-into").querySelector('option[value="' + keep + '"]')) $("vd-into").value = keep;
  mergePreview();
}
function mergePreview() {
  var v = VDLG.v, into = VLIST.filter(function (x) { return String(x.id) === $("vd-into").value; })[0];
  $("vd-preview").textContent = !into ? ($("vd-into").options.length ? "Choose the venue to keep." : "No other venue matches.") :
    plural(v.events, "event", "events") + " will move to " + venueLabel(into) + ", and " + venueLabel(v) + " will be removed.";
}
$("vd-find").addEventListener("input", fillMergeTargets);
$("vd-into").addEventListener("change", mergePreview);
function setVenueBusy(on) { Array.prototype.forEach.call($("venue-form").querySelectorAll("button, input, select"), function (x) { x.disabled = on; }); }
$("vd-cancel").addEventListener("click", function () { $("venue-dialog").close(); });
$("venue-form").addEventListener("input", function () { $("vd-error").textContent = ""; });
$("venue-dialog").addEventListener("close", function () {
  var was = VDLG; VDLG = null;
  if (was && was.opener && document.contains(was.opener)) was.opener.focus();
});
$("venue-form").addEventListener("submit", function (ev) {
  ev.preventDefault();
  var d = VDLG; if (!d) return;
  var v = d.v, req, said, after = null;
  if (d.mode === "edit") {
    var name = $("vd-name").value.trim(), hood = $("vd-hood").value.trim(), body = {};
    if (!name) { $("vd-error").textContent = "Give the venue a name."; $("vd-name").focus(); return; }
    if (name !== v.name) body.name = name;
    if (hood !== v.neighborhood) body.neighborhood = hood;
    if ($("vd-area").value !== v.area) body.area = $("vd-area").value;
    if ($("vd-region").value !== (v.region || "")) body.region = $("vd-region").value || null; // left alone: worked out again if the venue moves
    if (!Object.keys(body).length) { $("venue-dialog").close(); return; }
    req = api("/venues/" + v.id, { method: "PATCH", body: body }); said = "Saved " + name + "."; after = v.id;
  } else if (d.mode === "merge") {
    var into = VLIST.filter(function (x) { return String(x.id) === $("vd-into").value; })[0];
    if (!into) { $("vd-error").textContent = "Choose the venue to merge into."; $("vd-into").focus(); return; }
    req = api("/venues/" + v.id + "/merge-into/" + into.id, { method: "POST" });
    said = "Merged " + venueLabel(v) + " into " + venueLabel(into) + "."; after = into.id;
  } else {
    req = api("/venues/" + v.id, { method: "DELETE" }); said = "Deleted " + venueLabel(v) + ".";
  }
  setVenueBusy(true);
  req.then(readJSON).then(function (res) {
    if (!res.ok) { setVenueBusy(false); $("vd-error").textContent = errorText(res); return; }
    $("edit-live").textContent = said;
    VDLG = null; $("venue-dialog").close();
    VENUES = null; // the submit form's venue list is out of date now
    reloadEvents(); // cards show venue names
    loadVenues(after).then(function () { if (!after || !document.activeElement || document.activeElement === document.body) $("venues-title").focus(); });
  }, function () { setVenueBusy(false); $("vd-error").textContent = errorText(null); });
});

// ---------- edit, withdraw or delete an event (admins, CC-56) ----------
// One dialog for every place an event shows (cards, the review lists). It sends only the fields that
// changed, so an untouched price keeps the sheet's exact lowest price. Afterwards every list on the
// page is updated in place, and focus goes back to the Edit button (or the view's heading if it's gone).
var EDITING = null, REFOCUS = null; // the open edit; the event whose Edit button should get focus back
function editButtonHTML(e, cls) {
  return '<button type="button" class="' + cls + '" data-edit="' + esc(e.id) + '" aria-label="Edit ' + esc(e.title) + '">Edit</button>';
}
function openEditor(e, opener) {
  EDITING = { e: e, opener: opener };
  foundMode(null); // the same form approves found events (CC-71)
  $("ed-heading").textContent = "Edit " + e.title;
  $("ed-sheet").hidden = !e.sourceId;
  $("ed-title").value = e.title; $("ed-category").value = e.type; $("ed-status").value = e.status || "approved";
  $("ed-venue").value = e.venue; $("ed-hood").value = e.hood || "";
  $("ed-begin").value = e.begin || ""; $("ed-end").value = e.end || ""; $("ed-open-run").checked = !!e.openRun;
  $("ed-cost").value = e.costRaw || ""; $("ed-url").value = e.url || "";
  $("ed-publish-at").value = e.publishAt ? localInputValue(e.publishAt) : "";
  $("ed-withdraw").textContent = e.status === "withdrawn" ? "Restore" : "Withdraw";
  $("ed-error").textContent = ""; $("ed-confirm").hidden = true; setEditorBusy(false);
  $("edit-dialog").showModal(); $("ed-title").focus();
}
function closeEditor() { if ($("edit-dialog").open) $("edit-dialog").close(); }
$("edit-dialog").addEventListener("close", function () { // Escape, Cancel or done: back to where the admin was
  var was = EDITING; EDITING = null; if (!was) return;
  REFOCUS = was.e.id;
  var back = was.opener && document.contains(was.opener) ? was.opener :
    Array.prototype.filter.call(document.querySelectorAll('[data-edit="' + was.e.id + '"]'), function (b) { return b.offsetParent; })[0];
  var view = Object.keys(VIEWS).filter(function (v) { return visible(v); })[0];
  (back || $(VIEWS[view] || "home-title")).focus();
});
// The review lists reload after an edit; if that took away the focused button, put focus back.
function refocusAfterEdit() {
  if (!REFOCUS || (document.activeElement && document.activeElement !== document.body)) return;
  var b = Array.prototype.filter.call(document.querySelectorAll('[data-edit="' + REFOCUS + '"]'), function (x) { return x.offsetParent; })[0];
  (b || $("review-title")).focus();
}
function setEditorBusy(on) {
  Array.prototype.forEach.call($("edit-form").querySelectorAll("button, input, select"), function (x) { x.disabled = on; });
}
document.addEventListener("click", function (ev) {
  var b = ev.target.closest("[data-edit]"); if (!b || !isAdmin()) return;
  var e = KNOWN[b.getAttribute("data-edit")]; if (e) openEditor(e, b);
});
$("ed-cancel").addEventListener("click", closeEditor);
$("edit-form").addEventListener("input", function () { $("ed-error").textContent = ""; });
$("ed-open-run").addEventListener("change", function () { if (this.checked) $("ed-end").value = ""; });
function editorFail(res, fieldId, text) {
  setEditorBusy(false); $("ed-error").textContent = text || errorText(res); if (fieldId) $(fieldId).focus();
}
// The venue as an id: a known venue with this name and neighborhood, or a new one (admins may add venues).
function venueIdFor(name, hood) {
  function find(list) {
    return (list || []).filter(function (v) { return v.name.toLowerCase() === name.toLowerCase() && v.neighborhood.toLowerCase() === hood.toLowerCase(); })[0];
  }
  var known = find(VENUES);
  if (known) return Promise.resolve(known.id);
  return api("/venues", { method: "POST", body: { name: name, neighborhood: hood } }).then(readJSON).then(function (res) {
    if (res.ok) { if (VENUES) VENUES.push(res.body); return res.body.id; }
    if (res.status !== 409) throw res;
    return api("/venues?q=" + encodeURIComponent(name)).then(readJSON).then(function (r) { // added since we last looked
      var v = r.ok && find(r.body); if (!v) throw res; return v.id;
    });
  });
}
$("edit-form").addEventListener("submit", function (ev) {
  ev.preventDefault();
  if (EDITING && EDITING.found) { approveFromEditor(); return; } // "Edit then approve" a found event (found.js)
  var e = EDITING && EDITING.e; if (!e) return;
  var title = $("ed-title").value.trim(), venue = $("ed-venue").value.trim(), hood = $("ed-hood").value.trim();
  var begin = $("ed-begin").value || null, end = $("ed-end").value || null, url = $("ed-url").value.trim(), cost = $("ed-cost").value.trim();
  var at = $("ed-publish-at").value ? new Date($("ed-publish-at").value) : null; // read as local time
  var bad = !title ? ["ed-title", "Give the event's name."] : !venue ? ["ed-venue", "Say where it's happening."] :
    (begin && end && end < begin) ? ["ed-end", "The closing date is before the opening date."] :
    (url && !/^https?:\/\//i.test(url)) ? ["ed-url", "The link should start with https://"] :
    (at && isNaN(at)) ? ["ed-publish-at", "Pick a date and time, or leave it blank."] : null;
  if (bad) { editorFail(null, bad[0], bad[1]); return; }
  var body = {}, openRun = $("ed-open-run").checked;
  if (title !== e.title) body.title = title;
  if ($("ed-category").value !== e.type) body.category = $("ed-category").value;
  if ($("ed-status").value !== e.status) body.status = $("ed-status").value;
  if (begin !== (e.begin || null)) body.begin_date = begin;
  if (end !== (e.end || null)) body.end_date = end;
  if (openRun !== !!e.openRun) body.open_run = openRun;
  if (cost !== (e.costRaw || "")) { body.cost_text = cost; body.min_price = minPrice(cost); }
  if (url !== (e.url || "")) body.url = url;
  var wasAt = e.publishAt ? e.publishAt.getTime() : null, nowAt = at ? at.getTime() : null;
  if (Math.floor((wasAt || 0) / 60000) !== Math.floor((nowAt || 0) / 60000)) body.publish_at = at ? at.toISOString() : null;
  var venueChanged = venue.toLowerCase() !== e.venue.toLowerCase() || hood.toLowerCase() !== (e.hood || "").toLowerCase();
  setEditorBusy(true); $("ed-error").textContent = "";
  (venueChanged ? venueIdFor(venue, hood) : Promise.resolve(null)).then(function (venueId) {
    if (venueId !== null && venueId !== e.venueId) body.venue_id = venueId;
    if (!Object.keys(body).length) { closeEditor(); return; } // nothing changed
    return saveEvent(e, body, "Saved changes to " + title + ".");
  }).catch(function (res) { editorFail(res, "ed-venue"); });
});
function saveEvent(e, body, said) {
  return api("/events/" + encodeURIComponent(e.id), { method: "PATCH", body: body }).then(readJSON).then(function (res) {
    if (!res.ok) { editorFail(res); return; }
    var updated = toEvent(res.body);
    eventChanged(e.id, updated); $("edit-live").textContent = said; closeEditor();
  }, function () { editorFail(null); });
}
$("ed-withdraw").addEventListener("click", function () {
  var e = EDITING && EDITING.e; if (!e) return;
  var restore = e.status === "withdrawn"; setEditorBusy(true);
  saveEvent(e, { status: restore ? "approved" : "withdrawn" }, (restore ? "Restored " : "Withdrew ") + e.title + ".");
});
$("ed-delete").addEventListener("click", function () {
  var e = EDITING && EDITING.e; if (!e) return;
  $("ed-confirm-text").textContent = "Delete \u201c" + e.title + "\u201d for good? Everyone's \u201cI've been\u201d marks and plans for it go too, and it can't be undone." +
    (e.sourceId ? " It's from the Google Sheet, so the nightly sync adds it back unless it's removed there." : "");
  $("ed-confirm").hidden = false; $("ed-delete-no").focus();
});
$("ed-delete-no").addEventListener("click", function () { $("ed-confirm").hidden = true; $("ed-delete").focus(); });
$("ed-delete-yes").addEventListener("click", function () {
  var e = EDITING && EDITING.e; if (!e) return;
  setEditorBusy(true);
  api("/events/" + encodeURIComponent(e.id), { method: "DELETE" }).then(function (r) {
    if (!r.ok && r.status !== 404) return readJSON(r).then(function (res) { editorFail(res); });
    eventChanged(e.id, null); $("edit-live").textContent = "Deleted " + e.title + "."; closeEditor();
  }, function () { editorFail(null); });
});
// Bring every list on the page in line with an edited (or deleted: null) event, without reloading them.
function eventChanged(id, e) {
  var live = !!e && e.status === "approved" && !(e.publishAt && e.publishAt > new Date());
  function swap(list, keep) {
    return keep ? list.map(function (x) { return x.id === id ? e : x; }) : list.filter(function (x) { return x.id !== id; });
  }
  if (!e) { delete KNOWN[id]; delete WENT[id]; delete MYPLANS[id]; }
  var shown = CAT_ITEMS.length; CAT_ITEMS = swap(CAT_ITEMS, live); CAT_TOTAL -= shown - CAT_ITEMS.length;
  SOON = swap(SOON, live); WENT_LIST = swap(WENT_LIST, !!e); MYPLAN_LIST = swap(MYPLAN_LIST, live);
  rerenderLists();
  if (visible("review")) renderReview();
  if (isAdmin()) updateReviewCount();
}

// ---------- site stats (admins, CC-67) ----------
// Weekly totals from GET /admin/stats: a number for this week, last week's beside it, and a small
// bar chart of the last 12 weeks (this week's bar in the accent). Totals only; never who.
var STAT_METRICS = [
  ["registrations", "New members", function (w) { return w.confirmed + " confirmed their email"; }],
  ["active", "Active members", function () { return "used the site while signed in"; }],
  ["plans_interested", "Marked interested", function () { return "new “Interested” plans"; }],
  ["plans_going", "Committed to a date", function () { return "new plans with a date"; }],
  ["attended", "“I've been” marks", function () { return "events members say they went to"; }],
  ["submitted", "Events sent in", function () { return "suggestions from members"; }]
];
function openStats() { if (!isAdmin()) { openAccount(); return; } show("stats"); loadStats(); loadTraffic(); loadInterest(); }
function loadStats() {
  $("stats-status").textContent = "Loading…";
  api("/admin/stats?weeks=12&today=" + isoDate(T)).then(readJSON).then(function (res) {
    if (!res.ok) { $("stats-status").textContent = errorText(res); return; }
    $("stats-status").textContent = ""; paintStats(res.body);
  }, function () { $("stats-status").textContent = errorText(null); });
}
function pct(n, d) { return d ? Math.round(100 * n / d) + "%" : "–"; }
function statBars(weeks, key) {
  var vals = weeks.map(function (w) { return w[key]; }), max = Math.max.apply(null, vals.concat([1]));
  var W = 240, H = 56, gap = 4, bw = (W - gap * (vals.length - 1)) / vals.length;
  var bars = vals.map(function (v, i) {
    var h = v ? Math.max(3, Math.round((v / max) * (H - 4))) : 1, x = i * (bw + gap);
    return '<rect x="' + x.toFixed(1) + '" y="' + (H - h) + '" width="' + bw.toFixed(1) + '" height="' + h + '" rx="2" class="' +
      (i === vals.length - 1 ? "now" : "past") + '"><title>Week of ' + esc(short(parseISO(weeks[i].start))) + ": " + v + "</title></rect>";
  }).join("");
  var label = "Last " + vals.length + " weeks: from " + Math.min.apply(null, vals) + " to " + max + "; this week " + vals[vals.length - 1];
  return '<svg class="bars" viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none" role="img" aria-label="' + esc(label) + '">' + bars + "</svg>" +
    '<div class="bars-axis"><span>' + esc(short(parseISO(weeks[0].start))) + "</span><span>This week</span></div>";
}
function paintStats(s) {
  var weeks = s.weeks, now = weeks[weeks.length - 1], last = weeks[weeks.length - 2] || null, r = s.retention;
  $("stats-summary").innerHTML =
    '<div><strong>' + s.members + "</strong><span>members, " + pct(s.confirmed_members, s.members) + " confirmed their email</span></div>" +
    '<div><strong>' + (r.eligible ? pct(r.retained, r.eligible) : "–") + "</strong><span>" +
      (r.eligible ? "came back 4+ weeks after joining (" + r.retained + " of " + r.eligible + ")" : "came back after 4 weeks (not enough history yet)") + "</span></div>" +
    '<div><strong>' + (s.active_since ? esc(short(parseISO(s.active_since))) : "Today") + "</strong><span>activity counted since</span></div>";
  $("stats-grid").innerHTML = STAT_METRICS.map(function (m) {
    var key = m[0];
    return '<section class="stat-card"><h2 class="eyebrow">' + esc(m[1]) + "</h2>" +
      '<p class="stat-now"><strong>' + now[key] + "</strong> this week" + (last ? '<span class="stat-last">last week ' + last[key] + "</span>" : "") + "</p>" +
      '<p class="hint small">' + esc(m[2](now)) + "</p>" + statBars(weeks, key) + "</section>";
  }).join("");
}

// CC-69: the events members are most interested in or committed to, as stacked bars (committed, then
// interested) scaled to the busiest event, with "I've been" counts. Totals only; never who.
function loadInterest() {
  $("interest-status").textContent = "Loading…";
  var type = $("i-type");
  if (type.options.length === 1) TYPES.forEach(function (t) { type.add(new Option(t, t)); }); // the types in use, as the catalog lists them
  api("/admin/stats/events?" + qs([["range", $("i-range").value], ["include_closed", $("i-closed").checked ? "true" : ""], ["category", type.value],
    ["limit", 15], ["today", isoDate(T)]])).then(readJSON).then(function (res) {
    if (!res.ok) { $("interest-status").textContent = errorText(res); return; }
    paintInterest(res.body);
  }, function () { $("interest-status").textContent = errorText(null); });
}
function paintInterest(rows) {
  var span = { week: "this week", "30d": "in the last 30 days", all: "yet" }[$("i-range").value], type = $("i-type").value;
  $("interest-status").textContent = rows.length ? "" : "No member has marked " + (type ? "a " + type.toLowerCase() + " event " : "an event ") + span + ".";
  var max = Math.max.apply(null, rows.map(function (r) { return r.interested + r.going; }).concat([1]));
  $("interest-list").innerHTML = rows.map(function (r) {
    var e = toEvent(r.event);
    var counts = [[r.going, " committed"], [r.interested, " interested"], [r.attended, " \u201cI've been\u201d"]]
      .filter(function (c) { return c[0]; }).map(function (c) { return c[0] + c[1]; }).join(" · ");
    return '<li><div class="interest-name"><span class="kind">' + esc(e.type) + '</span><a href="' + esc(safeUrl(e.url)) + '" target="_blank" rel="noopener">' + esc(e.title) + "</a>" +
      '<span class="hint small">' + esc(placeText(e)) + "</span></div>" +
      '<div class="interest-bar" role="img" aria-label="' + esc(counts) + '">' +
      '<span class="seg going" style="width:' + (100 * r.going / max).toFixed(1) + '%"></span>' +
      '<span class="seg interested" style="width:' + (100 * r.interested / max).toFixed(1) + '%"></span></div>' +
      '<p class="interest-counts">' + esc(counts) + "</p></li>";
  }).join("");
}
$("i-type").addEventListener("change", loadInterest);
$("i-range").addEventListener("change", loadInterest);
$("i-closed").addEventListener("change", loadInterest);

// CC-68: visits over the last 30 days: totals, a daily chart of visitors (returning ones stacked under
// new ones), and views of each part of the site. Counts only.
var VIEW_NAMES = { home: "Home", catalog: "Catalog", plan: "Plan an outing", submit: "Submit", account: "Account",
  review: "Review", venues: "Venues", stats: "Stats", reset: "Password reset", verify: "Email confirmation" };
function loadTraffic() {
  $("traffic-status").textContent = "Loading…";
  api("/admin/stats/traffic?days=30&today=" + isoDate(T)).then(readJSON).then(function (res) {
    if (!res.ok) { $("traffic-status").textContent = errorText(res); return; }
    $("traffic-status").textContent = res.body.counting_since ? "" : "No visits counted yet.";
    paintTraffic(res.body);
  }, function () { $("traffic-status").textContent = errorText(null); });
}
function paintTraffic(t) {
  var sum = function (k) { return t.days.reduce(function (n, d) { return n + d[k]; }, 0); };
  $("traffic-summary").innerHTML =
    "<div><strong>" + t.visitors + "</strong><span>visitors</span></div>" +
    "<div><strong>" + pct(t.returning_visitors, t.visitors) + "</strong><span>came back (" + t.returning_visitors + ")</span></div>" +
    "<div><strong>" + sum("views") + "</strong><span>page views</span></div>" +
    "<div><strong>" + sum("tickets") + "</strong><span>clicks to an event's page</span></div>" +
    "<div><strong>" + sum("outings") + "</strong><span>outings planned</span></div>";
  var max = Math.max.apply(null, t.days.map(function (d) { return d.visitors; }).concat([1]));
  var W = 600, H = 120, gap = 3, bw = (W - gap * (t.days.length - 1)) / t.days.length;
  var bars = t.days.map(function (d, i) {
    var x = (i * (bw + gap)).toFixed(1), hAll = d.visitors ? Math.max(3, Math.round(d.visitors / max * (H - 6))) : 1;
    var hRet = d.visitors ? Math.round(hAll * d.returning / d.visitors) : 0, label = esc(short(parseISO(d.day))) + ": " +
      plural(d.visitors, "visitor", "visitors") + ", " + d.returning + " returning, " + plural(d.views, "view", "views");
    return '<g><title>' + label + '</title><rect x="' + x + '" y="' + (H - hAll) + '" width="' + bw.toFixed(1) + '" height="' + hAll + '" rx="2" class="new"></rect>' +
      (hRet ? '<rect x="' + x + '" y="' + (H - hRet) + '" width="' + bw.toFixed(1) + '" height="' + hRet + '" rx="2" class="ret"></rect>' : "") + "</g>";
  }).join("");
  $("traffic-chart").innerHTML = '<svg viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none" role="img" aria-label="' +
    esc("Visitors per day for 30 days, from " + Math.min.apply(null, t.days.map(function (d) { return d.visitors; })) + " to " + max +
      "; today " + t.days[t.days.length - 1].visitors) + '">' + bars + "</svg>" +
    '<div class="bars-axis"><span>' + esc(short(parseISO(t.days[0].day))) + "</span><span>Today</span></div>";
  var views = Object.keys(t.by_view).map(function (k) { return (VIEW_NAMES[k] || k) + " " + t.by_view[k]; });
  $("traffic-views").textContent = views.length ? "Views by section: " + views.join(" · ") : "";
}

// ---------- event sources (admins, CC-70) ----------
// The discovery job runs hourly on the server and checks only the sources that are due. Here an
// admin sees each source's last check (and why one couldn't be read), changes how often it's checked,
// turns it off, or asks for a check at the next hourly run.
var SOURCE_KINDS = { theater: "Theater", opera: "Opera", museum: "Museum", music: "Music", comedy: "Comedy" };
var SOURCE_STATUS = { ok: ["Found changes", "ok"], unchanged: ["No changes", ""], blocked: ["Can't be read", "bad"], error: ["Check failed", "bad"], "": ["Not checked yet", ""] };
var EVERY = [[7, "Every week"], [14, "Every 2 weeks"], [30, "Every month"], [60, "Every 2 months"]];
function openSources() { if (!isAdmin()) { openAccount(); return; } show("sources"); loadSources(); }
var SOURCES = null, SOURCES_SORT = "name";
// Sort the sources list: by name, by found items waiting, or by when each was last checked (never-checked last
// for "most recent", first for "longest ago"). Ties keep name order.
function sortedSources(list) {
  function when(s) { return s.last_checked_at ? new Date(s.last_checked_at).getTime() : null; }
  return list.slice().sort(function (a, b) {
    var ta = when(a), tb = when(b), d = 0;
    if (SOURCES_SORT === "waiting") d = b.waiting - a.waiting;
    else if (SOURCES_SORT === "checked") d = (tb === null ? -Infinity : tb) - (ta === null ? -Infinity : ta);
    else if (SOURCES_SORT === "stale") d = (ta === null ? -Infinity : ta) - (tb === null ? -Infinity : tb);
    return d || a.name.localeCompare(b.name);
  });
}
$("sources-sort").addEventListener("change", function () { SOURCES_SORT = this.value; if (SOURCES) paintSources(SOURCES); });
function loadSources(focusId) {
  $("sources-status").textContent = "Loading…";
  api("/admin/discovery/sources").then(readJSON).then(function (res) {
    if (!res.ok) { $("sources-status").textContent = errorText(res); return; }
    $("sources-status").textContent = ""; paintSources(res.body);
    var b = focusId && $("sources-list").querySelector(focusId); if (b) b.focus();
  }, function () { $("sources-status").textContent = errorText(null); });
}
function whenText(iso) { return iso ? short(new Date(iso)) : "never"; }
function paintSources(o) {
  SOURCES = o;
  var bad = o.sources.filter(function (s) { return s.last_status === "blocked" || s.last_status === "error"; }).length;
  $("sources-summary").innerHTML =
    "<div><strong>" + o.sources.length + "</strong><span>sources" + (bad ? ", " + bad + " to look at" : "") + "</span></div>" +
    "<div><strong>" + o.sources.reduce(function (n, s) { return n + s.waiting; }, 0) + "</strong><span>found, waiting for review</span></div>" +
    "<div><strong>$" + o.cost_30d_usd.toFixed(2) + "</strong><span>reading cost, last 30 days (" +
      Math.round((o.tokens_in_30d + o.tokens_out_30d) / 1000) + "K tokens)</span></div>";
  $("sources-list").innerHTML = sortedSources(o.sources).map(function (s) {
    var st = SOURCE_STATUS[s.last_status] || [s.last_status, ""], id = esc(s.id);
    var every = EVERY.some(function (e) { return e[0] === s.every_days; }) ? EVERY : EVERY.concat([[s.every_days, "Every " + s.every_days + " days"]]);
    return '<div class="queue-item source"><div class="alt-text">' +
      '<p class="alt-title">' + esc(s.name) + ' <span class="state ' + st[1] + '">' + esc(st[0]) + "</span>" + (s.active ? "" : ' <span class="state">Off</span>') + "</p>" +
      '<p class="alt-meta">' + esc(SOURCE_KINDS[s.kind] || s.kind) + " · " + (s.reader === "aic_api" ? "the museum's own API" : plural(s.pages.length, "page", "pages")) +
        " · last checked " + esc(whenText(s.last_checked_at)) + " · next " + (s.active ? (s.next_check_on ? esc(short(parseISO(s.next_check_on))) : "within the hour") : "off") +
        (s.waiting ? " · " + plural(s.waiting, "item", "items") + " waiting" : "") + "</p>" +
      (s.last_error ? '<p class="alt-meta source-error">' + esc(s.last_error) + "</p>" : "") +
      (s.reader === "aic_api" ? "" : '<p class="alt-meta">' + s.pages.map(function (p) { return '<a href="' + esc(safeUrl(p)) + '" target="_blank" rel="noopener">' + esc(p.replace(/^https?:\/\/(www\.)?/, "")) + "</a>"; }).join(" · ") + "</p>") +
      "</div>" +
      '<div class="row"><label class="sr-only" for="src-every-' + id + '">How often to check ' + esc(s.name) + "</label>" +
      '<select id="src-every-' + id + '" data-src-every="' + id + '">' + every.map(function (e) {
        return '<option value="' + e[0] + '"' + (e[0] === s.every_days ? " selected" : "") + ">" + esc(e[1]) + "</option>"; }).join("") + "</select>" +
      '<button class="btn neutral" type="button" data-src-check="' + id + '"' + (s.active ? "" : " disabled") + ' aria-label="Check ' + esc(s.name) + ' now">Check now</button>' +
      '<button class="btn ghost" type="button" data-src-toggle="' + id + '" data-on="' + s.active + '" aria-label="' + (s.active ? "Turn off " : "Turn on ") + esc(s.name) + '">' + (s.active ? "Turn off" : "Turn on") + "</button>" +
      "</div></div>";
  }).join("");
}
$("sources-list").addEventListener("click", function (ev) {
  var b = ev.target.closest("[data-src-check],[data-src-toggle]"); if (!b) return;
  var check = b.hasAttribute("data-src-check"), id = b.getAttribute(check ? "data-src-check" : "data-src-toggle");
  b.disabled = true;
  var req = check ? api("/admin/discovery/sources/" + id + "/check", { method: "POST" })
    : api("/admin/discovery/sources/" + id, { method: "PATCH", body: { active: b.getAttribute("data-on") !== "true" } });
  req.then(readJSON).then(function (res) {
    if (!res.ok) { b.disabled = false; $("sources-status").textContent = errorText(res); return; }
    $("edit-live").textContent = check ? res.body.name + " will be checked within the hour." : res.body.name + (res.body.active ? " turned on." : " turned off.");
    loadSources(check ? '[data-src-check="' + id + '"]' : '[data-src-toggle="' + id + '"]');
  }, function () { b.disabled = false; $("sources-status").textContent = errorText(null); });
});
$("sources-list").addEventListener("change", function (ev) {
  var sel = ev.target.closest("[data-src-every]"); if (!sel) return;
  var id = sel.getAttribute("data-src-every");
  api("/admin/discovery/sources/" + id, { method: "PATCH", body: { every_days: +sel.value } }).then(readJSON).then(function (res) {
    if (!res.ok) { $("sources-status").textContent = errorText(res); return; }
    $("edit-live").textContent = res.body.name + ": " + sel.options[sel.selectedIndex].text.toLowerCase() + ".";
    loadSources('[data-src-every="' + id + '"]');
  }, function () { $("sources-status").textContent = errorText(null); });
});
