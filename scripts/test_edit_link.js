// CC-256: in the edit and approve dialog, the word "Link" opens the URL field's address in a new tab, for http(s) only.
//
//     node scripts/test_edit_link.js
"use strict";
const fs = require("fs"), path = require("path"), assert = require("assert");
const PUB = path.join(__dirname, "..", "public");
const html = fs.readFileSync(path.join(PUB, "index.html"), "utf8"), util = fs.readFileSync(path.join(PUB, "js/util.js"), "utf8");
const admin = fs.readFileSync(path.join(PUB, "js/admin.js"), "utf8"), found = fs.readFileSync(path.join(PUB, "js/found.js"), "utf8");

assert.ok(!/<label[^>]*for="ed-url"/.test(html), "the label is a span, not a <label>");
assert.ok(/id="ed-url"[^>]*aria-label="Link"/.test(html), "the field keeps the name Link");
assert.ok(/id="s-url"/.test(html) && /for="s-url"/.test(html), "Submit an event is unchanged");
assert.ok(/edLinkSync\(\)/.test(admin) && /edLinkSync\(\)/.test(found) && /"ed-url"\)\.addEventListener\("input", edLinkSync\)/.test(admin), "kept in step on open and on typing");

const code = util.slice(util.indexOf("function webLink"), util.indexOf("function safeUrl"));
const els = {};
const mk = () => ({ children: [], textContent: "", appendChild(c) { this.children.push(c); this.textContent = c.textContent; } });
els["ed-url-lab"] = mk(); els["ed-url"] = { value: "" };
const document = { createElement: () => ({}) };
const f = new Function("$", "document", code + "; return { webLink, edLinkSync };")((id) => els[id], document);

for (const v of ["https://example.com/a", "http://example.com", "  HTTPS://Example.com  "]) assert.ok(f.webLink(v), v + " opens");
for (const v of ["", "   ", "javascript:alert(1)", "data:text/html,x", "ftp://x.com", "example.com", "https://", "//x.com", "vbscript:x"]) assert.strictEqual(f.webLink(v), "", JSON.stringify(v) + " never opens");

els["ed-url"].value = "https://example.com/x"; els["ed-url-lab"].children = [];
f.edLinkSync();
const a = els["ed-url-lab"].children[0];
assert.ok(a && a.href === "https://example.com/x" && a.target === "_blank" && a.rel === "noopener noreferrer" && a.textContent === "Link", "a real link");
els["ed-url"].value = "javascript:alert(1)"; f.edLinkSync();
assert.strictEqual(els["ed-url-lab"].textContent, "Link"); assert.strictEqual(els["ed-url-lab"].children.length, 1 /* none added */);
console.log("ok");
