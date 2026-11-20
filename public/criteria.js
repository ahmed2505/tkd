/* Canonical evaluation criteria, grouped by evaluation MODE (Kyorugi, Freestyle, ...).
 * The ONLY place metrics are defined. Loaded by the server (require) and by the browser
 * (<script src="/criteria.js">), so titles, descriptions, scale, validation, scoring and the
 * role-based visibility rule can never drift between components.
 *
 * VISIBILITY RULE (single gate): a metric's parenthetical description is exposed ONLY when the
 * view is VIEWS.ATHLETE. Any other / missing view fails closed to "title only".
 * Use metricLabel() / categoryLabel() / describe(ev, view); never read `.description` directly in a UI. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TKD_CRITERIA = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Every metric is scored with an integer in [min, max]. Change it here only.
  const SCALE = Object.freeze({ min: 0, max: 10 });

  // ---- who is looking: the role context passed to every renderer ----
  const VIEWS = Object.freeze({ COACH: 'coach', ATHLETE: 'athlete' });
  const showsDescriptions = (view) => view === VIEWS.ATHLETE; // fail closed

  // Raw source of truth per mode: 'Arabic title (description)'. Never split by hand; parseLabel() does it.
  const SOURCE = {
    kyorugi: [
      { id: 'combat', label: 'الأداء الهجومي والدفاعي (Offensive & Defensive Performance)', metrics: [
        ['attack', 'الهجوم (المبادرة بالهجوم واختيار الضربات المناسبة)'],
        ['counter', 'الهجوم المضاد (سرعة وفعالية الرد على هجمات الخصم.)'],
        ['defense', 'الدفاع (تفادي ضربات الخصم وحماية النقاط المستهدفة)'],
        ['kick_variety', 'تنوع الركلات (تقنيات ركل مختلفة)'],
        ['accuracy', 'الدقة (دقة توجيه الركلات نحو الهدف)']
      ] },
      { id: 'physical', label: 'القدرات البدنية والحركية (Physical & Motor Abilities)', metrics: [
        ['speed', 'السرعة (سرعة تنفيذ الركلات)'],
        ['power', 'القوة (قوة تنفيذ الركلات)'],
        ['fitness', 'اللياقة البدنية (الاستعداد البدني)'],
        ['endurance', 'التحمل (المحافظة على الأداء طوال الجولات)'],
        ['flexibility', 'المرونة (تنفيذ الركلات بمختلف الارتفاعات)'],
        ['balance', 'التوازن (المحافظة على التوازن أثناء تنفيذ الركلات وبعدها)'],
        ['agility', 'الرشاقة (سرعة تغيير الاتجاه والتحرك داخل البساط)'],
        ['explosiveness', 'الانفجارية (حركات سريعة وقوية ومفاجئة)']
      ] },
      { id: 'reflexes', label: 'الاستجابة والذكاء القتالي (Reflexes & Fight IQ)', metrics: [
        ['reflex', 'سرعة رد الفعل (الاستجابة السريعة لهجوم المنافس)'],
        ['fight_iq', 'الذكاء القتالي (قراءة أسلوب المنافس والتنبؤ بتحركاته)'],
        ['decision', 'سرعة اتخاذ القرار (اختيار التصرف المناسب في الوقت المناسب)']
      ] },
      { id: 'tactics', label: 'التكتيك وإدارة النزال (Tactics & Match Control)', metrics: [
        ['tactics', 'التكتيك (حسن اختيار الاستراتيجيات حسب أسلوب الخصم)'],
        ['match_control', 'التحكم في المباراة (الوقت و النتيجة)'],
        ['distance_control', 'التحكم في المسافة (ضبط المسافة مع المنافس)']
      ] },
      { id: 'focus', label: 'التركيز الذهني (Mental Focus)', metrics: [
        ['focus', 'التركيز (الانتباه و التركيز مع الخصم)']
      ] }
    ],
    // Freestyle: 3 categories, 10 metrics. Ids are prefixed `fs_` so they can never collide with Kyorugi ids
    // (Excel columns, stored ratings). Wording is a first draft: edit titles/descriptions here only.
    freestyle: [
      { id: 'fs_technique', label: 'الأداء التقني (Technical Performance)', metrics: [
        ['fs_difficulty', 'صعوبة الحركات (مستوى تعقيد الركلات والقفزات والدورانات)'],
        ['fs_execution', 'جودة التنفيذ (نظافة وإتقان الحركات)'],
        ['fs_power_speed', 'القوة والسرعة (قوة وسرعة الركلات داخل التسلسل)']
      ] },
      { id: 'fs_artistry', label: 'الجانب الفني والإبداعي (Creativity & Artistry)', metrics: [
        ['fs_creativity', 'الإبداع (ابتكار حركات وتركيبات جديدة)'],
        ['fs_choreography', 'التصميم الحركي (تسلسل الحركات وانسجامها)'],
        ['fs_rhythm', 'الإيقاع والموسيقى (التناغم بين الحركات والموسيقى)'],
        ['fs_presence', 'الحضور والتعبير (الثقة والتأثير على الحكام والجمهور)']
      ] },
      { id: 'fs_physical', label: 'القدرات البدنية (Physical Qualities)', metrics: [
        ['fs_control', 'الثبات والتحكم (التحكم في الجسم أثناء القفزات والدورانات والهبوط)'],
        ['fs_flex', 'المرونة الحركية (ارتفاع ومدى الركلات)'],
        ['fs_stamina', 'اللياقة والاستمرارية (الحفاظ على جودة الأداء حتى نهاية العرض)']
      ] }
    ]
  };

  // Mode display info. `poomsae` exists for legacy (v1) evaluations only: it has no scorable metric set.
  const MODE_INFO = Object.freeze({
    kyorugi: Object.freeze({ title: 'قتال', en: 'Kyorugi' }),
    freestyle: Object.freeze({ title: 'فري ستايل', en: 'Freestyle' }),
    poomsae: Object.freeze({ title: 'فورمات', en: 'Poomsae' })
  });
  const DEFAULT_MODE = 'kyorugi';
  const LEGACY_MODE = Object.freeze({ ky: 'kyorugi', po: 'poomsae' });
  const FILTER_MODES = Object.freeze(['kyorugi', 'freestyle', 'poomsae']); // everything an evaluation list can be filtered by
  const modeTitle = (id) => (MODE_INFO[id] ? MODE_INFO[id].title : '');

  /** 'العنوان (الوصف)' -> { title, description }. Splits on the final parenthetical only. */
  function parseLabel(raw) {
    const s = String(raw == null ? '' : raw).trim();
    const m = /^(.*?)\s*\(([^()]*)\)\s*$/.exec(s);
    return m ? { title: m[1].trim(), description: m[2].trim() } : { title: s, description: '' };
  }

  function buildMode(id, source) {
    const categories = Object.freeze(source.map((c) => {
      const head = parseLabel(c.label); // description of a category = its English name
      const metrics = c.metrics.map(([mid, label]) => {
        const p = parseLabel(label);
        return Object.freeze({ id: mid, category: c.id, mode: id, title: p.title, description: p.description, min: SCALE.min, max: SCALE.max });
      });
      return Object.freeze({ id: c.id, mode: id, title: head.title, en: head.description, metrics: Object.freeze(metrics), max: metrics.length * SCALE.max });
    }));
    const metrics = Object.freeze(categories.flatMap((c) => c.metrics));
    const byId = Object.freeze(Object.fromEntries(metrics.map((m) => [m.id, m])));
    return Object.freeze({ id, ...MODE_INFO[id], categories, metrics, byId, max: metrics.length * SCALE.max });
  }
  const MODES = Object.freeze(Object.fromEntries(Object.keys(SOURCE).map((id) => [id, buildMode(id, SOURCE[id])])));
  const MODE_IDS = Object.freeze(Object.keys(MODES)); // scorable modes
  (function assertUniqueIds() { // ids are storage keys + Excel columns (cat_*, m_*): a clash inside one namespace would corrupt data silently
    const cats = new Set(), mets = new Set();
    const add = (set, x, kind) => { if (set.has(x)) throw new Error('duplicate ' + kind + ' id: ' + x); set.add(x); };
    MODE_IDS.forEach((id) => MODES[id].categories.forEach((c) => { add(cats, c.id, 'category'); c.metrics.forEach((m) => add(mets, m.id, 'metric')); }));
  })();

  const getMode = (id) => (typeof id === 'string' && Object.prototype.hasOwnProperty.call(MODES, id) ? MODES[id] : null);
  const pct = (score, max) => (max ? Math.round((score / max) * 100) : 0);

  /** Mode of ANY stored evaluation. v2 without `mode` (saved before Freestyle) = Kyorugi; v1 follows its legacy `type`. */
  function modeOf(ev) {
    ev = ev || {};
    if (Number(ev.v) === 2) return getMode(ev.mode) ? ev.mode : DEFAULT_MODE;
    return LEGACY_MODE[ev.type] || '';
  }

  // ---- role-based visibility: THE shared formatting helpers ----
  /** Label for one metric as the given view may see it. text = "title" (coach) or "title (description)" (athlete). */
  function metricLabel(metric, view) {
    const title = (metric && metric.title) || '';
    const description = showsDescriptions(view) && metric && metric.description ? metric.description : '';
    return { title, description, text: description ? `${title} (${description})` : title };
  }
  /** Same rule for a category's parenthetical (its English name). */
  function categoryLabel(cat, view) {
    const title = (cat && cat.title) || '';
    const description = showsDescriptions(view) && cat && cat.en ? cat.en : '';
    return { title, description, text: description ? `${title} (${description})` : title };
  }

  const emptyRatings = (mode) => { const m = getMode(mode == null ? DEFAULT_MODE : mode); return m ? Object.fromEntries(m.metrics.map((x) => [x.id, SCALE.min])) : {}; };

  /** Strict validation of { metricId: integer } for ONE mode: all its metrics present, in range, nothing else. */
  function validateRatings(input, mode) {
    const m = getMode(mode == null ? DEFAULT_MODE : mode);
    if (!m) return { ok: false, error: 'نوع التقييم غير صحيح.' };
    if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: 'النقاط غير صحيحة.' };
    const unknown = Object.keys(input).find((k) => !Object.prototype.hasOwnProperty.call(m.byId, k));
    if (unknown !== undefined) return { ok: false, error: `معيار غير معروف: ${unknown}` };
    const ratings = {};
    for (const x of m.metrics) {
      const v = input[x.id];
      if (!Number.isInteger(v) || v < x.min || v > x.max) return { ok: false, error: `نقطة «${x.title}» لازم تكون عدد صحيح بين ${x.min} و${x.max}.` };
      ratings[x.id] = v;
    }
    return { ok: true, ratings };
  }

  /** Aggregation: total + per-category score/max/pct for one mode. Missing metrics count as `min`. */
  function scoreRatings(ratings, mode) {
    const m = getMode(mode == null ? DEFAULT_MODE : mode) || MODES[DEFAULT_MODE];
    const r = ratings || {};
    const categories = m.categories.map((c) => {
      const score = c.metrics.reduce((a, x) => a + (Number.isInteger(r[x.id]) ? r[x.id] : x.min), 0);
      return { id: c.id, title: c.title, en: c.en, score, max: c.max, pct: pct(score, c.max) };
    });
    const total = categories.reduce((a, c) => a + c.score, 0);
    return { mode: m.id, total, max: m.max, pct: pct(total, m.max), categories };
  }

  // ---- legacy (schema v1: 7 or 8 weighted criteria, type ky/po). Kept read-only so old data still renders. ----
  const LEGACY_TYPES = Object.freeze({ ky: 'قتال (Kyorugi)', po: 'فورمات (Poomsae)' });
  const LEGACY_SETS = Object.freeze({
    ky: [['الهجوم', 20], ['الهجوم المضاد', 20], ['الدفاع', 10], ['التوقيت والمسافة', 15], ['السرعة ورد الفعل', 15], ['التكتيك واتخاذ القرار', 10], ['التحكم في المباراة', 10], ['القوة', 20]],
    po: [['دقة التقنيات', 20], ['الثبات والوقفات', 20], ['التوازن', 10], ['القوة والسرعة', 15], ['الإيقاع والتوقيت', 15], ['التركيز والتعبير', 10], ['الانضباط والكيهاب', 10], ['القوة', 20]]
  });

  /** One normalized view for ANY stored evaluation ({v, mode, ratings|r} or legacy {scores|sc, type}).
   *  `view` is the role context. Descriptions are present on items/groups ONLY for VIEWS.ATHLETE, so a
   *  renderer fed describe(ev, VIEWS.COACH) cannot leak them even by mistake. Missing view = coach (fail closed). */
  function describe(ev, view) {
    ev = ev || {};
    const mode = modeOf(ev);
    if (Number(ev.v) === 2) {
      const m = MODES[mode];
      const r = ev.ratings || ev.r || {};
      const s = scoreRatings(r, mode);
      const groups = m.categories.map((c, i) => {
        const cl = categoryLabel(c, view);
        return {
          id: c.id, title: cl.title, en: cl.description, score: s.categories[i].score, max: c.max, pct: s.categories[i].pct,
          items: c.metrics.map((x) => { const l = metricLabel(x, view); return { id: x.id, title: l.title, description: l.description, label: l.text, score: Number.isInteger(r[x.id]) ? r[x.id] : x.min, max: x.max }; })
        };
      });
      return { version: 2, legacy: false, mode, total: s.total, max: s.max, pct: s.pct, groups };
    }
    const scores = ev.scores || ev.sc || [];
    const set = (LEGACY_SETS[ev.type] || []).slice(0, scores.length);
    const items = set.map((c, i) => ({ id: `l${i}`, title: c[0], description: '', label: c[0], score: scores[i], max: c[1] }));
    const total = items.reduce((a, i) => a + i.score, 0), max = items.reduce((a, i) => a + i.max, 0);
    return { version: 1, legacy: true, mode, total, max, pct: pct(total, max), groups: [{ id: 'legacy', title: 'تقييم قديم', en: (MODE_INFO[mode] || {}).en || '', score: total, max, pct: pct(total, max), items }] };
  }

  // ---- backwards-compatible aliases (Kyorugi = the original 20-metric model) ----
  const K = MODES[DEFAULT_MODE];
  const MAX_SCORE = Math.max.apply(null, MODE_IDS.map((id) => MODES[id].max));

  return Object.freeze({
    SCALE, VIEWS, MODES, MODE_IDS, MODE_INFO, DEFAULT_MODE, FILTER_MODES, MAX_SCORE,
    CATEGORIES: K.categories, METRICS: K.metrics, METRIC_BY_ID: K.byId, MAX_TOTAL: K.max,
    LEGACY_TYPES, LEGACY_SETS, LEGACY_MODE,
    parseLabel, getMode, modeOf, modeTitle, metricLabel, categoryLabel, emptyRatings, validateRatings, scoreRatings, describe
  });
});
