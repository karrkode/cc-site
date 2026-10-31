// Checks run in CI before the site deploys (CC-161): the theme button names the change it will make. It says
// "Lights down" in the light theme and "Lights up" in the dark one, in the masthead and the phone sheet (the same
// button). site.css picks the label from data-theme, which the <head> script sets before the page paints, so a saved
// dark theme never shows "Lights down" first. The hidden label is display:none, so it's out of the accessible name.
//
//     node scripts/test_theme.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const ROOT = path.join(__dirname, "..", "public");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const html = read("index.html"), css = read("css/site.css").replace(/\/\*[\s\S]*?\*\//g, ""), core = read("js/core.js");
const test = (name, fn) => { fn(); console.log("ok: " + name); };

const button = (html.match(/<button[^>]*id="theme-toggle"[^>]*>[\s\S]*?<\/button>/) || [])[0];
const headScript = html.match(/<head>[\s\S]*?<script>([\s\S]*?)<\/script>/)[1];
const themeSwitch = core.match(/\/\/ -{10} light\/dark switch[\s\S]*?\n}\)\(\);\n/)[0];

// The rules that hide one label, as "theme -> hidden class", read from site.css
function hiddenIn(theme) {
  const hidden = [];
  const re = /([^{}]*\.theme-toggle[^{}]*)\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(css))) {
    if (!/display:\s*none/.test(m[2])) continue;
    m[1].split(",").forEach((sel) => {
      sel = sel.trim();
      const cls = (sel.match(/\.(to-dark|to-light)$/) || [])[1];
      if (!cls) return;
      const applies = sel.startsWith(':root:not([data-theme="dark"])') ? theme !== "dark"
        : sel.startsWith(':root[data-theme="dark"]') ? theme === "dark" : true;
      if (applies) hidden.push(cls);
    });
  }
  return hidden;
}
// What the button reads (its accessible name too) in a theme: the labels site.css doesn't hide
function label(theme) {
  const spans = [...button.matchAll(/<span class="(to-dark|to-light)">([^<]*)<\/span>/g)];
  const hidden = hiddenIn(theme);
  return spans.filter((s) => !hidden.includes(s[1])).map((s) => s[2]).join("");
}

// The page as the <head> script and the switch see it: a stored theme, maybe blocked storage, and the button
function load(stored, opt) {
  const attrs = {}, store = {}, listeners = {};
  if (stored) store.cc_theme = stored;
  const sandbox = {
    localStorage: opt && opt.blocked ? { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } }
      : { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    document: {
      documentElement: { getAttribute: (k) => (k in attrs ? attrs[k] : null), setAttribute: (k, v) => { attrs[k] = String(v); } },
      getElementById: (id) => (id === "theme-toggle" ? { addEventListener: (t, f) => { listeners[t] = f; } } : null),
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(headScript, sandbox);
  const firstPaint = attrs["data-theme"];
  vm.runInContext(themeSwitch, sandbox);
  return { firstPaint, theme: () => attrs["data-theme"], click: () => listeners.click(), store };
}

test("the button carries both labels and no aria-pressed, which would read as \"Lights up, pressed\"", () => {
  assert.ok(button, "the masthead has the theme button");
  assert.match(button, /<span class="to-dark">Lights down<\/span>/);
  assert.match(button, /<span class="to-light">Lights up<\/span>/);
  assert.doesNotMatch(button, /aria-pressed/);
  assert.doesNotMatch(themeSwitch.replace(/\/\/.*/g, ""), /aria-pressed/, "the switch sets no aria-pressed");
  assert.doesNotMatch(css, /\.theme-toggle[^{]*\[aria-pressed/, "the phone sheet's On/Off is gone");
});

test("the light theme says \"Lights down\" and the dark theme says \"Lights up\"", () => {
  assert.strictEqual(label("light"), "Lights down");
  assert.strictEqual(label("dark"), "Lights up");
});

test("the theme is set in <head>, before the button, so the first paint has the right label", () => {
  assert.ok(html.indexOf(headScript) < html.indexOf("<body"), "the theme script runs before the body");
  assert.strictEqual(load("dark").firstPaint, "dark");
  assert.strictEqual(label(load("dark").firstPaint), "Lights up");
  assert.strictEqual(label(load(null).firstPaint), "Lights down");
  assert.strictEqual(label(load("light").firstPaint), "Lights down");
  assert.strictEqual(label(load("dark", { blocked: true }).firstPaint), "Lights down", "blocked storage is simply light");
});

test("the label flips both ways, and the choice is remembered", () => {
  const p = load(null);
  p.click();
  assert.strictEqual(p.theme(), "dark");
  assert.strictEqual(label(p.theme()), "Lights up");
  assert.strictEqual(p.store.cc_theme, "dark");
  p.click();
  assert.strictEqual(p.theme(), "light");
  assert.strictEqual(label(p.theme()), "Lights down");
  assert.strictEqual(p.store.cc_theme, "light");
  const q = load("dark", { blocked: true });
  q.click();
  assert.strictEqual(q.theme(), "dark", "with storage blocked the button still works until the page closes");
});
