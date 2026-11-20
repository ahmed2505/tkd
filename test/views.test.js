// Smoke tests: run the REAL browser scripts (eval-view.js, coach.js, athlete.js) against a tiny DOM stub and
// assert on the rendered HTML, so descriptions can't leak into the coach UI or vanish from the athlete UI.
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../public/criteria');

const { setupDom, load, tick } = require('../test-helpers/dom');

const KY = C.METRIC_BY_ID.attack;            // kyorugi metric
const FS = C.MODES.freestyle.metrics[0];     // freestyle metric
const KY_CAT = C.CATEGORIES[0];
const kyR = Object.fromEntries(C.MODES.kyorugi.metrics.map((m) => [m.id, 6]));
const fsR = Object.fromEntries(C.MODES.freestyle.metrics.map((m) => [m.id, 8]));
const count = (html, re) => (html.match(re) || []).length;

test('coach UI: form and log details show titles only, in both modes; mode picker switches metric sets', async () => {
  const data = {
    athletes: [{ id: 'a1', name: 'Test Athlete', firstName: 'Test', lastName: 'Athlete', cat: 'Cadet', weight: 50, belt: 'Blue', spec: 'Freestyle', region: 'Tunis', phone: '+21622123456', source: 'coach', hasPw: true, ts: 1 }],
    evaluations: [
      { id: 'e1', ts: 2, pid: 'a1', date: '2026-11-01', stage: 'initial', v: 2, mode: 'kyorugi', r: kyR, total: 120, by: 'المدرب' },
      { id: 'e2', ts: 3, pid: 'a1', date: '2026-11-02', stage: 'mid', v: 2, mode: 'freestyle', r: fsR, total: 80, by: 'المدرب' },
      { id: 'e3', ts: 1, pid: 'a1', date: '2025-01-01', stage: 'final', v: 1, mode: 'poomsae', type: 'po', sc: [10, 10, 5, 8, 8, 5, 5, 10], total: 61, by: 'المدرب' }
    ],
    me: { role: 'coach', name: 'Coach', username: 'c', slug: 'abcdef' }
  };
  const { app, els, cache } = setupDom({ '/api/admin/data': data }, {
    '.tab': () => ['home', 'eval', 'log'].map((v) => ({ dataset: { v } })),
    'input[name=e_m]': () => C.MODE_IDS.map((value) => ({ value })),
    '[data-det]': () => data.evaluations.map((e) => ({ dataset: { det: e.id } })),
    '#f_m': () => []
  });
  load('coach.js'); await tick();

  // 1) evaluation form, default mode = kyorugi
  els['.tab'][1].onclick();
  let html = app.innerHTML;
  assert.match(html, /name="e_m"/, 'mode picker rendered');
  assert.equal(count(html, /type="range"/g), 20);
  assert.ok(html.includes(KY.title), 'metric titles shown');
  assert.ok(!html.includes(KY.description), 'metric description NOT shown to the coach');
  assert.ok(!html.includes('(Offensive'), 'category parenthetical NOT shown to the coach');
  assert.ok(!html.includes('mdesc'));

  // 2) switch to freestyle
  els['input[name=e_m]'].find((r) => r.value === 'freestyle').onchange();
  html = app.innerHTML;
  assert.equal(count(html, /type="range"/g), 10, 'freestyle metric set rendered');
  assert.ok(html.includes(FS.title));
  assert.ok(!html.includes(FS.description), 'freestyle description NOT shown to the coach');
  assert.ok(html.includes('/100'), 'freestyle total is out of its own max');

  // 3) log: tags show the mode, details (all stored modes incl. legacy) show titles only
  els['.tab'][2].onclick();
  html = app.innerHTML;
  assert.ok(html.includes('فري ستايل') && html.includes('قتال') && html.includes('فورمات'));
  assert.match(html, /id="f_m"/, 'log has a mode filter');
  for (const id of ['e1', 'e2', 'e3']) els['[data-det]'].find((b) => b.dataset.det === id).onclick();
  assert.ok(cache.det_e1.innerHTML.includes(KY.title) && !cache.det_e1.innerHTML.includes(KY.description));
  assert.ok(cache.det_e2.innerHTML.includes(FS.title) && !cache.det_e2.innerHTML.includes(FS.description));
  assert.ok(!cache.det_e1.innerHTML.includes(KY_CAT.en) && !cache.det_e2.innerHTML.includes('Technical Performance'));
  assert.ok(cache.det_e3.innerHTML.includes('دقة التقنيات'), 'legacy evaluation still renders');
});

test('athlete UI: every metric shows "title (description)", in both modes, plus per-mode progress', async () => {
  const ev = (id, date, mode, r) => ({ id, date, stage: 'التقييم الأولي', v: 2, mode, r, sc: null, type: '', total: 1, st: '', im: '', goal: '' });
  const data = {
    athlete: { coach: 'Coach', firstName: 'Test', region: 'تونس', belt: 'أزرق', weight: 50, specialty: 'فري ستايل', category: 'كاديت' },
    evaluations: [ev('n2', '2026-11-02', 'freestyle', fsR), ev('n1', '2026-11-01', 'kyorugi', kyR), ev('n0', '2026-10-01', 'freestyle', { ...fsR, fs_creativity: 2 })]
  };
  const { app } = setupDom({ '/api/athlete/me': data }, {});
  load('athlete.js'); await tick();
  const html = app.innerHTML;
  const shown = (m) => html.includes('<b>' + m.title + '</b><span class="mdesc"> (' + m.description + ')</span>');
  assert.ok(C.MODES.kyorugi.metrics.every(shown), 'all 20 kyorugi metrics have title + (description)');
  assert.ok(C.MODES.freestyle.metrics.every(shown), 'all freestyle metrics have title + (description)');
  assert.ok(html.includes('<small>' + KY_CAT.en.replace(/&/g, '&amp;') + '</small>'), 'category explanation shown to the athlete');
  assert.ok(html.includes('فري ستايل') && html.includes('قتال'), 'mode tags');
  assert.equal(count(html, /<h2>تطورك<\/h2>/g), 1, 'one progress card');
  assert.ok(html.includes('<h3 style="margin:14px 0 6px">فري ستايل</h3>') && !html.includes('<h3 style="margin:14px 0 6px">قتال</h3>'), 'progress only for the mode with 2+ evaluations');
});
