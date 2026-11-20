/* Canonical evaluation TEXT fields (the 5 structured notes). The ONLY place they are defined.
 * Loaded by the server (require) and by the browser (<script src="/notes.js">), so labels, limits,
 * validation, legacy fallbacks and who-sees-what can never drift between components.
 *
 * Names: `key` = storage + form-state name; `api` = JSON payload name (kept short, like the old st/im/goal/nt).
 * Legacy: `legacyDoc` = old stored field, `legacyApi` = old payload name. Old data is READ through these
 * fallbacks (never required), and the next save writes the new names only.
 * Visibility: `athlete: false` = coach-only (never sent to the athlete API, never rendered in the athlete portal). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TKD_NOTES = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MAX_LEN = 1000;
  const COACH = 'coach'; // same value as TKD_CRITERIA.VIEWS.COACH (asserted in tests); any other view = athlete-level

  const FIELDS = Object.freeze([
    { key: 'strengths', api: 'st', label: 'نقاط القوة', hint: 'ما الذي أتقنه اللاعب؟', athlete: true },
    { key: 'develop', api: 'dv', label: 'المهارات التي يجب تطويرها', hint: 'ما الذي يحتاج إلى تطوير؟', athlete: true, legacyDoc: ['improve'], legacyApi: ['im'] },
    { key: 'goal', api: 'goal', label: 'هدف التقييم القادم', hint: 'هدف واضح للتقييم القادم', athlete: true },
    { key: 'recommendations', api: 'rec', label: 'التوصيات و الاقتراحات', hint: 'توصيات واقتراحات للتدريب والتحضير', athlete: true },
    { key: 'notes', api: 'nt', label: 'الملاحظات', hint: 'ملاحظات إضافية', athlete: false }
  ].map(Object.freeze));

  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const str = (v) => (typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '');
  const fieldsFor = (view) => FIELDS.filter((f) => f.athlete || view === COACH);

  const empty = () => Object.fromEntries(FIELDS.map((f) => [f.key, '']));

  // first non-blank value among the names; never throws on null / garbage
  function read(obj, names) {
    const o = obj && typeof obj === 'object' ? obj : {};
    for (const n of names) { const s = str(o[n]); if (s.trim()) return s; }
    return '';
  }
  /** Stored record (new names, falls back to legacy `improve`) -> { key: string }. Safe for any input. */
  const fromDoc = (doc) => Object.fromEntries(FIELDS.map((f) => [f.key, read(doc, [f.key].concat(f.legacyDoc || []))]));
  /** API-shaped record (new names, falls back to legacy `im`) -> { key: string }. Safe for any input. */
  const fromApi = (rec) => Object.fromEntries(FIELDS.map((f) => [f.key, read(rec, [f.api].concat(f.legacyApi || []))]));

  /** { key: string } -> payload { api: string }, only the fields the view may see (default: coach = all). */
  function toApi(values, view) {
    const v = values || {};
    return Object.fromEntries(fieldsFor(view === undefined ? COACH : view).map((f) => [f.api, str(v[f.key])]));
  }

  /** Validate a request body. A field that is absent keeps `base[key]` (partial updates never wipe data);
   *  null clears it; old clients sending `im` still work. Returns {ok, values} or {ok:false, errors:{apiName: message}}. */
  function fromBody(body, base) {
    const b = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
    const keep = base || {};
    const values = {}, errors = {};
    for (const f of FIELDS) {
      const name = [f.api].concat(f.legacyApi || []).find((n) => has(b, n));
      let v = name === undefined ? keep[f.key] : b[name];
      if (v == null) v = '';
      if (typeof v !== 'string') { errors[f.api] = `«${f.label}» لازم تكون نص.`; continue; }
      v = v.trim();
      if (v.length > MAX_LEN) { errors[f.api] = `«${f.label}» طويلة برشا (${MAX_LEN} حرف كحد أقصى).`; continue; }
      values[f.key] = v;
    }
    return Object.keys(errors).length ? { ok: false, errors } : { ok: true, values };
  }

  return Object.freeze({ MAX_LEN, FIELDS, fieldsFor, empty, fromDoc, fromApi, toApi, fromBody });
});
