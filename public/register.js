(function () {
  var form = document.getElementById('form');
  var btn = form.querySelector('button.btn');
  var statusEl = document.getElementById('status');
  var PHONE_RE = /^(?:\+216|00216)?[2-9]\d{7}$/;

  function setErr(name, msg) {
    var f = form.querySelector('[data-field="' + name + '"]');
    if (!f) return;
    f.classList.toggle('invalid', Boolean(msg));
    f.querySelector('.err').textContent = msg || '';
  }
  function clearErrors() {
    form.querySelectorAll('[data-field]').forEach(function (f) { setErr(f.dataset.field, ''); });
    statusEl.textContent = '';
  }
  function validate(d) {
    var e = {}, w = Number(d.weight);
    if (!d.firstName) e.firstName = 'اكتب اسمك.';
    if (!d.lastName) e.lastName = 'اكتب لقبك.';
    if (!d.region) e.region = 'اختار ولايتك.';
    if (!d.belt) e.belt = 'اختار الحزام.';
    if (!d.weight || isNaN(w) || w < 10 || w > 200) e.weight = 'اكتب وزنك بالكيلوغرام (من 10 إلى 200).';
    if (!d.specialty) e.specialty = 'اختار الاختصاص.';
    if (!d.category) e.category = 'اختار الفئة.';
    if (!PHONE_RE.test((d.phone || '').replace(/[\s.-]/g, ''))) e.phone = 'اكتب رقم تونسي صحيح (8 أرقام).';
    if (!d.consent) e.consent = 'لازم توافق على إرسال المعلومات.';
    return e;
  }

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    clearErrors();
    var data = {};
    new FormData(form).forEach(function (v, k) { data[k] = typeof v === 'string' ? v.trim() : v; });
    data.consent = form.elements.consent.checked;

    var errors = validate(data);
    var keys = Object.keys(errors);
    if (keys.length) {
      keys.forEach(function (k) { setErr(k, errors[k]); });
      var first = form.querySelector('.invalid input, .invalid select');
      if (first) first.focus();
      return;
    }

    btn.disabled = true;
    btn.textContent = 'جاري الإرسال…';
    fetch('/api/athletes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      .then(function (res) { return res.json().catch(function () { return {}; }).then(function (body) { return { ok: res.ok, body: body }; }); })
      .then(function (r) {
        if (r.ok) {
          form.hidden = true;
          document.getElementById('doneTitle').textContent = 'تم تسجيلك ✓ يا ' + data.firstName;
          document.getElementById('done').hidden = false;
          window.scrollTo(0, 0);
          return;
        }
        if (r.body.errors) Object.keys(r.body.errors).forEach(function (k) { setErr(k, r.body.errors[k]); });
        else statusEl.textContent = r.body.message || 'صار مشكل، عاود المحاولة.';
      })
      .catch(function () { statusEl.textContent = 'ما فماش اتصال. تأكد من الإنترنت وعاود.'; })
      .then(function () { btn.disabled = false; btn.textContent = 'إرسال التسجيل'; });
  });
})();
