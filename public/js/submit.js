// Culture Crew site: Submit an event.
// Loaded by index.html in order (core, util, catalog, planner, account, crews, submit, admin, hours, found, issues, photos, approvals, start); they share one
// global scope, so anything declared here is visible to the files after it.
"use strict";
// ---------- submit an event ----------
var VENUES = null;
var SUBMIT_SENT = false; // CC-127: the "it's submitted" panel is showing in place of the form
function openSubmit() { SUBMIT_SENT = false; renderSubmit(); show("submit"); }
function renderSubmit() {
  var signedIn = !!AUTH.user;
  $("submit-signin").hidden = signedIn; $("submit-how").hidden = !signedIn || SUBMIT_SENT; paintHow();
  // CC-237: say so before they fill it in: sending needs a confirmed address (CC-186), and admins are never held up
  var note = $("submit-confirm"), hold = signedIn && !AUTH.user.email_verified && !isAdmin() && !SUBMIT_SENT;
  note.hidden = !hold;
  if (!hold) note.textContent = ""; else if (!note.textContent) confirmFirst(note);
  $("submit-sub").textContent = isAdmin() ? "You're an admin: choose whether it goes live now, at a set time, or waits for review." :
    "Tell us about it. Someone from the crew checks each one before it goes on the list.";
  $("s-publish").hidden = !isAdmin();
  var name = signedIn ? (AUTH.user.display_name || "").trim() : "";
  $("s-credit").disabled = !name; if (!name) $("s-credit").checked = false;
  $("s-credit-hint").textContent = name ? 'Optional. The event will say "Suggested by ' + name + '".' :
    "Your account doesn't have a name to show yet, so there's nothing to credit.";
  if (signedIn && !VENUES) {
    VENUES = [];
    api("/venues").then(readJSON).then(function (res) {
      if (!res.ok) { VENUES = null; return; }
      // No suggestion list: browsers draw <datalist> popups themselves and can place them
      // away from the field (CC-29). Known venues are only used to fill in the neighborhood.
      VENUES = res.body;
    }, function () { VENUES = null; });
  }
}
// ---------- CC-124: suggest by link ----------
// "Paste a link" (the default) shows the form once a read starts; "Enter it myself" is the form as it was.
// CC-215: the member can type while the page is read. A field they've typed in stays: only an empty one, or one the last read
// filled and nobody changed, takes a new value (the same rule as Add a venue, CC-222). LINK_SET holds what the last read set.
var LINK_OPEN = false, LINK_READ = 0, LINK_SET = {}, LINK_SLOW = null, LINK_MARKS = null; // LINK_READ: the latest read, so a late answer is dropped
var MISSING_FIELDS = { title: ["s-title"], category: ["s-category"], venue: ["s-venue"], neighborhood: ["s-hood"],
  dates: ["s-begin", "s-end"], price: ["s-cost"] };
$("submit-signin-btn").addEventListener("click", function () { signInFrom("submit"); }); // CC-237
function howChoice() { var r = document.querySelector('input[name="s-how"]:checked'); return r ? r.value : "link"; }
function paintHow() {
  var link = howChoice() === "link";
  $("s-link-form").hidden = !link;
  $("submit-form").hidden = !AUTH.user || SUBMIT_SENT || (link && !LINK_OPEN);
  $("submit-done").hidden = !AUTH.user || !SUBMIT_SENT;
}
$("s-how").addEventListener("change", function () {
  if (howChoice() === "manual") { linkStop(); $("s-filled").textContent = ""; clearMissing(); linkUnmark(); }
  paintHow();
});
function clearMissing() {
  document.querySelectorAll("#submit-form .field.missing").forEach(function (f) { f.classList.remove("missing"); });
  document.querySelectorAll("#submit-form .miss-tag").forEach(function (t) { t.remove(); });
  var blank = $("s-category").querySelector('option[value=""]'); if (blank) blank.remove();
}
function markMissing(names) {
  names.forEach(function (n) {
    (MISSING_FIELDS[n] || []).forEach(function (id, i) {
      var field = $(id).closest(".field"); field.classList.add("missing");
      if (i === 0) field.querySelector("label").insertAdjacentHTML("beforeend", '<span class="miss-tag">Not on the page</span>');
    });
  });
}
$("submit-form").addEventListener("input", function (ev) { // a field the member fills in is no longer missing
  var field = ev.target.closest && ev.target.closest(".field.missing");
  if (field && ev.target.value) { field.classList.remove("missing"); var t = field.querySelector(".miss-tag"); if (t) t.remove(); }
  var mark = ev.target.closest && ev.target.closest(".filled"); if (mark) linkUnmarkOne(mark); // it's theirs now
});
function resetSubmitForm() {
  $("submit-form").reset(); delete $("s-category").dataset.chosen; $("s-publish-at-field").hidden = true;
  setShowDays("s", {}); setRun("s", []); clearMissing(); linkUnmark(); $("s-filled").textContent = ""; LINK_SET = {};
}
function linkFree(id) { var v = $(id).value; return !v.trim() || v === LINK_SET[id]; }
function linkPut(id, value, said) {
  var now = $(id).value;
  if (!linkFree(id)) { if (value && value !== now) said.kept = true; return; }
  $(id).value = value;
  if (value) { LINK_SET[id] = value; if (value !== now) said.filled.push(id); } else delete LINK_SET[id];
}
function linkPutCategory(d, said) {
  var c = $("s-category");
  if (c.dataset.chosen && c.value !== LINK_SET["s-category"]) { if (d.category && d.category !== c.value) said.kept = true; return; }
  delete c.dataset.chosen; delete LINK_SET["s-category"];
  if (d.category) { c.value = d.category; c.dataset.chosen = "1"; LINK_SET["s-category"] = d.category; said.filled.push("s-category"); }
  else { c.insertAdjacentHTML("afterbegin", '<option value="">Choose a type</option>'); c.value = ""; }
  c.dispatchEvent(new Event("change"));
}
// "When is it on?" follows a read unless the member chose a fixed run or "Don't know", or changed the dates a read gave
function linkPutWhen(d, said) {
  var run = d.run_dates || [], ours = !datesUnknown("s") && (!isFixedRun("s") || JSON.stringify(RUN.s) === LINK_SET.run);
  if (run.length && !(ours && linkFree("s-begin") && linkFree("s-end"))) { said.kept = true; }
  else if (run.length) {
    linkPut("s-begin", "", said); linkPut("s-end", "", said);
    setRun("s", run); LINK_SET.run = JSON.stringify(RUN.s); said.filled.push("s-run");
  } else if (!ours) { if (d.begin_date || d.end_date) said.kept = true; }
  else { setRun("s", []); delete LINK_SET.run; linkPut("s-begin", d.begin_date || "", said); linkPut("s-end", d.end_date || "", said); }
  var days = JSON.stringify(SHOW_DAYS.s.days), weekly = run.length ? {} : d.weekly || {}, some = Object.keys(weekly).length;
  if (days !== "{}" && days !== LINK_SET.days) { if (some) said.kept = true; return; }
  setShowDays("s", weekly, d.weeks); delete LINK_SET.days;
  if (some) { LINK_SET.days = JSON.stringify(SHOW_DAYS.s.days); said.filled.push("s-sched"); }
}
function linkStillMissing(n) { // what the member typed, or a known venue filled in, isn't missing any more
  if (n === "dates") return !$("s-begin").value && !$("s-end").value && !isFixedRun("s") && !datesUnknown("s");
  return !(MISSING_FIELDS[n] || []).some(function (id) { return $(id).value.trim(); });
}
function linkMark(ids) { // briefly: the tag says it in words, the tint only helps the eye find them
  ids.forEach(function (id) {
    var box = $(id).closest(".field, fieldset"), head = box.querySelector("label, legend");
    box.classList.add("filled"); head.insertAdjacentHTML("beforeend", '<span class="fill-tag">Filled in</span>');
  });
  LINK_MARKS = setTimeout(linkUnmark, 6000);
}
function linkUnmarkOne(box) { box.classList.remove("filled"); var t = box.querySelector(".fill-tag"); if (t) t.remove(); }
function linkUnmark() {
  clearTimeout(LINK_MARKS);
  document.querySelectorAll("#submit-form .filled").forEach(linkUnmarkOne);
}
function fillFromDraft(d) {
  clearMissing(); linkUnmark();
  var said = { filled: [], kept: false };
  linkPut("s-title", d.title || "", said);
  linkPutCategory(d, said);
  linkPut("s-hood", d.neighborhood || "", said);
  linkPut("s-venue", d.venue || "", said);
  var hood = $("s-hood").value, type = $("s-category").value;
  $("s-venue").dispatchEvent(new Event("change")); // a known venue's neighborhood and type
  if (!hood && $("s-hood").value) { LINK_SET["s-hood"] = $("s-hood").value; said.filled.push("s-hood"); }
  if (!type && $("s-category").value) said.filled.push("s-category");
  linkPutWhen(d, said);
  linkPut("s-cost", d.cost_text || "", said); linkPut("s-url", d.url || "", said);
  var missing = (d.missing || []).filter(linkStillMissing), found = said.filled.length;
  markMissing(missing); linkMark(said.filled);
  $("s-filled").textContent = (!found ? (said.kept ? "We left what you typed as it is. Check it, then send it in." :
      "We couldn't find the details on that page, so fill in what you know. We kept the link.") :
    (missing.length ? "We filled in what the page says. Check it, and add what's marked." : "We filled this in from the page. Check it, then send it in.") +
    (said.kept ? " We left what you typed as it is." : "")) +
    (d.other_events ? " The page lists more than one event, so make sure this is the one you meant." : "");
}
function linkStop() { // the read in progress no longer counts: its answer will be dropped
  LINK_READ++; clearTimeout(LINK_SLOW); $("s-link-btn").disabled = false; $("s-link-msg").textContent = "";
}
function linkLooksRight(url) { return /^https?:\/\/\S+\.\S+/i.test(url); }
function linkRead(url) {
  var err = $("s-link-error"), msg = $("s-link-msg"), mine;
  linkStop(); mine = LINK_READ;
  $("s-link-btn").disabled = true; err.textContent = ""; msg.textContent = "Reading the page…";
  // The API sends one reply, so this says only that it's taking a while, not what the server is doing
  LINK_SLOW = setTimeout(function () { msg.textContent = "Still reading…"; }, 4000);
  $("s-filled").textContent = ""; clearMissing(); linkUnmark();
  linkPut("s-url", url, { filled: [] }); LINK_OPEN = true; paintHow();
  api("/events/from-link", { method: "POST", body: { url: url } }).then(readJSON, function () { return null; }).then(function (res) {
    if (mine !== LINK_READ) return;
    linkStop();
    if (res && res.ok) {
      fillFromDraft(res.body);
      var now = document.activeElement; // someone typing in the form keeps their place
      if (now === document.body || $("s-link-form").contains(now)) {
        (document.querySelector("#submit-form .field.missing input, #submit-form .field.missing select") || $("s-title")).focus();
      }
      return;
    }
    if (unconfirmed(res)) { confirmFirst(err); return; }
    if (!res || res.status === 429 || res.status === 401) { err.textContent = errorText(res); return; }
    err.textContent = errorText(res) + " Enter it yourself below; we kept the link."; // the page couldn't be read
  });
}
$("s-link-form").addEventListener("input", function () { linkStop(); $("s-link-error").textContent = ""; crewMarkInvalid($("s-link"), false); });
$("s-link-form").addEventListener("submit", function (ev) {
  ev.preventDefault();
  var url = $("s-link").value.trim();
  if (!linkLooksRight(url)) { $("s-link-error").textContent = "Paste the event's web address, starting with https://"; crewMarkInvalid($("s-link"), true); $("s-link").focus(); return; }
  linkRead(url);
});
$("s-link").addEventListener("paste", function () { // the pasted text is there after this event
  setTimeout(function () { var url = $("s-link").value.trim(); if (linkLooksRight(url)) linkRead(url); }, 0);
});
$("s-venue").addEventListener("change", function () {
  // Fill in the neighborhood when every known venue with this name agrees on one. Venues saved
  // with a blank neighborhood don't count; a name in two neighborhoods (The Second City) is left to the user.
  var name = this.value.trim().toLowerCase(), hoods = {};
  (VENUES || []).forEach(function (v) {
    if (v.name.toLowerCase() === name && v.neighborhood.trim()) hoods[v.neighborhood] = 1;
  });
  var found = Object.keys(hoods);
  if (found.length === 1 && !$("s-hood").value.trim()) $("s-hood").value = found[0];
  venueDefaultType();
});
$("s-hood").addEventListener("change", venueDefaultType);
// CC-125: the type starts as the venue's default, until the user picks one themselves. A name in two neighborhoods
// goes by the one typed; if they don't agree and none is typed, the type is left alone.
$("s-category").addEventListener("change", function (ev) { if (ev.isTrusted) this.dataset.chosen = "1"; });
function venueDefaultType() {
  if ($("s-category").dataset.chosen) return;
  var name = $("s-venue").value.trim().toLowerCase(), hood = $("s-hood").value.trim().toLowerCase(), types = {};
  (VENUES || []).forEach(function (v) {
    if (v.category && v.name.toLowerCase() === name && (!hood || v.neighborhood.toLowerCase() === hood)) types[v.category] = 1;
  });
  var only = Object.keys(types);
  if (only.length === 1 && $("s-category").value !== only[0]) { $("s-category").value = only[0]; $("s-category").dispatchEvent(new Event("change")); }
}
function publishChoice() { var r = document.querySelector('input[name="s-publish"]:checked'); return r ? r.value : null; }
function localInputValue(d) { // a Date as the value a datetime-local input expects, in local time
  function p(n) { return ("0" + n).slice(-2); }
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + "T" + p(d.getHours()) + ":" + p(d.getMinutes());
}
$("s-publish").addEventListener("change", function () {
  var later = publishChoice() === "later";
  $("s-publish-at-field").hidden = !later;
  if (later) { $("s-publish-at").min = localInputValue(new Date()); $("s-publish-at").focus(); }
});
var WHEN = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
var STATE_WORDS = { approved: "Live", pending: "Waiting", rejected: "Rejected", withdrawn: "Withdrawn" }; // CC-149: sentence case
function stateHTML(e) {
  if (e.status === "approved" && e.publishAt && e.publishAt > new Date())
    return '<span class="state scheduled">Scheduled · ' + esc(WHEN.format(e.publishAt)) + "</span>";
  return '<span class="state ' + esc(e.status) + '">' + esc(STATE_WORDS[e.status] || e.status) + "</span>";
}
function minPrice(cost) { // same rule the sheet used: first dollar amount, or 0 for free
  var c = cost.trim().toLowerCase();
  if (c === "free" || c === "pay-what-you-can") return 0;
  var m = /\$\s*([0-9]+(?:\.[0-9]+)?)/.exec(cost);
  return m ? parseFloat(m[1]) : null;
}
// CC-149: the field at fault gets the 2.5px ink border (aria-invalid) beside the "Check this:" band; typing clears both
function submitBad(id, text) { var f = $(id); $("submit-error").textContent = text; if (f.matches("input, select")) crewMarkInvalid(f, true); f.focus(); }
$("submit-form").addEventListener("input", function () {
  $("submit-error").textContent = ""; $("submit-msg").textContent = "";
  Array.prototype.forEach.call(this.querySelectorAll('[aria-invalid="true"]'), function (f) { crewMarkInvalid(f, false); });
});
$("submit-form").addEventListener("submit", function (ev) {
  ev.preventDefault();
  var err = $("submit-error"), msg = $("submit-msg");
  var title = $("s-title").value.trim(), venue = $("s-venue").value.trim(), url = $("s-url").value.trim();
  var fixed = isFixedRun("s"), noDates = fixed || datesUnknown("s"); // CC-102: "Don't know!" sends no dates
  var begin = noDates ? null : $("s-begin").value || null, end = noDates ? null : $("s-end").value || null, cost = $("s-cost").value.trim();
  var bad = !title ? ["s-title", "Give the event's name."] : !$("s-category").value ? ["s-category", "Choose a type."] :
    !venue ? ["s-venue", "Say where it's happening."] :
    (begin && end && end < begin) ? ["s-end", "The closing date is before the opening date."] :
    (url && !/^https?:\/\//i.test(url)) ? ["s-url", "The link should start with https://"] : null;
  if (bad) { submitBad(bad[0], bad[1]); return; }
  var days = $("s-sched").hidden ? { weekly: {}, weeks: {} } : readShowDays("s"); // CC-88: optional, but each day chosen needs a time
  if (days.error) { submitBad(days.id, days.error); return; }
  var run = fixed ? readRun("s") : { run_dates: [] }; // CC-96: a fixed run: its dates set when it opens and closes
  if (run.error) { submitBad(run.id, run.error); return; }
  var body = {
    title: title, category: $("s-category").value, venue: { name: venue, neighborhood: $("s-hood").value.trim() },
    begin_date: begin, end_date: end, cost_text: cost, min_price: minPrice(cost), url: url,
    credit_me: $("s-credit").checked, weekly: days.weekly, weeks: days.weeks, run_dates: run.run_dates
  };
  if (isAdmin()) {
    body.publish = publishChoice();
    if (!body.publish) { err.textContent = "Choose when it should go live."; document.querySelector('input[name="s-publish"]').focus(); return; }
    if (body.publish === "later") {
      var at = $("s-publish-at").value ? new Date($("s-publish-at").value) : null; // read as local time
      if (!at || isNaN(at)) { submitBad("s-publish-at", "Pick the date and time it should go live."); return; }
      if (at <= new Date()) { submitBad("s-publish-at", "Pick a time in the future."); return; }
      body.publish_at = at.toISOString();
    }
  }
  var btn = $("submit-btn"); btn.disabled = true; err.textContent = ""; msg.textContent = "Sending…";
  api("/events", { method: "POST", body: body }).then(readJSON, function () { return null; }).then(function (res) {
    btn.disabled = false;
    if (unconfirmed(res)) { msg.textContent = ""; confirmFirst(err); return; }
    if (!res || !res.ok) { msg.textContent = ""; err.textContent = errorText(res); return; }
    linkStop(); resetSubmitForm(); $("s-link").value = ""; LINK_OPEN = false; msg.textContent = "";
    var made = fromApi(res.body), head, text;
    if (made.status === "approved" && made.publishAt) {
      head = "Scheduled"; text = "It goes live " + WHEN.format(made.publishAt) + ".";
    } else if (made.status === "approved") {
      head = "Published"; text = "It's on the list now."; reloadEvents(); VENUES = null;
    } else if (isAdmin()) {
      head = "Saved for review"; text = "It's waiting in the Review queue."; updateReviewCount();
    } else {
      head = "Thanks! We've got it."; text = "Someone from the crew checks it before it goes on the list. You can follow it on your account page.";
    }
    showSubmitDone(made, head, text);
  });
});
// CC-127: a successful submit replaces the form with what was sent, so it's clear it went through
function showSubmitDone(e, head, text) {
  $("sd-title").textContent = head; $("sd-msg").textContent = text;
  $("sd-event").textContent = e.title;
  $("sd-when").textContent = e.b || e.n ? dateText(e) : "Not given. We'll look into it.";
  $("sd-where").textContent = placeText(e);
  SUBMIT_SENT = true; renderSubmit();
  window.scrollTo(0, 0); $("sd-title").focus({ preventScroll: true }); pulse($("sd-title"));
}
$("sd-another").addEventListener("click", function () {
  SUBMIT_SENT = false; renderSubmit(); // the form was emptied when it was sent
  (howChoice() === "link" ? $("s-link") : $("s-title")).focus();
});
$("sd-account").addEventListener("click", function () {
  openAccount(); $("my-submissions-title").focus();
});
