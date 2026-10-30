// Checks run in CI before the site deploys (CC-147): Invite a friend and the invite page in Lakefront.
// The dialog's link has a visible label and returns focus to what opened it; the QR screen is paper-white with the
// code in deep lake ink, made here in the browser; the join and invite pages have one-colour headlines with no
// eyebrow and no exclamation mark, and their errors say "Check this:".
//
//     node scripts/test_invite.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const PUB = path.join(__dirname, "..", "public");
const read = (f) => fs.readFileSync(path.join(PUB, f), "utf8");
const html = read("index.html"), css = read("css/site.css"), account = read("js/account.js"), admin = read("js/admin.js");
const has = (s, part, msg) => assert.ok(s.includes(part), msg || "has " + part);
const lacks = (s, part, msg) => assert.ok(!s.includes(part), msg || "lacks " + part);
const between = (s, from, to) => { const i = s.indexOf(from); assert.ok(i >= 0, "finds " + from); return s.slice(i, s.indexOf(to, i)); };

// --- Invite a friend: a square dialog with a labelled link, Copy or Share, Show a QR code, and Done ---
const dlg = between(html, '<dialog class="editor invite-dlg" id="invite-dialog"', "</dialog>");
has(dlg, '<label for="invite-url">Link to the site</label>', "the link has a visible label");
["invite-share", "invite-copy", "invite-qr"].forEach((id) => has(dlg, 'id="' + id + '"'));
has(dlg, '<button class="invite-done" type="submit">Done</button>', "Done closes the dialog (Escape does too, natively)");
has(css, ".invite-dlg::backdrop { background: rgb(14 42 64 / 0.55); }", "the lake scrim at 55%");
has(css, "border: 1.5px solid var(--rule); }", "a square dialog with an ink border");
has(account, 'INVITE_FROM = document.activeElement;\n  $("invite-dialog").showModal();', "remembers what opened it");
has(account, '$("invite-dialog").addEventListener("close", function () { if (!$("qr-full").open) inviteReturnFocus(); });',
  "closing returns focus, unless the QR screen took over");

// --- the QR screen: paper-white in both themes, a flag band, and the code made here, never by an outside service ---
const qr = between(html, '<dialog class="qr-full" id="qr-full"', "</dialog>");
has(qr, '<div class="qr-flag">', "a small flag band");
has(qr, 'role="img" aria-label="QR code for the invite page"');
const qrCss = css.slice(css.indexOf("/* CC-126: the invite QR code fills the screen"));
["--page", "--surface", "--text", "--muted", "--lake", "--lead", "--focus"].forEach((t) => lacks(qrCss, "var(" + t + ")", "the QR screen doesn't follow the theme (" + t + ")"));
has(css, ".qr-full { width: 100%; height: 100%; max-width: none; max-height: none; margin: 0; padding: 0; border: 0; background: #FFFFFF; color: #0E2A40;");
has(account, 'qrSvgText(adminInviteUrl("qr"), "#0E2A40")', "the invite's code is in deep lake ink");
lacks(account + admin, "api.qrserver", "no outside QR service");
lacks(account + admin, "chart.googleapis", "no outside QR service");

const g = { console };
vm.createContext(g);
vm.runInContext(read("js/vendor/qrcode.js"), g);
vm.runInContext(between(admin, "function qrSvgText(text, ink)", "\nfunction qrPngUrl"), g);
const svg = g.qrSvgText("https://chiculturecrew.com/invite?utm_source=invite&utm_medium=qr&utm_campaign=friend", "#0E2A40");
has(svg, '<rect width="', "a white quiet zone");
has(svg, 'fill="#ffffff"');
has(svg, '<path fill="#0E2A40" d="M', "dark modules in lake ink");
has(g.qrSvgText("https://chiculturecrew.com/join"), '<path fill="#111111"', "the QR card keeps its black");

// WCAG contrast of the code's ink on white, and the URL under it: a phone scans best at full contrast
function lum(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const ratio = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
assert.ok(ratio("#0E2A40", "#FFFFFF") >= 7, "the code is at least 7:1 on white");
assert.ok(ratio("#FFFFFF", "#0E3A5B") >= 4.5, "Done is white on the lake");
assert.ok(ratio("#0F5E8C", "#FFFFFF") >= 3, "the focus ring shows on white in both themes");

// --- the join and invite pages: one-colour headlines, no eyebrow, no exclamation mark; the pitch wording kept ---
const join = between(html, '<section class="view" id="view-join"', "</section>");
lacks(join, 'class="eyebrow"', "no eyebrows");
lacks(join, "<em>", "the headline is one colour");
has(join, '<h1 id="jp-title" tabindex="-1">Ready to join the culture crew?</h1>');
has(join, '<h1 id="ip-title" tabindex="-1">Yours truly wants you to be part of the Culture Crew.</h1>', "no exclamation mark");
has(join, "Because live arts need people to choose, commit and communicate in order to thrive. To make that happen, create a profile that saves events and recommends shows.",
  "the pitch's wording stays (the owner approves any change)");
has(join, "Because anything worth seeing is worth seeing together.");
has(join, '<h2 class="jp-look">Look around first</h2>');
has(css, ".jp-cover { display: grid; grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);", "the pitch (7) and the panel (5)");
has(css, '.jp-form .field input[aria-invalid="true"] { border: 2.5px solid var(--text);', "the field at fault: an ink border, never red");
has(account, 'bad($("jp-email"), "Enter a valid email address.")');
has(account, "err.textContent = checkThis(errorText(res));", "errors from the server say Check this: too");
has(account, '"You\'re already in"', "a signed-in visitor sees You're already in");

// --- the counts: a sign-up that came by /join or /invite still says where from ---
has(account, 'sessionStorage.setItem("cc_join", JSON.stringify(VISIT_SOURCE || {}))');
has(account, 'function adminInviteUrl(medium) { return location.origin + "/invite?utm_source=invite&utm_medium=" + medium + "&utm_campaign=friend"; }');

console.log("ok: Invite a friend, the QR screen and the invite page");
