// Culture Crew site: opening the right view for the link, and starting the page.
// Loaded by index.html in order (core, util, catalog, planner, account, submit, admin, start); they share one
// global scope, so anything declared here is visible to the files after it.
"use strict";
// ---------- start ----------
function openFromHash() {
  var verify = takeLinkToken("verify"); if (verify) { openVerify(verify); return true; }
  var reset = takeLinkToken("reset"); if (reset) { openReset(reset); return true; }
  var h = (location.hash || "").replace(/^#/, "");
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
  if (h === "submit") { openSubmit(); return true; }
  if (h === "review") { openReview(); return true; }
  return false;
}

// Everything above only defines things and wires up buttons. This runs once the filter options
// and counts have loaded, and draws the first view.
function boot(FACETS_IN) {
  setFacets(FACETS_IN);
  buildCatalogControls();
  renderHome();
  loadHome();
  if (!openFromHash()) { /* welcome screen is already showing */ }
  window.addEventListener("hashchange", openFromHash);
  AUTH.onChange = onAuthChange;
  if (maybeSignedIn()) refreshSession(); // signed in on an earlier visit? the refresh cookie brings the session back
}
(function () {
  // Just the filter options and counts; each view then asks for the events it shows (CC-33).
  var t = new Date(), today = t.getFullYear() + "-" + ("0" + (t.getMonth() + 1)).slice(-2) + "-" + ("0" + t.getDate()).slice(-2);
  api("/events/facets?today=" + today).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (facets) { boot(facets); })
    .catch(function () {
      document.getElementById("home-lede").textContent = "The event list couldn't be loaded right now. Try reloading the page in a minute.";
    });
})();
