// Culture Crew site: a photo with "I've been" (CC-76).
// Loaded by index.html in order (core, util, catalog, planner, account, crews, submit, admin, hours, found, issues, photos, start); they
// share one global scope, so anything declared here is visible to the files after it.
"use strict";
// Optional, one per event. The browser shrinks the photo (longest side 1600px) and draws it afresh as a JPEG, which
// leaves out its location and camera details; the API checks it with Amazon Rekognition before storing it, and it
// waits for someone from the crew to approve it. Photos are shown through links the API signs for 15 minutes.
var PHOTO = null; // { e, opener, blob } while the dialog is open
var PHOTO_MAX_ORIGINAL = 5 * 1024 * 1024, PHOTO_SIDE = 1600, PHOTO_STATES = { waiting: "Waiting for approval", approved: "Approved", rejected: "Not approved" };

function photoButtonHTML(e) {
  var p = WENT_PHOTO[e.id];
  return '<button type="button" class="went" data-photo="' + esc(e.id) + '" aria-haspopup="dialog" aria-label="' +
    esc((p ? "Your photo from " : "Add a photo from ") + e.title) + (p ? ": " + (PHOTO_STATES[p.status] || p.status) : "") + '">' +
    (p ? "Your photo" : "Add a photo") + "</button>";
}
document.addEventListener("click", function (ev) {
  var b = ev.target.closest("[data-photo]"); if (!b || !AUTH.user) return;
  var e = KNOWN[b.getAttribute("data-photo")]; if (e) openPhoto(e, b);
});
function openPhoto(e, opener) {
  PHOTO = { e: e, opener: opener, blob: null };
  var p = WENT_PHOTO[e.id];
  $("ph-heading").textContent = (p ? "Your photo from " : "Add a photo from ") + e.title;
  $("ph-file").value = ""; $("ph-error").textContent = ""; $("ph-send").disabled = true;
  $("ph-send").textContent = p ? "Send this one instead" : "Send photo";
  $("ph-remove").hidden = !p;
  showPhoto(p ? API + p.url : null, p ? photoState(p) : "");
  $("photo-dialog").showModal(); (p ? $("ph-heading") : $("ph-file")).focus();
}
function photoState(p) {
  return p.status === "rejected" ? "Not approved" + (p.reason ? ": " + p.reason : ".") + " You can send another." :
    p.status === "approved" ? "Approved. Thanks for showing you were there!" : "Waiting for approval. Only you and Culture Crew's approvers can see it.";
}
function showPhoto(src, state) {
  $("ph-box").hidden = !src;
  if (src) { $("ph-img").src = src; $("ph-img").alt = "Your photo from " + PHOTO.e.title; }
  else $("ph-img").removeAttribute("src");
  $("ph-state").textContent = state;
}
$("ph-cancel").addEventListener("click", function () { $("photo-dialog").close(); });
$("photo-dialog").addEventListener("close", function () {
  var was = PHOTO; PHOTO = null;
  if (was && was.preview) URL.revokeObjectURL(was.preview);
  if (!was) return;
  var back = document.querySelector('[data-card="' + was.e.id + '"] [data-photo]'); // the card was redrawn
  (back || (document.contains(was.opener) ? was.opener : null) || $(VIEWS[Object.keys(VIEWS).filter(visible)[0]] || "home-title")).focus();
});
// The chosen photo, shrunk: drawn afresh on a canvas (no location or camera details), as a JPEG.
function shrinkPhoto(file) {
  var load = window.createImageBitmap ? createImageBitmap(file, { imageOrientation: "from-image" }) : new Promise(function (ok, no) {
    var img = new Image(); img.onload = function () { ok(img); }; img.onerror = no; img.src = URL.createObjectURL(file);
  });
  return load.then(function (img) {
    var w = img.width, h = img.height, scale = Math.min(1, PHOTO_SIDE / Math.max(w, h));
    var c = document.createElement("canvas"); c.width = Math.round(w * scale); c.height = Math.round(h * scale);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    if (img.close) img.close();
    return new Promise(function (ok, no) { c.toBlob(function (b) { b ? ok(b) : no(new Error("no blob")); }, "image/jpeg", 0.85); });
  });
}
$("ph-file").addEventListener("change", function () {
  var file = this.files && this.files[0];
  $("ph-error").textContent = ""; $("ph-send").disabled = true; if (!PHOTO) return;
  if (!file) return;
  if (file.size > PHOTO_MAX_ORIGINAL) { $("ph-error").textContent = "That photo is over 5 MB. Choose a smaller one."; return; }
  $("ph-state").textContent = "Getting it ready…";
  shrinkPhoto(file).then(function (blob) {
    if (!PHOTO) return;
    if (PHOTO.preview) URL.revokeObjectURL(PHOTO.preview);
    PHOTO.blob = blob; PHOTO.preview = URL.createObjectURL(blob);
    showPhoto(PHOTO.preview, "Ready to send (" + Math.max(1, Math.round(blob.size / 1024)) + " KB).");
    $("ph-send").disabled = false;
  }, function () {
    $("ph-state").textContent = "";
    $("ph-error").textContent = "This browser can't open that kind of photo. Try a JPEG or PNG.";
  });
});
$("photo-form").addEventListener("submit", function (ev) {
  ev.preventDefault();
  var was = PHOTO; if (!was || !was.blob) return;
  $("ph-send").disabled = true; $("ph-error").textContent = ""; $("ph-state").textContent = "Sending…";
  api("/me/attended/" + encodeURIComponent(was.e.id) + "/photo", { method: "PUT", raw: was.blob }).then(readJSON).then(function (res) {
    if (!res.ok) { $("ph-send").disabled = res.status === 422; $("ph-state").textContent = ""; $("ph-error").textContent = errorText(res); return; }
    WENT_PHOTO[was.e.id] = res.body;
    $("edit-live").textContent = "Photo sent. It's waiting for approval.";
    redrawCards(was.e.id, was.opener.closest("[data-card]"), "[data-photo]");
    $("photo-dialog").close();
  }, function () { $("ph-send").disabled = false; $("ph-state").textContent = ""; $("ph-error").textContent = errorText(null); });
});
$("ph-remove").addEventListener("click", function () {
  var was = PHOTO; if (!was) return;
  this.disabled = true;
  api("/me/attended/" + encodeURIComponent(was.e.id) + "/photo", { method: "DELETE" }).then(function (r) {
    $("ph-remove").disabled = false;
    if (!r.ok) { $("ph-error").textContent = errorText(null); return; }
    delete WENT_PHOTO[was.e.id];
    $("edit-live").textContent = "Photo removed.";
    redrawCards(was.e.id, was.opener.closest("[data-card]"), "[data-photo]");
    $("photo-dialog").close();
  }, function () { $("ph-remove").disabled = false; $("ph-error").textContent = errorText(null); });
});
