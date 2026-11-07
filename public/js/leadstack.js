// ---------- the home stack (CC-238) ----------
// Yours Truly's recommendations, as "the pier": the front event faces you, and the next two turn away and recede to the
// right, partly hidden and under a light veil, so the page invites a swipe. The admin's picks are in order in one <ol>,
// so screen readers get a plain list; only their places on the screen change. The order never moves by itself, and after
// the last event it comes back to the first. Swipe or drag, click or tap a back card, or use the arrows and ← → keys
// (the buttons are for desktop only: site.css). catalog.js decides the events and calls stackHTML and stackStart.
"use strict";
var STACK = { list: [], cur: 0, cards: [], hover: -1, busy: false, drag: null, swallow: false, seq: 0, fanned: false };
// The pier's resting places, tuned by eye with the product owner: x in % of the card, z in px, angle in degrees. On a phone
// the two strips share what's left of the width, each still at least 44px to tap.
var STACK_POSE = { angle: 34, x: 70, step: 74, z: 50, phoneX: 54, phoneStep: 37, hoverX: 2.5, out: -135, outAngle: -18 };
var STACK_PHONE = window.matchMedia ? window.matchMedia("(max-width: 700px)") : null;
function stackPhone() { return !!(STACK_PHONE && STACK_PHONE.matches); }

// A place in the stack. k: 0 is the front, 1 and 2 show, and the rest wait unseen behind the third. veil is the strength
// of --veil on the card.
function stackPose(k, hovered) {
  if (k === 0) return { x: 0, z: 0, ry: 0, s: 1, o: 1, veil: 0 };
  var q = Math.min(k, 2), phone = stackPhone(), p = STACK_POSE;
  return { x: (phone ? p.phoneX : p.x) + (q - 1) * (phone ? p.phoneStep : p.step) + (hovered && k <= 2 ? p.hoverX : 0), z: -p.z * q, ry: p.angle,
    s: k > 2 ? 0.97 : 1, o: k > 2 ? 0 : 1, veil: q === 1 ? 1 : 1.5 };
}
function stackExit() { return { x: STACK_POSE.out, z: 0, ry: STACK_POSE.outAngle, s: 1, o: 0, veil: 0 }; }
function stackCss(p) { return "translate3d(" + p.x.toFixed(2) + "%,0," + p.z.toFixed(1) + "px) rotateY(" + p.ry.toFixed(2) + "deg) scale(" + p.s.toFixed(3) + ")"; }
function stackMix(a, b, t) { return a + (b - a) * t; }
function stackPlace(i) { var n = STACK.list.length; return (i - STACK.cur + n) % n; } // this card's k

// Draws every card. d runs from -1 (moved on one) through 0 (at rest) to 1 (moved back one), so a drag can stop anywhere.
function stackPaint(d) {
  var n = STACK.list.length, t = Math.abs(d);
  STACK.cards.forEach(function (c, i) {
    var k = stackPlace(i), a = stackPose(k, STACK.hover === i), b = a, z = 100 - k, o;
    if (d < 0) { if (k === 0) { b = stackExit(); z = 150; } else b = stackPose(k - 1); }
    else if (d > 0) {
      if (k === n - 1) { if (k > 2) a = stackExit(); b = stackPose(0); z = 150; } // the last card comes round to the front
      else b = stackPose(k + 1);
    }
    o = z === 150 ? stackMix(a.o, b.o, d < 0 ? Math.pow(t, 3) : 1 - Math.pow(1 - t, 3)) : stackMix(a.o, b.o, t); // solid while it's in your hand
    c.style.zIndex = z;
    c.style.opacity = o;
    // at rest the front card has no transform at all, so its text stays sharp (CC-235)
    c.style.transform = d === 0 && k === 0 ? "none" : stackCss({ x: stackMix(a.x, b.x, t), z: stackMix(a.z, b.z, t), ry: stackMix(a.ry, b.ry, t), s: stackMix(a.s, b.s, t) });
    c.style.setProperty("--veil-k", stackMix(a.veil, b.veil, t));
  });
}
// The progress bar. A transform, not a width, so it glides without redrawing the page around it.
function stackBar(i) {
  var n = STACK.list.length, bar = $("stack-progress");
  bar.setAttribute("aria-valuenow", i + 1);
  bar.setAttribute("aria-valuetext", (i + 1) + " of " + n);
  $("stack-fill").style.transform = "scaleX(" + ((i + 1) / n).toFixed(4) + ")";
}
// Who's in front: only that card takes the keyboard. The others stay in the list for screen readers.
function stackSettle() {
  STACK.cards.forEach(function (c, i) {
    var front = stackPlace(i) === 0;
    c.classList.toggle("is-front", front);
    c.querySelector("a").tabIndex = front ? 0 : -1;
  });
  stackBar(STACK.cur);
}
function stackMove(d, ms, ease) {
  var st = $("stack"), seq = STACK.seq;
  st.style.setProperty("--stack-dur", ms + "ms");
  st.style.setProperty("--stack-ease", ease || "var(--ease-in-out)");
  st.classList.add("moving");
  void st.offsetWidth; // so the cards start from where they are
  stackPaint(d);
  return new Promise(function (done) { setTimeout(function () { st.classList.remove("moving"); done(seq === STACK.seq); }, ms + 20); });
}
// One step: 1 is the next event, -1 the one before. With reduced motion it changes at once.
function stackStep(dir, ms) {
  var n = STACK.list.length;
  if (STACK.busy || n < 2) return Promise.resolve();
  STACK.busy = true;
  stackBar((STACK.cur + dir + n) % n); // it sets off with the card, rather than after it lands
  var a = document.activeElement, focused = !!a && a.tagName === "A" && $("lead-slot").contains(a), left = dir > 0 ? STACK.cur : -1;
  var land = function (live) {
    if (!live) return; // the stack was redrawn meanwhile
    STACK.cur = (STACK.cur + dir + n) % n; STACK.hover = -1; STACK.busy = false;
    stackSettle(); stackPaint(0);
    $("stack-live").textContent = (STACK.cur + 1) + " of " + n + ": " + STACK.list[STACK.cur].title;
    if (focused) STACK.cards[STACK.cur].querySelector("a").focus({ preventScroll: true });
    // with only a few events the card that left is straight back in view, so it fades in rather than popping
    if (left >= 0 && motionOK() && STACK.cards[left].animate && stackPlace(left) <= 2) STACK.cards[left].animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: "ease-out" });
  };
  if (!motionOK()) { land(true); return Promise.resolve(); }
  return stackMove(-dir, ms || 280).then(land);
}
function stackGoTo(k) { return k <= 0 ? Promise.resolve() : stackStep(1, 170).then(function () { return stackGoTo(k - 1); }); }

// The back cards fan out from behind the front one, the first time in a browser session
function stackFanDue() {
  if (STACK.fanned) return false;
  try { return !sessionStorage.getItem("cc_fan"); } catch (e) { return true; }
}
function stackFanDone() {
  STACK.fanned = true;
  try { sessionStorage.setItem("cc_fan", "1"); } catch (e) {}
}
function stackFan() {
  STACK.cards.forEach(function (c, i) { var k = stackPlace(i); c.style.transform = "none"; c.style.zIndex = 100 - k; c.style.opacity = k > 2 ? 0 : 1; });
  var seq = STACK.seq;
  setTimeout(function () { if (seq === STACK.seq) stackMove(0, 460, "var(--ease-out)"); }, 240);
}

function stackHTML(list) {
  return '<section class="stack" id="stack" aria-label="Yours Truly’s recommendations"><ol class="stack-cards" id="stack-cards" role="list">' +
    list.map(function (e, i) { return '<li class="sc" data-i="' + i + '">' + leadHTML(e) + '<span class="sc-veil" aria-hidden="true"></span></li>'; }).join("") + "</ol>" +
    '<div class="stack-nav"><button class="btn ghost" type="button" data-stack-go="-1" aria-label="Previous event">←</button>' +
    '<span class="stack-progress" id="stack-progress" role="progressbar" aria-label="Where you are in the recommendations" aria-valuemin="1" aria-valuemax="' + list.length + '"><span class="stack-fill" id="stack-fill"></span></span>' +
    '<button class="btn ghost" type="button" data-stack-go="1" aria-label="Next event">→</button></div>' +
    '<p class="sr-only" aria-live="polite" id="stack-live"></p></section>';
}
// After a redraw (signing in adds the crew lines), the same event stays in front.
function stackStart(list) {
  var was = STACK.list[STACK.cur], at = was ? list.findIndex(function (e) { return e.id === was.id; }) : -1;
  STACK.seq += 1; STACK.busy = false; STACK.drag = null; STACK.hover = -1;
  STACK.list = list; STACK.cur = at < 0 ? 0 : at;
  STACK.cards = Array.prototype.slice.call(document.querySelectorAll("#stack-cards .sc"));
  if (list.length < 2) return;
  stackSettle();
  if (motionOK() && stackFanDue() && $("lead-slot").offsetParent) { stackFanDone(); stackFan(); }
  else stackPaint(0);
}

// The slot outlives the cards, so everything listens on it once. A swipe is left or right; up and down stay with the page
// (touch-action: pan-y in site.css), so the stack never traps a scroll.
(function stackListen() {
  var slot = $("lead-slot");
  function rest(ms) { if (motionOK()) stackMove(0, ms, "var(--ease-out)"); else stackPaint(0); }
  slot.addEventListener("pointerdown", function (ev) {
    STACK.swallow = false;
    if (STACK.busy || STACK.list.length < 2 || !ev.target.closest("#stack-cards") || (ev.pointerType === "mouse" && ev.button !== 0)) return;
    STACK.drag = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, at: ev.timeStamp, on: false, dx: 0, w: STACK.cards[0].offsetWidth };
  });
  slot.addEventListener("pointermove", function (ev) {
    var g = STACK.drag; if (!g || ev.pointerId !== g.id) return;
    var dx = ev.clientX - g.x, dy = ev.clientY - g.y;
    if (!g.on) {
      if (Math.abs(dx) < 8) { if (Math.abs(dy) > 12) STACK.drag = null; return; }
      g.on = true; STACK.swallow = true;
      slot.setPointerCapture(ev.pointerId);
    }
    g.dx = dx;
    if (motionOK()) stackPaint(Math.max(-1, Math.min(1, dx / (g.w * 1.05))));
  });
  function letGo(ev) {
    var g = STACK.drag; if (!g || ev.pointerId !== g.id) return;
    STACK.drag = null;
    if (!g.on) return;
    var size = Math.abs(g.dx), fast = size / Math.max(1, ev.timeStamp - g.at) > 0.5;
    if (ev.type === "pointerup" && (size > g.w * 0.22 || (fast && size > 24))) stackStep(g.dx < 0 ? 1 : -1, 240);
    else rest(200);
  }
  slot.addEventListener("pointerup", letGo);
  slot.addEventListener("pointercancel", letGo);
  slot.addEventListener("dragstart", function (ev) { if (ev.target.closest("#stack-cards")) ev.preventDefault(); });
  slot.addEventListener("click", function (ev) {
    if (STACK.swallow) { STACK.swallow = false; ev.preventDefault(); ev.stopPropagation(); return; } // that was a swipe, not a click
    var go = ev.target.closest("[data-stack-go]");
    if (go) { stackStep(Number(go.getAttribute("data-stack-go"))); return; }
    var li = ev.target.closest(".sc");
    if (li && !ev.target.closest("a")) stackGoTo(stackPlace(Number(li.getAttribute("data-i")))); // a back card; the links open events
  });
  slot.addEventListener("keydown", function (ev) {
    if (STACK.list.length < 2 || (ev.key !== "ArrowRight" && ev.key !== "ArrowLeft")) return;
    ev.preventDefault();
    stackStep(ev.key === "ArrowRight" ? 1 : -1);
  });
  // A mouse over a back card nudges it, to say it can be clicked
  slot.addEventListener("pointerover", function (ev) {
    if (ev.pointerType !== "mouse" || STACK.busy || STACK.drag || STACK.list.length < 2) return;
    var li = ev.target.closest(".sc"), i = li ? Number(li.getAttribute("data-i")) : -1;
    if (i >= 0 && stackPlace(i) === 0) i = -1;
    if (i !== STACK.hover) { STACK.hover = i; rest(180); }
  });
  slot.addEventListener("pointerleave", function () { if (STACK.hover >= 0 && !STACK.busy) { STACK.hover = -1; rest(180); } });
  if (STACK_PHONE && STACK_PHONE.addEventListener) STACK_PHONE.addEventListener("change", function () { if (STACK.list.length > 1) stackPaint(0); });
})();
