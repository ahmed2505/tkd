(function () {
  var app = document.getElementById('app'), data = null, loading = true;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(iso) { var a = String(iso).split('-'); return a.length === 3 ? a[2] + '/' + a[1] + '/' + a[0] : iso; }
  function toast(t) { var d = document.createElement('div'); d.className = 'toast'; d.textContent = t; document.body.appendChild(d); setTimeout(function () { d.remove(); }, 2600); }
  function $(id) { return document.getElementById(id); }
  function api(m, u, b) {
    return fetch(u, { method: m, credentials: 'same-origin', headers: b ? { 'Content-Type': 'application/json' } : {}, body: b ? JSON.stringify(b) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) { var e = new Error(j.message || 'صار مشكل، عاود المحاولة'); e.status = r.status; throw e; } return j; }); });
  }
  function tag(t) { return '<span class="tag">' + esc(t) + '</span>'; }
  function loginV() {
    return '<div class="head"><div><h1>TKD_2026 🥋</h1><small>ATHLETE LOGIN</small></div></div><div class="card"><h2>دخول اللاعب</h2><p class="muted">اكتب رقم هاتفك وكلمة السر اللي عطاك إياها المدرب.</p>' +
      '<label>رقم الهاتف</label><input id="ph" type="tel" inputmode="tel" dir="ltr" autocomplete="username" placeholder="22 123 456">' +
      '<label>كلمة السر</label><input id="pw" type="password" dir="ltr" autocomplete="current-password" autocapitalize="none" autocorrect="off">' +
      '<button class="btn" id="go">دخول</button><p id="status" role="alert"></p></div>';
  }
  function evCard(e) {
    return '<div class="item"><div class="top"><div><b>' + esc(e.stage) + '</b><div><span class="tag">' + esc(e.typeLabel) + '</span><span class="tag">' + fmt(e.date) + '</span></div></div><div class="sc">' + e.total + '/' + e.max + '</div></div>' +
      '<div class="bar"><i style="width:' + e.pct + '%"></i></div>' +
      e.items.map(function (i) { return '<div style="margin-top:10px"><div style="display:flex;justify-content:space-between"><span>' + esc(i.n) + '</span><b style="direction:ltr">' + i.s + '/' + i.m + '</b></div><div class="bar"><i style="width:' + Math.round(i.s / i.m * 100) + '%"></i></div></div>'; }).join('') +
      (e.st ? '<p><b>نقاط القوة:</b> ' + esc(e.st) + '</p>' : '') + (e.im ? '<p><b>نقاط التحسين:</b> ' + esc(e.im) + '</p>' : '') + (e.goal ? '<p><b>🎯 الهدف القادم:</b> ' + esc(e.goal) + '</p>' : '') + '</div>';
  }
  function dash() {
    var a = data.athlete, ev = data.evaluations;
    var h = '<div class="head"><div><h1>أهلا ' + esc(a.firstName) + ' 🥋</h1><small>TKD_2026 • ATHLETE</small></div><button class="pill" id="out">خروج</button></div>';
    h += '<div class="card">' + tag(a.category) + tag(a.weight + ' kg') + tag(a.belt) + tag(a.specialty) + tag(a.region) + '</div>';
    if (!ev.length) return h + '<div class="card"><h2>تقييماتك</h2><p class="muted">ما فماش تقييم بعد. باش يظهرلك هنا على طول بعد ما يسجّلو المدرب.</p></div>' + pwCard();
    h += '<div class="total"><div class="muted">آخر تقييم: ' + fmt(ev[0].date) + '</div><big>' + ev[0].pct + '%</big><div class="muted">' + ev[0].total + '/' + ev[0].max + '</div></div>';
    ['ky', 'po'].forEach(function (t) {
      var l = ev.filter(function (e) { return e.type === t; });
      if (l.length > 1) { var d = l[0].pct - l[l.length - 1].pct; h += '<div class="card"><h2>تطورك في ' + esc(l[0].typeLabel) + '</h2><p>الفرق بين أول وآخر تقييم: <b class="' + (d >= 0 ? 'up' : 'down') + '" style="direction:ltr;display:inline-block">' + (d > 0 ? '+' : '') + d + '%</b></p></div>'; }
    });
    return h + '<div class="card"><h2>كل تقييماتك</h2>' + ev.map(evCard).join('') + '</div>' + pwCard();
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
