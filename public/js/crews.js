// Culture Crew site: Culture crews (CC-74): "Your crews" on the account page, invite links, and joining.
// Loaded by index.html in order (core, util, catalog, planner, account, crews, submit, admin, hours, found, start); they share one
// global scope, so anything declared here is visible to the files after it.
"use strict";
// A member can be in several crews; any member can make an invite link (7 days, revocable by its maker or
// the owner); a crew has up to 25 members. Members see each other's names, never emails. An invite link is
// #join=<token>: it opens the account page with a "Join <crew>" panel (after signing in, if needed).
var CREWS = [], CREW_LINKS = {}, CREW_ASK = null, CREW_EDIT = null; // links just made, by crew; a pending confirm; a crew being renamed
var JOIN = null; // { token, preview } from an invite link

function loadCrews(focusSel) {
  if (!AUTH.user) return Promise.resolve();
  return api("/crews").then(readJSON).then(function (res) {
    if (!res.ok) { $("crews-status").textContent = errorText(res); return; }
    $("crews-status").textContent = ""; CREWS = res.body; paintCrews();
    var f = focusSel && document.querySelector(focusSel); if (f) f.focus();
  }, function () { $("crews-status").textContent = errorText(null); });
}
function crewById(id) { return CREWS.filter(function (c) { return String(c.id) === String(id); })[0]; }
function crewAct(act, crew, extra, label, cls, aria) {
  return '<button class="' + (cls || "btn ghost") + '" type="button" data-crew-act="' + act + '" data-crew="' + esc(crew.id) + '"' +
    (extra ? " " + extra : "") + (aria ? ' aria-label="' + esc(aria) + '"' : "") + ">" + esc(label) + "</button>";
}
function askHTML(text, act, crew, extra) { // an inline "are you sure?" in place of a dialog
  return '<div class="confirm"><p>' + esc(text) + '</p><div class="row" style="margin-top:8px">' +
    crewAct(act, crew, extra, "Yes", "btn danger solid") + crewAct("ask-no", crew, "", "Keep it", "btn ghost") + "</div></div>";
}
function crewHTML(c) {
  var id = esc(c.id), asking = CREW_ASK && String(CREW_ASK.crew) === String(c.id) ? CREW_ASK : null;
  var html = '<article class="panel crew" data-crew-card="' + id + '" aria-labelledby="crew-h-' + id + '">';
  if (CREW_EDIT === c.id) {
    html += '<form class="crew-edit" data-crew-form="' + id + '" novalidate><div class="fields">' +
      '<div class="field"><label for="crew-ename-' + id + '">Name</label><input id="crew-ename-' + id + '" type="text" maxlength="60" value="' + esc(c.name) + '"></div>' +
      '<div class="field"><label for="crew-edesc-' + id + '">About it</label><input id="crew-edesc-' + id + '" type="text" maxlength="200" value="' + esc(c.description) + '"></div></div>' +
      '<p class="form-error" role="alert"></p><div class="row"><button class="btn" type="submit">Save</button>' + crewAct("edit-no", c, "", "Cancel") + "</div></form>";
  } else {
    html += '<div><h3 id="crew-h-' + id + '" tabindex="-1">' + esc(c.name) + (c.owner ? ' <span class="state">You started it</span>' : "") + "</h3>" +
      (c.description ? '<p class="crew-about">' + esc(c.description) + "</p>" : "") + "</div>";
  }
  html += '<p class="hint small">' + plural(c.members.length, "member", "members") + " of " + c.max_members + "</p>";
  html += '<ul class="members" aria-label="Members of ' + esc(c.name) + '">' + c.members.map(function (m) {
    var tags = (m.owner ? ' <span class="state">Owner</span>' : "") + (m.you ? ' <span class="state">You</span>' : "");
    var acts = c.owner && !m.you ? crewAct("owner", c, 'data-user="' + esc(m.user_id) + '"', "Make owner", "btn ghost", "Make " + m.name + " the owner of " + c.name) +
      crewAct("remove", c, 'data-user="' + esc(m.user_id) + '"', "Remove", "btn ghost", "Remove " + m.name + " from " + c.name) : "";
    return '<li><span class="who">' + esc(m.name) + tags + "</span>" + (acts ? '<span class="row">' + acts + "</span>" : "") + "</li>";
  }).join("") + "</ul>";
  if (asking) html += askHTML(asking.text, asking.act, c, asking.user ? 'data-user="' + esc(asking.user) + '"' : "");
  var link = CREW_LINKS[c.id];
  if (link) {
    html += '<div class="link-box"><label for="crew-link-' + id + '">Invite link: send it to whoever you\'d like to join</label>' +
      '<input id="crew-link-' + id + '" type="text" readonly value="' + esc(link.url) + '">' +
      '<div class="row">' + crewAct("copy", c, "", "Copy link", "btn") + '<span class="small" role="status" id="crew-copied-' + id + '">Works until ' +
      esc(short(new Date(link.expires_at))) + ". Anyone with it can join.</span></div></div>";
  }
  if (c.invites.length) {
    html += '<ul class="invites" aria-label="Invite links for ' + esc(c.name) + '">' + c.invites.map(function (i) {
      return "<li>A link from " + esc(i.yours ? "you" : i.made_by) + " · until " + esc(short(new Date(i.expires_at))) + " · " +
        (i.uses ? plural(i.uses, "person", "people") + " joined" : "not used yet") +
        (i.yours || c.owner ? " " + crewAct("revoke", c, 'data-invite="' + esc(i.id) + '"', "Turn off", "textbtn", "Turn off this invite link") : "") + "</li>";
    }).join("") + "</ul>";
  }
  var full = c.members.length >= c.max_members;
  html += '<div class="row">' + (full ? '<span class="hint">The crew is full.</span>' : crewAct("invite", c, "", "Make an invite link", "btn")) +
    (c.owner ? crewAct("edit", c, "", "Rename") + crewAct("delete", c, "", "Delete crew…", "btn danger") : crewAct("leave", c, "", "Leave crew…")) + "</div>";
  return html + "</article>";
}
function paintCrews() {
  $("crew-list").innerHTML = CREWS.map(crewHTML).join("");
  $("crew-new").querySelector("h3").textContent = CREWS.length ? "Start another crew" : "Start a crew";
}
function crewFail(card, res) {
  $("crews-status").textContent = errorText(res);
  Array.prototype.forEach.call(card ? card.querySelectorAll("button") : [], function (b) { b.disabled = false; });
}
$("crew-list").addEventListener("click", function (ev) {
  var b = ev.target.closest("[data-crew-act]"); if (!b) return;
  var act = b.getAttribute("data-crew-act"), c = crewById(b.getAttribute("data-crew")), card = b.closest("[data-crew-card]");
  if (!c) return;
  var user = b.getAttribute("data-user"), who = user && c.members.filter(function (m) { return m.user_id === user; })[0];
  var refocus = '[data-crew-card="' + c.id + '"] [data-crew-act]';
  if (act === "edit") { CREW_EDIT = c.id; paintCrews(); $("crew-ename-" + c.id).focus(); return; }
  if (act === "edit-no") { CREW_EDIT = null; paintCrews(); document.querySelector('[data-crew-card="' + c.id + '"] [data-crew-act="edit"]').focus(); return; }
  if (act === "ask-no") { CREW_ASK = null; paintCrews(); var again = document.querySelector(refocus); if (again) again.focus(); return; }
  if (act === "copy") {
    var input = $("crew-link-" + c.id), said = $("crew-copied-" + c.id);
    var fallback = function () { input.focus(); input.select(); said.textContent = "Copy the link above."; };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(input.value).then(function () { said.textContent = "Link copied."; }, fallback);
    else fallback();
    return;
  }
  // the ones that need a "yes" first
  var asks = { leave: "Leave " + c.name + "? You'd need a new invite link to come back.", delete: "Delete " + c.name + " for everyone? This can't be undone.",
    remove: who && "Remove " + who.name + " from " + c.name + "?", owner: who && "Make " + who.name + " the owner? You'll stay a member, and they'll manage the crew." };
  var confirmed = { "leave-yes": "leave", "delete-yes": "delete", "remove-yes": "remove", "owner-yes": "owner" }[act];
  if (asks[act]) { CREW_ASK = { crew: c.id, act: act + "-yes", text: asks[act], user: user }; paintCrews(); var yes = document.querySelector('[data-crew-card="' + c.id + '"] .confirm .btn'); if (yes) yes.focus(); return; }
  b.disabled = true;
  var req = act === "invite" ? api("/crews/" + c.id + "/invites", { method: "POST" }) :
    act === "revoke" ? api("/crews/" + c.id + "/invites/" + b.getAttribute("data-invite"), { method: "DELETE" }) :
    confirmed === "leave" ? api("/crews/" + c.id + "/leave", { method: "POST" }) :
    confirmed === "delete" ? api("/crews/" + c.id, { method: "DELETE" }) :
    confirmed === "remove" ? api("/crews/" + c.id + "/members/" + user, { method: "DELETE" }) :
    confirmed === "owner" ? api("/crews/" + c.id + "/owner", { method: "POST", body: { user_id: user } }) : null;
  if (!req) return;
  req.then(readJSON).then(function (res) {
    if (!res.ok) { crewFail(card, res); return; }
    CREW_ASK = null;
    if (act === "invite") {
      CREW_LINKS[c.id] = res.body;
      return loadCrews('#crew-link-' + c.id).then(function () { $("edit-live").textContent = "Invite link made. Copy it and send it to whoever you'd like to join."; });
    }
    var said = act === "revoke" ? "Turned off that invite link." : confirmed === "leave" ? "You left " + c.name + "." :
      confirmed === "delete" ? "Deleted " + c.name + "." : confirmed === "remove" ? "Removed " + who.name + "." : who.name + " is now the owner.";
    if (confirmed === "leave" || confirmed === "delete") delete CREW_LINKS[c.id];
    loadCrews(confirmed === "leave" || confirmed === "delete" ? "#crews-title" : '[data-crew-card="' + c.id + '"] [data-crew-act="invite"]')
      .then(function () { $("edit-live").textContent = said; });
  }, function () { crewFail(card, null); });
});
$("crew-list").addEventListener("submit", function (ev) {
  var form = ev.target.closest("[data-crew-form]"); if (!form) return;
  ev.preventDefault();
  var id = form.getAttribute("data-crew-form"), name = $("crew-ename-" + id).value.trim(), err = form.querySelector(".form-error");
  if (!name) { err.textContent = "Give the crew a name."; $("crew-ename-" + id).focus(); return; }
  api("/crews/" + id, { method: "PATCH", body: { name: name, description: $("crew-edesc-" + id).value.trim() } }).then(readJSON).then(function (res) {
    if (!res.ok) { err.textContent = errorText(res); return; }
    CREW_EDIT = null; loadCrews('#crew-h-' + id).then(function () { $("edit-live").textContent = "Saved " + name + "."; });
  }, function () { err.textContent = errorText(null); });
});
$("crew-new").addEventListener("submit", function (ev) {
  ev.preventDefault();
  var name = $("crew-name").value.trim(), err = $("crew-new-error");
  if (!name) { err.textContent = "Give the crew a name."; $("crew-name").focus(); return; }
  err.textContent = "";
  api("/crews", { method: "POST", body: { name: name, description: $("crew-desc").value.trim() } }).then(readJSON).then(function (res) {
    if (!res.ok) { err.textContent = errorText(res); return; }
    $("crew-name").value = ""; $("crew-desc").value = "";
    loadCrews('[data-crew-card="' + res.body.id + '"] [data-crew-act="invite"]').then(function () {
      $("edit-live").textContent = "Started " + res.body.name + ". Make an invite link to bring people in.";
    });
  }, function () { err.textContent = errorText(null); });
});

// ---------- joining from an invite link ----------
function openJoin(token) {
  openAccount();
  api("/crews/invite/" + encodeURIComponent(token)).then(readJSON).then(function (res) {
    if (!res.ok) { JOIN = null; $("join-panel").hidden = true; openAccount(errorText(res)); return; }
    JOIN = { token: token, preview: res.body }; paintJoin(true);
  }, function () { openAccount(errorText(null)); });
}
function paintJoin(focus) {
  var panel = $("join-panel");
  if (!JOIN) { panel.hidden = true; return; }
  var p = JOIN.preview, signedIn = !!AUTH.user;
  panel.hidden = false;
  $("join-title").textContent = "Join " + p.crew_name;
  $("join-text").textContent = p.invited_by + " invited you to " + p.crew_name + " (" + plural(p.members, "member", "members") + ")." +
    (p.description ? " " + p.description : "") +
    (p.already_member ? " You're already in it." : p.full ? " It's full right now, so ask them to make room." : signedIn ? "" : " Sign in or create an account below, then join.");
  $("join-error").textContent = "";
  $("join-yes").hidden = !signedIn || p.already_member || p.full; $("join-yes").disabled = false;
  $("join-no").textContent = p.already_member || p.full ? "Close" : "Not now";
  if (focus) $("join-title").focus();
}
$("join-yes").addEventListener("click", function () {
  if (!JOIN) return;
  var b = this; b.disabled = true;
  api("/crews/join", { method: "POST", body: { token: JOIN.token } }).then(readJSON).then(function (res) {
    if (!res.ok) { b.disabled = false; $("join-error").textContent = errorText(res); return; }
    var name = res.body.name; JOIN = null; paintJoin();
    loadCrews('#crew-h-' + res.body.id).then(function () { $("edit-live").textContent = "You joined " + name + "."; });
  }, function () { b.disabled = false; $("join-error").textContent = errorText(null); });
});
$("join-no").addEventListener("click", function () { JOIN = null; paintJoin(); $("account-title").focus(); });
