// Culture Crew site: Report an issue or request a feature (CC-84, CC-95): the footer link and dialog, Your reports, and the
// admins' Issues page.
// Loaded by index.html in order (core, util, catalog, planner, account, crews, submit, admin, hours, found, issues, photos, approvals, start); they
// share one global scope, so anything declared here is visible to the files after it.
"use strict";
// Signed-in members only (the API refuses everyone else). The form sends what happened, what they expected, and,
// filled in for them, the page they were on, their browser, screen size and the site's version. Admins set a status
// and can add a note the member sees. No screenshots yet.
// CC-95: or a feature request, numbered apart (FR-0002). Requests have the same statuses, in their own words.
// CC-241: admins can make a Jira ticket from a report (once), and see the ticket's status in Jira. A ticket that's done
// in Jira is deployed, not checked: the report's own Fixed is still set by hand.
var ISSUE_STATUS = { new: "New", looking: "Looking into it", fixed: "Fixed", wont_fix: "Won't fix" };
var REQUEST_STATUS = { new: "New", looking: "Considering", fixed: "Done", wont_fix: "Not planned" };
var ISSUE_KINDS = {
  issue: { intro: "Tell us what went wrong. We read every report.", what: "What happened?", expected: "What did you expect?", send: "Send report", empty: "Tell us what happened.", noun: "Report" },
  feature: { intro: "Tell us what you'd like the site to do. We read every request.", what: "What would you like?", expected: "How would it help?", send: "Send request", empty: "Tell us what you'd like.", noun: "Request" }
};
function statusWord(kind, st) { return ((kind === "feature" ? REQUEST_STATUS : ISSUE_STATUS)[st]) || st; }
function issueKind() { var r = document.querySelector('input[name="is-kind"]:checked'); return r ? r.value : "issue"; }
function paintIssueKind() {
  var k = ISSUE_KINDS[issueKind()];
  $("is-intro").textContent = k.intro; $("is-what-label").textContent = k.what; $("is-expected-label").textContent = k.expected; $("is-send").textContent = k.send;
}
document.addEventListener("change", function (ev) { if (ev.target.name === "is-kind") { $("is-error").textContent = ""; paintIssueKind(); } });
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
function showReportLink() { $("report-open").hidden = !AUTH.user; } // "Curious about how this was made?" (CC-90) is for everyone
function openIssueDialog(from) {
  if (!AUTH.user) return;
  ISSUE_FROM = from;
  $("is-fields").hidden = false; $("is-done").hidden = true; $("is-heading").textContent = "Report an issue or request a feature";
  $("is-what").value = ""; $("is-expected").value = ""; $("is-error").textContent = ""; $("is-send").disabled = false;
  document.querySelector('input[name="is-kind"][value="issue"]').checked = true; paintIssueKind();
  $("is-about").textContent = "We'll include the page you're on (" + currentViewName() + "), your browser and your screen size.";
  openDialog($("issue-dialog")); document.querySelector('input[name="is-kind"]:checked').focus();
}
$("report-open").addEventListener("click", function () { openIssueDialog(this); });
$("is-cancel").addEventListener("click", function () { closeDialog($("issue-dialog")); });
$("is-close").addEventListener("click", function () { closeDialog($("issue-dialog")); });
$("is-see").addEventListener("click", function () { closeDialog($("issue-dialog")); });
$("issue-dialog").addEventListener("close", function () {
  var back = ISSUE_FROM; ISSUE_FROM = null;
  if (back && document.contains(back) && !visible("account")) back.focus();
});
$("issue-form").addEventListener("input", function () { $("is-error").textContent = ""; });
$("issue-form").addEventListener("submit", function (ev) {
  ev.preventDefault();
  var what = $("is-what").value.trim(), kind = issueKind(), k = ISSUE_KINDS[kind];
  if (what.length < 3) { $("is-error").textContent = k.empty; $("is-what").focus(); return; }
  $("is-send").disabled = true;
  var body = { kind: kind, what_happened: what, expected: $("is-expected").value.trim(), page: currentViewName(),
    browser: navigator.userAgent.slice(0, 300), screen: screen.width + "x" + screen.height, site_version: siteVersion() };
  api("/issues", { method: "POST", body: body }).then(readJSON).then(function (res) {
    if (unconfirmed(res)) { $("is-send").disabled = false; confirmFirst($("is-error")); return; }
    if (!res.ok) { $("is-send").disabled = false; $("is-error").textContent = errorText(res); return; }
    $("is-fields").hidden = true; $("is-done").hidden = false; $("is-heading").textContent = k.noun + " " + res.body.key + " sent";
    $("is-thanks").innerHTML = "Thanks! Your ticket number is <strong>" + esc(res.body.key) + "</strong>. " +
      (kind === "feature" ? "We'll think it over" : "We'll look into it") + ", and you can follow it under <strong>Your reports</strong> on your account page.";
    $("is-close").focus(); pulse($("is-thanks"));
    $("edit-live").textContent = k.noun + " " + res.body.key + " sent. Thanks!";
    if (visible("account")) loadMyIssues();
    if (isAdmin()) updateIssuesCount();
  }, function () { $("is-send").disabled = false; $("is-error").textContent = errorText(null); });
});
$("issue-dialog").addEventListener("close", function () { $("is-heading").textContent = "Report an issue or request a feature"; });

// ---------- Your reports (account page) ----------
function issueStateHTML(i) { return '<span class="state ' + (ISSUE_TONE[i.status] || "") + '">' + esc(statusWord(i.kind, i.status)) + "</span>"; }
function kindWord(i) { return i.kind === "feature" ? "Feature request" : "Issue"; }
function loadMyIssues() {
  if (!AUTH.user) { $("my-issues-section").hidden = true; return; }
  api("/me/issues").then(readJSON).then(function (res) {
    if (!res.ok) return;
    $("my-issues-section").hidden = !res.body.length; $("my-issues-n").textContent = res.body.length ? String(res.body.length) : "";
    $("my-issues").innerHTML = res.body.map(function (i) { // CC-148: a row, with its status as a word (acctRowHTML, account.js)
      return acctRowHTML(i.key + " · " + kindWord(i) + " · " + (i.page || "The site") + " · " + short(new Date(i.created_at)), esc(i.what_happened), "",
        statusWord(i.kind, i.status), i.status === "fixed" || i.status === "wont_fix",
        i.admin_note ? '<p class="acct-row-note"><span class="sr-only">Our note: </span>' + esc(i.admin_note) + "</p>" : "");
    }).join("");
  }, function () {});
}

// ---------- Issues (admins) ----------
var ISSUES_SHOW = "", ISSUES_KIND = "", ISSUES_Q = "", ISSUES_REQ = 0, ISSUES_TIMER = null, ISSUES_ITEMS = {}, JIRA_REPORT = null;
function openIssues(q) { // q: a ticket number to look up (the recap links to #issues/ISS-0007)
  if (!isAdmin()) { openAccount(); return; }
  if (q !== undefined) { ISSUES_Q = q; ISSUES_SHOW = ""; ISSUES_KIND = ""; }
  $("issues-q").value = ISSUES_Q; $("issues-kind").value = ISSUES_KIND; show("issues"); loadIssues();
}
function updateIssuesCount(counts) {
  if (counts) { $("issues-count").textContent = counts["new"] ? String(counts["new"]) : ""; paintEngagementCount(); return; }
  api("/admin/issues?show=new").then(readJSON).then(function (res) { if (res.ok) updateIssuesCount(res.body.counts); }, function () {});
}
function loadIssues(focusSel) {
  var req = ++ISSUES_REQ; // replies to older searches are dropped
  $("issues-status").textContent = "Loading…";
  api("/admin/issues?" + qs([["show", ISSUES_SHOW], ["kind", ISSUES_KIND], ["q", ISSUES_Q.trim()]])).then(readJSON).then(function (res) {
    if (req !== ISSUES_REQ) return;
    if (!res.ok) { $("issues-status").textContent = errorText(res); return; }
    var c = res.body.counts, all = Object.keys(c).reduce(function (n, k) { return n + c[k]; }, 0);
    if (ISSUES_KIND) updateIssuesCount(); else updateIssuesCount(c); // the Engagement count is every new report, of both kinds
    var kinds = res.body.kinds || {};
    $("issues-kind").innerHTML = [["", "All"], ["issue", "Issues"], ["feature", "Feature requests"]].map(function (o) {
      return '<option value="' + o[0] + '">' + o[1] + (o[0] ? " (" + (kinds[o[0]] || 0) + " open)" : "") + "</option>"; }).join("");
    $("issues-kind").value = ISSUES_KIND;
    $("issues-show").innerHTML = '<option value="">Everything (' + all + ")</option>" + Object.keys(ISSUE_STATUS).map(function (k) {
      var word = ISSUES_KIND ? statusWord(ISSUES_KIND, k) : ISSUE_STATUS[k] === REQUEST_STATUS[k] ? ISSUE_STATUS[k] : ISSUE_STATUS[k] + " / " + REQUEST_STATUS[k];
      return '<option value="' + k + '">' + esc(word) + " (" + (c[k] || 0) + ")</option>"; }).join("");
    $("issues-show").value = ISSUES_SHOW;
    $("issues-status").textContent = res.body.items.length ? (ISSUES_Q.trim() ? plural(res.body.items.length, "ticket", "tickets") + " found." : "") :
      ISSUES_Q.trim() ? "No ticket matches \u201c" + ISSUES_Q.trim() + "\u201d." : ISSUES_SHOW || ISSUES_KIND ? "Nothing here." : "No reports yet.";
    $("issues-list").innerHTML = res.body.items.map(function (i) {
      var id = esc(i.id), who = i.sent_by ? esc(i.sent_by.name) + ' (<a href="mailto:' + esc(i.sent_by.email) + '">' + esc(i.sent_by.email) + "</a>)" : "A deleted account";
      return '<div class="queue-item issue" data-issue="' + id + '"><div class="alt-text">' +
        '<p class="kind"><span class="ticket">' + esc(i.key) + "</span> · " + esc(kindWord(i)) + " · " + esc(i.page || "The site") + " · " + esc(short(new Date(i.created_at))) + " " + issueStateHTML(i) + "</p>" +
        '<p class="alt-title">' + esc(i.what_happened) + "</p>" +
        (i.expected ? '<p class="alt-meta">' + (i.kind === "feature" ? "How it'd help: " : "Expected: ") + esc(i.expected) + "</p>" : "") +
        '<p class="alt-meta">From ' + who + " · " + esc(i.browser || "browser not given") + (i.screen ? " · " + esc(i.screen) : "") +
          (i.site_version ? " · site " + esc(i.site_version) : "") + "</p>" +
        (i.jira_key ? '<p class="alt-meta issue-jira" data-jira-for="' + id + '">Jira: <a href="' + esc(i.jira_url) + '" target="_blank" rel="noopener">' +
          esc(i.jira_key) + '</a> <span class="state" data-jira-state>Checking Jira…</span></p>' : "") +
        '<form class="issue-edit" data-issue-form="' + id + '" novalidate><div class="fields">' +
        '<div class="field"><label for="issue-status-' + id + '">Status</label><select id="issue-status-' + id + '">' + Object.keys(ISSUE_STATUS).map(function (k) {
          return '<option value="' + k + '"' + (k === i.status ? " selected" : "") + ">" + esc(statusWord(i.kind, k)) + "</option>"; }).join("") + "</select></div>" +
        '<div class="field"><label for="issue-note-' + id + '">Note to the member <span class="opt-label">(optional)</span></label>' +
        '<input id="issue-note-' + id + '" type="text" maxlength="500" value="' + esc(i.admin_note) + '" placeholder="Fixed, thanks for telling us!"></div></div>' +
        '<div class="row"><button class="btn neutral" type="submit">Save</button>' +
        (i.jira_key ? "" : '<button class="btn ghost" type="button" data-jira-make="' + id + '">Create Jira ticket</button>') + "</div></form></div></div>";
    }).join("");
    ISSUES_ITEMS = {}; res.body.items.forEach(function (i) { ISSUES_ITEMS[i.id] = i; });
    loadJiraStates(req, res.body.items.filter(function (i) { return i.jira_key; }));
    var f = focusSel && document.querySelector(focusSel); if (f) f.focus();
  }, function () { $("issues-status").textContent = errorText(null); });
}
$("issues-filters").addEventListener("submit", function (ev) { ev.preventDefault(); });
$("issues-show").addEventListener("change", function () { ISSUES_SHOW = this.value; loadIssues(); });
$("issues-kind").addEventListener("change", function () { ISSUES_KIND = this.value; loadIssues(); });
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
      $("edit-live").textContent = "Saved: " + statusWord(res.body.kind, res.body.status) + ".";
      loadIssues('[data-issue-form="' + id + '"] button');
    }, function () { btn.disabled = false; $("issues-status").textContent = errorText(null); });
});

// ---------- CC-241: Jira tickets from reports (admins) ----------
function jiraStateText(t, i) { // Jira's word, plus what "done" means for the report
  if (t.category !== "done") return t.status + " in Jira";
  return i.status === "fixed" || i.status === "wont_fix" ? t.status + " in Jira" : t.status + " in Jira: deployed. Check it, then set " + statusWord(i.kind, "fixed") + ".";
}
function loadJiraStates(req, linked) {
  if (!linked.length) return;
  api("/admin/jira-status?" + qs(linked.map(function (i) { return ["ids", i.id]; }))).then(readJSON).then(function (res) {
    if (req !== ISSUES_REQ) return;
    linked.forEach(function (i) {
      var line = document.querySelector('[data-jira-for="' + i.id + '"]'); if (!line) return;
      var st = line.querySelector("[data-jira-state]"), t = res.ok && res.body[i.id];
      if (t) {
        st.textContent = jiraStateText(t, i); st.className = "state" + (t.category === "done" ? " approved" : "");
        var a = line.querySelector("a"); a.href = t.url; a.textContent = t.key; // the ticket may have moved
      } else {
        st.textContent = res.ok ? "Not found in Jira" : "Jira status unavailable"; st.className = "state needs";
        if (!res.ok) st.title = errorText(res);
      }
    });
  }, function () {
    linked.forEach(function (i) { var st = document.querySelector('[data-jira-for="' + i.id + '"] [data-jira-state]'); if (st) { st.textContent = "Jira status unavailable"; st.className = "state needs"; } });
  });
}
$("issues-list").addEventListener("click", function (ev) {
  var b = ev.target.closest("[data-jira-make]"); if (!b) return;
  var i = ISSUES_ITEMS[b.getAttribute("data-jira-make")]; if (!i) return;
  b.disabled = true;
  api("/admin/issues/" + i.id + "/jira").then(readJSON).then(function (res) {
    b.disabled = false;
    if (!res.ok) { $("issues-status").textContent = errorText(res); return; }
    var d = res.body; JIRA_REPORT = i;
    $("jr-heading").textContent = "Create a Jira ticket for " + i.key;
    $("jr-type").value = d.issue_type; $("jr-priority").value = d.priority; $("jr-summary").value = d.summary;
    $("jr-description").value = d.description; $("jr-reference").textContent = d.reference;
    $("jr-offline").hidden = d.connected; $("jr-error").textContent = ""; $("jr-send").disabled = false;
    openDialog($("jira-dialog"), b); $("jr-summary").focus();
  }, function () { b.disabled = false; $("issues-status").textContent = errorText(null); });
});
$("jr-cancel").addEventListener("click", function () { closeDialog($("jira-dialog")); });
$("jira-form").addEventListener("input", function () { $("jr-error").textContent = ""; });
$("jira-form").addEventListener("submit", function (ev) {
  ev.preventDefault();
  var i = JIRA_REPORT; if (!i) return;
  if ($("jr-summary").value.trim().length < 3) { $("jr-error").textContent = "Give the ticket a summary."; $("jr-summary").focus(); return; }
  $("jr-send").disabled = true; $("jr-send").textContent = "Creating…";
  var body = { issue_type: $("jr-type").value, priority: $("jr-priority").value, summary: $("jr-summary").value, description: $("jr-description").value };
  function done() { $("jr-send").disabled = false; $("jr-send").textContent = "Create ticket in Jira"; }
  api("/admin/issues/" + i.id + "/jira", { method: "POST", body: body }).then(readJSON).then(function (res) {
    done();
    if (!res.ok) { $("jr-error").textContent = errorText(res); return; }
    closeDialog($("jira-dialog"));
    $("edit-live").textContent = i.key + " is now " + res.body.jira_key + " in Jira.";
    loadIssues('[data-jira-for="' + i.id + '"] a');
  }, function () { done(); $("jr-error").textContent = errorText(null); });
});
