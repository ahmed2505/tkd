/* Shared rendering of metric names and of an evaluation's category/metric breakdown (coach log + athlete portal).
 * Every function takes the role context `view` (TKD_CRITERIA.VIEWS.COACH | .ATHLETE). Whether the parenthetical
 * description shows is decided ONLY by TKD_CRITERIA (metricLabel/describe); a missing view means "coach" (title only). */
(function (root) {
  'use strict';
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };

  /** Inline HTML for one metric name: "title" (coach) or "title (description)" (athlete). */
  function metricName(metric, view) {
    var l = root.TKD_CRITERIA.metricLabel(metric, view);
    return '<b>' + esc(l.title) + '</b>' + (l.description ? '<span class="mdesc"> (' + esc(l.description) + ')</span>' : '');
  }
  function itemRow(i, view) {
    return '<div class="gv-i"><span class="gv-t">' + metricName(i, view) + '</span><b class="gv-s">' + i.score + '/' + i.max + '</b></div>';
  }
  function groups(ev, view) {
    return root.TKD_CRITERIA.describe(ev, view).groups.map(function (g) {
      return '<div class="gv"><div class="gv-h"><div><b>' + esc(g.title) + '</b>' + (g.en ? '<small>' + esc(g.en) + '</small>' : '') + '</div><span class="sc">' + g.score + '/' + g.max + '</span></div>' +
        '<div class="bar"><i style="width:' + g.pct + '%"></i></div>' +
        g.items.map(function (i) { return itemRow(i, view); }).join('') + '</div>';
    }).join('');
  }
  /** The structured note fields ({key: text}, see notes.js) as the given view may see them; empty ones are skipped.
   *  Coach-only fields (e.g. الملاحظات) are filtered here too, not just on the server. */
  function notes(values, view) {
    var v = values || {};
    return root.TKD_NOTES.fieldsFor(view).filter(function (f) { return String(v[f.key] || '').trim(); }).map(function (f) {
      return '<div class="nf"><b>' + esc(f.label) + '</b><p>' + esc(v[f.key]) + '</p></div>';
    }).join('');
  }
  root.TKD_VIEW = { metricName: metricName, groups: groups, notes: notes };
})(self);
