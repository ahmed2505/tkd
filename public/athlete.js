(function () {
  var C = TKD_CRITERIA, V = TKD_VIEW, N = TKD_NOTES, VIEW = C.VIEWS.ATHLETE; // role context: athlete scores show metric title + (explanation)
  var app = document.getElementById('app'), data = null, loading = true;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(iso) { var a = String(iso).split('-'); return a.length === 3 ? a[2] + '/' + a[1] + '/' + a[0] : iso; }
  function toast(t) { var d = document.createElement('div'); d.className = 'toast'; d.textContent = t; document.body.appendChild(d); setTimeout(function () { d.remove(); }, 2600); }
  function $(id) { return document.getElementById(id); }
  function api(m, u, b) {
    return fetch(u, { method: m, credentials: 'same-origin', headers: b ? { 'Content-Type': 'application/json' } : {}, body: b ? JSON.stringify(b) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) { var e = new Error(j.message || 'صار مشكل، عاود المحاولة'); e.status = r.status; throw e; } return j; }); });
  }
  var mark = function () { return typeof TKD_MARK === 'function' ? TKD_MARK(true) : ''; };
  function tag(t) { return '<span class="tag">' + esc(t) + '</span>'; }
  function loginV() {
    return '<div class="head"><div class="brand">' + mark() + '<div><h1>TKD 2026</h1><small>بوابة اللاعب</small></div></div></div><div class="card"><h2>دخول اللاعب</h2><p class="muted">اكتب رقم هاتفك وكلمة السر اللي عطاك إياها المدرب.</p>' +
      '<label>رقم الهاتف</label><input id="ph" type="tel" inputmode="tel" dir="ltr" autocomplete="username" placeholder="22 123 456">' +
      '<label>كلمة السر</label><input id="pw" type="password" dir="ltr" autocomplete="current-password" autocapitalize="none" autocorrect="off">' +
      '<button class="btn" id="go">دخول</button><p id="status" role="alert"></p></div>';
  }
  var beltKey = '';
  function evCard(e) {
    var v = C.describe(e, VIEW);
    return '<div class="item"' + (beltKey ? ' data-belt="' + esc(beltKey) + '"' : '') + '><div class="top"><div><b>' + esc(e.stage) + '</b><div><span class="tag">' + esc(C.modeTitle(v.mode)) + (v.legacy ? ' · قديم' : '') + '</span><span class="tag">' + fmt(e.date) + '</span></div></div><div class="sc">' + v.total + '/' + v.max + '</div></div>' +
      '<div class="bar"><i style="width:' + v.pct + '%"></i></div>' + V.groups(e, VIEW) +
      V.notes(N.fromApi(e), VIEW) + '</div>'; // only the fields an athlete may see (never الملاحظات)
  }
  function dash() {
    var a = data.athlete, ev = data.evaluations; beltKey = a.beltKey || '';
    var h = '<div class="head"><div class="brand">' + mark() + '<div><h1>أهلا ' + esc(a.firstName) + '</h1><small>TKD 2026</small></div></div><div class="acct"><button class="ib" id="out" aria-label="تسجيل الخروج" title="تسجيل الخروج">' + (typeof TKD_ICON === 'function' ? TKD_ICON('logout') : 'خروج') + '</button></div></div>';
    h += '<div class="card">' + (typeof TKD_BELT === 'function' && a.beltKey ? TKD_BELT(a.beltKey, a.belt) : tag(a.belt)) + tag(a.category) + tag(a.weight + ' kg') + tag(a.specialty) + tag(a.region) + (a.coach ? '<p class="muted" style="margin:10px 0 0">مدربك: <b>' + esc(a.coach) + '</b></p>' : '') + '</div>';
    if (!ev.length) return h + '<div class="card"><h2>تقييماتك</h2><p class="muted">ما فماش تقييم بعد. باش يظهرلك هنا على طول بعد ما يسجّلو المدرب.</p></div>' + pwCard();
    var vs = ev.map(function (e) { return C.describe(e, VIEW); }); // newest first
    h += '<div class="total" style="--p:' + vs[0].pct + '%"><div class="muted">آخر تقييم: ' + fmt(ev[0].date) + '</div><big>' + vs[0].pct + '%</big><div class="muted">' + vs[0].total + '/' + vs[0].max + '</div></div>';
    h += progressCard(vs);
    return h + '<div class="card"><h2>كل تقييماتك</h2>' + ev.map(evCard).join('') + '</div>' + pwCard();
  }
  // Progress is only meaningful inside one mode (Kyorugi and Freestyle have different categories), so it is computed per mode.
  function progressCard(vs) { // vs: described evaluations, newest first
    var by = {}, out = '';
    vs.forEach(function (v) { (by[v.mode] = by[v.mode] || []).push(v); });
    Object.keys(by).forEach(function (m) {
      var l = by[m]; if (l.length < 2) return;
      var d = l[0].pct - l[l.length - 1].pct, nw = l.filter(function (v) { return !v.legacy; });
      out += '<h3 style="margin:14px 0 6px">' + esc(C.modeTitle(m)) + '</h3><p>الفرق بين أول وآخر تقييم: <b class="' + (d >= 0 ? 'up' : 'down') + '" style="direction:ltr;display:inline-block">' + (d > 0 ? '+' : '') + d + '%</b></p>';
      if (nw.length > 1) out += nw[0].groups.map(function (g, i) { var x = g.pct - nw[nw.length - 1].groups[i].pct; return '<div class="gv-i"><span>' + esc(g.title) + '</span><b class="' + (x >= 0 ? 'up' : 'down') + '" style="direction:ltr">' + (x > 0 ? '+' : '') + x + '%</b></div>'; }).join('');
    });
    return out ? '<div class="card"><h2>تطورك</h2>' + out + '</div>' : '';
  }
  function pwCard() {
    return '<div class="card"><h2>تغيير كلمة السر</h2><label>كلمة السر الحالية</label><input id="cp" type="password" dir="ltr" autocomplete="current-password" autocapitalize="none"><label>كلمة السر الجديدة (6 أحرف على الأقل)</label><input id="np" type="password" dir="ltr" autocomplete="new-password" autocapitalize="none"><button class="btn sec" id="chg">تغيير</button></div>';
  }
  function load() { return api('GET', '/api/athlete/me').then(function (d) { data = d; }).catch(function () { data = null; }); }
  function render() {
    if (loading) { app.innerHTML = '<p class="muted" style="text-align:center;margin-top:35vh">…</p>'; return; }
    if (!data) {
      app.innerHTML = loginV();
      var go = function () {
        var b = $('go'); b.disabled = true; $('status').textContent = '';
        api('POST', '/api/athlete/login', { phone: $('ph').value, password: $('pw').value }).then(load).then(render)
          .catch(function (e) { b.disabled = false; $('status').textContent = e.message; });
      };
      $('go').onclick = go; $('pw').onkeydown = function (e) { if (e.key === 'Enter') go(); };
      return;
    }
    app.innerHTML = dash();
    $('out').onclick = function () { api('POST', '/api/athlete/logout').then(function () { data = null; render(); }); };
    var c = $('chg'); if (c) c.onclick = function () {
      api('POST', '/api/athlete/password', { current: $('cp').value, next: $('np').value }).then(function () { $('cp').value = ''; $('np').value = ''; toast('تم تغيير كلمة السر ✓'); }).catch(function (e) { toast(e.message); });
    };
  }
  load().then(function () { loading = false; render(); });
})();
