// Culture Crew site: Culture crews (CC-74): "Your crews" on the account page, invite links, and joining.
// Loaded by index.html in order (core, util, catalog, planner, account, crews, submit, admin, hours, found, issues, photos, approvals, start); they share one
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
  // CC-75: two halves, members and the crew's shared plans; each scrolls on its own past about 5 members' height
  html += '<div class="crew-cols"><div class="crew-col"><h4 class="crew-col-h" id="crew-m-' + id + '">Members</h4>' +
    '<ul class="members" aria-label="Members of ' + esc(c.name) + '">' + c.members.map(function (m) {
    var tags = (m.owner ? ' <span class="state">Owner</span>' : "") + (m.you ? ' <span class="state">You</span>' : "");
    var acts = c.owner && !m.you ? crewAct("owner", c, 'data-user="' + esc(m.user_id) + '"', "Make owner", "btn ghost", "Make " + m.name + " the owner of " + c.name) +
      crewAct("remove", c, 'data-user="' + esc(m.user_id) + '"', "Remove", "btn ghost", "Remove " + m.name + " from " + c.name) : "";
    return '<li><span class="who">' + esc(m.name) + tags + "</span>" + (acts ? '<span class="row">' + acts + "</span>" : "") + "</li>";
  }).join("") + "</ul>" + "</div>" +
    '<div class="crew-col"><h4 class="crew-col-h" id="crew-p-' + id + '">Plans</h4>' + crewPlansHTML(c) + "</div></div>";
  if (asking) html += askHTML(asking.text, asking.act, c, asking.user ? 'data-user="' + esc(asking.user) + '"' : "");
  var link = CREW_LINKS[c.id];
  if (link) {
    html += '<div class="link-box"><label for="crew-link-' + id + '">Invite link: send it to whoever you\'d like to join</label>' +
      '<input id="crew-link-' + id + '" type="text" readonly value="' + esc(link.url) + '">' +
      '<div class="row">' + crewAct("copy", c, "", "Copy link", "btn") +
      crewAct("qr", c, 'aria-expanded="' + !!link.qr + '" aria-controls="crew-qr-' + id + '"', link.qr ? "Hide QR code" : "Show QR code", "btn neutral") +
      '<span class="small" role="status" id="crew-copied-' + id + '">Works until ' +
      esc(short(new Date(link.expires_at))) + ". Anyone with it can join.</span></div>" +
      '<figure class="crew-qr" id="crew-qr-' + id + '"' + (link.qr ? "" : " hidden") + ">" + (link.qr ?
        '<img src="' + link.qr + '" width="240" height="240" alt="QR code for the invite link to ' + esc(c.name) + '">' +
        '<figcaption class="small">Scan it with a phone camera to join ' + esc(c.name) + '. <a href="' + link.qr + '" download="' +
        esc(qrFileName(c.name)) + '">Download it</a> to text or print.</figcaption>' : "") + "</figure></div>";
  }
  if (c.invites.length) {
    html += '<ul class="invites" aria-label="Invite links for ' + esc(c.name) + '">' + c.invites.map(function (i) {
      return "<li>A link from " + esc(i.yours ? "you" : i.made_by) + " · until " + esc(short(new Date(i.expires_at))) + " · " +
        (i.uses ? plural(i.uses, "person", "people") + " joined" : "not used yet") +
        (i.yours || c.owner ? " " + crewAct("revoke", c, 'data-invite="' + esc(i.id) + '"', "Turn off", "textbtn", "Turn off this invite link") : "") + "</li>";
    }).join("") + "</ul>";
  }
  if (c.email_invites.length) { // CC-59: invites by email waiting; the address shows only to whoever sent it
    html += '<ul class="invites" aria-label="Email invites waiting for ' + esc(c.name) + '">' + c.email_invites.map(function (i) {
      return "<li>" + (i.yours ? "You invited " + esc(i.email) : "An email invite from " + esc(shortName(i.made_by))) + " · waiting until " +
        esc(short(new Date(i.expires_at))) + (i.yours || c.owner ? " " + crewAct("cancel-email", c, 'data-invite="' + esc(i.id) + '"', "Cancel", "textbtn",
          "Cancel this email invite") : "") + "</li>";
    }).join("") + "</ul>";
  }
  var full = c.members.length >= c.max_members;
  if (!full) {
    html += '<form class="crew-email" data-crew-email="' + id + '" novalidate><label for="crew-email-' + id + '">Invite by email</label>' +
      '<div class="row"><input id="crew-email-' + id + '" type="email" autocomplete="off" placeholder="name@example.com" aria-describedby="crew-email-msg-' + id + '">' +
      '<button class="btn neutral" type="submit">Send invite</button></div>' +
      '<p class="hint small" id="crew-email-msg-' + id + '" role="status">We\u2019ll email them. They\u2019ll see it when they sign in, or once they register with that address.</p></form>';
  }
  html += '<div class="row">' + (full ? '<span class="hint">The crew is full.</span>' : crewAct("invite", c, "", "Make an invite link", "btn")) +
    (c.owner ? crewAct("edit", c, "", "Rename") + crewAct("delete", c, "", "Delete crew…", "btn danger") : crewAct("leave", c, "", "Leave crew…")) + "</div>";
  return html + "</article>";
}
// Each half of a crew box stops at the height five member rows take, measured from a real row (rows with an
// owner's buttons are taller), and scrolls on its own past that (CC-75).
function capCrewHeights() {
  Array.prototype.forEach.call(document.querySelectorAll(".crew"), function (card) {
    var list = card.querySelector("ul.members"), rows = list ? list.children : [];
    if (!rows.length) return;
    var gap = parseFloat(getComputedStyle(list).rowGap) || 0, tallest = 0;
    Array.prototype.forEach.call(rows, function (r) { tallest = Math.max(tallest, r.offsetHeight); });
    var cap = Math.ceil(5 * tallest + 4 * gap);
    Array.prototype.forEach.call(card.querySelectorAll("ul.members, ul.crew-plans"), function (ul) {
      ul.style.maxHeight = cap + "px";
      if (ul.scrollHeight > ul.clientHeight) ul.tabIndex = 0; else ul.removeAttribute("tabindex"); // keyboard users can scroll it too
    });
  });
}
window.addEventListener("resize", function () { if (CREWS.length && visible("account")) capCrewHeights(); });
// The crew's shared plans (CC-75): each event once, soonest first, with who's going or interested, in the
// product owner's words: "Only you are interested in this…for now.", "Jordan R. is interested!",
// "Three others are interested!" (the number is a button: hover shows the names; a tap opens them below).
var NUMBER_WORDS = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve",
  "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen", "Twenty", "Twenty-one", "Twenty-two",
  "Twenty-three", "Twenty-four", "Twenty-five"];
var CREWCOUNT_SEQ = 0;
function shortName(name) { // "Jordan Reyes" -> "Jordan R."; one word stays as it is
  var parts = String(name || "").trim().split(/\s+/);
  return parts.length > 1 && /^[A-Za-z]/.test(parts[parts.length - 1]) ? parts[0] + " " + parts[parts.length - 1][0].toUpperCase() + "." : parts.join(" ");
}
function othersHTML(people, verb) { // "Jordan R. is interested!" or "<b><i>Three</i></b> others are interested!"
  if (people.length === 1) {
    var p = people[0];
    return esc(shortName(p.name)) + " is " + verb + (verb === "going" && p.date ? " " + esc(goingDay(p.date)) : "") + "!";
  }
  CREWCOUNT_SEQ += 1;
  var names = people.map(function (p) { return shortName(p.name) + (verb === "going" && p.date ? " (" + goingDay(p.date) + ")" : ""); }).join(", ");
  var n = NUMBER_WORDS[people.length] || String(people.length);
  return '<button type="button" class="crew-count" data-crew-count aria-expanded="false" aria-controls="crew-count-' + CREWCOUNT_SEQ + '" aria-label="' +
    esc(n + " others: " + names) + '" data-names="' + esc(names) + '"><b><i>' + esc(n) + "</i></b></button> others are " + verb + "!" +
    '<span class="crew-count-names" id="crew-count-' + CREWCOUNT_SEQ + '" hidden>' + esc(names) + "</span>";
}
function crewLineHTML(people) {
  var you = people.filter(function (p) { return p.you; })[0], others = people.filter(function (p) { return !p.you; });
  var going = others.filter(function (p) { return p.status === "going"; }), interested = others.filter(function (p) { return p.status !== "going"; });
  var parts = [];
  if (you && you.status === "going") parts.push("You\u2019re going" + (you.date ? " " + esc(goingDay(you.date)) : "") + ".");
  if (going.length) parts.push(othersHTML(going, "going"));
  if (interested.length) parts.push(othersHTML(interested, "interested"));
  if (you && you.status !== "going") {
    parts.push(interested.length ? "You are too." : going.length ? "You\u2019re interested." : "Only you are interested in this\u2026for now.");
  }
  return parts.join(" ");
}
// CC-93: who from the crew has been, under the plans line. 📸: their photo from it is approved; 📷: no photo, or one
// waiting. One person is named in the line; for more, the count shows each person's line on hover (or a tap).
function beenGroupHTML(people, emoji, one, many, each) {
  if (!people.length) return "";
  if (people.length === 1) return '<span aria-hidden="true">' + emoji + "</span> " + esc(shortName(people[0].name)) + " " + one;
  CREWCOUNT_SEQ += 1;
  var lines = people.map(function (p) { return shortName(p.name) + " " + each; }).join("\n");
  var n = NUMBER_WORDS[people.length] || String(people.length);
  return '<span aria-hidden="true">' + emoji + '</span> <button type="button" class="crew-count" data-crew-count aria-expanded="false" aria-controls="crew-count-' + CREWCOUNT_SEQ +
    '" aria-label="' + esc(n + " others: " + lines.replace(/\n/g, " ")) + '" data-names="' + esc(lines) + '"><b><i>' + esc(n) + "</i></b></button> others " + many +
    '<span class="crew-count-names" id="crew-count-' + CREWCOUNT_SEQ + '" hidden>' + esc(lines) + "</span>";
}
function beenLineHTML(been) {
  var sure = (been || []).filter(function (b) { return b.approved; }), maybe = (been || []).filter(function (b) { return !b.approved; });
  return [beenGroupHTML(sure, "\ud83d\udcf8", "very much has been!", "very much have been!", "very much has been!"),
    beenGroupHTML(maybe, "\ud83d\udcf7", "has been...maybe.", "have been...maybe.", "has been...maybe.")].filter(Boolean).join(' <span class="sep" aria-hidden="true">\u00b7</span> ');
}
function crewPlansHTML(c) {
  if (!c.plans.length) return '<p class="hint small">No plans shared yet. Use \u201cInvite your Crew?\u201d on an event you\u2019re interested in.</p>';
  return '<ul class="crew-plans" aria-labelledby="crew-p-' + esc(c.id) + '">' + c.plans.map(function (row) {
    var e = toEvent(row.event);
    return '<li><a href="' + esc(safeUrl(e.url)) + '" target="_blank" rel="noopener">' + esc(e.title) + "</a>" +
      '<span class="hint small">' + esc(placeText(e)) + " · " + esc(dateText(e)) + "</span>" +
      (row.people.length ? '<span class="crew-line">' + crewLineHTML(row.people) + "</span>" : "") +
      ((row.been || []).length ? '<span class="crew-line crew-been">' + beenLineHTML(row.been) + "</span>" : "") + "</li>"; // CC-93
  }).join("") + "</ul>";
}
// The names under a count: a tap (phones) opens them below the line; hovering or focusing shows them in one shared
// tip on the page body (the views' fade-in transform would throw off a tip placed inside them).
var CREW_TIP = null;
function crewTip(b) {
  if (!CREW_TIP) { CREW_TIP = document.createElement("div"); CREW_TIP.className = "crew-tip"; CREW_TIP.setAttribute("aria-hidden", "true"); document.body.appendChild(CREW_TIP); }
  if (!b) { CREW_TIP.hidden = true; return; }
  var r = b.getBoundingClientRect();
  CREW_TIP.textContent = b.getAttribute("data-names"); CREW_TIP.hidden = false;
  CREW_TIP.style.left = Math.max(8, Math.min(r.left, window.innerWidth - CREW_TIP.offsetWidth - 8)) + "px";
  CREW_TIP.style.top = Math.max(8, r.top - CREW_TIP.offsetHeight - 8) + "px";
}
document.addEventListener("click", function (ev) {
  var b = ev.target.closest("[data-crew-count]"); if (!b) return;
  var names = $(b.getAttribute("aria-controls")), open = b.getAttribute("aria-expanded") !== "true";
  b.setAttribute("aria-expanded", String(open)); if (names) names.hidden = !open;
  crewTip(null);
});
document.addEventListener("pointerover", function (ev) {
  var b = ev.target.closest && ev.target.closest("[data-crew-count]");
  if (b && ev.pointerType === "mouse") crewTip(b); else if (!b) crewTip(null);
});
document.addEventListener("focusin", function (ev) { var b = ev.target.closest && ev.target.closest("[data-crew-count]"); crewTip(b || null); });
window.addEventListener("scroll", function () { crewTip(null); }, true);

function paintCrews() {
  $("crew-list").innerHTML = CREWS.map(crewHTML).join("");
  capCrewHeights();
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
  if (act === "qr") { // CC-86: the link as a QR code with the dolphin in the middle, made here in the browser
    var made = CREW_LINKS[c.id];
    if (made.qr) { made.qr = null; paintCrews(); document.querySelector('[data-crew-card="' + c.id + '"] [data-crew-act="qr"]').focus(); return; }
    qrWithDolphin(made.url).then(function (png) {
      made.qr = png; paintCrews();
      document.querySelector('[data-crew-card="' + c.id + '"] [data-crew-act="qr"]').focus();
      $("edit-live").textContent = "QR code for the invite link to " + c.name + " is showing.";
    }, function () { $("crews-status").textContent = "Couldn't make the QR code. Copy the link instead."; });
    return;
  }
  if (act === "copy") {
    var input = $("crew-link-" + c.id), said = $("crew-copied-" + c.id);
    var fallback = function () { input.focus(); input.select(); said.textContent = "Copy the link above."; };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(input.value).then(function () { said.textContent = "Link copied."; }, fallback);
    else fallback();
    return;
  }
  if (act === "cancel-email") {
    b.disabled = true;
    api("/crews/" + c.id + "/email-invites/" + b.getAttribute("data-invite"), { method: "DELETE" }).then(function (r) {
      if (!r.ok && r.status !== 404) return readJSON(r).then(function (res) { crewFail(card, res); });
      loadCrews('[data-crew-card="' + c.id + '"] [data-crew-email] input').then(function () { $("edit-live").textContent = "Cancelled that invite."; });
    }, function () { crewFail(card, null); });
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
$("crew-list").addEventListener("submit", function (ev) { // CC-59: invite by email
  var form = ev.target.closest("[data-crew-email]"); if (!form) return;
  ev.preventDefault();
  var id = form.getAttribute("data-crew-email"), input = form.querySelector("input"), msg = form.querySelector(".hint"), btn = form.querySelector("button");
  var email = input.value.trim();
  if (!looksLikeEmail(email)) { msg.textContent = "Enter their email address, like name@example.com."; msg.classList.add("bad"); input.focus(); return; }
  btn.disabled = true;
  api("/crews/" + id + "/email-invites", { method: "POST", body: { email: email } }).then(readJSON).then(function (res) {
    btn.disabled = false;
    if (!res.ok) { msg.textContent = errorText(res); msg.classList.add("bad"); return; }
    loadCrews('[data-crew-email="' + id + '"] input').then(function () {
      var m = document.querySelector('[data-crew-email="' + id + '"] .hint');
      if (m) m.textContent = res.body.message; $("edit-live").textContent = res.body.message;
    });
  }, function () { btn.disabled = false; msg.textContent = errorText(null); msg.classList.add("bad"); });
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

// ---------- "Invite your Crew?" on an event card (CC-75) ----------
// Once you have a plan for an event and you're in a crew, the card offers "Invite your Crew?": a checkbox per
// crew. Only the crews you tick see it; changing the plan keeps them; clearing it, or "I've been", unshares it.
var CREWSHARE_SEQ = 0;
function crewShareToggleHTML(e) {
  var mine = MYPLANS[e.id];
  if (!mine || !CREWS.length) return "";
  CREWSHARE_SEQ += 1;
  var n = (mine.crews || []).length;
  return '<button type="button" class="went" data-crewshare-toggle="' + esc(e.id) + '" aria-expanded="false" aria-controls="crewshare-' + CREWSHARE_SEQ + '">' +
    (n ? "Shared with " + plural(n, "crew", "crews") : "Invite your Crew?") + "</button>";
}
function crewShareHTML(e) {
  var mine = MYPLANS[e.id];
  if (!mine || !CREWS.length) return "";
  var n = CREWSHARE_SEQ, on = mine.crews || [];
  // a labelled group, not a fieldset: Safari draws a fieldset's legend outside a popover's border
  return '<div class="myplan crewshare" id="crewshare-' + n + '" role="group" aria-labelledby="crewshare-h-' + n + '" hidden>' +
    '<p class="crewshare-h" id="crewshare-h-' + n + '">Which crews can see your plan?</p>' +
    CREWS.map(function (c) {
      return '<label class="radio"><input type="checkbox" value="' + esc(c.id) + '"' + (on.indexOf(c.id) >= 0 ? " checked" : "") + "> " + esc(c.name) + "</label>";
    }).join("") +
    '<p class="hint small">Only members of the crews you tick see it.</p>' +
    '<div class="row"><button type="button" class="went" data-crewshare-save="' + esc(e.id) + '">Save</button></div>' +
    '<p class="form-error" role="alert"></p></div>';
}
document.addEventListener("click", function (ev) {
  Array.prototype.forEach.call(document.querySelectorAll('[data-crewshare-toggle][aria-expanded="true"]'), function (open) {
    var panel = $(open.getAttribute("aria-controls"));
    if (!open.contains(ev.target) && !(panel && panel.contains(ev.target))) { open.setAttribute("aria-expanded", "false"); if (panel) panel.hidden = true; }
  });
  if (!AUTH.user) return;
  var t = ev.target.closest("[data-crewshare-toggle],[data-crewshare-save]"); if (!t) return;
  if (t.hasAttribute("data-crewshare-toggle")) {
    var open = t.getAttribute("aria-expanded") !== "true", panel = $(t.getAttribute("aria-controls"));
    t.setAttribute("aria-expanded", String(open)); panel.hidden = !open;
    if (open) panel.querySelector("input").focus();
    return;
  }
  var box = t.closest(".crewshare"), id = t.getAttribute("data-crewshare-save"), err = box.querySelector(".form-error");
  var picked = Array.prototype.map.call(box.querySelectorAll("input:checked"), function (i) { return +i.value; });
  t.disabled = true; err.textContent = "";
  api("/me/plans/" + encodeURIComponent(id) + "/crews", { method: "PUT", body: { crews: picked } }).then(readJSON).then(function (res) {
    if (!res.ok) throw res;
    if (MYPLANS[id]) MYPLANS[id].crews = res.body.crews;
    var names = CREWS.filter(function (c) { return res.body.crews.indexOf(c.id) >= 0; }).map(function (c) { return c.name; });
    $("myplan-live").textContent = (names.length ? "Shared with " + names.join(" and ") : "Not shared with any crew") + ": " + KNOWN[id].title;
    if (visible("account")) loadCrews();
    return redrawCards(id, box.closest("[data-card]"), "[data-crewshare-toggle]");
  }).catch(function (res) {
    t.disabled = false; err.textContent = res && res.status ? errorText(res) : "Couldn't save. Check your connection and try again.";
  });
});
document.addEventListener("keydown", function (ev) { // Escape closes the crew picker and returns to its button
  if (ev.key !== "Escape") return;
  var box = ev.target.closest && ev.target.closest(".crewshare"); if (!box) return;
  var toggle = document.querySelector('[aria-controls="' + box.id + '"]');
  if (toggle) { toggle.setAttribute("aria-expanded", "false"); box.hidden = true; toggle.focus(); }
});

// ---------- invites waiting for you (CC-59) ----------
// Someone invited your email address to a crew. On sign-in a notice under the header says so, with Accept and
// Decline; the same requests sit at the top of Your crews, and the Account link shows how many, until answered.
var PENDING = [], PENDING_LATER = false; // "Later" hides the notice until the next sign-in
function loadPending(fresh) {
  if (!AUTH.user) return Promise.resolve();
  if (fresh) PENDING_LATER = false;
  return api("/crews/pending").then(readJSON).then(function (res) { if (res.ok) { PENDING = res.body; paintPending(); } }, function () {});
}
function pendingItemHTML(p, where) {
  var id = esc(p.id);
  return '<div class="pending" data-pending="' + id + '"><p><strong>' + esc(shortName(p.invited_by)) + "</strong> invited you to <strong>" + esc(p.crew_name) +
    "</strong>" + (p.description ? " \u00b7 " + esc(p.description) : "") + ' <span class="hint small">(' + plural(p.members, "member", "members") + ")</span>" +
    (p.full ? ' <span class="hint small">It\u2019s full right now.</span>' : "") + "</p>" +
    '<div class="row">' + (p.full ? "" : '<button class="btn" type="button" data-pending-act="accept" data-pending-id="' + id + '" aria-label="Accept the invite to ' + esc(p.crew_name) + '">Accept</button>') +
    '<button class="btn ghost" type="button" data-pending-act="decline" data-pending-id="' + id + '" aria-label="Decline the invite to ' + esc(p.crew_name) + '">Decline</button>' +
    "</div></div>";
}
function paintPending() {
  // CC-91: the admin's offer to approve photos waits here too, before the crew invites (approvals.js)
  var offer = AUTH.user && AUTH.user.approver_offered ? [approverOfferHTML()] : [];
  var n = AUTH.user ? PENDING.length + offer.length : 0, count = $("account-count");
  if (count) count.textContent = n ? String(n) : "";
  $("pending-invites").hidden = !n;
  $("pending-invites").innerHTML = n ? '<h3 id="pending-title">Waiting for you</h3>' + offer.join("") + PENDING.map(function (p) { return pendingItemHTML(p, "list"); }).join("") : "";
  var banner = $("invite-banner");
  banner.hidden = !n || PENDING_LATER || visible("account");
  banner.innerHTML = banner.hidden ? "" : offer.concat(PENDING.map(function (p) { return pendingItemHTML(p, "banner"); })).slice(0, 2).join("") +
    '<p class="small">' + (n > 2 ? "And " + plural(n - 2, "more invite", "more invites") + " on " : "Also on ") +
    '<button class="textbtn" type="button" data-go="account">Your account</button>. <button class="textbtn" type="button" data-pending-act="later">Not now</button></p>';
}
document.addEventListener("click", function (ev) {
  var b = ev.target.closest("[data-pending-act]"); if (!b) return;
  var act = b.getAttribute("data-pending-act");
  if (act === "later") { PENDING_LATER = true; paintPending(); (document.querySelector("main h1:not([hidden])") || $("brand")).focus(); return; }
  var id = b.getAttribute("data-pending-id"), p = PENDING.filter(function (x) { return String(x.id) === id; })[0], fromBanner = !!b.closest("#invite-banner");
  b.disabled = true;
  api("/crews/pending/" + id + "/" + act, { method: "POST" }).then(readJSON).then(function (res) {
    if (!res.ok && res.status !== 404) { b.disabled = false; $("crews-status").textContent = errorText(res); return; }
    PENDING = PENDING.filter(function (x) { return String(x.id) !== id; }); paintPending();
    var said = act === "accept" ? (res.ok ? "You joined " + p.crew_name + "." : "That invite has expired or was cancelled.") : "Declined the invite to " + p.crew_name + ".";
    $("edit-live").textContent = said;
    if (fromBanner && act === "accept" && res.ok) { openAccount(said); loadCrews().then(buildCrewFilter); return; } // focus: the page heading
    var next = $("pending-invites").querySelector("[data-pending-act]");
    loadCrews(act === "accept" && res.ok ? "#crew-h-" + res.body.id : null).then(function () {
      buildCrewFilter();
      if (act !== "accept" || !res.ok) (next || (fromBanner ? document.querySelector("main h1") : $("crews-title"))).focus();
    });
  }, function () { b.disabled = false; });
});

// ---------- the invite link as a QR code (CC-86) ----------
// Made in the browser with qrcode-generator (js/vendor/qrcode.js), so the link (a secret token) never goes to an
// outside service. High error correction (H, ~30%) lets the dolphin cover the middle and the code still scan.
var QR_DOLPHIN = null;
function qrFileName(name) { return "culture-crew-invite-" + (String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "crew") + ".png"; }
function qrWithDolphin(text) {
  return new Promise(function (resolve, reject) {
    var dolphin = QR_DOLPHIN || new Image();
    function draw() {
      try {
        var qr = qrcode(0, "H"); qr.addData(text); qr.make();
        var n = qr.getModuleCount(), quiet = 4, cell = Math.max(4, Math.floor(480 / (n + quiet * 2))), size = (n + quiet * 2) * cell;
        var canvas = document.createElement("canvas"); canvas.width = canvas.height = size;
        var g = canvas.getContext("2d");
        g.fillStyle = "#ffffff"; g.fillRect(0, 0, size, size);
        g.fillStyle = "#111111";
        for (var r = 0; r < n; r++) for (var col = 0; col < n; col++) if (qr.isDark(r, col)) g.fillRect((col + quiet) * cell, (r + quiet) * cell, cell, cell);
        var badge = Math.round(size * 0.22), x = (size - badge) / 2; // a white rounded square in the middle, with the dolphin
        g.fillStyle = "#ffffff"; g.beginPath();
        if (g.roundRect) g.roundRect(x, x, badge, badge, badge * 0.18); else g.rect(x, x, badge, badge);
        g.fill();
        var pic = badge * 0.8; g.drawImage(dolphin, (size - pic) / 2, (size - pic) / 2, pic, pic);
        resolve(canvas.toDataURL("image/png"));
      } catch (e) { reject(e); }
    }
    if (QR_DOLPHIN && QR_DOLPHIN.complete) { draw(); return; }
    dolphin.onload = function () { QR_DOLPHIN = dolphin; draw(); }; dolphin.onerror = reject; dolphin.src = "img/dolphin-interested.webp";
  });
}
