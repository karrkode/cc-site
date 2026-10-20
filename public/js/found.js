// Culture Crew site: Found events (admins, CC-71): what the event checker found, for review.
// Loaded by index.html in order (core, util, catalog, planner, account, submit, admin, hours, found, start); they share one
// global scope, so anything declared here is visible to the files after it.
"use strict";
// GET /admin/discovery/items lists new events and proposed updates ("waiting"), or one status. New events are
// approved (as found, or through the edit form), rejected, or rejected with a skip rule; updates are accepted
// or dismissed. Nothing reaches the catalog without one of these.
var FOUND = { show: "waiting", source: "", price: "any", dates: "any", items: [], total: 0 }, FOUND_PAGE = 50, FOUND_REQ = 0;
var FOUND_SHOWS = [["waiting", "Waiting for you"], ["new", "New events"], ["update", "Proposed updates"], ["approved", "Approved"],
  ["rejected", "Rejected"], ["skipped", "Left out automatically"], ["listed", "Already listed"], ["all", "Everything"]];
var FOUND_KINDS = { production: "Production", exhibition: "Exhibition", concert: "Concert", comedy_show: "Comedy", talk: "Talk",
  tour: "Tour", program: "Program", class: "Class", rental: "Rental", members_only: "Members only", recurring: "Recurring",
  permanent: "Permanent gallery", other: "Other" };
var FOUND_STATES = { update: "Update", approved: "Approved", rejected: "Rejected", skipped: "Left out", listed: "Already listed" };
var CHANGE_NAMES = { cost_text: "Price", min_price: "Lowest price", begin_date: "Opens", end_date: "Closes" };

function openFound() { if (!isAdmin()) { openAccount(); return; } show("found"); loadFoundSources(); loadFound(); loadRules(); }
function updateFoundCount(counts) {
  if (counts) { var n = (counts["new"] || 0) + (counts.update || 0); $("found-count").textContent = n ? String(n) : ""; return; }
  api("/admin/discovery/items?limit=1").then(readJSON).then(function (res) { if (res.ok) updateFoundCount(res.body.counts); }, function () {});
}
function loadFoundSources() {
  api("/admin/discovery/sources").then(readJSON).then(function (res) {
    if (!res.ok) return;
    $("found-source").innerHTML = '<option value="">All sources</option>' + res.body.sources.map(function (s) {
      return '<option value="' + esc(s.id) + '">' + esc(s.name) + "</option>"; }).join("");
    $("found-source").value = FOUND.source;
  }, function () {});
}
function foundQuery(extra) { // "any" is the API's default, so it's left out
  return qs([["show", FOUND.show], ["source", FOUND.source], ["price", FOUND.price === "any" ? "" : FOUND.price],
    ["dates", FOUND.dates === "any" ? "" : FOUND.dates]].concat(extra || []));
}
function foundFiltered() { return FOUND.source || FOUND.price !== "any" || FOUND.dates !== "any"; }
function loadFound(more, focusSel) {
  var req = ++FOUND_REQ, offset = more ? FOUND.items.length : 0;
  if (!more) $("found-status").textContent = "Loading…";
  $("found-more").disabled = true;
  api("/admin/discovery/items?" + foundQuery([["limit", FOUND_PAGE], ["offset", offset]])).then(readJSON).then(function (res) {
    if (req !== FOUND_REQ) return;
    if (!res.ok) { $("found-status").textContent = errorText(res); return; }
    var o = res.body;
    FOUND.items = more ? FOUND.items.concat(o.items) : o.items; FOUND.total = o.total;
    paintFound(o, more ? offset : -1);
    var f = focusSel && document.querySelector(focusSel); if (f) f.focus();
  }, function () { if (req === FOUND_REQ) $("found-status").textContent = errorText(null); });
}
function paintFound(o, focusFrom) {
  var c = o.counts, waiting = (c["new"] || 0) + (c.update || 0);
  if (foundFiltered()) updateFoundCount(); else updateFoundCount(c); // the Review badge counts everything waiting
  $("found-show").innerHTML = FOUND_SHOWS.map(function (s) {
    var n = s[0] === "waiting" ? waiting : s[0] === "all" ? null : (c[s[0]] || 0);
    return '<option value="' + s[0] + '">' + esc(s[1]) + (n === null ? "" : " (" + n + ")") + "</option>"; }).join("");
  $("found-show").value = FOUND.show;
  $("found-unreadable").innerHTML = o.unreadable.length ? plural(o.unreadable.length, "source", "sources") + " couldn't be read, so check " +
    (o.unreadable.length === 1 ? "it" : "them") + " by hand: " + o.unreadable.map(function (s) {
      return esc(s.name) + " (" + esc(s.reason || (s.status === "blocked" ? "refused" : "failed")) + ")"; }).join("; ") + "." : "";
  $("found-status").textContent = FOUND.total ? plural(FOUND.total, "event", "events") + (FOUND.items.length < FOUND.total ? ", showing " + FOUND.items.length : "") : "";
  $("found-list").innerHTML = FOUND.items.length ? FOUND.items.map(foundItemHTML).join("") :
    '<p class="hint">' + (foundFiltered() ? "Nothing matches these filters." : FOUND.show === "waiting" ? "Nothing waiting. New finds show up here after each check." : "Nothing here.") + "</p>";
  $("found-more-row").hidden = FOUND.items.length >= FOUND.total; $("found-more").disabled = false;
  if (focusFrom >= 0) { var first = $("found-list").children[focusFrom]; var b = first && first.querySelector("button, a"); if (b) b.focus(); }
}
function foundDates(i) {
  var b = parseISO(i.begin_date), n = parseISO(i.end_date);
  if (!b && !n) return i.open_run ? "Open run" : "Dates not posted";
  return dateText({ b: b, n: n, openRun: i.open_run && !n });
}
function changeValue(field, v) {
  if (v === null || v === "") return "none";
  if (field === "begin_date" || field === "end_date") return short(parseISO(v));
  if (field === "min_price") return v === 0 ? "free" : "$" + v;
  return v;
}
function foundItemHTML(i) {
  var id = esc(i.id), title = esc(i.title), state = FOUND_STATES[i.status];
  var where = i.venue_name + (i.neighborhood ? " · " + i.neighborhood : i.venue_id ? "" : " · new venue");
  var html = '<div class="queue-item found" data-found="' + id + '"><div class="alt-text">' +
    '<p class="kind">' + esc(i.category || FOUND_KINDS[i.kind] || "Event") + (state ? ' <span class="state' + (i.status === "rejected" ? " rejected" : i.status === "approved" ? " approved" : "") + '">' + esc(state) + "</span>" : "") + "</p>" +
    '<p class="alt-title">' + (i.url ? '<a href="' + esc(safeUrl(i.url)) + '" target="_blank" rel="noopener">' + title + "</a>" : title) + "</p>" +
    '<p class="alt-meta">' + esc(where) + " · " + esc(foundDates(i)) + " · " + esc(i.cost_text || "Price not posted") + "</p>" +
    '<p class="alt-meta">Found on ' + esc(i.source_name) + " " + esc(short(new Date(i.first_seen_at))) +
      (i.dates_listed > 1 ? " · " + plural(i.dates_listed, "date", "dates") + " listed" : "") +
      (i.event && i.status !== "update" ? ' · in the catalog as “' + esc(i.event.title) + "”" : "") + "</p>" +
    (i.possible_duplicate ? '<p class="alt-meta dup">Possibly already listed as “' + esc(i.possible_duplicate.title) + "”</p>" : "") +
    (i.skip_reason && i.status !== "approved" ? '<p class="alt-meta">Why: ' + esc(i.skip_reason) + "</p>" : "");
  if (i.status === "update") {
    var shown = i.proposed.filter(function (c) { return c.field !== "min_price" || !i.proposed.some(function (x) { return x.field === "cost_text"; }); });
    html += '<ul class="changes" aria-label="Proposed changes to ' + esc(i.event ? i.event.title : i.title) + '">' + shown.map(function (c) {
      return "<li>" + esc(CHANGE_NAMES[c.field] || c.field) + ": " + esc(changeValue(c.field, c.listed)) + ' <span aria-hidden="true">→</span><span class="sr-only">becomes</span> <strong>' + esc(changeValue(c.field, c.found)) + "</strong></li>";
    }).join("") + "</ul>";
  }
  html += "</div>" + '<div class="row">' + foundActions(i, id, title) + "</div></div>";
  return html;
}
function foundActions(i, id, title) {
  var a = "";
  if (i.status === "update") {
    return '<button class="btn" type="button" data-found-act="accept" aria-label="Accept the changes to ' + title + '">Accept</button>' +
      '<button class="btn ghost" type="button" data-found-act="dismiss" aria-label="Dismiss the changes to ' + title + '">Dismiss</button>';
  }
  if (i.status === "new" || i.status === "skipped" || i.status === "rejected") {
    a += '<button class="btn" type="button" data-found-act="approve" aria-label="Approve ' + title + '">Approve</button>' +
      '<button class="btn ghost" type="button" data-found-act="edit" aria-label="Edit then approve ' + title + '">Edit then approve</button>';
  }
  if (i.status === "new" || i.status === "skipped") {
    a += '<button class="btn ghost" type="button" data-found-act="reject" aria-label="Reject ' + title + '">Reject</button>' +
      '<button class="btn ghost" type="button" data-found-act="skip" aria-expanded="false" aria-label="Reject ' + title + ' and skip similar">Reject and skip similar…</button>';
  }
  return a;
}
function foundById(id) { return FOUND.items.filter(function (i) { return String(i.id) === String(id); })[0]; }
// Take a decided item out of the list and move focus to the next one (or the heading).
function foundDone(row, said) {
  var next = row.nextElementSibling || row.previousElementSibling, id = row.getAttribute("data-found");
  FOUND.items = FOUND.items.filter(function (i) { return String(i.id) !== id; }); FOUND.total -= 1;
  row.remove();
  if (!FOUND.items.length) $("found-list").innerHTML = '<p class="hint">Nothing waiting. New finds show up here after each check.</p>';
  $("found-status").textContent = FOUND.total ? plural(FOUND.total, "event", "events") : "";
  $("edit-live").textContent = said; updateFoundCount();
  var b = next && next.querySelector && next.querySelector("button"); (b || $("found-title")).focus();
}
function foundBusy(row, on) { Array.prototype.forEach.call(row.querySelectorAll("button, input"), function (x) { x.disabled = on; }); }
function foundFail(row, res) { foundBusy(row, false); $("found-status").textContent = errorText(res); }
function foundPost(row, path, body) {
  foundBusy(row, true);
  return api("/admin/discovery/items/" + row.getAttribute("data-found") + "/" + path, { method: "POST", body: body || {} }).then(readJSON);
}
function approveBody(i) {
  return { title: i.title, category: i.category, venue_id: i.venue_id, begin_date: i.begin_date, end_date: i.end_date,
    open_run: i.open_run && !i.end_date, cost_text: i.cost_text, min_price: i.cost_text ? i.min_price : null, url: i.url, publish: "now" };
}
$("found-list").addEventListener("click", function (ev) {
  var b = ev.target.closest("[data-found-act]"); if (!b) return;
  var row = b.closest("[data-found]"), i = foundById(row.getAttribute("data-found")), act = b.getAttribute("data-found-act");
  if (!i) return;
  if (act === "edit" || (act === "approve" && (!i.venue_id || !i.category))) { openFoundEditor(i, b); return; } // needs a type or venue first
  if (act === "skip") { toggleSkipForm(row, i, b); return; }
  var path = act === "reject" ? "reject" : act;
  foundPost(row, path, act === "approve" ? approveBody(i) : {}).then(function (res) {
    if (!res.ok) { foundFail(row, res); return; }
    if (act === "approve") reloadEvents();
    foundDone(row, act === "approve" ? "Added " + i.title + " to the catalog." : act === "reject" ? "Rejected " + i.title + "." :
      act === "accept" ? "Updated " + (i.event ? i.event.title : i.title) + "." : "Kept " + (i.event ? i.event.title : i.title) + " as it is.");
  }, function () { foundFail(row, null); });
});
// "Reject and skip similar": a phrase (from the title, to trim down) and whether it covers this source or all.
function toggleSkipForm(row, i, opener) {
  var open = row.querySelector(".skip-form");
  if (open) { open.remove(); opener.setAttribute("aria-expanded", "false"); opener.focus(); return; }
  var id = esc(i.id);
  var form = document.createElement("form"); form.className = "skip-form"; form.noValidate = true;
  form.innerHTML = '<div class="field"><label for="skip-phrase-' + id + '">Also reject future events whose title contains</label>' +
    '<input id="skip-phrase-' + id + '" type="text" maxlength="200" value="' + esc(i.title) + '" aria-describedby="skip-hint-' + id + '">' +
    '<span class="hint small" id="skip-hint-' + id + '">Whole words, ignoring capitals and punctuation. Shorten it to the part that matters, like “Student Jam”.</span></div>' +
    '<fieldset><legend class="sr-only">Which sources</legend>' +
    '<label class="radio"><input type="radio" name="skip-where-' + id + '" value="source" checked> Only from ' + esc(i.source_name) + "</label>" +
    '<label class="radio"><input type="radio" name="skip-where-' + id + '" value="all"> From all sources</label></fieldset>' +
    '<p class="form-error" role="alert"></p>' +
    '<div class="row"><button class="btn" type="submit">Reject and skip</button><button class="btn ghost" type="button" data-skip-cancel>Cancel</button></div>';
  row.appendChild(form); opener.setAttribute("aria-expanded", "true");
  var input = form.querySelector("input[type=text]"); input.focus(); input.select();
  form.querySelector("[data-skip-cancel]").addEventListener("click", function () { toggleSkipForm(row, i, opener); });
  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    var phrase = input.value.trim(), err = form.querySelector(".form-error");
    if (phrase.replace(/[^a-z0-9]/gi, "").length < 2) { err.textContent = "Give a word or phrase from the title."; input.focus(); return; }
    var everywhere = form.querySelector('input[value="all"]').checked;
    foundPost(row, "reject", { skip_similar: { phrase: phrase, everywhere: everywhere } }).then(function (res) {
      if (!res.ok) { foundBusy(row, false); err.textContent = errorText(res); return; }
      var also = res.body.also_rejected;
      $("edit-live").textContent = "Rejected " + i.title + (also ? " and " + plural(also, "other", "others") + " like it" : "") + ". Future matches will be skipped.";
      loadRules();
      if (also) { loadFound(false, "#found-title"); return; } // others left the list too
      foundDone(row, $("edit-live").textContent);
    }, function () { foundBusy(row, false); err.textContent = errorText(null); });
  });
}
$("found-filters").addEventListener("submit", function (ev) { ev.preventDefault(); });
$("found-show").addEventListener("change", function () { FOUND.show = this.value; loadFound(); });
$("found-source").addEventListener("change", function () { FOUND.source = this.value; loadFound(); });
$("found-price").addEventListener("change", function () { FOUND.price = this.value; loadFound(); }); // CC-82
$("found-dates").addEventListener("change", function () { FOUND.dates = this.value; loadFound(); });
$("found-more").addEventListener("click", function () { loadFound(true); });
$("found-csv").addEventListener("click", function () {
  var b = this; b.disabled = true;
  api("/admin/discovery/items.csv?" + foundQuery()).then(function (r) {
    if (!r.ok) return readJSON(r).then(function (res) { throw res; });
    var name = "found-events-" + FOUND.show + "-" + isoDate(T) + ".csv";
    return r.blob().then(function (blob) {
      var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
      $("edit-live").textContent = "Downloaded " + name + ".";
    });
  }).catch(function (res) { $("found-status").textContent = errorText(res && res.status ? res : null); })
    .then(function () { b.disabled = false; });
});

// ---------- skip rules ----------
function loadRules(focusSel) {
  api("/admin/discovery/rules").then(readJSON).then(function (res) {
    if (!res.ok) { $("rules-list").innerHTML = '<p class="form-error">' + esc(errorText(res)) + "</p>"; return; }
    $("rules-list").innerHTML = res.body.length ? res.body.map(function (r) {
      return '<div class="queue-item"><div class="alt-text"><p class="alt-title">“' + esc(r.phrase) + "”</p>" +
        '<p class="alt-meta">' + esc(r.source_name || "All sources") + " · caught " + plural(r.caught, "event", "events") + " · since " + esc(short(new Date(r.created_at))) + "</p></div>" +
        '<div class="row"><button class="btn ghost" type="button" data-rule="' + esc(r.id) + '" aria-label="Delete the rule “' + esc(r.phrase) + '”">Delete</button></div></div>';
    }).join("") : '<p class="hint">No skip rules yet.</p>';
    var f = focusSel && document.querySelector(focusSel); if (f) f.focus();
  }, function () {});
}
$("rules-list").addEventListener("click", function (ev) {
  var b = ev.target.closest("[data-rule]"); if (!b) return;
  b.disabled = true;
  api("/admin/discovery/rules/" + b.getAttribute("data-rule"), { method: "DELETE" }).then(function (r) {
    if (!r.ok && r.status !== 404) { b.disabled = false; return; }
    $("edit-live").textContent = "Deleted the skip rule. Items it already rejected stay rejected.";
    loadRules("#rules-title");
  }, function () { b.disabled = false; });
});

// ---------- "Edit then approve": the event edit form (CC-56), filled from the found item ----------
function foundMode(i) { // i: the found item, or null for the ordinary edit form
  var on = !!i, sel = $("ed-category"), blank = sel.querySelector('option[value=""]');
  $("ed-found").hidden = !on; $("ed-remove").hidden = on;
  if (on) fillWeekly(null); // a found event brings its own dates and times
  $("ed-save").textContent = on ? "Approve" : "Save changes";
  Array.prototype.forEach.call($("ed-status").options, function (o) { o.hidden = on && o.value !== "approved" && o.value !== "pending"; });
  if (on && !i.category && !blank) sel.insertAdjacentHTML("afterbegin", '<option value="">Choose a type</option>');
  if ((!on || i.category) && blank) blank.remove();
}
function openFoundEditor(i, opener) {
  EDITING = { e: { id: "found-" + i.id }, found: i, opener: opener };
  foundMode(i);
  $("ed-heading").textContent = "Approve " + i.title;
  $("ed-found").textContent = "Found on " + i.source_name + ". Check the details, then approve to add it to the catalog." +
    (!i.venue_id ? " The venue is new to us, so check its name and neighborhood; it's added when you approve." : "") +
    (!i.category ? " Choose a type first." : "");
  $("ed-title").value = i.title; $("ed-category").value = i.category || ""; $("ed-status").value = "approved";
  $("ed-venue").value = i.venue_name; $("ed-hood").value = i.neighborhood || "";
  $("ed-begin").value = i.begin_date || ""; $("ed-end").value = i.end_date || ""; $("ed-open-run").checked = i.open_run && !i.end_date;
  $("ed-cost").value = i.cost_text || ""; $("ed-url").value = i.url || ""; $("ed-publish-at").value = "";
  $("ed-error").textContent = ""; $("ed-confirm").hidden = true; setEditorBusy(false);
  $("edit-dialog").showModal(); $("ed-title").focus();
}
function approveFromEditor() {
  var i = EDITING.found;
  var title = $("ed-title").value.trim(), venue = $("ed-venue").value.trim(), hood = $("ed-hood").value.trim(), type = $("ed-category").value;
  var begin = $("ed-begin").value || null, end = $("ed-end").value || null, url = $("ed-url").value.trim(), cost = $("ed-cost").value.trim();
  var at = $("ed-publish-at").value ? new Date($("ed-publish-at").value) : null, review = $("ed-status").value === "pending";
  var bad = !title ? ["ed-title", "Give the event's name."] : !type ? ["ed-category", "Choose a type."] : !venue ? ["ed-venue", "Say where it's happening."] :
    (begin && end && end < begin) ? ["ed-end", "The closing date is before the opening date."] :
    (url && !/^https?:\/\//i.test(url)) ? ["ed-url", "The link should start with https://"] :
    (at && isNaN(at)) ? ["ed-publish-at", "Pick a date and time, or leave it blank."] : null;
  if (bad) { editorFail(null, bad[0], bad[1]); return; }
  var body = { title: title, category: type, begin_date: begin, end_date: end, open_run: $("ed-open-run").checked && !end,
    cost_text: cost, min_price: cost === (i.cost_text || "") && cost ? i.min_price : minPrice(cost), url: url,
    publish: review ? "review" : at && at > new Date() ? "later" : "now" };
  if (body.publish === "later") body.publish_at = at.toISOString();
  setEditorBusy(true); $("ed-error").textContent = "";
  var sameVenue = i.venue_id && venue.toLowerCase() === i.venue_name.toLowerCase() && hood.toLowerCase() === (i.neighborhood || "").toLowerCase();
  (sameVenue ? Promise.resolve(i.venue_id) : venueIdFor(venue, hood)).then(function (venueId) {
    body.venue_id = venueId;
    return api("/admin/discovery/items/" + i.id + "/approve", { method: "POST", body: body }).then(readJSON);
  }).then(function (res) {
    if (!res.ok) { editorFail(res); return; }
    var row = document.querySelector('[data-found="' + i.id + '"]'), said = (review ? "Sent " + title + " to the review queue." :
      body.publish === "later" ? "Scheduled " + title + "." : "Added " + title + " to the catalog.");
    EDITING = null; closeEditor(); reloadEvents(); if (review) updateReviewCount();
    if (row) foundDone(row, said); else $("edit-live").textContent = said;
  }).catch(function (res) { editorFail(res && res.status ? res : null, "ed-venue"); });
}
