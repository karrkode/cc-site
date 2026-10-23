// Culture Crew site: opening the right view for the link, and starting the page.
// Loaded by index.html in order (core, util, catalog, planner, account, crews, submit, admin, hours, found, issues, photos, approvals, start); they share one
// global scope, so anything declared here is visible to the files after it.
"use strict";
// ---------- start ----------
function openFromHash() {
  var verify = takeLinkToken("verify"); if (verify) { openVerify(verify); return true; }
  var reset = takeLinkToken("reset"); if (reset) { openReset(reset); return true; }
  var join = takeLinkToken("join"); if (join) { // an invite to a crew (CC-74): wait for the sign-in to come back, then show it
    (AUTH.token || !maybeSignedIn() ? Promise.resolve() : refreshSession()).then(function () { openJoin(join); });
    return true;
  }
  var h = (location.hash || "").replace(/^#/, "");
  // CC-117: an event (#e/<id>, from a card, a shared page or a reload), or Back out of one
  var em = /^e\/(\d{1,9})$/.exec(h);
  if (em) { (AUTH.token || !maybeSignedIn() ? Promise.resolve() : refreshSession()).then(function () { openEvent(em[1], false); }); return true; }
  if (visible("event") && EV.from) { closeEvent(); return true; }
  var m = /^o-(\d{8})-(\d{8})((?:-[0-9a-z]{1,12}){1,3})$/.exec(h); // ids: new numbers, or the old site's 6-hex ids
  if (m) {
    var ids = m[3].slice(1).split("-");
    api("/events/lookup?" + qs(ids.map(function (id) { return ["ids", id]; }))).then(readJSON).then(function (res) {
      var found = res.ok ? res.body.map(toEvent) : [];
      var stops = ids.map(function (id) { // keep the link's order; old links use the sheet's ids
        return found.filter(function (e) { return e.id === id || e.sourceId === id; })[0];
      }).filter(Boolean);
      pick = { ws: fromYmd(m[1]), we: fromYmd(m[2]), stops: stops, alts: [], total: stops.length, shared: true };
      renderOuting();
    }, function () {
      pick = { ws: fromYmd(m[1]), we: fromYmd(m[2]), stops: [], alts: [], total: 0, shared: true }; renderOuting();
    });
    return true;
  }
  if (h === "catalog") { renderCatalog(); show("catalog"); return true; }
  if (h === "plan") { startPlan(); return true; }
  if (h === "account") { openAccount(); return true; }
  if (h === "planner") { (AUTH.token || !maybeSignedIn() ? Promise.resolve() : refreshSession()).then(function () { openPlanner(); }); return true; } // CC-105
  if (h === "crews") { (AUTH.token || !maybeSignedIn() ? Promise.resolve() : refreshSession()).then(function () { openCrews(); }); return true; } // CC-104
  if (h === "submit") { openSubmit(); return true; }
  // admin pages (the recap email links here, CC-77/81/84): #approvals (approvers too, CC-91), #members, #issues, #issues/ISS-0007, #found, #found/<show> (e.g. #found/skipped), #sources,
  // and #source-<id> (Event sources, at that source's "Check by hand only" button)
  var fm = /^found\/(waiting|needs|new|update|approved|rejected|skipped|listed|all)$/.exec(h), sm = /^source-(\d+)$/.exec(h);
  var im = /^issues\/(ISS-\d+)$/i.exec(h); // a ticket, from the recap (CC-84)
  if (h === "review" || h === "found" || h === "sources" || h === "issues" || h === "approvals" || h === "members" || fm || sm || im) {
    var open = h === "review" ? openReview : h === "approvals" ? openApprovals : h === "members" ? openMembers : h === "issues" ? function () { openIssues(); } : im ? function () { openIssues(im[1].toUpperCase()); } : (h === "found" || fm) ? function () { if (fm) { FOUND.show = fm[1]; FOUND.source = ""; } openFound(); } :
      sm ? function () { openSources('[data-src-manual="' + sm[1] + '"]'); } : openSources;
    // On a fresh visit the sign-in comes back from the refresh cookie first; then open the page (or Sign in).
    (AUTH.token || !maybeSignedIn() ? Promise.resolve() : refreshSession()).then(open);
    return true;
  }
  return false;
}

// Everything above only defines things and wires up buttons. This runs once the filter options
// and counts have loaded, and draws the first view.
function boot(FACETS_IN) {
  setFacets(FACETS_IN);
  buildCatalogControls();
  renderHome();
  loadHome();
  if (!openFromHash()) track("view", "home"); // the welcome screen is already showing
  window.addEventListener("hashchange", openFromHash);
  AUTH.onChange = onAuthChange;
  // signed in on an earlier visit? the refresh cookie brings the session back (counting waits for it)
  COUNT_READY = maybeSignedIn() ? refreshSession() : Promise.resolve();
  renderPrivacyNote();
  setTimeout(function () { $("doors").classList.remove("rise"); }, 1200); // CC-103: the doors rise in once, on the first visit to the page
}
// The footer's note on counting visits (CC-68), with the switch to turn it off or on again.
function renderPrivacyNote() {
  var p = $("privacy-note");
  if (COUNTING.gpc) { p.textContent = "Your browser asks sites not to track it, so your visits aren't counted."; return; }
  p.innerHTML = COUNTING.off ? "Your visits aren't counted. " +
      '<button class="textbtn" type="button" id="count-toggle">Count my visits again</button>' :
    "We count visits without cookies: your browser keeps a random number so we can tell new visitors from returning ones. " +
      "We also note which site or tagged link brought you here (just the site, never the page). Nothing else about you is kept or shared. " + '<button class="textbtn" type="button" id="count-toggle">Don\'t count my visits</button>';
}
document.addEventListener("click", function (ev) {
  if (!ev.target.closest("#count-toggle")) return;
  setCounting(COUNTING.off); renderPrivacyNote(); $("count-toggle").focus();
});
(function () {
  // Just the filter options and counts; each view then asks for the events it shows (CC-33).
  var t = new Date(), today = t.getFullYear() + "-" + ("0" + (t.getMonth() + 1)).slice(-2) + "-" + ("0" + t.getDate()).slice(-2);
  api("/events/facets?today=" + today).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (facets) { boot(facets); })
    .catch(function () {
      var lede = document.getElementById("home-lede"); lede.hidden = false; // the only time this line shows (CC-107)
      lede.textContent = "The event list couldn't be loaded right now. Try reloading the page in a minute.";
    });
})();
