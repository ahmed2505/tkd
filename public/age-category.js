/* Single source of truth for DOB -> age -> competition category.
 * Loaded by the server (require) and by the browser (<script src="/age-category.js">), exactly like criteria.js,
 * so the live UI hint and the authoritative server check can never disagree.
 *
 * RULE (default, "exact" age):   Cadet 12-14 | Junior 15-17 | Senior 18+ | under 12 -> "Kids" (Under Cadet)
 *
 * HOW TO ADJUST
 *  1) Federation birth-year cutoff instead of exact age (many federations, e.g. WT-style calendar-year rules,
 *     class an athlete by `competition year - birth year`, so someone born on 31 Dec 2012 and someone born on
 *     1 Jan 2012 are the same age class all season). Set  AGE_MODE = 'birth-year'  below. The reference year is
 *     then the current year, or pass { refDate: 'YYYY-12-31' } (e.g. the competition season) to assess().
 *     VERIFY the exact wording of your federation's current rules before switching: this file only implements
 *     the arithmetic, it does not know which rule your federation applies this season.
 *  2) Different age bands: edit BANDS only (min age inclusive, ordered from oldest to youngest).
 *  3) Reject under-12s instead of labelling them "Kids": set ALLOW_UNDER_CADET = false.
 *  4) Arabic / English labels: edit CATEGORIES only (options.js and the coach dashboard read them from here).
 *
 * All date maths uses the Y-M-D integers of the string (never `new Date(string)`), so it is timezone-proof;
 * "today" is taken in the club's timezone (TIME_ZONE), not the server's. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TKD_AGE = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var AGE_MODE = 'exact';            // 'exact' (birthday-based) | 'birth-year' (refYear - birthYear)
  var ALLOW_UNDER_CADET = true;      // false => ages below the Cadet minimum fail validation ("under_cadet")
  var MIN_AGE = 3;                   // existing rule: anything younger is treated as a typo
  var MAX_AGE = 90;                  // existing rule: anything older is treated as a typo
  var TIME_ZONE = 'Africa/Tunis';

  // Stored value (English id) + labels. `Kids` is the explicit "Under Cadet" bucket.
  var CATEGORIES = [
    { id: 'Kids', ar: 'أقل من ناشئ', en: 'Under Cadet / Kids' },
    { id: 'Cadet', ar: 'ناشئ', en: 'Cadet' },
    { id: 'Junior', ar: 'شباب', en: 'Junior' },
    { id: 'Senior', ar: 'كبار', en: 'Senior' }
  ];
  // Oldest first; the first band whose `min` <= age wins. Ages are inclusive of `min`.
  var BANDS = [
    { id: 'Senior', min: 18 },
    { id: 'Junior', min: 15 },
    { id: 'Cadet', min: 12 }
  ];
  var UNDER = 'Kids';

  var ERRORS = {
    missing: 'اكتب تاريخ الميلاد.',
    invalid: 'تاريخ الميلاد غير صحيح.',
    future: 'تاريخ الميلاد لا يمكن أن يكون في المستقبل.',
    too_young: 'تاريخ الميلاد غير صحيح.',
    too_old: 'تاريخ الميلاد غير صحيح.',
    under_cadet: 'التسجيل مفتوح من سن ' + BANDS[BANDS.length - 1].min + ' سنة فما فوق.'
  };

  var DOB_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

  function label(id) {
    for (var i = 0; i < CATEGORIES.length; i++) if (CATEGORIES[i].id === id) return CATEGORIES[i];
    return null;
  }

  // 'YYYY-MM-DD' for "today" in the club's timezone (falls back to UTC if Intl/timeZone is unavailable).
  function todayISO(now) {
    var d = now || new Date();
    try {
      var s = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
      if (DOB_RE.test(s)) return s;
    } catch (e) { /* fall through */ }
    return d.toISOString().slice(0, 10);
  }

  // Strict calendar parse: rejects 2026-02-30, 2026-13-01, 2026-1-5 ...
  function parseISO(s) {
    var m = DOB_RE.exec(String(s == null ? '' : s));
    if (!m) return null;
    var y = +m[1], mo = +m[2], d = +m[3];
    if (mo < 1 || mo > 12 || d < 1) return null;
    var dim = [31, (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];
    return d <= dim ? { y: y, m: mo, d: d } : null;
  }

  // Age on `ref` ('YYYY-MM-DD'). mode 'exact' = completed years; 'birth-year' = ref year - birth year.
  function ageOn(dob, ref, mode) {
    var b = parseISO(dob), r = parseISO(ref);
    if (!b || !r) return NaN;
    if ((mode || AGE_MODE) === 'birth-year') return r.y - b.y;
    var a = r.y - b.y;
    if (r.m < b.m || (r.m === b.m && r.d < b.d)) a--;
    return a;
  }

  function categoryForAge(age) {
    for (var i = 0; i < BANDS.length; i++) if (age >= BANDS[i].min) return BANDS[i].id;
    return UNDER;
  }

  /* assess(dob, opts?) -> { ok, error, message, age, category, label }
   *   opts.refDate  'YYYY-MM-DD' reference day (default: today in TIME_ZONE) e.g. season cut-off date
   *   opts.mode     override AGE_MODE for this call
   * Never throws. `ok:false` carries a machine code in `error` and an Arabic `message` for the UI. */
  function assess(dob, opts) {
    opts = opts || {};
    var fail = function (code, extra) { var o = { ok: false, error: code, message: ERRORS[code], age: NaN, category: '', label: null }; if (extra != null) o.age = extra; return o; };
    if (dob == null || String(dob).trim() === '') return fail('missing');
    var b = parseISO(String(dob).trim());
    if (!b) return fail('invalid');
    var today = todayISO();
    var ref = opts.refDate && parseISO(opts.refDate) ? opts.refDate : today;
    // The birth date itself must not be after *today* (a season cut-off in the future is fine).
    if (String(dob).trim() > today) return fail('future');
    var exact = ageOn(dob, ref, 'exact');
    if (exact < MIN_AGE) return fail('too_young', exact);
    if (exact > MAX_AGE) return fail('too_old', exact);
    var age = ageOn(dob, ref, opts.mode || AGE_MODE); // the number the category is derived from
    var category = categoryForAge(age);
    if (category === UNDER && !ALLOW_UNDER_CADET) return fail('under_cadet', age);
    return { ok: true, error: '', message: '', age: age, category: category, label: label(category) };
  }

  // Display helper: "13 سنة · ناشئ (Cadet)"
  function describe(a) {
    if (!a || !a.ok) return a && a.message ? a.message : '';
    return a.age + ' سنة · ' + a.label.ar + ' (' + a.label.en + ')';
  }

  return Object.freeze({
    AGE_MODE: AGE_MODE, ALLOW_UNDER_CADET: ALLOW_UNDER_CADET, MIN_AGE: MIN_AGE, MAX_AGE: MAX_AGE, TIME_ZONE: TIME_ZONE,
    CATEGORIES: CATEGORIES, BANDS: BANDS, ERRORS: ERRORS,
    label: label, todayISO: todayISO, parseISO: parseISO, ageOn: ageOn, categoryForAge: categoryForAge, assess: assess, describe: describe
  });
});
