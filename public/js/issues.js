// Culture Crew site: Report an issue (CC-84): the footer link and dialog, Your reports, and the admins' Issues page.
// Loaded by index.html in order (core, util, catalog, planner, account, crews, submit, admin, hours, found, issues, start); they
// share one global scope, so anything declared here is visible to the files after it.
"use strict";
// Signed-in members only (the API refuses everyone else). The form sends what happened, what they expected, and,
// filled in for them, the page they were on, their browser, screen size and the site's version. Admins set a status
// and can add a note the member sees. No screenshots yet.
var ISSUE_STATUS = { new: "New", looking: "Looking into it", fixed: "Fixed", wont_fix: "Won't fix" };
var ISSUE_TONE = { new: "", looking: "approved", fixed: "approved", wont_fix: "rejected" };
var ISSUE_FROM = null; // the button that opened the dialog

function currentViewName() {
  var v = Object.keys(VIEWS).filter(function (k) { return visible(k); })[0] || "home";
  return VIEW_NAMES[v] || v;
}
function siteVersion() { // the content hash the deploy stamps on each script link ("dev" locally)
  var s = document.querySelector('script[src*="js/core.js"]'), m = s && /[?&]v=([\w-]+)/.exec(s.getAttribute("src"));
  return m ? m[1] : "";
}
function showReportLink() { $("report-row").hidden = !AUTH.user; }
function openIssueDialog(from) {
  if (!AUTH.user) return;
  ISSUE_FROM = from;
  $("is-fields").hidden = false; $("is-done").hidden = true;
  $("is-what").value = ""; $("is-expected").value = ""; $("is-error").textContent = ""; $("is-send").disabled = false;
  $("is-about").textContent = "We'll include the page you're on (" + currentViewName() + "), your browser and your screen size.";
  $("issue-dialog").showModal(); $("is-what").focus();
}
$("report-open").addEventListener("click", function () { openIssueDialog(this); });
$("is-cancel").addEventListener("click", function () { $("issue-dialog").close(); });
$("is-close").addEventListener("click", function () { $("issue-dialog").close(); });
$("is-see").addEventListener("click", function () { $("issue-dialog").close(); });
$("issue-dialog").addEventListener("close", function () {
  var back = ISSUE_FROM; ISSUE_FROM = null;
  if (back && document.contains(back) && !visible("account")) back.focus();
});
$("issue-form").addEventListener("input", function () { $("is-error").textContent = ""; });
$("issue-form").addEventListener("submit", function (ev) {
  ev.preventDefault();
  var what = $("is-what").value.trim();
  if (what.length < 3) { $("is-error").textContent = "Tell us what happened."; $("is-what").focus(); return; }
  $("is-send").disabled = true;
  var body = { what_happened: what, expected: $("is-expected").value.trim(), page: currentViewName(),
    browser: navigator.userAgent.slice(0, 300), screen: screen.width + "x" + screen.height, site_version: siteVersion() };
  api("/issues", { method: "POST", body: body }).then(readJSON).then(function (res) {
    if (!res.ok) { $("is-send").disabled = false; $("is-error").textContent = errorText(res); return; }
    $("is-fields").hidden = true; $("is-done").hidden = false; $("is-heading").textContent = "Report " + res.body.key + " sent";
    $("is-thanks").innerHTML = "Thanks! Your ticket number is <strong>" + esc(res.body.key) + "</strong>. We'll look into it, and you can follow it under " +
      "<strong>Your reports</strong> on your account page.";
    $("is-close").focus();
    $("edit-live").textContent = "Report " + res.body.key + " sent. Thanks!";
    if (visible("account")) loadMyIssues();
    if (isAdmin()) updateIssuesCount();
  }, function () { $("is-send").disabled = false; $("is-error").textContent = errorText(null); });
});
$("issue-dialog").addEventListener("close", function () { $("is-heading").textContent = "Report an issue"; });

// ---------- Your reports (account page) ----------
function issueStateHTML(i) { return '<span class="state ' + (ISSUE_TONE[i.status] || "") + '">' + esc(ISSUE_STATUS[i.status] || i.status) + "</span>"; }
function loadMyIssues() {
  if (!AUTH.user) { $("my-issues-section").hidden = true; return; }
  api("/me/issues").then(readJSON).then(function (res) {
    if (!res.ok) return;
    $("my-issues-section").hidden = !res.body.length;
    $("my-issues").innerHTML = res.body.map(function (i) {
      return '<div class="queue-item issue"><div class="alt-text"><p class="kind"><span class="ticket">' + esc(i.key) + "</span> · " + esc(i.page || "The site") + " · " + esc(short(new Date(i.created_at))) +
        " " + issueStateHTML(i) + '</p><p class="alt-title">' + esc(i.what_happened) + "</p>" +
        (i.admin_note ? '<p class="issue-note"><span class="sr-only">Our note: </span>' + esc(i.admin_note) + "</p>" : "") + "</div></div>";
    }).join("");
  }, function () {});
}

// ---------- Issues (admins) ----------
var ISSUES_SHOW = "", ISSUES_Q = "", ISSUES_REQ = 0, ISSUES_TIMER = null;
function openIssues(q) { // q: a ticket number to look up (the recap links to #issues/ISS-0007)
  if (!isAdmin()) { openAccount(); return; }
  if (q !== undefined) { ISSUES_Q = q; ISSUES_SHOW = ""; }
  $("issues-q").value = ISSUES_Q; show("issues"); loadIssues();
}
function updateIssuesCount(counts) {
  if (counts) { $("issues-count").textContent = counts["new"] ? String(counts["new"]) : ""; return; }
  api("/admin/issues?show=new").then(readJSON).then(function (res) { if (res.ok) updateIssuesCount(res.body.counts); }, function () {});
}
function loadIssues(focusSel) {
  var req = ++ISSUES_REQ; // replies to older searches are dropped
  $("issues-status").textContent = "Loading…";
  api("/admin/issues?" + qs([["show", ISSUES_SHOW], ["q", ISSUES_Q.trim()]])).then(readJSON).then(function (res) {
    if (req !== ISSUES_REQ) return;
    if (!res.ok) { $("issues-status").textContent = errorText(res); return; }
    var c = res.body.counts, all = Object.keys(c).reduce(function (n, k) { return n + c[k]; }, 0);
    updateIssuesCount(c);
    $("issues-show").innerHTML = '<option value="">Everything (' + all + ")</option>" + Object.keys(ISSUE_STATUS).map(function (k) {
      return '<option value="' + k + '">' + esc(ISSUE_STATUS[k]) + " (" + (c[k] || 0) + ")</option>"; }).join("");
    $("issues-show").value = ISSUES_SHOW;
    $("issues-status").textContent = res.body.items.length ? (ISSUES_Q.trim() ? plural(res.body.items.length, "ticket", "tickets") + " found." : "") :
      ISSUES_Q.trim() ? "No ticket matches \u201c" + ISSUES_Q.trim() + "\u201d." : ISSUES_SHOW ? "Nothing here." : "No reports yet.";
    $("issues-list").innerHTML = res.body.items.map(function (i) {
      var id = esc(i.id), who = i.sent_by ? esc(i.sent_by.name) + ' (<a href="mailto:' + esc(i.sent_by.email) + '">' + esc(i.sent_by.email) + "</a>)" : "A deleted account";
      return '<div class="queue-item issue" data-issue="' + id + '"><div class="alt-text">' +
        '<p class="kind"><span class="ticket">' + esc(i.key) + "</span> · " + esc(i.page || "The site") + " · " + esc(short(new Date(i.created_at))) + " " + issueStateHTML(i) + "</p>" +
        '<p class="alt-title">' + esc(i.what_happened) + "</p>" +
        (i.expected ? '<p class="alt-meta">Expected: ' + esc(i.expected) + "</p>" : "") +
        '<p class="alt-meta">From ' + who + " · " + esc(i.browser || "browser not given") + (i.screen ? " · " + esc(i.screen) : "") +
          (i.site_version ? " · site " + esc(i.site_version) : "") + "</p>" +
        '<form class="issue-edit" data-issue-form="' + id + '" novalidate><div class="fields">' +
        '<div class="field"><label for="issue-status-' + id + '">Status</label><select id="issue-status-' + id + '">' + Object.keys(ISSUE_STATUS).map(function (k) {
          return '<option value="' + k + '"' + (k === i.status ? " selected" : "") + ">" + esc(ISSUE_STATUS[k]) + "</option>"; }).join("") + "</select></div>" +
        '<div class="field"><label for="issue-note-' + id + '">Note to the member <span class="opt-label">(optional)</span></label>' +
        '<input id="issue-note-' + id + '" type="text" maxlength="500" value="' + esc(i.admin_note) + '" placeholder="Fixed, thanks for telling us!"></div></div>' +
        '<div class="row"><button class="btn neutral" type="submit">Save</button></div></form></div></div>';
    }).join("");
    var f = focusSel && document.querySelector(focusSel); if (f) f.focus();
  }, function () { $("issues-status").textContent = errorText(null); });
}
$("issues-filters").addEventListener("submit", function (ev) { ev.preventDefault(); });
$("issues-show").addEventListener("change", function () { ISSUES_SHOW = this.value; loadIssues(); });
$("issues-q").addEventListener("input", function () { ISSUES_Q = this.value; clearTimeout(ISSUES_TIMER); ISSUES_TIMER = setTimeout(loadIssues, 250); });
$("issues-list").addEventListener("submit", function (ev) {
  var form = ev.target.closest("[data-issue-form]"); if (!form) return;
  ev.preventDefault();
  var id = form.getAttribute("data-issue-form"), btn = form.querySelector("button");
  btn.disabled = true;
  api("/admin/issues/" + id, { method: "PATCH", body: { status: $("issue-status-" + id).value, admin_note: $("issue-note-" + id).value } })
    .then(readJSON).then(function (res) {
      btn.disabled = false;
      if (!res.ok) { $("issues-status").textContent = errorText(res); return; }
      $("edit-live").textContent = "Saved: " + (ISSUE_STATUS[res.body.status] || res.body.status) + ".";
      loadIssues('[data-issue-form="' + id + '"] button');
    }, function () { btn.disabled = false; $("issues-status").textContent = errorText(null); });
});
