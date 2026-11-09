// Culture Crew site: Site health (admins, CC-244), from Engagement. The API keeps its own numbers (cc-backend
// app/health.py): each request's route, status and time, and a check of the database each minute. This page shows
// them for the last hour, day, week or 30 days: is it answering, how fast, the database, and a pie of the non-200s.
"use strict";
var HEALTH = { hours: 24, req: 0, data: null };
var STATUS_WORDS = { 201: "Created", 204: "No content", 301: "Moved", 302: "Found", 304: "Not modified", 307: "Redirect", 400: "Bad request",
  401: "Not signed in", 403: "Not allowed", 404: "Not found", 405: "Wrong method", 409: "Conflict", 413: "Too large", 422: "Didn't validate",
  429: "Too many requests", 500: "Server error", 502: "Bad gateway", 503: "Unavailable", 504: "Timed out" };
var PIE_SLICES = 5; // the rest share a sixth, "Other", so the colours stay apart
function openHealth() { if (!isAdmin()) { openAccount(); return; } show("health"); loadHealth(); }
function loadHealth() {
  var req = ++HEALTH.req;
  $("health-status").textContent = "Loading…";
  api("/admin/health?hours=" + HEALTH.hours).then(readJSON).then(function (res) {
    if (req !== HEALTH.req) return;
    if (!res.ok) { $("health-status").textContent = errorText(res); return; }
    $("health-status").textContent = ""; HEALTH.data = res.body; paintHealth(res.body);
  }, function () { // the API itself didn't answer: that's the headline
    if (req !== HEALTH.req) return;
    $("health-live").hidden = true;
    $("health-status").textContent = "The API isn't answering right now. Try again in a minute.";
  });
}
function hlMs(v) { return v === null || v === undefined ? "–" : v < 1 ? "<1 ms" : v >= 1000 ? (v / 1000).toFixed(1) + " s" : Math.round(v) + " ms"; }
function hlCount(n) { return Number(n).toLocaleString("en-US"); }
function hlWhen(iso) {
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}
function hlSince(iso, now) { // "3 days", "5 hours", "12 minutes"
  var m = Math.max(0, Math.round((new Date(now) - new Date(iso)) / 60000));
  return m >= 2880 ? Math.floor(m / 1440) + " days" : m >= 120 ? Math.floor(m / 60) + " hours" : m === 1 ? "1 minute" : m + " minutes";
}
function hlWindow(h) { return h === 1 ? "the last hour" : h === 24 ? "the last 24 hours" : h === 168 ? "the last 7 days" : "the last 30 days"; }
function hlStat(label, value, small) { return "<div><dt>" + esc(label) + "</dt><dd>" + esc(value) + (small ? " <small>" + esc(small) + "</small>" : "") + "</dd></div>"; }
function hlStateText(o) {
  if (o.state === "healthy") return "Healthy: the API and the database are answering.";
  if (!o.db.ok || (o.db.last_failed_at && new Date(o.now) - new Date(o.db.last_failed_at) <= 15 * 60000)) return "Trouble: the database missed a check in the last 15 minutes.";
  return "Trouble: " + o.api.errors_last_15_min + " server " + (o.api.errors_last_15_min === 1 ? "error" : "errors") + " in the last 15 minutes.";
}
function paintHealth(o) {
  $("health-live").hidden = false;
  var st = $("hl-state"); st.textContent = hlStateText(o); st.classList.toggle("trouble", o.state !== "healthy");
  var a = o.api, rate = a.requests ? (100 * a.server_errors / a.requests) : 0;
  $("hl-api").innerHTML = hlStat("Up for", hlSince(a.started_at, o.now)) + hlStat("Requests", hlCount(a.requests), "in " + hlWindow(o.hours).replace("the last ", "")) +
    hlStat("Server errors", hlCount(a.server_errors), a.server_errors ? (rate < 0.1 ? "<0.1%" : rate.toFixed(1) + "%") : "");
  $("hl-errors").innerHTML = a.recent_errors.length ? a.recent_errors.map(function (e) {
    return '<li><span class="hl-route">' + esc(e.method + " " + e.route) + '</span><span class="hl-num">' + e.status + '</span><span class="hl-sub">' + esc(hlWhen(e.at) + " · " + hlMs(e.ms)) + "</span></li>";
  }).join("") : '<li><span class="hl-sub">None in ' + esc(hlWindow(o.hours)) + ".</span></li>";
  var t = o.timing;
  $("hl-times").innerHTML = hlStat("Average", hlMs(t.avg_ms)) + hlStat("Median", hlMs(t.p50_ms)) + hlStat("95th percentile", hlMs(t.p95_ms)) + hlStat("99th percentile", hlMs(t.p99_ms));
  $("hl-slow").innerHTML = t.slowest.length ? t.slowest.map(function (r) {
    return '<li><span class="hl-route">' + esc(r.method + " " + r.route) + '</span><span class="hl-num">' + esc(hlMs(r.avg_ms)) + '</span><span class="hl-sub">' +
      esc("average of " + hlCount(r.requests) + (r.requests === 1 ? " call" : " calls") + ", slowest " + hlMs(r.max_ms)) + "</span></li>";
  }).join("") : '<li><span class="hl-sub">No requests in ' + esc(hlWindow(o.hours)) + ".</span></li>";
  var d = o.db, upPct = d.checks ? (100 * (d.checks - d.failed) / d.checks) : null;
  $("hl-db").innerHTML = hlStat("Right now", d.ok ? "Answering" : "Not answering", d.ok ? hlMs(d.ms) : "") +
    hlStat("Checks answered", upPct === null ? "–" : (upPct === 100 ? "100" : upPct.toFixed(1)) + "%", hlCount(d.checks) + (d.checks === 1 ? " check" : " checks")) +
    hlStat("Average answer", hlMs(d.avg_ms)) + hlStat("Last missed", d.last_failed_at ? hlWhen(d.last_failed_at) : "Never", d.last_failed_at ? "" : "in 30 days");
  $("hl-pie").innerHTML = pieHTML(pieSlices(o.non_200), o.hours);
}

// ---------- the pie of non-200 responses ----------
function statusWords(code) { return STATUS_WORDS[code] || (code >= 500 ? "Server error" : code >= 400 ? "Client error" : code >= 300 ? "Redirect" : "Success"); }
function pieSlices(rows) { // most first; past five, the rest are one "Other" slice
  var total = rows.reduce(function (n, r) { return n + r.count; }, 0);
  var top = rows.slice(0, PIE_SLICES).map(function (r, i) { return { label: r.status + " " + statusWords(r.status), count: r.count, n: i + 1 }; });
  var rest = rows.slice(PIE_SLICES).reduce(function (n, r) { return n + r.count; }, 0);
  if (rest) top.push({ label: "Other", count: rest, n: 6 });
  top.forEach(function (s) { s.pct = total ? 100 * s.count / total : 0; });
  return { total: total, slices: top };
}
function piePoint(turn) { // 0 at twelve o'clock, going clockwise
  var a = 2 * Math.PI * turn - Math.PI / 2;
  return (90 + 86 * Math.cos(a)).toFixed(2) + " " + (90 + 86 * Math.sin(a)).toFixed(2);
}
function pieHTML(p, hours) {
  if (!p.total) return '<p class="hint">Every response in ' + esc(hlWindow(hours)) + " was a 200.</p>";
  var from = 0, label = "Pie chart of " + hlCount(p.total) + " responses other than 200 in " + hlWindow(hours) + ": " +
    p.slices.map(function (s) { return s.label + ", " + hlCount(s.count); }).join("; ") + ".";
  var paths = p.slices.map(function (s) {
    var to = from + s.count / p.total, d;
    d = s.count === p.total ? '<circle class="slice s' + s.n + '" cx="90" cy="90" r="86"/>' :
      '<path class="slice s' + s.n + '" d="M90 90 L' + piePoint(from) + " A86 86 0 " + (to - from > 0.5 ? 1 : 0) + " 1 " + piePoint(to) + ' Z"/>';
    from = to; return d;
  }).join("");
  var pct = function (v) { return v < 1 ? "<1%" : Math.round(v) + "%"; };
  return '<svg viewBox="0 0 180 180" role="img" aria-label="' + esc(label) + '">' + paths + "</svg>" +
    '<ul class="hl-key" aria-hidden="true">' + p.slices.map(function (s) {
      return '<li><i class="s' + s.n + '"></i><span>' + esc(s.label) + '</span><span class="hl-num">' + hlCount(s.count) + " · " + pct(s.pct) + "</span></li>";
    }).join("") + "</ul>";
}
document.addEventListener("click", function (ev) {
  var b = ev.target.closest("[data-hl-hours]"); if (!b) return;
  HEALTH.hours = Number(b.getAttribute("data-hl-hours"));
  Array.prototype.forEach.call(document.querySelectorAll("[data-hl-hours]"), function (x) {
    var on = x === b; x.setAttribute("aria-pressed", String(on)); x.classList.toggle("ghost", !on);
  });
  loadHealth();
});
