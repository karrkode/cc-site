// Culture Crew site: approvers and photo approvals (CC-91).
// Loaded by index.html in order (core, util, catalog, planner, account, crews, submit, admin, hours, found, issues, photos, approvals, start); they
// share one global scope, so anything declared here is visible to the files after it.
"use strict";
// Approver is a permission a member holds. Only an admin offers it (the Members page); the member accepts or
// declines under "Waiting for you". Approvers (and admins) see Photo approvals: photos waiting, oldest first,
// with what Amazon Rekognition found; borderline ones stay blurred until the approver chooses to look.
var APPROVALS = { show: "waiting", items: [] }, APPROVAL_SHOWS = [["waiting", "Waiting"], ["approved", "Approved"], ["rejected", "Rejected"]];
function canApprove() { return !!AUTH.user && !!AUTH.user.can_approve; }

// ---------- the offer, under "Waiting for you" (crews.js paintPending) ----------
function approverOfferHTML() {
  return '<div class="pending" data-approver-offer><p><strong>Culture Crew</strong> would like you to help approve “I’ve been” photos: ' +
    "you'd look at members' photos and approve the ones that show they were there.</p>" +
    '<div class="row"><button class="btn" type="button" data-approver-answer="yes">Accept</button>' +
    '<button class="btn ghost" type="button" data-approver-answer="no">Decline</button></div></div>';
}
document.addEventListener("click", function (ev) {
  var b = ev.target.closest("[data-approver-answer]"); if (!b || !AUTH.user) return;
  var yes = b.getAttribute("data-approver-answer") === "yes";
  b.disabled = true;
  api("/me/approver", { method: "POST", body: { accept: yes } }).then(readJSON).then(function (res) {
    if (!res.ok) { b.disabled = false; $("crews-status").textContent = checkThis(errorText(res)); return; }
    AUTH.user = res.body; paintPending(); paintApproverRow();
    $("edit-live").textContent = yes ? "You're an approver now. Photo approvals is on your account page." : "Declined. Thanks for letting us know.";
    (yes && $("approver-row").querySelector("button").offsetParent ? $("approver-row").querySelector("button") : document.querySelector("main h1:not([hidden])") || $("brand")).focus();
  }, function () { b.disabled = false; });
});

// ---------- the way in: Review (admins) or the account page (approvers) ----------
function paintApproverRow() {
  $("approver-row").hidden = !canApprove() || isAdmin(); // admins have it on Review
  if (canApprove()) updateApprovalsCount();
}
function updateApprovalsCount(counts) {
  function paint(c) { var n = c.waiting ? String(c.waiting) : ""; $("approvals-count").textContent = n; $("approver-count").textContent = n; }
  if (counts) { paint(counts); return; }
  api("/approvals?limit=1").then(readJSON).then(function (res) { if (res.ok) paint(res.body.counts); }, function () {});
}

// ---------- Photo approvals ----------
function openApprovals() {
  if (!canApprove()) { openAccount(); return; }
  show("approvals"); loadApprovals();
}
$("approvals-back").addEventListener("click", function () { if (isAdmin()) openReview(); else openAccount(); });
function loadApprovals(focusSel) {
  $("approvals-status").textContent = "Loading…";
  api("/approvals?show=" + APPROVALS.show).then(readJSON).then(function (res) {
    if (!res.ok) { $("approvals-status").textContent = errorText(res); return; }
    var c = res.body.counts; APPROVALS.items = res.body.items;
    updateApprovalsCount(c);
    $("approvals-show").innerHTML = APPROVAL_SHOWS.map(function (s) {
      return '<option value="' + s[0] + '">' + esc(s[1]) + " (" + (c[s[0]] || 0) + ")</option>"; }).join("");
    $("approvals-show").value = APPROVALS.show;
    $("approvals-status").textContent = APPROVALS.items.length ? "" : APPROVALS.show === "waiting" ? "Nothing waiting. Thanks for keeping up!" : "Nothing here yet.";
    $("approvals-list").innerHTML = APPROVALS.items.map(approvalHTML).join("");
    var f = focusSel && document.querySelector(focusSel); if (f) f.focus();
  }, function () { $("approvals-status").textContent = errorText(null); });
}
function labelsText(labels) {
  return labels.map(function (l) { return l.name + " (" + Math.round(l.confidence) + "%)"; }).join(", ");
}
function approvalHTML(p) {
  var id = esc(p.id), what = "photo from " + p.event.title + " by " + p.member;
  return '<div class="queue-item approval" data-approval="' + id + '">' +
    (p.url ? '<div class="approval-photo' + (p.blurred ? " blurred" : "") + '"><img src="' + esc(API + p.url) + '" alt="' + esc(p.member + "'s photo from " + p.event.title) + '">' +
      (p.blurred ? '<button class="btn" type="button" data-approval-reveal="' + id + '">Show photo</button>' : "") + "</div>" : "") +
    '<div class="alt-text"><p class="alt-title">' + esc(p.event.title) + '</p><p class="alt-meta">' + esc(p.venue) + " · from " + esc(p.member) + " · " + esc(short(new Date(p.created_at))) + "</p>" +
    (p.labels.length ? '<p class="alt-meta">Rekognition found: ' + esc(labelsText(p.labels)) + (p.blurred && p.status === "waiting" ? ". Blurred until you show it." : "") + "</p>" : '<p class="alt-meta">Rekognition found nothing to flag.</p>') +
    (p.reason ? '<p class="alt-meta">Reason given: ' + esc(p.reason) + "</p>" : "") +
    (p.status === "waiting" ? '<form class="approval-decide" data-approval-form="' + id + '" novalidate>' +
      '<div class="field"><label for="approval-reason-' + id + '">Reason if you reject it <span class="opt-label">(optional; they’ll see it)</span></label>' +
      '<input id="approval-reason-' + id + '" type="text" maxlength="300" placeholder="That looks like a different show"></div>' +
      '<div class="row"><button class="btn" type="submit" data-decision="approve" aria-label="Approve ' + esc(what) + '">Approve</button>' +
      '<button class="btn ghost" type="submit" data-decision="reject" aria-label="Reject ' + esc(what) + '">Reject</button></div></form>' : "") +
    "</div></div>";
}
$("approvals-show").addEventListener("change", function () { APPROVALS.show = this.value; loadApprovals(); });
$("approvals-filters").addEventListener("submit", function (ev) { ev.preventDefault(); });
$("approvals-list").addEventListener("click", function (ev) {
  var b = ev.target.closest("[data-approval-reveal]"); if (!b) return;
  var box = b.closest(".approval-photo"); box.classList.remove("blurred"); b.remove();
  box.querySelector("img").setAttribute("tabindex", "-1"); box.querySelector("img").focus();
});
$("approvals-list").addEventListener("submit", function (ev) {
  var form = ev.target.closest("[data-approval-form]"); if (!form) return;
  ev.preventDefault();
  var id = form.getAttribute("data-approval-form"), decision = ev.submitter ? ev.submitter.getAttribute("data-decision") : "approve";
  var row = form.closest("[data-approval]"), next = row.nextElementSibling;
  Array.prototype.forEach.call(form.querySelectorAll("button, input"), function (x) { x.disabled = true; });
  api("/approvals/" + id, { method: "POST", body: { decision: decision, reason: $("approval-reason-" + id).value } }).then(readJSON).then(function (res) {
    if (!res.ok) {
      Array.prototype.forEach.call(form.querySelectorAll("button, input"), function (x) { x.disabled = false; });
      $("approvals-status").textContent = errorText(res); return;
    }
    $("edit-live").textContent = (decision === "approve" ? "Approved " : "Rejected ") + res.body.member + "'s photo from " + res.body.event.title + ".";
    var nextId = next && next.getAttribute("data-approval");
    loadApprovals(nextId ? '[data-approval="' + nextId + '"] [data-decision="approve"]' : "#approvals-title");
  }, function () {
    Array.prototype.forEach.call(form.querySelectorAll("button, input"), function (x) { x.disabled = false; });
    $("approvals-status").textContent = errorText(null);
  });
});

// ---------- Members (admins): offer or remove the approver permission ----------
var MEMBERS_TIMER = null;
function openMembers() {
  if (!isAdmin()) { openAccount(); return; }
  show("members"); loadMembers();
}
function loadMembers(focusSel) {
  $("members-status").textContent = "Loading…";
  api("/admin/members?" + qs([["q", $("members-q").value.trim()], ["show", $("members-show").value]])).then(readJSON).then(function (res) {
    if (!res.ok) { $("members-status").textContent = errorText(res); return; }
    $("members-status").textContent = res.body.length ? plural(res.body.length, "member", "members") + (res.body.length === 50 ? ", showing the first 50. Search to narrow it down." : ".") : "No one matches.";
    $("members-list").innerHTML = res.body.map(memberHTML).join("");
    var f = focusSel && document.querySelector(focusSel); if (f) f.focus();
  }, function () { $("members-status").textContent = errorText(null); });
}
function memberHTML(m) {
  var id = esc(m.id), name = m.display_name || m.email;
  var state = m.role === "admin" ? "Admin · can always approve" : m.approver ? "Approver" : m.approver_offered ? "Offered · waiting for their answer" : "";
  return '<div class="queue-item" data-member="' + id + '"><div class="alt-text"><p class="alt-title">' + esc(name) + '</p><p class="alt-meta">' + esc(m.email) +
    (state ? ' <span class="state' + (m.approver || m.role === "admin" ? " approved" : "") + '">' + esc(state) + "</span>" : "") + "</p></div>" +
    (m.role === "admin" ? "" : '<div class="row">' + (m.approver || m.approver_offered ?
      '<button class="btn ghost" type="button" data-member-act="remove" aria-label="' + esc((m.approver ? "Remove approver: " : "Withdraw the offer to ") + name) + '">' + (m.approver ? "Remove approver" : "Withdraw offer") + "</button>" :
      '<button class="btn neutral" type="button" data-member-act="offer" aria-label="Offer approver to ' + esc(name) + '">Offer approver</button>') + "</div>") + "</div>";
}
$("members-filters").addEventListener("submit", function (ev) { ev.preventDefault(); });
$("members-q").addEventListener("input", function () { clearTimeout(MEMBERS_TIMER); MEMBERS_TIMER = setTimeout(loadMembers, 250); });
$("members-show").addEventListener("change", function () { loadMembers(); });
$("members-list").addEventListener("click", function (ev) {
  var b = ev.target.closest("[data-member-act]"); if (!b) return;
  var id = b.closest("[data-member]").getAttribute("data-member"), offer = b.getAttribute("data-member-act") === "offer";
  b.disabled = true;
  api("/admin/members/" + id + "/approver", { method: offer ? "POST" : "DELETE" }).then(readJSON).then(function (res) {
    if (!res.ok) { b.disabled = false; $("members-status").textContent = errorText(res); return; }
    var who = res.body.display_name || res.body.email;
    $("edit-live").textContent = offer ? "Offered the approver permission to " + who + ". It applies once they accept." : who + " isn't an approver now.";
    loadMembers('[data-member="' + id + '"] [data-member-act]');
  }, function () { b.disabled = false; $("members-status").textContent = errorText(null); });
});
