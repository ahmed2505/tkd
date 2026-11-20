try { require('dns').setServers(['8.8.8.8', '1.1.1.1']); } catch (_) {}
require('dotenv').config();
const path = require('path');
const crypto = require('crypto');
const scrypt = require('util').promisify(crypto.scrypt);
const express = require('express');
const mongoose = require('mongoose');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const ExcelJS = require('exceljs');
const { GENDERS, REGIONS, BELTS, SPECIALTIES, CATEGORIES } = require('./options');

const vals = (l) => l.map((x) => x[0]);
const lab = (l, v) => { const x = l.find((y) => y[0] === v); return x ? `${x[1]} (${x[0]})` : (v || ''); };
const N = require('./public/notes'); // single source of truth for the 5 note fields (labels, limits, legacy fallbacks, visibility)
const C = require('./public/criteria'); // single source of truth for the 5 categories / 20 metrics (also served to the browser)
const AGE = require('./public/age-category'); // single source of truth for DOB -> age -> category (also served to the browser)
const NAME_RE = /^[\p{L}][\p{L}\p{M}\s'’-]*$/u;

const STAGES = { initial: 'التقييم الأولي', mid: 'تقييم منتصف الموسم', final: 'التقييم النهائي' };

// ---------- models ----------
const nameField = (l) => ({ type: String, required: [true, `اكتب ${l}.`], trim: true, maxlength: [40, 'طويل برشا (40 حرف كحد أقصى).'], match: [NAME_RE, 'حروف فقط من فضلك.'] });
const choice = (list, l) => ({ type: String, required: [true, `اختار ${l}.`], enum: { values: vals(list), message: `اختار ${l} من القائمة.` } });

const Coach = mongoose.model('Coach', new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 60 },
  username: { type: String, required: true, unique: true, lowercase: true, trim: true, match: /^[a-z0-9._-]{3,30}$/ },
  slug: { type: String, required: true, unique: true }, // public registration link: /?c=<slug>
  phone: { type: String }, // optional, only used for the WhatsApp button
  passwordHash: { type: String, select: false },
  pwv: { type: Number, default: 0 }, // bump to log the coach out everywhere
  active: { type: Boolean, default: true }
}, { timestamps: true }));

// Fields shared by an approved athlete and by a pending registration request (one definition, no drift).
// `category` is NEVER taken from the client: it is derived from `dob` by AGE.assess() in buildProfile().
const profileFields = () => ({
  firstName: nameField('الاسم'),
  lastName: nameField('اللقب'),
  region: choice(REGIONS, 'الولاية'),
  belt: choice(BELTS, 'الحزام'),
  weight: { type: Number, required: [true, 'اكتب الوزن بالكيلوغرام.'], min: [10, 'الوزن لازم يكون 10 كغ على الأقل.'], max: [200, 'الوزن لازم يكون 200 كغ كحد أقصى.'] },
  gender: { type: String, enum: vals(GENDERS) },
  dob: { type: String, match: /^\d{4}-\d{2}-\d{2}$/ }, // date of birth, YYYY-MM-DD
  specialty: choice(SPECIALTIES, 'الاختصاص'),
  category: choice(CATEGORIES, 'الفئة') // Kids | Cadet | Junior | Senior (snapshot; reads recompute it from dob, see categoryOf)
});

const Athlete = mongoose.model('Athlete', new mongoose.Schema({
  ...profileFields(),
  phone: { type: String, required: [true, 'اكتب رقم الهاتف.'], unique: true },
  coach: { type: mongoose.Schema.Types.ObjectId, ref: 'Coach', index: true }, // empty only for athletes registered before multi-coach
  source: { type: String, enum: ['link', 'coach'], default: 'link' },
  passwordHash: { type: String, select: false },
  pwv: { type: Number, default: 0 } // bump to log the athlete out everywhere
}, { timestamps: true }));

// Coach Approval Gate: a registration made through the public link lands HERE, not in `athletes`.
// It becomes an Athlete only when the coach clicks Accept (see POST /api/admin/registrations/:id/accept).
// Denied/approved requests are kept as a small audit trail (the password hash is dropped as soon as it is decided).
const registrationSchema = new mongoose.Schema({
  ...profileFields(),
  phone: { type: String, required: [true, 'اكتب رقم الهاتف.'] },
  coach: { type: mongoose.Schema.Types.ObjectId, ref: 'Coach', required: true, index: true },
  status: { type: String, enum: ['pending', 'approved', 'denied'], default: 'pending', index: true },
  passwordHash: { type: String, select: false }, // generated at submission (shown once to the athlete), copied to the Athlete on approval
  athlete: { type: mongoose.Schema.Types.ObjectId, ref: 'Athlete' }, // set when approved
  reviewedAt: { type: Date },
  reviewedBy: { type: String, maxlength: 60 },
  reason: { type: String, maxlength: 200 } // optional note when denied
}, { timestamps: true });
// One open request per phone number (a denied one may be re-submitted). Also closes the double-submit race.
registrationSchema.index({ phone: 1 }, { unique: true, partialFilterExpression: { status: 'pending' } });
const Registration = mongoose.model('Registration', registrationSchema);

const text = { type: String, maxlength: 1000, default: '', trim: true };
const Evaluation = mongoose.model('Evaluation', new mongoose.Schema({
  athlete: { type: mongoose.Schema.Types.ObjectId, ref: 'Athlete', required: true, index: true },
  date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  stage: { type: String, enum: Object.keys(STAGES), required: true },
  v: { type: Number, enum: [1, 2], default: 1 },                          // 1 = legacy criteria, 2 = mode-based metric model
  mode: { type: String, enum: C.MODE_IDS, required: function () { return this.v === 2; } }, // v2 only: 'kyorugi' | 'freestyle'. v2 docs saved before Freestyle have none = kyorugi. No default on purpose (it would stamp legacy docs on save)
  ratings: { type: mongoose.Schema.Types.Mixed },                          // v2: { metricId: integer 0..SCALE.max }
  type: { type: String, enum: Object.keys(C.LEGACY_TYPES) },               // v1 only
  scores: { type: [Number], default: undefined },                          // v1 only
  total: { type: Number, required: true, min: 0, max: C.MAX_SCORE },
  max: { type: Number },
  ...Object.fromEntries(N.FIELDS.map((f) => [f.key, text])),             // strengths, develop, goal, recommendations, notes
  improve: { type: String },                                               // DEPRECATED (pre-5-fields "skills to develop"): read via N.fromDoc, unset on the next edit
  by: { type: String, enum: ['المدرب', 'المساعد'], default: 'المدرب' }
}, { timestamps: true }));

// Mongo filter for one evaluation mode ('' = all). Returns null for an unknown mode.
// Docs saved before Freestyle have no `mode`: v2 ones are kyorugi, v1 ones follow their legacy `type`.
function modeFilter(mode) {
  if (mode == null || mode === '') return {};
  if (mode === 'kyorugi') return { $or: [{ mode: 'kyorugi' }, { mode: null, type: { $ne: 'po' } }] };
  if (mode === 'poomsae') return { mode: null, type: 'po' };
  return C.MODE_IDS.includes(mode) ? { mode } : null;
}

class Bad extends Error { constructor(errors) { super('bad'); this.errors = errors; this.bad = true; } }

function normalizePhone(raw) {
  const digits = String(raw || '').replace(/[\s.-]/g, '').replace(/^(\+216|00216)/, '');
  return /^[2-9]\d{7}$/.test(digits) ? `+216${digits}` : null;
}
// ---- athlete passwords (scrypt, never stored in clear) ----
const PW_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const genPw = () => Array.from({ length: 8 }, () => PW_ALPHABET[crypto.randomInt(PW_ALPHABET.length)]).join('');
async function hashPw(pw) { const salt = crypto.randomBytes(16); return `${salt.toString('hex')}:${(await scrypt(String(pw).trim(), salt, 32)).toString('hex')}`; }
async function checkPw(pw, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash || String(pw || '').length > 64) return false;
  const x = await scrypt(String(pw).trim(), Buffer.from(salt, 'hex'), 32), y = Buffer.from(hash, 'hex');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
const DUMMY_SALT = crypto.randomBytes(16);
const ar = (l, v) => { const x = l.find((y) => y[0] === v); return x ? x[1] : v; };

function sendErr(err, res, next) {
  if (err.bad) return res.status(400).json({ errors: err.errors });
  if (err.code === 11000) return res.status(409).json({ errors: { phone: 'هذا الرقم مسجّل من قبل. إذا نسيت كلمة السر اطلبها من المدرب.' } });
  if (err.name === 'ValidationError') {
    const errors = {};
    for (const [k, v] of Object.entries(err.errors)) errors[k] = v.message;
    return res.status(400).json({ errors });
  }
  next(err);
}
// gender + DOB + the category DERIVED from the DOB. The client's `category` is ignored everywhere.
// `required` false = legacy athletes that never had a DOB (see PUT /api/admin/athletes/:id): empty DOB is allowed there.
function parseGenderDob(b, required) {
  const errors = {};
  const gender = String(b.gender || '');
  if (gender ? !vals(GENDERS).includes(gender) : required) errors.gender = 'اختار الجنس.';
  const dob = String(b.dob || '').trim();
  let category = '', age = NaN;
  if (dob) {
    const a = AGE.assess(dob);
    if (!a.ok) errors.dob = a.message; else { category = a.category; age = a.age; }
  } else if (required) errors.dob = 'اكتب تاريخ الميلاد.';
  if (Object.keys(errors).length) throw new Bad(errors);
  return { gender, dob, category, age };
}
// Category to SHOW: recomputed from the DOB (so a Cadet turning 15 becomes Junior without a migration);
// athletes without a DOB (registered before v4.1) keep their stored category.
const categoryOf = (a) => { const r = a.dob ? AGE.assess(a.dob) : null; return r && r.ok ? r.category : (a.category || ''); };

// Validate + whitelist everything an athlete may submit. Used by BOTH the pending registration and the coach's direct add.
function buildProfile(b) {
  const phone = normalizePhone(b.phone);
  if (!phone) throw new Bad({ phone: 'اكتب رقم تونسي صحيح (8 أرقام).' });
  const weight = Number(b.weight);
  if (!Number.isFinite(weight)) throw new Bad({ weight: 'اكتب الوزن بالكيلوغرام.' });
  const gd = parseGenderDob(b, true);
  // explicit whitelist: no mass-assignment. category comes from gd (server-computed), never from b.category.
  return { firstName: b.firstName, lastName: b.lastName, region: b.region, belt: b.belt, weight, gender: gd.gender, dob: gd.dob, specialty: b.specialty, category: gd.category, phone };
}
async function createAthlete(b, source, coachId) {
  const profile = buildProfile(b);
  const password = genPw();
  const doc = await Athlete.create({ ...profile, source, coach: coachId, passwordHash: await hashPw(password) });
  return { doc, password };
}
// Coach Approval Gate, step 1: store the request only. Nothing is added to the active roster yet.
async function createPendingRegistration(b, coachId) {
  const profile = buildProfile(b);
  if (await Athlete.exists({ phone: profile.phone })) throw new Bad({ phone: 'هذا الرقم مسجّل من قبل. إذا نسيت كلمة السر اطلبها من المدرب.' });
  if (await Registration.exists({ phone: profile.phone, status: 'pending' })) throw new Bad({ phone: 'طلبك وصل للمدرب وهو في انتظار الموافقة.' });
  const password = genPw();
  const doc = await Registration.create({ ...profile, coach: coachId, status: 'pending', passwordHash: await hashPw(password) });
  return { doc, password };
}

// shapes expected by the coach dashboard
const outAthlete = (a, cn) => ({ id: String(a._id), coach: a.coach ? String(a.coach) : '', coachName: cn ? (cn.get(String(a.coach)) || '') : '', gender: a.gender || '', dob: a.dob || '', name: `${a.firstName} ${a.lastName}`, firstName: a.firstName, lastName: a.lastName, region: a.region, belt: a.belt, weight: a.weight, spec: a.specialty, cat: categoryOf(a), phone: a.phone, source: a.source || 'link', hasPw: Boolean(a.passwordHash), ts: new Date(a.createdAt).getTime() });
// shape of one pending request for the coach pop-up (never includes the password hash)
const outReg = (r, cn) => { const a = AGE.assess(r.dob); return { id: String(r._id), coach: String(r.coach), coachName: cn ? (cn.get(String(r.coach)) || '') : '', name: `${r.firstName} ${r.lastName}`, firstName: r.firstName, lastName: r.lastName, gender: r.gender || '', dob: r.dob || '', age: a.ok ? a.age : null, cat: categoryOf(r), region: r.region, belt: r.belt, weight: r.weight, spec: r.specialty, phone: r.phone, ts: new Date(r.createdAt).getTime() }; };
async function pendingFor(req) { // newest last, so the coach reviews in arrival order
  const list = await Registration.find({ status: 'pending', ...req.scope }).sort({ createdAt: 1 }).lean();
  const cn = req.staff.owner ? await coachNames() : null;
  return list.map((r) => outReg(r, cn));
}
const outEval = (e) => ({ id: String(e._id), ts: new Date(e.createdAt).getTime(), pid: String(e.athlete), date: e.date, stage: e.stage, v: e.v || 1, mode: C.modeOf(e), r: e.ratings || null, type: e.type || '', sc: e.scores || null, total: e.total, max: e.max || null, ...N.toApi(N.fromDoc(e)), by: e.by }); // coach shape: all 5 fields

// ---------- coach auth: signed, HttpOnly cookie ----------
const secret = () => process.env.SESSION_SECRET || process.env.ADMIN_KEY || '';
const mac = (s) => crypto.createHmac('sha256', secret()).update(s).digest('base64url');
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
function makeToken(payload, days) { const p = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + days * 864e5 })).toString('base64url'); return `${p}.${mac(p)}`; }
function validToken(t) {
  if (!t || !secret()) return false;
  const [p, m] = String(t).split('.');
  if (!p || !m || !safeEq(m, mac(p))) return null;
  try { const o = JSON.parse(Buffer.from(p, 'base64url').toString()); return o.exp > Date.now() ? o : null; } catch { return null; }
}
function cookie(req, name) {
  const c = (req.headers.cookie || '').split(';').map((s) => s.trim()).find((s) => s.startsWith(`${name}=`));
  return c ? decodeURIComponent(c.slice(name.length + 1)) : '';
}
const okId = (id) => mongoose.isValidObjectId(id);
// Who is calling? owner = ADMIN_KEY (manages coaches), coach = own account (sees only his athletes)
async function staffOf(req, allowQuery) {
  const t = validToken(cookie(req, 'tkd_admin'));
  if (t && t.r === 'owner') return { owner: true };
  if (t && t.r === 'coach' && okId(t.id)) {
    const c = await Coach.findById(t.id).select('+passwordHash');
    if (c && c.active && (c.pwv || 0) === t.v) return { owner: false, coach: c };
    return null;
  }
  const key = process.env.ADMIN_KEY;
  if (key && safeEq(req.get('x-admin-key') || (allowQuery ? req.query.key : '') || '', key)) return { owner: true };
  return null;
}
async function requireStaff(req, res, next) {
  try {
    const st = await staffOf(req);
    if (!st) return res.status(401).json({ message: 'انتهت الجلسة، ادخل من جديد.' });
    req.staff = st;
    req.scope = st.owner ? {} : { coach: st.coach._id }; // every athlete query is filtered with this
    next();
  } catch (err) { next(err); }
}
const requireOwner = (req, res, next) => (req.staff && req.staff.owner ? next() : res.status(403).json({ message: 'هذه العملية للمسؤول فقط.' }));
const coachNames = async () => new Map((await Coach.find().select('name').lean()).map((c) => [String(c._id), c.name]));
const namesFor = (req) => (req.staff.owner ? coachNames() : null);
async function coachList() {
  const [cs, counts] = await Promise.all([Coach.find().sort({ createdAt: 1 }).lean(), Athlete.aggregate([{ $group: { _id: '$coach', n: { $sum: 1 } } }])]);
  const m = new Map(counts.map((x) => [String(x._id), x.n]));
  return { list: cs.map((c) => ({ id: String(c._id), name: c.name, username: c.username, slug: c.slug, active: c.active, n: m.get(String(c._id)) || 0 })), unassigned: m.get('null') || 0 };
}
const setStaffCookie = (req, res, payload) => res.cookie('tkd_admin', makeToken(payload, 30), { httpOnly: true, sameSite: 'strict', secure: req.secure, maxAge: 30 * 864e5, path: '/' });

// ---------- app ----------
const app = express();
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: { useDefaults: true, directives: { 'upgrade-insecure-requests': null } } }));
app.use(express.json({ limit: '20kb' }));
app.use('/coach', (_req, res, next) => { res.set('X-Robots-Tag', 'noindex'); next(); });
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

const limiter = (limit, extra = {}) => rateLimit({ windowMs: 15 * 60 * 1000, limit, standardHeaders: true, legacyHeaders: false, ...extra });
const submitLimiter = limiter(20);
const loginLimiter = limiter(10, { skipSuccessfulRequests: true });
const adminLimiter = limiter(300);
const athLoginIp = limiter(10, { skipSuccessfulRequests: true });
const athLoginPhone = limiter(8, { skipSuccessfulRequests: true, keyGenerator: (req) => `p${String((req.body || {}).phone || '').replace(/\D/g, '').slice(-8)}` });

// public: athlete registration
app.post('/api/athletes', submitLimiter, async (req, res, next) => {
  try {
    const b = req.body || {};
    if (b.website) return res.status(201).json({ ok: true }); // honeypot
    if (b.consent !== true) throw new Bad({ consent: 'لازم توافق على إرسال المعلومات.' });
    const coach = /^[\w-]{6,20}$/.test(String(b.coach || '')) ? await Coach.findOne({ slug: b.coach, active: true }) : null;
    if (!coach) throw new Bad({ coach: 'رابط التسجيل غير صالح. اطلب رابطًا جديدًا من مدربك.' });
    // Approval gate: this only stores a PENDING request. The athlete joins the roster when the coach accepts.
    const { password } = await createPendingRegistration(b, coach._id);
    res.status(201).json({ ok: true, pending: true, password }); // password shown once; it starts working when the coach accepts
  } catch (err) { sendErr(err, res, next); }
});

// public: name of the coach behind a registration link (shown on the form)
app.get('/api/coach/:slug', submitLimiter, async (req, res, next) => {
  try {
    const c = /^[\w-]{6,20}$/.test(req.params.slug) ? await Coach.findOne({ slug: req.params.slug, active: true }).select('name').lean() : null;
    if (!c) return res.status(404).json({ message: 'رابط غير صالح.' });
    res.json({ name: c.name });
  } catch (err) { next(err); }
});

// coach: session
app.post('/api/admin/login', loginLimiter, async (req, res, next) => {
  try {
    const b = req.body || {};
    const username = String(b.username || '').trim().toLowerCase();
    const pw = String(b.password ?? b.key ?? '');
    const bad = () => res.status(401).json({ message: 'اسم المستخدم أو كلمة السر غير صحيحة.' });
    if (username === 'admin' || !username) { // owner: username "admin" + ADMIN_KEY
      const key = process.env.ADMIN_KEY;
      if (!key || !safeEq(pw, key)) return bad();
      setStaffCookie(req, res, { r: 'owner' });
      return res.json({ ok: true });
    }
    const c = await Coach.findOne({ username }).select('+passwordHash');
    let ok = false;
    if (c && c.active && c.passwordHash) ok = await checkPw(pw, c.passwordHash);
    else await scrypt('x', DUMMY_SALT, 32); // same timing whether or not the account exists
    if (!ok) return bad();
    setStaffCookie(req, res, { r: 'coach', id: String(c._id), v: c.pwv || 0 });
    res.json({ ok: true });
  } catch (err) { next(err); }
});
app.post('/api/admin/logout', (_req, res) => { res.clearCookie('tkd_admin', { path: '/' }); res.json({ ok: true }); });

// coach: data
app.use('/api/admin', adminLimiter);
app.get('/api/admin/data', requireStaff, async (req, res, next) => {
  try {
    const athletes = await Athlete.find(req.scope).select('+passwordHash').sort({ createdAt: -1 }).lean();
    const mf = modeFilter(req.query.mode); // optional ?mode=kyorugi|freestyle|poomsae
    if (!mf) return res.status(400).json({ message: 'نوع التقييم غير صحيح.' });
    const evals = await Evaluation.find({ ...(req.staff.owner ? {} : { athlete: { $in: athletes.map((a) => a._id) } }), ...mf }).sort({ createdAt: -1 }).lean();
    const out = { athletes: [], evaluations: evals.map(outEval), pending: await pendingFor(req) };
    if (req.staff.owner) {
      const cl = await coachList();
      const cn = new Map(cl.list.map((c) => [c.id, c.name]));
      out.athletes = athletes.map((a) => outAthlete(a, cn));
      out.me = { role: 'owner', name: 'المسؤول', username: 'admin' };
      out.coaches = cl.list; out.unassigned = cl.unassigned;
    } else {
      out.athletes = athletes.map((a) => outAthlete(a));
      const c = req.staff.coach;
      out.me = { role: 'coach', name: c.name, username: c.username, slug: c.slug };
    }
    res.json(out);
  } catch (err) { next(err); }
});
app.post('/api/admin/athletes', requireStaff, async (req, res, next) => {
  try {
    const b = req.body || {};
    let coachId = req.staff.owner ? null : req.staff.coach._id;
    if (req.staff.owner) { // the owner must say which coach the athlete belongs to
      if (!okId(b.coach) || !(await Coach.exists({ _id: b.coach }))) throw new Bad({ coach: 'اختار المدرب.' });
      coachId = b.coach;
    }
    const { doc, password } = await createAthlete(b, 'coach', coachId);
    res.status(201).json({ ...outAthlete(doc.toObject(), await namesFor(req)), password });
  } catch (err) { sendErr(err, res, next); }
});
app.delete('/api/admin/athletes/:id', requireStaff, async (req, res, next) => {
  try {
    if (!okId(req.params.id)) return res.status(400).json({ message: 'معرّف غير صحيح.' });
    const a = await Athlete.findOne({ _id: req.params.id, ...req.scope }).select('_id');
    if (!a) return res.status(404).json({ message: 'اللاعب غير موجود.' });
    await Evaluation.deleteMany({ athlete: a._id });
    await Athlete.deleteOne({ _id: a._id });
    res.json({ ok: true });
  } catch (err) { next(err); }
});
app.post('/api/admin/evaluations', requireStaff, async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!mongoose.isValidObjectId(b.pid) || !(await Athlete.exists({ _id: b.pid, ...req.scope }))) throw new Bad({ pid: 'اللاعب غير موجود.' });
    const mode = b.mode == null || b.mode === '' ? C.DEFAULT_MODE : String(b.mode); // payloads from before Freestyle carry no mode = kyorugi
    if (!C.getMode(mode)) throw new Bad({ mode: 'نوع التقييم غير صحيح.' });
    const vr = C.validateRatings(b.r, mode);
    if (!vr.ok) throw new Bad({ r: vr.error });
    const sc = C.scoreRatings(vr.ratings, mode); // total/max are always computed server-side
    const nf = N.fromBody(b); // 5 note fields: trimmed, string, <= N.MAX_LEN (old `im` accepted)
    if (!nf.ok) throw new Bad(nf.errors);
    const s = (v) => String(v ?? '');
    const e = await Evaluation.create({ athlete: b.pid, date: s(b.date), stage: s(b.stage), v: 2, mode, ratings: vr.ratings, total: sc.total, max: sc.max, ...nf.values, by: s(b.by) || 'المدرب' }); // total is computed server-side
    res.status(201).json(outEval(e.toObject()));
  } catch (err) { sendErr(err, res, next); }
});
app.delete('/api/admin/evaluations/:id', requireStaff, async (req, res, next) => {
  try {
    if (!okId(req.params.id)) return res.status(400).json({ message: 'معرّف غير صحيح.' });
    const e = await Evaluation.findById(req.params.id).select('athlete');
    if (!e || !(await Athlete.exists({ _id: e.athlete, ...req.scope }))) return res.status(404).json({ message: 'التقييم غير موجود.' });
    await Evaluation.deleteOne({ _id: e._id });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ---- coach approval gate: review pending registrations (session-checked; a coach only sees his own) ----
const reviewer = (req) => (req.staff.owner ? 'المسؤول' : req.staff.coach.name);
app.get('/api/admin/registrations', requireStaff, async (req, res, next) => { // polled by the dashboard (~15s) to raise the pop-up
  try { res.json({ pending: await pendingFor(req) }); } catch (err) { next(err); }
});
// Atomically claim a still-pending request in this caller's scope. null = already decided / not his / unknown.
const claimRegistration = (req, status, extra) => Registration.findOneAndUpdate(
  { _id: req.params.id, status: 'pending', ...req.scope },
  { $set: { status, reviewedAt: new Date(), reviewedBy: reviewer(req), ...extra } }, { new: true }
).select('+passwordHash');
async function whyNotClaimed(req, res) { // distinguish "gone" from "someone already decided it"
  const r = await Registration.findOne({ _id: req.params.id, ...req.scope }).select('status').lean();
  return r ? res.status(409).json({ message: 'تمت معالجة هذا الطلب من قبل.' }) : res.status(404).json({ message: 'الطلب غير موجود.' });
}
app.post('/api/admin/registrations/:id/accept', requireStaff, async (req, res, next) => {
  let r = null, created = false;
  try {
    if (!okId(req.params.id)) return res.status(400).json({ message: 'معرّف غير صحيح.' });
    r = await claimRegistration(req, 'approved'); // claim first: a double click / second device cannot create two athletes
    if (!r) return await whyNotClaimed(req, res);
    const a = AGE.assess(r.dob); // category is recomputed at the moment of persisting, not trusted from the stored request
    if (!a.ok) throw new Bad({ dob: a.message });
    const doc = await Athlete.create({ firstName: r.firstName, lastName: r.lastName, region: r.region, belt: r.belt, weight: r.weight, gender: r.gender, dob: r.dob, specialty: r.specialty, category: a.category, phone: r.phone, source: 'link', coach: r.coach, passwordHash: r.passwordHash });
    created = true;
    await Registration.updateOne({ _id: r._id }, { $set: { athlete: doc._id, category: a.category }, $unset: { passwordHash: 1 } });
    console.info(`[registration] accepted ${r._id} by ${reviewer(req)} -> athlete ${doc._id}`);
    res.json({ ok: true, athlete: outAthlete(doc.toObject(), await namesFor(req)) });
  } catch (err) {
    if (r && !created) await Registration.updateOne({ _id: r._id }, { $set: { status: 'pending' }, $unset: { reviewedAt: 1, reviewedBy: 1 } }).catch(() => {}); // not persisted: put it back in the queue
    if (err.code === 11000) return res.status(409).json({ message: 'هذا الرقم مسجّل كلاعب من قبل. ارفض الطلب أو غيّر اللاعب الموجود.' });
    sendErr(err, res, next);
  }
});
app.post('/api/admin/registrations/:id/deny', requireStaff, async (req, res, next) => {
  try {
    if (!okId(req.params.id)) return res.status(400).json({ message: 'معرّف غير صحيح.' });
    const reason = String((req.body || {}).reason || '').trim().slice(0, 200);
    const r = await claimRegistration(req, 'denied', reason ? { reason } : {});
    if (!r) return await whyNotClaimed(req, res);
    await Registration.updateOne({ _id: r._id }, { $unset: { passwordHash: 1 } }); // the athlete never gets an account
    console.info(`[registration] denied ${r._id} by ${reviewer(req)}`);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// coach: edit athlete, reset passwords, edit evaluation
app.put('/api/admin/athletes/:id', requireStaff, async (req, res, next) => {
  try {
    if (!okId(req.params.id)) return res.status(400).json({ message: 'معرّف غير صحيح.' });
    const a = await Athlete.findOne({ _id: req.params.id, ...req.scope }).select('+passwordHash');
    if (!a) return res.status(404).json({ message: 'اللاعب غير موجود.' });
    const b = req.body || {};
    const phone = normalizePhone(b.phone);
    if (!phone) throw new Bad({ phone: 'اكتب رقم تونسي صحيح (8 أرقام).' });
    const weight = Number(b.weight);
    if (!Number.isFinite(weight)) throw new Bad({ weight: 'اكتب الوزن بالكيلوغرام.' });
    const gd = parseGenderDob(b, Boolean(a.gender || a.dob));
    if (gd.gender) a.gender = gd.gender;
    if (gd.dob) a.dob = gd.dob;
    // category is server-derived whenever a DOB exists; only legacy athletes with no DOB may still carry a coach-chosen one
    a.set({ firstName: b.firstName, lastName: b.lastName, region: b.region, belt: b.belt, weight, specialty: b.specialty, category: a.dob ? gd.category || categoryOf(a) : b.category, phone });
    if (req.staff.owner && okId(b.coach) && (await Coach.exists({ _id: b.coach }))) a.coach = b.coach; // only the owner can move an athlete to another coach
    await a.save();
    res.json(outAthlete(a.toObject(), await namesFor(req)));
  } catch (err) { sendErr(err, res, next); }
});
async function newPassword(a) { const password = genPw(); a.passwordHash = await hashPw(password); a.pwv = (a.pwv || 0) + 1; await a.save(); return { id: String(a._id), name: `${a.firstName} ${a.lastName}`, phone: a.phone, password }; }
app.post('/api/admin/athletes/passwords', requireStaff, async (req, res, next) => { // only athletes that have no password yet
  try {
    const missing = await Athlete.find({ ...req.scope, $or: [{ passwordHash: { $exists: false } }, { passwordHash: null }, { passwordHash: '' }] }).select('+passwordHash');
    const list = [];
    for (const a of missing) list.push(await newPassword(a));
    res.json({ list });
  } catch (err) { next(err); }
});
app.post('/api/admin/athletes/:id/password', requireStaff, async (req, res, next) => {
  try {
    if (!okId(req.params.id)) return res.status(400).json({ message: 'معرّف غير صحيح.' });
    const a = await Athlete.findOne({ _id: req.params.id, ...req.scope }).select('+passwordHash');
    if (!a) return res.status(404).json({ message: 'اللاعب غير موجود.' });
    res.json(await newPassword(a));
  } catch (err) { next(err); }
});
app.put('/api/admin/evaluations/:id', requireStaff, async (req, res, next) => {
  try {
    if (!okId(req.params.id)) return res.status(400).json({ message: 'معرّف غير صحيح.' });
    const e = await Evaluation.findById(req.params.id);
    if (!e || !(await Athlete.exists({ _id: e.athlete, ...req.scope }))) return res.status(404).json({ message: 'التقييم غير موجود.' });
    const b = req.body || {};
    const fields = {};
    const nf = N.fromBody(b, N.fromDoc(e)); // absent fields keep their current (or legacy-mapped) value
    if (!nf.ok) throw new Bad(nf.errors);
    if ((e.v || 1) === 2) { // metric-based evaluation: scores are editable, the mode is not (it defines which metrics exist)
      const mode = C.modeOf(e);
      if (b.mode != null && b.mode !== '' && b.mode !== mode) throw new Bad({ mode: 'نوع التقييم ما يتبدّلش بعد الحفظ.' });
      const vr = C.validateRatings(b.r, mode);
      if (!vr.ok) throw new Bad({ r: vr.error });
      const sc = C.scoreRatings(vr.ratings, mode);
      Object.assign(fields, { mode, ratings: vr.ratings, total: sc.total, max: sc.max }); // also stamps pre-Freestyle docs with 'kyorugi'
    } // a legacy (v1) evaluation keeps its original scores: only date, stage and the texts change
    const s = (v) => String(v ?? '');
    e.set({ date: s(b.date), stage: s(b.stage), ...fields, ...nf.values, improve: undefined, by: s(b.by) || 'المدرب' });
    await e.save();
    res.json(outEval(e.toObject()));
  } catch (err) { sendErr(err, res, next); }
});

// coach: Excel (always generated live from MongoDB). Works with the login cookie, or ?key= / x-admin-key.
app.get('/admin/export.xlsx', adminLimiter, async (req, res, next) => {
  try {
    const st = await staffOf(req, true);
    if (!st) return res.status(401).send('Unauthorized');
    const athletes = await Athlete.find(st.owner ? {} : { coach: st.coach._id }).sort({ category: 1, specialty: 1, weight: 1 }).lean();
    const evals = await Evaluation.find(st.owner ? {} : { athlete: { $in: athletes.map((a) => a._id) } }).sort({ date: -1 }).lean();
    const cn = st.owner ? await coachNames() : null;
    const names = new Map(athletes.map((a) => [String(a._id), `${a.firstName} ${a.lastName}`]));
    const wb = new ExcelJS.Workbook();
    const ALL_CATEGORIES = C.MODE_IDS.flatMap((id) => C.MODES[id].categories), ALL_METRICS = C.MODE_IDS.flatMap((id) => C.MODES[id].metrics);
    const sheet = (title, cols) => {
      const ws = wb.addWorksheet(title, { views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }] });
      ws.columns = cols.map(([header, key, width]) => ({ header, key, width, style: { alignment: { vertical: 'top', wrapText: true } } }));
      const h = ws.getRow(1);
      h.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF15151A' } };
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
      return ws;
    };
    const aCols = [['الاسم (First name)', 'firstName', 18], ['اللقب (Last name)', 'lastName', 18], ['الولاية (Region)', 'region', 22], ['الحزام (Belt)', 'belt', 24], ['الوزن kg (Weight)', 'weight', 14], ['الاختصاص (Specialty)', 'specialty', 20], ['الفئة (Category)', 'category', 18], ['الجنس (Gender)', 'gender', 12], ['تاريخ الميلاد (Date of birth)', 'dob', 16], ['الهاتف (Phone)', 'phone', 16], ['المصدر (Source)', 'source', 14], ['تاريخ التسجيل (Registered)', 'createdAt', 22]];
    if (st.owner) aCols.push(['المدرب (Coach)', 'coachName', 18]);
    const wa = sheet('اللاعبون', aCols);
    athletes.forEach((a) => wa.addRow({ ...a, coachName: cn ? (cn.get(String(a.coach)) || 'بلا مدرب') : '', region: lab(REGIONS, a.region), belt: lab(BELTS, a.belt), specialty: lab(SPECIALTIES, a.specialty), category: lab(CATEGORIES, categoryOf(a)), gender: lab(GENDERS, a.gender), source: a.source === 'coach' ? 'المدرب' : 'الرابط' }));
    wa.getColumn('createdAt').numFmt = 'dd/mm/yyyy hh:mm';
    const we = sheet('التقييمات', [
      ['اللاعب', 'who', 22], ['التاريخ', 'date', 12], ['المرحلة', 'stage', 20], ['القسم', 'modeTitle', 14], ['النسخة', 'kind', 16],
      ['المجموع', 'total', 10], ['من', 'max', 8], ['النسبة %', 'pct', 10],
      ...ALL_CATEGORIES.map((c) => [c.title, `cat_${c.id}`, 18]), // titles only: the coach export never carries descriptions
      ...ALL_METRICS.map((m) => [m.title, `m_${m.id}`, 14]),
      ...N.FIELDS.map((f) => [f.label, f.key, 30]), ['أجراه', 'by', 10]
    ]);
    evals.forEach((e) => {
      const v = C.describe(e);
      const row = { ...e, ...N.fromDoc(e), who: names.get(String(e.athlete)) || '(محذوف)', stage: STAGES[e.stage], modeTitle: C.modeTitle(v.mode), kind: v.legacy ? `قديم (${C.LEGACY_TYPES[e.type] || ''})` : `${v.groups.reduce((a, g) => a + g.items.length, 0)} معيار`, total: v.total, max: v.max, pct: v.pct };
      if (!v.legacy) v.groups.forEach((g) => { row[`cat_${g.id}`] = `${g.score}/${g.max}`; g.items.forEach((i) => { row[`m_${i.id}`] = i.score; }); });
      we.addRow(row);
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="tkd-${new Date().toISOString().slice(0, 10)}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) { next(err); }
});

// ---- owner only: manage coach accounts ----
const newCoachPw = async (c) => { const password = genPw(); c.passwordHash = await hashPw(password); c.pwv = (c.pwv || 0) + 1; await c.save(); return { id: String(c._id), name: c.name, username: c.username, slug: c.slug, phone: c.phone || '', password }; };
app.post('/api/admin/coaches', requireStaff, requireOwner, async (req, res, next) => {
  try {
    const b = req.body || {};
    const name = String(b.name || '').trim();
    const username = String(b.username || '').trim().toLowerCase();
    if (!name || name.length > 60) throw new Bad({ name: 'اكتب اسم المدرب.' });
    if (!/^[a-z0-9._-]{3,30}$/.test(username) || username === 'admin') throw new Bad({ username: 'اسم المستخدم: من 3 إلى 30 حرف إنجليزي صغير أو أرقام أو . _ -' });
    const phoneRaw = String(b.phone || '').trim();
    const phone = phoneRaw ? normalizePhone(phoneRaw) : '';
    if (phoneRaw && !phone) throw new Bad({ phone: 'اكتب رقم تونسي صحيح (8 أرقام) أو اتركه فارغًا.' });
    const password = genPw();
    const c = await Coach.create({ name, username, phone, slug: crypto.randomBytes(6).toString('base64url'), passwordHash: await hashPw(password) });
    res.status(201).json({ id: String(c._id), name: c.name, username: c.username, slug: c.slug, phone, password }); // password shown once
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ errors: { username: 'اسم المستخدم مستعمل من قبل.' } });
    sendErr(err, res, next);
  }
});
app.post('/api/admin/coaches/:id/password', requireStaff, requireOwner, async (req, res, next) => {
  try {
    const c = okId(req.params.id) ? await Coach.findById(req.params.id).select('+passwordHash') : null;
    if (!c) return res.status(404).json({ message: 'المدرب غير موجود.' });
    res.json(await newCoachPw(c));
  } catch (err) { next(err); }
});
app.put('/api/admin/coaches/:id', requireStaff, requireOwner, async (req, res, next) => {
  try {
    const c = okId(req.params.id) ? await Coach.findById(req.params.id) : null;
    if (!c) return res.status(404).json({ message: 'المدرب غير موجود.' });
    c.active = Boolean((req.body || {}).active);
    c.pwv = (c.pwv || 0) + 1; // logs him out right away
    await c.save();
    res.json({ ok: true });
  } catch (err) { next(err); }
});
app.delete('/api/admin/coaches/:id', requireStaff, requireOwner, async (req, res, next) => {
  try {
    const c = okId(req.params.id) ? await Coach.findById(req.params.id).select('_id') : null;
    if (!c) return res.status(404).json({ message: 'المدرب غير موجود.' });
    if (await Registration.exists({ coach: c._id, status: 'pending' })) return res.status(400).json({ message: 'عند هذا المدرب طلبات تسجيل في الانتظار. اقبلها أو ارفضها أولًا.' });
    if (await Athlete.exists({ coach: c._id })) return res.status(400).json({ message: 'عند هذا المدرب لاعبون. انقلهم لمدرب آخر أولًا، أو استعمل «إيقاف».' });
    await Coach.deleteOne({ _id: c._id });
    res.json({ ok: true });
  } catch (err) { next(err); }
});
// owner: give every athlete that has no coach yet (registered before multi-coach) to one coach
app.post('/api/admin/coaches/:id/claim', requireStaff, requireOwner, async (req, res, next) => {
  try {
    const c = okId(req.params.id) ? await Coach.findById(req.params.id).select('_id') : null;
    if (!c) return res.status(404).json({ message: 'المدرب غير موجود.' });
    const r = await Athlete.updateMany({ $or: [{ coach: { $exists: false } }, { coach: null }] }, { $set: { coach: c._id } });
    res.json({ moved: r.modifiedCount });
  } catch (err) { next(err); }
});
// coach: change own password
app.post('/api/admin/me/password', submitLimiter, requireStaff, async (req, res, next) => {
  try {
    if (req.staff.owner) return res.status(400).json({ message: 'مفتاح المسؤول يتغيّر من ملف .env.' });
    const b = req.body || {}, c = req.staff.coach, n = String(b.next || '').trim();
    if (!(await checkPw(b.current, c.passwordHash))) return res.status(400).json({ message: 'كلمة السر الحالية غير صحيحة.' });
    if (n.length < 6 || n.length > 64) return res.status(400).json({ message: 'كلمة السر الجديدة لازم تكون من 6 إلى 64 حرف.' });
    c.passwordHash = await hashPw(n); c.pwv = (c.pwv || 0) + 1; await c.save();
    setStaffCookie(req, res, { r: 'coach', id: String(c._id), v: c.pwv });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ---- athlete portal: each athlete sees only their own evaluations ----
function setAthleteCookie(req, res, a) {
  res.cookie('tkd_athlete', makeToken({ r: 'athlete', id: String(a._id), v: a.pwv || 0 }, 30), { httpOnly: true, sameSite: 'strict', secure: req.secure, maxAge: 30 * 864e5, path: '/' });
}
async function requireAthlete(req, res, next) {
  try {
    const t = validToken(cookie(req, 'tkd_athlete'));
    if (t && t.r === 'athlete' && okId(t.id)) {
      const a = await Athlete.findById(t.id).select('+passwordHash');
      if (a && a.passwordHash && (a.pwv || 0) === t.v) { req.athlete = a; return next(); }
    }
    res.status(401).json({ message: 'ادخل من جديد.' });
  } catch (err) { next(err); }
}
app.post('/api/athlete/login', athLoginIp, athLoginPhone, async (req, res, next) => {
  try {
    const b = req.body || {};
    const phone = normalizePhone(b.phone);
    const a = phone ? await Athlete.findOne({ phone }).select('+passwordHash') : null;
    let ok = false;
    if (a && a.passwordHash) ok = await checkPw(b.password, a.passwordHash);
    else await scrypt('x', DUMMY_SALT, 32); // same timing whether or not the number exists
    if (!ok) return res.status(401).json({ message: 'رقم الهاتف أو كلمة السر غير صحيحة.' });
    setAthleteCookie(req, res, a);
    res.json({ ok: true });
  } catch (err) { next(err); }
});
app.post('/api/athlete/logout', (_req, res) => { res.clearCookie('tkd_athlete', { path: '/' }); res.json({ ok: true }); });
app.get('/api/athlete/me', requireAthlete, async (req, res, next) => {
  try {
    const a = req.athlete;
    const coach = a.coach ? await Coach.findById(a.coach).select('name').lean() : null;
    const evs = await Evaluation.find({ athlete: a._id }).sort({ date: -1, createdAt: -1 }).lean();
    res.json({
      athlete: { coach: coach ? coach.name : '', firstName: a.firstName, region: ar(REGIONS, a.region), belt: ar(BELTS, a.belt), beltKey: a.belt, weight: a.weight, specialty: ar(SPECIALTIES, a.specialty), category: ar(CATEGORIES, categoryOf(a)) },
      // the coach's private notes are never sent to the athlete
      evaluations: evs.map((e) => ({ id: String(e._id), date: e.date, stage: STAGES[e.stage], v: e.v || 1, mode: C.modeOf(e), r: e.ratings || null, sc: e.scores || null, type: e.type || '', total: e.total, ...N.toApi(N.fromDoc(e), C.VIEWS.ATHLETE) }))
    });
  } catch (err) { next(err); }
});
app.post('/api/athlete/password', submitLimiter, requireAthlete, async (req, res, next) => {
  try {
    const b = req.body || {}, a = req.athlete;
    const next_ = String(b.next || '').trim();
    if (!(await checkPw(b.current, a.passwordHash))) return res.status(400).json({ message: 'كلمة السر الحالية غير صحيحة.' });
    if (next_.length < 6 || next_.length > 64) return res.status(400).json({ message: 'كلمة السر الجديدة لازم تكون من 6 إلى 64 حرف.' });
    a.passwordHash = await hashPw(next_); a.pwv = (a.pwv || 0) + 1; await a.save();
    setAthleteCookie(req, res, a);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ message: 'مشكل في السيرفر، عاود بعد شوية.' });
});

if (require.main === module) {
  if (!process.env.ADMIN_KEY) { console.error('ADMIN_KEY is missing in .env'); process.exit(1); }
  if (process.env.ADMIN_KEY.length < 16) console.warn('Warning: ADMIN_KEY is short. Use 20+ random characters.');
  const port = process.env.PORT || 3000;
  mongoose.connect(process.env.MONGODB_URI)
    .then(() => app.listen(port, () => console.log(`Running on :${port}  (form: /   coach: /coach)`)))
    .catch((e) => { console.error('MongoDB connection failed:', e.message); process.exit(1); });
}
module.exports = app;
