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

function water(canvas, seed, kind, t, place) {
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
  var gap = mast ? 16 : Math.max(9, Math.min(18, h / 9));
  for (var j = 0; j < Math.ceil(h / gap) + 1; j++) {
    var y = 6 + j * gap, a = kind === "music" ? gap * .3 : gap * (.15 + r() * .3), f = kind === "music" ? .07 : .03 + r() * .05, ph = r() * 6 + t * .25;
    ctx.beginPath(); ctx.moveTo(0, y + a * Math.sin(ph));
    for (var x = 4; x <= w + 4; x += 4) {
      ctx.lineTo(x, y + a * Math.sin(x * f + ph + (kind === "theater" ? Math.sin(x * .013 + j + t * .05) * 2 : 0)));
    }
    ctx.stroke();
  }
}

// Draws a canvas from its data-water (the place), data-seed and data-kind. Without a time, a drifting canvas is drawn
// where the drift has got to (a resize mustn't jump it back), and the others at 0.
function drawWater(canvas, t) {
  var kind = canvas.getAttribute("data-kind");
  if (t === undefined) t = waterDrifts(canvas) ? WATER_T : 0;
  water(canvas, Number(canvas.getAttribute("data-seed")) || 0, WATER_KINDS[kind] ? kind : "theater", t || 0, canvas.getAttribute("data-water"));
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

paintWater($("mast"));
