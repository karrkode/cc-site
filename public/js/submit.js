// Culture Crew site: Submit an event.
// Loaded by index.html in order (core, util, catalog, planner, account, submit, admin, hours, found, start); they share one
// global scope, so anything declared here is visible to the files after it.
"use strict";
// ---------- submit an event ----------
var VENUES = null;
function openSubmit() { renderSubmit(); show("submit"); }
function renderSubmit() {
  var signedIn = !!AUTH.user;
  $("submit-signin").hidden = signedIn; $("submit-form").hidden = !signedIn;
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
$("s-venue").addEventListener("change", function () {
  // Fill in the neighborhood when every known venue with this name agrees on one. Venues saved
  // with a blank neighborhood don't count; a name in two neighborhoods (The Second City) is left to the user.
  var name = this.value.trim().toLowerCase(), hoods = {};
  (VENUES || []).forEach(function (v) {
    if (v.name.toLowerCase() === name && v.neighborhood.trim()) hoods[v.neighborhood] = 1;
  });
  var found = Object.keys(hoods);
  if (found.length === 1 && !$("s-hood").value.trim()) $("s-hood").value = found[0];
});
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
  var begin = $("s-begin").value || null, end = $("s-end").value || null, cost = $("s-cost").value.trim();
  var bad = !title ? ["s-title", "Give the event's name."] : !venue ? ["s-venue", "Say where it's happening."] :
    (begin && end && end < begin) ? ["s-end", "The closing date is before the opening date."] :
    (url && !/^https?:\/\//i.test(url)) ? ["s-url", "The link should start with https://"] : null;
  if (bad) { err.textContent = bad[1]; $(bad[0]).focus(); return; }
  var body = {
    title: title, category: $("s-category").value, venue: { name: venue, neighborhood: $("s-hood").value.trim() },
    begin_date: begin, end_date: end, cost_text: cost, min_price: minPrice(cost), url: url,
    credit_me: $("s-credit").checked
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
    $("submit-form").reset(); $("s-publish-at-field").hidden = true;
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
