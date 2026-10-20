// Culture Crew site: the theme button and talking to the API (sign-in, tokens, errors).
// Loaded by index.html in order (core, util, catalog, planner, account, submit, admin, found, start); they share one
// global scope, so anything declared here is visible to the files after it.
"use strict";
// ---------- light/dark switch (CC-49) ----------
// The theme itself is set in <head> before the page paints; this is just the button.
(function () {
  var btn = document.getElementById("theme-toggle");
  function label() {
    var next = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
    btn.setAttribute("aria-label", "Switch to " + next + " theme"); btn.title = "Switch to " + next + " theme";
  }
  btn.addEventListener("click", function () {
    var t = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", t);
    try { localStorage.setItem("cc_theme", t); } catch (e) {} // blocked storage: it works until the page is closed
    label();
  });
  label();
})();

// ---------- talking to the API ----------
// The access token lives only in this variable (never localStorage), so other scripts on the
// page can't lift it from storage. The refresh token is an HttpOnly cookie the API sets on
// /auth/*; the browser sends it, but this code can't read it.
var API = (function () {
  var meta = document.querySelector('meta[name="cc-api"]');
  if (meta && meta.content) return meta.content.replace(/\/$/, "");
  var h = location.hostname;
  if (!h || h === "localhost" || h === "127.0.0.1") return "http://" + (h || "localhost") + ":8000";
  return "https://api." + h.replace(/^www\./, "");
})();
var AUTH = { token: null, user: null, refreshing: null, onChange: null };

function setSession(body) {
  var before = AUTH.user ? AUTH.user.id + AUTH.user.role : "";
  AUTH.token = body ? body.access_token : null;
  AUTH.user = body ? body.user : null;
  var after = AUTH.user ? AUTH.user.id + AUTH.user.role : "";
  // A hint (not a credential) so visitors who never signed in skip the refresh call on load.
  try { if (body) localStorage.setItem("cc_signed_in", "1"); else localStorage.removeItem("cc_signed_in"); } catch (e) {}
  if (before !== after && AUTH.onChange) AUTH.onChange();
}
function maybeSignedIn() {
  try { return localStorage.getItem("cc_signed_in") === "1"; } catch (e) { return true; } // storage blocked: just try
}
// One refresh at a time: requests that hit 401 together all wait on the same call.
function refreshSession() {
  if (!AUTH.refreshing) {
    AUTH.refreshing = fetch(API + "/auth/refresh", { method: "POST", credentials: "include" })
      .then(function (r) { return r.ok ? r.json() : null; }, function () { return null; })
      .then(function (body) { AUTH.refreshing = null; setSession(body); return !!body; });
  }
  return AUTH.refreshing;
}
// fetch() for the API: sends the access token, and on a 401 refreshes once and retries.
function api(path, opts) {
  opts = opts || {};
  function send() {
    var headers = {};
    if (opts.body !== undefined) headers["Content-Type"] = "application/json";
    if (AUTH.token) headers.Authorization = "Bearer " + AUTH.token;
    return fetch(API + path, { method: opts.method || "GET", headers: headers, credentials: opts.cookies ? "include" : "omit",
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
  }
  return send().then(function (r) {
    // Sign-in and sign-up send cookies and answer 401 for a wrong password, so they never retry;
    // cookie requests that only 401 when the sign-in has expired opt in with refreshable.
    if (r.status !== 401 || !AUTH.token || (opts.cookies && !opts.refreshable)) return r;
    return refreshSession().then(function (ok) { return ok ? send() : r; });
  });
}
// Response -> { ok, status, body }, never rejecting on a non-JSON body.
function readJSON(r) {
  return r.json().catch(function () { return null; }).then(function (body) { return { ok: r.ok, status: r.status, body: body }; });
}
var FIELD_NAMES = { email: "Email", password: "Password", display_name: "Name", title: "Event name", url: "Link",
  begin_date: "Opens", end_date: "Closes", cost_text: "Price", min_price: "Price", name: "Venue", neighborhood: "Neighborhood" };
function errorText(res) {
  if (!res) return "Couldn't reach Culture Crew. Check your connection and try again.";
  var d = res.body && res.body.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d) && d.length) {
    var field = d[0].loc ? d[0].loc[d[0].loc.length - 1] : "";
    var msg = String(d[0].msg || "").replace(/^Value error, /, "");
    return (FIELD_NAMES[field] ? FIELD_NAMES[field] + ": " : "") + msg.charAt(0).toUpperCase() + msg.slice(1) + ".";
  }
  if (res.status === 429) return "Too many tries. Wait a minute and try again.";
  return "Something went wrong (error " + res.status + "). Try again.";
}

// ---------- counting visits (CC-68) ----------
// No cookies. The browser keeps a random ID (localStorage) so the Stats page can tell new visitors from
// returning ones; the footer says so and lets people turn it off. Nothing is sent when the browser asks
// not to be tracked (Global Privacy Control), when counting is off, or for admins' own visits.
var COUNTING = (function () {
  var gpc = navigator.globalPrivacyControl === true, off = gpc, vid = null;
  try { off = off || localStorage.getItem("cc_count") === "off"; } catch (e) {}
  return { gpc: gpc, off: off, vid: vid };
})();
var COUNT_READY = null; // start.js sets this to the sign-in check, so admins' visits are known before counting
function visitorId() {
  if (COUNTING.vid) return COUNTING.vid;
  try {
    var v = localStorage.getItem("cc_vid");
    if (!v) {
      v = window.crypto && crypto.randomUUID ? crypto.randomUUID() :
        Array.prototype.map.call(crypto.getRandomValues(new Uint8Array(16)), function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
      localStorage.setItem("cc_vid", v);
    }
    COUNTING.vid = v;
  } catch (e) { COUNTING.vid = null; } // storage blocked: counted for the day only
  return COUNTING.vid;
}
function track(kind, view) {
  Promise.resolve().then(function () { return COUNT_READY; }).then(function () {
    if (COUNTING.off || (AUTH.user && AUTH.user.role === "admin")) return;
    // text/plain keeps this a "simple" request (no preflight); keepalive lets it finish as a link opens
    return fetch(API + "/traffic", { method: "POST", credentials: "omit", keepalive: true, headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ kind: kind, view: view || "", vid: visitorId() }) });
  }).catch(function () {});
}
function setCounting(on) {
  COUNTING.off = !on;
  try {
    if (on) localStorage.removeItem("cc_count");
    else { localStorage.setItem("cc_count", "off"); localStorage.removeItem("cc_vid"); COUNTING.vid = null; }
  } catch (e) {}
}
