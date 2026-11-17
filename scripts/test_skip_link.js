// Checks run in CI before the site deploys (CC-291): the skip link is the first thing in the page and points at <main>,
// and the page's ids are unique, so an aria-labelledby or aria-controls never lands on the wrong element (the Engagement
// table was once labelled by the Source grid's heading). The full axe scan needs a running site: scripts/test_a11y.js.
//
//     node scripts/test_skip_link.js
"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const PUB = path.join(__dirname, "..", "public");
const html = fs.readFileSync(path.join(PUB, "index.html"), "utf8");
const start = fs.readFileSync(path.join(PUB, "js", "start.js"), "utf8");
const css = fs.readFileSync(path.join(PUB, "css", "site.css"), "utf8");

const body = html.slice(html.indexOf("<body>") + 6).trimStart();
assert.ok(body.startsWith('<a class="skip-link" id="skip-link" href="#main">'), "the skip link is the first thing in <body>");
assert.ok(/<main id="main" tabindex="-1">/.test(html), "<main> is the skip link's target and can take focus");
assert.ok(/\$\("skip-link"\)\.addEventListener\("click", function \(ev\) \{ ev\.preventDefault\(\); \$\("main"\)\.focus\(\); \}\)/.test(start),
  "start.js moves focus to <main> without changing the address");
assert.ok(/\.skip-link:focus \{ top: 12px; \}/.test(css) && /\.skip-link \{[^}]*top: -64px/.test(css), "it is off-screen until it has focus");

const markup = html.replace(/<!--[\s\S]*?-->/g, "").replace(/<script[\s\S]*?<\/script>/g, "");
const ids = [...markup.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
const seen = new Set(), dupes = new Set();
ids.forEach((id) => { if (seen.has(id)) dupes.add(id); seen.add(id); });
assert.deepStrictEqual([...dupes], [], "ids are unique: " + [...dupes].join(", "));
for (const m of markup.matchAll(/aria-(?:labelledby|controls|describedby)="([^"]+)"/g)) {
  m[1].split(/\s+/).forEach((id) => assert.ok(seen.has(id), "aria reference to " + id + " finds an element"));
}
console.log("ok");
