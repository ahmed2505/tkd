try { require('dns').setServers(['8.8.8.8', '1.1.1.1']); } catch (_) {}
require('dotenv').config();
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const mongoose = require('mongoose');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const ExcelJS = require('exceljs');
const { REGIONS, BELTS, SPECIALTIES, CATEGORIES } = require('./options');

const vals = (l) => l.map((x) => x[0]);
const lab = (l, v) => { const x = l.find((y) => y[0] === v); return x ? `${x[1]} (${x[0]})` : (v || ''); };
const NAME_RE = /^[\p{L}][\p{L}\p{M}\s'’-]*$/u;

const CRIT = {
  ky: [['الهجوم', 20], ['الهجوم المضاد', 20], ['الدفاع', 10], ['التوقيت والمسافة', 15], ['السرعة ورد الفعل', 15], ['التكتيك واتخاذ القرار', 10], ['التحكم في المباراة', 10]],
  po: [['دقة التقنيات', 20], ['الثبات والوقفات', 20], ['التوازن', 10], ['القوة والسرعة', 15], ['الإيقاع والتوقيت', 15], ['التركيز والتعبير', 10], ['الانضباط والكيهاب', 10]]
};
const STAGES = { initial: 'التقييم الأولي', mid: 'تقييم منتصف الموسم', final: 'التقييم النهائي' };
const TYPES = { ky: 'قتال (Kyorugi)', po: 'فورمات (Poomsae)' };

// ---------- models ----------
const nameField = (l) => ({ type: String, required: [true, `اكتب ${l}.`], trim: true, maxlength: [40, 'طويل برشا (40 حرف كحد أقصى).'], match: [NAME_RE, 'حروف فقط من فضلك.'] });
const choice = (list, l) => ({ type: String, required: [true, `اختار ${l}.`], enum: { values: vals(list), message: `اختار ${l} من القائمة.` } });

const Athlete = mongoose.model('Athlete', new mongoose.Schema({
  firstName: nameField('الاسم'),
  lastName: nameField('اللقب'),
  region: choice(REGIONS, 'الولاية'),
  belt: choice(BELTS, 'الحزام'),
  weight: { type: Number, required: [true, 'اكتب الوزن بالكيلوغرام.'], min: [10, 'الوزن لازم يكون 10 كغ على الأقل.'], max: [200, 'الوزن لازم يكون 200 كغ كحد أقصى.'] },
  specialty: choice(SPECIALTIES, 'الاختصاص'),
  category: choice(CATEGORIES, 'الفئة'),
  phone: { type: String, required: [true, 'اكتب رقم الهاتف.'], unique: true },
  source: { type: String, enum: ['link', 'coach'], default: 'link' }
}, { timestamps: true }));

const text = { type: String, maxlength: 1000, default: '', trim: true };
const Evaluation = mongoose.model('Evaluation', new mongoose.Schema({
  athlete: { type: mongoose.Schema.Types.ObjectId, ref: 'Athlete', required: true, index: true },
  date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  stage: { type: String, enum: Object.keys(STAGES), required: true },
  type: { type: String, enum: Object.keys(TYPES), required: true },
  scores: { type: [Number], required: true },
  total: { type: Number, required: true, min: 0, max: 100 },
  strengths: text, improve: text, goal: text, notes: text,
  by: { type: String, enum: ['المدرب', 'المساعد'], default: 'المدرب' }
}, { timestamps: true }));

class Bad extends Error { constructor(errors) { super('bad'); this.errors = errors; this.bad = true; } }

function normalizePhone(raw) {
  const digits = String(raw || '').replace(/[\s.-]/g, '').replace(/^(\+216|00216)/, '');
  return /^[2-9]\d{7}$/.test(digits) ? `+216${digits}` : null;
}
function sendErr(err, res, next) {
  if (err.bad) return res.status(400).json({ errors: err.errors });
  if (err.code === 11000) return res.status(409).json({ errors: { phone: 'هذا الرقم مسجّل من قبل.' } });
  if (err.name === 'ValidationError') {
    const errors = {};
    for (const [k, v] of Object.entries(err.errors)) errors[k] = v.message;
    return res.status(400).json({ errors });
  }
  next(err);
}
async function createAthlete(b, source) {
  const phone = normalizePhone(b.phone);
  if (!phone) throw new Bad({ phone: 'اكتب رقم تونسي صحيح (8 أرقام).' });
  const weight = Number(b.weight);
  if (!Number.isFinite(weight)) throw new Bad({ weight: 'اكتب الوزن بالكيلوغرام.' });
  // explicit whitelist: no mass-assignment
  return Athlete.create({ firstName: b.firstName, lastName: b.lastName, region: b.region, belt: b.belt, weight, specialty: b.specialty, category: b.category, phone, source });
}

// shapes expected by the coach dashboard
const outAthlete = (a) => ({ id: String(a._id), name: `${a.firstName} ${a.lastName}`, firstName: a.firstName, lastName: a.lastName, region: a.region, belt: a.belt, weight: a.weight, spec: a.specialty, cat: a.category, phone: a.phone, source: a.source || 'link', ts: new Date(a.createdAt).getTime() });
const outEval = (e) => ({ id: String(e._id), ts: new Date(e.createdAt).getTime(), pid: String(e.athlete), date: e.date, stage: e.stage, type: e.type, sc: e.scores, total: e.total, st: e.strengths, im: e.improve, goal: e.goal, nt: e.notes, by: e.by });

// ---------- coach auth: signed, HttpOnly cookie ----------
const secret = () => process.env.SESSION_SECRET || process.env.ADMIN_KEY || '';
const mac = (s) => crypto.createHmac('sha256', secret()).update(s).digest('base64url');
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
function makeToken() { const p = Buffer.from(JSON.stringify({ exp: Date.now() + 30 * 864e5 })).toString('base64url'); return `${p}.${mac(p)}`; }
function validToken(t) {
  if (!t || !secret()) return false;
  const [p, m] = String(t).split('.');
  if (!p || !m || !safeEq(m, mac(p))) return false;
  try { return JSON.parse(Buffer.from(p, 'base64url').toString()).exp > Date.now(); } catch { return false; }
}
function cookie(req, name) {
  const c = (req.headers.cookie || '').split(';').map((s) => s.trim()).find((s) => s.startsWith(`${name}=`));
  return c ? decodeURIComponent(c.slice(name.length + 1)) : '';
}
function isAdmin(req, allowQuery) {
  if (validToken(cookie(req, 'tkd_admin'))) return true;
  const key = process.env.ADMIN_KEY;
  return Boolean(key) && safeEq(req.get('x-admin-key') || (allowQuery ? req.query.key : '') || '', key);
}
const requireAdmin = (req, res, next) => (isAdmin(req) ? next() : res.status(401).json({ message: 'انتهت الجلسة، ادخل من جديد.' }));

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

// public: athlete registration
app.post('/api/athletes', submitLimiter, async (req, res, next) => {
  try {
    const b = req.body || {};
    if (b.website) return res.status(201).json({ ok: true }); // honeypot
    if (b.consent !== true) throw new Bad({ consent: 'لازم توافق على إرسال المعلومات.' });
    await createAthlete(b, 'link');
    res.status(201).json({ ok: true });
  } catch (err) { sendErr(err, res, next); }
});

// coach: session
app.post('/api/admin/login', loginLimiter, (req, res) => {
  const key = process.env.ADMIN_KEY;
  if (!key || !safeEq((req.body || {}).key || '', key)) return res.status(401).json({ message: 'المفتاح غير صحيح.' });
  res.cookie('tkd_admin', makeToken(), { httpOnly: true, sameSite: 'strict', secure: req.secure, maxAge: 30 * 864e5, path: '/' });
  res.json({ ok: true });
});
app.post('/api/admin/logout', (_req, res) => { res.clearCookie('tkd_admin', { path: '/' }); res.json({ ok: true }); });

// coach: data
app.use('/api/admin', adminLimiter);
app.get('/api/admin/data', requireAdmin, async (_req, res, next) => {
  try {
    const [a, e] = await Promise.all([Athlete.find().sort({ createdAt: -1 }).lean(), Evaluation.find().sort({ createdAt: -1 }).lean()]);
    res.json({ athletes: a.map(outAthlete), evaluations: e.map(outEval) });
  } catch (err) { next(err); }
});
app.post('/api/admin/athletes', requireAdmin, async (req, res, next) => {
  try { res.status(201).json(outAthlete((await createAthlete(req.body || {}, 'coach')).toObject())); } catch (err) { sendErr(err, res, next); }
});
app.delete('/api/admin/athletes/:id', requireAdmin, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'معرّف غير صحيح.' });
    await Evaluation.deleteMany({ athlete: req.params.id });
    await Athlete.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (err) { next(err); }
});
app.post('/api/admin/evaluations', requireAdmin, async (req, res, next) => {
  try {
    const b = req.body || {};
    const crit = CRIT[b.type];
    if (!crit) throw new Bad({ type: 'نوع التقييم غير صحيح.' });
    if (!mongoose.isValidObjectId(b.pid) || !(await Athlete.exists({ _id: b.pid }))) throw new Bad({ pid: 'اللاعب غير موجود.' });
    const sc = Array.isArray(b.sc) ? b.sc.map(Number) : [];
    if (sc.length !== crit.length || sc.some((v, i) => !Number.isInteger(v) || v < 0 || v > crit[i][1])) throw new Bad({ sc: 'النقاط غير صحيحة.' });
    const s = (v) => String(v ?? '');
    const e = await Evaluation.create({ athlete: b.pid, date: s(b.date), stage: s(b.stage), type: b.type, scores: sc, total: sc.reduce((x, y) => x + y, 0), strengths: s(b.st), improve: s(b.im), goal: s(b.goal), notes: s(b.nt), by: s(b.by) || 'المدرب' }); // total is computed server-side
    res.status(201).json(outEval(e.toObject()));
  } catch (err) { sendErr(err, res, next); }
});
app.delete('/api/admin/evaluations/:id', requireAdmin, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'معرّف غير صحيح.' });
    await Evaluation.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// coach: Excel (always generated live from MongoDB). Works with the login cookie, or ?key= / x-admin-key.
app.get('/admin/export.xlsx', adminLimiter, async (req, res, next) => {
  try {
    if (!isAdmin(req, true)) return res.status(401).send('Unauthorized');
    const [athletes, evals] = await Promise.all([
      Athlete.find().sort({ category: 1, specialty: 1, weight: 1 }).lean(),
      Evaluation.find().sort({ date: -1 }).lean()
    ]);
    const names = new Map(athletes.map((a) => [String(a._id), `${a.firstName} ${a.lastName}`]));
    const wb = new ExcelJS.Workbook();
    const sheet = (title, cols) => {
      const ws = wb.addWorksheet(title, { views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }] });
      ws.columns = cols.map(([header, key, width]) => ({ header, key, width, style: { alignment: { vertical: 'top', wrapText: true } } }));
      const h = ws.getRow(1);
      h.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF15151A' } };
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
      return ws;
    };
    const wa = sheet('اللاعبون', [['الاسم (First name)', 'firstName', 18], ['اللقب (Last name)', 'lastName', 18], ['الولاية (Region)', 'region', 22], ['الحزام (Belt)', 'belt', 24], ['الوزن kg (Weight)', 'weight', 14], ['الاختصاص (Specialty)', 'specialty', 20], ['الفئة (Category)', 'category', 18], ['الهاتف (Phone)', 'phone', 16], ['المصدر (Source)', 'source', 14], ['تاريخ التسجيل (Registered)', 'createdAt', 22]]);
    athletes.forEach((a) => wa.addRow({ ...a, region: lab(REGIONS, a.region), belt: lab(BELTS, a.belt), specialty: lab(SPECIALTIES, a.specialty), category: lab(CATEGORIES, a.category), source: a.source === 'coach' ? 'المدرب' : 'الرابط' }));
    wa.getColumn('createdAt').numFmt = 'dd/mm/yyyy hh:mm';
    const we = sheet('التقييمات', [['اللاعب', 'who', 22], ['التاريخ', 'date', 12], ['المرحلة', 'stage', 20], ['النوع', 'type', 18], ['المجموع /100', 'total', 12], ['التفاصيل', 'detail', 60], ['نقاط القوة', 'strengths', 30], ['نقاط التحسين', 'improve', 30], ['الهدف القادم', 'goal', 30], ['ملاحظات', 'notes', 30], ['أجراه', 'by', 10]]);
    evals.forEach((e) => we.addRow({ ...e, who: names.get(String(e.athlete)) || '(محذوف)', stage: STAGES[e.stage], type: TYPES[e.type], detail: (CRIT[e.type] || []).map((c, i) => `${c[0]}: ${e.scores[i]}/${c[1]}`).join(' | ') }));

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="tkd-${new Date().toISOString().slice(0, 10)}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
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
