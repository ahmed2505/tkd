// Coach Approval Gate (browser side): runs the REAL coach.js against the DOM stub.
const test = require('node:test');
const assert = require('node:assert/strict');
const { setupDom, load, tick } = require('../test-helpers/dom');

const reg = (id, name, extra) => ({ id, coach: 'c1', coachName: '', name, firstName: name.split(' ')[0], lastName: name.split(' ')[1], gender: 'Male', dob: '2012-06-01', age: 14, cat: 'Cadet', region: 'Tunis', belt: 'Blue', weight: 52, spec: 'Kyorugi', phone: '+21622123456', ts: 1700000000000, ...extra });

function boot(pending) {
  const data = { athletes: [], evaluations: [], pending, me: { role: 'coach', name: 'Coach', username: 'c', slug: 'abcdef' } };
  global.__calls = [];
  const env = setupDom({ '/api/admin/data': data, '/api/admin/registrations/r1/accept': { ok: true }, '/api/admin/registrations/r1/deny': { ok: true } }, {
    '.tab': () => [],
    '[data-pa]': () => ['accept', 'deny', 'later'].map((pa) => ({ dataset: { pa } })),
    '[data-pa="accept"]': () => [{ dataset: { pa: 'accept' }, focus() {} }]
  });
  const base = global.fetch; // the server would drop the request from the pending list once decided: mimic that
  global.fetch = async (url, opts) => { const r = await base(url, opts); if (opts && opts.method === 'POST') data.pending = data.pending.filter((p) => !url.includes('/' + p.id + '/')); return r; };
  return { data, ...env };
}
const posts = () => global.__calls.filter((c) => c.opts && c.opts.method === 'POST').map((c) => c.url);
const click = (env, pa) => env.els['[data-pa]'].find((b) => b.dataset.pa === pa).onclick();

test('a pending request raises the modal with the athlete details and Accept / Deny; nothing is persisted yet', async () => {
  const env = boot([reg('r1', 'Ali Ben Salah'), reg('r2', 'Sami Trabelsi', { dob: '2005-01-01', age: 21, cat: 'Senior' })]);
  load('coach.js'); await tick();
  const pm = env.cache.pmodal;
  assert.equal(pm.hidden, false, 'modal is open');
  for (const s of ['Ali Ben Salah', 'قبول (Accept)', 'رفض (Deny)', '1 من 2', 'ناشئ', '14 سنة', '52 kg', '+21622123456']) assert.ok(pm.innerHTML.includes(s), s);
  assert.equal(env.attrs.inert, '', 'page behind the modal is inert');
  assert.deepEqual(posts(), [], 'opening the modal does not approve anything');
  assert.match(env.app.innerHTML, /class="bdg">2</, 'tab badge shows the pending count');
});

test('Accept calls the accept endpoint, refreshes, and moves on to the next request', async () => {
  const env = boot([reg('r1', 'Ali Ben Salah'), reg('r2', 'Sami Trabelsi')]);
  load('coach.js'); await tick();
  click(env, 'accept'); await tick();
  assert.deepEqual(posts(), ['/api/admin/registrations/r1/accept']);
  assert.ok(env.cache.pmodal.innerHTML.includes('Sami Trabelsi') && !env.cache.pmodal.innerHTML.includes('Ali Ben Salah'));
});

test('Deny needs a second tap (no accidental discard), then calls the deny endpoint; the modal closes when the queue is empty', async () => {
  const env = boot([reg('r1', 'Ali Ben Salah')]);
  load('coach.js'); await tick();
  click(env, 'deny'); await tick();
  assert.deepEqual(posts(), [], 'first tap only arms the button');
  assert.ok(env.cache.pmodal.innerHTML.includes('تأكيد الرفض'));
  click(env, 'deny'); await tick();
  assert.deepEqual(posts(), ['/api/admin/registrations/r1/deny']);
  assert.equal(env.cache.pmodal.hidden, true, 'queue empty: modal closed');
  assert.equal(env.attrs.inert, undefined, 'page is interactive again');
});

test('"Later" hides the modal for the session without deciding; the badge stays', async () => {
  const env = boot([reg('r1', 'Ali Ben Salah')]);
  load('coach.js'); await tick();
  click(env, 'later'); await tick();
  assert.equal(env.cache.pmodal.hidden, true);
  assert.deepEqual(posts(), []);
});

test('no pending requests: no modal', async () => {
  const env = boot([]);
  load('coach.js'); await tick();
  assert.equal(env.cache.pmodal.hidden, true);
});
