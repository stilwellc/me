
// site.js — the features. The line-screen engine (matrix(), esc(), themeColors())
// lives in assets/engine.js and loads first. Everything here is guarded so it
// still works if the engine is missing a newer method.

// ── shared bits ──────────────────────────────────────────────────────────────
var REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
var TOUCH = matchMedia('(hover: none)').matches;
var HERE = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
var LINKEDIN = 'https://www.linkedin.com/in/collin-stilwell/';
document.documentElement.classList.add('js');
// escape for HTML text and attributes, single quote included
function h(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function ssGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
function ssSet(k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} }
function ssDel(k) { try { sessionStorage.removeItem(k); } catch (e) {} }
function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
function usd(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
function ago(t) {
  var s = (Date.now() - t) / 1000; if (!(s >= 0)) return 'just now'; if (s < 90) return 'just now';
  var m = s / 60; if (m < 60) return Math.round(m) + ' min ago';
  var hr = m / 60; if (hr < 36) return Math.round(hr) + 'h ago';
  var d = hr / 24; if (d < 14) return Math.round(d) + ' days ago';
  return Math.round(d / 7) + ' weeks ago';
}
// Today as month-day, with a test hook: ?day=03-02
function monthDay() { var q = /[?&]day=(\d\d-\d\d)/.exec(location.search); if (q) return q[1]; var d = new Date(); return ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
var MD = monthDay();
// A number that changes after a live read: only the changed digits roll, once, 240ms.
function setNum(el, txt) {
  if (!el) return; txt = String(txt); var old = el.textContent;
  if (old === txt) return;
  if (REDUCE || document.hidden || old.length !== txt.length) { el.textContent = txt; return; }
  var out = '';
  for (var i = 0; i < txt.length; i++) { var b = txt[i]; out += (b !== old[i] && /\d/.test(b)) ? '<span class="roll">' + b + '</span>' : h(b); }
  el.innerHTML = out; setTimeout(function () { if (el.querySelector('.roll')) el.textContent = txt; }, 320);
}
// A live swap: hold the height, fade the new content in over 240ms.
function swap(el, html) {
  if (!el || el.innerHTML === html) return;
  if (REDUCE || !el.animate) { el.innerHTML = html; return; }
  el.style.minHeight = el.offsetHeight + 'px'; el.innerHTML = html;
  el.animate([{ opacity: 0.25 }, { opacity: 1 }], { duration: 240, easing: 'cubic-bezier(.2,.7,.1,1)' });
  setTimeout(function () { el.style.minHeight = ''; }, 260);
}
function getJSON(u, opt) { return fetch(u, opt || { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }); }
// GitHub reads, reduced to what the site uses and cached ten minutes per tab
// (the API allows sixty unauthenticated calls an hour); a failure is silent
function ghGet(path, key, pick) {
  try { var c = JSON.parse(ssGet(key) || 'null'); if (c && Date.now() - c.at < 6e5 && c.v) return Promise.resolve(c.v); } catch (e) {}
  return getJSON('https://api.github.com/' + path, { headers: { Accept: 'application/vnd.github+json' } }).then(function (d) { var v = pick(d); if (v) ssSet(key, JSON.stringify({ at: Date.now(), v: v })); return v; }).catch(function () { return null; });
}
function ghEvents() {
  try { var c = JSON.parse(ssGet('gh:ev') || 'null'); if (c && Date.now() - c.at < 6e5 && c.v && c.v.length) return Promise.resolve(c.v); } catch (e) {}
  return getJSON('https://api.github.com/users/stilwellc/events/public?per_page=100', { headers: { Accept: 'application/vnd.github+json' } }).then(function (ev) {
    if (!Array.isArray(ev)) return null;
    var v = ev.map(function (e) { return { t: String(e.type || ''), d: String(e.created_at || ''), r: String((e.repo && e.repo.name) || '') }; });
    ssSet('gh:ev', JSON.stringify({ at: Date.now(), v: v })); return v;
  }).catch(function () { return null; });
}

// every page on the site: palette entries, header words (for the palette
// preview), the 404's known slugs
var PAGES = [
  { u: 'index.html', t: 'Home', h: 'g h', w: 'Collin' },
  { u: 'digital.html', t: 'Digital', h: 'g d', w: 'Digital' },
  { u: 'physical.html', t: 'Physical', h: 'g p', w: 'Physical' },
  { u: 'fourwalls.html', t: 'Four Walls', h: 'residence', w: 'Four Walls', k: 'apartment renovation home' },
  { u: 'prints.html', t: '3D prints', h: 'text → print', w: 'Prints', k: 'printing' },
  { u: 'wave.html', t: 'Wave panel', h: '3D prints', w: 'Wave', k: 'printing' },
  { u: 'security.html', t: 'Security', h: 'g s', w: 'Security', k: 'day job' },
  { u: 'writing.html', t: 'Writing', h: 'g n', w: 'Writing', k: 'essays substack' },
  { u: 'github.html', t: 'GitHub', h: 'g g', w: 'GitHub', k: 'code repos' },
  { u: 'about.html', t: 'About', h: 'g a', w: 'About' },
  { u: 'resume.html', t: 'Résumé', h: 'g r', w: 'Résumé', k: 'resume cv pdf' },
  { u: 'lectr.html', t: 'lectr, a case study', h: 'g l', w: 'lectr', k: 'auction', cs: 1 },
  { u: 'secmcphub.html', t: 'SecMCPHub, a case study', h: 'digital', w: 'SecMCPHub', k: 'security review', cs: 1 },
  { u: 'soiree.html', t: 'Soirée, a case study', h: 'digital', w: 'Soirée', k: 'events tonight', cs: 1 },
  { u: 'text2print.html', t: 'text2print, a case study', h: 'digital', w: 'text2print', k: 'printing cadquery', cs: 1 },
  { u: 'colophon.html', t: 'Colophon', h: 'stack and build', w: 'Colophon', k: 'playground' }
];
function pageOf(u) { var f = String(u || '').split('#')[0].split('?')[0].split('/').pop().toLowerCase() || 'index.html'; for (var i = 0; i < PAGES.length; i++) if (PAGES[i].u === f) return PAGES[i]; return null; }

// ── touch: the ⌘K pill is the menu (before the topbar clones the nav) ────────
(function () {
  if (!TOUCH) return;
  var btn = document.getElementById('palette-btn'); if (btn) { btn.textContent = 'Menu'; btn.setAttribute('aria-label', 'Menu'); btn.title = 'Menu'; }
  var foot = document.querySelector('.pal-foot'); if (foot) { foot.hidden = true; foot.style.display = 'none'; }
  var inp = document.getElementById('pal-in'); if (inp) inp.placeholder = 'Go to…';
})();

// ── phones: the masthead nav scrolls sideways; start with this page's pill in view
(function () {
  if (!matchMedia('(max-width: 760px)').matches) return;
  var nav = document.querySelector('header.mast nav'), on = nav && nav.querySelector('.pill.on'); if (!on || nav.scrollWidth <= nav.clientWidth) return;
  var a = on.getBoundingClientRect(), b = nav.getBoundingClientRect(); nav.scrollLeft += (a.left + a.width / 2) - (b.left + b.width / 2);
})();

// ── the condensed masthead: a slim bar that arrives once the real masthead
//    has scrolled away, so the site is one click away on a long page. A
//    visual duplicate for pointer users; keyboard users have the original.
(function () {
  var mast = document.querySelector('header.mast'); if (!mast || document.querySelector('body > .home')) return;
  var bar = document.createElement('div'); bar.className = 'topbar'; bar.setAttribute('aria-hidden', 'true');
  var brand = mast.querySelector('.brand'), nav = mast.querySelector('nav');
  if (!brand || !nav) return;
  var b = brand.cloneNode(true), n = nav.cloneNode(true);
  [].forEach.call(b.querySelectorAll('[id]'), function (e) { e.removeAttribute('id'); });
  [].forEach.call(n.querySelectorAll('[id]'), function (e) { var id = e.id; e.removeAttribute('id'); e.addEventListener('click', function () { var o = document.getElementById(id); if (o) o.click(); }); });
  [].forEach.call(b.querySelectorAll('a, button'), function (e) { e.tabIndex = -1; }); b.tabIndex = -1;
  [].forEach.call(n.querySelectorAll('a, button'), function (e) { e.tabIndex = -1; });
  bar.appendChild(b); bar.appendChild(n); document.body.appendChild(bar);
  var on = false, t = 0;
  function check() { var y = scrollY, edge = mast.offsetTop + mast.offsetHeight + 24, want = y > edge; if (want !== on) { on = want; document.body.classList.toggle('scrolled', on); } }
  addEventListener('scroll', function () { var now = Date.now(); if (now - t < 60) return; t = now; check(); }, { passive: true });
  addEventListener('resize', check); check();
})();

// ── case studies: a section index in the left margin, current section lit.
//    Sections keep the ids the page gives them; only a section without one
//    gets #sec-N. Under 1400px, where the rail does not fit, a chip in the
//    corner names the current section and opens the list (with the topbar).
(function () {
  var secs = [].slice.call(document.querySelectorAll('.cs .sec')); if (secs.length < 2) return;
  var rail = document.createElement('nav'); rail.className = 'rail'; rail.setAttribute('aria-label', 'Sections');
  var links = [];
  secs.forEach(function (sec, i) {
    var k = sec.querySelector('.k'); if (!k) return;
    if (!sec.id) sec.id = 'sec-' + (i + 1);
    var a = document.createElement('a'); a.href = '#' + sec.id; a.textContent = k.textContent.trim(); rail.appendChild(a); links.push([sec, a]);
  });
  if (links.length < 2) return;
  var mainEl = document.querySelector('main'); if (mainEl) document.body.insertBefore(rail, mainEl); else document.body.appendChild(rail);
  // a generated id did not exist when the browser looked for the #hash
  if (location.hash) { var tgt = document.getElementById(decodeURIComponent(location.hash.slice(1))); if (tgt && /^sec-\d+$/.test(tgt.id)) setTimeout(function () { tgt.scrollIntoView(); }, 0); }
  // the phone chip
  var chip = document.createElement('button'); chip.type = 'button'; chip.className = 'sec-chip'; chip.setAttribute('aria-haspopup', 'true'); chip.setAttribute('aria-expanded', 'false');
  var menu = document.createElement('nav'); menu.className = 'sec-menu'; menu.hidden = true; menu.setAttribute('aria-label', 'Sections');
  links.forEach(function (p) { var a = document.createElement('a'); a.href = p[1].getAttribute('href'); a.textContent = p[1].textContent; menu.appendChild(a); });
  document.body.appendChild(chip); document.body.appendChild(menu);
  // the chip exists only where the rail does not fit
  var narrow = matchMedia('(max-width: 1399px)');
  function fit() { chip.hidden = !narrow.matches; if (!narrow.matches) { menu.hidden = true; chip.setAttribute('aria-expanded', 'false'); } }
  if (narrow.addEventListener) narrow.addEventListener('change', fit); fit();
  function shut() { if (menu.hidden) return; menu.hidden = true; chip.setAttribute('aria-expanded', 'false'); }
  chip.addEventListener('click', function (e) { e.stopPropagation(); if (chip.hidden) return; menu.hidden = !menu.hidden; chip.setAttribute('aria-expanded', String(!menu.hidden)); if (!menu.hidden) { var on = menu.querySelector('a.on') || menu.querySelector('a'); if (on && !TOUCH) on.focus(); } });
  menu.addEventListener('click', function (e) { if (e.target.closest('a')) shut(); });
  document.addEventListener('click', function (e) { if (!menu.hidden && !menu.contains(e.target)) shut(); });
  addEventListener('keydown', function (e) { if (e.key === 'Escape' && !menu.hidden) { shut(); chip.focus(); } });
  var cur = null;
  function light(sec) {
    if (sec === cur) return; cur = sec;
    links.forEach(function (p, i) { var on = p[0] === sec; p[1].classList.toggle('on', on); if (on) p[1].setAttribute('aria-current', 'true'); else p[1].removeAttribute('aria-current'); var m = menu.children[i]; if (m) m.classList.toggle('on', on); if (on) chip.innerHTML = '<span class="sr">Section: </span>' + h(p[1].textContent) + ' <span aria-hidden="true">▾</span>'; });
  }
  function sweep() { var best = null, y = innerHeight * 0.38; links.forEach(function (p) { var r = p[0].getBoundingClientRect(); if (r.top <= y) best = p[0]; }); light(best || links[0][0]); }
  var tick = false; addEventListener('scroll', function () { shut(); if (!tick) { tick = true; requestAnimationFrame(function () { tick = false; sweep(); }); } }, { passive: true }); addEventListener('resize', sweep); sweep();
})();

// ── work cards: the real picture of each product, framed. The line screen is
// only its entrance: the first time a card scrolls into view the dots gather
// over it and dissolve into the picture underneath. Reduced motion: just the picture.
(function () {
  var cs = [].slice.call(document.querySelectorAll('canvas.thumb')); if (!cs.length) return;
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches, canRun = typeof matrix === 'function' && !reduce;
  var pending = [];
  cs.forEach(function (c) {
    var src = c.dataset.src || '', svg = /\.svg(\?|$)/i.test(src);
    var wrap = document.createElement('span'); wrap.className = 'thumb-wrap' + (svg ? ' is-mark' : ''); c.parentNode.insertBefore(wrap, c);
    var im = document.createElement('img'); im.className = 'thumb-img'; im.alt = ''; im.setAttribute('aria-hidden', 'true'); im.decoding = 'async'; im.loading = 'lazy'; im.src = src;
    var f = (c.dataset.focus || '0.5,0.5').split(','); im.style.objectPosition = (parseFloat(f[0]) * 100) + '% ' + (parseFloat(f[1]) * 100) + '%';
    wrap.appendChild(im);
    if (!canRun) { c.remove(); return; }
    wrap.appendChild(c); wrap.classList.add('veiled'); pending.push(c);
  });
  if (!pending.length) return;
  function lift(c, m) {
    if (c.__lifted) return; c.__lifted = true;
    var wrap = c.parentNode; wrap.classList.remove('veiled'); c.classList.add('done');
    setTimeout(function () { if (m && m.destroy) m.destroy(); c.remove(); }, 700);
  }
  function run(c) {
    var m = null; setTimeout(function () { lift(c, m); }, 3200);
    try { m = matrix(c, { src: c.dataset.src, text: '', plate: true, cell: 4, fit: /\.svg(\?|$)/i.test(c.dataset.src) ? 'contain' : 'cover', filler: false }); m.onSettled = function () { lift(c, m); }; }
    catch (e) { lift(c, m); }
  }
  if ('IntersectionObserver' in window) { var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { io.unobserve(e.target); run(e.target); } }); }, { threshold: 0.25 }); pending.forEach(function (c) { io.observe(c); }); }
  else pending.forEach(function (c) { lift(c, null); });
  window.__repaintStills = function () {};
})();

// ── plates arrive, quietly ──────────────────────────────────────────────────
// A plate already in view at load is simply there. Below the fold, the FIRST
// plate of each section (or Four Walls room) gathers the way the header does;
// the rest fade in over 480ms. Never under reduced motion; a backstop always
// lifts the veil.
(function () {
  if (REDUCE || !('IntersectionObserver' in window)) return;
  var all = [].slice.call(document.querySelectorAll('figure.plate img'));
  if (!all.length) return;
  var vh = innerHeight, firstOf = new Map(), imgs = [];
  all.forEach(function (img) {
    var g = img.closest('.room, section, .sec') || img.closest('main') || document.body;
    var first = !firstOf.has(g); if (first) firstOf.set(g, img);
    var r = img.getBoundingClientRect(); if (r.top < vh && r.bottom > 0) return;   // in view at load: never veiled
    img.__gather = first && typeof matrix === 'function'; imgs.push(img);
  });
  if (!imgs.length) return;
  var seen = new WeakSet(), left = imgs.length, running = 0, queue = [];
  function fire(img) { if (seen.has(img) || imgs.indexOf(img) < 0) return; seen.add(img); io.unobserve(img); left--; if (!img.__gather) { img.classList.remove('veil-fade'); return; } if (running >= 2) { queue.push(img); setTimeout(function () { if (queue.indexOf(img) >= 0) { queue.splice(queue.indexOf(img), 1); img.classList.remove('veiled'); } }, 2200); } else reveal(img); }
  function next() { running = Math.max(0, running - 1); var n = queue.shift(); if (n) reveal(n); }
  var io = new IntersectionObserver(function (es) { es.forEach(function (en) { if (en.isIntersecting) fire(en.target); }); }, { threshold: 0.18 });
  imgs.forEach(function (img) { if (img.__gather) img.classList.add('veiled'); else img.classList.add('veil-fade', 'fading'); io.observe(img); });
  // the observer can sit idle in a background tab or a slow engine; a cheap
  // sweep on scroll makes sure a plate in view always gets its turn
  var sweepT = 0;
  function sweep() { if (left <= 0) { removeEventListener('scroll', sweep); return; } var now = Date.now(); if (now - sweepT < 120) return; sweepT = now; var hh = innerHeight; imgs.forEach(function (img) { if (seen.has(img)) return; var r = img.getBoundingClientRect(); if (r.bottom > 0 && r.top < hh * 0.92) fire(img); }); }
  addEventListener('scroll', sweep, { passive: true }); addEventListener('resize', sweep); setTimeout(sweep, 400); setTimeout(sweep, 1500);
  window.__revealPlate = fire;   // test hook: reveal a plate without scrolling (the observer sleeps in a hidden tab)
  addEventListener('beforeprint', function () { imgs.forEach(function (i) { i.classList.remove('veiled', 'veil-fade'); }); });
  function reveal(img) {
    var lift = function () { img.classList.remove('veiled'); };
    var go = function () {
      var fig = img.closest('figure'); if (!fig || !img.clientWidth) { lift(); return; }
      running++;
      var done = false, c = document.createElement('canvas'), finish = function () { if (done) return; done = true; c.classList.add('done'); lift(); next(); setTimeout(function () { c.remove(); }, 700); };
      setTimeout(finish, 3200);   // the backstop is armed before anything can throw
      var onResize = function () { removeEventListener('resize', onResize); finish(); }; addEventListener('resize', onResize);
      c.className = 'plate-veil'; c.setAttribute('aria-hidden', 'true');
      var cs = getComputedStyle(img), pl = parseFloat(cs.paddingLeft) || 0, pt = parseFloat(cs.paddingTop) || 0, pr = parseFloat(cs.paddingRight) || 0, pb = parseFloat(cs.paddingBottom) || 0, bw = parseFloat(cs.borderLeftWidth) || 0;
      c.style.left = (img.offsetLeft + bw + pl) + 'px'; c.style.top = (img.offsetTop + bw + pt) + 'px'; c.style.width = (img.clientWidth - pl - pr) + 'px'; c.style.height = (img.clientHeight - pt - pb) + 'px';
      fig.appendChild(c);
      var area = img.clientWidth * img.clientHeight, cellPx = Math.max(5, Math.round(Math.sqrt(area / 20000)));   // big plates get a coarser screen
      try { var m = matrix(c, { src: img.currentSrc || img.src, text: '', plate: true, cell: cellPx, fit: 'cover' }); m.onSettled = finish; } catch (e) { finish(); }
    };
    if (img.complete) { if (img.naturalWidth) go(); else lift(); }
    else { img.addEventListener('load', go, { once: true }); img.addEventListener('error', lift, { once: true }); setTimeout(function () { if (!img.complete) lift(); }, 6000); }
  }
})();

// ── leaving a page ──────────────────────────────────────────────────────────
// The glyph travels with you: the page you leave hands its picture to the page
// you enter, which shows it first and dissolves it into its own (one hop).
var PREV_GLYPH = ssGet('mx:prev'); ssDel('mx:prev');
var _own = document.querySelector('canvas.matrix');
var OWN_GLYPH = _own ? _own.dataset.src : (document.getElementById('field') ? 'assets/collin.jpg' : null);
// a Digital card's thumbnail becomes the next page's header (one hop, same target only)
var FROM_RECT = null;
try { var _fr = JSON.parse(ssGet('mx:from') || 'null'); ssDel('mx:from'); if (_fr && _fr.p === HERE && _fr.r) FROM_RECT = _fr.r; } catch (e) {}
var HEAD = null, HEAD_CANVAS = null;          // this page's header band
var pendingHref = null, leaving = false, leaveT = 0;
function headVisible() {
  if (!HEAD) return false;
  if (typeof HEAD.visible === 'function') return !!HEAD.visible();
  if (document.hidden || !HEAD_CANVAS) return false;
  var r = HEAD_CANVAS.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && r.width > 0;
}
function goNow() { var u = pendingHref; if (!u) return; pendingHref = null; clearTimeout(leaveT); location.href = u; }
// the one way to leave a page: the latest click wins; a second click while the
// band is scattering goes at once; an off-screen band does not hold anyone up
function leave(href) {
  if (OWN_GLYPH) ssSet('mx:prev', OWN_GLYPH);
  pendingHref = href;
  if (leaving || REDUCE || !HEAD || !HEAD.scatter || !headVisible()) { leaving = true; goNow(); return; }
  leaving = true;
  try { HEAD.scatter(goNow); } catch (e) { goNow(); return; }
  leaveT = setTimeout(goNow, 700);
}
document.addEventListener('click', function (e) {
  var a = e.target.closest && e.target.closest('a[href]'); if (!a || a.target === '_blank' || a.origin !== location.origin) return;
  if (OWN_GLYPH) ssSet('mx:prev', OWN_GLYPH);
  if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button || a.hasAttribute('download')) return;
  if (a.pathname === location.pathname && a.hash) return;
  var th = a.querySelector('.thumb-wrap, canvas.thumb');
  if (th) { var r = th.getBoundingClientRect(); ssSet('mx:from', JSON.stringify({ p: (a.pathname.split('/').pop() || 'index.html').toLowerCase(), r: { x: r.left, y: r.top, w: r.width, h: r.height } })); }
  e.preventDefault(); leave(a.href);
});
// warm the next page while the finger or cursor is on its way
(function () {
  var done = {};
  function pf(e) {
    var a = e.target.closest && e.target.closest('a[href]'); if (!a || a.origin !== location.origin || a.target === '_blank' || a.pathname === location.pathname) return;
    var u = a.href.split('#')[0]; if (done[u]) return; done[u] = 1;
    var l = document.createElement('link'); l.rel = 'prefetch'; l.href = u; document.head.appendChild(l);
  }
  document.addEventListener('pointerdown', pf, { passive: true, capture: true });
  document.addEventListener('mouseover', pf, { passive: true });
  document.addEventListener('focusin', pf);
})();
// Back and Forward: a page restored from the cache comes back as it was left —
// scattered. Put every band back at once and forget the leave.
addEventListener('pageshow', function (e) {
  if (!e.persisted) return;
  leaving = false; pendingHref = null; clearTimeout(leaveT);
  (window.__mx || []).forEach(function (m) { try { if (m.restore) m.restore(); else m.setWord(m.word); } catch (err) {} });
  var ae = document.activeElement; if (ae && ae !== document.body && ae.blur) ae.blur();
  var pal = document.getElementById('pal'); if (pal) pal.hidden = true;
});
// a page that arrived through a view transition skips its entrance: the crossfade is the entrance
addEventListener('pagereveal', function (e) { if (e.viewTransition) document.documentElement.classList.add('arrived'); });
// print buttons (the résumé)
[].forEach.call(document.querySelectorAll('[data-print]'), function (b) { b.addEventListener('click', function () { window.print(); }); });

// ── the header's hint: plain words, named by what it says. The home page keeps
//    its hint; elsewhere it shows on the first page of a visit, then steps aside.
function tuneHint(c, home) {
  var hint = c.parentElement && c.parentElement.querySelector('.hint'); if (!hint) return;
  hint.removeAttribute('aria-label');
  if (home) { if (TOUCH) hint.textContent = 'tap to replay'; return; }
  hint.textContent = (TOUCH ? 'tap' : 'click') + ' to replay';
  if (ssGet('mx:hinted')) hint.hidden = true; else ssSet('mx:hinted', '1');
}

// headers on landers + case studies
if (typeof matrix === 'function') [].forEach.call(document.querySelectorAll('canvas.matrix'), function (c, i) {
  var src = c.dataset.src || null, o = { text: c.dataset.text || '', src: src, prev: PREV_GLYPH && PREV_GLYPH !== src ? PREV_GLYPH : null };
  if (FROM_RECT && i === 0) o.fromRect = FROM_RECT;
  if (c.dataset.layers === '1') o.layers = true;
  var m = matrix(c, o); if (i === 0) { HEAD = m; HEAD_CANVAS = c; }
  tuneHint(c, false);
});

// ── the home field: same engine, plus the word cycle and write-your-own-word
(function () {
  var c = document.getElementById('field');
  if (!c || typeof matrix !== 'function') return;
  var WORDS = ['Collin', 'Stilwell', 'Security'], wi = 0, typed = '', cycle = null, inside = false;
  if (MD === '10-04') WORDS.push('Snoopy');   // Snoopy's first strip, 1950
  var hint = document.getElementById('field-hint');
  var m = matrix(c, { text: WORDS[0], src: 'assets/collin.jpg', prev: PREV_GLYPH, picHold: 2.2 });
  HEAD = m; HEAD_CANVAS = c;
  tuneHint(c, true); hint = c.parentElement.querySelector('.hint') || hint;
  var HINT0 = hint ? hint.textContent : '';
  var base = c.getAttribute('aria-label') || '';
  var name = function (w) { if (/the word \S+$/.test(base)) c.setAttribute('aria-label', base.replace(/the word \S+$/, 'the word ' + w)); };
  var named = function (w) { c.setAttribute('aria-label', w + ', typed into the header'); };
  function startCycle() { if (REDUCE || cycle || typed || inside) return; cycle = setInterval(function () { wi = (wi + 1) % WORDS.length; m.setWord(WORDS[wi]); name(WORDS[wi]); }, 10000); }
  function stopCycle() { if (cycle) { clearInterval(cycle); cycle = null; } }
  startCycle();
  document.addEventListener('visibilitychange', function () { if (document.hidden) stopCycle(); else startCycle(); });
  // a morph starting under the cursor fights the flow field: hold still while it is in the band
  c.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') { inside = true; stopCycle(); } });
  c.addEventListener('pointerleave', function () { inside = false; startCycle(); });
  function reset() { typed = ''; m.setWord(WORDS[wi]); name(WORDS[wi]); if (hint) hint.textContent = HINT0; startCycle(); }
  function write(w) {
    typed = w; if (!w) { reset(); return; }
    stopCycle(); if (hint) hint.textContent = TOUCH ? 'tap to replay' : 'esc to reset';
    var lw = w.toLowerCase();
    if (lw === 'sudo') { m.setWord('denied'); named('denied'); return; }
    m.setWord(w); named(w);
    if (lw === 'snoopy' && m.replay) setTimeout(function () { m.replay(); }, 650);
    else if (lw === 'rawr') peek();
    else if (lw === 'hire') light();
  }
  function peek() {
    var box = c.parentElement.querySelector('.ape-peek');
    if (!box) { box = document.createElement('div'); box.className = 'ape-peek'; box.setAttribute('aria-hidden', 'true'); box.innerHTML = '<img src="assets/ape.svg" alt="">'; c.parentElement.appendChild(box); }
    var im = box.firstChild; if (!im.animate) return;
    im.animate(REDUCE ? [{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }] : [{ transform: 'translateY(100%)' }, { transform: 'translateY(22%)', offset: 0.25 }, { transform: 'translateY(26%) rotate(-4deg)', offset: 0.6 }, { transform: 'translateY(100%)' }], { duration: 1800, easing: 'cubic-bezier(.65,0,.35,1)' });
  }
  function light() {
    var a = document.querySelector('main a[href*="linkedin.com"]') || document.querySelector('a.pill[href*="linkedin.com"]'); if (!a) return;
    a.classList.add('lit'); setTimeout(function () { a.classList.remove('lit'); }, 2400);
  }
  window.__fieldType = function (e) {
    if (e.key === 'Escape') { if (!typed) return false; reset(); return true; }
    if (e.key === 'Backspace') { if (!typed) return false; write(typed.slice(0, -1)); return true; }
    if (e.key.length === 1 && /[a-zA-Z0-9 .&'-]/.test(e.key) && typed.length < 12) { write(typed + e.key); return true; }
    return false;
  };
  // phones: a tap on the band opens the keyboard, so the promise is real
  if (TOUCH) {
    var ti = document.createElement('input');
    ti.type = 'text'; ti.className = 'field-input'; ti.setAttribute('inputmode', 'text'); ti.setAttribute('autocapitalize', 'off'); ti.setAttribute('autocomplete', 'off'); ti.setAttribute('autocorrect', 'off'); ti.spellcheck = false; ti.maxLength = 12; ti.setAttribute('aria-label', 'Write a word into the header'); ti.setAttribute('enterkeyhint', 'done');
    ti.style.cssText = 'position:absolute;left:0;bottom:0;width:1px;height:1px;opacity:0;border:0;padding:0;font-size:16px;pointer-events:none;';
    c.parentElement.appendChild(ti);
    c.addEventListener('click', function () { ti.value = typed; ti.focus({ preventScroll: true }); });
    ti.addEventListener('input', function () { var v = ti.value.replace(/[^a-zA-Z0-9 .&'-]/g, '').slice(0, 12); if (v !== ti.value) ti.value = v; write(v); });
    ti.addEventListener('keydown', function (e) { if (e.key === 'Enter') ti.blur(); });
  }
})();

// ── live: lectr's corpus count on the Digital page ─────────────────────────
(function () {
  if (!document.getElementById('cs-lots')) return;
  getJSON('https://lectr.bid/data/ray/meta.json').then(function (m) {
    if (!m || !m.totalLots) return;
    var hrs = Math.round((Date.now() - new Date(m.lastCrawl)) / 36e5), when = hrs < 1 ? 'under an hour ago' : hrs < 48 ? hrs + 'h ago' : Math.round(hrs / 24) + 'd ago';
    setNum(document.getElementById('cs-lots'), (m.totalLots / 1e6).toFixed(2) + 'M');
    var w = document.getElementById('cs-when'); if (w) w.textContent = 'crawled ' + when;
  }).catch(function () {});
})();

// ── the shortcuts dialog, rendered from one table so help and keymap agree
(function () {
  var grid = document.querySelector('#keys .keys-grid'); if (!grid) return;
  var ROWS = [['⌘K', 'command palette'], ['/', 'command palette'], ['g h', 'home'], ['g d', 'digital'], ['g p', 'physical'], ['g s', 'security'], ['g n', 'writing'], ['g g', 'github'], ['g a', 'about'], ['g r', 'résumé'], ['g l', 'lectr'], ['enter', 'on Replay: replay the header'], ['a–z', 'type a word into the home header'], ['?', 'this']];
  grid.innerHTML = ROWS.map(function (r) { return '<span>' + r[0].split(' ').map(function (k) { return '<kbd>' + h(k) + '</kbd>'; }).join(' ') + '</span><span>' + h(r[1]) + '</span>'; }).join('');
})();

// ── CTF: three flags. One in the home page source, one in the vault, one in
//    the console. Paste one into ⌘K. Only hashes live here.
var FLAGS = ['76a693d43f715e5545c7a62298058366727b0bf1a738198fd51e5c31db5fabe1', 'd6c66ac668cd9200b46636e0c68660f4cfe52bc969c95af0986737c77e182da5', 'cf72dcbfe0bd188c3536839ac538de29d3ffbda7001e52864d1b0d71a65e83c7'];
function flagCheck(s) {
  if (!window.crypto || !crypto.subtle || !window.TextEncoder) return Promise.resolve(-1);
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)).then(function (buf) {
    var hex = [].map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
    return FLAGS.indexOf(hex);
  });
}

// ── command palette + shortcuts ────────────────────────────────────────────
(function () {
  var pal = document.getElementById('pal'), inp = document.getElementById('pal-in'), list = document.getElementById('pal-list'), keys = document.getElementById('keys');
  if (!pal || !inp || !list) return;
  var norm = function (s) { return String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase(); };
  var ITEMS = PAGES.map(function (p) { return { t: p.t, h: p.h, u: p.u, k: p.k || '', w: p.w }; }).concat([
    { t: 'Starling', h: 'digital', u: 'digital.html#starling', k: 'ebay deals', w: 'Digital' }, { t: 'Elixir secure coding', h: 'digital', u: 'digital.html#elixir', k: 'semgrep ash podium', w: 'Digital' },
    { t: 'Open lectr.bid', h: '↗', u: 'https://lectr.bid', x: 1 }, { t: 'How we built the price-movement engine', h: '↗', u: 'https://lectr.bid/blog/how-we-built-the-pricing-engine', x: 1, k: 'blog pricing' }, { t: 'Open Starling', h: '↗', u: 'https://starling-6s1.pages.dev', x: 1 }, { t: 'text2print (GitHub)', h: '↗', u: 'https://github.com/stilwellc/text2print', x: 1 }, { t: 'Open soiree.today', h: '↗', u: 'https://soiree.today', x: 1 },
    { t: 'github.com/stilwellc', h: '↗', u: 'https://github.com/stilwellc', x: 1, k: 'code' }, { t: 'LinkedIn', h: '↗', u: LINKEDIN, x: 1, k: 'contact reply message hire' }, { t: 'Substack', h: '↗', u: 'https://collinsthoughts.substack.com', x: 1, k: 'essays writing' },
    { t: 'Shortcuts', h: '?', k: 'keys keyboard help', fn: function () { openKeys(); } }
  ]);
  // sections: this page's straight from the page; the other case studies' read once per visit
  var here = pageOf(HERE), HERE_SECS = [], OTHER_SECS = null;
  [].forEach.call(document.querySelectorAll('.cs .sec'), function (sec) { var k = sec.querySelector('.k'), h2 = sec.querySelector('h2'); if (!k || !sec.id) return; HERE_SECS.push({ t: (here ? here.w : '') + ' · ' + k.textContent.trim(), h: '§', u: '#' + sec.id, k: h2 ? h2.textContent : '', sd: h2 ? h2.textContent : '', sec: 1 }); });
  function loadSections() {
    if (OTHER_SECS) return;
    try { OTHER_SECS = JSON.parse(ssGet('pal:secs2') || 'null'); } catch (e) {} if (OTHER_SECS) return;
    OTHER_SECS = [];
    var todo = PAGES.filter(function (p) { return p.cs && p.u !== HERE; });
    Promise.all(todo.map(function (p) {
      return fetch(p.u).then(function (r) { return r.ok ? r.text() : ''; }).then(function (html) {
        if (!html) return [];
        var doc = new DOMParser().parseFromString(html, 'text/html'), out = [];
        [].forEach.call(doc.querySelectorAll('.cs .sec'), function (sec, i) { var k = sec.querySelector('.k'), h2 = sec.querySelector('h2'); if (!k) return; out.push({ t: p.w + ' · ' + k.textContent.trim(), h: '§', u: p.u + '#' + (sec.id || 'sec-' + (i + 1)), k: (h2 ? h2.textContent : '') + ' ' + (p.k || ''), sd: h2 ? h2.textContent : '', sec: 1, w: p.w }); });
        return out;
      }).catch(function () { return []; });
    })).then(function (lists) { OTHER_SECS = [].concat.apply([], lists); ssSet('pal:secs2', JSON.stringify(OTHER_SECS)); if (!pal.hidden) render(); });
  }
  var sel = 0, shown = ITEMS, out = null;
  function hay(i) { return i.__n || (i.__n = norm(i.t + ' ' + (i.k || '') + ' ' + (i.h || ''))); }
  function render() {
    out = null;
    var q = norm(inp.value.trim()), terms = q.split(/\s+/).filter(Boolean);
    var pool = q ? ITEMS.concat(HERE_SECS, OTHER_SECS || []) : ITEMS.slice(0, PAGES.length).concat(HERE_SECS, ITEMS.slice(PAGES.length));
    shown = pool.filter(function (i) { if (!q) return true; var s = hay(i); return s.indexOf(q) >= 0 || terms.every(function (t) { return s.indexOf(t) >= 0; }); });
    sel = Math.min(sel, Math.max(0, shown.length - 1));
    draw();
  }
  function draw() {
    inp.setAttribute('aria-activedescendant', shown.length ? 'pal-o' + sel : '');
    var head = out ? '<li class="out" role="presentation"><pre>' + h(out) + '</pre></li>' : '';
    list.innerHTML = head + (shown.map(function (i, k) { return '<li role="option" id="pal-o' + k + '" aria-selected="' + (k === sel) + '"' + (k === sel ? ' class="on"' : '') + ' data-k="' + k + '">' + row(i) + '</li>'; }).join('') || (out ? '' : '<li><span class="tt"><span class="d">nothing matches</span></span></li>'));
    var on = list.querySelector('li.on'); if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest' });
  }
  // a row: title (+ a grey description line); key chords, and only chords, on the right
  function row(i) {
    var hh = String(i.h || ''), chord = /^(g [a-z]|\?)$/.test(hh), t = i.t + (hh === '↗' ? ' ↗' : ''), d = '';
    if (hh === '§') d = String(i.sd || '').replace(/\s+/g, ' ').trim(); else if (!chord && hh !== '↗') d = hh;
    return '<span class="tt"><span>' + h(t) + '</span>' + (d ? '<span class="d">' + h(d) + '</span>' : '') + '</span><span class="h">' + (chord ? hh.split(' ').map(function (x) { return '<kbd>' + h(x) + '</kbd>'; }).join(' ') : '') + '</span>';
  }
  function say(text, items) { out = text; shown = items || []; sel = 0; draw(); }
  // preview: the band morphs toward where the selection points (engine permitting)
  var previewing = false;
  function preview() {
    if (!HEAD || !HEAD.preview) return; var i = shown[sel], p = i && !i.x && !i.fn ? (i.w ? i : pageOf(i.u)) : null;
    if (i && i.u && i.u[0] === '#') p = null;
    if (p && p.w) { try { HEAD.preview(p.w); previewing = true; } catch (e) {} }
  }
  function unpreview() { if (previewing && HEAD && HEAD.unpreview) { try { HEAD.unpreview(); } catch (e) {} } previewing = false; }
  function go(i) {
    if (!i) return;
    if (i.fn) { close(); return i.fn(); }
    if (i.x) { close(); window.open(i.u, '_blank', 'noopener'); return; }
    var hash = i.u.indexOf('#') >= 0 ? i.u.slice(i.u.indexOf('#')) : '', file = i.u.split('#')[0];
    if (!file || file.toLowerCase() === HERE) { close(); if (hash) { var el = document.getElementById(hash.slice(1)); if (el) { history.pushState(null, '', hash); el.scrollIntoView({ behavior: REDUCE ? 'auto' : 'smooth' }); } } return; }
    previewing = false; pal.hidden = true; inp.setAttribute('aria-expanded', 'false'); leave(i.u);
  }
  // commands for the curious: matched exactly, never listed
  var PORTS = { 'index.html': 80, 'digital.html': 443, 'physical.html': 3000, 'fourwalls.html': 3306, 'prints.html': 5000, 'wave.html': 5432, 'security.html': 8443, 'writing.html': 8080, 'github.html': 9418, 'about.html': 8000, 'resume.html': 8888, 'lectr.html': 4000, 'secmcphub.html': 7000, 'soiree.html': 6000, 'text2print.html': 9100, 'colophon.html': 9000 };
  var APPS = [['lectr', 1001, 'auction intelligence', '/srv/lectr', '/bin/nightly', 'https://lectr.bid'], ['starling', 1002, 'ebay deep value', '/srv/starling', '/bin/sweep', 'https://starling-6s1.pages.dev'], ['soiree', 1003, 'what is on tonight', '/srv/soiree', '/bin/scrape', 'https://soiree.today'], ['text2print', 1004, 'text to printable file', '/srv/text2print', '/bin/cadquery', 'https://github.com/stilwellc/text2print'], ['secmcphub', 1005, 'monthly security review', '/srv/secmcphub', '/bin/report', 'https://github.com/stilwellc/SecMCPHub']];
  function command(raw) {
    var c = norm(raw.trim()).replace(/\s+/g, ' ');
    if (c === 'sudo' || c === 'sudo su' || c === 'sudo -i') { say('collin is not in the sudoers file. This incident will be reported.'); return true; }
    if (c === 'sudo hire collin') { close(); window.open(LINKEDIN, '_blank', 'noopener'); return true; }
    if (c === 'nmap' || /^nmap /.test(c)) {
      var rows = PAGES.map(function (p) { return { t: (PORTS[p.u] + '/tcp').padEnd(9) + p.u.replace('.html', ''), h: 'open', u: p.u, w: p.w }; }).sort(function (a, b) { return parseInt(a.t, 10) - parseInt(b.t, 10); });
      say('Nmap scan report for stilwellc.github.io/me\n' + rows.length + ' open ports. No filtered ports. Nothing to exploit.\nPORT     SERVICE', rows); return true;
    }
    if (c === 'cat /etc/passwd') {
      say('root:x:0:0:collin:/home/collin:/bin/zsh', APPS.map(function (a) { return { t: a[0] + ':x:' + a[1] + ':' + a[1] + ':' + a[2] + ':' + a[3] + ':' + a[4], h: '↗', u: a[5], x: 1 }; })); return true;
    }
    if (c === 'rm -rf /' || c === 'rm -rf /*' || c === 'sudo rm -rf /' || c === 'ape' || c === 'kaiju') { close(); var ape = document.getElementById('ape'); if (ape) setTimeout(function () { ape.click(); }, 60); return true; }
    if (/^flag\{[^}]{1,80}\}$/i.test(raw.trim())) {
      flagCheck(raw.trim()).then(function (k) {
        if (k < 0) { say('Not one of mine. The flags look like flag{…}, and there are three.'); return; }
        var got = []; try { got = JSON.parse(ssGet('ctf') || '[]'); } catch (e) {}
        if (got.indexOf(k) < 0) got.push(k); ssSet('ctf', JSON.stringify(got));
        if (got.length >= 3) say('3/3 found. You\'d do well on my team.', [{ t: 'Say hello on LinkedIn', h: '↗', u: LINKEDIN, x: 1 }]);
        else say(got.length + '/3 found. ' + (3 - got.length) + ' to go.');
      });
      return true;
    }
    return false;
  }
  var opener = null;
  function open() { closeKeys(); opener = document.activeElement; pal.hidden = false; inp.value = ''; sel = 0; render(); if (!TOUCH) inp.focus(); inp.setAttribute('aria-expanded', 'true'); loadSections(); }
  function close() { pal.hidden = true; inp.setAttribute('aria-expanded', 'false'); inp.blur(); unpreview(); if (opener && opener.focus) { opener.focus(); opener = null; } }
  function openKeys() { if (!keys) return; close(); opener = opener || document.activeElement; keys.hidden = false; var box = keys.querySelector('.keys-box'); if (box) { box.tabIndex = -1; box.focus(); } }
  function closeKeys() { if (!keys || keys.hidden) return; keys.hidden = true; if (opener && opener.focus) { opener.focus(); opener = null; } }
  window.__palOpen = open;
  if (keys) { keys.setAttribute('aria-modal', 'true'); keys.addEventListener('keydown', function (e) { if (e.key === 'Tab') e.preventDefault(); }); keys.addEventListener('click', function (e) { if (e.target === keys) closeKeys(); }); }
  inp.setAttribute('role', 'combobox'); inp.setAttribute('aria-expanded', 'false'); inp.setAttribute('aria-controls', 'pal-list'); inp.setAttribute('aria-autocomplete', 'list');
  list.setAttribute('role', 'listbox');
  pal.addEventListener('keydown', function (e) { if (e.key === 'Tab') { e.preventDefault(); inp.focus(); } });
  inp.addEventListener('input', function () { sel = 0; render(); });
  list.addEventListener('click', function (e) { var li = e.target.closest('li[data-k]'); if (li) go(shown[+li.dataset.k]); });
  list.addEventListener('mousemove', function (e) { var li = e.target.closest('li[data-k]'); if (!li || +li.dataset.k === sel) return; sel = +li.dataset.k; draw(); preview(); });
  pal.addEventListener('click', function (e) { if (e.target === pal) close(); });
  var btn = document.getElementById('palette-btn'); if (btn) btn.addEventListener('click', open);
  var pending = null, pt = 0, gT = 0, gField = false;
  var CHORD = { h: 'index.html', d: 'digital.html', s: 'security.html', n: 'writing.html', g: 'github.html', a: 'about.html', r: 'resume.html', l: 'lectr.html', p: 'physical.html' };
  function flushG() { clearTimeout(gT); var was = pending === 'g' && gField; pending = null; gField = false; if (was && window.__fieldType) window.__fieldType({ key: 'g' }); }
  addEventListener('keydown', function (e) {
    var ae = document.activeElement, inField = /^(INPUT|TEXTAREA|SELECT)$/.test((ae || {}).tagName || '') || (ae && ae.isContentEditable);
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); pal.hidden ? open() : close(); return; }
    if (!pal.hidden) {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(shown.length - 1, sel + 1); draw(); preview(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); draw(); preview(); }
      else if (e.key === 'Enter') { e.preventDefault(); if (!command(inp.value)) go(shown[sel]); }
      return;
    }
    if (keys && !keys.hidden) { if (e.key === 'Escape' || e.key === '?') { e.preventDefault(); closeKeys(); } return; }
    if (inField || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === '/') { e.preventDefault(); open(); return; }
    if (e.key === '?') { e.preventDefault(); openKeys(); return; }
    // the home letterform takes keys only when nothing else has focus
    var fieldFocus = !!window.__fieldType && (!ae || ae === document.body || ae === document.documentElement || ae.id === 'field');
    var now = Date.now();
    if (pending === 'g') {
      if (now - pt < 900 && CHORD[e.key]) { clearTimeout(gT); pending = null; gField = false; e.preventDefault(); leave(CHORD[e.key]); return; }
      flushG();
    }
    if (e.key === 'g' && !e.repeat) {
      pending = 'g'; pt = now; gField = fieldFocus;
      if (fieldFocus) { e.preventDefault(); gT = setTimeout(flushG, 900); }
      return;
    }
    if (fieldFocus && window.__fieldType(e)) { e.preventDefault(); return; }
  });
})();

// ── GitHub, live ───────────────────────────────────────────────────────────
// A short list of the repositories that matter, described in the site's own
// words. The page ships a snapshot; a live read hydrates it in place and a
// failed one leaves the snapshot standing.
(function () {
  var cells = document.getElementById('gh-cells');
  if (!cells) return;
  var FEAT = ['lectr', 'starling', 'text2print', 'soiree', 'Mobi', 'SecMCPHub', 'ash-semgrep-rules'];
  var DESC = {
    lectr: 'Auction intelligence over 1.1M lots from 18 houses: a value engine with a public backtest, rebuilt every night.',
    starling: 'eBay listings priced under what lectr says they’re worth.',
    text2print: 'Claude Code skill that turns a text description into a printable file.',
    soiree: 'Tonight’s events, scraped from the people who post them.',
    Mobi: 'co.stil, a studio site for my software and physical work.',
    SecMCPHub: 'Claude Code skills that build a monthly security review from MCP data.',
    "ash-semgrep-rules": 'Semgrep rules that catch Ash Framework authorization gaps.'
  };
  var LANG = { 'ash-semgrep-rules': 'Semgrep' };
  ghGet('users/stilwellc', 'gh:user', function (u) { return u && u.created_at ? { public_repos: u.public_repos, created_at: u.created_at } : null; }).then(function (u) {
    if (!u) return;
    if (u.public_repos != null) setNum(document.getElementById('gh-repos'), String(+u.public_repos));
    var y = new Date(u.created_at).getFullYear(); if (y) setNum(document.getElementById('gh-since'), String(y));
  }).catch(function () {});
  ghGet('users/stilwellc/repos?per_page=100&sort=pushed', 'gh:repos', function (rs) { return Array.isArray(rs) ? rs.map(function (r) { return { name: r.name, fork: r.fork, pushed_at: r.pushed_at, html_url: r.html_url, stargazers_count: r.stargazers_count, language: r.language, description: r.description }; }) : null; }).then(function (rs) {
    if (!Array.isArray(rs) || !rs.length) return;
    var own = rs.filter(function (r) { return FEAT.indexOf(r.name) >= 0 && !r.fork; }).sort(function (a, b) { return String(b.pushed_at).localeCompare(String(a.pushed_at)); });
    if (!own.length) return;
    var byName = {}; own.forEach(function (r) { byName[r.name] = r; });
    var stat = [].slice.call(cells.querySelectorAll('[data-repo]'));
    if (stat.length) {
      // the page's own cells and words stay; only the facts that move are refreshed
      stat.forEach(function (cell) {
        var r = byName[cell.getAttribute('data-repo')]; if (!r) return;
        var foot = cell.querySelector('.foot'); if (foot && r.pushed_at) foot.textContent = 'pushed ' + String(r.pushed_at).slice(0, 10);
        var stars = +r.stargazers_count || 0, top = cell.querySelector('.top'), sp = cell.querySelector('.stars');
        if (stars && top) { if (!sp) { sp = document.createElement('span'); sp.className = 'pill mono stars'; top.appendChild(sp); } sp.textContent = '★ ' + stars; }
        cell.__p = String(r.pushed_at || '');
      });
      stat.slice().sort(function (a, b) { return String(b.__p || '').localeCompare(String(a.__p || '')); }).forEach(function (c) { cells.appendChild(c); });
      return;
    }
    swap(cells, own.map(function (r) {
      var url = String(r.html_url || ''), ok = url.indexOf('https://github.com/') === 0, stars = +r.stargazers_count || 0;
      var tag = ok ? 'a class="cell" data-repo="' + h(r.name) + '" href="' + h(url) + '" target="_blank" rel="noopener"' : 'div class="cell" data-repo="' + h(r.name) + '"';
      return '<' + tag + '><div class="top"><span class="pill mono">' + h(LANG[r.name] || r.language || 'repo') + '</span>' + (stars ? '<span class="pill mono stars">★ ' + stars + '</span>' : '') + '</div><h2>' + h(r.name) + (ok ? '<span class="arrow">↗</span>' : '') + '</h2><p>' + h(DESC[r.name] || r.description || '') + '</p><div class="foot">pushed ' + h(String(r.pushed_at || '').slice(0, 10)) + '</div></' + (ok ? 'a' : 'div') + '>';
    }).join(''));
  }).catch(function () {});
  ghEvents().then(function (ev) {
    var grid = document.getElementById('gh-grid');
    if (!ev || !ev.length) { if (grid && !grid.children.length) { var a0 = grid.closest('.act'); if (a0) a0.hidden = true; } return; }
    var pushes = ev.filter(function (e) { return e.t === 'PushEvent'; });
    var pe = document.getElementById('gh-pushes');
    if (pe) {
      var sp = pe.parentNode;
      if (sp && /pushes in the last/.test(sp.textContent)) sp.innerHTML = '<b id="gh-pushes">' + pushes.length + '</b> of the last ' + ev.length + ' public events were pushes';
      else setNum(pe, String(pushes.length));
    }
    if (pushes.length) {
      var last = document.getElementById('gh-last'), when = ago(new Date(pushes[0].d).getTime());
      if (last) last.textContent = when;
      else { var st = document.getElementById('gh-stats'); if (st) { var s = document.createElement('span'); s.innerHTML = 'last push <b id="gh-last">' + h(when) + '</b>'; st.appendChild(s); } }
    }
    // twelve weeks, a column a week, newest on the right
    if (grid) {
      var days = {}; pushes.forEach(function (e) { var d = e.d.slice(0, 10); days[d] = (days[d] || 0) + 1; });
      var now = new Date(), W = 12, cls = [], tips = [];
      for (var w = W - 1; w >= 0; w--) for (var d = 0; d < 7; d++) {
        var dt = new Date(now); dt.setDate(now.getDate() - (w * 7 + (6 - d)));
        var k = dt.toISOString().slice(0, 10), n = days[k] || 0;
        cls.push(n >= 6 ? 'l3' : n >= 3 ? 'l2' : n >= 1 ? 'l1' : ''); tips.push(k + ' · ' + n + ' push' + (n === 1 ? '' : 'es'));
      }
      if (grid.children.length === cls.length) [].forEach.call(grid.children, function (c, i) { c.className = cls[i]; c.title = tips[i]; });
      else swap(grid, cls.map(function (c, i) { return '<i class="' + c + '" title="' + h(tips[i]) + '"></i>'; }).join(''));
      grid.setAttribute('aria-label', 'Push activity: ' + pushes.length + ' pushes among the last ' + ev.length + ' public events, twelve weeks shown');
      grid.classList.add('weeks');
      var ax = grid.parentNode.querySelector('.gh-axis');
      if (!ax) { ax = document.createElement('div'); ax.className = 'gh-axis'; ax.setAttribute('aria-hidden', 'true'); grid.insertAdjacentElement('afterend', ax); }
      var from = new Date(now); from.setDate(now.getDate() - (W * 7 - 1));
      ax.innerHTML = '<span>' + h(from.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })) + '</span><span>today</span>';
    }
    var first = ev.reduce(function (m, e) { var d = e.d.slice(0, 10); return !m || d < m ? d : m; }, ''), note = document.querySelector('.gh-note');
    if (note && first) { var fs = document.getElementById('gh-first'); if (!fs) { fs = document.createElement('span'); fs.id = 'gh-first'; note.insertBefore(fs, note.firstChild); } fs.textContent = 'Since ' + first + '. '; }
    var state = document.getElementById('gh-state'); if (state) state.textContent = 'live';
  });
})();

// ── lectr case study: one lot traced, read live from lectr.bid (CORS * on the data)
(function () {
  if (!document.getElementById('trace')) return;
  // The pinned lot is the fallback. While it is live and more than a few days
  // out it is shown; otherwise a live flagged lot is picked: the soonest sale at
  // least three days out, medium or high confidence, the most comps.
  var PIN = 'bonhams-31916-177', SALE = '2026-09-24';
  var day = function (d) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d); };
  var today = day(new Date()), min = day(new Date(Date.now() + 3 * 864e5));
  var $ = function (id) { return document.getElementById(id); };
  var when = $('trace-when'); if (when && today > SALE) when.textContent = 'closed ' + SALE;
  if (today > SALE) { var cs0 = $('trace-comps-src'); if (cs0) cs0.textContent = '· as read on ' + SALE; }
  var HOUSE = { bonhams: 'Bonhams', christies: 'Christie’s', sothebys: 'Sotheby’s', phillips: 'Phillips', wright: 'Wright', hakes: 'Hake’s', rrauction: 'RR Auction', goldin: 'Goldin', rea: 'REA', lama: 'LAMA', rago: 'Rago' };
  var houseOf = function (id) { return HOUSE[String(id).split('-')[0]] || ''; };
  var tc = function (s) { return String(s || '').toLowerCase().replace(/(^|[\s(‘'"-])([a-z])/g, function (m, a, b) { return a + b.toUpperCase(); }); };
  var cap = function (s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); };
  function comps(rows, label) {
    rows = rows.slice().sort(function (a, b) { return a.d < b.d ? 1 : a.d > b.d ? -1 : 0; });
    swap($('trace-comps'), rows.map(function (c) { return '<li><span>' + h(c.h) + ' · ' + h(c.d) + '</span><span class="v">' + usd(c.p) + '</span></li>'; }).join(''));
    var src = $('trace-comps-src'); if (src) src.textContent = label;
  }
  // a lot page on lectr carries the lot as JSON in the framework's payload
  function lotFrom(html) {
    var re = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g, m, s = '';
    while ((m = re.exec(html))) { try { s += JSON.parse('"' + m[1] + '"'); } catch (e) {} }
    var i = s.indexOf('"initialLot":{'); if (i < 0) return null; i = s.indexOf('{', i);
    var depth = 0, str = false, esc2 = false;
    for (var j = i; j < s.length; j++) { var ch = s[j]; if (str) { if (esc2) esc2 = false; else if (ch === '\\') esc2 = true; else if (ch === '"') str = false; continue; } if (ch === '"') str = true; else if (ch === '{') depth++; else if (ch === '}') { if (--depth === 0) break; } }
    var lot; try { lot = JSON.parse(s.slice(i, j + 1)); } catch (e) { return null; }
    var tt = /<meta name="twitter:title" content="([^"]*)"/.exec(html);
    if (tt) { var t = new DOMParser().parseFromString('<p>' + tt[1] + '</p>', 'text/html').body.textContent.split(' — '); lot._name = t[0]; lot._maker = t[1] || ''; }
    return lot;
  }
  function conf(l) { return (l.value && l.value.confidence) || (l.signal && l.signal.confidence) || ''; }
  function eligible(l) { return l && l.status === 'upcoming' && l.saleDate >= min && /^(medium|high)$/.test(conf(l)) && l.value && l.value.compValueUsd > 0; }
  function renderLot(l, rows) {
    var v = l.value, lotRow = document.querySelector('#trace .trow.lot .tb'), callRow = document.querySelector('#trace .trow.call .tb'); if (!lotRow || !callRow) return;
    var house = l.auctionHouse || houseOf(l.id), est = l.estimateLow && l.estimateHigh ? 'estimate ' + usd(l.estimateLow) + ' – ' + usd(l.estimateHigh) : '';
    var url = String(l.url || ''), links = (url.indexOf('https://') === 0 ? '<a href="' + h(url) + '" target="_blank" rel="noopener">the lot at ' + h(house) + ' &#8599;</a> · ' : '') + '<a href="https://lectr.bid/lot/' + encodeURIComponent(l.id) + '" target="_blank" rel="noopener">on lectr &#8599;</a>';
    swap(lotRow, '<b>' + h((l._maker ? l._maker + ' · ' : '') + cap(l._name || tc(l.title))) + '</b><span class="mono">' + [h(house), l.saleName ? h(tc(l.saleName)) : '', l.lotNumber ? 'lot ' + h(l.lotNumber) : '', '<span id="trace-when">closes ' + h(l.saleDate) + '</span>', est].filter(Boolean).join(' · ') + '</span><span class="mono">' + links + '</span>');
    var line1 = ['comp value, all-in', v.low && v.high ? 'band ' + usd(v.low) + ' – ' + usd(v.high) : '', v.signal && v.signal.label ? h(v.signal.label) + (v.compRatio ? ', ' + v.compRatio.toFixed(1) + '× the estimate midpoint' : '') : ''].filter(Boolean).join(' · ');
    var ex = v.exact && v.exact.cls === 'modelMatch' && v.exact.realizedUsd ? 'same model realized before: ' + usd(v.exact.realizedUsd) + (houseOf(v.exact.id) ? ', ' + houseOf(v.exact.id) : '') + ', ' + h(v.exact.saleDate) : '';
    var line2 = ['confidence ' + h(conf(l)), v.n ? v.n + ' comps in the pool' : '', v.poolSellThroughPct != null ? v.poolSellThroughPct + '% of them sold' : '', ex].filter(Boolean).join(' · ');
    swap(callRow, '<b class="big">' + usd(v.compValueUsd) + '</b><span class="mono">' + line1 + '</span><span class="mono">' + line2 + '</span>');
    comps(rows, '· live · picked ' + today);
  }
  function pick(ce) {
    try { var c = JSON.parse(lsGet('lectr:pick') || 'null'); if (c && c.day === today && eligible(c.lot) && ce.byLot[c.lot.id]) return Promise.resolve(c.lot); } catch (e) {}
    var PREF = ['bonhams', 'christies', 'sothebys', 'phillips', 'wright', 'hakes', 'rrauction'];
    var hash = function (s) { var x = 0; for (var i = 0; i < s.length; i++) x = (x * 31 + s.charCodeAt(i)) | 0; return x; };
    // only flagged lots have a pre-rendered page to read; lectr's sitemap lists them
    return fetch('https://lectr.bid/sitemap.xml').then(function (r) { return r.ok ? r.text() : ''; }).catch(function () { return ''; }).then(function (xml) {
    var flagged = {}; (xml.match(/\/lot\/[^<\s]+/g) || []).forEach(function (m) { flagged[decodeURIComponent(m.slice(5))] = 1; });
    var any = Object.keys(flagged).length > 0;
    var ids = Object.keys(ce.byLot).filter(function (id) { return id !== PIN && (!any || flagged[id]); }).sort(function (a, b) {
      var n = ce.byLot[b].length - ce.byLot[a].length; if (n) return n;
      var pa = PREF.indexOf(a.split('-')[0]), pb = PREF.indexOf(b.split('-')[0]); pa = pa < 0 ? 99 : pa; pb = pb < 0 ? 99 : pb; if (pa !== pb) return pa - pb;
      return hash(a + today) - hash(b + today);
    });
    function round(k) {
      var batch = ids.slice(k * 8, k * 8 + 8); if (!batch.length || k > 1) return Promise.resolve(null);
      return Promise.all(batch.map(function (id) { return fetch('https://lectr.bid/lot/' + encodeURIComponent(id)).then(function (r) { return r.ok ? r.text() : ''; }).then(lotFrom).catch(function () { return null; }); })).then(function (lots) {
        var ok = lots.filter(eligible).sort(function (a, b) { return a.saleDate < b.saleDate ? -1 : a.saleDate > b.saleDate ? 1 : (b.value.n || 0) - (a.value.n || 0); });
        return ok[0] || round(k + 1);
      });
    }
    return round(0).then(function (l) { if (l) lsSet('lectr:pick', JSON.stringify({ day: today, lot: l })); return l; });
    });
  }
  var started = false;
  function start() {
    if (started) return; started = true;
    getJSON('https://lectr.bid/data/ray/comp-evidence.json').then(function (ce) {
      if (!ce || !ce.byLot) return;
      var pinRows = ce.byLot[PIN];
      if (pinRows && pinRows.length && SALE >= min) { comps(pinRows, '· live · generated ' + String(ce.generatedAt || '').slice(0, 10)); return; }
      return pick(ce).then(function (l) {
        if (l) renderLot(l, ce.byLot[l.id]);
        else if (pinRows && pinRows.length && today <= SALE) comps(pinRows, '· live · generated ' + String(ce.generatedAt || '').slice(0, 10));
      });
    }).catch(function () {});
  }
  // the lot pages are read only when the trace is on its way into view
  var tr = $('trace');
  if ('IntersectionObserver' in window) { var io = new IntersectionObserver(function (es) { if (es.some(function (e) { return e.isIntersecting; })) { io.disconnect(); start(); } }, { rootMargin: '900px 0px' }); io.observe(tr); } else start();
  setTimeout(start, 6000);

  // the record: each call written the way its lane made it, graded by that lane's rule
  getJSON('https://lectr.bid/data/ray/receipts.json').then(function (rc) {
    var seenT = {}; var rows = (rc.rows || []).filter(function (r) { if (!(r.p && r.r) || seenT[r.t || r.id]) return false; seenT[r.t || r.id] = 1; return true; }).slice(0, 5); if (!rows.length) return;
    var mk = function (ok, yes, no) { return ' <span class="mk ' + (ok ? 'ok' : 'no') + '">' + (ok ? '✓ ' + yes : '✗ ' + no) + '</span>'; };
    swap($('trace-rec'), rows.map(function (r) {
      var t = String(r.t || r.id).split(' | ')[0]; t = t.length > 64 ? t.slice(0, 62) + '…' : t;
      var v, f = +r.f || 0;
      if (r.k === 'vsbid') v = 'bid ' + usd(r.p) + (f ? ' · floor ' + usd(f) : '') + ' → realized ' + usd(r.r) + (f ? mk(r.r >= f, 'over floor', 'under floor') : '');
      else if (r.k === 'gap') v = 'projected ' + usd(r.p) + (f ? ' · floor ' + usd(f) : '') + ' → realized ' + usd(r.r) + (f ? mk(r.r >= f, 'over floor', 'under floor') : '');
      else if (r.k === 'quiet') v = 'appraised ' + usd(r.p) + ' → realized ' + usd(r.r);
      else { var q = r.r / r.p; v = 'called ' + usd(r.p) + ' → realized ' + usd(r.r) + mk(q >= 0.7 && q <= 1.3, 'within 30%', 'off by more than 30%'); }
      var name = r.id ? '<a href="https://lectr.bid/lot/' + encodeURIComponent(r.id) + '" target="_blank" rel="noopener">' + h(t) + '</a>' : h(t);
      return '<li><span>' + name + ' · ' + h(r.h || houseOf(r.id)) + ' · called ' + h(r.d) + '</span><span class="v">' + v + '</span></li>';
    }).join(''));
    var g = rc.record && rc.record.vsbid && rc.record.vsbid.graded; if (g) setNum($('bt-graded'), g.toLocaleString('en-US'));
    var src = $('trace-rec-src'); if (src) src.textContent = 'Live from lectr.bid, generated ' + (rc.generatedAt || '') + '.';
  }).catch(function () {});
  getJSON('https://lectr.bid/data/ray/backtest.json').then(function (bt) {
    var f = bt.flagged, u = bt.unflagged; if (!f || !u) return;
    var pct = function (x) { return (x >= 0 ? '+' : '') + x + '%'; };
    setNum($('bt-flag-n'), f.n.toLocaleString('en-US'));
    setNum($('bt-flag-perf'), pct(f.medianPerfPct)); setNum($('bt-unflag-perf'), pct(u.medianPerfPct));
    setNum($('bt-flag-beat'), f.beatHighPct + '%'); setNum($('bt-unflag-beat'), u.beatHighPct + '%');
  }).catch(function () {});
})();

// ── lectr's house roll, from the feed ──────────────────────────────────────
(function () {
  var el = document.getElementById('houses'); if (!el) return;
  getJSON('https://lectr.bid/data/ray/meta.json').then(function (m) {
    var s = m && Array.isArray(m.sources) ? m.sources.filter(function (x) { return typeof x === 'string' && x; }) : null; if (!s || s.length < 5) return;
    swap(el, s.map(h).join(' · '));
    [].forEach.call(document.querySelectorAll('[data-live="houses-n"]'), function (n) { setNum(n, String(s.length)); });
  }).catch(function () {});
})();

// ── Soirée, live: the count, the free count, and five things on tonight ────
(function () {
  var cnt = document.querySelectorAll('[data-live="soiree-count"]'), free = document.querySelectorAll('[data-live="soiree-free"]'), list = document.getElementById('tonight');
  if (!cnt.length && !free.length && !list) return;
  var TZ = 'America/New_York';
  var ymd = function (d) { return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d); };
  var nowHM = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
  var today = ymd(new Date()), tomorrow = ymd(new Date(Date.now() + 864e5));
  function area(a) { a = String(a || ''); if (/Hoboken/i.test(a)) return 'Hoboken'; if (/Jersey City/i.test(a)) return 'Jersey City'; if (/Philadelphia|, PA\b/i.test(a)) return 'Philadelphia'; if (/Brooklyn/i.test(a)) return 'Brooklyn'; if (/New York|, NY\b/i.test(a)) return 'NYC'; var p = a.split(',').map(function (x) { return x.trim(); }); return p.length >= 3 ? p[p.length - 2] : ''; }
  function clock(hm) { var p = hm.split(':'), H = +p[0], M = p[1]; return (H % 12 || 12) + (M === '00' ? '' : ':' + M) + (H < 12 ? ' AM' : ' PM'); }
  function parse(e) {
    var d = String(e.date || ''), m = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(d); if (!m) return null;
    var t = m[2] && !/Z$/.test(d) && (m[2] + ':' + m[3]) !== '00:00' ? m[2] + ':' + m[3] : null;
    if (!t && /^\d{1,2}:\d{2} [AP]M$/.test(e.time || '')) { var q = /^(\d{1,2}):(\d{2}) ([AP])M$/.exec(e.time); t = ('0' + ((+q[1] % 12) + (q[3] === 'P' ? 12 : 0))).slice(-2) + ':' + q[2]; }
    return { day: m[1], t: t, e: e };
  }
  function run() {
    getJSON('https://soiree.today/api/events').then(function (d) {
      var ev = d && Array.isArray(d.events) ? d.events : null; if (!ev || !ev.length) return;
      var n = +d.count || ev.length, nf = ev.filter(function (e) { return String(e.price || '').toLowerCase() === 'free'; }).length;
      [].forEach.call(cnt, function (el) { setNum(el, n.toLocaleString('en-US')); });
      [].forEach.call(free, function (el) { setNum(el, nf.toLocaleString('en-US')); });
      [].forEach.call(document.querySelectorAll('[data-live="soiree-state"], [data-live="soiree-when"]'), function (el) { el.textContent = 'live from soiree.today'; });
      if (!list) return;
      var soon = function (x) { return !x.t || x.t >= (+nowHM.slice(0, 2) - 1 + ':' + nowHM.slice(3)).padStart(5, '0'); };
      // one-night things only: a show that runs for weeks is not "tonight"
      var all = ev.map(parse).filter(function (x) { return x && x.e.name && !(String(x.e.end_date || '').slice(0, 10) > x.day); });
      var tn = all.filter(function (x) { return x.day === today && soon(x); }), tm = all.filter(function (x) { return x.day === tomorrow; });
      var byT = function (a, b) { return (a.t ? 0 : 1) - (b.t ? 0 : 1) || String(a.t).localeCompare(String(b.t)); };
      tn.sort(byT); tm.sort(byT);
      var rows = tn.slice(0, 5); if (rows.length < 5) rows = rows.concat(tm.slice(0, 5 - rows.length)); if (!rows.length) return;
      var seen = {};
      rows = rows.filter(function (x) { var k = x.e.name + x.e.location; if (seen[k]) return false; seen[k] = 1; return true; });
      swap(list, rows.map(function (x) {
        var e = x.e, url = String(e.url || ''), name = h(e.name.length > 70 ? e.name.slice(0, 68) + '…' : e.name);
        var whenTxt = (x.day === today ? (x.t ? clock(x.t) : 'today') : 'tomorrow' + (x.t ? ' ' + clock(x.t) : ''));
        return '<li><span>' + (url.indexOf('https://') === 0 ? '<a href="' + h(url) + '" target="_blank" rel="noopener">' + name + '</a>' : name) + '</span><span class="v">' + [h(e.location), h(area(e.address)), h(whenTxt)].filter(Boolean).join(' · ') + '</span></li>';
      }).join(''));
      var label = tn.length && rows.some(function (x) { return x.day === tomorrow; }) ? 'tonight and tomorrow' : tn.length ? 'tonight' : 'tomorrow';
      list.setAttribute('aria-label', 'On ' + label + ', live from soiree.today'); list.setAttribute('data-state', 'live');
    }).catch(function () {});
  }
  if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 2000 }); else setTimeout(run, 600);
})();

// ── entrance + scroll motion (skipped entirely under reduced motion) ──
(function () {
  if (REDUCE) return;
  // below-the-fold blocks reveal on scroll; anything already in view is left alone
  var blocks = document.querySelectorAll('.sheet-h, .sec, .facts, .frame, .legs, .trace, .ledger, .two, .repos, .act, .cta, .prose, #trace-rec, .sheet, .room, .plates, .pairs, figure.plate.wide, .jobs');
  var vh = innerHeight, pending = [];
  [].forEach.call(blocks, function (b) { var r = b.getBoundingClientRect(); if (r.top > vh * 0.92) { (b.classList.contains('frame') ? b.querySelector('.cells') || b : b).classList.add('sr'); if (b.classList.contains('frame')) b.classList.add('sr'); pending.push(b); } });
  function show(b) { if (b.classList.contains('in')) return; b.classList.add('in'); var c = b.querySelector('.cells'); if (c) c.classList.add('in'); }
  if ('IntersectionObserver' in window && pending.length) {
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { show(e.target); io.unobserve(e.target); } }); }, { threshold: 0, rootMargin: '0px 0px -6% 0px' });
    pending.forEach(function (b) { io.observe(b); });
  }
  // The sweep reveals anything the viewport has REACHED, not only what is in
  // it right now: a block flicked clean past the fold between two debounced
  // sweeps used to fail the old `r.bottom > 0` test and stay hidden for good.
  var st; function sweep() { var vh2 = innerHeight; pending.forEach(function (b) { if (b.getBoundingClientRect().top < vh2 * 0.94) show(b); }); }
  addEventListener('scroll', function () { clearTimeout(st); st = setTimeout(sweep, 80); }, { passive: true });
  addEventListener('resize', sweep, { passive: true });
  // a hidden tab freezes the document timeline: a block that took .in while
  // backgrounded sits mid-transition until the tab is looked at again
  addEventListener('visibilitychange', function () { if (!document.hidden) sweep(); });
  // printing must never omit a section — the résumé is the reason
  addEventListener('beforeprint', function () { pending.forEach(show); });
  setTimeout(sweep, 1200);
  // last resort: an invisible paragraph is a worse failure than a missed
  // animation, so anything still pending after four seconds is simply shown
  setTimeout(function () { pending.forEach(show); }, 4000);
  // only the home statement arrives word by word (seven words); everything else arrives as a block
  [].forEach.call(document.querySelectorAll('.home .statement'), function (p) {
    if (p.querySelector('a, b') || document.documentElement.classList.contains('arrived')) return;
    var parts = p.innerHTML.split(/(<[^>]+>)/g), k = 0;
    p.innerHTML = parts.map(function (part) { if (!part || part[0] === '<') return part; return part.split(/(\s+)/).map(function (w) { if (!w.trim()) return w; return '<span class="w" style="transition-delay:' + (k++ * 28) + 'ms">' + w + '</span>'; }).join(''); }).join('');
    p.classList.add('wr'); requestAnimationFrame(function () { requestAnimationFrame(function () { p.classList.add('in'); }); });
  });
})();

// ── drawn props for the egg (no system emoji) ──────────────────────────────
var SVG_BANANA = '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M50 14c3 2 4 6 3 11-3 16-19 28-38 25-4-1-6-3-5-5 1-2 3-2 6-2 15 0 27-9 31-24 1-3 1-5 3-5z" fill="#E9C46A" stroke="#161616" stroke-width="3" stroke-linejoin="round"/><path d="M47 22c-3 12-13 21-27 24" fill="none" stroke="#9F7C3A" stroke-width="2.4" stroke-linecap="round"/><path d="M49 15l3-7" stroke="#161616" stroke-width="4" stroke-linecap="round"/></svg>';
var SVG_PLANE = '<svg viewBox="0 0 120 64" aria-hidden="true"><g stroke="#161616" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M16 22l8 12" fill="none"/><path d="M10 18h10l8 12" fill="#2A555B"/><path d="M22 30h62c8 0 12 3 12 6s-4 6-12 6H26z" fill="#F6F3EC"/><rect x="40" y="12" width="44" height="7" rx="3.5" fill="#D9261C"/><rect x="42" y="42" width="40" height="6" rx="3" fill="#D9261C"/><path d="M50 19v23M74 19v23" fill="none"/><circle cx="62" cy="28" r="4.5" fill="#F6F3EC"/><path d="M58 26c3-3 8-3 10 0" fill="none"/><path d="M60 48l-3 8M72 48l3 8" fill="none"/><circle cx="57" cy="57" r="4" fill="#161616"/><circle cx="76" cy="57" r="4" fill="#161616"/><path d="M100 22v28" fill="none"/><circle cx="97" cy="36" r="3" fill="#161616"/></g><path d="M62 33c10 0 14 3 22 1" fill="none" stroke="#D9261C" stroke-width="2.4" stroke-linecap="round"/></svg>';
var SVG_HAT = '<svg viewBox="0 0 120 58" aria-hidden="true"><g stroke="#161616" stroke-width="3.2" stroke-linejoin="round"><path d="M18 46C18 18 36 6 60 6s42 12 42 40z" fill="#F2C230"/><path d="M60 6v40M44 9c-4 10-5 24-5 37M76 9c4 10 5 24 5 37" fill="none" stroke-width="2.4"/><rect x="4" y="44" width="112" height="10" rx="5" fill="#E0AE1F"/></g></svg>';
var SVG_ESB = '<svg viewBox="0 0 20 44" aria-hidden="true"><g fill="#161616"><rect x="9.3" y="0" width="1.4" height="8"/><rect x="8" y="7" width="4" height="5"/><rect x="6.5" y="11" width="7" height="6"/><rect x="5" y="16" width="10" height="8"/><rect x="3" y="23" width="14" height="21"/></g><g fill="#F6F3EC" opacity=".55"><rect x="5" y="26" width="1.4" height="16"/><rect x="8" y="26" width="1.4" height="16"/><rect x="11" y="26" width="1.4" height="16"/><rect x="14" y="26" width="1.4" height="16"/></g></svg>';

// ── the ape. Press him and it all goes wrong for about eight seconds ─────────
(function () {
  var ape = document.getElementById('ape'); if (!ape) return;
  var busy = false;
  var kaiju = function () { return parseInt(lsGet('kaiju') || '0', 10) || 0; };
  if (kaiju() > 0) ape.title = 'survived \u00d7 ' + kaiju();
  var loud = function () { return ssGet('kaiju:snd') === '1'; };
  function audio(fn, ms) { try { var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; var ac = new AC(); fn(ac, ac.currentTime); setTimeout(function () { ac.close(); }, ms); } catch (e) {} }
  function roar() {
    audio(function (ac, t) {
      var G = 0.25, g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(G, t + 0.09); g.gain.setValueAtTime(G, t + 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
      var f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(1400, t); f.frequency.exponentialRampToValueAtTime(180, t + 1.5); f.Q.value = 6;
      var ws = ac.createWaveShaper(), curve = new Float32Array(256); for (var i = 0; i < 256; i++) { var x = i / 128 - 1; curve[i] = Math.tanh(x * 4); } ws.curve = curve;
      ws.connect(f); f.connect(g); g.connect(ac.destination);
      [[70, 34, 'sawtooth'], [93, 45, 'square'], [140, 52, 'sawtooth']].forEach(function (p) { var o = ac.createOscillator(); o.type = p[2]; o.frequency.setValueAtTime(p[0], t); o.frequency.exponentialRampToValueAtTime(p[1], t + 1.3); var v = ac.createGain(); v.gain.value = 0.5; o.connect(v); v.connect(ws); o.start(t); o.stop(t + 1.7); });
      var buf = ac.createBuffer(1, ac.sampleRate * 1.6, ac.sampleRate), d = buf.getChannelData(0); for (var j = 0; j < d.length; j++) d[j] = (Math.random() * 2 - 1) * 0.35;
      var n = ac.createBufferSource(); n.buffer = buf; n.connect(ws); n.start(t); n.stop(t + 1.6);
    }, 2500);
  }
  function chew() {
    audio(function (ac, t0) {
      for (var i = 0; i < 4; i++) { var t = t0 + i * 0.3, buf = ac.createBuffer(1, ac.sampleRate * 0.12, ac.sampleRate), d = buf.getChannelData(0); for (var j = 0; j < d.length; j++) d[j] = (Math.random() * 2 - 1) * Math.pow(1 - j / d.length, 2);
        var n = ac.createBufferSource(); n.buffer = buf; var f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500; var g = ac.createGain(); g.gain.value = 0.25; n.connect(f); f.connect(g); g.connect(ac.destination); n.start(t); }
    }, 2000);
  }
  function boing() {
    audio(function (ac, t) { var o = ac.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(900, t + 0.35); var g = ac.createGain(); g.gain.setValueAtTime(0.2, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5); o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + 0.5); }, 1200);
  }
  function planes(n) {
    var box = document.createElement('div'); box.className = 'egg-planes'; box.setAttribute('aria-hidden', 'true');
    for (var i = 0; i < n; i++) { var sp = document.createElement('span'); sp.innerHTML = SVG_PLANE; sp.style.cssText = 'top:' + (8 + Math.random() * 40) + 'vh;animation-delay:' + (i * 0.9) + 's;animation-duration:' + (3.2 + Math.random() * 1.6) + 's;width:' + (96 + Math.random() * 56) + 'px;' + (i % 2 ? 'animation-name:egg-fly-back;' : ''); box.appendChild(sp); }
    document.body.appendChild(box); return box;
  }
  function heads(n) {
    var frag = document.createDocumentFragment();
    for (var i = 0; i < n; i++) {
      var banana = Math.random() < 0.45, im;
      if (banana) { im = document.createElement('span'); im.innerHTML = SVG_BANANA; im.className = 'egg-head egg-banana'; }
      else { im = document.createElement('img'); im.src = 'assets/ape.svg'; im.alt = ''; im.className = 'egg-head'; }
      var size = 22 + Math.random() * 64;
      im.style.cssText = 'left:' + (Math.random() * 100) + 'vw;width:' + size + 'px;animation-delay:' + (Math.random() * 2.4) + 's;animation-duration:' + (2.2 + Math.random() * 2.2) + 's;--spin:' + ((Math.random() > 0.5 ? 1 : -1) * (360 + Math.random() * 720)) + 'deg';
      frag.appendChild(im);
    }
    var box = document.createElement('div'); box.className = 'egg-rain'; box.setAttribute('aria-hidden', 'true'); box.appendChild(frag); document.body.appendChild(box); return box;
  }
  function toast(text, cls, ms) { [].forEach.call(document.querySelectorAll('.egg-toast' + (cls ? '.' + cls : ':not(.egg-toast-2)')), function (o) { o.remove(); }); var t = document.createElement('div'); t.className = 'egg-toast mono' + (cls ? ' ' + cls : ''); t.setAttribute('role', 'status'); document.body.appendChild(t); setTimeout(function () { t.textContent = text; }, 30); setTimeout(function () { t.classList.add('out'); setTimeout(function () { t.remove(); }, 500); }, ms || 6000); return t; }
  ape.addEventListener('click', function () {
    if (busy) return; busy = true;
    var t0 = Date.now(), before = kaiju(), sound = loud(), day = MD === '11-03';
    var root = document.documentElement, body = document.body, page = [].slice.call(body.children).filter(function (e) { return /^(HEADER|MAIN|FOOTER)$/.test(e.tagName); });
    var quake = function (on) { page.forEach(function (e) { e.classList.toggle('egg-quake', on); }); };
    var title = document.title, icon = document.querySelector('link[rel=icon]'), iconHref = icon && icon.getAttribute('href');
    if (sound) roar();
    var bub = document.createElement('span'); bub.className = 'egg-bubble'; bub.textContent = 'RAWR'; ape.appendChild(bub);
    ape.classList.remove('roar'); void ape.offsetWidth; ape.classList.add('roar');
    root.classList.add('egg'); document.title = day ? 'KAIJU DAY' : 'KAIJU ALERT'; if (icon) icon.setAttribute('href', 'assets/ape.svg');
    (window.__mx || []).forEach(function (m) { if (m.setWord) { m.__word = m.word; m.setWord('RAWR'); } });
    // the ticker is decoration; one sentence is announced
    var TXT = day ? '⚠ KAIJU DAY · ' : '⚠ KAIJU ALERT · ';
    var tick = document.createElement('div'); tick.className = 'egg-tick'; tick.setAttribute('aria-hidden', 'true'); tick.innerHTML = '<span>' + new Array(9).join(TXT) + '</span><span>' + new Array(9).join(TXT) + '</span>'; body.appendChild(tick);
    var sr = document.createElement('div'); sr.className = 'egg-sr'; sr.setAttribute('role', 'status'); body.appendChild(sr); setTimeout(function () { sr.textContent = 'Kaiju alert — press Escape to end.'; }, 60);
    var kong = document.createElement('div'); kong.className = 'egg-kong'; kong.setAttribute('aria-hidden', 'true'); kong.innerHTML = '<img src="assets/ape.svg" alt="">' + (before + 1 >= 3 ? '<span class="egg-hat">' + SVG_HAT + '</span>' : ''); body.appendChild(kong);
    // no Escape key on a phone: tap the giant, or the ticker, to end it
    kong.addEventListener('click', finish); tick.addEventListener('click', finish);
    var rain = null, fleet = null, timers = [], caught = 0, ended = false;
    var at = function (ms, fn) { timers.push(setTimeout(fn, ms)); };
    function onKey(e) { if (e.key === 'Escape') finish(); }
    document.addEventListener('keydown', onKey);
    if (REDUCE) {
      at(200, function () { tick.classList.add('in'); });
      at(2600, finish);
    } else {
      quake(true); at(900, function () { quake(false); });
      at(150, function () { tick.classList.add('in'); });
      at(400, function () { rain = heads(innerWidth < 640 ? 34 : 70); });
      at(1400, function () { kong.classList.add('up'); fleet = planes(innerWidth < 640 ? 2 : 4); });
      at(2400, function () { if (!rain) return; var r = kong.querySelector('img').getBoundingClientRect(); [].forEach.call(rain.querySelectorAll('.egg-banana'), function (b) { var x = parseFloat(b.style.left) / 100 * innerWidth; if (x > r.left + r.width * 0.25 && x < r.right - r.width * 0.25) { caught++; b.classList.add('egg-caught'); } }); });
      at(3600, function () {
        // eaten: the page shrinks into the mouth
        var r = kong.querySelector('img').getBoundingClientRect(), ox = r.left + r.width * 0.5, oy = r.top + r.height * 0.76;
        page.forEach(function (e) { var b = e.getBoundingClientRect(); e.style.transformOrigin = (ox - b.left) + 'px ' + (oy - b.top) + 'px'; e.classList.add('egg-eaten'); });
        quake(true);
      });
      at(4900, function () { quake(false); kong.classList.add('chew'); if (sound) chew(); tick.querySelectorAll('span').forEach(function (sp) { sp.textContent = new Array(7).join('NOM NOM NOM · ' + caught + ' BANANAS CAUGHT · '); }); });
      at(6100, function () {
        // spat back out — reprinted, after enough survivals
        kong.classList.remove('chew'); kong.classList.add('spit'); if (sound) boing();
        page.forEach(function (e) { e.classList.remove('egg-eaten'); e.classList.add('egg-spat'); if (before + 1 >= 5) e.classList.add('egg-reprinted'); });
        tick.querySelectorAll('span').forEach(function (sp) { sp.textContent = new Array(9).join('CONTAINED · '); });
        quake(true); at(700, function () { quake(false); });
      });
      at(7300, function () { kong.classList.remove('up'); tick.classList.remove('in'); });
      at(8300, finish);
    }
    function finish() {
      if (ended) return; ended = true;
      document.removeEventListener('keydown', onKey);
      timers.forEach(clearTimeout);
      page.forEach(function (e) { e.classList.remove('egg-eaten', 'egg-spat', 'egg-quake'); e.style.transformOrigin = ''; });
      var reprinted = page.some(function (e) { return e.classList.contains('egg-reprinted'); });
      setTimeout(function () { page.forEach(function (e) { e.classList.remove('egg-reprinted'); }); }, 2600);
      kong.remove(); tick.remove(); sr.remove(); if (rain) rain.remove(); if (fleet) fleet.remove(); bub.remove();
      var n = before + 1; lsSet('kaiju', n);
      ape.title = 'survived \u00d7 ' + n;
      var tally = document.createElement('span'); tally.className = 'egg-tally'; tally.textContent = 'survived \u00d7 ' + n; ape.appendChild(tally); setTimeout(function () { tally.remove(); }, 4200);
      if (!sound) { ssSet('kaiju:snd', '1'); var note = document.createElement('span'); note.className = 'egg-note'; note.textContent = 'press again for sound'; ape.appendChild(note); setTimeout(function () { note.remove(); }, 4200); }
      root.classList.remove('egg'); document.title = title; if (icon && iconHref) icon.setAttribute('href', iconHref);
      (window.__mx || []).forEach(function (m) { if (m.replay) { var w = m.__word; if (w) m.setWord(w); m.replay(); } });
      var secs = ((Date.now() - t0) / 1000).toFixed(1);
      toast('INC-' + ('000' + n).slice(-4) + ' · kaiju on ' + HERE + ' · contained in ' + secs + 's · ' + caught + ' banana' + (caught === 1 ? '' : 's') + ' recovered · postmortem: blameless' + (reprinted ? ' · page reprinted at 0.2 mm layers' : ''), '', 6500);
      if (n === 13 && HERE !== 'colophon.html') toast('The ape wants to see the playground. It is on the colophon.', 'egg-toast-2', 5000);
      busy = false;
      feedChip();
    }
  });
  // thirteen survivals: on the colophon, the ape can be fed to the playground
  function feedChip() {
    if (kaiju() < 13 || HERE !== 'colophon.html' || document.querySelector('.feed-ape')) return;
    var play = document.getElementById('play'); if (!play) return;
    var b = document.createElement('button'); b.type = 'button'; b.className = 'pill mono feed-ape'; b.textContent = 'feed the ape to the playground';
    b.addEventListener('click', function () {
      var w = document.getElementById('play-word'); if (w) { w.value = 'Kong'; w.dispatchEvent(new Event('input', { bubbles: true })); }
      dispatchEvent(new CustomEvent('playground:feed', { detail: { src: 'assets/ape.svg', word: 'Kong' } }));
      play.scrollIntoView({ behavior: REDUCE ? 'auto' : 'smooth', block: 'center' });
    });
    var fig = play.closest('figure') || play.parentNode; fig.parentNode.insertBefore(b, fig.nextSibling);
  }
  feedChip();
})();

// ── the footer ape watches you; on phones he blinks when the footer arrives.
//    Mar 2 (King Kong, 1933) he stands on a tiny Empire State.
(function () {
  var ape = document.getElementById('ape'), img = ape && ape.querySelector('img'); if (!img || !window.fetch || !window.DOMParser) return;
  if (MD === '03-02') { var esb = document.createElement('span'); esb.className = 'ape-esb'; esb.innerHTML = SVG_ESB; ape.appendChild(esb); ape.classList.add('on-esb'); }
  fetch(img.getAttribute('src')).then(function (r) { return r.ok ? r.text() : ''; }).then(function (txt) {
    if (!txt) return;
    var svg = new DOMParser().parseFromString(txt, 'image/svg+xml').documentElement; if (!svg || svg.nodeName !== 'svg') return;
    svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
    var eyes = [];
    [68, 132].forEach(function (cx) {
      var parts = [].filter.call(svg.querySelectorAll('circle'), function (c) { var x = +c.getAttribute('cx'); return Math.abs(x - cx) < 3 && +c.getAttribute('r') < 6; });
      var white = [].filter.call(svg.querySelectorAll('ellipse'), function (e) { return +e.getAttribute('cx') === cx && +e.getAttribute('rx') === 12; })[0];
      if (!parts.length || !white) return;
      var eye = document.createElementNS('http://www.w3.org/2000/svg', 'g'), pup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      eye.setAttribute('class', 'ape-eye'); pup.setAttribute('class', 'ape-pupil');
      white.parentNode.insertBefore(eye, white); eye.appendChild(white); parts.forEach(function (p) { pup.appendChild(p); }); eye.appendChild(pup);
      eyes.push([eye, pup]);
    });
    if (eyes.length !== 2) return;
    img.replaceWith(svg);
    var raf = 0, mx = 0, my = 0;
    function look() {
      raf = 0; var r = ape.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height * 0.48, dx = mx - cx, dy = my - cy, d = Math.hypot(dx, dy);
      var k = d > 200 || d < 1 ? 0 : 1, ux = k ? dx / d : 0, uy = k ? dy / d : 0, f = Math.min(1, d / 60);
      eyes.forEach(function (e) { e[1].setAttribute('transform', 'translate(' + (ux * 4.5 * f).toFixed(2) + ' ' + (uy * 2.4 * f).toFixed(2) + ')'); });
    }
    if (!TOUCH) addEventListener('pointermove', function (e) { mx = e.clientX; my = e.clientY; if (!raf) raf = requestAnimationFrame(look); }, { passive: true });
    else if ('IntersectionObserver' in window && !REDUCE) {
      var io = new IntersectionObserver(function (es) { if (!es[0].isIntersecting) return; io.disconnect(); setTimeout(function () { eyes.forEach(function (e) { if (e[0].animate) e[0].animate([{ transform: 'scaleY(1)' }, { transform: 'scaleY(0.08)', offset: 0.45 }, { transform: 'scaleY(1)' }], { duration: 260, easing: 'ease-in-out' }); }); }, 500); }, { threshold: 1 });
      io.observe(ape);
    }
  }).catch(function () {});
})();

// ── a link to #ape (About's "off hours") points at him instead of jumping past him
(function () {
  var ape = document.getElementById('ape'); if (!ape) return;
  function show() { ape.scrollIntoView({ behavior: REDUCE ? 'auto' : 'smooth', block: 'center' }); ape.classList.remove('ape-hi'); void ape.offsetWidth; ape.classList.add('ape-hi'); setTimeout(function () { ape.classList.remove('ape-hi'); }, 1800); }
  document.addEventListener('click', function (e) { var a = e.target.closest && e.target.closest('a[href="#ape"]'); if (!a) return; e.preventDefault(); show(); });
  if (location.hash === '#ape') setTimeout(show, 300);
})();

// ── the footer heartbeat: last public push, from GitHub, cached per tab ─────
(function () {
  var meta = document.querySelector('footer .foot-meta'); if (!meta) return;
  var el = document.createElement('span'); el.className = 'foot-beat mono'; el.hidden = true; meta.appendChild(el);
  function run() {
    ghEvents().then(function (ev) {
      var p = ev && ev.filter(function (e) { return e.t === 'PushEvent'; })[0]; if (!p) return;
      var repo = p.r.replace(/^stilwellc\//, ''); if (repo === 'me') repo = 'this site';
      el.textContent = 'last push ' + ago(new Date(p.d).getTime()) + ' · ' + repo; el.hidden = false;
    });
  }
  if ('IntersectionObserver' in window) { var io = new IntersectionObserver(function (es) { if (es[0].isIntersecting) { io.disconnect(); run(); } }, { rootMargin: '600px 0px' }); io.observe(meta); } else run();
})();

// ── "hand-built · no framework": hover for this page's real weight ─────────
(function () {
  var a = document.querySelector('.foot-build'); if (!a || !window.performance || !performance.getEntriesByType) return;
  var orig = a.textContent;
  function show() {
    var nav = performance.getEntriesByType('navigation')[0], res = performance.getEntriesByType('resource'), bytes = nav ? (nav.transferSize || nav.encodedBodySize || 0) : 0;
    res.forEach(function (r) { bytes += r.transferSize || r.encodedBodySize || 0; });
    a.textContent = 'this page: ' + Math.max(1, Math.round(bytes / 1024)) + ' KB, ' + (res.length + 1) + ' requests';
  }
  function hide() { a.textContent = orig; }
  a.addEventListener('mouseenter', show); a.addEventListener('focus', show); a.addEventListener('mouseleave', hide); a.addEventListener('blur', hide);
})();

// ── the 404, read like triage. /me/resume/ and friends find their page. ─────
(function () {
  var is404 = /(^|\/)404(\.html)?$/.test(location.pathname) || !!document.querySelector('canvas.matrix[data-text="404"]'); if (!is404) return;
  var path = location.pathname, m = /^(.*\/)([A-Za-z0-9-]+)(?:\.html)?\/?$/.exec(path);
  if (m && m[2] !== '404') { var p = pageOf(m[2].toLowerCase() + '.html'); if (p && path !== m[1] + p.u) { location.replace(m[1] + p.u + location.search + location.hash); return; } }
  var shown = path.length > 60 ? path.slice(0, 58) + '…' : path;
  var box = document.querySelector('.req-log');
  if (!box) {
    box = document.createElement('div'); box.className = 'req-log mono';
    var lede = document.querySelector('main .lander-head .lede') || document.querySelector('main .lede'), head = document.querySelector('main .lander-head');
    if (lede) lede.insertAdjacentElement('afterend', box); else if (head) head.appendChild(box); else { var mn = document.querySelector('main'); if (mn) mn.appendChild(box); }
  }
  box.innerHTML = '<p>GET ' + h(shown) + ' → 404 · logged, not alerted · severity: informational</p><p>If you were fuzzing, the real endpoints are in <button type="button" class="req-k">' + (TOUCH ? 'Menu' : '⌘K') + '</button>.</p>';
  var k = box.querySelector('.req-k'); if (k) k.addEventListener('click', function () { if (window.__palOpen) window.__palOpen(); });
})();

// ── a note for whoever opens devtools (once per visit) ──────────────────────
(function () {
  if (ssGet('hello') || !window.console) return; ssSet('hello', '1');
  var ape = '   .-"-.\n _/.-.-.\\_\n( ( o o ) )\n |/  "  \\|\n  \\ .-. /\n  /`"""`\\';
  try {
    console.log('%c' + ape + '\n%cPoking around? Good. No trackers, no framework, no cookies.\n%cSay hello: ' + LINKEDIN + '\n%cflag 3 of 3: ' + atob('ZmxhZ3t0aGUtY29uc29sZS1pcy10aGUtYmFjay1kb29yfQ==') + '  (paste flags into ⌘K)',
      'font: 12px/1.2 ui-monospace, Menlo, monospace; color: #161616', 'font: 13px/1.6 ui-monospace, Menlo, monospace; color: #161616', 'font: 12px/1.6 ui-monospace, Menlo, monospace; color: #3E8C93', 'font: 11px/1.6 ui-monospace, Menlo, monospace; color: #FF5A1F');
  } catch (e) {}
})();

// ── the footer map marks the page it is on ─────────────────────────────────
(function () {
  [].forEach.call(document.querySelectorAll('footer .foot-map a'), function (a) { if ((a.getAttribute('href') || '').toLowerCase() === HERE) { a.classList.add('on'); a.setAttribute('aria-current', 'page'); } });
})();
