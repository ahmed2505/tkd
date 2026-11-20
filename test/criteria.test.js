const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../public/criteria');

const full = (v) => Object.fromEntries(C.METRICS.map((m) => [m.id, v]));

test('structure: 5 categories, 20 metrics, in the specified order', () => {
  assert.equal(C.CATEGORIES.length, 5);
  assert.equal(C.METRICS.length, 20);
  assert.deepEqual(C.CATEGORIES.map((c) => c.metrics.length), [5, 8, 3, 3, 1]);
  assert.equal(new Set(C.METRICS.map((m) => m.id)).size, 20, 'metric ids are unique');
  assert.equal(new Set(C.METRICS.map((m) => m.title)).size, 20, 'metric titles are unique');
  assert.equal(C.MAX_TOTAL, 200);
});

test('exact Arabic titles and parenthetical descriptions are preserved', () => {
  const t = Object.fromEntries(C.METRICS.map((m) => [m.id, m]));
  assert.equal(t.counter.title, 'الهجوم المضاد');
  assert.equal(t.counter.description, 'سرعة وفعالية الرد على هجمات الخصم.'); // trailing dot kept
  assert.equal(t.match_control.description, 'الوقت و النتيجة');            // spacing kept
  assert.equal(t.balance.description, 'المحافظة على التوازن أثناء تنفيذ الركلات وبعدها');
  assert.equal(t.focus.title, 'التركيز');
  assert.equal(C.CATEGORIES[0].title, 'الأداء الهجومي والدفاعي');
  assert.equal(C.CATEGORIES[0].en, 'Offensive & Defensive Performance');
  assert.equal(C.CATEGORIES[2].en, 'Reflexes & Fight IQ');
  assert.equal(C.CATEGORIES[4].title, 'التركيز الذهني');
});

test('parseLabel splits title / description cleanly', () => {
  assert.deepEqual(C.parseLabel('الهجوم (المبادرة بالهجوم)'), { title: 'الهجوم', description: 'المبادرة بالهجوم' });
  assert.deepEqual(C.parseLabel('  بدون وصف  '), { title: 'بدون وصف', description: '' });
  assert.deepEqual(C.parseLabel(null), { title: '', description: '' });
});

test('validateRatings: strict', () => {
  assert.equal(C.validateRatings(full(7)).ok, true);
  assert.equal(C.validateRatings(null).ok, false);
  assert.equal(C.validateRatings([]).ok, false);
  const missing = full(5); delete missing.focus;
  assert.equal(C.validateRatings(missing).ok, false);
  assert.equal(C.validateRatings({ ...full(5), attack: 11 }).ok, false);
  assert.equal(C.validateRatings({ ...full(5), attack: -1 }).ok, false);
  assert.equal(C.validateRatings({ ...full(5), attack: 4.5 }).ok, false);
  assert.equal(C.validateRatings({ ...full(5), attack: '5' }).ok, false);
  assert.equal(C.validateRatings({ ...full(5), hacker: 1 }).ok, false);
  assert.equal(C.validateRatings(JSON.parse('{"__proto__":1}')).ok, false);
});

test('scoreRatings: total and per-category aggregation', () => {
  const s = C.scoreRatings(full(10));
  assert.deepEqual([s.total, s.max, s.pct], [200, 200, 100]);
  assert.deepEqual(s.categories.map((c) => c.max), [50, 80, 30, 30, 10]);
  const r = { ...full(0), attack: 10, counter: 10, speed: 5, focus: 10 };
  const x = C.scoreRatings(r);
  assert.deepEqual(x.categories.map((c) => c.score), [20, 5, 0, 0, 10]);
  assert.equal(x.total, 35);
  assert.equal(x.pct, 18);
  assert.equal(C.scoreRatings(undefined).total, 0);
});

test('describe: v2 evaluation', () => {
  const v = C.describe({ v: 2, ratings: { ...full(5) } });
  assert.equal(v.legacy, false);
  assert.equal(v.groups.length, 5);
  assert.equal(v.groups.reduce((a, g) => a + g.items.length, 0), 20);
  assert.equal(v.total, 100);
  assert.equal(v.pct, 50);
  assert.equal(C.describe({ v: 2, r: full(10) }).total, 200, 'accepts the API shape {r}');
});

test('describe: legacy v1 evaluations still render (7 or 8 scores)', () => {
  const old7 = C.describe({ type: 'ky', scores: [15, 10, 8, 12, 10, 7, 6] });
  assert.equal(old7.legacy, true);
  assert.equal(old7.max, 100);
  assert.equal(old7.total, 68);
  const old8 = C.describe({ type: 'po', sc: [20, 20, 10, 15, 15, 10, 10, 20] });
  assert.equal(old8.max, 120);
  assert.equal(old8.groups[0].items.length, 8);
  assert.equal(C.describe({}).total, 0);
});

// ---------------- Freestyle mode + role-based visibility ----------------
const V = C.VIEWS;
const fsFull = (v) => C.emptyRatings('freestyle') && Object.fromEntries(C.MODES.freestyle.metrics.map((m) => [m.id, v]));

test('modes: kyorugi (original 20 metrics) + freestyle, ids never collide', () => {
  assert.deepEqual(C.MODE_IDS, ['kyorugi', 'freestyle']);
  assert.equal(C.DEFAULT_MODE, 'kyorugi');
  assert.equal(C.MODES.kyorugi.metrics.length, 20);
  assert.equal(C.MODES.freestyle.metrics.length, 10);
  assert.equal(C.MODES.freestyle.max, 100);
  assert.equal(C.MAX_SCORE, 200);
  const ids = C.MODE_IDS.flatMap((m) => C.MODES[m].metrics.map((x) => x.id));
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(C.MODES.freestyle.metrics.every((m) => m.id.startsWith('fs_')));
  assert.equal(C.modeTitle('freestyle'), 'فري ستايل');
});

test('validate/score are mode-specific; kyorugi stays the default (old payloads keep working)', () => {
  assert.equal(C.validateRatings(fsFull(7), 'freestyle').ok, true);
  assert.equal(C.validateRatings(fsFull(7)).ok, false, 'freestyle ratings are not valid kyorugi ratings');
  assert.equal(C.validateRatings(full(7), 'freestyle').ok, false, 'kyorugi ratings are not valid freestyle ratings');
  assert.equal(C.validateRatings(full(7)).ok, true);
  assert.equal(C.validateRatings(full(7), 'kyorugi').ok, true);
  assert.equal(C.validateRatings(full(7), 'poomsae').ok, false);
  assert.equal(C.validateRatings(full(7), '__proto__').ok, false);
  assert.equal(C.validateRatings({ ...fsFull(5), fs_creativity: 11 }, 'freestyle').ok, false);
  assert.equal(C.validateRatings({ ...fsFull(5), attack: 5 }, 'freestyle').ok, false);
  const s = C.scoreRatings(fsFull(10), 'freestyle');
  assert.deepEqual([s.total, s.max, s.pct], [100, 100, 100]);
  assert.deepEqual(s.categories.map((c) => c.max), [30, 40, 30]);
  assert.equal(C.scoreRatings(full(10)).total, 200);
  assert.deepEqual(Object.keys(C.emptyRatings('freestyle')), C.MODES.freestyle.metrics.map((m) => m.id));
  assert.deepEqual(C.emptyRatings('nope'), {});
});

test('modeOf: v2 without mode = kyorugi (pre-Freestyle data); v1 follows its legacy type', () => {
  assert.equal(C.modeOf({ v: 2, ratings: full(1) }), 'kyorugi');
  assert.equal(C.modeOf({ v: 2, mode: 'freestyle' }), 'freestyle');
  assert.equal(C.modeOf({ v: 2, mode: 'garbage' }), 'kyorugi');
  assert.equal(C.modeOf({ type: 'ky', scores: [] }), 'kyorugi');
  assert.equal(C.modeOf({ type: 'po', sc: [] }), 'poomsae');
  assert.equal(C.modeOf({}), '');
});

test('visibility: coach gets titles only, athlete gets "title (description)", unknown view fails closed', () => {
  const m = C.METRIC_BY_ID.counter;
  assert.deepEqual(C.metricLabel(m, V.COACH), { title: 'الهجوم المضاد', description: '', text: 'الهجوم المضاد' });
  assert.equal(C.metricLabel(m, V.ATHLETE).text, 'الهجوم المضاد (سرعة وفعالية الرد على هجمات الخصم.)');
  assert.equal(C.metricLabel(m).text, 'الهجوم المضاد');
  assert.equal(C.metricLabel(m, 'admin').text, 'الهجوم المضاد');
  assert.equal(C.metricLabel({ title: 'بدون وصف', description: '' }, V.ATHLETE).text, 'بدون وصف', 'no empty "()"');
  assert.equal(C.categoryLabel(C.CATEGORIES[0], V.COACH).text, 'الأداء الهجومي والدفاعي');
  assert.equal(C.categoryLabel(C.CATEGORIES[0], V.ATHLETE).text, 'الأداء الهجومي والدفاعي (Offensive & Defensive Performance)');
});

test('describe(ev, view): descriptions only ever reach athlete views, in every mode', () => {
  for (const mode of C.MODE_IDS) {
    const r = Object.fromEntries(C.MODES[mode].metrics.map((m) => [m.id, 5]));
    const ev = { v: 2, mode, ratings: r };
    for (const view of [V.COACH, undefined]) {
      const d = C.describe(ev, view);
      assert.equal(d.mode, mode);
      assert.ok(d.groups.every((g) => g.en === ''));
      assert.ok(d.groups.flatMap((g) => g.items).every((i) => i.description === '' && i.label === i.title));
    }
    const a = C.describe(ev, V.ATHLETE);
    assert.ok(a.groups.every((g) => g.en));
    assert.ok(a.groups.flatMap((g) => g.items).every((i) => i.description && i.label === `${i.title} (${i.description})`));
    assert.equal(a.total, C.describe(ev, V.COACH).total, 'scores are identical for every view');
  }
  const legacy = C.describe({ type: 'ky', scores: [15, 10] }, V.ATHLETE);
  assert.equal(legacy.groups[0].items[0].label, 'الهجوم'); // legacy items have no description: never "()"
  assert.equal(legacy.mode, 'kyorugi');
});
