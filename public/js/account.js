// Culture Crew site: Signing in, your plans, "I've been", the account page, profile, email links and passwords.
// Loaded by index.html in order (core, util, catalog, planner, account, crews, submit, admin, hours, found, start); they share one
// global scope, so anything declared here is visible to the files after it.
"use strict";
// ---------- signed-in state ----------
function isAdmin() { return !!AUTH.user && AUTH.user.role === "admin"; }
function visible(name) { return !$("view-" + name).hidden; }
function rerenderLists() {
  renderHome();
  if (visible("catalog")) paintCatalog();
  if (visible("account")) renderAccount();
}
function onAuthChange() {
  $("nav-account").textContent = AUTH.user ? "Your account" : "Sign in";
  $("nav-review").hidden = !isAdmin();
  WENT = {}; WENT_LIST = []; MYPLANS = {}; MYPLAN_LIST = [];
  if (!AUTH.user) {
    NOTICE_SET = false; $("account-notice").textContent = "";
    if (visible("review") || visible("venues") || visible("stats") || visible("sources") || visible("found")) show("home");
    if (visible("submit")) renderSubmit();
    CREWS = []; buildCrewFilter();
    rerenderLists();
    return;
  }
  if (isAdmin()) updateReviewCount();
  if (visible("account")) renderAccount(true);
  if (visible("submit")) renderSubmit();
  if (visible("review")) renderReview();
  rerenderLists();
  loadWent(); loadMyPlans().then(rerenderLists);
  loadCrews().then(function () { buildCrewFilter(); rerenderLists(); }); // crews to share plans with (CC-75)
}
function loadWent() {
  return api("/me/attended").then(readJSON).then(function (res) {
    if (!res.ok) return;
    WENT = {}; WENT_LIST = res.body.map(function (row) { return toEvent(row.event); });
    WENT_LIST.forEach(function (e) { WENT[e.id] = true; });
    rerenderLists();
  }, function () {});
}
function reloadEvents() { // something was published: fresh counts, home list and catalog page
  PLAN_RANGE = null;
  return api("/events/facets?today=" + isoDate(T)).then(readJSON).then(function (res) {
    if (!res.ok) return;
    setFacets(res.body); buildCatalogControls(); renderHome(); loadHome();
    if (visible("catalog")) loadCatalog();
  }, function () {});
}
document.addEventListener("click", function (ev) {
  var b = ev.target.closest("[data-went]"); if (!b || !AUTH.user) return;
  var id = b.getAttribute("data-went"), on = !WENT[id];
  b.disabled = true;
  api("/me/attended/" + encodeURIComponent(id), { method: on ? "PUT" : "DELETE" }).then(function (r) {
    if (!r.ok) throw new Error(r.status);
    if (on) { WENT[id] = true; if (KNOWN[id]) WENT_LIST.unshift(KNOWN[id]); }
    else { delete WENT[id]; WENT_LIST = WENT_LIST.filter(function (e) { return e.id !== id; }); }
    if (on && MYPLANS[id]) { // been: the server cleared the plan, so the card moves from plans to gone (CC-63)
      delete MYPLANS[id];
      $("myplan-live").textContent = "Moved to places you've gone: " + KNOWN[id].title;
    }
    // Redraw every copy of the card (home, catalog and account can all show it): marking it also takes
    // away the plan button, and un-marking brings it back.
    return redrawCards(id, b.closest("[data-card]"), "[data-went]");
  }).catch(function () { b.disabled = false; });
});

// ---------- your plans (CC-55) ----------
function loadMyPlans() {
  return api("/me/plans").then(readJSON).then(function (res) {
    if (!res.ok) return;
    MYPLANS = {}; MYPLAN_LIST = res.body.map(function (row) {
      var e = toEvent(row.event); MYPLANS[e.id] = { status: row.status, date: row.date, crews: row.crews || [] }; return e;
    });
  }, function () {});
}
function myplanSaid(mine) {
  return !mine ? "Plan cleared" : mine.status === "going" ? "Going on " + dayName(parseISO(mine.date)) : "Marked interested";
}
// Redraw every copy of this event's card (home, catalog and account can all show it), then put focus back
// on the same card's plan button (or focusOn), on the card in "places you've gone" if "I've been" moved
// it there, or on the plans heading if the card left that list.
// An owner's plans are the public picks (CC-66): after one changes, get the event's pick again first.
function refreshPick(id) {
  if (!AUTH.user || !AUTH.user.dolphins || !KNOWN[id]) return Promise.resolve();
  return api("/events/lookup?ids=" + encodeURIComponent(id)).then(readJSON).then(function (res) {
    if (res.ok && res.body[0]) KNOWN[id].pick = fromApi(res.body[0]).pick; // the same object every list holds
  }, function () {});
}
function redrawCards(id, from, focusOn) {
  return refreshPick(id).then(function () { return redrawCardsNow(id, from, focusOn); });
}
function redrawCardsNow(id, from, focusOn) {
  var list = from && from.parentElement.closest("[id]"), listId = list ? list.id : null; // the grid this card was in
  Array.prototype.forEach.call(document.querySelectorAll('[data-card="' + id + '"]'), function (c) { c.outerHTML = cardHTML(KNOWN[id]); });
  return loadMyPlans().then(function () {
    if (visible("account")) renderAccount();
    var card = listId && $(listId) ? $(listId).querySelector('[data-card="' + id + '"]') : null;
    if (!card && listId === "myplans-grid" && WENT[id]) card = $("went-grid").querySelector('[data-card="' + id + '"]');
    var target = card ? card.querySelector(focusOn || "[data-myplan-toggle]") : listId === "myplans-grid" ? $("myplans-title") : null;
    if (target) target.focus();
  });
}
function saveMyPlan(id, body, panel) {
  var card = panel.closest("[data-card]"), err = panel.querySelector(".form-error");
  var buttons = panel.querySelectorAll("button"); Array.prototype.forEach.call(buttons, function (b) { b.disabled = true; });
  err.textContent = "";
  var req = body ? api("/me/plans/" + encodeURIComponent(id) + "?today=" + isoDate(T), { method: "PUT", body: body })
                 : api("/me/plans/" + encodeURIComponent(id), { method: "DELETE" });
  req.then(readJSON).then(function (res) {
    if (!res.ok) throw res;
    if (body) MYPLANS[id] = { status: body.status, date: body.date || null, crews: (MYPLANS[id] && MYPLANS[id].crews) || [] }; else delete MYPLANS[id];
    $("myplan-live").textContent = myplanSaid(MYPLANS[id]) + ": " + KNOWN[id].title;
    return redrawCards(id, card);
  }).catch(function (res) {
    Array.prototype.forEach.call(buttons, function (b) { b.disabled = false; });
    err.textContent = res && res.status ? errorText(res) : "Couldn't save your plan. Check your connection and try again.";
  });
}
function closeMyPlan(toggle) {
  var panel = $(toggle.getAttribute("aria-controls"));
  toggle.setAttribute("aria-expanded", "false"); if (panel) panel.hidden = true;
}
document.addEventListener("click", function (ev) {
  // one picker open at a time: a click anywhere else closes it
  Array.prototype.forEach.call(document.querySelectorAll('[data-myplan-toggle][aria-expanded="true"]'), function (open) {
    var panel = $(open.getAttribute("aria-controls"));
    if (!open.contains(ev.target) && !(panel && panel.contains(ev.target))) closeMyPlan(open);
  });
  if (!AUTH.user) return;
  var t = ev.target.closest("[data-myplan-toggle],[data-myplan-set],[data-myplan-going],[data-myplan-clear]"); if (!t) return;
  if (t.hasAttribute("data-myplan-toggle")) {
    var open = t.getAttribute("aria-expanded") !== "true", panel = $(t.getAttribute("aria-controls"));
    t.setAttribute("aria-expanded", String(open)); panel.hidden = !open;
    if (open) panel.querySelector("button, input").focus();
    return;
  }
  var box = t.closest(".myplan");
  if (t.hasAttribute("data-myplan-set")) return saveMyPlan(t.getAttribute("data-myplan-set"), { status: "interested" }, box);
  if (t.hasAttribute("data-myplan-clear")) return saveMyPlan(t.getAttribute("data-myplan-clear"), null, box);
  var input = box.querySelector('input[type="date"]'), day = t.getAttribute("data-date") || (input && input.value);
  if (input && (!day || day < input.min || day > input.max)) {
    box.querySelector(".form-error").textContent = !day ? "Choose a date." :
      "Choose a date from " + goingDay(input.min) + " to " + goingDay(input.max) + ".";
    input.focus(); return;
  }
  saveMyPlan(t.getAttribute("data-myplan-going"), { status: "going", date: day }, box);
});
document.addEventListener("keydown", function (ev) { // Escape closes the picker and returns to its button
  if (ev.key !== "Escape") return;
  var box = ev.target.closest && ev.target.closest(".myplan"); if (!box) return;
  var toggle = document.querySelector('[aria-controls="' + box.id + '"]');
  if (toggle) { closeMyPlan(toggle); toggle.focus(); }
});

// ---------- account ----------
var NOTICE_SET = false; // a one-off message (e.g. "email confirmed") showing instead of the usual notice
function openAccount(notice) {
  NOTICE_SET = !!notice; $("account-notice").textContent = notice || "";
  renderAccount(true); show("account");
}
function renderAccount(withSubmissions) {
  var u = AUTH.user;
  $("signed-out").hidden = !!u; $("signed-in").hidden = !u;
  $("account-title").textContent = u ? (u.display_name ? "Hi, " + u.display_name : "Your account") : "Sign in";
  $("account-sub").textContent = u ? "Your plans, what you've been to, and how the events you've sent us are doing." :
    "Keep a list of what you've seen, and send us events we're missing.";
  paintJoin(); // an invite link's "Join <crew>" panel (crews.js), signed in or not
  if (!u) {
    $("myplans-grid").innerHTML = ""; $("went-grid").innerHTML = ""; $("my-submissions").innerHTML = "";
    CREWS = []; CREW_LINKS = {}; CREW_ASK = null; CREW_EDIT = null; $("crew-list").innerHTML = "";
    return;
  }
  $("account-who").textContent = "Signed in as " + u.email + (u.role === "admin" ? " · admin" : "");
  if (!u.email_verified && !NOTICE_SET) {
    $("account-notice").innerHTML = "Please confirm your email address: open the link we sent to " + esc(u.email) +
      '. <button class="textbtn" type="button" id="verify-resend">Send a new link</button>';
  } else if (u.email_verified && !NOTICE_SET) {
    $("account-notice").textContent = "";
  }
  $("myplans-grid").innerHTML = MYPLAN_LIST.length ? MYPLAN_LIST.map(cardHTML).join("") :
    '<p class="hint" style="grid-column:1/-1">Use "Interested?" on any event to mark it, or commit to the day you\'re going.</p>';
  $("went-grid").innerHTML = WENT_LIST.length ? WENT_LIST.map(cardHTML).join("") :
    '<p class="hint" style="grid-column:1/-1">Mark events with "I\'ve been" and they\'ll show up here.</p>';
  if (!withSubmissions) return;
  fillProfile();
  loadCrews();
  api("/me/submissions").then(readJSON).then(function (res) {
    if (!res.ok) return;
    var rows = res.body.map(fromApi);
    $("my-submissions").innerHTML = rows.length ? rows.map(function (e) { return queueItemHTML(e, stateHTML(e)); }).join("") :
      '<p class="hint">Nothing yet. <button class="textbtn" type="button" data-go="submit">Submit an event</button></p>';
  }, function () {});
}
// ---------- profile (CC-40) ----------
function fillProfile() {
  $("p-name").value = AUTH.user.display_name || ""; $("p-email").value = AUTH.user.email;
  $("p-password").value = ""; $("p-password-field").hidden = true; $("profile-error").textContent = ""; $("profile-msg").textContent = "";
  clearPasswordForm(); $("password-error").textContent = ""; $("password-msg").textContent = "";
}
function emailChanged() { return $("p-email").value.trim().toLowerCase() !== AUTH.user.email; }
$("profile-form").addEventListener("input", function () {
  $("profile-error").textContent = ""; $("profile-msg").textContent = "";
  $("p-password-field").hidden = !emailChanged();
});
$("profile-form").addEventListener("submit", function (ev) {
  ev.preventDefault();
  var err = $("profile-error"), msg = $("profile-msg"), email = $("p-email").value.trim();
  var body = { display_name: $("p-name").value.trim() };
  if (emailChanged()) {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { err.textContent = "Enter a full email address."; $("p-email").focus(); return; }
    if (!$("p-password").value) { err.textContent = "Enter your current password to change your email."; $("p-password").focus(); return; }
    body.email = email; body.current_password = $("p-password").value;
  }
  var btn = $("profile-btn"); btn.disabled = true; err.textContent = ""; msg.textContent = "Saving…";
  api("/auth/me", { method: "PATCH", body: body }).then(readJSON, function () { return null; }).then(function (res) {
    btn.disabled = false;
    if (!res || !res.ok) {
      msg.textContent = ""; err.textContent = errorText(res);
      if (res && res.status === 403) { $("p-password").value = ""; $("p-password").focus(); }
      else if (res && res.status === 409) $("p-email").focus();
      return;
    }
    AUTH.user = res.body;
    renderAccount(false); fillProfile();
    msg.textContent = "Saved.";
  });
});
// ---------- email links, forgotten passwords (CC-44) ----------
// Links arrive as #verify=TOKEN or #reset=TOKEN. The fragment never reaches a server; it's
// taken off the address bar straight away so it doesn't linger in history or get shared.
function takeLinkToken(prefix) {
  var h = (location.hash || "").replace(/^#/, "");
  if (h.indexOf(prefix + "=") !== 0) return null;
  try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
  return h.slice(prefix.length + 1);
}
// The link opens a page with a button rather than confirming straight away: mail scanners
// (Outlook, Gmail, Proofpoint…) open every link in an email, but they don't press buttons.
var VERIFY_TOKEN = null;
function openVerify(token) {
  VERIFY_TOKEN = token; $("verify-error").textContent = ""; $("verify-btn").disabled = false;
  show("verify", "verify-btn");
}
$("verify-btn").addEventListener("click", function () {
  if (!VERIFY_TOKEN) return;
  this.disabled = true; confirmEmail(VERIFY_TOKEN); VERIFY_TOKEN = null;
});
function confirmEmail(token) {
  openAccount("Confirming your email address…");
  api("/auth/verify-email", { method: "POST", body: { token: token } }).then(readJSON, function () { return null; }).then(function (res) {
    if (!res || !res.ok) {
      openAccount((res && res.status === 400 ? "That confirmation link has expired or was already used." : errorText(res)) +
        (AUTH.user ? " You can send a new one below." : " Sign in to send a new one."));
      return;
    }
    openAccount("Thanks! Your email address is confirmed.");
    if (AUTH.user && AUTH.user.id === res.body.id) { AUTH.user = res.body; renderAccount(false); }
  });
}
var RESET_TOKEN = null;
function openReset(token) {
  RESET_TOKEN = token;
  $("reset-form").reset(); $("reset-error").textContent = "";
  show("reset", "reset-new");
}
$("reset-form").addEventListener("input", function () { $("reset-error").textContent = ""; });
$("reset-form").addEventListener("submit", function (ev) {
  ev.preventDefault();
  var err = $("reset-error"), next = $("reset-new").value, again = $("reset-confirm").value;
  var bad = next.length < 8 ? ["reset-new", "Use a password of at least 8 characters."] :
    next !== again ? ["reset-confirm", "The two passwords don't match."] : null;
  if (bad) { err.textContent = bad[1]; $(bad[0]).focus(); return; }
  var btn = $("reset-btn"); btn.disabled = true;
  api("/auth/reset-password", { method: "POST", body: { token: RESET_TOKEN, new_password: next }, cookies: true })
    .then(readJSON, function () { return null; }).then(function (res) {
      btn.disabled = false;
      if (!res || !res.ok) {
        err.textContent = res && res.status === 400 ?
          "That reset link has expired or was already used. Ask for a new one from the sign-in page." : errorText(res);
        return;
      }
      RESET_TOKEN = null; $("reset-form").reset();
      setSession(res.body);
      openAccount("Your password has been changed and you're signed in. Any other devices have been signed out.");
    });
});
$("forgot-open").addEventListener("click", function () {
  var form = $("forgot-form"), open = form.hidden;
  form.hidden = !open; this.setAttribute("aria-expanded", String(open));
  if (open) { $("forgot-email").value = $("login-email").value.trim(); $("forgot-msg").textContent = ""; $("forgot-email").focus(); }
});
$("forgot-form").addEventListener("input", function () { $("forgot-error").textContent = ""; });
$("forgot-form").addEventListener("submit", function (ev) {
  ev.preventDefault();
  var email = $("forgot-email").value.trim(), err = $("forgot-error"), msg = $("forgot-msg");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { err.textContent = "Enter the email address you signed up with."; $("forgot-email").focus(); return; }
  var btn = $("forgot-btn"); btn.disabled = true; msg.textContent = "Sending…";
  api("/auth/forgot-password", { method: "POST", body: { email: email } }).then(readJSON, function () { return null; }).then(function (res) {
    btn.disabled = false;
    if (!res || !res.ok) { msg.textContent = ""; err.textContent = errorText(res); return; }
    msg.textContent = res.body.detail + " It expires in an hour.";
  });
});
var RESEND_WAIT = 60; // seconds before "Send again" can be used, so a slow email isn't sent five times
function resendButton(label) { return ' <button class="textbtn" type="button" id="verify-resend">' + label + "</button>"; }
function resendCooldown() {
  var b = $("verify-resend"), left = RESEND_WAIT; if (!b) return;
  b.disabled = true; b.textContent = "Send again (" + left + "s)";
  var t = setInterval(function () {
    var cur = $("verify-resend");
    if (!cur) { clearInterval(t); return; }
    left -= 1;
    if (left > 0) { cur.textContent = "Send again (" + left + "s)"; return; }
    clearInterval(t); cur.disabled = false; cur.textContent = "Send again";
  }, 1000);
}
$("account-notice").addEventListener("click", function (ev) {
  var b = ev.target.closest("#verify-resend"); if (!b) return;
  b.disabled = true;
  api("/auth/verify-email/send", { method: "POST" }).then(readJSON, function () { return null; }).then(function (res) {
    NOTICE_SET = true;
    if (res && res.ok) {
      $("account-notice").innerHTML = esc(res.body.detail) + " It can take a few minutes, so check your junk folder too. Didn't get it?" +
        resendButton("Send again");
      resendCooldown();
    } else if (res && res.status === 400) { // confirmed in the meantime (e.g. on another device)
      $("account-notice").textContent = errorText(res) + ".";
      if (AUTH.user) AUTH.user.email_verified = true;
    } else {
      $("account-notice").innerHTML = esc(errorText(res)) + resendButton("Try again");
    }
  });
});

// ---------- change password (CC-42) ----------
function clearPasswordForm() { ["pw-current", "pw-new", "pw-confirm"].forEach(function (id) { $(id).value = ""; }); }
$("password-form").addEventListener("input", function () { $("password-error").textContent = ""; $("password-msg").textContent = ""; });
$("password-form").addEventListener("submit", function (ev) {
  ev.preventDefault();
  var err = $("password-error"), msg = $("password-msg");
  var current = $("pw-current").value, next = $("pw-new").value, again = $("pw-confirm").value;
  var bad = !current ? ["pw-current", "Enter your current password."] :
    next.length < 8 ? ["pw-new", "Use a new password of at least 8 characters."] :
    next !== again ? ["pw-confirm", "The two new passwords don't match."] :
    next === current ? ["pw-new", "The new password is the same as the current one."] : null;
  if (bad) { err.textContent = bad[1]; $(bad[0]).focus(); return; }
  var btn = $("password-btn"); btn.disabled = true; err.textContent = ""; msg.textContent = "Changing…";
  api("/auth/password", { method: "POST", body: { current_password: current, new_password: next }, cookies: true, refreshable: true })
    .then(readJSON, function () { return null; }).then(function (res) {
      btn.disabled = false;
      if (!res || !res.ok) {
        msg.textContent = ""; err.textContent = errorText(res);
        if (res && res.status === 403) { $("pw-current").value = ""; $("pw-current").focus(); }
        return;
      }
      setSession(res.body); // this tab's new session; every other one has been signed out
      clearPasswordForm();
      msg.textContent = "Password changed. You're signed out on your other devices.";
    });
});
function authForm(form, path, body, errEl) {
  var btn = form.querySelector('button[type="submit"]');
  errEl.textContent = ""; btn.disabled = true;
  api(path, { method: "POST", body: body, cookies: true }).then(readJSON, function () { return null; }).then(function (res) {
    btn.disabled = false;
    if (!res || !res.ok) { errEl.textContent = errorText(res); return; }
    form.reset();
    setSession(res.body);
    renderAccount();
    $("account-title").focus();
  });
}
function looksLikeEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
$("login-form").addEventListener("submit", function (ev) {
  ev.preventDefault();
  var email = $("login-email").value.trim(), pw = $("login-password").value;
  if (!looksLikeEmail(email)) { $("login-error").textContent = "Enter the email you signed up with."; $("login-email").focus(); return; }
  if (!pw) { $("login-error").textContent = "Enter your password."; $("login-password").focus(); return; }
  authForm(this, "/auth/login", { email: email, password: pw }, $("login-error"));
});
$("register-form").addEventListener("submit", function (ev) {
  ev.preventDefault();
  var email = $("reg-email").value.trim(), pw = $("reg-password").value;
  if (!looksLikeEmail(email)) { $("register-error").textContent = "Enter a valid email address."; $("reg-email").focus(); return; }
  if (pw.length < 8) { $("register-error").textContent = "Use a password of at least 8 characters."; $("reg-password").focus(); return; }
  authForm(this, "/auth/register", { email: email, password: pw, display_name: $("reg-name").value.trim() }, $("register-error"));
});
["login", "register"].forEach(function (f) {
  $(f + "-form").addEventListener("input", function () { $(f + "-error").textContent = ""; });
});
$("sign-out").addEventListener("click", function () {
  var b = this; b.disabled = true;
  api("/auth/logout", { method: "POST", cookies: true }).catch(function () {}).then(function () {
    b.disabled = false; setSession(null); renderAccount(); $("account-title").focus();
  });
});
