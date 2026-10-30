// Culture Crew site: Culture crews (CC-74): the crews page (#crews, CC-104), invite links, and joining.
// Loaded by index.html in order (core, util, catalog, planner, account, crews, submit, admin, hours, found, issues, photos, approvals, start); they share one
// global scope, so anything declared here is visible to the files after it.
"use strict";
// A member can be in several crews; any member can make an invite link (7 days, revocable by its maker or
// the owner); a crew has up to 25 members. Members see each other's names, never emails. An invite link is
// #join=<token>: it opens the account page with a "Join <crew>" panel (after signing in, if needed); once joined, the
// crews page.
var CREWS = [], CREW_LINKS = {}, CREW_ASK = null, CREW_EDIT = null; // links just made, by crew; a pending confirm; a crew being renamed
var JOIN = null; // { token, preview } from an invite link

function loadCrews(focusSel) {
  if (!AUTH.user) return Promise.resolve();
  return api("/crews").then(readJSON).then(function (res) {
    if (!res.ok) { $("crews-status").textContent = checkThis(errorText(res)); return; }
    $("crews-status").textContent = ""; CREWS = res.body; paintCrews();
    var f = focusSel && document.querySelector(focusSel); if (f) f.focus();
  }, function () { $("crews-status").textContent = checkThis(errorText(null)); });
}
// CC-145: an error is a pale red band that starts "Check this:", and the field at fault gets a 2.5px ink border; never red text
function checkThis(text) { return "Check this: " + text; }
function crewMarkInvalid(input, on) { if (on) input.setAttribute("aria-invalid", "true"); else input.removeAttribute("aria-invalid"); }
document.addEventListener("input", function (ev) { if (ev.target.closest && ev.target.closest("#view-crews")) crewMarkInvalid(ev.target, false); });
// ---------- the crews page (CC-104; Lakefront, CC-145) ----------
// A title and an italic deck; invites waiting first, on the pale blue band; then "3 crews" and Start a crew on the
// section rule, and one row per crew. Signed out, a short word on what crews are and a way to sign in, which comes back here.
function openCrews(said) { renderCrewsPage(); show("crews"); if (said) $("edit-live").textContent = said; }
function renderCrewsPage() {
  var u = AUTH.user;
  $("crews-signin").hidden = !!u; $("crews-main").hidden = !u;
  if (!u) { $("crew-list").innerHTML = ""; return; }
  paintCrews(); paintPending(); loadCrews(); loadPending();
}
$("crews-signin-btn").addEventListener("click", function () { AFTER_SIGN_IN = "crews"; openAccount(); });
function showCrewForm(open) {
  $("crew-new").hidden = !open; $("crew-start-btn").setAttribute("aria-expanded", String(open));
  if (open) $("crew-name").focus(); else { $("crew-new-error").textContent = ""; crewMarkInvalid($("crew-name"), false); $("crew-start-btn").focus(); }
}
$("crew-start-btn").addEventListener("click", function () { showCrewForm($("crew-new").hidden); });
$("crew-new-cancel").addEventListener("click", function () { showCrewForm(false); });
// CC-120: each crew is a summary (name, about, dots, what's next) that opens, one crew at a time, into its plans and
// members. Invites, Rename, Leave and Dissolve sit under "Manage crew", closed by default. The open crew is
// remembered in this browser for the next visit ("" once you close it, so a lone crew doesn't reopen itself).
var CREW_OPEN = null, CREW_MANAGE = null; // crew ids, as strings
function crewOpenSaved() { try { return localStorage.getItem("cc_open_crew"); } catch (e) { return null; } }
CREW_OPEN = crewOpenSaved() || null;
function setCrewOpen(id) {
  CREW_OPEN = id == null ? null : String(id);
  if (CREW_MANAGE !== CREW_OPEN) CREW_MANAGE = null;
  try { localStorage.setItem("cc_open_crew", CREW_OPEN || ""); } catch (e) {} // blocked storage: it's only forgotten
}
var FACES = 6;
function initials(name) {
  var w = String(name || "?").trim().split(/\s+/);
  return ((w[0] || "?").charAt(0) + (w.length > 1 ? w[w.length - 1].charAt(0) : "")).toUpperCase();
}
function crewTone(id) { // CC-136: each member keeps their dot's tint (one of six) wherever they appear
  var s = String(id || ""), h = 0;
  for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 9973;
  return h % 6;
}
// A person is a pale-tint dot with their initials (circles are people). CC-145: the tint comes from the name, as on the
// listings and the event page (their API sends names, not ids), so someone's dot is the same colour everywhere.
function crewDotHTML(name, you, cls) {
  return '<span class="face tone-' + crewTone(name) + (cls ? " " + cls : "") + '"' + (you ? " data-you" : "") + ' title="' + esc(name) + '">' +
    esc(initials(name)) + "</span>";
}
function crewFacesHTML(c) { // inside the summary button, so spans; a screen reader hears the count, not every name
  var you = c.members.filter(function (m) { return m.you; }), others = c.members.filter(function (m) { return !m.you; });
  var shown = others.slice(0, FACES - you.length).concat(you), more = c.members.length - shown.length; // yours is always showing, last
  return '<span class="dots" aria-hidden="true">' + shown.map(function (m) { return crewDotHTML(m.name, m.you); }).join("") +
    (more > 0 ? '<span class="face more">+' + more + "</span>" : "") + "</span>" +
    '<span class="sr-only">' + esc(plural(c.members.length, "member", "members")) + ".</span>";
}
function crewNextHTML(c) { // the soonest plan someone's going to, else the soonest anyone's interested in
  var plans = c.plans.filter(function (p) { return p.people.length; });
  var next = plans.filter(function (p) { return p.people.some(function (x) { return x.status === "going"; }); })[0] || plans[0];
  if (!next) return '<span class="crew-next"><span class="crew-next-label">Nothing planned yet</span></span>';
  var e = toEvent(next.event), going = next.people.filter(function (p) { return p.status === "going"; });
  var day = going.length && going[0].date ? goingDay(going[0].date) : dateText(e); // people come soonest going date first
  return '<span class="crew-next"><span class="crew-next-label">Next up</span> ' + esc(day) + ' · <span class="crew-next-title">' + esc(e.title) +
    '</span> <span class="crew-next-label">· ' + (going.length ? plural(going.length, "going", "going") : plural(next.people.length, "interested", "interested")) + "</span></span>";
}
function crewById(id) { return CREWS.filter(function (c) { return String(c.id) === String(id); })[0]; }
function crewAct(act, crew, extra, label, cls, aria) {
  return '<button class="' + (cls || "btn ghost") + '" type="button" data-crew-act="' + act + '" data-crew="' + esc(crew.id) + '"' +
    (extra ? " " + extra : "") + (aria ? ' aria-label="' + esc(aria) + '"' : "") + ">" + esc(label) + "</button>";
}
function askHTML(text, act, crew, extra) { // an inline "are you sure?" in place of a dialog: the question in bold, then the rest
  var q = text.indexOf("?") + 1;
  return '<div class="confirm"><p><b>' + esc(text.slice(0, q)) + "</b>" + esc(text.slice(q)) + '</p><div class="row">' +
    crewAct(act, crew, extra, "Yes", "btn ink") + crewAct("ask-no", crew, "", "Keep it", "btn ghost") + "</div></div>";
}
var CREW_CARET = '<svg class="crew-caret" aria-hidden="true" viewBox="0 0 12 12"><path d="M2 4.5l4 4 4-4"/></svg>';
function crewHTML(c) {
  var id = esc(c.id), open = CREW_OPEN === String(c.id);
  return '<article class="crew' + (open ? " open" : "") + '" data-crew-card="' + id + '">' +
    '<h3 class="crew-h"><button type="button" class="crew-sum" id="crew-h-' + id + '" data-crew-act="open" data-crew="' + id + '" aria-expanded="' + open + '"' +
    (open ? ' aria-controls="crew-d-' + id + '"' : "") + ">" +
    '<span class="crew-id"><span class="crew-name">' + esc(c.name) + "</span>" + (c.owner ? ' <span class="crew-you">You started it</span>' : "") +
    (c.description ? '<span class="crew-about">' + esc(c.description) + "</span>" : "") + "</span>" +
    '<span class="crew-banner">' + crewFacesHTML(c) + crewNextHTML(c) + "</span>" + CREW_CARET + "</button></h3>" +
    (open ? crewDetailHTML(c) : "") + "</article>";
}
// A section's head: its name on the rule, with a count or a note at the right ("Plans 2", "5 members · room for 20 more")
function crewSubHTML(id, label, note) {
  return '<h4 class="crew-sub" id="' + id + '"><span>' + esc(label) + "</span>" + (note ? '<span class="crew-sub-n">' + esc(note) + "</span>" : "") + "</h4>";
}
// The open crew, 7/5: its plans as event rows on the left, its members on the right (on a phone, plans then members),
// then Manage crew. Roles are words, not pills.
function crewDetailHTML(c) {
  var id = esc(c.id), manage = CREW_MANAGE === String(c.id), room = c.max_members - c.members.length;
  return '<div class="crew-detail" id="crew-d-' + id + '"><div class="crew-cols">' +
    '<section class="crew-col" aria-labelledby="crew-p-' + id + '">' + crewSubHTML("crew-p-" + id, "Plans", c.plans.length ? String(c.plans.length) : "") + crewPlansHTML(c) + "</section>" +
    '<section class="crew-col" aria-labelledby="crew-m-' + id + '">' +
    crewSubHTML("crew-m-" + id, plural(c.members.length, "member", "members"), room > 0 ? "room for " + room + " more" : "full") +
    '<ul class="crew-members">' + c.members.map(function (m) {
      var role = [m.owner ? "Crew leader" : "", m.you ? "you" : ""].filter(Boolean).join(" · ");
      return "<li>" + crewDotHTML(m.name, m.you, "face-l") + '<span class="who">' + esc(m.name) + "</span>" + (role ? '<span class="crew-role">' + role + "</span>" : "") + "</li>";
    }).join("") + "</ul></section></div>" +
    '<div class="crew-manage-wrap"><button class="crew-manage-btn" type="button" data-crew-act="manage" data-crew="' + id + '" aria-expanded="' + manage +
    '" aria-controls="crew-mg-' + id + '">Manage crew' + CREW_CARET + "</button>" +
    (manage ? crewManageHTML(c) : '<div id="crew-mg-' + id + '" hidden></div>') + "</div></div>";
}
// Share the link (a phone's share sheet, which the person picks from) or Copy it. The QR code is made here (CC-86).
var CREW_SHARE = !!navigator.share && window.matchMedia("(pointer: coarse)").matches;
function crewManageHTML(c) {
  var id = esc(c.id), asking = CREW_ASK && String(CREW_ASK.crew) === String(c.id) ? CREW_ASK : null, full = c.members.length >= c.max_members;
  var ask = function (acts) {
    return asking && acts.indexOf(asking.act) >= 0 ? askHTML(asking.text, asking.act, c, asking.user ? 'data-user="' + esc(asking.user) + '"' : "") : "";
  };
  var err = '<p class="form-error" role="alert" data-crew-err></p>';
  var html = '<div class="crew-manage" id="crew-mg-' + id + '">';
  // Invite people: any member can make a link or send an email invite
  var link = CREW_LINKS[c.id];
  html += '<section class="crew-mg-part" aria-labelledby="crew-mi-' + id + '">' + crewSubHTML("crew-mi-" + id, "Invite people") +
    (full ? '<p class="hint">The crew is full.</p>' : '<div class="row">' + crewAct("invite", c, "", link ? "Make a new link" : "Make an invite link") + "</div>");
  if (link) {
    html += '<div class="crew-link"><div class="field"><label for="crew-link-' + id + '">Invite link: anyone with it can join, until ' +
      esc(short(new Date(link.expires_at))) + '</label><input id="crew-link-' + id + '" type="text" readonly value="' + esc(link.url) + '"></div>' +
      '<div class="row">' + (CREW_SHARE ? crewAct("share", c, "", "Share the link", "btn") : crewAct("copy", c, "", "Copy link", "btn")) +
      crewAct("qr", c, 'aria-expanded="' + !!link.qr + '" aria-controls="crew-qr-' + id + '"', link.qr ? "Hide the QR code" : "Show a QR code") +
      '<span class="hint" role="status" id="crew-copied-' + id + '"></span></div>' +
      '<figure class="crew-qr" id="crew-qr-' + id + '"' + (link.qr ? "" : " hidden") + ">" + (link.qr ?
        '<img src="' + link.qr + '" width="240" height="240" alt="QR code for the invite link to ' + esc(c.name) + '">' +
        '<figcaption class="hint">Scan it with a phone camera to join ' + esc(c.name) + '. <a href="' + link.qr + '" download="' +
        esc(qrFileName(c.name)) + '">Download it</a> to text or print.</figcaption>' : "") + "</figure></div>";
  }
  if (c.invites.length) {
    html += '<ul class="crew-invites" aria-label="Invite links for ' + esc(c.name) + '">' + c.invites.map(function (i) {
      return "<li><span>A link from " + esc(i.yours ? "you" : i.made_by) + " · until " + esc(short(new Date(i.expires_at))) + " · " +
        (i.uses ? plural(i.uses, "person", "people") + " joined" : "not used yet") + "</span>" +
        (i.yours || c.owner ? crewAct("revoke", c, 'data-invite="' + esc(i.id) + '"', "Turn off", "textbtn crew-tbtn", "Turn off this invite link") : "") + "</li>";
    }).join("") + "</ul>";
  }
  if (c.email_invites.length) { // CC-59: invites by email waiting; the address shows only to whoever sent it
    html += '<ul class="crew-invites" aria-label="Email invites waiting for ' + esc(c.name) + '">' + c.email_invites.map(function (i) {
      return "<li><span>" + (i.yours ? "You invited " + esc(i.email) : "An email invite from " + esc(shortName(i.made_by))) + " · waiting until " +
        esc(short(new Date(i.expires_at))) + "</span>" + (i.yours || c.owner ? crewAct("cancel-email", c, 'data-invite="' + esc(i.id) + '"', "Cancel", "textbtn crew-tbtn",
          "Cancel this email invite") : "") + "</li>";
    }).join("") + "</ul>";
  }
  if (!full) {
    html += '<form class="crew-email field" data-crew-email="' + id + '" novalidate><label for="crew-email-' + id + '">Invite by email</label>' +
      '<div class="crew-email-row"><input id="crew-email-' + id + '" type="email" autocomplete="off" placeholder="name@example.com" aria-describedby="crew-email-err-' + id + " crew-email-msg-" + id + '">' +
      '<button class="btn ghost" type="submit">Send invite</button></div>' +
      '<p class="form-error" role="alert" id="crew-email-err-' + id + '"></p>' +
      '<p class="hint" id="crew-email-msg-' + id + '" role="status">We’ll email them. They’ll see it when they sign in, or once they register with that address.</p></form>';
  }
  html += err + "</section>";
  var others = c.members.filter(function (m) { return !m.you; });
  if (c.owner && others.length) { // the crew leader hands over or removes members
    html += '<section class="crew-mg-part" aria-labelledby="crew-mm-' + id + '">' + crewSubHTML("crew-mm-" + id, "Members") +
      '<ul class="crew-members crew-members-mg" aria-labelledby="crew-mm-' + id + '">' + others.map(function (m) {
        return "<li>" + crewDotHTML(m.name, false, "face-s") + '<span class="who">' + esc(m.name) + '</span><span class="crew-tacts">' +
          crewAct("owner", c, 'data-user="' + esc(m.user_id) + '"', "Make crew leader", "textbtn crew-tbtn", "Make " + m.name + " the crew leader of " + c.name) +
          crewAct("remove", c, 'data-user="' + esc(m.user_id) + '"', "Remove", "textbtn crew-tbtn", "Remove " + m.name + " from " + c.name) + "</span></li>";
      }).join("") + "</ul>" + ask(["owner-yes", "remove-yes"]) + err + "</section>";
  }
  html += '<section class="crew-mg-part" aria-labelledby="crew-mc-' + id + '">' + crewSubHTML("crew-mc-" + id, "The crew");
  if (CREW_EDIT === c.id) {
    html += '<form class="crew-edit" data-crew-form="' + id + '" novalidate><div class="fields">' +
      '<div class="field"><label for="crew-ename-' + id + '">Name</label><input id="crew-ename-' + id + '" type="text" maxlength="60" value="' + esc(c.name) +
      '" aria-describedby="crew-eerr-' + id + '"></div>' +
      '<div class="field"><label for="crew-edesc-' + id + '">About it</label><input id="crew-edesc-' + id + '" type="text" maxlength="200" value="' + esc(c.description) + '"></div></div>' +
      '<p class="form-error" role="alert" id="crew-eerr-' + id + '"></p><div class="row"><button class="btn" type="submit">Save</button>' + crewAct("edit-no", c, "", "Cancel") + "</div></form>";
  } else {
    html += '<div class="row">' + (c.owner ? crewAct("edit", c, "", "Rename") + crewAct("delete", c, "", "Dissolve crew…") : crewAct("leave", c, "", "Leave crew…")) + "</div>";
  }
  return html + ask(["leave-yes", "delete-yes"]) + err + "</section></div>";
}
// The crew's shared plans (CC-75): each event once, soonest first, with who's going or interested, in the
// product owner's words: "Only you are interested in this…for now.", "Jordan Reyes is interested!",
// "Three others are interested!" (the number is a button: hover shows the names; a tap opens them below).
// CC-120: crew-mates are named in full; they're friends, and Members lists them that way.
var NUMBER_WORDS = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve",
  "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen", "Twenty", "Twenty-one", "Twenty-two",
  "Twenty-three", "Twenty-four", "Twenty-five"];
var CREWCOUNT_SEQ = 0;
function shortName(name) { // "Jordan Reyes" -> "Jordan R."; one word stays as it is
  var parts = String(name || "").trim().split(/\s+/);
  return parts.length > 1 && /^[A-Za-z]/.test(parts[parts.length - 1]) ? parts[0] + " " + parts[parts.length - 1][0].toUpperCase() + "." : parts.join(" ");
}
function crewCountHTML(count, names, rest) { // "<b><i>Three</i></b> others are going!", the names (one per line) behind the number
  CREWCOUNT_SEQ += 1;
  var n = NUMBER_WORDS[count] || String(count);
  return '<button type="button" class="crew-count" data-crew-count aria-expanded="false" aria-controls="crew-count-' + CREWCOUNT_SEQ + '" aria-label="' +
    esc(n + " others: " + names.replace(/\n/g, ", ")) + '" data-names="' + esc(names) + '"><b><i>' + esc(n) + "</i></b></button>" + rest +
    '<span class="crew-count-names" id="crew-count-' + CREWCOUNT_SEQ + '" hidden>' + esc(names) + "</span>";
}
function othersHTML(people, verb) { // "Jordan Reyes is interested!" or "<b><i>Three</i></b> others are interested!"
  var day = function (p) { return verb === "going" && p.date ? goingDay(p.date) : ""; };
  if (people.length === 1) return esc(people[0].name) + " is " + verb + (day(people[0]) ? " " + esc(day(people[0])) : "") + "!";
  return crewCountHTML(people.length, people.map(function (p) { return p.name + (day(p) ? " (" + day(p) + ")" : ""); }).join("\n"), " others are " + verb + "!");
}
function crewLineHTML(people) {
  var you = people.filter(function (p) { return p.you; })[0], others = people.filter(function (p) { return !p.you; });
  var going = others.filter(function (p) { return p.status === "going"; }), interested = others.filter(function (p) { return p.status !== "going"; });
  var parts = [];
  if (you && you.status === "going") parts.push("You’re going" + (you.date ? " " + esc(goingDay(you.date)) : "") + ".");
  if (going.length) parts.push(othersHTML(going, "going"));
  if (interested.length) parts.push(othersHTML(interested, "interested"));
  if (you && you.status !== "going") {
    parts.push(interested.length ? "You are too." : going.length ? "You’re interested." : "Only you are interested in this…for now.");
  }
  return parts.join(" ");
}
// CC-93: who from the crew has been, under the plans line (never you). CC-120: in plain words, with how many
// added a photo that's been approved: "Jordan Reyes has been, with a photo." or "Three others have been, 1 with a photo."
function beenLineHTML(been) {
  been = been || [];
  if (!been.length) return "";
  var photos = been.filter(function (b) { return b.approved; }).length;
  if (been.length === 1) return esc(been[0].name) + " has been" + (photos ? ", with a photo" : "") + ".";
  return crewCountHTML(been.length, been.map(function (b) { return b.name + (b.approved ? " (photo)" : ""); }).join("\n"),
    " others have been" + (photos ? ", " + photos + " with a photo" : "") + ".");
}
// CC-145: each plan is an event row (CC-140) with its tile, opening the event page (and the tile grows into its poster,
// CC-144). Who's in sits under it: their dots, the ink dolphin if anyone's going (the lake one if they're only
// interested), and the line in words. The count buttons can't sit inside a link, so the row's link is the tile, name,
// venue and dates, and the lines follow it.
var CREW_PLAN_DOTS = 4;
function crewPlansHTML(c) {
  if (!c.plans.length) return '<p class="crew-none">No plans shared yet. Use “Invite your Crew?” on an event you’re interested in.</p>';
  return '<ul class="crew-plans">' + c.plans.map(function (row) {
    var e = toEvent(row.event), id = esc(e.id), going = row.people.some(function (p) { return p.status === "going"; });
    return '<li class="crew-plan"><a class="crew-plan-a" href="#e/' + id + '" data-ev-open="' + id + '">' +
      '<span class="tile water-field' + catClass(e.type) + '">' + waterHTML(e, "tile") + '<span class="tile-k">' + esc(e.label) + "</span></span>" +
      '<span class="listing-t">' + esc(e.title) + '</span><span class="crew-plan-where">' + esc(placeText(e)) + "</span>" +
      '<span class="crew-plan-when">' + esc(dateText(e)) + "</span></a>" +
      (row.people.length ? '<p class="crew-line"><span class="dots" aria-hidden="true">' + row.people.slice(0, CREW_PLAN_DOTS).map(function (p) {
        return crewDotHTML(p.name);
      }).join("") + "</span>" + markHTML(going ? "going" : "interested") + "<span>" + crewLineHTML(row.people) + "</span></p>" : "") +
      ((row.been || []).length ? '<p class="crew-line crew-been"><span>' + beenLineHTML(row.been) + "</span></p>" : "") + "</li>"; // CC-93
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

// CC-145: joining slides your dot in (320ms), in the crew's row and its members, once the crew you joined is drawn.
// Opening a crew is instant. With reduced motion, the dot is just there.
var CREW_JOINED = null;
function crewJoinedMotion() {
  if (CREW_JOINED === null) return;
  var dots = document.querySelectorAll('[data-crew-card="' + CREW_JOINED + '"] .face[data-you]');
  if (!dots.length) return; // the list hasn't loaded it yet
  CREW_JOINED = null;
  if (!motionOK() || !dots[0].animate) return;
  Array.prototype.forEach.call(dots, function (d) {
    d.animate([{ transform: "translateX(-18px)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 320, easing: "cubic-bezier(.2,.8,.2,1)" });
  });
}
function paintCrews() {
  if (CREW_OPEN === null && crewOpenSaved() === null && CREWS.length === 1) CREW_OPEN = String(CREWS[0].id); // a lone crew starts open
  $("crews-n").textContent = CREWS.length ? plural(CREWS.length, "crew", "crews") : "No crews yet";
  $("crew-list").innerHTML = CREWS.length ? CREWS.map(crewHTML).join("") :
    '<p class="crews-empty">Start one for the friends you see shows with, then send them an invite link. Or ask a friend for theirs.</p>';
  paintWater($("crew-list"));
  crewJoinedMotion();
}
// An action that didn't go through: the band in the part of Manage crew it came from (else at the top), and its buttons back
function crewFail(card, res, b) {
  var part = b && b.closest(".crew-mg-part"), err = part && part.querySelector("[data-crew-err]");
  (err || $("crews-status")).textContent = checkThis(errorText(res));
  Array.prototype.forEach.call(card ? card.querySelectorAll("button") : [], function (x) { x.disabled = false; });
}
$("crew-list").addEventListener("click", function (ev) {
  var b = ev.target.closest("[data-crew-act]"); if (!b) return;
  var act = b.getAttribute("data-crew-act"), c = crewById(b.getAttribute("data-crew")), card = b.closest("[data-crew-card]");
  if (!c) return;
  var user = b.getAttribute("data-user"), who = user && c.members.filter(function (m) { return m.user_id === user; })[0];
  var refocus = '[data-crew-card="' + c.id + '"] [data-crew-act="manage"]';
  if (act === "open") { setCrewOpen(CREW_OPEN === String(c.id) ? null : c.id); CREW_ASK = null; CREW_EDIT = null; paintCrews(); $("crew-h-" + c.id).focus(); return; }
  if (act === "manage") {
    CREW_MANAGE = CREW_MANAGE === String(c.id) ? null : String(c.id); CREW_ASK = null; CREW_EDIT = null; paintCrews();
    document.querySelector('[data-crew-card="' + c.id + '"] [data-crew-act="manage"]').focus(); return;
  }
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
    }, function () {
      var err = b.closest(".crew-mg-part").querySelector("[data-crew-err]");
      err.textContent = checkThis("Couldn't make the QR code. " + (CREW_SHARE ? "Share" : "Copy") + " the link instead.");
    });
    return;
  }
  if (act === "copy" || act === "share") {
    var input = $("crew-link-" + c.id), said = $("crew-copied-" + c.id);
    var fallback = function () { input.focus(); input.select(); said.textContent = "Copy the link above."; };
    if (act === "share") { // the phone's share sheet; the person picks where it goes
      navigator.share({ title: "Join " + c.name + " on Culture Crew", url: input.value }).then(function () { said.textContent = "Shared."; },
        function (err) { if (!err || err.name !== "AbortError") fallback(); });
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(input.value).then(function () { said.textContent = "Link copied."; }, fallback);
    else fallback();
    return;
  }
  if (act === "cancel-email") {
    b.disabled = true;
    api("/crews/" + c.id + "/email-invites/" + b.getAttribute("data-invite"), { method: "DELETE" }).then(function (r) {
      if (!r.ok && r.status !== 404) return readJSON(r).then(function (res) { crewFail(card, res, b); });
      loadCrews('[data-crew-card="' + c.id + '"] [data-crew-email] input').then(function () { $("edit-live").textContent = "Cancelled that invite."; });
    }, function () { crewFail(card, null, b); });
    return;
  }
  // the ones that need a "yes" first
  var asks = { leave: "Leave " + c.name + "? You'd need a new invite link to come back.", delete: "Dissolve " + c.name + " for everyone? This can't be undone.",
    remove: who && "Remove " + who.name + " from " + c.name + "?", owner: who && "Make " + who.name + " the crew leader? You'll stay a member, and they'll lead the crew." };
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
    if (!res.ok) { crewFail(card, res, b); return; }
    CREW_ASK = null;
    if (act === "invite") {
      CREW_LINKS[c.id] = res.body;
      return loadCrews('#crew-link-' + c.id).then(function () { $("edit-live").textContent = "Invite link made. " + (CREW_SHARE ? "Share" : "Copy") + " it and send it to whoever you'd like to join."; });
    }
    var said = act === "revoke" ? "Turned off that invite link." : confirmed === "leave" ? "You left " + c.name + "." :
      confirmed === "delete" ? "Dissolved " + c.name + "." : confirmed === "remove" ? "Removed " + who.name + "." : who.name + " is now the crew leader.";
    if (confirmed === "leave" || confirmed === "delete") delete CREW_LINKS[c.id];
    if (act === "revoke" && CREW_LINKS[c.id] && String(CREW_LINKS[c.id].id) === b.getAttribute("data-invite")) delete CREW_LINKS[c.id]; // the box showed it: it's off now
    loadCrews(confirmed === "leave" || confirmed === "delete" ? "#crews-title" : '[data-crew-card="' + c.id + '"] [data-crew-act="invite"]')
      .then(function () { $("edit-live").textContent = said; });
  }, function () { crewFail(card, null, b); });
});
$("crew-list").addEventListener("submit", function (ev) {
  var form = ev.target.closest("[data-crew-form]"); if (!form) return;
  ev.preventDefault();
  var id = form.getAttribute("data-crew-form"), input = $("crew-ename-" + id), name = input.value.trim(), err = form.querySelector(".form-error");
  if (!name) { err.textContent = checkThis("Give the crew a name."); crewMarkInvalid(input, true); input.focus(); return; }
  api("/crews/" + id, { method: "PATCH", body: { name: name, description: $("crew-edesc-" + id).value.trim() } }).then(readJSON).then(function (res) {
    if (!res.ok) { err.textContent = checkThis(errorText(res)); return; }
    CREW_EDIT = null; loadCrews('#crew-h-' + id).then(function () { $("edit-live").textContent = "Saved " + name + "."; });
  }, function () { err.textContent = checkThis(errorText(null)); });
});
$("crew-list").addEventListener("submit", function (ev) { // CC-59: invite by email
  var form = ev.target.closest("[data-crew-email]"); if (!form) return;
  ev.preventDefault();
  var id = form.getAttribute("data-crew-email"), input = form.querySelector("input"), err = form.querySelector(".form-error"), btn = form.querySelector("button");
  var email = input.value.trim();
  err.textContent = "";
  if (!looksLikeEmail(email)) { err.textContent = checkThis("Enter their email address, like name@example.com."); crewMarkInvalid(input, true); input.focus(); return; }
  btn.disabled = true;
  api("/crews/" + id + "/email-invites", { method: "POST", body: { email: email } }).then(readJSON).then(function (res) {
    btn.disabled = false;
    if (!res.ok) { err.textContent = checkThis(errorText(res)); crewMarkInvalid(input, res.status === 422); return; }
    loadCrews('[data-crew-email="' + id + '"] input').then(function () {
      var m = document.querySelector('[data-crew-email="' + id + '"] .hint');
      if (m) m.textContent = res.body.message; $("edit-live").textContent = res.body.message;
    });
  }, function () { btn.disabled = false; err.textContent = checkThis(errorText(null)); });
});
$("crew-new").addEventListener("submit", function (ev) {
  ev.preventDefault();
  var name = $("crew-name").value.trim(), err = $("crew-new-error");
  if (!name) { err.textContent = checkThis("Give the crew a name."); crewMarkInvalid($("crew-name"), true); $("crew-name").focus(); return; }
  err.textContent = "";
  api("/crews", { method: "POST", body: { name: name, description: $("crew-desc").value.trim() } }).then(readJSON).then(function (res) {
    if (!res.ok) { err.textContent = checkThis(errorText(res)); return; }
    setCrewOpen(res.body.id); CREW_MANAGE = String(res.body.id); // CC-120: open, with its invites showing
    $("crew-name").value = ""; $("crew-desc").value = ""; $("crew-new").hidden = true; $("crew-start-btn").setAttribute("aria-expanded", "false");
    loadCrews('[data-crew-card="' + res.body.id + '"] [data-crew-act="invite"]').then(function () {
      $("edit-live").textContent = "Started " + res.body.name + ". Make an invite link to bring people in.";
    });
  }, function () { err.textContent = checkThis(errorText(null)); });
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
    if (!res.ok) { b.disabled = false; $("join-error").textContent = checkThis(errorText(res)); return; }
    var name = res.body.name; JOIN = null; paintJoin(); setCrewOpen(res.body.id); CREW_JOINED = String(res.body.id); // CC-120; CC-145: your dot slides in
    openCrews(); loadCrews('#crew-h-' + res.body.id).then(function () { $("edit-live").textContent = "You joined " + name + "."; }); // CC-104
  }, function () { b.disabled = false; $("join-error").textContent = checkThis(errorText(null)); });
});
$("join-no").addEventListener("click", function () { JOIN = null; paintJoin(); $("account-title").focus(); });

// ---------- "Invite your Crew?" on an event card (CC-75) ----------
// Once you have a plan for an event and you're in a crew, the card offers "Invite your Crew?": a checkbox per
// crew. Only the crews you tick see it; changing the plan keeps them; clearing it, or "I've been", unshares it.
var CREWSHARE_SEQ = 0;
function crewShareToggleHTML(e, label) { // label: what it says before it's shared (My week: "Tell a crew", CC-146)
  var mine = MYPLANS[e.id];
  if (!mine || !CREWS.length) return "";
  CREWSHARE_SEQ += 1;
  var n = (mine.crews || []).length;
  return '<button type="button" class="went" data-crewshare-toggle="' + esc(e.id) + '" aria-expanded="false" aria-controls="crewshare-' + CREWSHARE_SEQ + '">' +
    (n ? "Shared with " + plural(n, "crew", "crews") : label || "Invite your Crew?") + "</button>";
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
    if (visible("crews")) loadCrews();
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
// Someone invited your email address to a crew. Once you're signed in, a notice on Home says so, with Accept and
// Decline (CC-106: only on Home); the same requests sit under "Waiting for you" on Crews, and your name in the
// header shows how many, until answered.
var PENDING = [], PENDING_LATER = false; // "Later" hides the notice until the next sign-in
function loadPending(fresh) {
  if (!AUTH.user) return Promise.resolve();
  if (fresh) PENDING_LATER = false;
  return api("/crews/pending").then(readJSON).then(function (res) { if (res.ok) { PENDING = res.body; paintPending(); } }, function () {});
}
function pendingItemHTML(p, where) {
  var id = esc(p.id);
  return '<div class="pending" data-pending="' + id + '"><p>' + (where === "list" ? crewDotHTML(p.invited_by) : "") + "<span><strong>" + esc(shortName(p.invited_by)) + "</strong> invited you to <strong>" + esc(p.crew_name) +
    "</strong>" + (p.description ? " \u00b7 " + esc(p.description) : "") + ' <span class="hint small">(' + plural(p.members, "member", "members") + ")</span>" +
    (p.full ? ' <span class="hint small">It\u2019s full right now.</span>' : "") + "</span></p>" +
    '<div class="row">' + (p.full ? "" : '<button class="btn" type="button" data-pending-act="accept" data-pending-id="' + id + '" aria-label="Accept the invite to ' + esc(p.crew_name) + '">Accept</button>') +
    '<button class="btn ghost" type="button" data-pending-act="decline" data-pending-id="' + id + '" aria-label="Decline the invite to ' + esc(p.crew_name) + '">Decline</button>' +
    "</div></div>";
}
function paintPending() {
  // CC-91: the admin's offer to approve photos waits here too, before the crew invites (approvals.js)
  var offer = AUTH.user && AUTH.user.approver_offered ? [approverOfferHTML()] : [];
  var n = AUTH.user ? PENDING.length + offer.length : 0;
  $("crews-count").textContent = $("account-count").textContent = n ? String(n) : ""; // on your name, and on Crews in its menu (CC-105)
  $("pending-invites").hidden = !n;
  $("pending-invites").innerHTML = n ? '<h2 id="pending-title">Waiting for you</h2>' + offer.join("") + PENDING.map(function (p) { return pendingItemHTML(p, "list"); }).join("") : "";
  var banner = $("invite-banner");
  banner.hidden = !n || PENDING_LATER || !visible("home"); // CC-106: the notice is on Home only; Crews lists them under "Waiting for you"
  banner.innerHTML = banner.hidden ? "" : offer.concat(PENDING.map(function (p) { return pendingItemHTML(p, "banner"); })).slice(0, 2).join("") +
    '<p class="small">' + (n > 2 ? "And " + plural(n - 2, "more invite", "more invites") + " on " : "Also on ") +
    '<button class="textbtn" type="button" data-go="crews">Your crews</button>. <button class="textbtn" type="button" data-pending-act="later">Not now</button></p>';
}
document.addEventListener("click", function (ev) {
  var b = ev.target.closest("[data-pending-act]"); if (!b) return;
  var act = b.getAttribute("data-pending-act");
  if (act === "later") { PENDING_LATER = true; paintPending(); (document.querySelector("main h1:not([hidden])") || $("brand")).focus(); return; }
  var id = b.getAttribute("data-pending-id"), p = PENDING.filter(function (x) { return String(x.id) === id; })[0], fromBanner = !!b.closest("#invite-banner");
  b.disabled = true;
  api("/crews/pending/" + id + "/" + act, { method: "POST" }).then(readJSON).then(function (res) {
    if (!res.ok && res.status !== 404) { b.disabled = false; $("crews-status").textContent = checkThis(errorText(res)); return; }
    PENDING = PENDING.filter(function (x) { return String(x.id) !== id; }); paintPending();
    if (act === "accept" && res.ok) { setCrewOpen(res.body.id); CREW_JOINED = String(res.body.id); } // CC-120: the crew you just joined opens, and your dot slides in (CC-145)
    var said = act === "accept" ? (res.ok ? "You joined " + p.crew_name + "." : "That invite has expired or was cancelled.") : "Declined the invite to " + p.crew_name + ".";
    $("edit-live").textContent = said;
    if (fromBanner && act === "accept" && res.ok) { openCrews(said); loadCrews().then(buildCrewFilter); return; } // focus: the page heading
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
// CC-139: the lake dolphin from the page's own drawing (#dolphin-art), as a standalone SVG image for the canvas. The
// page's CSS doesn't reach inside an image, so its colours are written in (light theme, as the code is always on white).
function qrDolphinSrc() {
  var css = ".dol-edge{fill:none;stroke:#0E2A40;stroke-width:1.8;stroke-linejoin:round}.dol-body{fill:#9CD3EF}.dol-belly{fill:#DCF0F9}" +
    ".dol-mouth{fill:none;stroke:#0E2A40;stroke-width:1;stroke-linecap:round}.dol-eye,.dol-glint{fill:#fff}.dol-pupil{fill:#0E2A40}";
  var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="4.59 4.58 94.67 62.36" width="400" height="264"><style>' + css + "</style>" +
    "<defs>" + $("dolphin-clip").outerHTML + '</defs><g transform="rotate(-21 50 28)">' + $("dolphin-art").innerHTML + "</g></svg>";
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}
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
        var pw = badge * 0.86, ph = pw * 264 / 400; g.drawImage(dolphin, (size - pw) / 2, (size - ph) / 2, pw, ph);
        resolve(canvas.toDataURL("image/png"));
      } catch (e) { reject(e); }
    }
    if (QR_DOLPHIN && QR_DOLPHIN.complete) { draw(); return; }
    dolphin.onload = function () { QR_DOLPHIN = dolphin; draw(); }; dolphin.onerror = reject; dolphin.src = qrDolphinSrc();
  });
}
