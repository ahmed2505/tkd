// Minimal DOM stub to run the real browser scripts in Node. `factory[selector]()` returns the fake elements
// that bind() will attach handlers to. Not a test file (lives outside test/ on purpose).
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const C = require('../public/criteria');
const N = require('../public/notes');
const AGE = require('../public/age-category');

const load = (f) => vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../public', f), 'utf8'), { filename: f });
const tick = () => new Promise((r) => setTimeout(r, 15));

function setupDom(routes, factory) {
  const els = {}, cache = {}, attrs = {}, listeners = {};
  // dummy elements can also answer querySelectorAll through `factory` (used by the approval pop-up, which lives outside #app)
  const dummy = () => ({ value: '', dataset: {}, hidden: false, select() {}, remove() {}, focus() {}, querySelectorAll(sel) { const list = factory[sel] ? factory[sel]() : []; els[sel] = list; return list; } });
  const app = {
    _h: '', set innerHTML(h) { this._h = h; }, get innerHTML() { return this._h; },
    querySelectorAll(sel) { const list = factory[sel] ? factory[sel]() : []; els[sel] = list; return list; },
    setAttribute(k, v) { attrs[k] = v; }, removeAttribute(k) { delete attrs[k]; }
  };
  global.self = global;
  global.window = { scrollTo() {} };
  global.location = { origin: 'http://x' };
  global.document = { hidden: false, addEventListener(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); }, getElementById: (id) => (id === 'app' ? app : (cache[id] = cache[id] || dummy())), createElement: dummy, body: { appendChild() {} } };
  global.TKD_CRITERIA = C;
  global.TKD_NOTES = N;
  global.TKD_AGE = AGE;
  global.fetch = async (url, opts) => { (global.__calls = global.__calls || []).push({ url, opts }); return { ok: true, status: 200, json: async () => routes[url] }; };
  load('eval-view.js');
  return { app, els, cache, attrs, listeners };
}
module.exports = { setupDom, load, tick };
