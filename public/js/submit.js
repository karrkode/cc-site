// Culture Crew site: Submit an event.
// Loaded by index.html in order (core, util, catalog, planner, account, crews, submit, admin, hours, found, issues, photos, approvals, start); they share one
// global scope, so anything declared here is visible to the files after it.
"use strict";
// ---------- submit an event ----------
var VENUES = null;
function openSubmit() { renderSubmit(); show("submit"); }
function renderSubmit() {
  var signedIn = !!AUTH.user;
  $("submit-signin").hidden = signedIn; $("submit-how").hidden = !signedIn; paintHow();
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
// "Paste a link" (the default) shows the form only once a page has filled it in; "Enter it myself" is the form as it was.
var LINK_FILLED = false;
var MISSING_FIELDS = { title: ["s-title"], category: ["s-category"], venue: ["s-venue"], neighborhood: ["s-hood"],
  dates: ["s-begin", "s-end"], price: ["s-cost"] };
function howChoice() { var r = document.querySelector('input[name="s-how"]:checked'); return r ? r.value : "link"; }
function paintHow() {
  var link = howChoice() === "link";
  $("s-link-form").hidden = !link;
  $("submit-form").hidden = !AUTH.user || (link && !LINK_FILLED);
}
$("s-how").addEventListener("change", function () {
  if (howChoice() === "manual") { $("s-filled").textContent = ""; clearMissing(); }
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
});
function resetSubmitForm() {
  $("submit-form").reset(); delete $("s-category").dataset.chosen; $("s-publish-at-field").hidden = true;
  setShowDays("s", {}); setRun("s", []); clearMissing(); $("s-filled").textContent = "";
}
function fillFromDraft(d) {
  resetSubmitForm();
  $("s-title").value = d.title || "";
  if (d.category) { $("s-category").value = d.category; $("s-category").dataset.chosen = "1"; }
  else { $("s-category").insertAdjacentHTML("afterbegin", '<option value="">Choose a type</option>'); $("s-category").value = ""; }
  $("s-category").dispatchEvent(new Event("change"));
  $("s-hood").value = d.neighborhood || "";
  $("s-venue").value = d.venue || ""; $("s-venue").dispatchEvent(new Event("change")); // a known venue's neighborhood and type
  if (d.run_dates && d.run_dates.length) setRun("s", d.run_dates);
  else {
    $("s-begin").value = d.begin_date || ""; $("s-end").value = d.end_date || "";
    if (d.weekly) setShowDays("s", d.weekly, d.weeks);
  }
  $("s-cost").value = d.cost_text || ""; $("s-url").value = d.url || "";
  var missing = (d.missing || []).filter(function (n) { // what a known venue filled in isn't missing any more
    return !(n === "neighborhood" && $("s-hood").value.trim()) && !(n === "category" && $("s-category").value);
  });
  markMissing(missing);
  $("s-filled").textContent = (missing.length ? "We filled in what the page says. Check it, and add what's marked." :
    "We filled this in from the page. Check it, then send it in.") +
    (d.other_events ? " The page lists more than one event, so make sure this is the one you meant." : "");
}
$("s-link-form").addEventListener("input", function () { $("s-link-error").textContent = ""; });
$("s-link-form").addEventListener("submit", function (ev) {
  ev.preventDefault();
  var url = $("s-link").value.trim(), err = $("s-link-error"), msg = $("s-link-msg"), btn = $("s-link-btn");
  if (!/^https?:\/\/\S+\.\S+/i.test(url)) { err.textContent = "Paste the event's web address, starting with https://"; $("s-link").focus(); return; }
  btn.disabled = true; err.textContent = ""; msg.textContent = "Reading the page…";
  api("/events/from-link", { method: "POST", body: { url: url } }).then(readJSON, function () { return null; }).then(function (res) {
    btn.disabled = false; msg.textContent = "";
    if (res && res.ok) {
      fillFromDraft(res.body); LINK_FILLED = true; paintHow();
      var first = document.querySelector("#submit-form .field.missing input, #submit-form .field.missing select");
      (first || $("s-title")).focus();
      return;
    }
    if (!res || res.status === 429 || res.status === 401) { err.textContent = errorText(res); return; }
    // the page couldn't be read: say so, and open the form with the link kept
    resetSubmitForm(); $("s-url").value = url;
    document.querySelector('input[name="s-how"][value="manual"]').checked = true; paintHow();
    $("s-filled").textContent = errorText(res) + " Enter it yourself below; we kept the link.";
    $("s-title").focus();
  });
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
function stateHTML(e) {
  if (e.status === "approved" && e.publishAt && e.publishAt > new Date())
    return '<span class="state scheduled">Scheduled · ' + esc(WHEN.format(e.publishAt)) + "</span>";
  return '<span class="state ' + esc(e.status) + '">' + esc(e.status) + "</span>";
}
function minPrice(cost) { // same rule the sheet used: first dollar amount, or 0 for free
  var c = cost.trim().toLowerCase();
  if (c === "free" || c === "pay-what-you-can") return 0;
  var m = /\$\s*([0-9]+(?:\.[0-9]+)?)/.exec(cost);
  return m ? parseFloat(m[1]) : null;
}
$("submit-form").addEventListener("input", function () { $("submit-error").textContent = ""; $("submit-msg").textContent = ""; });
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
  if (bad) { err.textContent = bad[1]; $(bad[0]).focus(); return; }
  var days = $("s-sched").hidden ? { weekly: {}, weeks: {} } : readShowDays("s"); // CC-88: optional, but each day chosen needs a time
  if (days.error) { err.textContent = days.error; $(days.id).focus(); return; }
  var run = fixed ? readRun("s") : { run_dates: [] }; // CC-96: a fixed run: its dates set when it opens and closes
  if (run.error) { err.textContent = run.error; $(run.id).focus(); return; }
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
      if (!at || isNaN(at)) { err.textContent = "Pick the date and time it should go live."; $("s-publish-at").focus(); return; }
      if (at <= new Date()) { err.textContent = "Pick a time in the future."; $("s-publish-at").focus(); return; }
      body.publish_at = at.toISOString();
    }
  }
  var btn = $("submit-btn"); btn.disabled = true; err.textContent = ""; msg.textContent = "Sending…";
  api("/events", { method: "POST", body: body }).then(readJSON, function () { return null; }).then(function (res) {
    btn.disabled = false;
    if (!res || !res.ok) { msg.textContent = ""; err.textContent = errorText(res); return; }
    resetSubmitForm(); $("s-link").value = "";
    var made = fromApi(res.body);
    if (made.status === "approved" && made.publishAt) {
      msg.textContent = "Scheduled. It goes live " + WHEN.format(made.publishAt) + ".";
    } else if (made.status === "approved") {
      msg.textContent = "Published. It's on the list now."; reloadEvents(); VENUES = null;
    } else if (isAdmin()) {
      msg.textContent = "Saved for review. It's waiting in the Review queue."; updateReviewCount();
    } else {
      msg.textContent = "Thanks! It's waiting for review. You can follow it on your account page.";
    }
    $("s-title").focus();
  });
});
