// Culture Crew site: Plan an outing: the four questions, the pick and its backups, share links.
// Loaded by index.html in order (core, util, catalog, planner, account, submit, admin, start); they share one
// global scope, so anything declared here is visible to the files after it.
"use strict";
// ---------- planner ----------
var plan = { step: 0, when: null, ws: null, we: null, budget: null, types: {}, regions: {} };
var pick = null; // { ws, we, stops: [event], alts: [event], total, shared }
var BUDGETS = [["free", "Free", "No ticket cost"], ["u40", "Under $40", "Tickets start below $40"], ["u100", "Under $100", "Tickets start below $100"], ["any", "Any price", "Includes events with no price posted yet"]];

// The planner only needs city and suburb events in the window being planned, so it loads those
// (the next five weeks to start with: every preset fits) instead of the whole list.
var PLAN_EVENTS = [], PLAN_RANGE = null;
function withPlanEvents(ws, we, then) {
  if (PLAN_RANGE && ws >= PLAN_RANGE[0] && we <= PLAN_RANGE[1]) { then(); return; }
  var from = ws < T ? T : ws, to = we;
  if (!PLAN_RANGE && same(from, T)) to = add(T, 34);
  $("plan-opts").innerHTML = '<p class="hint">Finding events…</p>';
  // every side of town, out of town included (CC-73): pool() leaves those out unless "Out of town" is chosen
  fetchEvents([["from", isoDate(from)], ["to", isoDate(to)], ["sort", "closing"], ["limit", 1000]])
    .then(function (page) { PLAN_EVENTS = page.items; PLAN_RANGE = [from, to]; then(); },
          function () { $("plan-opts").innerHTML = '<p class="form-error">The events couldn\'t be loaded. Check your connection and try again.</p>'; });
}
// regions (CC-73): the sides of town chosen in question 4. None chosen means anywhere nearby: the city
// and suburbs, as before; out-of-town events only come in when "Out of town" is chosen.
function pool(ws, we, budget, types, regions) {
  var anyType = !types || Object.keys(types).length === 0, anyRegion = !regions || Object.keys(regions).length === 0;
  return PLAN_EVENTS.filter(function (e) {
    return !isPast(e) && overlaps(e, ws, we) && costOk(e, budget || "any") && (anyType || !!types[e.type]) &&
      (anyRegion ? e.region !== "out_of_town" && e.area !== "Out of town" : !!regions[e.region]);
  });
}
function startPlan() {
  plan = { step: 0, when: null, ws: null, we: null, budget: null, types: {}, regions: {} }; pick = null;
  show("plan"); $("plan-questions").hidden = false; $("plan-result").hidden = true;
  withPlanEvents(T, add(T, 34), renderStep);
}
function optHTML(attrs, main, sub, n, disabled, pressed) {
  return '<button type="button" class="opt" ' + attrs + (disabled ? " disabled" : "") + (pressed === undefined ? "" : ' aria-pressed="' + pressed + '"') + ">" +
    '<span><span class="opt-main">' + esc(main) + "</span>" + (sub ? '<br><span class="opt-sub">' + esc(sub) + "</span>" : "") + "</span>" +
    (n === null ? "" : '<span class="opt-n">' + plural(n, "event", "events") + "</span>") + "</button>";
}
function renderStep() {
  $("plan-questions").hidden = false; $("plan-result").hidden = true;
  $("plan-count").textContent = "Question " + (plan.step + 1) + " of 4";
  for (var i = 0; i < 4; i++) $("tick-" + i).className = i <= plan.step ? "on" : "";
  $("plan-next").hidden = plan.step < 2;
  $("plan-next").textContent = plan.step === 2 ? "Next" : "Build my outing";
  $("plan-back").textContent = plan.step === 0 ? "Cancel" : "Back";
  var html = "";
  if (plan.step === 0) {
    $("plan-title").textContent = "When are you going?";
    $("plan-help").textContent = "One outing in the city or suburbs, so pick the day or the stretch you have free.";
    var wk = thisWeekend(), nwk = nextWeekend(), mo = [T, add(T, 29)];
    var whens = [["tonight", "Tonight", dayName(T), [T, T]], ["weekend", "This weekend", windowText(wk[0], wk[1]), wk],
      ["nextweekend", "Next weekend", windowText(nwk[0], nwk[1]), nwk], ["month", "Sometime in the next 30 days", "Through " + short(mo[1]), mo]];
    html = whens.map(function (w) { return optHTML('data-when="' + w[0] + '"', w[1], w[2], pool(w[3][0], w[3][1]).length); }).join("") +
      '<div class="datepick"><div class="field"><label for="plan-date">Or pick a date</label><input type="date" id="plan-date" min="' +
      T.getFullYear() + "-" + ("0" + (T.getMonth() + 1)).slice(-2) + "-" + ("0" + T.getDate()).slice(-2) + '"></div>' +
      '<button type="button" class="btn ghost" id="plan-date-go">Use this date</button></div>';
  } else if (plan.step === 1) {
    $("plan-title").textContent = "What's the budget per person?";
    $("plan-help").textContent = "We go by the lowest ticket price listed for each event.";
    html = BUDGETS.map(function (b) {
      var n = pool(plan.ws, plan.we, b[0]).length;
      return optHTML('data-budget="' + b[0] + '"', b[1], b[2], n, n === 0 && b[0] !== "any");
    }).join("");
  } else if (plan.step === 2) {
    $("plan-title").textContent = "What are you in the mood for?";
    $("plan-help").textContent = "Choose as many as you like, or leave it open.";
    var anyN = pool(plan.ws, plan.we, plan.budget).length, noneChosen = Object.keys(plan.types).length === 0;
    html = optHTML('data-ptype=""', "Surprise me", "Anything that fits", anyN, false, String(noneChosen)) +
      TYPES.map(function (t) {
        var one = {}; one[t] = 1; var n = pool(plan.ws, plan.we, plan.budget, one).length;
        return optHTML('data-ptype="' + esc(t) + '"', t, "", n, n === 0, String(!!plan.types[t]));
      }).join("");
  } else {
    $("plan-title").textContent = "Where would you like to go?";
    $("plan-help").textContent = "Choose one or more sides of town, or leave it open. \u201cAnywhere nearby\u201d means the city and suburbs.";
    var chip = function (attr, label, n, disabled, pressed) {
      return '<button type="button" class="chip" ' + attr + (disabled ? " disabled" : "") + ' aria-pressed="' + pressed + '">' + esc(label) +
        '<span class="n">' + n + "</span></button>";
    };
    var allN = pool(plan.ws, plan.we, plan.budget, plan.types).length;
    html = '<div class="hoods"><div class="chips">' + chip('data-pregion=""', "Anywhere nearby", allN, false, String(Object.keys(plan.regions).length === 0)) +
      REGIONS.map(function (r) {
        var one = {}; one[r[0]] = 1; var n = pool(plan.ws, plan.we, plan.budget, plan.types, one).length;
        return chip('data-pregion="' + r[0] + '"', r[1], n, n === 0, String(!!plan.regions[r[0]]));
      }).join("") + "</div></div>";
  }
  $("plan-opts").innerHTML = html;
}
$("plan-opts").addEventListener("click", function (ev) {
  if (ev.target.id === "plan-date-go") {
    var v = $("plan-date").value; if (!v) { $("plan-date").focus(); return; }
    var d = parseISO(v); if (d < T) { $("plan-date").focus(); return; }
    plan.when = "date"; plan.ws = d; plan.we = d; plan.step = 1;
    withPlanEvents(d, d, function () { renderStep(); $("plan-title").focus(); }); return;
  }
  var rc = ev.target.closest("[data-pregion]");
  if (rc && !rc.disabled) {
    var rname = rc.getAttribute("data-pregion");
    if (!rname) plan.regions = {}; else if (plan.regions[rname]) delete plan.regions[rname]; else plan.regions[rname] = 1;
    renderStep();
    var ragain = $("plan-opts").querySelector('[data-pregion="' + rname + '"]'); if (ragain) ragain.focus();
    return;
  }
  var b = ev.target.closest(".opt"); if (!b || b.disabled) return;
  if (b.hasAttribute("data-when")) {
    var k = b.getAttribute("data-when"), w = k === "tonight" ? [T, T] : k === "weekend" ? thisWeekend() : k === "nextweekend" ? nextWeekend() : [T, add(T, 29)];
    plan.when = k; plan.ws = w[0]; plan.we = w[1]; plan.step = 1; renderStep(); $("plan-title").focus();
  } else if (b.hasAttribute("data-budget")) {
    plan.budget = b.getAttribute("data-budget"); plan.types = {}; plan.regions = {}; plan.step = 2; renderStep(); $("plan-title").focus();
  } else if (b.hasAttribute("data-ptype")) {
    var t = b.getAttribute("data-ptype");
    if (!t) plan.types = {}; else if (plan.types[t]) delete plan.types[t]; else plan.types[t] = 1;
    plan.regions = {};
    renderStep();
    var again = $("plan-opts").querySelector('[data-ptype="' + (window.CSS && CSS.escape ? CSS.escape(t) : t) + '"]'); if (again) again.focus();
  }
});
$("plan-back").addEventListener("click", function () {
  if (plan.step === 0) { show("home"); return; }
  plan.step -= 1;
  var back = function () { renderStep(); $("plan-title").focus(); };
  if (plan.step === 0) withPlanEvents(T, add(T, 34), back); else back(); // the presets need the five weeks loaded
});
$("plan-next").addEventListener("click", function () {
  if (plan.step === 2) { plan.step = 3; renderStep(); $("plan-title").focus(); } else buildOuting();
});

function isArt(e) { return e.type === "Visual Art"; }
function buildOuting() {
  var all = pool(plan.ws, plan.we, plan.budget, plan.types, plan.regions).sort(byClosing);
  var shows = all.filter(function (e) { return !isArt(e); }), art = all.filter(isArt);
  var stops = [], main = shows[0] || art[0];
  if (main) {
    if (!isArt(main) && art.length) {
      var near = art.filter(function (a) { return a.hood && a.hood === main.hood; })[0] || art.filter(function (a) { return a.area === main.area; })[0] || art[0];
      stops.push(near);
    }
    stops.push(main);
  }
  var used = {}; stops.forEach(function (s) { used[s.id] = 1; });
  var alts = (shows.length ? shows : art).filter(function (e) { return !used[e.id]; });
  pick = { ws: plan.ws, we: plan.we, stops: stops, alts: alts, total: all.length, shared: false };
  renderOuting();
  if (stops.length) track("outing"); // an outing was actually planned (CC-68)
}
function whyText(e, ws, we) {
  if (oneNight(e)) return "One night only, " + dayName(e.b) + ".";
  if (e.openRun) return "An open run with no closing date, so any night works.";
  if (e.n && diff(e.n, we) <= 7) return "Closes " + dayName(e.n) + ", so this is the time to go.";
  if (e.b && e.b >= ws) return "Opens " + dayName(e.b) + ".";
  if (e.b && diff(ws, e.b) <= 10 && diff(ws, e.b) >= 0) return "Just opened, running through " + short(e.n) + ".";
  return e.n ? "Running through " + short(e.n) + "." : "";
}
function stopHTML(e, slot, ws, we) {
  return '<div class="stop"><p class="stop-slot">' + esc(slot) + '</p><div class="stop-body">' +
    '<p class="kind">' + esc(e.type) + "</p><h2>" + esc(e.title) + "</h2>" +
    '<p class="where">' + placeHTML(e) + "</p>" +
    '<p class="facts">' + esc(dateText(e)) + " · " + esc(costText(e)) + "</p>" +
    "<p>" + esc(whyText(e, ws, we)) + "</p>" +
    '<a class="btn cta" href="' + esc(safeUrl(e.url)) + '" target="_blank" rel="noopener">' + (isArt(e) ? "Exhibition details" : "Tickets and showtimes") + " ↗</a>" +
    "</div></div>";
}
function shareUrl() {
  var base = PAGE_URL && PAGE_URL.indexOf("http") === 0 ? PAGE_URL : location.href.split("#")[0];
  return base + "#o-" + ymd(pick.ws) + "-" + ymd(pick.we) + "-" + pick.stops.map(function (s) { return s.id; }).join("-");
}
function renderOuting() {
  $("plan-questions").hidden = true; $("plan-result").hidden = false;
  $("res-eyebrow").textContent = pick.shared ? "An outing picked for you" : "Your outing";
  $("res-title").textContent = windowText(pick.ws, pick.we);
  var body = "";
  if (!pick.stops.length) {
    $("res-sub").textContent = pick.shared ? "The events in this link are no longer on the list." : "Nothing on the list fits all your answers.";
    body = pick.shared ? "" : relaxHTML();
    body += '<div class="row" style="margin-top:18px"><button class="btn" type="button" data-go="plan">Start over</button><button class="btn ghost" type="button" data-go="catalog">Browse the catalog</button></div>';
    $("res-body").innerHTML = body; show("plan", "res-title"); return;
  }
  $("res-sub").textContent = pick.shared ? "Someone sent you this plan. Showtimes are on the event's page." :
    "Picked from " + plural(pick.total, "event that fits", "events that fit") + ". Showtimes are on the event's page.";
  var two = pick.stops.length > 1;
  body += '<div class="outing">' + pick.stops.map(function (s, i) {
    return stopHTML(s, two ? (i === 0 ? "Afternoon" : "Evening") : (isArt(s) ? "The visit" : "The plan"), pick.ws, pick.we);
  }).join("") + "</div>";
  body += '<div class="section sharebox"><div class="row"><button class="btn ghost" type="button" id="share-btn">Copy link to this outing</button>' +
    '<span class="hint" id="share-msg" role="status"></span></div><input type="text" id="share-url" readonly hidden aria-label="Link to this outing"></div>';
  if (!pick.shared && pick.alts.length) {
    body += '<div class="section"><h2>Or swap in one of these</h2><div class="alts">' + pick.alts.slice(0, 4).map(function (e) {
      return '<div class="alt"><div class="alt-text"><p class="alt-title">' + esc(e.title) + '</p><p class="alt-meta">' + esc(placeText(e)) + " · " + esc(dateText(e)) + " · " + esc(costText(e)) + "</p></div>" +
        '<button class="btn ghost" type="button" data-swap="' + e.id + '">Swap in</button></div>';
    }).join("") + "</div></div>";
  }
  body += '<div class="row" style="margin-top:28px">' +
    (pick.shared ? '<button class="btn" type="button" data-go="plan">Plan your own</button><button class="btn ghost" type="button" data-go="catalog">Browse the catalog</button>' :
      (pick.total > 1 ? '<button class="btn ghost" type="button" id="see-all">See all ' + pick.total + " in the catalog</button>" : "") +
      '<button class="textbtn" type="button" data-go="plan">Start over</button>') + "</div>";
  $("res-body").innerHTML = body;
  show("plan", "res-title");
}
function relaxHTML() {
  var out = [], anyTypes = Object.keys(plan.types).length === 0, anyRegions = Object.keys(plan.regions).length === 0;
  if (plan.budget !== "any") { var n1 = pool(plan.ws, plan.we, "any", plan.types, plan.regions).length; if (n1) out.push(['data-relax="budget"', "Open up the budget", plural(n1, "event fits", "events fit") + " at any price"]); }
  if (!anyTypes) { var n2 = pool(plan.ws, plan.we, plan.budget, {}, plan.regions).length; if (n2) out.push(['data-relax="types"', "Take any type of event", plural(n2, "event fits", "events fit")]); }
  if (!anyRegions) { var n4 = pool(plan.ws, plan.we, plan.budget, plan.types, {}).length; if (n4) out.push(['data-relax="regions"', "Go anywhere nearby", plural(n4, "event fits", "events fit")]); }
  var wide = [T, add(T, 29)], covered = PLAN_RANGE && wide[0] >= PLAN_RANGE[0] && wide[1] <= PLAN_RANGE[1];
  var n3 = covered ? pool(wide[0], wide[1], plan.budget, plan.types, plan.regions).length : 1; // not loaded: offer it anyway
  if (n3 && !(same(plan.ws, wide[0]) && same(plan.we, wide[1]))) out.push(['data-relax="when"', "Look across the next 30 days", covered ? plural(n3, "event fits", "events fit") : "See what else is coming up"]);
  if (!out.length) return '<p class="hint">Try the catalog, where you can loosen one filter at a time.</p>';
  return '<div class="opts">' + out.map(function (o) { return optHTML(o[0], o[1], o[2], null); }).join("") + "</div>";
}
$("res-body").addEventListener("click", function (ev) {
  var t = ev.target;
  var relax = t.closest("[data-relax]");
  if (relax) {
    var r = relax.getAttribute("data-relax");
    if (r === "budget") plan.budget = "any"; else if (r === "types") plan.types = {}; else if (r === "regions") plan.regions = {}; else { plan.ws = T; plan.we = add(T, 29); plan.when = "month"; }
    withPlanEvents(plan.ws, plan.we, buildOuting); return;
  }
  var swap = t.closest("[data-swap]");
  if (swap && pick) {
    var sid = swap.getAttribute("data-swap"), e = pick.alts.filter(function (a) { return a.id === sid; })[0];
    if (!e) return;
    var last = pick.stops.length - 1, old = pick.stops[last];
    pick.stops[last] = e;
    pick.alts = pick.alts.filter(function (a) { return a.id !== e.id; }); pick.alts.push(old);
    renderOuting(); return;
  }
  if (t.id === "see-all" && pick) {
    resetCatalog(); cat.cost = plan.budget || "any"; cat.types = {}; Object.keys(plan.types).forEach(function (k) { cat.types[k] = 1; });
    cat.when = "custom"; cat.custom = { ws: pick.ws, we: pick.we };
    cat.regions = {}; Object.keys(plan.regions).forEach(function (k) { cat.regions[k] = 1; });
    cat.where = Object.keys(cat.regions).length ? "any" : "local"; // the chosen sides of town, or anywhere nearby
    loadCatalog(); show("catalog"); return;
  }
  if (t.id === "share-btn" && pick) {
    var url = shareUrl(), field = $("share-url"), msg = $("share-msg");
    field.value = url; field.hidden = false;
    var fallback = function () { field.focus(); field.select(); msg.textContent = "Copy the link below."; };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () { msg.textContent = "Link copied."; }, fallback);
    } else fallback();
  }
});
