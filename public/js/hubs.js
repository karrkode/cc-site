// Culture Crew site: The admin's Review menu and its group pages (CC-206): Engagement, and Venues and Members (Event Sourcing is sourcing.js).
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
  moveStop(menu); menu.hidden = !sheet; $("nav-review").setAttribute("aria-expanded", "false");
}
MAST_PHONE.addEventListener("change", paintRvMode);
paintRvMode();
function openRvMenu(at) {
  $("nav-review").setAttribute("aria-expanded", "true");
  dropOpen($("rv-menu"), function () { var items = rvItems(); items[at === "last" ? items.length - 1 : 0].focus(); });
}
function closeRvMenu(refocus) {
  if ($("rv-menu").hidden || MAST_PHONE.matches) return;
  dropClose($("rv-menu")); $("nav-review").setAttribute("aria-expanded", "false");
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
