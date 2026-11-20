/* Shared UI bits: stroke icons (replace emoji), the Taegeuk brand mark, and the belt chip. Loaded before coach.js / athlete.js. */
(function (root) {
  'use strict';
  var P = {
    users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c.4-3.4 3-5.4 6-5.4s5.6 2 6 5.4"/><path d="M16 5.2a3 3 0 0 1 0 5.6M18 14.8c1.7.7 2.8 2.3 3 5.2"/>',
    eval: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 11h6M9 15h4"/>',
    trend: '<path d="M3 17l6-6 4 4 8-9"/><path d="M15 6h6v6"/>',
    sheet: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M4 9h16M4 15h16M10 9v12"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3"/>',
    inbox: '<path d="M4 13l2-8h12l2 8v6H4z"/><path d="M4 13h5l1 2h4l1-2h5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".8"/>',
    home: '<path d="M4 11l8-7 8 7"/><path d="M6 10v10h12V10"/><path d="M10 20v-5h4v5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    list: '<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r=".8"/><circle cx="4" cy="12" r=".8"/><circle cx="4" cy="18" r=".8"/>',
    logout: '<path d="M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4"/><path d="M16 8l4 4-4 4M20 12H9"/>',
    person: '<circle cx="12" cy="7.6" r="3.9"/><path d="M4.6 19.6a7.4 7.4 0 0 1 14.8 0Z"/>',
    user: '<circle cx="12" cy="8" r="3.6"/><path d="M5 20c.6-4 3.4-6 7-6s6.4 2 7 6"/>',
    swap: '<path d="M4 8h14l-3-3M20 16H6l3 3"/>',
    download: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>'
  };
  root.TKD_ICON = function (n, c) { return '<svg class="ico' + (c ? ' ' + c : '') + '" viewBox="0 0 24 24" aria-hidden="true">' + (P[n] || '') + '</svg>'; };
  // Taegeuk: Hong (red) over Chung (blue). `spin` plays the one-time load animation.
  root.TKD_MARK = function (spin) {
    return '<img class="mark' + (spin ? ' spin' : '') + '" src="/logo.png" width="46" height="46" alt="" decoding="async">';
  };
  // Belt chip from the stored English belt value (e.g. "Black 2nd Dan") + its display label.
  root.TKD_BELT = function (value, label) {
    var v = String(value == null ? '' : value).replace(/[^A-Za-z0-9+ ]/g, '');
    var l = String(label == null ? '' : label).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
    return '<span class="belt" data-belt="' + v + '"><i></i>' + l + '</span>';
  };
})(self);
