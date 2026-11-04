// Culture Crew site: The admin's Review menu and its group pages (CC-206): Event Sourcing, Engagement, and Venues and Members.
// The tools themselves stay on their own pages. These pages only say what's waiting and link to them.

// ---------- the Review menu ----------
// It works like the you menu (account.js): arrow keys, Home and End move through it; Escape or Tab closes it and
// returns to Review. On a phone it sits open in the masthead's sheet, as a plain list under "Review". The items are
// data-go links, so choosing one is handled with every other link; here it only closes the menu.
function rvItems() { return Array.prototype.slice.call($("rv-menu").querySelectorAll("[data-me]")); }
function paintRvMode() {
  var sheet = MAST_PHONE.matches, menu = $("rv-menu");
  $("nav-review").hidden = sheet; $("rv-head").hidden = !sheet;
  menu.setAttribute("role", sheet ? "group" : "menu");
  menu.setAttribute("aria-labelledby", sheet ? "rv-head" : "nav-review");
  rvItems().forEach(function (it) { // in the sheet each item is a plain button that Tab reaches
    if (sheet) { it.removeAttribute("role"); it.removeAttribute("tabindex"); } else { it.setAttribute("role", "menuitem"); it.setAttribute("tabindex", "-1"); }
  });
  menu.hidden = !sheet; $("nav-review").setAttribute("aria-expanded", "false");
}
MAST_PHONE.addEventListener("change", paintRvMode);
paintRvMode();
function openRvMenu(at) {
  $("rv-menu").hidden = false; $("nav-review").setAttribute("aria-expanded", "true");
  var items = rvItems(); items[at === "last" ? items.length - 1 : 0].focus();
}
function closeRvMenu(refocus) {
  if ($("rv-menu").hidden || MAST_PHONE.matches) return;
  $("rv-menu").hidden = true; $("nav-review").setAttribute("aria-expanded", "false");
  if (refocus) $("nav-review").focus();
}
$("nav-review").addEventListener("click", function () { if ($("rv-menu").hidden) openRvMenu(); else closeRvMenu(true); });
$("nav-review").addEventListener("keydown", function (ev) {
  if (ev.key === "ArrowDown" || ev.key === "ArrowUp") { ev.preventDefault(); openRvMenu(ev.key === "ArrowUp" ? "last" : "first"); }
});
$("rv-menu").addEventListener("keydown", function (ev) {
  if (MAST_PHONE.matches) return;
  var items = rvItems(), i = items.indexOf(document.activeElement);
  var to = ev.key === "ArrowDown" ? (i + 1) % items.length : ev.key === "ArrowUp" ? (i - 1 + items.length) % items.length :
    ev.key === "Home" ? 0 : ev.key === "End" ? items.length - 1 : -1;
  if (to >= 0) { ev.preventDefault(); items[to].focus(); return; }
  if (ev.key === "Escape") { ev.preventDefault(); closeRvMenu(true); }
  else if (ev.key === "Tab") closeRvMenu(false);
});
$("rv-menu").addEventListener("click", function (ev) { if (ev.target.closest("[data-me]")) closeRvMenu(false); });
document.addEventListener("click", function (ev) { if (!$("rv-wrap").contains(ev.target)) closeRvMenu(false); });

// New issues and photos waiting, added up for the menu
function paintEngagementCount() {
  var n = (Number($("issues-count").textContent) || 0) + (Number($("approvals-count").textContent) || 0);
  $("engagement-count").textContent = n ? String(n) : "";
}

// ---------- Engagement, and Venues and Members ----------
function openEngagement() { if (!isAdmin()) { openAccount(); return; } show("engagement"); updateIssuesCount(); updateApprovalsCount(); }
function openPeople() { if (!isAdmin()) { openAccount(); return; } show("people"); }

// ---------- Event Sourcing ----------
// The numbers are the weekly recap's, from the same code (/admin/discovery/summary), so the page and the email agree.
var SOURCING_REQ = 0; // replies to an older load are dropped
function openSourcing() { if (!isAdmin()) { openAccount(); return; } show("sourcing"); updateFoundCount(); loadSourcing(); }
function loadSourcing() {
  var req = ++SOURCING_REQ;
  $("sourcing-status").textContent = "Loading…";
  api("/admin/discovery/summary").then(readJSON).then(function (res) {
    if (req !== SOURCING_REQ) return;
    if (!res.ok) { $("sourcing-status").textContent = errorText(res); return; }
    $("sourcing-status").textContent = ""; paintSourcing(res.body);
  }, function () { if (req === SOURCING_REQ) $("sourcing-status").textContent = errorText(null); });
}
function needRowHTML(n, name, sub, href, tool) {
  return '<li><a class="hub-row" href="' + href + '"><span class="hub-n">' + n + '</span><span class="hub-text"><span class="hub-name">' + esc(name) +
    '</span><span class="hub-sub">' + esc(sub) + '</span></span><span class="hub-go">' + tool + " →</span></a></li>";
}
function waitingText(list) { // "Art Institute 63, Chicago Symphony 19, Field Museum 9, and 2 more"
  var top = list.slice(0, 3).map(function (s) { return s.name + " " + s.n; }), rest = list.length - top.length;
  return top.join(", ") + (rest ? ", and " + rest + " more" : "");
}
function money(usd) { return "$" + usd.toFixed(2); }
function chicagoDate(iso, parts) { // iso: a plain date; noon keeps it on that day everywhere
  return new Intl.DateTimeFormat("en-US", Object.assign({ timeZone: "America/Chicago" }, parts)).format(new Date(iso + "T12:00:00-06:00"));
}
function paintSourcing(o) {
  var rows = [], bad = o.unreadable, names = function (list) { return list.join(", "); };
  if (o.new_waiting) rows.push(needRowHTML(o.new_waiting, o.new_waiting === 1 ? "Found event to review" : "Found events to review", waitingText(o.waiting_by_source), "#found/new", "Found events"));
  if (o.updates_waiting) rows.push(needRowHTML(o.updates_waiting, o.updates_waiting === 1 ? "Proposed update" : "Proposed updates", "New prices or dates on events already listed", "#found/update", "Found events"));
  if (bad.length) rows.push(needRowHTML(bad.length, bad.length === 1 ? "Source we couldn't read" : "Sources we couldn't read",
    bad.length === 1 ? bad[0].name + ": " + bad[0].reason : names(bad.map(function (s) { return s.name; })), bad.length === 1 ? "#source-" + bad[0].id : "#sources", "Event sources"));
  if (o.by_hand.length) rows.push(needRowHTML(o.by_hand.length, o.by_hand.length === 1 ? "Source to check by hand" : "Sources to check by hand", names(o.by_hand), "#sources", "Event sources"));
  $("needs-n").textContent = rows.length ? String(rows.length) : "";
  $("needs-list").innerHTML = rows.join("") || '<li><p class="hint">Nothing needs you right now.</p></li>';

  $("week-period").textContent = o.period;
  $("week-figures").innerHTML = [[o.found_total, o.found_total === 1 ? "new event found" : "new events found"], [o.left_out, "left out by rules"],
    [o.checks, o.checks === 1 ? "check run" : "checks run"], [money(o.week_cost_usd), "cost this week"]].map(function (f) {
    return "<div><strong>" + esc(f[0]) + "</strong><span>" + esc(f[1]) + "</span></div>"; }).join("");
  $("week-recap").textContent = "The full recap goes out by email on " + chicagoDate(o.next_recap, { weekday: "long", month: "short", day: "numeric" }) + " at 10 AM.";

  var month = new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "America/Chicago" }).format(new Date());
  $("budget-spent").innerHTML = esc(money(o.spent_month_usd)) + " <span>of " + esc("$" + o.budget_usd.toFixed(0)) + " spent in " + esc(month) + "</span>";
  $("budget-note").textContent = o.budget_note; $("budget-note").hidden = !o.budget_note;
  $("tools-sources").textContent = plural(o.sources, "source", "sources") + ", how often each is checked, and Check now";
  $("sourcing-live").hidden = false;
}
document.addEventListener("click", function (ev) { // the tools that sit lower down another page
  var b = ev.target.closest("[data-hub]"); if (!b) return;
  if (b.getAttribute("data-hub") === "rules") openFound("#rules-title"); else openReview("withdrawn-title");
});
