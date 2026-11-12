// CC-193: the Content-Security-Policy (cc-backend infra/aws/frontend.tf) allows no inline <style>, no inline event
// handlers, and exactly one inline script, the theme script, by its hash. These checks keep the pages inside it.
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const PUB = path.join(__dirname, "..", "public");
// the same value as csp_theme_hash in cc-backend infra/aws/frontend.tf (its tests/test_csp.py ties it to app/seo.py THEME_SCRIPT)
const THEME_HASH = "sha256-fKtflTlilgoEdPhIIhjI+ISyYPQ2B0LkNrNMqwKPy3U=";
let failed = false;
const check = (ok, msg) => { if (!ok) { failed = true; console.error("FAIL: " + msg); } };

for (const f of fs.readdirSync(PUB).filter((n) => n.endsWith(".html"))) {
  const html = fs.readFileSync(path.join(PUB, f), "utf8").replace(/<!--[\s\S]*?-->/g, "");
  check(!/<style[\s>]/i.test(html), `${f}: has a <style> (put the rules in css/)`);
  check(!/\son[a-z]+\s*=/i.test(html), `${f}: has an inline event handler (use addEventListener)`);
  for (const m of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attrs = m[1], body = m[2];
    if (/\bsrc=/.test(attrs) || /ld\+json/.test(attrs)) continue; // files, and data blocks that never run
    const hash = "sha256-" + crypto.createHash("sha256").update(body, "utf8").digest("base64");
    check(hash === THEME_HASH, `${f}: an inline script that isn't the theme script (hash ${hash}); move it to js/`);
  }
}
// a <style> element made by script is blocked too (an inline style="" attribute is allowed, by style-src-attr)
const js = path.join(PUB, "js");
for (const f of fs.readdirSync(js).filter((n) => n.endsWith(".js"))) {
  const code = fs.readFileSync(path.join(js, f), "utf8");
  check(!/createElement\(\s*["']style["']/.test(code), `js/${f}: creates a <style> element (use a constructed stylesheet)`);
  // the dolphin QR (crews.js) puts a <style> in a data: SVG image, which is not part of the page
  if (f !== "crews.js") check(!/["'`]<style/.test(code), `js/${f}: writes a <style> into the page`);
}

if (failed) process.exit(1);
console.log("test_csp: ok");
