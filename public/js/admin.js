// Culture Crew site: Admin tools: the review queue, venues, and editing events.
// Loaded by index.html in order (core, util, catalog, planner, account, crews, submit, admin, hours, found, issues, photos, approvals, start); they share one
// global scope, so anything declared here is visible to the files after it.
"use strict";
// ---------- review queue (admins) ----------
function submitterText(who) { // null: came from the old Google Sheet, or the account was deleted
  if (!who) return "No submitter on record";
  var mail = '<a href="mailto:' + esc(who.email) + '">' + esc(who.email) + "</a>";
  return "Submitted by " + (who.display_name.trim() ? esc(who.display_name) + " (" + mail + ")" : mail);
}
function creditText(e) { return e.suggestedBy ? " · wants public credit" : e.creditMe ? " · wants credit, but has no name to show" : ""; }
// CC-102: sent with "Don't know!" (or otherwise without any dates): the crew looks them up
function datesToLookUp(e) { return !e.b && !e.n && !e.openRun && !(e.runDates && e.runDates.length); }
function queueItemHTML(e, actions, note) { // note: an extra line, such as which rule caught it (CC-100)
  return '<div class="queue-item"><div class="alt-text"><p class="kind">' + esc(e.label) + '</p><p class="alt-title">' +
    (e.url ? '<a href="' + esc(safeUrl(e.url)) + '" target="_blank" rel="noopener">' + esc(e.title) + "</a>" : esc(e.title)) + "</p>" +
    '<p class="alt-meta">' + esc(placeText(e)) + " · " + (datesToLookUp(e) ? '<span class="state">Dates to look up</span>' : esc(e.b || e.n ? dateText(e) : "Dates not given")) +
      " · " + esc(costText(e)) + "</p>" +
    (e.runDates && e.runDates.length ? '<p class="alt-meta">Fixed run: ' + esc(e.runDates.map(function (r) { return goingDay(r.date) + " " + clockText(r.time); }).join(", ")) + "</p>" : "") +
    (e.submitter !== undefined ? '<p class="alt-meta">' + submitterText(e.submitter) + creditText(e) + "</p>" :
      e.suggestedBy ? '<p class="alt-meta">Credited as "Suggested by ' + esc(e.suggestedBy) + '"</p>' : "") +
    (note ? '<p class="alt-meta">' + esc(note) + "</p>" : "") + "</div>" +
    '<div class="row">' + actions + "</div></div>";
}
// CC-206: from Event Sourcing, a heading to move to once the two long lists above it are in (they move it down the page)
var REVIEW_JUMP = null, REVIEW_JUMP_WAIT = 0;
function reviewListIn() { if (REVIEW_JUMP && !--REVIEW_JUMP_WAIT) { $(REVIEW_JUMP).focus(); REVIEW_JUMP = null; } }
function openReview(jump) { if (!isAdmin()) { openAccount(); return; } REVIEW_JUMP = jump || null; REVIEW_JUMP_WAIT = 2; renderReview(); updateFoundCount(); show("review"); }
function updateReviewCount(n) {
  if (n !== undefined) { $("review-count").textContent = $("review-n").textContent = $("rv-review-count").textContent = n ? String(n) : ""; return; } // CC-149: also on the Waiting rule
  api("/admin/events?limit=1").then(readJSON).then(function (res) { if (res.ok) updateReviewCount(res.body.total); }, function () {});
}
var EMPTY = { "review-list": "Nothing waiting for review.", "scheduled-list": "Nothing scheduled.", "withdrawn-list": "Nothing withdrawn.",
  "caught-list": "Nothing caught." };
function renderReview() {
  renderScheduled(); renderWithdrawn(); renderCaught(); loadSubmissionRules(); loadRoundups(); renderOtherTypes(); renderRemoved();
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
    reviewListIn();
  }, function () { $("review-list").innerHTML = '<p class="form-error">' + esc(errorText(null)) + "</p>"; });
}
// CC-133: what removing Comedy and Educational withdrew (and everything at The Second City and The Annoyance). Bring one
// back with one of the three types, or delete it (CC-153), one at a time or all at once. Hidden when there are none.
function removedItemHTML(raw) {
  var e = toEvent(raw), id = esc(e.id), reason = raw.withdrawn_reason; // its old type, or its venue's name
  var why = (reason === "Comedy" || reason === "Educational" ? "Type was " : "At ") + reason;
  var pick = TYPE_ORDER.indexOf(raw.category) >= 0 ? raw.category : "";
  return queueItemHTML(e, '<label class="sr-only" for="rm-type-' + id + '">Type to bring ' + esc(e.title) + " back as</label>" +
    '<select id="rm-type-' + id + '" data-rm-type="' + id + '"><option value=""' + (pick ? "" : " selected") + ">Bring back as…</option>" +
      TYPE_ORDER.map(function (t) { return '<option value="' + esc(t) + '"' + (t === pick ? " selected" : "") + ">" + esc(t) + "</option>"; }).join("") + "</select>" +
    '<button class="btn" type="button" data-rm-back="' + id + '" aria-label="Bring back ' + esc(e.title) + '">Bring back</button>' + editButtonHTML(e, "btn ghost") +
    '<button class="btn danger" type="button" data-rm-del="' + id + '" data-title="' + esc(e.title) + '" aria-label="Delete ' + esc(e.title) + '">Delete…</button>', why);
}
function rmAskHTML(id, title) { // CC-153: the same inline confirm as deleting a source
  return '<div class="rm-confirm" role="group" aria-labelledby="rm-ask-' + id + '"><p id="rm-ask-' + id + '"><strong>Delete ' + esc(title) + "?</strong> " +
    "Everyone's “I've been” marks, plans and photos for it go too. This can't be undone.</p>" +
    '<div class="row"><button class="btn danger solid" type="button" data-rm-del-yes="' + id + '">Delete event</button>' +
    '<button class="btn ghost" type="button" data-rm-del-no="' + id + '">Keep it</button></div></div>';
}
function removedLeft() { // CC-153: the count, and the section gone once it's empty
  var n = $("removed-list").children.length;
  $("removed").hidden = !n;
  $("removed-note").textContent = plural(n, "event is", "events are") + " hidden from the site. Each stays that way unless you bring it back as Theater, Music or Visual Art, or delete it.";
  $("removed-del-all").textContent = n > 1 ? "Delete all " + n + "…" : "Delete…";
  $("removed-del-all").setAttribute("aria-label", n > 1 ? "Delete all " + n + " withdrawn Comedy and Educational events" : "Delete the withdrawn Comedy or Educational event");
  return n;
}
function closeRemovedAsk() { dropEmpty($("removed-ask")); $("removed-del-all").setAttribute("aria-expanded", "false"); }
function renderRemoved() {
  api("/admin/events/removed").then(readJSON).then(function (res) {
    var list = res.ok ? res.body : [];
    closeRemovedAsk(); $("removed-status").textContent = "";
    $("removed-list").innerHTML = list.map(removedItemHTML).join("");
    removedLeft();
    refocusAfterEdit();
  }, function () {});
}
function removedFail(item, res) {
  var old = item.querySelector(".form-error"); if (old) old.remove();
  item.querySelector(".alt-text").insertAdjacentHTML("beforeend", '<p class="form-error">' + esc(errorText(res)) + "</p>");
}
function removeRemovedItem(item) { // focus the next one's first control, or the section title
  var next = item.nextElementSibling || item.previousElementSibling;
  item.remove();
  var f = removedLeft() && next && next.querySelector("select"); (f || $("review-title")).focus();
}
function deleteRemoved(id) { // resolves true once it's gone (404 counts: someone else got there first)
  return api("/events/" + encodeURIComponent(id), { method: "DELETE" }).then(function (r) {
    if (r.ok || r.status === 404) { delete KNOWN[id]; delete WENT[id]; delete MYPLANS[id]; return true; }
    return readJSON(r);
  });
}
$("removed-list").addEventListener("click", function (ev) {
  var ask = ev.target.closest("[data-rm-del],[data-rm-del-no]");
  if (ask) { // CC-153: open or close the confirm under that event
    var asking = ask.hasAttribute("data-rm-del"), aid = ask.getAttribute(asking ? "data-rm-del" : "data-rm-del-no");
    var open = $("removed-list").querySelector(".rm-confirm:not([inert])"), item = ask.closest(".queue-item"), here = asking && open && item.contains(open);
    if (open && !here) dropGone(open);
    if (asking && !here) {
      closeRemovedAsk(); item.insertAdjacentHTML("beforeend", rmAskHTML(esc(aid), ask.getAttribute("data-title")));
      dropOpen(item.lastElementChild);
    }
    $("removed-list").querySelector(asking ? '[data-rm-del-no="' + aid + '"]' : '[data-rm-del="' + aid + '"]').focus();
    return;
  }
  var yes = ev.target.closest("[data-rm-del-yes]");
  if (yes) {
    var did = yes.getAttribute("data-rm-del-yes"), gone = yes.closest(".queue-item"), title = gone.querySelector('[data-rm-del]').getAttribute("data-title");
    yes.disabled = true;
    deleteRemoved(did).then(function (ok) {
      if (ok !== true) { yes.disabled = false; removedFail(gone, ok); return; }
      $("edit-live").textContent = "Deleted " + title + ".";
      removeRemovedItem(gone); reloadEvents();
    }, function () { yes.disabled = false; removedFail(gone, null); });
    return;
  }
  var b = ev.target.closest("[data-rm-back]"); if (!b) return;
  var id = b.getAttribute("data-rm-back"), item = b.closest(".queue-item"), sel = $("rm-type-" + id);
  var old = item.querySelector(".form-error"); if (old) old.remove();
  if (!sel.value) { item.querySelector(".alt-text").insertAdjacentHTML("beforeend", '<p class="form-error">Choose its type first.</p>'); sel.focus(); return; }
  b.disabled = sel.disabled = true;
  api("/events/" + encodeURIComponent(id), { method: "PATCH", body: { status: "approved", category: sel.value } }).then(readJSON).then(function (res) {
    if (!res.ok) { b.disabled = sel.disabled = false; removedFail(item, res); return; }
    $("edit-live").textContent = res.body.title + " is back on the site, as " + sel.value + ".";
    removeRemovedItem(item);
    reloadEvents();
  }, function () { b.disabled = sel.disabled = false; });
});
// CC-153: Delete all, after a confirm that says how many go; one DELETE at a time, with the progress in a status line
$("removed-del-all").addEventListener("click", function () {
  var n = $("removed-list").children.length; if (!n) return;
  var open = $("removed-list").querySelector(".rm-confirm:not([inert])"); if (open) dropGone(open);
  dropFill($("removed-ask"), '<div class="rm-confirm" role="group" aria-labelledby="rm-ask-all"><p id="rm-ask-all"><strong>Delete ' +
    (n > 1 ? "all " + n + " events" : "this event") + "?</strong> Everyone's “I've been” marks, plans and photos for " + (n > 1 ? "them" : "it") +
    " go too. This can't be undone.</p>" +
    '<div class="row"><button class="btn danger solid" type="button" id="rm-all-yes">Delete ' + plural(n, "event", "events") + "</button>" +
    '<button class="btn ghost" type="button" id="rm-all-no">Keep ' + (n > 1 ? "them" : "it") + "</button></div></div>");
  $("removed-del-all").setAttribute("aria-expanded", "true"); $("rm-all-no").focus();
});
$("removed-ask").addEventListener("click", function (ev) {
  if (ev.target.closest("#rm-all-no")) { closeRemovedAsk(); $("removed-del-all").focus(); return; }
  var yes = ev.target.closest("#rm-all-yes"); if (!yes) return;
  var items = Array.prototype.slice.call($("removed-list").children), total = items.length, done = 0, failed = 0;
  yes.disabled = $("rm-all-no").disabled = $("removed-del-all").disabled = true;
  function step(i) {
    if (i >= items.length) {
      closeRemovedAsk(); $("removed-del-all").disabled = false;
      $("removed-status").textContent = $("edit-live").textContent = "Deleted " + plural(done, "event", "events") + "." +
        (failed ? " " + plural(failed, "event", "events") + " couldn't be deleted; " + (failed > 1 ? "each says why" : "it says why") + "." : "");
      var left = removedLeft(); reloadEvents();
      (left ? $("removed-del-all") : $("review-title")).focus();
      return;
    }
    $("removed-status").textContent = "Deleting " + (i + 1) + " of " + total + "…";
    var item = items[i], id = item.querySelector("[data-rm-del]").getAttribute("data-rm-del");
    deleteRemoved(id).then(function (ok) {
      if (ok === true) { done++; item.remove(); removedLeft(); } else { failed++; removedFail(item, ok); }
      step(i + 1);
    }, function () { failed++; removedFail(item, null); step(i + 1); });
  }
  step(0);
});
// CC-125: events whose type isn't one of ours (the move to the five didn't guess); hidden when there are none
function renderOtherTypes() {
  api("/admin/events/other-types").then(readJSON).then(function (res) {
    var list = res.ok ? res.body : [];
    $("othertypes").hidden = !list.length;
    $("othertypes-note").textContent = plural(list.length, "event has", "events have") + " a type that isn't Theater, Music or Visual Art. Edit each to choose one.";
    $("othertypes-list").innerHTML = list.map(function (raw) { var e = toEvent(raw); return queueItemHTML(e, stateHTML(e) + editButtonHTML(e, "btn ghost")); }).join("");
    refocusAfterEdit();
  }, function () {});
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
    var items = res.body.items.filter(function (raw) { return !raw.withdrawn_reason; }); // CC-133: those have their own list
    $("withdrawn-list").innerHTML = items.length ? items.map(function (raw) {
      var e = toEvent(raw);
      return queueItemHTML(e, '<button class="btn ghost" type="button" data-review="approve" data-id="' + esc(e.id) + '">Restore</button>' +
        editButtonHTML(e, "btn ghost"));
    }).join("") : '<p class="hint">' + EMPTY["withdrawn-list"] + "</p>";
    refocusAfterEdit();
    reviewListIn();
  }, function () {});
}
function renderCaught() { // CC-100: rejected by an auto-reject rule, newest first; approve one if the rule was wrong
  api("/admin/events?status=rejected&caught=true&limit=100").then(readJSON).then(function (res) {
    if (!res.ok) { $("caught-list").innerHTML = '<p class="form-error">' + esc(errorText(res)) + "</p>"; return; }
    $("caught-list").innerHTML = res.body.items.length ? res.body.items.map(function (raw) {
      var e = toEvent(raw);
      return queueItemHTML(e, '<button class="btn ghost" type="button" data-review="approve" data-id="' + esc(e.id) + '">Approve</button>' +
        editButtonHTML(e, "btn ghost"), raw.reject_reason + " · " + short(new Date(raw.created_at)));
    }).join("") + (res.body.total > res.body.items.length ? '<p class="hint">Showing the newest ' + res.body.items.length + " of " + res.body.total + ".</p>" : "") :
      '<p class="hint">' + EMPTY["caught-list"] + "</p>";
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
    var focusTo = next && next.querySelector && next.querySelector("button"); (focusTo || $(list.id === "caught-list" ? "caught-title" : "review-title")).focus();
  }).catch(function () { Array.prototype.forEach.call(item.querySelectorAll("button"), function (x) { x.disabled = false; }); });
}
$("review-list").addEventListener("click", reviewClick);
$("scheduled-list").addEventListener("click", reviewClick);
$("withdrawn-list").addEventListener("click", reviewClick);
$("caught-list").addEventListener("click", reviewClick);

// ---------- auto-reject rules for members' submissions (CC-100) ----------
var SRULE_VENUES = null; // [{id, label}], loaded the first time "Venue" is chosen
function loadSubmissionRules(focusSel) {
  api("/admin/submission-rules").then(readJSON).then(function (res) {
    if (!res.ok) { $("srules-list").innerHTML = '<p class="form-error">' + esc(errorText(res)) + "</p>"; return; }
    $("srules-list").innerHTML = res.body.length ? res.body.map(function (r) {
      var what = r.kind === "venue" ? "Venue: " + (r.venue_name || "a deleted venue") : "Event name contains “" + r.phrase + "”";
      return '<div class="queue-item"><div class="alt-text"><p class="alt-title">' + esc(what) + "</p>" +
        '<p class="alt-meta">Caught ' + plural(r.caught, "submission", "submissions") + " · since " + esc(short(new Date(r.created_at))) + "</p></div>" +
        '<div class="row"><button class="btn ghost" type="button" data-srule="' + esc(r.id) + '" aria-label="Delete the rule: ' + esc(what) + '">Delete</button></div></div>';
    }).join("") : '<p class="hint">No auto-reject rules yet.</p>';
    var f = focusSel && document.querySelector(focusSel); if (f) f.focus();
  }, function () {});
}
function loadRuleVenues() {
  if (SRULE_VENUES) return Promise.resolve(SRULE_VENUES);
  return api("/venues").then(readJSON).then(function (res) {
    if (!res.ok) throw res;
    SRULE_VENUES = res.body.map(function (v) { return { id: v.id, label: venueLabel(v) }; });
    $("srule-venues").innerHTML = SRULE_VENUES.map(function (v) { return '<option value="' + esc(v.label) + '"></option>'; }).join("");
    return SRULE_VENUES;
  });
}
$("srule-kind").addEventListener("change", function () {
  var venue = this.value === "venue";
  $("srule-phrase-field").hidden = venue; $("srule-venue-field").hidden = !venue; $("srule-error").textContent = "";
  if (venue) loadRuleVenues().catch(function (res) { $("srule-error").textContent = errorText(res); });
});
$("srule-form").addEventListener("input", function () { $("srule-error").textContent = ""; });
$("srule-form").addEventListener("submit", function (ev) {
  ev.preventDefault();
  var kind = $("srule-kind").value, body = { kind: kind }, field = kind === "venue" ? $("srule-venue") : $("srule-phrase");
  if (kind === "venue") {
    var label = field.value.trim().toLowerCase(), v = (SRULE_VENUES || []).filter(function (x) { return x.label.toLowerCase() === label; })[0];
    if (!v) { $("srule-error").textContent = "Choose a venue from the list."; field.focus(); return; }
    body.venue_id = v.id;
  } else {
    if (!field.value.trim()) { $("srule-error").textContent = "Give a word or phrase from the event name."; field.focus(); return; }
    body.phrase = field.value;
  }
  $("srule-add").disabled = true;
  api("/admin/submission-rules", { method: "POST", body: body }).then(readJSON).then(function (res) {
    $("srule-add").disabled = false;
    if (!res.ok) { $("srule-error").textContent = errorText(res); field.focus(); return; }
    field.value = "";
    $("edit-live").textContent = "Added the rule. Matching submissions from now on are rejected.";
    loadSubmissionRules(); field.focus();
  }, function () { $("srule-add").disabled = false; $("srule-error").textContent = errorText(null); });
});
$("srules-list").addEventListener("click", function (ev) {
  var b = ev.target.closest("[data-srule]"); if (!b) return;
  b.disabled = true;
  api("/admin/submission-rules/" + encodeURIComponent(b.getAttribute("data-srule")), { method: "DELETE" }).then(function (r) {
    if (!r.ok && r.status !== 404) { b.disabled = false; return; }
    $("edit-live").textContent = "Deleted the rule. Submissions it already caught stay rejected.";
    loadSubmissionRules("#srules-title");
  }, function () { b.disabled = false; });
});

// ---------- roundup pages' intros (CC-109) ----------
function loadRoundups(focusSel) {
  api("/admin/roundups").then(readJSON).then(function (res) {
    if (!res.ok) { $("roundups-list").innerHTML = '<p class="form-error">' + esc(errorText(res)) + "</p>"; return; }
    $("roundups-list").innerHTML = res.body.map(function (r) {
      var id = "rup-" + r.slug;
      return '<form class="queue-item roundup" data-roundup="' + esc(r.slug) + '" novalidate><div class="alt-text">' +
        '<p class="alt-title"><a href="' + esc(r.path) + '" target="_blank" rel="noopener">' + esc(r.group + ": " + r.name) +
        '<span class="sr-only"> (opens in a new tab)</span></a></p>' +
        '<p class="alt-meta">' + plural(r.count, "event", "events") + " today · " + (r.custom ? "Your intro" : "The default intro") + "</p></div>" +
        '<div class="field"><label for="' + id + '">Intro</label><textarea id="' + id + '" rows="3" maxlength="600" placeholder="' + esc(r.default_intro) + '">' +
        esc(r.custom ? r.intro : "") + "</textarea></div>" +
        '<div class="row"><button class="btn" type="submit">Save</button>' +
        (r.custom ? '<button class="btn ghost" type="button" data-reset>Use the default</button>' : "") + "</div></form>";
    }).join("");
    var f = focusSel && document.querySelector(focusSel); if (f) f.focus();
  }, function () {});
}
function saveRoundup(form, text) {
  var slug = form.getAttribute("data-roundup");
  Array.prototype.forEach.call(form.querySelectorAll("button"), function (x) { x.disabled = true; });
  api("/admin/roundups/" + encodeURIComponent(slug), { method: "PUT", body: { intro: text } }).then(readJSON).then(function (res) {
    if (!res.ok) { Array.prototype.forEach.call(form.querySelectorAll("button"), function (x) { x.disabled = false; }); $("edit-live").textContent = errorText(res); return; }
    $("edit-live").textContent = res.body.custom ? "Saved the intro. The page shows it within 10 minutes." : "The page uses the default intro again.";
    loadRoundups("#rup-" + slug);
  }, function () { Array.prototype.forEach.call(form.querySelectorAll("button"), function (x) { x.disabled = false; }); });
}
$("roundups-list").addEventListener("submit", function (ev) {
  ev.preventDefault();
  var form = ev.target.closest("[data-roundup]"); if (form) saveRoundup(form, form.querySelector("textarea").value);
});
$("roundups-list").addEventListener("click", function (ev) {
  var b = ev.target.closest("[data-reset]"); if (b) saveRoundup(b.closest("[data-roundup]"), "");
});

// ---------- venues (admins, CC-57) ----------
// The list comes from GET /venues/manage (every venue, with how many events use it) and is filtered here.
// One dialog does rename, merge (with a preview of what moves), delete (only for unused venues), and hide and unhide (CC-219).
var VLIST = [], VDLG = null; // VDLG: { mode: "edit" | "merge" | "delete", v, opener }
function openVenues() { if (!isAdmin()) { openAccount(); return; } show("venues"); loadVenues(); VAEDIT = null; $("va-status").textContent = ""; loadAddressSuggestions(); VSEDIT = null; $("vs-status").textContent = ""; loadSiteSuggestions(); $("oot-status").textContent = ""; loadOutOfTown(); }
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
// CC-78: opening hours are "filled in" for a day when it's open (with times) or closed; a day left out isn't known.
function hoursComplete(v) { var h = v.open_hours || {}; return ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].every(function (d) { return d in h; }); }
// CC-219: why a venue isn't in the public list. Pending ends when one of its events is approved; hidden only with Unhide.
function venueStates(v) {
  var says = (v.hidden ? ['<span class="state">Hidden</span>'] : []).concat(v.pending ? ['<span class="state">Pending</span>'] : []);
  return says.length ? '<p class="alt-meta">' + says.join(" ") + "</p>" : "";
}
function paintVenues() {
  var q = $("v-q").value, onlyUnplaced = $("v-noregion").checked, hours = $("v-hours").value, noAddress = $("v-noaddress").checked;
  var rows = VLIST.filter(function (v) {
    return venueMatches(v, q) && (!onlyUnplaced || !v.region) && (!noAddress || !v.address) && (!hours || hoursComplete(v) === (hours === "full"));
  });
  var unaddressed = VLIST.filter(function (v) { return !v.address; }).length; // CC-218
  var unplaced = VLIST.filter(function (v) { return !v.region; }).length;
  $("v-count").textContent = plural(rows.length, "venue", "venues") + (q.trim() || onlyUnplaced || noAddress || hours ? " match" : "") +
    (rows.length > 200 ? ", showing the first 200. Search to narrow it down." : ".") +
    (unplaced && !onlyUnplaced ? " " + plural(unplaced, "venue has", "venues have") + " no side of town yet." : "") +
    (unaddressed && !noAddress ? " " + plural(unaddressed, "venue has", "venues have") + " no address yet." : "");
  $("venue-list").innerHTML = rows.slice(0, 200).map(function (v) {
    var id = esc(v.id);
    return '<div class="queue-item"><div class="alt-text"><p class="alt-title">' + esc(v.name) + "</p>" + venueStates(v) + '<p class="alt-meta">' +
      esc(v.neighborhood || "No neighborhood") + " · " + esc(REGION_NAMES[v.region] || (v.region ? "Out of town" : "No side of town")) + " · " + plural(v.events, "event", "events") +
      "</p>" + '<p class="alt-meta">' + (v.category ? "Default type: " + esc(typeLabel(v.category, v.opera)) : '<span class="state">No default type</span>') + "</p>" +
      '<p class="alt-meta">' + (v.address ? "Address: " + esc(v.full_address) : '<span class="state">No address yet</span>') + "</p>" +
      (v.standard_cost ? '<p class="alt-meta">Standard cost: ' + esc(v.standard_cost) + "</p>" : "") +
      (v.website ? '<p class="alt-meta">Website: ' + siteLink(v.website) + "</p>" : "") + hoursNote(v) + "</div>" +
      '<div class="row"><button class="btn ghost" type="button" data-venue-edit="' + id + '" aria-label="Edit ' + esc(venueLabel(v)) + '">Edit</button>' +
      '<button class="btn ghost" type="button" data-venue-hours="' + id + '" aria-label="Hours at ' + esc(venueLabel(v)) + '">Hours…</button>' +
      '<button class="btn ghost" type="button" data-venue-merge="' + id + '" aria-label="Merge ' + esc(venueLabel(v)) + ' into another venue">Merge…</button>' +
      (v.hidden ? '<button class="btn ghost" type="button" data-venue-unhide="' + id + '" aria-label="Unhide ' + esc(venueLabel(v)) + '">Unhide</button>' :
        v.events ? '<button class="btn ghost" type="button" data-venue-hide="' + id + '" aria-label="Hide ' + esc(venueLabel(v)) + '">Hide</button>' : "") +
      (v.events ? "" : '<button class="btn danger" type="button" data-venue-delete="' + id + '" aria-label="Delete ' + esc(venueLabel(v)) + '">Delete</button>') +
      "</div></div>";
  }).join("");
}
$("v-q").addEventListener("input", paintVenues);
$("v-noregion").addEventListener("change", paintVenues);
$("v-noaddress").addEventListener("change", paintVenues);
$("v-hours").addEventListener("change", paintVenues);
$("venue-list").addEventListener("click", function (ev) {
  var b = ev.target.closest("[data-venue-edit],[data-venue-merge],[data-venue-delete],[data-venue-hide],[data-venue-unhide]"); if (!b) return;
  var mode = ["edit", "merge", "delete", "hide", "unhide"].filter(function (m) { return b.hasAttribute("data-venue-" + m); })[0];
  var id = +b.getAttribute("data-venue-" + mode), v = VLIST.filter(function (x) { return x.id === id; })[0];
  if (v) openVenueDialog(mode, v, b);
});
// ---------- Out of town clean-up (CC-217) ----------
// The site covers Chicago and its suburbs. This deletes what's left: every event first, through the admin delete so
// photos leave storage too, then the empty venues, each behind the same inline confirm as CC-153, one at a time with
// the progress in a status line. Sources linked to those venues go off first, or they'd go on finding the same events.
var OOT = { venues: [], event_ids: [], waiting: 0 };
function ootSources(venues) { return venues.reduce(function (all, v) { return all.concat(v.sources); }, []); }
function ootEmpty() { return OOT.venues.filter(function (v) { return !v.events; }); }
function ootSourcesText(n) { return n ? " " + plural(n, "discovery source is", "discovery sources are") + " turned off first." : ""; }
function ootItemHTML(v) {
  var id = esc(v.id), label = esc(venueLabel(v));
  return '<div class="queue-item"><div class="alt-text"><p class="alt-title">' + esc(v.name) + '</p><p class="alt-meta">' +
    esc(v.neighborhood || "No neighborhood") + " · " + plural(v.events, "event", "events") + "</p>" +
    (v.sources.length ? '<p class="alt-meta">Source on: ' + esc(v.sources.map(function (s) { return s.name; }).join(", ")) + "</p>" : "") + "</div>" +
    (v.events ? "" : '<div class="row"><button class="btn danger" type="button" data-oot-del="' + id + '" aria-label="Delete ' + label + '">Delete venue…</button></div>') + "</div>";
}
function paintOutOfTown() {
  var events = OOT.event_ids.length, empty = ootEmpty().length;
  $("oot").hidden = !OOT.venues.length;
  $("oot-note").textContent = plural(OOT.venues.length, "venue", "venues") + " and " + plural(events, "event", "events") +
    " are still marked out of town. " + (events ? "Delete the events first, then the empty venues." : "Delete the empty venues.") +
    (OOT.waiting ? " " + plural(OOT.waiting, "found event", "found events") + " from their sources " + (OOT.waiting > 1 ? "are" : "is") + " waiting on Found events: reject those there." : "");
  $("oot-del-events").hidden = !events; $("oot-del-venues").hidden = !empty;
  $("oot-list").innerHTML = OOT.venues.map(ootItemHTML).join("");
}
function closeOotAsk() {
  dropEmpty($("oot-ask"));
  $("oot-del-events").setAttribute("aria-expanded", "false"); $("oot-del-venues").setAttribute("aria-expanded", "false");
}
function loadOutOfTown() {
  return api("/admin/out-of-town").then(readJSON).then(function (res) {
    if (!res.ok) { $("oot").hidden = false; $("oot-status").textContent = errorText(res); return; }
    OOT = res.body; closeOotAsk(); paintOutOfTown();
  }, function () { $("oot").hidden = false; $("oot-status").textContent = errorText(null); });
}
function ootAskHTML(what, sources, more, yes, keep) {
  return '<div class="rm-confirm" role="group" aria-labelledby="oot-ask-q"><p id="oot-ask-q"><strong>Delete ' + esc(what) + "?</strong> " + more +
    "This can't be undone." + ootSourcesText(sources) + "</p>" +
    '<div class="row"><button class="btn danger solid" type="button" id="oot-yes">' + esc(yes) + "</button>" +
    '<button class="btn ghost" type="button" id="oot-no">Keep ' + keep + "</button></div></div>";
}
var OOT_RUN = null; // what the open confirm will do
function ootAsk(opener, html, run) {
  $("oot-del-events").setAttribute("aria-expanded", "false"); $("oot-del-venues").setAttribute("aria-expanded", "false");
  dropFill($("oot-ask"), html); OOT_RUN = run; OOT_RUN.opener = opener;
  opener.setAttribute("aria-expanded", "true"); $("oot-no").focus();
}
$("oot-del-events").addEventListener("click", function () {
  var n = OOT.event_ids.length, sources = ootSources(OOT.venues); if (!n) return;
  ootAsk(this, ootAskHTML(n > 1 ? "all " + n + " out-of-town events" : "the out-of-town event", sources.length,
    "Everyone's “I've been” marks, plans and photos for " + (n > 1 ? "them" : "it") + " go too. ", "Delete " + plural(n, "event", "events"), n > 1 ? "them" : "it"),
    { sources: sources, steps: OOT.event_ids.map(function (id) { return function () { return deleteRemoved(id); }; }), one: "event", many: "events" });
});
function askDeleteVenues(opener, venues) {
  var n = venues.length, sources = ootSources(venues);
  ootAsk(opener, ootAskHTML(n > 1 ? "all " + n + " empty out-of-town venues" : venueLabel(venues[0]), sources.length, "",
    n > 1 ? "Delete " + n + " venues" : "Delete venue", n > 1 ? "them" : "it"),
    { sources: sources, one: "venue", many: "venues",
      steps: venues.map(function (v) { return function () { return ootCall("/venues/" + encodeURIComponent(v.id), { method: "DELETE" }); }; }) });
}
$("oot-del-venues").addEventListener("click", function () { var empty = ootEmpty(); if (empty.length) askDeleteVenues(this, empty); });
$("oot-list").addEventListener("click", function (ev) {
  var b = ev.target.closest("[data-oot-del]"); if (!b) return;
  var id = b.getAttribute("data-oot-del");
  askDeleteVenues(b, OOT.venues.filter(function (v) { return String(v.id) === id; }));
});
$("oot-ask").addEventListener("click", function (ev) {
  if (ev.target.closest("#oot-no")) { var opener = OOT_RUN.opener; closeOotAsk(); opener.focus(); return; }
  if (ev.target.closest("#oot-yes")) runOutOfTown(OOT_RUN);
});
function ootCall(path, options) { // resolves true once it's done (404 counts: someone else got there first)
  return api(path, options).then(function (r) { return r.ok || r.status === 404 ? true : readJSON(r); });
}
function setOotBusy(on) { Array.prototype.forEach.call($("oot").querySelectorAll("button"), function (b) { b.disabled = on; }); }
function runOutOfTown(run) {
  var total = run.steps.length, done = 0, failed = 0, why = "";
  setOotBusy(true);
  function finish(text) {
    $("oot-status").textContent = $("edit-live").textContent = text;
    VENUES = null; // the submit form's venue list is out of date now
    setOotBusy(false); reloadEvents(); loadVenues();
    loadOutOfTown().then(function () { ($("oot").hidden ? $("venues-title") : $("oot-title")).focus(); });
  }
  function off(i) { // any source that won't turn off stops it here, before anything is deleted
    if (i >= run.sources.length) { del(0); return; }
    var s = run.sources[i], stop = function (res) { finish(s.name + " couldn't be turned off, so nothing was deleted. " + errorText(res)); };
    $("oot-status").textContent = "Turning off source " + (i + 1) + " of " + run.sources.length + "…";
    ootCall("/admin/discovery/sources/" + encodeURIComponent(s.id), { method: "PATCH", body: { active: false } })
      .then(function (ok) { if (ok === true) off(i + 1); else stop(ok); }, function () { stop(null); });
  }
  function del(i) {
    if (i >= total) {
      finish("Deleted " + plural(done, run.one, run.many) + "." + (failed ? " " + plural(failed, run.one, run.many) + " couldn't be deleted: " + why : ""));
      return;
    }
    $("oot-status").textContent = "Deleting " + (i + 1) + " of " + total + "…";
    run.steps[i]().then(function (ok) {
      if (ok === true) done++; else { failed++; why = errorText(ok); }
      del(i + 1);
    }, function () { failed++; why = errorText(null); del(i + 1); });
  }
  off(0);
}
function openVenueDialog(mode, v, opener) {
  VDLG = { mode: mode, v: v, opener: opener };
  var asks = mode === "delete" || mode === "hide" || mode === "unhide"; // CC-219: these three only say what will happen
  $("vd-heading").textContent = mode === "edit" ? "Edit " + v.name : mode === "merge" ? "Merge " + v.name + " into another venue" :
    mode === "hide" ? "Hide " + v.name + "?" : mode === "unhide" ? "Unhide " + v.name + "?" : "Delete " + v.name + "?";
  $("vd-edit").hidden = mode !== "edit"; $("vd-merge").hidden = mode !== "merge"; $("vd-delete").hidden = !asks;
  $("vd-go").textContent = mode === "edit" ? "Save changes" : mode === "merge" ? "Merge" : mode === "hide" ? "Hide venue" : mode === "unhide" ? "Unhide venue" : "Delete venue";
  $("vd-go").className = mode === "delete" ? "btn danger solid" : "btn";
  $("vd-error").textContent = ""; setVenueBusy(false);
  if (mode === "edit") { $("vd-name").value = v.name; $("vd-hood").value = v.neighborhood; $("vd-area").value = v.area; $("vd-region").value = v.region || ""; $("vd-cost").value = v.standard_cost || "";
    $("vd-category").value = v.category || ""; $("vd-opera").checked = !!v.opera; $("vd-website").value = v.website || ""; $("vd-address").value = v.address || ""; $("vd-city").value = v.city || ""; $("vd-zip").value = v.zip_code || ""; }
  if (mode === "merge") { $("vd-find").value = ""; fillMergeTargets(); }
  if (mode === "delete") $("vd-delete").textContent = "No events use " + venueLabel(v) + ", so it can go. This can't be undone.";
  if (mode === "hide") $("vd-delete").textContent = venueLabel(v) + " will leave the public venue list. " + (v.events === 1 ? "Its event stays" : "Its " + v.events + " events stay") + " listed, and you can unhide it at any time.";
  if (mode === "unhide") $("vd-delete").textContent = venueLabel(v) + (v.pending ? " will go on the public venue list once one of its events is approved." : " will go back on the public venue list.");
  openDialog($("venue-dialog"));
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
operaGoesWithMusic("vd-category", "vd-opera");
$("vd-into").addEventListener("change", mergePreview);
function setVenueBusy(on) { Array.prototype.forEach.call($("venue-form").querySelectorAll("button, input, select"), function (x) { x.disabled = on; }); }
$("vd-cancel").addEventListener("click", function () { closeDialog($("venue-dialog")); });
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
    // CC-217: an old out-of-town venue has no option here, so its boxes start empty and left that way nothing changes
    if ($("vd-area").value && $("vd-area").value !== v.area) body.area = $("vd-area").value;
    if ($("vd-region").value !== (REGION_NAMES[v.region] ? v.region : "")) body.region = $("vd-region").value || null; // left alone: worked out again if the venue moves
    var cost = $("vd-cost").value.trim(); // CC-89: what it usually costs, with its lowest price (0 = free)
    if (cost !== (v.standard_cost || "")) { body.standard_cost = cost; body.standard_min_price = cost ? minPrice(cost) : null; }
    // CC-125: the type new events here start with; its events keep theirs
    if ($("vd-category").value !== (v.category || "")) body.category = $("vd-category").value || null;
    if ($("vd-opera").checked !== !!v.opera) body.opera = $("vd-opera").checked;
    var site = $("vd-website").value.trim(); // CC-213: the API checks and normalises it too
    if (site && !/^https?:\/\/\S+$/i.test(site)) { $("vd-error").textContent = "A website starts with https:// or http://."; $("vd-website").focus(); return; }
    if (site !== (v.website || "")) body.website = site;
    var place = addressFrom("vd"), bad = place.address || place.city || place.zip_code ? addressProblem("vd", place) : null; // CC-218: all three, or none
    if (bad) { $("vd-error").textContent = bad[1]; $(bad[0]).focus(); return; }
    if (place.address !== (v.address || "") || place.city !== (v.city || "") || place.zip_code !== (v.zip_code || "")) { body.address = place.address; body.city = place.city; body.zip_code = place.zip_code; }
    if (!Object.keys(body).length) { closeDialog($("venue-dialog")); return; }
    req = api("/venues/" + v.id, { method: "PATCH", body: body }); said = "Saved " + name + "."; after = v.id;
  } else if (d.mode === "merge") {
    var into = VLIST.filter(function (x) { return String(x.id) === $("vd-into").value; })[0];
    if (!into) { $("vd-error").textContent = "Choose the venue to merge into."; $("vd-into").focus(); return; }
    req = api("/venues/" + v.id + "/merge-into/" + into.id, { method: "POST" });
    said = "Merged " + venueLabel(v) + " into " + venueLabel(into) + "."; after = into.id;
  } else if (d.mode === "hide" || d.mode === "unhide") {
    req = api("/venues/" + v.id + "/" + d.mode, { method: "POST" });
    said = (d.mode === "hide" ? "Hid " : "Unhid ") + venueLabel(v) + "."; after = v.id;
  } else {
    req = api("/venues/" + v.id, { method: "DELETE" }); said = "Deleted " + venueLabel(v) + ".";
  }
  setVenueBusy(true);
  req.then(readJSON).then(function (res) {
    if (!res.ok) { setVenueBusy(false); $("vd-error").textContent = errorText(res); return; }
    $("edit-live").textContent = said;
    VDLG = null; closeDialog($("venue-dialog"));
    VENUES = null; // the submit form's venue list is out of date now
    reloadEvents(); // cards show venue names
    loadSiteSuggestions(); // a venue with a website (or merged away) has none
    loadAddressSuggestions(); // and the same for an address (CC-218)
    loadOutOfTown(); // CC-217: a venue moved into the suburbs, or merged away, is off that list
    loadVenues(after).then(function () { if (!after || !document.activeElement || document.activeElement === document.body) $("venues-title").focus(); });
  }, function () { setVenueBusy(false); $("vd-error").textContent = errorText(null); });
});

// ---------- suggested venue websites (admins, CC-213) ----------
// GET /venues/website-suggestions works them out each time; only Confirm saves one (POST /venues/{id}/website,
// which never replaces a website already set). Dismiss is remembered, so that address isn't suggested again.
// Websites are untrusted text: shown escaped, and linked only when they're http(s) (safeUrl).
var VSUGG = [], VSEDIT = null; // VSEDIT: the suggestion being edited, "venue_id url"
function siteLink(u) {
  return '<a href="' + esc(safeUrl(u)) + '" target="_blank" rel="noopener">' + esc(u.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "")) + "</a>";
}
function siteKey(s) { return s.venue_id + " " + s.url; }
function loadSiteSuggestions() {
  return api("/venues/website-suggestions").then(readJSON).then(function (res) {
    if (!res.ok) { $("vs").hidden = false; $("vs-status").textContent = errorText(res); return; }
    VSUGG = res.body; paintSiteSuggestions();
  }, function () { $("vs").hidden = false; $("vs-status").textContent = errorText(null); });
}
function paintSiteSuggestions() {
  $("vs").hidden = !VSUGG.length && !$("vs-status").textContent;
  $("vs-n").textContent = VSUGG.length ? String(VSUGG.length) : "";
  $("vs-list").innerHTML = VSUGG.map(function (s) {
    var k = esc(siteKey(s)), label = esc(venueLabel({ name: s.venue_name, neighborhood: s.neighborhood }));
    var from = s.source === "discovery" ? "From its event source" : "From the CC-205 venue research";
    if (VSEDIT === siteKey(s)) {
      return '<div class="queue-item vs-item"><div class="alt-text"><p class="alt-title">' + label + "</p>" +
        '<div class="field"><label for="vs-edit">Website</label><input id="vs-edit" type="url" maxlength="500" autocomplete="off" spellcheck="false" value="' + esc(s.url) + '"></div></div>' +
        '<div class="row"><button class="btn" type="button" data-vs-save="' + k + '">Save website</button>' +
        '<button class="btn ghost" type="button" data-vs-cancel="' + k + '">Cancel</button></div></div>';
    }
    return '<div class="queue-item vs-item"><div class="alt-text"><p class="alt-title">' + label + "</p>" +
      '<p class="alt-meta">' + siteLink(s.url) + "</p>" + '<p class="alt-meta">' + from + "</p></div>" +
      '<div class="row"><button class="btn" type="button" data-vs-confirm="' + k + '" aria-label="Confirm ' + esc(s.url) + " for " + label + '">Confirm</button>' +
      '<button class="btn ghost" type="button" data-vs-edit="' + k + '" aria-label="Edit the website for ' + label + '">Edit</button>' +
      '<button class="btn ghost" type="button" data-vs-dismiss="' + k + '" aria-label="Dismiss ' + esc(s.url) + " for " + label + '">Dismiss</button></div></div>';
  }).join("");
}
function siteBusy(on) { Array.prototype.forEach.call($("vs-list").querySelectorAll("button, input"), function (x) { x.disabled = on; }); }
function siteDone(said) { // after a save or dismiss: refresh both lists, and keep focus in the suggestions
  VSEDIT = null; $("vs-status").textContent = said;
  return Promise.all([loadSiteSuggestions(), loadVenues()]).then(function () {
    var next = $("vs-list").querySelector("[data-vs-confirm]");
    (next || $("vs-h")).focus();
  });
}
$("vs-list").addEventListener("click", function (ev) {
  var b = ev.target.closest("[data-vs-confirm],[data-vs-edit],[data-vs-dismiss],[data-vs-save],[data-vs-cancel]"); if (!b) return;
  var act = ["confirm", "edit", "dismiss", "save", "cancel"].filter(function (a) { return b.hasAttribute("data-vs-" + a); })[0];
  var key = b.getAttribute("data-vs-" + act), s = VSUGG.filter(function (x) { return siteKey(x) === key; })[0];
  if (!s) return;
  var label = venueLabel({ name: s.venue_name, neighborhood: s.neighborhood });
  if (act === "edit" || act === "cancel") {
    VSEDIT = act === "edit" ? key : null; $("vs-status").textContent = ""; paintSiteSuggestions();
    var f = act === "edit" ? $("vs-edit") : $("vs-list").querySelector('[data-vs-edit="' + CSS.escape(key) + '"]');
    if (f) f.focus();
    return;
  }
  var url = act === "save" ? $("vs-edit").value.trim() : s.url;
  if (act === "save" && !/^https?:\/\/\S+$/i.test(url)) { $("vs-status").textContent = "A website starts with https:// or http://."; $("vs-edit").focus(); return; }
  var path = "/venues/" + s.venue_id + "/website" + (act === "dismiss" ? "/dismiss" : "");
  siteBusy(true);
  api(path, { method: "POST", body: { url: url } }).then(readJSON).then(function (res) {
    if (!res.ok) { siteBusy(false); $("vs-status").textContent = errorText(res); return; }
    siteDone(act === "dismiss" ? "Dismissed " + url + " for " + label + "." : "Saved the website for " + label + ".");
  }, function () { siteBusy(false); $("vs-status").textContent = errorText(null); });
});
$("vs-list").addEventListener("keydown", function (ev) { // Enter in the edit box saves, Escape cancels
  if (ev.target.id !== "vs-edit" || (ev.key !== "Enter" && ev.key !== "Escape")) return;
  var b = $("vs-list").querySelector(ev.key === "Enter" ? "[data-vs-save]" : "[data-vs-cancel]");
  if (b) { ev.preventDefault(); b.click(); }
});

// ---------- add a venue (admins, CC-218) ----------
// The one place a venue is added directly, so the street, city and ZIP are required (POST /venues checks them too). A venue
// typed while editing or approving an event comes in through /venues/from-event with no address, and shows as missing one.
function addressFrom(p) { // the three fields of a form: vd-, vn- or va-
  return { address: $(p + "-address").value.trim().replace(/\s+/g, " "), city: $(p + "-city").value.trim().replace(/\s+/g, " "), zip_code: $(p + "-zip").value.trim() };
}
function addressProblem(p, a) { // [the field at fault, what to say], or null
  return !a.address ? [p + "-address", "Enter the street address."] : !a.city ? [p + "-city", "Enter the city."] :
    !/^\d{5}(-\d{4})?$/.test(a.zip_code) ? [p + "-zip", "Enter a 5-digit ZIP code."] : null;
}
$("va-add").addEventListener("input", function () { $("vn-error").textContent = ""; });
// CC-222: paste a website and POST /venues/from-website says what its page gives; nothing is saved until Add venue. A field
// the admin has typed in stays: only an empty one, or one the last read filled and nobody changed, takes a new value.
var VNREAD = 0, VNASKED = "", VNFILLED = {}; // VNREAD: the latest read, so a late answer is dropped
var VN_FIELDS = { name: ["vn-name", "name"], neighborhood: ["vn-hood"], address: ["vn-address", "street address"], city: ["vn-city", "city"], zip_code: ["vn-zip", "ZIP"] };
function vnForget() { VNREAD++; VNASKED = ""; VNFILLED = {}; $("vn-read").textContent = ""; }
function vnList(words) { return words.length < 2 ? words.join("") : words.slice(0, -1).join(", ") + " or " + words[words.length - 1]; }
function vnFill(d) {
  var filled = 0;
  Object.keys(VN_FIELDS).forEach(function (k) {
    var f = $(VN_FIELDS[k][0]), id = f.id, mine = !f.value.trim() || f.value === VNFILLED[id];
    if (!mine) return;
    f.value = d[k] || ""; if (d[k]) { VNFILLED[id] = d[k]; filled++; } else delete VNFILLED[id];
  });
  return filled;
}
function vnSaid(d, filled) {
  var missing = (d.missing || []).map(function (k) { return VN_FIELDS[k][1]; });
  var said = d.problem ? d.problem + " You can type the details yourself." :
    (filled ? "We filled this in from the page. Check it before adding." : "") +
    (missing.length ? (filled ? " " : "") + "We couldn't find the " + vnList(missing) + " on that page, so add " + (missing.length > 1 ? "them" : "it") + " yourself." : "");
  var same = (d.same_website || []).map(venueLabel);
  return said + (same.length ? " " + same.join(", ") + (same.length > 1 ? " already have" : " already has") + " this website. You can still add this venue." : "");
}
function vnReadSite() {
  var url = $("vn-website").value.trim();
  if (!url) { vnForget(); return; }
  if (url === VNASKED) return;
  var mine = ++VNREAD; VNASKED = url;
  $("vn-read").textContent = "Reading the page…";
  api("/venues/from-website", { method: "POST", body: { url: url } }).then(readJSON, function () { return null; }).then(function (res) {
    if (mine !== VNREAD) return;
    if (!res || !res.ok) { VNASKED = ""; $("vn-read").textContent = errorText(res) + " You can type the details yourself."; return; }
    $("vn-read").textContent = vnSaid(res.body, vnFill(res.body));
  });
}
$("vn-website").addEventListener("paste", function () { setTimeout(vnReadSite, 0); }); // the pasted text is there after this event
$("vn-website").addEventListener("change", vnReadSite); // typed, then left
$("vn-website").addEventListener("input", function () { if (!this.value.trim()) vnForget(); });
$("vn-website").addEventListener("keydown", function (ev) { if (ev.key === "Enter") { ev.preventDefault(); vnReadSite(); } }); // Enter reads, it doesn't add
$("va-add").addEventListener("submit", function (ev) {
  ev.preventDefault();
  var name = $("vn-name").value.trim(), hood = $("vn-hood").value.trim(), place = addressFrom("vn");
  var bad = !name ? ["vn-name", "Give the venue a name."] : addressProblem("vn", place);
  if (bad) { $("vn-error").textContent = bad[1]; $(bad[0]).focus(); return; }
  $("vn-go").disabled = true; $("vn-status").textContent = ""; $("vn-error").textContent = "";
  api("/venues", { method: "POST", body: { name: name, neighborhood: hood, address: place.address, city: place.city, zip_code: place.zip_code, website: $("vn-website").value.trim() } }).then(readJSON).then(function (res) {
    $("vn-go").disabled = false;
    if (!res.ok) { $("vn-error").textContent = errorText(res); return; }
    $("va-add").reset(); vnForget(); $("vn-status").textContent = "Added " + venueLabel(res.body) + "."; pulse($("vn-go"));
    if (VENUES) VENUES.push(res.body);
    loadVenues(res.body.id);
  }, function () { $("vn-go").disabled = false; $("vn-error").textContent = errorText(null); });
});

// ---------- suggested street addresses (admins, CC-218) ----------
// Discovery keeps what it sees in pages' event data; GET /venues/address-suggestions lists it for venues with no address.
// Only Confirm saves one (POST /venues/{id}/address, which never replaces an address already set). Dismiss is remembered.
// Addresses come from other sites, so they're untrusted text: always shown escaped.
var VASUGG = [], VAEDIT = null; // VAEDIT: the suggestion being edited, "venue_id address"
function addressKey(s) { return s.venue_id + " " + s.address; }
function loadAddressSuggestions() {
  return api("/venues/address-suggestions").then(readJSON).then(function (res) {
    if (!res.ok) { $("va").hidden = false; $("va-status").textContent = errorText(res); return; }
    VASUGG = res.body; paintAddressSuggestions();
  }, function () { $("va").hidden = false; $("va-status").textContent = errorText(null); });
}
function paintAddressSuggestions() {
  $("va").hidden = !VASUGG.length && !$("va-status").textContent;
  $("va-n").textContent = VASUGG.length ? String(VASUGG.length) : "";
  $("va-list").innerHTML = VASUGG.map(function (s) {
    var k = esc(addressKey(s)), label = esc(venueLabel({ name: s.venue_name, neighborhood: s.neighborhood }));
    if (VAEDIT === addressKey(s)) {
      return '<div class="queue-item vs-item"><div class="alt-text"><p class="alt-title">' + label + "</p>" +
        '<div class="field"><label for="va-address">Street address</label><input id="va-address" type="text" maxlength="200" autocomplete="off" value="' + esc(s.address) + '"></div>' +
        '<div class="field"><label for="va-city">City</label><input id="va-city" type="text" maxlength="120" autocomplete="off" value="' + esc(s.city) + '"></div>' +
        '<div class="field"><label for="va-zip">ZIP</label><input id="va-zip" type="text" inputmode="numeric" maxlength="10" autocomplete="off" value="' + esc(s.zip_code) + '"></div></div>' +
        '<div class="row"><button class="btn" type="button" data-va-save="' + k + '">Save address</button>' +
        '<button class="btn ghost" type="button" data-va-cancel="' + k + '">Cancel</button></div></div>';
    }
    return '<div class="queue-item vs-item"><div class="alt-text"><p class="alt-title">' + label + "</p>" +
      '<p class="alt-meta">' + esc(s.address + ", " + s.city + (s.zip_code ? " " + s.zip_code : "")) + "</p>" +
      '<p class="alt-meta">From ' + esc(s.source || "an event page") + (s.zip_code ? "" : '. <span class="state">No ZIP on the page: use Edit to add it</span>') + "</p></div>" +
      '<div class="row">' + (s.zip_code ? '<button class="btn" type="button" data-va-confirm="' + k + '" aria-label="Confirm ' + esc(s.address) + " for " + label + '">Confirm</button>' : "") +
      '<button class="btn ghost" type="button" data-va-edit="' + k + '" aria-label="Edit the address for ' + label + '">Edit</button>' +
      '<button class="btn ghost" type="button" data-va-dismiss="' + k + '" aria-label="Dismiss ' + esc(s.address) + " for " + label + '">Dismiss</button></div></div>';
  }).join("");
}
function addressBusy(on) { Array.prototype.forEach.call($("va-list").querySelectorAll("button, input"), function (x) { x.disabled = on; }); }
function addressDone(said) { // after a save or dismiss: refresh both lists, and keep focus in the suggestions
  VAEDIT = null; $("va-status").textContent = said;
  return Promise.all([loadAddressSuggestions(), loadVenues()]).then(function () {
    var next = $("va-list").querySelector("[data-va-confirm],[data-va-edit]");
    (next || $("va-h")).focus();
  });
}
$("va-list").addEventListener("click", function (ev) {
  var b = ev.target.closest("[data-va-confirm],[data-va-edit],[data-va-dismiss],[data-va-save],[data-va-cancel]"); if (!b) return;
  var act = ["confirm", "edit", "dismiss", "save", "cancel"].filter(function (a) { return b.hasAttribute("data-va-" + a); })[0];
  var key = b.getAttribute("data-va-" + act), s = VASUGG.filter(function (x) { return addressKey(x) === key; })[0];
  if (!s) return;
  var label = venueLabel({ name: s.venue_name, neighborhood: s.neighborhood });
  if (act === "edit" || act === "cancel") {
    VAEDIT = act === "edit" ? key : null; $("va-status").textContent = ""; paintAddressSuggestions();
    var f = act === "edit" ? $("va-address") : $("va-list").querySelector('[data-va-edit="' + CSS.escape(key) + '"]');
    if (f) f.focus();
    return;
  }
  var place = act === "save" ? addressFrom("va") : { address: s.address, city: s.city, zip_code: s.zip_code }, address = place.address;
  var bad = act === "save" ? addressProblem("va", place) : null;
  if (bad) { $("va-status").textContent = bad[1]; $(bad[0]).focus(); return; }
  var path = "/venues/" + s.venue_id + "/address" + (act === "dismiss" ? "/dismiss" : "");
  addressBusy(true);
  api(path, { method: "POST", body: act === "dismiss" ? { address: address } : place }).then(readJSON).then(function (res) {
    if (!res.ok) { addressBusy(false); $("va-status").textContent = errorText(res); return; }
    addressDone(act === "dismiss" ? "Dismissed " + address + " for " + label + "." : "Saved the address for " + label + ".");
  }, function () { addressBusy(false); $("va-status").textContent = errorText(null); });
});
$("va-list").addEventListener("keydown", function (ev) { // Enter in the edit box saves, Escape cancels
  if (!/^va-(address|city|zip)$/.test(ev.target.id) || (ev.key !== "Enter" && ev.key !== "Escape")) return;
  var b = $("va-list").querySelector(ev.key === "Enter" ? "[data-va-save]" : "[data-va-cancel]");
  if (b) { ev.preventDefault(); b.click(); }
});

// ---------- edit, withdraw or delete an event (admins, CC-56) ----------
// One dialog for every place an event shows (cards, the review lists). It sends only the fields that
// changed, so an untouched price keeps its exact lowest price. Afterwards every list on the
// page is updated in place, and focus goes back to the Edit button (or the view's heading if it's gone).
var EDITING = null, REFOCUS = null; // the open edit; the event whose Edit button should get focus back
function editButtonHTML(e, cls) {
  return '<button type="button" class="' + cls + '" data-edit="' + esc(e.id) + '" aria-label="Edit ' + esc(e.title) + '">Edit</button>';
}
function openEditor(e, opener) {
  EDITING = { e: e, opener: opener };
  foundMode(null); // the same form approves found events (CC-71)
  $("ed-heading").textContent = "Edit " + e.title;
  $("ed-title").value = e.title; $("ed-category").value = TYPE_ORDER.indexOf(e.type) >= 0 ? e.type : ""; $("ed-status").value = e.status || "approved";
  $("ed-opera").checked = !!e.opera; // CC-125
  $("ed-venue").value = e.venue; $("ed-hood").value = e.hood || "";
  $("ed-begin").value = e.begin || ""; $("ed-end").value = e.end || ""; $("ed-open-run").checked = !!e.openRun;
  $("ed-cost").value = e.costRaw || ""; $("ed-url").value = e.url || "";
  $("ed-publish-at").value = e.publishAt ? localInputValue(e.publishAt) : "";
  fillWeekly(e); // its own show times, for the planner (CC-79; hours.js)
  setRun("ed", e.runDates); $("ed-runkind").hidden = false; // its fixed run, if it has one (CC-96; hours.js)
  $("ed-dates-note").hidden = !datesToLookUp(e); // CC-102: a reminder to find its dates
  $("ed-withdraw").textContent = e.status === "withdrawn" ? "Restore" : "Withdraw";
  $("ed-error").textContent = ""; $("ed-confirm").hidden = true; setEditorBusy(false);
  openDialog($("edit-dialog")); $("ed-title").focus();
}
function closeEditor() { if ($("edit-dialog").open) closeDialog($("edit-dialog")); }
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
// CC-125: an opera is Music, so ticking Opera picks Music, and another type unticks it (the venue dialog works the same way)
function operaGoesWithMusic(sel, box) {
  $(box).addEventListener("change", function () { if (this.checked) { $(sel).value = "Music"; $(sel).dispatchEvent(new Event("change")); } });
  $(sel).addEventListener("change", function () { if (this.value !== "Music") $(box).checked = false; });
}
operaGoesWithMusic("ed-category", "ed-opera");
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
  return api("/venues/from-event", { method: "POST", body: { name: name, neighborhood: hood } }).then(readJSON).then(function (res) {
    if (res.ok) { if (VENUES) VENUES.push(res.body); return res.body.id; }
    if (res.status !== 409) throw res;
    return api("/venues?q=" + encodeURIComponent(name)).then(readJSON).then(function (r) { // added since we last looked
      var v = r.ok && find(r.body); if (!v) throw res; return v.id;
    });
  });
}
$("edit-form").addEventListener("submit", function (ev) {
  ev.preventDefault();
  if (EDITING && EDITING.found) { approveFromEditor(); return; } // "Edit/Approve" a found event (found.js)
  var e = EDITING && EDITING.e; if (!e) return;
  var title = $("ed-title").value.trim(), venue = $("ed-venue").value.trim(), hood = $("ed-hood").value.trim();
  var fixed = isFixedRun("ed"), begin = $("ed-begin").value || null, end = $("ed-end").value || null, url = $("ed-url").value.trim(), cost = $("ed-cost").value.trim();
  var at = $("ed-publish-at").value ? new Date($("ed-publish-at").value) : null; // read as local time
  var bad = !title ? ["ed-title", "Give the event's name."] : !$("ed-category").value ? ["ed-category", "Choose a type."] : !venue ? ["ed-venue", "Say where it's happening."] :
    (!fixed && begin && end && end < begin) ? ["ed-end", "The closing date is before the opening date."] :
    (url && !/^https?:\/\//i.test(url)) ? ["ed-url", "The link should start with https://"] :
    (at && isNaN(at)) ? ["ed-publish-at", "Pick a date and time, or leave it blank."] : null;
  if (bad) { editorFail(null, bad[0], bad[1]); return; }
  var run = fixed ? readRun("ed") : { run_dates: [] }; // CC-96
  if (run.error) { editorFail(null, run.id, run.error); return; }
  var weekly = $("ed-sched").hidden ? null : weeklyChange("ed"); // CC-88: null when the show days are as they were
  if (weekly && weekly.error) { editorFail(null, weekly.id, weekly.error); return; }
  var body = {}, openRun = $("ed-open-run").checked;
  if (title !== e.title) body.title = title;
  if ($("ed-category").value !== e.type) body.category = $("ed-category").value;
  if ($("ed-opera").checked !== !!e.opera) body.opera = $("ed-opera").checked;
  if ($("ed-status").value !== e.status) body.status = $("ed-status").value;
  if (JSON.stringify(run.run_dates) !== JSON.stringify(e.runDates)) body.run_dates = run.run_dates; // the run sets its own dates
  if (!fixed && begin !== (e.begin || null)) body.begin_date = begin;
  if (!fixed && end !== (e.end || null)) body.end_date = end;
  if (!fixed && openRun !== !!e.openRun) body.open_run = openRun;
  if (cost !== (e.costRaw || "")) { body.cost_text = cost; body.min_price = minPrice(cost); }
  if (url !== (e.url || "")) body.url = url;
  if (weekly) { body.weekly = weekly.weekly; body.weeks = weekly.weeks; }
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
  $("ed-confirm-text").textContent = "Delete \u201c" + e.title + "\u201d for good? Everyone's \u201cI've been\u201d marks and plans for it go too, and it can't be undone.";
  dropOpen($("ed-confirm"), function () { $("ed-delete-no").focus(); });
});
$("ed-delete-no").addEventListener("click", function () { dropClose($("ed-confirm")); $("ed-delete").focus(); });
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
  PLAN_RANGE = null; // Find an outing loads its events again, with the new details and show times
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
    '<div><strong>' + (s.active_since ? esc(short(parseISO(s.active_since))) : "Today") + "</strong><span>activity counted since</span></div>" +
    '<div><strong>' + (s.photo_checks_month || 0) + "</strong><span>photos checked by Amazon Rekognition this month, about $" + // CC-76
      (s.photo_checks_usd || 0).toFixed(2) + "</span></div>";
  $("stats-grid").innerHTML = STAT_METRICS.map(function (m) {
    var key = m[0];
    return '<section class="stat-card"><h2 class="stat-h">' + esc(m[1]) + "</h2>" +
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
    return '<li><div class="interest-name"><span class="kind">' + esc(e.label) + '</span><a href="' + esc(safeUrl(e.url)) + '" target="_blank" rel="noopener">' + esc(e.title) + "</a>" +
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
var VIEW_NAMES = { home: "Home", join: "Join page", catalog: "Catalog", event: "Event view", plan: "Find an outing", submit: "Submit", account: "Account", crews: "Crews", planner: "My week",
  review: "Review", sourcing: "Event Sourcing", engagement: "Engagement", people: "Venues and Members", venues: "Venues", stats: "Stats", sources: "Source grid", found: "Found events", issues: "Issues",
  reset: "Password reset", verify: "Email confirmation" };
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
    "<div><strong>" + sum("outings") + "</strong><span>outings found</span></div>";
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
  paintVisitSources(t);
  paintJoinStats(t.join || { visits: 0, signups: 0, rate: null, sources: [], direct: { visits: 0, signups: 0, rate: null } });
}
// CC-121: the join page's visits, sign-ups and sign-up rate, overall and by source.
function joinRate(r) { return r === null || r === undefined ? "—" : Math.round(r * 100) + "%"; }
function paintJoinStats(j) {
  $("join-summary").innerHTML = "<div><strong>" + j.visits + "</strong><span>visits</span></div>" +
    "<div><strong>" + j.signups + "</strong><span>sign-ups</span></div>" +
    "<div><strong>" + joinRate(j.rate) + "</strong><span>signed up</span></div>";
  var rows = j.sources.map(function (r) {
    var how = r.medium === "site" ? "Linked from this site" : "Tagged link" + (r.medium ? " · " + r.medium : "");
    return "<tr><td>" + esc(r.source) + '<div class="how">' + esc(how) + "</div></td><td>" + esc(r.campaign || "—") + "</td>" +
      '<td class="n">' + r.visits + '</td><td class="n">' + r.signups + '</td><td class="n">' + joinRate(r.rate) + "</td></tr>";
  });
  rows.push('<tr class="direct"><td>Direct or unknown</td><td>—</td><td class="n">' + j.direct.visits + '</td><td class="n">' + j.direct.signups +
    '</td><td class="n">' + joinRate(j.direct.rate) + "</td></tr>");
  $("join-sources").innerHTML = '<thead><tr><th scope="col">Source</th><th scope="col">Campaign</th><th scope="col" class="n">Visits</th>' +
    '<th scope="col" class="n">Sign-ups</th><th scope="col" class="n">Rate</th></tr></thead><tbody>' + rows.join("") + "</tbody>";
}
// CC-110: visitors and ticket clicks by source: a tagged link's utm values, or the site that linked here.
// Whatever had neither is "Direct or unknown" (typed in, a bookmark, or an app that hides where it came from).
function paintVisitSources(t) {
  var rows = (t.sources || []).map(function (r) {
    var how = r.medium === "site" ? "Linked from this site" : "Tagged link" + (r.medium ? " · " + r.medium : "");
    return "<tr><td>" + esc(r.source) + '<div class="how">' + esc(how) + "</div></td><td>" + esc(r.campaign || "—") + "</td>" +
      '<td class="n">' + r.visitors + '</td><td class="n">' + r.tickets + "</td></tr>";
  });
  var d = t.direct || { visitors: 0, tickets: 0 };
  rows.push('<tr class="direct"><td>Direct or unknown</td><td>—</td><td class="n">' + d.visitors + '</td><td class="n">' + d.tickets + "</td></tr>");
  $("traffic-sources").innerHTML = '<thead><tr><th scope="col">Source</th><th scope="col">Campaign</th>' +
    '<th scope="col" class="n">Visitors</th><th scope="col" class="n">Ticket clicks</th></tr></thead><tbody>' + rows.join("") + "</tbody>";
}
var UTM_EXAMPLES = [["Instagram", "?utm_source=instagram&utm_medium=social&utm_campaign=weekend"],
  ["TikTok", "?utm_source=tiktok&utm_medium=social&utm_campaign=three-words"],
  ["Facebook ads", "?utm_source=facebook&utm_medium=paid&utm_campaign=this-weekend"],
  ["The weekly email", "?utm_source=newsletter&utm_medium=email&utm_campaign=crews-weekend"],
  ["QR cards", "join?utm_source=qr&utm_medium=print&utm_campaign=card"],
  ["Someone you meet (the join page, CC-121)", "join?utm_source=talk&utm_medium=in-person&utm_campaign=book-club"]];
$("utm-examples").innerHTML = UTM_EXAMPLES.map(function (u) {
  return "<li>" + esc(u[0]) + ": <code>chiculturecrew.com/" + esc(u[1]) + "</code></li>";
}).join("");

// ---------- event sources (admins, CC-70) ----------
// The discovery job runs hourly on the server and checks only the sources that are due. Here an
// admin sees each source's last check (and why one couldn't be read), changes how often it's checked,
// turns it off, or asks for a check at the next hourly run. CC-133: or deletes it, after an inline "are you sure?".
var SOURCE_KINDS = { theater: "Theater", opera: "Opera", museum: "Museum", music: "Music", comedy: "Comedy" };
var SOURCE_STATUS = { ok: ["Found changes", "ok"], unchanged: ["No changes", ""], blocked: ["Can't be read", "bad"], error: ["Check failed", "bad"], "": ["Not checked yet", ""] };
var EVERY = [[7, "Every week"], [14, "Every 2 weeks"], [30, "Every month"], [60, "Every 2 months"]];
// how (CC-207): "manual" opens on the sources checked by hand, "unreadable" (CC-224) on the ones we couldn't read; otherwise every source shows, so a link to one finds it
// openId (CC-221): a link to one source opens its block's Health panel
function openSources(focusSel, how, openId) {
  if (!isAdmin()) { openAccount(); return; }
  SOURCES_HOW = how || "all"; SOURCES_KIND = "all"; SG_OPEN = openId ? { id: +openId, tab: "health" } : null; SG_SAID = "";
  show("sources"); loadSources(openId ? "#sg-panel-title" : focusSel);
}
var SOURCES = null, SOURCES_HOW = "all", SOURCES_KIND = "all", SRC_ASK = null; // SRC_ASK: the source whose delete is being confirmed
// CC-207: the site's three types. An opera source's events are Music, and comedy sources have no type now (CC-133),
// so they show under All types only. The API's own map is BY_SOURCE_KIND in cc-backend categories.py.
var SOURCE_TYPES = { theater: "Theater", opera: "Music", music: "Music", museum: "Visual Art" };
// CC-224: state "error" is the API's own word for a source Needs you counts as unreadable: on, not by hand, last read failed.
// last_status alone would also bring in sources that are off or checked by hand.
function sourceHowFits(s) { return SOURCES_HOW === "all" || (SOURCES_HOW === "unreadable" ? s.state === "error" : s.manual === (SOURCES_HOW === "manual")); }
function filteredSources(list) {
  return list.filter(function (s) { return sourceHowFits(s) && (SOURCES_KIND === "all" || SOURCE_TYPES[s.kind] === SOURCES_KIND); });
}
$("sources-how").addEventListener("change", function () { SOURCES_HOW = this.value; if (SOURCES) paintSources(SOURCES); });
$("sources-kind").addEventListener("change", function () { SOURCES_KIND = this.value; if (SOURCES) paintSources(SOURCES); });
function loadSources(focusId) {
  $("sources-status").textContent = "Loading…";
  return api("/admin/discovery/sources").then(readJSON).then(function (res) {
    if (!res.ok) { $("sources-status").textContent = errorText(res); return; }
    $("sources-status").textContent = ""; paintSources(res.body);
    var b = focusId && $("sources-list").querySelector(focusId); if (b) b.focus();
  }, function () { $("sources-status").textContent = errorText(null); });
}
function whenText(iso) { return iso ? short(new Date(iso)) : "never"; }
function paintSources(o) {
  SOURCES = o;
  var bad = o.sources.filter(function (s) { return s.state === "error"; }).length; // CC-224: the sources Needs you counts
  $("sources-summary").innerHTML =
    "<div><strong>" + o.sources.length + "</strong><span>sources" + (bad ? ", " + bad + " to look at" : "") + "</span></div>" +
    "<div><strong>" + o.sources.reduce(function (n, s) { return n + s.waiting; }, 0) + "</strong><span>found, waiting for review</span></div>" +
    "<div><strong>$" + o.spent_month_usd.toFixed(2) + "</strong><span>spent this month, of a $" + o.budget_usd.toFixed(0) + " budget</span></div>" +
    "<div><strong>$" + o.cost_30d_usd.toFixed(2) + "</strong><span>last 30 days (" +
      Math.round((o.tokens_in_30d + o.tokens_out_30d) / 1000) + "K tokens)</span></div>";
  // CC-80: the monthly budget
  $("sources-budget-note").textContent = o.budget_state === "paused" ? "The monthly budget is used up: only Check now runs until next month." :
    o.budget_state === "saving" ? "Over 80% of the monthly budget: event pages wait until next month. Sources are still checked." : "";
  if (document.activeElement !== $("budget-usd")) $("budget-usd").value = o.budget_usd;
  $("sources-how").value = SOURCES_HOW; $("sources-kind").value = SOURCES_KIND;
  var shown = filteredSources(o.sources);
  $("sources-shown").textContent = shown.length < o.sources.length ? "Showing " + shown.length + " of " + plural(o.sources.length, "source", "sources") + "." : "";
  paintSourceGrid(shown, SOURCES_HOW === "unreadable" && !bad ? "There are no sources we couldn't read right now." : "No sources match these filters."); // CC-221
}
function srcAskHTML(s) { // CC-133
  var id = esc(s.id);
  return '<div class="confirm src-confirm" id="src-ask-box" data-drop role="group" aria-labelledby="src-ask-' + id + '"><p id="src-ask-' + id + '"><strong>Delete ' + esc(s.name) + "?</strong> It won't be checked again. " +
    (s.waiting ? "Its " + plural(s.waiting, "found event", "found events") + " waiting for review stay on Found events. " : "") +
    "Events already in the catalog aren't touched. This can't be undone.</p>" +
    '<div class="row"><button class="btn danger solid" type="button" data-src-delete-yes="' + id + '">Delete source</button>' +
    '<button class="btn ghost" type="button" data-src-delete-no="' + id + '">Keep it</button></div></div>';
}
$("sources-list").addEventListener("click", function (ev) {
  var ask = ev.target.closest("[data-src-delete],[data-src-delete-no]");
  if (ask) {
    var asking = ask.hasAttribute("data-src-delete"), sid = ask.getAttribute(asking ? "data-src-delete" : "data-src-delete-no");
    SRC_ASK = asking ? +sid : null; dropRepaint($("sources-list"), function () { paintSources(SOURCES); });
    $("sources-list").querySelector(asking ? '[data-src-delete-no="' + sid + '"]' : '[data-src-delete="' + sid + '"]').focus();
    return;
  }
  var yes = ev.target.closest("[data-src-delete-yes]");
  if (yes) {
    var did = +yes.getAttribute("data-src-delete-yes"), gone = SOURCES.sources.filter(function (x) { return x.id === did; })[0];
    yes.disabled = true;
    api("/admin/discovery/sources/" + did, { method: "DELETE" }).then(function (r) {
      if (!r.ok && r.status !== 404) { yes.disabled = false; return readJSON(r).then(function (res) { $("sources-status").textContent = errorText(res); }); }
      SRC_ASK = null;
      $("edit-live").textContent = (gone ? gone.name : "The source") + " was deleted.";
      loadSources(); $("sources-title").focus();
    }, function () { yes.disabled = false; $("sources-status").textContent = errorText(null); });
    return;
  }
  var b = ev.target.closest("[data-src-check],[data-src-toggle],[data-src-manual]"); if (!b) return;
  var check = b.hasAttribute("data-src-check"), manual = b.hasAttribute("data-src-manual");
  var id = b.getAttribute(check ? "data-src-check" : manual ? "data-src-manual" : "data-src-toggle");
  b.disabled = true;
  var on = b.getAttribute("data-on") !== "true";
  var req = check ? api("/admin/discovery/sources/" + id + "/check", { method: "POST" })
    : api("/admin/discovery/sources/" + id, { method: "PATCH", body: manual ? { manual: on } : { active: on } });
  req.then(readJSON).then(function (res) {
    if (!res.ok) { b.disabled = false; $("sources-status").textContent = errorText(res); return; }
    $("edit-live").textContent = check ? res.body.name + " will be checked within the hour." :
      manual ? res.body.name + (res.body.manual ? " will be checked by hand only. It stays on the weekly recap's list." : " will be checked automatically again.") :
      res.body.name + (res.body.active ? " turned on." : " turned off.");
    loadSources(check ? '[data-src-check="' + id + '"]' : manual ? '[data-src-manual="' + id + '"]' : '[data-src-toggle="' + id + '"]');
  }, function () { b.disabled = false; $("sources-status").textContent = errorText(null); });
});
$("budget-form").addEventListener("submit", function (ev) {
  ev.preventDefault();
  var usd = +$("budget-usd").value;
  if (!(usd >= 1 && usd <= 100)) { $("sources-status").textContent = "Give a budget from $1 to $100 a month."; $("budget-usd").focus(); return; }
  api("/admin/discovery/budget", { method: "PUT", body: { usd: usd } }).then(readJSON).then(function (res) {
    if (!res.ok) { $("sources-status").textContent = errorText(res); return; }
    $("sources-status").textContent = ""; paintSources(res.body);
    $("edit-live").textContent = "The monthly budget is now $" + res.body.budget_usd.toFixed(0) + ".";
  }, function () { $("sources-status").textContent = errorText(null); });
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

// ---------- the QR card (admins, CC-115) ----------
// A business card to hand out at shows. The QR code opens the join page (CC-121) with utm tags (source qr, medium print, and
// a campaign per batch), so those visits show up on Site stats (CC-110). Made here in the browser with
// qrcode-generator (js/vendor/qrcode.js), like the crew invite codes: nothing goes to an outside QR service.
var CARD_URLS = [];
// CC-121: the campaign ends with the date the card is made, so each printed batch is its own row on Site stats
function cardCampaign() { return ($("card-campaign").value.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "card") + "-" + isoDate(today()); }
function cardUrl() { return "https://chiculturecrew.com/join?utm_source=qr&utm_medium=print&utm_campaign=" + cardCampaign(); }
function qrSvgText(text, ink) { // the code as an SVG: one path of dark squares on white, with the standard 4-module quiet zone
  var qr = qrcode(0, "M"); qr.addData(text); qr.make();
  var n = qr.getModuleCount(), q = 4, size = n + q * 2, d = [];
  for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (qr.isDark(r, c)) d.push("M" + (c + q) + " " + (r + q) + "h1v1h-1z");
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + size + " " + size + '" shape-rendering="crispEdges">' +
    '<rect width="' + size + '" height="' + size + '" fill="#ffffff"/><path fill="' + (ink || "#111111") + '" d="' + d.join("") + '"/></svg>';
}
function qrPngUrl(svg) { // 1024px, for printing or a print shop
  return new Promise(function (resolve, reject) {
    var img = new Image();
    img.onload = function () {
      var canvas = document.createElement("canvas"); canvas.width = canvas.height = 1024;
      var g = canvas.getContext("2d"); g.imageSmoothingEnabled = false; g.drawImage(img, 0, 0, 1024, 1024);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = reject;
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  });
}
function paintCard() {
  var url = cardUrl(), svg = qrSvgText(url), name = "culture-crew-qr-" + cardCampaign();
  $("card-url").textContent = url;
  $("biz-qr").innerHTML = svg;
  CARD_URLS.forEach(function (u) { URL.revokeObjectURL(u); });
  var svgUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" })); CARD_URLS = [svgUrl];
  $("card-svg").href = svgUrl; $("card-svg").download = name + ".svg";
  $("card-png").download = name + ".png";
  qrPngUrl(svg).then(function (png) { $("card-png").href = png; }, function () { $("card-png").removeAttribute("href"); });
}
function openCard() { if (!isAdmin()) { openAccount(); return; } show("card"); paintCard(); }
$("card-campaign").addEventListener("input", paintCard);
// Print just the card, on a business-card-sized page; the page size is only set for this print.
$("card-print").addEventListener("click", function () {
  var page = document.createElement("style"); page.id = "card-page";
  page.textContent = "@page { size: 3.5in 2in; margin: 0; }";
  document.head.appendChild(page); document.documentElement.classList.add("print-card");
  window.print();
});
window.addEventListener("afterprint", function () {
  var page = document.getElementById("card-page"); if (page) page.remove(); // added only while printing
  document.documentElement.classList.remove("print-card");
});
