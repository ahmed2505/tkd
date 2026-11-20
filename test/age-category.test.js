// DOB -> age -> category: boundaries, calendar edge cases, validation and the optional federation birth-year mode.
const test = require('node:test');
const assert = require('node:assert/strict');
const AGE = require('../public/age-category');
const { CATEGORIES } = require('../options');

const REF = '2026-11-19'; // fixed reference day so the tests never depend on the real clock
const at = (dob, extra) => AGE.assess(dob, { refDate: REF, ...extra });

test('band boundaries are exact to the day: 12 Cadet, 15 Junior, 18 Senior, under 12 = Kids', () => {
  const cases = [
    ['2014-11-19', 12, 'Cadet'], ['2014-11-20', 11, 'Kids'],   // 12th birthday is today / tomorrow
    ['2011-11-19', 15, 'Junior'], ['2011-11-20', 14, 'Cadet'],
    ['2008-11-19', 18, 'Senior'], ['2008-11-20', 17, 'Junior'],
    ['1980-05-05', 46, 'Senior'], ['2020-01-01', 6, 'Kids']
  ];
  for (const [dob, age, category] of cases) {
    const r = at(dob);
    assert.ok(r.ok, dob);
    assert.deepEqual([r.age, r.category], [age, category], dob);
  }
});

test('leap-day birthdays turn a year older on 1 March in non-leap years', () => {
  assert.equal(AGE.ageOn('2012-02-29', '2026-02-28', 'exact'), 13);
  assert.equal(AGE.ageOn('2012-02-29', '2026-03-01', 'exact'), 14);
  assert.equal(AGE.ageOn('2012-02-29', '2028-02-29', 'exact'), 16);
});

test('invalid, impossible, future, too-young and too-old dates fail with a clear code and Arabic message', () => {
  const code = (dob) => at(dob).error;
  assert.equal(code(''), 'missing');
  assert.equal(code(undefined), 'missing');
  for (const bad of ['abc', '2026-02-30', '2026-13-01', '2026-1-5', '2023-02-29', '12/05/2010']) assert.equal(code(bad), 'invalid', bad);
  assert.equal(code('2999-01-01'), 'future');
  assert.equal(code('2025-06-01'), 'too_young');
  assert.equal(code('1900-01-01'), 'too_old');
  for (const bad of ['', 'abc', '2999-01-01']) { const r = at(bad); assert.equal(r.ok, false); assert.ok(r.message.length > 3); assert.equal(r.category, ''); }
});

test('federation birth-year mode: age = reference year - birth year (born 31 Dec 2011 is 15 in 2026)', () => {
  const exact = at('2011-12-31', { refDate: '2026-01-01' });
  const byYear = at('2011-12-31', { refDate: '2026-01-01', mode: 'birth-year' });
  assert.deepEqual([exact.age, exact.category], [14, 'Cadet']);
  assert.deepEqual([byYear.age, byYear.category], [15, 'Junior']);
  // validation (min/max/future) still uses real exact age, so a birth-year cut-off cannot let junk dates through
  assert.equal(at('1900-01-01', { mode: 'birth-year' }).error, 'too_old');
});

test('assess never throws and describe() renders a label for the UI', () => {
  for (const v of [null, undefined, 0, {}, [], NaN, '\u0000']) assert.doesNotThrow(() => AGE.assess(v));
  assert.match(AGE.describe(at('2012-06-01')), /^14 سنة · ناشئ \(Cadet\)$/);
  assert.match(AGE.describe(at('2020-01-01')), /Under Cadet/);
  assert.match(AGE.todayISO(), /^\d{4}-\d{2}-\d{2}$/);
});

test('categories are defined once: options.js (server dropdown/enum) mirrors age-category.js', () => {
  assert.deepEqual(CATEGORIES.map((c) => c[0]), ['Kids', 'Cadet', 'Junior', 'Senior']);
  assert.equal(AGE.label('Cadet').ar, 'ناشئ');
  assert.equal(AGE.label('Junior').ar, 'شباب');
  assert.equal(AGE.label('Senior').ar, 'كبار');
  for (const b of AGE.BANDS) assert.ok(AGE.label(b.id), b.id);
});
