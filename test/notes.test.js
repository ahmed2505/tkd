const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../public/criteria');
const N = require('../public/notes');
const { setupDom, load, tick } = require('../test-helpers/dom');

const LABELS = ['نقاط القوة', 'المهارات التي يجب تطويرها', 'هدف التقييم القادم', 'التوصيات و الاقتراحات', 'الملاحظات'];
const count = (h, re) => (h.match(re) || []).length;

test('the 5 fields: exact labels and order; only الملاحظات is coach-only', () => {
  assert.deepEqual(N.FIELDS.map((f) => f.label), LABELS);
  assert.deepEqual(N.FIELDS.map((f) => f.key), ['strengths', 'develop', 'goal', 'recommendations', 'notes']);
  assert.equal(new Set(N.FIELDS.map((f) => f.api)).size, 5, 'api names are unique');
  assert.deepEqual(N.fieldsFor('coach').map((f) => f.label), LABELS);
  assert.deepEqual(N.fieldsFor(C.VIEWS.ATHLETE).map((f) => f.label), LABELS.slice(0, 4));
  assert.deepEqual(N.fieldsFor(undefined).map((f) => f.label), LABELS.slice(0, 4), 'unknown view = athlete-level (private field stays hidden)');
  assert.equal(C.VIEWS.COACH, 'coach', 'notes.js hard-codes the coach view name; keep them in sync');
});

test('fromBody: trims, validates type and length, keeps absent fields, accepts the old `im`', () => {
  const ok = N.fromBody({ st: '  قوي  ', dv: 'ركلة', goal: null, rec: 'تمرين', nt: '' });
  assert.deepEqual(ok, { ok: true, values: { strengths: 'قوي', develop: 'ركلة', goal: '', recommendations: 'تمرين', notes: '' } });
  assert.equal(N.fromBody({ st: 5 }).ok, false);
  assert.equal(N.fromBody({ st: {} }).ok, false);
  assert.equal(N.fromBody({ rec: ['x'] }).ok, false);
  const long = N.fromBody({ nt: 'x'.repeat(N.MAX_LEN + 1) });
  assert.equal(long.ok, false);
  assert.match(long.errors.nt, /الملاحظات/);
  assert.equal(N.fromBody({ st: 'x'.repeat(N.MAX_LEN) }).ok, true);
  assert.equal(N.fromBody({ st: '  ' + 'x'.repeat(N.MAX_LEN) + '  ' }).ok, true, 'length is checked after trim');
  assert.equal(N.fromBody({ im: 'من عميل قديم' }).values.develop, 'من عميل قديم', 'legacy payload name');
  assert.equal(N.fromBody({ im: 'قديم', dv: 'جديد' }).values.develop, 'جديد', 'new name wins');
  const base = { strengths: 'أ', develop: 'ب', goal: 'ج', recommendations: 'د', notes: 'هـ' };
  assert.deepEqual(N.fromBody({ st: 'جديد' }, base).values, { ...base, strengths: 'جديد' }, 'absent = keep');
  assert.equal(N.fromBody({ st: null }, base).values.strengths, '', 'null = clear');
  for (const junk of [undefined, null, 'str', 5, []]) assert.equal(N.fromBody(junk).ok, true, 'garbage body does not throw');
});

test('legacy records: fromDoc / fromApi fall back safely and never throw', () => {
  const old = { strengths: 'ق', improve: 'قديم', goal: 'ه', notes: 'خاص' }; // saved before the 5 fields
  assert.deepEqual(N.fromDoc(old), { strengths: 'ق', develop: 'قديم', goal: 'ه', recommendations: '', notes: 'خاص' });
  assert.equal(N.fromDoc({ develop: 'جديد', improve: 'قديم' }).develop, 'جديد');
  assert.equal(N.fromDoc({ develop: '  ', improve: 'قديم' }).develop, 'قديم');
  assert.deepEqual(N.fromApi({ st: 'ق', im: 'قديم', goal: 'ه', nt: 'خاص' }), { strengths: 'ق', develop: 'قديم', goal: 'ه', recommendations: '', notes: 'خاص' });
  for (const junk of [undefined, null, 5, 'x', [], { strengths: 7, develop: {}, goal: null, notes: [1] }]) {
    const a = N.fromDoc(junk), b = N.fromApi(junk);
    assert.deepEqual(Object.keys(a), N.FIELDS.map((f) => f.key));
    assert.ok(Object.values(a).every((v) => typeof v === 'string') && Object.values(b).every((v) => typeof v === 'string'));
  }
  assert.equal(N.fromDoc({ strengths: 7 }).strengths, '7');
});

test('toApi: coach gets all 5, athlete never gets الملاحظات', () => {
  const v = { strengths: 'a', develop: 'b', goal: 'c', recommendations: 'd', notes: 'secret' };
  assert.deepEqual(Object.keys(N.toApi(v)), ['st', 'dv', 'goal', 'rec', 'nt']);
  assert.deepEqual(Object.keys(N.toApi(v, C.VIEWS.COACH)), ['st', 'dv', 'goal', 'rec', 'nt']);
  const a = N.toApi(v, C.VIEWS.ATHLETE);
  assert.deepEqual(Object.keys(a), ['st', 'dv', 'goal', 'rec']);
  assert.ok(!JSON.stringify(a).includes('secret'));
  assert.deepEqual(N.toApi(undefined), { st: '', dv: '', goal: '', rec: '', nt: '' });
});

const evBase = { v: 2, mode: 'kyorugi', r: Object.fromEntries(C.MODES.kyorugi.metrics.map((m) => [m.id, 5])), total: 100, by: 'المدرب' };
const athlete = { id: 'a1', name: 'T A', firstName: 'T', lastName: 'A', cat: 'Cadet', weight: 50, belt: 'Blue', spec: 'Kyorugi', region: 'Tunis', phone: '+21622123456', source: 'coach', hasPw: true, ts: 1 };

test('coach form: 5 labelled textareas in order; edit pre-fills (legacy `im` maps to the new field); save sends the 5 api names', async () => {
  global.__calls = [];
  const data = {
    athletes: [athlete],
    evaluations: [
      { ...evBase, id: 'old', ts: 1, pid: 'a1', date: '2025-01-01', stage: 'initial', st: 'قوي', im: 'ركلة جانبية', goal: 'ميدالية', nt: 'خاص بالمدرب' }, // pre-change shape (no dv / rec)
      { id: 'leg', ts: 0, pid: 'a1', date: '2024-01-01', stage: 'final', v: 1, mode: 'kyorugi', type: 'ky', sc: [10, 10, 5, 8, 8, 5, 5], total: 51, by: 'المدرب' }     // legacy v1 with no note keys at all
    ],
    me: { role: 'coach', name: 'Coach', username: 'c', slug: 'abcdef' },
    '/api/admin/evaluations/old': {}
  };
  const { app, els, cache } = setupDom({ '/api/admin/data': data, '/api/admin/evaluations/old': {} }, {
    '.tab': () => ['home', 'eval', 'log'].map((v) => ({ dataset: { v } })),
    '[data-edev]': () => data.evaluations.map((e) => ({ dataset: { edev: e.id } })),
    '[data-det]': () => data.evaluations.map((e) => ({ dataset: { det: e.id } })),
    'input[type=range]': () => []
  });
  load('coach.js'); await tick();

  els['.tab'][1].onclick(); // new evaluation
  let html = app.innerHTML;
  assert.equal(count(html, /<textarea/g), 5);
  const labels = [...html.matchAll(/<label for="nf_(\w+)">([^<]+)<\/label>/g)].map((m) => m[2]);
  assert.deepEqual(labels, LABELS);
  assert.deepEqual([...html.matchAll(/<textarea id="nf_(\w+)"/g)].map((m) => m[1]), N.FIELDS.map((f) => f.key));
  assert.equal(count(html, /maxlength="1000"/g) >= 5, true);
  assert.equal(count(html, /class="fhint"/g), 1, 'only الملاحظات carries the coach-only hint');
  for (const old of ['نقاط التحسين', 'الهدف القادم', 'ملاحظات خاصة بالمدرب']) assert.ok(!html.includes(old), 'old label gone: ' + old);

  // log details: coach sees all 5 labels' content, legacy + old shapes do not crash
  els['.tab'][2].onclick();
  els['[data-det]'].forEach((b) => b.onclick());
  const d = cache.det_old.innerHTML;
  assert.ok(d.includes('ركلة جانبية') && d.includes('<b>المهارات التي يجب تطويرها</b>'), 'legacy improve shows under the new label');
  assert.ok(d.includes('خاص بالمدرب') && d.includes('<b>الملاحظات</b>'), 'coach sees الملاحظات');
  assert.ok(!cache.det_leg.innerHTML.includes('class="nf"'), 'record without notes renders no empty blocks');

  // edit the old record: form pre-filled from legacy names, and saving sends the new payload
  els['[data-edev]'].find((b) => b.dataset.edev === 'old').onclick();
  html = app.innerHTML;
  assert.ok(html.includes('>ركلة جانبية</textarea>'), 'legacy value pre-filled into المهارات التي يجب تطويرها');
  // type into a field, then save: the PUT carries the 5 api names and no legacy `im`
  cache.nf_recommendations.value = 'تمارين مرونة'; cache.nf_recommendations.oninput();
  cache.saveEval.onclick(); await tick();
  const put = global.__calls.filter((c) => c.opts && c.opts.method === 'PUT').pop();
  assert.equal(put.url, '/api/admin/evaluations/old');
  const body = JSON.parse(put.opts.body);
  assert.deepEqual([body.st, body.dv, body.goal, body.rec, body.nt], ['قوي', 'ركلة جانبية', 'ميدالية', 'تمارين مرونة', 'خاص بالمدرب']);
  assert.ok(!('im' in body), 'new payload uses the new names only');
});

test('legacy v1 evaluation (no note keys at all) opens in the form with empty fields and saves without crashing', async () => {
  global.__calls = [];
  const data = { athletes: [athlete], evaluations: [{ id: 'leg', ts: 0, pid: 'a1', date: '2024-01-01', stage: 'final', v: 1, type: 'ky', sc: [10, 10, 5, 8, 8, 5, 5], total: 51, by: 'المدرب' }], me: { role: 'coach', name: 'C', username: 'c', slug: 'abcdef' } };
  const { app, els, cache } = setupDom({ '/api/admin/data': data, '/api/admin/evaluations/leg': {} }, {
    '.tab': () => ['home', 'eval', 'log'].map((v) => ({ dataset: { v } })),
    '[data-edev]': () => [{ dataset: { edev: 'leg' } }]
  });
  load('coach.js'); await tick();
  els['.tab'][2].onclick();
  els['[data-edev]'][0].onclick();
  assert.equal(count(app.innerHTML, /<textarea/g), 5);
  assert.ok(!/<textarea[^>]*>[^<]+<\/textarea>/.test(app.innerHTML), 'all five empty');
  cache.saveEval.onclick(); await tick();
  const body = JSON.parse(global.__calls.filter((c) => c.opts && c.opts.method === 'PUT').pop().opts.body);
  assert.deepEqual([body.st, body.dv, body.goal, body.rec, body.nt], ['', '', '', '', '']);
});

test('athlete portal: shows the 4 shared fields under their exact labels, never الملاحظات, tolerates old + empty records', async () => {
  const mk = (id, extra) => ({ id, date: '2026-11-01', stage: 'التقييم الأولي', v: 2, mode: 'kyorugi', r: evBase.r, sc: null, type: '', total: 100, ...extra });
  const data = {
    athlete: { coach: 'C', firstName: 'T', region: 'تونس', belt: 'أزرق', weight: 50, specialty: 'قتال', category: 'كاديت' },
    evaluations: [
      mk('n', { st: 'قوة الركل', dv: 'التوازن', goal: 'بطولة', rec: 'راحة كافية', nt: 'SECRET-NOTE' }), // nt must never render, even if a server bug sent it
      mk('o', { st: 'قديم', im: 'تحسين قديم', goal: '' }),                                              // pre-change payload shape
      mk('e', {})                                                                                       // no notes at all
    ]
  };
  const { app } = setupDom({ '/api/athlete/me': data }, {});
  load('athlete.js'); await tick();
  const h = app.innerHTML;
  for (const l of LABELS.slice(0, 4)) assert.ok(h.includes('<b>' + l + '</b>'), 'shows ' + l);
  assert.ok(!h.includes('<b>الملاحظات</b>') && !h.includes('SECRET-NOTE'), 'private notes never shown to the athlete');
  assert.ok(h.includes('راحة كافية') && h.includes('تحسين قديم'));
  assert.ok(h.indexOf('<b>نقاط القوة</b>') < h.indexOf('<b>المهارات التي يجب تطويرها</b>') && h.indexOf('<b>المهارات التي يجب تطويرها</b>') < h.indexOf('<b>هدف التقييم القادم</b>'), 'order');
});
