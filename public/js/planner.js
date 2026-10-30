// Culture Crew site: Find an outing: the four questions, the pick and its backups, share links.
// Loaded by index.html in order (core, util, catalog, planner, account, crews, submit, admin, hours, found, issues, photos, approvals, start); they share one
// global scope, so anything declared here is visible to the files after it.
"use strict";
// ---------- planner ----------
// budget: "free", "any", or a top price in whole dollars (CC-128); priced: the Priced choice is open, showing its slider
var plan = { step: 0, when: null, ws: null, we: null, slot: "day", budget: null, priced: false, types: {}, regions: {} };
var pick = null; // { ws, we, stops: [event], alts: [event], total, shared }
// CC-128: the slider only stops at prices that add events: each lowest ticket price posted in the window (rounded up to
// the dollar), then "any" when some events have no price posted yet. Free events fit under every top price.
var PLAN_STOPS = [];
function priceStops(events) {
  var seen = {}, out = [], unpriced = false;
  events.forEach(function (e) {
    if (e.min === null) unpriced = true;
    else if (e.min > 0 && !seen[Math.ceil(e.min)]) { seen[Math.ceil(e.min)] = 1; out.push(Math.ceil(e.min)); }
  });
  out.sort(function (a, b) { return a - b; });
  if (unpriced) out.push("any");
  return out;
}
function budgetText(b) { return b === "any" ? "Any price" : b === "free" ? "Free" : "Up to $" + b; }

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
// ---------- what's actually on (CC-79) ----------
// The planner only suggests what's happening when you can go. A performance needs a schedule: its own
// dates and times (from the venue's site), else a weekly pattern (its own, else the venue's show times);
// with neither it's never suggested here (it's still in the catalog). An exhibition is on when its venue
// is open; a venue whose hours aren't known yet counts as open 10 AM to 5 PM, but never for Tonight,
// which needs a known late night. Days marked Closed always count. Holidays aren't tracked.
// slot: "day" (any time that day), "today" (before 5 PM), "tonight" (5 PM or later; exhibitions open past 6 PM).
// On today, anything already started or already closed is left out.
var DOW = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"], EVENING = "17:00", LATE = "18:00", USUAL = ["10:00", "17:00"];
function clockNow() { var d = new Date(); return ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2); }
function isExhibit(e) { return isArt(e) && !e.sched.dates.length; } // a talk or opening with its own times is a performance
// Start times on day d ("" = a date without a time), or null when there's no schedule to go by.
function timesOn(e, d) {
  var iso = isoDate(d), dates = e.sched.dates, weekly = e.sched.weekly || {};
  if (dates.length && iso >= dates[0].date && iso <= dates[dates.length - 1].date) {
    return dates.filter(function (p) { return p.date === iso; }).map(function (p) { return p.time || ""; });
  }
  if (Object.keys(weekly).length) return onWeekOf(e.sched.weeks, d) ? weekly[DOW[d.getDay()]] || [] : [];
  return dates.length ? [] : null; // past its listed dates: nothing known
}
// CC-88: a show day that's only on some weeks of the month ({thu: [1, 3]}; 5 is the last): is d one of them?
function onWeekOf(weeks, d) {
  var on = weeks && weeks[DOW[d.getDay()]]; if (!on || !on.length) return true;
  var nth = Math.ceil(d.getDate() / 7), last = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7).getMonth() !== d.getMonth();
  return on.indexOf(nth) >= 0 || (last && on.indexOf(5) >= 0);
}
function hoursOn(e, d) { // [opens, closes, known] or null when closed
  var h = e.sched.hours || {}, k = DOW[d.getDay()];
  if (!Object.prototype.hasOwnProperty.call(h, k)) return [USUAL[0], USUAL[1], false];
  return h[k] ? [h[k][0], h[k][1], true] : null;
}
function stillOpen(o, c, now) { return c < o ? true : now < c; } // closing before opening = after midnight
function onDay(e, d, slot) {
  if (!overlaps(e, d, d)) return false;
  var today = same(d, T), now = clockNow();
  if (isExhibit(e)) {
    var h = hoursOn(e, d); if (!h) return false;
    if (slot === "tonight") return h[2] && (h[1] > LATE || h[1] < h[0]) && (!today || stillOpen(h[0], h[1], now));
    return !today || stillOpen(h[0], h[1], now);
  }
  var times = timesOn(e, d); if (!times) return false;
  return times.some(function (t) {
    if (!t) return slot === "day" && !today; // a date without a time: fine for a day, unknown for today or tonight
    if (today && t <= now) return false; // already started
    return slot === "today" ? t < EVENING : slot === "tonight" ? t >= EVENING : true;
  });
}
function onDuring(e, ws, we, slot) {
  for (var d = ws < T ? T : ws; d <= we; d = add(d, 1)) if (onDay(e, d, slot)) return true;
  return false;
}
// The times to show on a stop for a one-day plan: "7:30 PM", or "Open until 9 PM".
function showTimesText(e, ws, we, slot) {
  if (!same(ws, we)) return "";
  if (isExhibit(e)) { var h = hoursOn(e, ws); return h && h[2] ? "Open " + clockText(h[0]) + " to " + clockText(h[1]) + "." : ""; }
  var now = clockNow(), today = same(ws, T);
  var times = (timesOn(e, ws) || []).filter(function (t) {
    return t && (!today || t > now) && (slot === "today" ? t < EVENING : slot === "tonight" ? t >= EVENING : true);
  });
  return times.length ? (times.length === 1 ? "Starts at " : "Shows at ") + times.map(clockText).join(" and ") + "." : "";
}

// regions (CC-73): the sides of town chosen in question 4. None chosen means anywhere nearby: the city
// and suburbs, as before; out-of-town events only come in when "Out of town" is chosen.
function pool(ws, we, budget, types, regions, slot) {
  var anyType = !types || Object.keys(types).length === 0, anyRegion = !regions || Object.keys(regions).length === 0;
  slot = slot || plan.slot || "day";
  return PLAN_EVENTS.filter(function (e) {
    return !isPast(e) && overlaps(e, ws, we) && costOk(e, budget || "any") && (anyType || inType(e, types)) &&
      (anyRegion ? e.region !== "out_of_town" && e.area !== "Out of town" : !!regions[e.region]) && onDuring(e, ws, we, slot);
  });
}
// The "when" choices: Today (until 5 PM), Tonight (until 9 PM), This weekend (Friday to Sunday; not on a
// Sunday, when Next weekend is the coming one), Next weekend, or a date.
function whenChoices() {
  var hour = new Date().getHours(), out = [];
  if (hour < 17) out.push(["today", "Today", "Before 5 PM", [T, T], "today"]);
  if (hour < 21) out.push(["tonight", "Tonight", "After 5 PM", [T, T], "tonight"]);
  if (T.getDay() !== 0) { var wk = thisWeekend(); out.push(["weekend", "This weekend", windowText(wk[0], wk[1]), wk, "day"]); }
  var nwk = nextWeekend(); out.push(["nextweekend", "Next weekend", windowText(nwk[0], nwk[1]), nwk, "day"]);
  return out;
}
function startPlan() {
  plan = { step: 0, when: null, ws: null, we: null, slot: "day", budget: null, priced: false, types: {}, regions: {} }; pick = null;
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
  $("plan-next").hidden = plan.step < 2 && !(plan.step === 1 && plan.priced);
  $("plan-next").textContent = plan.step === 3 ? "Build my outing" : "Next";
  $("plan-back").textContent = plan.step === 0 ? "Cancel" : "Back";
  var html = "";
  if (plan.step === 0) {
    $("plan-title").textContent = "When are you going?";
    $("plan-help").textContent = "One outing in the city or suburbs. We only suggest shows with known showtimes, and exhibitions on days they're open.";
    html = whenChoices().map(function (w) { return optHTML('data-when="' + w[0] + '"', w[1], w[2], pool(w[3][0], w[3][1], null, null, null, w[4]).length); }).join("") +
      '<div class="datepick"><div class="field"><label for="plan-date">Or pick a date</label><input type="date" id="plan-date" min="' +
      T.getFullYear() + "-" + ("0" + (T.getMonth() + 1)).slice(-2) + "-" + ("0" + T.getDate()).slice(-2) + '"></div>' +
      '<button type="button" class="btn ghost" id="plan-date-go">Use this date</button></div>';
  } else if (plan.step === 1) {
    $("plan-title").textContent = "What's the budget per person?";
    $("plan-help").textContent = "We go by the lowest ticket price listed for each event.";
    // CC-128: Free, or Priced with a top price set on a slider that opens in place of Free (Back, or Priced again, closes it)
    var inWindow = pool(plan.ws, plan.we, "any"), freeN = pool(plan.ws, plan.we, "free").length;
    PLAN_STOPS = priceStops(inWindow);
    if (!PLAN_STOPS.length) plan.priced = false;
    html = (plan.priced ? "" : optHTML('data-budget="free"', "Free", "No ticket cost", freeN, freeN === 0)) +
      optHTML('data-budget="priced"', "Priced", "Set a top price per person", inWindow.length, !PLAN_STOPS.length, String(plan.priced));
    if (plan.priced) html += priceSliderHTML(inWindow);
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
    html = '<div class="hoods"><div class="chips segs">' + chip('data-pregion=""', "Anywhere nearby", allN, false, String(Object.keys(plan.regions).length === 0)) +
      REGIONS.map(function (r) {
        var one = {}; one[r[0]] = 1; var n = pool(plan.ws, plan.we, plan.budget, plan.types, one).length;
        return chip('data-pregion="' + r[0] + '"', r[1], n, n === 0, String(!!plan.regions[r[0]]));
      }).join("") + "</div></div>";
  }
  $("plan-opts").innerHTML = html;
  if (plan.step === 1 && plan.priced) paintPrice();
}
// The top price slider, set to the chosen price (or the next stop up when the window changed), else to the top.
function priceSliderHTML(inWindow) {
  var at = PLAN_STOPS.length - 1;
  if (typeof plan.budget === "number") PLAN_STOPS.some(function (s, i) { if (s === "any" || s >= plan.budget) { at = i; return true; } return false; });
  plan.budget = PLAN_STOPS[at];
  var unpriced = inWindow.filter(function (e) { return e.min === null; }).length, last = PLAN_STOPS.length - 1;
  return '<div class="price-pick">' +
    '<div class="price-now"><label for="plan-price" id="plan-price-text">' + esc(budgetText(plan.budget)) + '</label><span class="opt-n" id="plan-price-n" aria-live="polite"></span></div>' +
    '<input type="range" id="plan-price" min="0" max="' + last + '" step="1" value="' + at + '"' + (last ? "" : " disabled") + ">" +
    '<div class="price-ends" aria-hidden="true"><span>' + esc(budgetText(PLAN_STOPS[0])) + "</span><span>" + (last ? esc(budgetText(PLAN_STOPS[last])) : "") + "</span></div>" +
    (unpriced ? '<p class="hint">' + plural(unpriced, "event has", "events have") + " no price posted yet. " + (unpriced === 1 ? "It's" : "They're") + " only included at Any price.</p>" : "") +
    "</div>";
}
function paintPrice() { // the label and the live count for the slider's price; the count is what the next questions start from
  var n = pool(plan.ws, plan.we, plan.budget).length, text = budgetText(plan.budget);
  $("plan-price-text").textContent = text; $("plan-price-n").textContent = plural(n, "event", "events");
  var r = $("plan-price"); if (!r) return;
  r.setAttribute("aria-valuetext", text + ", " + plural(n, "event", "events"));
  r.style.setProperty("--fill", (+r.max ? 100 * r.value / r.max : 100) + "%");
}
$("plan-opts").addEventListener("input", function (ev) {
  if (ev.target.id !== "plan-price") return;
  plan.budget = PLAN_STOPS[+ev.target.value]; paintPrice();
});
$("plan-opts").addEventListener("click", function (ev) {
  if (ev.target.id === "plan-date-go") {
    var v = $("plan-date").value; if (!v) { $("plan-date").focus(); return; }
    var d = parseISO(v); if (d < T) { $("plan-date").focus(); return; }
    plan.when = "date"; plan.ws = d; plan.we = d; plan.slot = "day"; plan.step = 1;
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
    var k = b.getAttribute("data-when"), w = whenChoices().filter(function (c) { return c[0] === k; })[0];
    if (!w) { renderStep(); return; } // the hour passed while the page was open
    plan.when = k; plan.ws = w[3][0]; plan.we = w[3][1]; plan.slot = w[4]; plan.step = 1; renderStep(); $("plan-title").focus();
  } else if (b.getAttribute("data-budget") === "priced") {
    plan.priced = !plan.priced; renderStep(); (plan.priced && !$("plan-price").disabled ? $("plan-price") : $("plan-opts").querySelector("[data-budget]")).focus();
  } else if (b.hasAttribute("data-budget")) {
    plan.budget = "free"; plan.priced = false; plan.types = {}; plan.regions = {}; plan.step = 2; renderStep(); $("plan-title").focus();
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
  if (plan.step === 1 && plan.priced) { plan.priced = false; renderStep(); $("plan-opts").querySelector("[data-budget]").focus(); return; } // back to Free or Priced
  plan.step -= 1;
  var back = function () { renderStep(); $("plan-title").focus(); };
  if (plan.step === 0) withPlanEvents(T, add(T, 34), back); else back(); // the presets need the five weeks loaded
});
$("plan-next").addEventListener("click", function () {
  if (plan.step === 1) { plan.types = {}; plan.regions = {}; plan.step = 2; renderStep(); $("plan-title").focus(); }
  else if (plan.step === 2) { plan.step = 3; renderStep(); $("plan-title").focus(); } else buildOuting();
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
  return '<div class="stop"><p class="stop-slot">' + esc(slot) + "</p>" + outingTileHTML(e) + '<div class="stop-body">' +
    "<h2>" + esc(e.title) + "</h2>" +
    '<p class="where">' + placeHTML(e) + "</p>" +
    '<p class="facts">' + esc(dateText(e)) + " · " + esc(costText(e)) + "</p>" +
    "<p>" + esc([showTimesText(e, ws, we, plan.slot), whyText(e, ws, we)].filter(Boolean).join(" ")) + "</p>" +
    '<a class="btn cta" href="' + esc(safeUrl(e.url)) + '" target="_blank" rel="noopener">' + (isArt(e) ? "Exhibition details" : "Tickets and showtimes") + " ↗</a>" +
    "</div></div>";
}
// CC-149: an event's tile (the category field, its water and the category's name), as on the listings (CC-140)
function outingTileHTML(e) {
  return '<span class="tile water-field' + catClass(e.type) + '">' + waterHTML(e, "tile") + '<span class="tile-k">' + esc(e.label) + "</span></span>";
}
function shareUrl() {
  var base = PAGE_URL && PAGE_URL.indexOf("http") === 0 ? PAGE_URL : location.href.split("#")[0];
  return base + "#o-" + ymd(pick.ws) + "-" + ymd(pick.we) + "-" + pick.stops.map(function (s) { return s.id; }).join("-");
}
function renderOuting() {
  $("plan-questions").hidden = true; $("plan-result").hidden = false;
  $("res-title").textContent = windowText(pick.ws, pick.we);
  var body = "";
  if (!pick.stops.length) {
    $("res-sub").textContent = pick.shared ? "The events in this link are no longer on the list." : "Nothing on the list fits all your answers.";
    body = pick.shared ? "" : relaxHTML();
    body += '<div class="row" style="margin-top:18px"><button class="btn" type="button" data-go="plan">Start over</button><button class="btn ghost" type="button" data-go="catalog">Browse the catalog</button></div>';
    $("res-body").innerHTML = body; show("plan", "res-title"); return;
  }
  $("res-sub").textContent = pick.shared ? "An outing someone picked for you. Showtimes are on the event's page." :
    "Your outing, picked from " + plural(pick.total, "event that fits", "events that fit") + ". Showtimes are on the event's page.";
  var two = pick.stops.length > 1;
  body += '<div class="outing">' + pick.stops.map(function (s, i) {
    return stopHTML(s, two ? (i === 0 ? "Afternoon" : "Evening") : (isArt(s) ? "The visit" : "The show"), pick.ws, pick.we);
  }).join("") + "</div>";
  body += '<div class="section sharebox"><div class="row"><button class="btn ghost" type="button" id="share-btn">Copy link to this outing</button>' +
    '<span class="hint" id="share-msg" role="status"></span></div><input type="text" id="share-url" readonly hidden aria-label="Link to this outing"></div>';
  if (!pick.shared && pick.alts.length) {
    body += '<div class="section"><h2>Or swap in one of these</h2><div class="alts">' + pick.alts.slice(0, 4).map(function (e) {
      return '<div class="alt">' + outingTileHTML(e) + '<div class="alt-text"><p class="alt-title">' + esc(e.title) + '</p><p class="alt-meta">' + esc(placeText(e)) + " · " + esc(dateText(e)) + " · " + esc(costText(e)) + "</p></div>" +
        '<button class="btn ghost" type="button" data-swap="' + e.id + '">Swap in</button></div>';
    }).join("") + "</div></div>";
  }
  body += '<div class="row" style="margin-top:28px">' +
    (pick.shared ? '<button class="btn" type="button" data-go="plan">Find your own</button><button class="btn ghost" type="button" data-go="catalog">Browse the catalog</button>' :
      (pick.total > 1 ? '<button class="btn ghost" type="button" id="see-all">See all ' + pick.total + " in the catalog</button>" : "") +
      '<button class="textbtn" type="button" data-go="plan">Start over</button>') + "</div>";
  $("res-body").innerHTML = body;
  paintWater($("res-body"));
  show("plan", "res-title");
}
function relaxHTML() {
  var out = [], anyTypes = Object.keys(plan.types).length === 0, anyRegions = Object.keys(plan.regions).length === 0;
  if (plan.budget !== "any") { var n1 = pool(plan.ws, plan.we, "any", plan.types, plan.regions).length; if (n1) out.push(['data-relax="budget"', "Open up the budget", plural(n1, "event fits", "events fit") + " at any price"]); }
  if (!anyTypes) { var n2 = pool(plan.ws, plan.we, plan.budget, {}, plan.regions).length; if (n2) out.push(['data-relax="types"', "Take any type of event", plural(n2, "event fits", "events fit")]); }
  if (!anyRegions) { var n4 = pool(plan.ws, plan.we, plan.budget, plan.types, {}).length; if (n4) out.push(['data-relax="regions"', "Go anywhere nearby", plural(n4, "event fits", "events fit")]); }
  // another time: whichever of the "when" choices has something that fits (CC-79 dropped "the next 30 days")
  whenChoices().filter(function (w) { return w[0] !== plan.when; }).some(function (w) {
    var n3 = pool(w[3][0], w[3][1], plan.budget, plan.types, plan.regions, w[4]).length;
    if (n3) out.push(['data-relax="when" data-when-to="' + w[0] + '"', "Try " + w[1].toLowerCase(), plural(n3, "event fits", "events fit")]);
    return n3 > 0;
  });
  if (!out.length) return '<p class="hint">Try the catalog, where you can loosen one filter at a time.</p>';
  return '<div class="opts">' + out.map(function (o) { return optHTML(o[0], o[1], o[2], null); }).join("") + "</div>";
}
$("res-body").addEventListener("click", function (ev) {
  var t = ev.target;
  var relax = t.closest("[data-relax]");
  if (relax) {
    var r = relax.getAttribute("data-relax");
    if (r === "budget") { plan.budget = "any"; plan.priced = true; } else if (r === "types") plan.types = {}; else if (r === "regions") plan.regions = {};
    else {
      var w = whenChoices().filter(function (c) { return c[0] === relax.getAttribute("data-when-to"); })[0];
      if (w) { plan.when = w[0]; plan.ws = w[3][0]; plan.we = w[3][1]; plan.slot = w[4]; }
    }
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
    resetCatalog(); cat.cost = typeof plan.budget === "number" ? "le" + plan.budget : plan.budget || "any"; cat.types = {}; Object.keys(plan.types).forEach(function (k) { cat.types[k] = 1; });
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
