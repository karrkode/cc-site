// ---------- water (CC-138) ----------
// Events have no photos. Each gets its own patch of lake instead: a pattern drawn on a <canvas> from the event's id, so
// the same event always gets the same water. Theater is choppy, music a steady wave, visual art flattened ripples
// round a point the seed places. White strokes: 42% on row tiles, 24% on the event poster, 13% on the masthead.
// water() is the Lakefront mockup's, ported as it is (design brief, section 4). The masthead and the poster drift
// (CC-144, at the end): drawWater(canvas, t) with the time in seconds.
//
// To use it: put waterHTML(e, "tile" | "poster") inside a .water-field that also carries catClass(e.type), then call
// paintWater(thatElement). The canvas redraws itself when its size or the screen's pixel density changes.
var WATER_ALPHA = { tile: 0.42, poster: 0.24, mast: 0.13 };
var WATER_KINDS = { theater: 1, music: 1, art: 1 };

// The seed for an event id. The mockup's ids were small numbers (id * 53 + 7); other ids are hashed.
function waterSeed(id) {
  var s = String(id);
  if (/^\d{1,9}$/.test(s)) return (Number(s) * 53 + 7) % 233280;
  var h = 0;
  for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 233280;
  return h;
}

function water(canvas, seed, kind, t, place, look) {
  var dpr = Math.min(window.devicePixelRatio || 1, 2), w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  // sharp on high-density screens: the bitmap is the box times the pixel ratio (both sides, so it never stretches)
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
  var ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  var mast = place === "mast";
  ctx.strokeStyle = "rgba(255,255,255," + (WATER_ALPHA[place] || WATER_ALPHA.tile) + ")";
  ctx.lineWidth = place === "tile" ? 1.2 : 1.4;
  var s = seed, r = function () { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  if (kind === "art") {
    var cx = 20 + r() * (w - 40), cy = 15 + r() * (h - 30), step = Math.max(10, Math.min(w, 600) / 11), grow = (t * 6) % step;
    for (var i = 0; i < 14; i++) {
      var rx = i * step + grow; if (rx < 2) continue;
      ctx.beginPath(); ctx.ellipse(cx, cy, rx, rx * .34, 0, 0, Math.PI * 2); ctx.stroke();
    }
    return;
  }
  var gap = mast ? 16 : Math.max(9, Math.min(18, h / 9)), swell = (look && look.swell) || 1;
  var ice = look && look.ice ? lakeIce(w, h, t) : null; // CC-165: winter's floes. The waves stop at their edges.
  if (ice) { ctx.save(); ctx.beginPath(); ctx.rect(0, 0, w, h); ice.forEach(function (f) { floePath(ctx, f); }); ctx.clip("evenodd"); }
  for (var j = 0; j < Math.ceil(h / gap) + 1; j++) {
    var y = 6 + j * gap, a = swell * (kind === "music" ? gap * .3 : gap * (.15 + r() * .3)), f = kind === "music" ? .07 : .03 + r() * .05, ph = r() * 6 + t * .25;
    ctx.beginPath(); ctx.moveTo(0, y + a * Math.sin(ph));
    for (var x = 4; x <= w + 4; x += 4) {
      ctx.lineTo(x, y + a * Math.sin(x * f + ph + (kind === "theater" ? Math.sin(x * .013 + j + t * .05) * 2 : 0)));
    }
    ctx.stroke();
  }
  if (ice) {
    ctx.restore();
    ctx.fillStyle = "rgba(255,255,255," + WATER_ALPHA.mast + ")"; // the water's own 13%: text across ice reads as it does across a wave
    ctx.beginPath(); ice.forEach(function (f) { floePath(ctx, f); }); ctx.fill();
  }
}

// Draws a canvas from its data-water (the place), data-seed and data-kind. Without a time, a drifting canvas is drawn
// where the drift has got to (a resize mustn't jump it back), and the others at 0.
function drawWater(canvas, t) {
  var kind = canvas.getAttribute("data-kind");
  if (t === undefined) t = waterDrifts(canvas) ? WATER_T : 0;
  var place = canvas.getAttribute("data-water"), look = place === "mast" ? LAKE_LOOKS[LAKE.season] : null;
  water(canvas, Number(canvas.getAttribute("data-seed")) || 0, WATER_KINDS[kind] ? kind : "theater", (t || 0) * (look ? look.pace : 1), place, look);
}

// The canvas for an event's tile or poster. It's decoration, so screen readers skip it.
function waterHTML(e, place) {
  return '<canvas class="water" aria-hidden="true" data-water="' + (WATER_ALPHA[place] ? place : "tile") + '" data-seed="' + waterSeed(e.id) +
    '" data-kind="' + (CAT_KEYS[e.type] || "theater") + '"></canvas>';
}

// Draws every water canvas in root, now and whenever it's resized. A canvas in a hidden view has no size; it draws
// when the view shows. A canvas taken off the page reports size 0 and is let go.
var WATER_SIZES = typeof ResizeObserver === "function" ? new ResizeObserver(function (entries) {
  entries.forEach(function (en) { if (en.target.isConnected) drawWater(en.target); else WATER_SIZES.unobserve(en.target); });
}) : null;
function paintWater(root) {
  (root || document).querySelectorAll("canvas.water").forEach(function (c) {
    if (WATER_SIZES) WATER_SIZES.observe(c); else drawWater(c);
    if (waterDrifts(c)) driftWatch(c); // CC-144
  });
}
// Moving the window to a screen with another pixel density redraws at the new density
(function watchDensity() {
  if (!window.matchMedia) return;
  var m = window.matchMedia("(resolution: " + (window.devicePixelRatio || 1) + "dppx)");
  if (!m.addEventListener) return;
  m.addEventListener("change", function () { document.querySelectorAll("canvas.water").forEach(function (c) { drawWater(c); }); watchDensity(); }, { once: true });
})();

// ---------- drift (CC-144) ----------
// The water on the masthead and the event poster drifts: the phase moves 0.25 rad/s and art's ripples grow 6px/s
// (water() above, at t seconds). At most 30 frames a second, and only while the tab shows and the canvas is on the
// screen. Row tiles and the home lead never move. With reduced motion the water is drawn once and stays still.
// motionOK() is the site's one test for reduced motion; catalog.js and account.js use it for the other moments.
var REDUCED_MOTION = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
function motionOK() { return !(REDUCED_MOTION && REDUCED_MOTION.matches); }
var WATER_T = 0; // seconds of drift so far
var DRIFT = { watched: [], shown: [], raf: 0, last: 0, step: 1000 / 30 - 1 }; // step: a frame or two of slack under 33.3ms
function waterDrifts(c) { return !!(c.closest && c.closest("#mast, .poster")); }
var DRIFT_SEEN = typeof IntersectionObserver === "function" && typeof requestAnimationFrame === "function" ? new IntersectionObserver(function (entries) {
  entries.forEach(function (en) {
    var i = DRIFT.shown.indexOf(en.target);
    if (en.isIntersecting && i < 0) DRIFT.shown.push(en.target);
    else if (!en.isIntersecting && i >= 0) DRIFT.shown.splice(i, 1);
  });
  driftWake();
}) : null;
// Watch a drifting canvas for coming on and off the screen; let go of ones a redraw took off the page (the poster's).
function driftWatch(c) {
  if (!DRIFT_SEEN || DRIFT.watched.indexOf(c) >= 0) return;
  DRIFT.watched = DRIFT.watched.filter(function (w) { if (w.isConnected) return true; DRIFT_SEEN.unobserve(w); return false; });
  DRIFT.watched.push(c); DRIFT_SEEN.observe(c);
}
function driftLive() {
  DRIFT.shown = DRIFT.shown.filter(function (c) { return c.isConnected; });
  return motionOK() && !document.hidden && DRIFT.shown.length > 0;
}
// Start the frames if anything should move. The first frame only sets the clock, so a pause never jumps the water.
function driftWake() {
  if (DRIFT.raf || !DRIFT_SEEN || !driftLive()) return;
  DRIFT.last = 0; DRIFT.raf = requestAnimationFrame(driftFrame);
}
function driftFrame(ts) {
  DRIFT.raf = 0;
  if (!driftLive()) return; // paused: driftWake() starts it again
  if (!DRIFT.last) DRIFT.last = ts;
  else if (ts - DRIFT.last >= DRIFT.step) {
    WATER_T += Math.min(ts - DRIFT.last, 100) / 1000; DRIFT.last = ts; // a stalled frame doesn't lurch it forward
    DRIFT.shown.forEach(function (c) { drawWater(c, WATER_T); });
  }
  DRIFT.raf = requestAnimationFrame(driftFrame);
}
if (document.addEventListener) document.addEventListener("visibilitychange", driftWake);
if (REDUCED_MOTION && REDUCED_MOTION.addEventListener) REDUCED_MOTION.addEventListener("change", driftWake);

// ---------- the lake through the year (CC-165) ----------
// The masthead follows the real lake by the visitor's clock, in Chicago time. Winter (December to February) is grey-green
// and slow, with a few ice floes; summer (June to August) bright and lively; spring and autumn in between. From half an
// hour before sunset until 5am the band takes a dusk tone. The colours are --lake-* in site.css; the masthead carries
// data-season and data-dusk. Only the masthead: tiles and posters keep their water. With reduced motion it stays still
// (the drift never runs, so t is 0). ?lake=winter (or spring, summer, autumn; add ",dusk") shows one, to judge by eye.
var LAKE_LOOKS = { // pace: how fast it drifts · swell: how tall the waves are · ice: floes
  winter: { pace: .5, swell: .7, ice: true },
  spring: { pace: 1, swell: 1 },
  summer: { pace: 1.4, swell: 1.25 },
  autumn: { pace: 1, swell: 1 },
};
// Chicago's sunset on the 15th of each month, in minutes after midnight on the clock (daylight saving included)
var LAKE_SUNSET = [1005, 1040, 1135, 1170, 1200, 1228, 1225, 1195, 1145, 1095, 995, 982];
var LAKE = { season: "", dusk: false };

// The season and dusk for a moment, in Chicago time
function lakeNow(when) {
  var parts = {};
  new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", month: "numeric", hour: "numeric", minute: "numeric", hourCycle: "h23" })
    .formatToParts(when).forEach(function (p) { parts[p.type] = Number(p.value); });
  var m = parts.month, mins = (parts.hour % 24) * 60 + parts.minute;
  var season = m === 12 || m <= 2 ? "winter" : m <= 5 ? "spring" : m <= 8 ? "summer" : "autumn";
  return { season: season, dusk: mins >= LAKE_SUNSET[m - 1] - 30 || mins < 5 * 60 };
}
// ?lake=summer,dusk: a season to show, whatever the clock says
function lakeAsked(search) {
  var m = /[?&]lake=([a-z,]+)/.exec(search || ""), bits = m ? m[1].split(",") : [];
  return LAKE_LOOKS[bits[0]] ? { season: bits[0], dusk: bits.indexOf("dusk") > 0 } : null;
}
// The floes: a few flat, ragged pieces of ice, the same ones every time, drifting east 3px a second
function lakeIce(w, h, t) {
  var s = 811, r = function () { s = (s * 9301 + 49297) % 233280; return s / 233280; }, n = Math.max(2, Math.round(w / 260)), out = [];
  for (var i = 0; i < n; i++) {
    var rx = 26 + r() * 40, span = w + rx * 2, x = ((i + .2 + r() * .6) * span / n + t * 3) % span - rx, pts = [];
    for (var k = 0; k < 7; k++) pts.push(.7 + r() * .3);
    out.push({ x: x, y: h * (.15 + r() * .7), rx: rx, ry: rx * (.22 + r() * .12), pts: pts });
  }
  return out;
}
function floePath(ctx, f) {
  f.pts.forEach(function (k, i) {
    var a = i / f.pts.length * Math.PI * 2, x = f.x + Math.cos(a) * f.rx * k, y = f.y + Math.sin(a) * f.ry * k;
    if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  });
  ctx.closePath();
}
// Sets the masthead's season and dusk, and redraws its water when they change. Checked every minute.
function lakeApply() {
  var now = lakeAsked(typeof location === "object" && location.search) || lakeNow(new Date()), mast = $("mast");
  if (now.season === LAKE.season && now.dusk === LAKE.dusk) return;
  LAKE.season = now.season; LAKE.dusk = now.dusk;
  if (!mast || !mast.setAttribute) return;
  mast.setAttribute("data-season", now.season);
  if (now.dusk) mast.setAttribute("data-dusk", ""); else mast.removeAttribute("data-dusk");
  mast.querySelectorAll("canvas.water").forEach(function (c) { drawWater(c); });
}
lakeApply();
if (typeof setInterval === "function") setInterval(lakeApply, 60000);

paintWater($("mast"));
