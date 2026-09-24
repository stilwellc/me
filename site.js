
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

// ── case studies: a section index in the left margin, current section lit
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
  var cur = null;
  function light(sec) { if (sec === cur) return; cur = sec; links.forEach(function (p) { var on = p[0] === sec; p[1].classList.toggle('on', on); if (on) p[1].setAttribute('aria-current', 'true'); else p[1].removeAttribute('aria-current'); }); }
  function sweep() { var best = null, y = innerHeight * 0.38; links.forEach(function (p) { var r = p[0].getBoundingClientRect(); if (r.top <= y) best = p[0]; }); light(best || links[0][0]); }
  var tick = false; addEventListener('scroll', function () { if (!tick) { tick = true; requestAnimationFrame(function () { tick = false; sweep(); }); } }, { passive: true }); addEventListener('resize', sweep); sweep();
})();

// ── work cards: a still line-screen strip of each product, same material as the headers
(function () {
  var cs = [].slice.call(document.querySelectorAll('canvas.thumb')); if (!cs.length) return;
  var made = [];
  var make = function (c) { made.push(matrix(c, { src: c.dataset.src, text: '', plate: true, still: true, cell: 4, fit: /\.svg(\?|$)/i.test(c.dataset.src) ? 'contain' : 'cover', filler: false })); };
  if ('IntersectionObserver' in window) { var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { io.unobserve(e.target); make(e.target); } }); }, { rootMargin: '240px 0px' }); cs.forEach(function (c) { io.observe(c); }); }
  else cs.forEach(make);
  var again = function () { made.forEach(function (m) { m.replay(); }); };
  var rt; addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(again, 150); });
  window.__repaintStills = again;
})();

// ── plates gather the way the header does ──────────────────────────────────
// Each figure.plate photograph, the first time it scrolls into view, is drawn
// as bodies flying in from the edges; when they settle the veil lifts and the
// photograph is underneath. Once per plate, never under reduced motion.
(function () {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return;
  var imgs = [].slice.call(document.querySelectorAll('figure.plate img'));
  if (!imgs.length) return;
  var seen = new WeakSet(), left = imgs.length, running = 0, queue = [];
  function fire(img) { if (seen.has(img)) return; seen.add(img); io.unobserve(img); left--; if (running >= 2) { queue.push(img); setTimeout(function () { if (queue.indexOf(img) >= 0) { queue.splice(queue.indexOf(img), 1); img.classList.remove('veiled'); } }, 2200); } else reveal(img); }
  function next() { running = Math.max(0, running - 1); var n = queue.shift(); if (n) reveal(n); }
  var io = new IntersectionObserver(function (es) { es.forEach(function (en) { if (en.isIntersecting) fire(en.target); }); }, { threshold: 0.18 });
  imgs.forEach(function (img) { img.classList.add('veiled'); io.observe(img); });
  // the observer can sit idle in a background tab or a slow engine; a cheap
  // sweep on scroll makes sure a plate in view always gets its turn
  var sweepT = 0;
  function sweep() { if (left <= 0) { removeEventListener('scroll', sweep); return; } var now = Date.now(); if (now - sweepT < 120) return; sweepT = now; var h = innerHeight; imgs.forEach(function (img) { if (seen.has(img)) return; var r = img.getBoundingClientRect(); if (r.bottom > 0 && r.top < h * 0.92) fire(img); }); }
  addEventListener('scroll', sweep, { passive: true }); addEventListener('resize', sweep); setTimeout(sweep, 400); setTimeout(sweep, 1500);
  window.__revealPlate = fire;   // test hook: reveal a plate without scrolling (the observer sleeps in a hidden tab)
  addEventListener('beforeprint', function () { imgs.forEach(function (i) { i.classList.remove('veiled'); }); });
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

// the glyph travels with you: the page you leave hands its glyph to the page you enter,
// which shows it first and dissolves it into its own. (sessionStorage, one hop)
var PREV_GLYPH = null;
try { PREV_GLYPH = sessionStorage.getItem('mx:prev'); sessionStorage.removeItem('mx:prev'); } catch (e) {}
var _own = document.querySelector('canvas.matrix');
var OWN_GLYPH = _own ? _own.dataset.src : (document.getElementById('field') ? 'assets/collin.jpg' : null);
document.addEventListener('click', function (e) {
  var a = e.target.closest && e.target.closest('a[href]'); if (!a || a.target === '_blank' || a.origin !== location.origin) return;
  try { if (OWN_GLYPH) sessionStorage.setItem('mx:prev', OWN_GLYPH); } catch (err) {}
  // the header scatters, then the page goes (plain left-clicks to another page only)
  if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button || a.hasAttribute('download')) return;
  if (a.pathname === location.pathname && a.hash) return;
  e.preventDefault(); leave(a.href);
});
// the one way to leave a page: remember the glyph, scatter the band, go
function leave(href) {
  try { if (OWN_GLYPH) sessionStorage.setItem('mx:prev', OWN_GLYPH); } catch (err) {}
  var m = window.__mx && window.__mx[0], went = false, go = function () { if (!went) { went = true; location.href = href; } };
  if (m && m.scatter) { m.scatter(go); setTimeout(go, 700); } else go();
}

// headers on landers + case studies
[].forEach.call(document.querySelectorAll('canvas.matrix'), function (c) { var src = c.dataset.src || null; matrix(c, { text: c.dataset.text || '', src: src, prev: PREV_GLYPH && PREV_GLYPH !== src ? PREV_GLYPH : null }); });

// the home field: same engine, plus the word cycle and type-to-rewrite
(function () {
  var c = document.getElementById('field');
  if (!c) return;
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var WORDS = ['Collin', 'Stilwell', 'Security'], wi = 0, typed = '', cycle = null;
  var hint = document.getElementById('field-hint');
  var m = matrix(c, { text: WORDS[0], src: 'assets/collin.jpg', prev: PREV_GLYPH });
  var name = function (w) { c.setAttribute('aria-label', w + ', drawn as a dot matrix'); };
  function startCycle() { if (reduce || cycle) return; cycle = setInterval(function () { wi = (wi + 1) % WORDS.length; m.setWord(WORDS[wi]); name(WORDS[wi]); }, 10000); }
  function stopCycle() { if (cycle) { clearInterval(cycle); cycle = null; } }
  startCycle();
  document.addEventListener('visibilitychange', function () { if (document.hidden) stopCycle(); else startCycle(); });
  window.__fieldType = function (e) {
    if (e.key === 'Escape') { typed = ''; m.setWord(WORDS[wi]); startCycle(); if (hint) hint.textContent = 'move the cursor · type to rewrite'; return true; }
    if (e.key === 'Backspace') { typed = typed.slice(0, -1); if (!typed) { m.setWord(WORDS[wi]); startCycle(); } else m.setWord(typed); return true; }
    if (e.key.length === 1 && /[a-zA-Z0-9 .&'-]/.test(e.key) && typed.length < 12) { stopCycle(); typed += e.key; m.setWord(typed); if (hint) hint.textContent = 'esc to reset'; return true; }
    return false;
  };
})();

// ── live: lectr's corpus count on the Digital page ─────────────────────────
(function () {
  var lots = document.getElementById('cs-lots');
  if (!lots) return;
  fetch('https://lectr.bid/data/ray/meta.json', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (m) {
    if (!m || !m.totalLots) return;
    var n = function (x) { return x.toLocaleString('en-US'); }, short = function (x) { return (x / 1e6).toFixed(2) + 'M'; };
    var ago = Math.round((Date.now() - new Date(m.lastCrawl)) / 36e5), when = ago < 1 ? 'under an hour ago' : ago < 48 ? ago + 'h ago' : Math.round(ago / 24) + 'd ago';
    var b = document.getElementById('cs-lots'); if (b) { b.textContent = short(m.totalLots); document.getElementById('cs-when').textContent = 'crawled ' + when; }
  }).catch(function () {});
})();

// ── the shortcuts dialog, rendered from one table so help and keymap agree
(function () {
  var grid = document.querySelector('#keys .keys-grid'); if (!grid || grid.children.length) return;
  var ROWS = [['⌘K', 'command palette'], ['g h', 'home'], ['g d', 'digital'], ['g p', 'physical'], ['g s', 'security'], ['g n', 'writing'], ['g g', 'github'], ['g a', 'about'], ['g r', 'résumé'], ['g l', 'lectr'], ['t', 'toggle theme'], ['enter', 'on a focused header: replay picture → text'], ['a–z', 'on the home page: type into the letterform'], ['?', 'this']];
  grid.innerHTML = ROWS.map(function (r) { return '<span>' + r[0].split(' ').map(function (k) { return '<kbd>' + esc(k) + '</kbd>'; }).join(' ') + '</span><span>' + esc(r[1]) + '</span>'; }).join('');
})();

// ── command palette + shortcuts ────────────────────────────────────────────
(function () {
  var pal = document.getElementById('pal'), inp = document.getElementById('pal-in'), list = document.getElementById('pal-list'), keys = document.getElementById('keys');
  if (!pal) return;
  var ITEMS = [
    { t: 'Home', h: 'g h', u: 'index.html' }, { t: 'Digital', h: 'g d', u: 'digital.html' }, { t: 'Physical', h: 'g p', u: 'physical.html' }, { t: 'Four Walls', h: 'residence', u: 'fourwalls.html' }, { t: '3D prints', h: 'text → print', u: 'prints.html' }, { t: 'Wave panel', h: '3D prints', u: 'wave.html' }, { t: 'Security', h: 'g s', u: 'security.html' }, { t: 'Writing', h: 'g n', u: 'writing.html' }, { t: 'GitHub', h: 'g g', u: 'github.html' }, { t: 'About', h: 'g a', u: 'about.html' }, { t: 'Résumé', h: 'g r', u: 'resume.html' },
    { t: 'lectr — case study', h: 'g l', u: 'lectr.html' }, { t: 'SecMCPHub — case study', h: 'digital', u: 'secmcphub.html' }, { t: 'Soirée — case study', h: 'digital', u: 'soiree.html' }, { t: 'text2print — case study', h: 'digital', u: 'text2print.html' }, { t: 'Colophon', h: 'how it is built', u: 'colophon.html' }, { t: 'Starling', h: 'digital', u: 'digital.html#starling' }, { t: 'Elixir security', h: 'digital', u: 'digital.html#elixir' },
    { t: 'Open lectr.bid', h: '↗', u: 'https://lectr.bid', x: 1 }, { t: 'How we built the price-movement engine', h: '↗', u: 'https://lectr.bid/blog/how-we-built-the-pricing-engine', x: 1 }, { t: 'Open Starling', h: '↗', u: 'https://starling-6s1.pages.dev', x: 1 }, { t: 'text2print (GitHub)', h: '↗', u: 'https://github.com/stilwellc/text2print', x: 1 }, { t: 'Open soiree.today', h: '↗', u: 'https://soiree.today', x: 1 },
    { t: 'github.com/stilwellc', h: '↗', u: 'https://github.com/stilwellc', x: 1 }, { t: 'LinkedIn', h: '↗', u: 'https://www.linkedin.com/in/collin-stilwell/', x: 1 }, { t: 'Substack', h: '↗', u: 'https://collinsthoughts.substack.com', x: 1 },
    { t: 'Shortcuts', h: '?', fn: function () { openKeys(); } }
  ];
  var sel = 0, shown = ITEMS;
  function render() {
    var q = inp.value.trim().toLowerCase();
    shown = ITEMS.filter(function (i) { return !q || i.t.toLowerCase().indexOf(q) >= 0; });
    sel = Math.min(sel, Math.max(0, shown.length - 1));
    inp.setAttribute('aria-activedescendant', shown.length ? 'pal-o' + sel : '');
    list.innerHTML = shown.map(function (i, k) { return '<li role="option" id="pal-o' + k + '" aria-selected="' + (k === sel) + '"' + (k === sel ? ' class="on"' : '') + ' data-k="' + k + '"><span>' + esc(i.t) + '</span><span class="h">' + esc(i.h) + '</span></li>'; }).join('') || '<li><span class="h">nothing matches</span></li>';
  }
  function go(i) { if (!i) return; close(); if (i.fn) return i.fn(); if (i.x) window.open(i.u, '_blank', 'noopener'); else leave(i.u); }
  var opener = null;
  function open() { closeKeys(); opener = document.activeElement; pal.hidden = false; inp.value = ''; sel = 0; render(); inp.focus(); inp.setAttribute('aria-expanded', 'true'); }
  function close() { pal.hidden = true; inp.setAttribute('aria-expanded', 'false'); inp.blur(); if (opener && opener.focus) { opener.focus(); opener = null; } }
  function openKeys() { close(); opener = opener || document.activeElement; keys.hidden = false; var box = keys.querySelector('.keys-box'); if (box) { box.tabIndex = -1; box.focus(); } }
  function closeKeys() { if (keys.hidden) return; keys.hidden = true; if (opener && opener.focus) { opener.focus(); opener = null; } }
  keys.setAttribute('aria-modal', 'true'); keys.addEventListener('keydown', function (e) { if (e.key === 'Tab') e.preventDefault(); });
  inp.setAttribute('role', 'combobox'); inp.setAttribute('aria-expanded', 'false'); inp.setAttribute('aria-controls', 'pal-list'); inp.setAttribute('aria-autocomplete', 'list');
  list.setAttribute('role', 'listbox');
  pal.addEventListener('keydown', function (e) { if (e.key === 'Tab') { e.preventDefault(); inp.focus(); } });
  inp.addEventListener('input', function () { sel = 0; render(); });
  list.addEventListener('click', function (e) { var li = e.target.closest('li[data-k]'); if (li) go(shown[+li.dataset.k]); });
  pal.addEventListener('click', function (e) { if (e.target === pal) close(); });
  keys.addEventListener('click', function (e) { if (e.target === keys) closeKeys(); });
  var btn = document.getElementById('palette-btn'); if (btn) btn.addEventListener('click', open);
  var pending = null, pt = 0;
  addEventListener('keydown', function (e) {
    var inField = /^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || '');
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); pal.hidden ? open() : close(); return; }
    if (!pal.hidden) {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(shown.length - 1, sel + 1); render(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); render(); }
      else if (e.key === 'Enter') { e.preventDefault(); go(shown[sel]); }
      return;
    }
    if (!keys.hidden) { if (e.key === 'Escape' || e.key === '?') { e.preventDefault(); closeKeys(); } return; }
    if (inField || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === '/') { e.preventDefault(); open(); return; }
    if (e.key === '?') { e.preventDefault(); openKeys(); return; }
    if (window.__fieldType && window.__fieldType(e)) { e.preventDefault(); return; }   // on the home page the letterform gets the keys first
    var now = Date.now();
    if (pending === 'g' && now - pt < 900) { pending = null; var map = { h: 'index.html', d: 'digital.html', s: 'security.html', n: 'writing.html', g: 'github.html', a: 'about.html', r: 'resume.html', l: 'lectr.html', p: 'physical.html' }; if (map[e.key]) { e.preventDefault(); leave(map[e.key]); return; } }
    if (e.key === 'g') { pending = 'g'; pt = now; return; }
  });
})();

// ── GitHub, live ───────────────────────────────────────────────────────────
(function () {
  var cells = document.getElementById('gh-cells');
  if (!cells) return;
  var H = { Accept: 'application/vnd.github+json' };
  fetch('https://api.github.com/users/stilwellc', { headers: H }).then(function (r) { return r.ok ? r.json() : null; }).then(function (u) {
    if (!u) return;
    document.getElementById('gh-repos').textContent = u.public_repos;
    document.getElementById('gh-since').textContent = new Date(u.created_at).getFullYear();
    if (u.location) document.getElementById('gh-loc').textContent = u.location;
  }).catch(function () {});
  fetch('https://api.github.com/users/stilwellc/repos?per_page=100&sort=pushed', { headers: H }).then(function (r) { return r.ok ? r.json() : null; }).then(function (rs) {
    if (!rs || !rs.length) return;
    var own = rs.filter(function (r) { return !r.fork && r.name !== 'stilwellc' && r.name !== 'collin' && r.name !== 'me' && !/assign|homework|coursework/i.test(r.name); }).slice(0, 8);
    cells.innerHTML = own.map(function (r) {
      return '<a class="cell" href="' + r.html_url + '" target="_blank" rel="noopener"><div class="top"><span class="pill mono">' + esc(r.language || 'repo') + '</span>' + (r.stargazers_count ? '<span class="pill mono">★ ' + r.stargazers_count + '</span>' : '') + '</div><h2>' + esc(r.name) + '<span class="arrow">↗</span></h2>' + (r.description ? '<p>' + esc(r.description) + '</p>' : '<p class="none">no description yet</p>') + '<div class="foot">pushed ' + r.pushed_at.slice(0, 10) + '</div></a>';
    }).join('');
  }).catch(function () {});
  fetch('https://api.github.com/users/stilwellc/events/public?per_page=100', { headers: H }).then(function (r) { return r.ok ? r.json() : null; }).then(function (ev) {
    if (!ev) return;
    var pushes = ev.filter(function (e) { return e.type === 'PushEvent'; });
    document.getElementById('gh-pushes').textContent = pushes.length;
    // the grid spans only the days the hundred events cover (the API keeps about 90 days, at most 300 events)
    var days = {}, first = null; ev.forEach(function (e) { var d = e.created_at.slice(0, 10); if (!first || d < first) first = d; if (e.type === 'PushEvent') days[d] = (days[d] || 0) + 1; });
    var grid = document.getElementById('gh-grid'), now = new Date(), out = '';
    var span = first ? Math.round((now - new Date(first)) / 864e5) : 84, weeks = Math.min(12, Math.max(2, Math.ceil((span + 1) / 7)));
    for (var w = weeks - 1; w >= 0; w--) for (var d = 0; d < 7; d++) {
      var dt = new Date(now); dt.setDate(now.getDate() - (w * 7 + (6 - d)));
      var k = dt.toISOString().slice(0, 10), n = days[k] || 0;
      out += '<i class="' + (n >= 6 ? 'l3' : n >= 3 ? 'l2' : n >= 1 ? 'l1' : '') + '" title="' + k + ' · ' + n + ' push' + (n === 1 ? '' : 'es') + '"></i>';
    }
    grid.innerHTML = out;
    grid.setAttribute('aria-label', 'Push activity: ' + pushes.length + ' pushes over ' + weeks + ' weeks');
    var note = document.querySelector('.gh-note'); if (note && first) note.insertAdjacentText('afterbegin', 'Since ' + first + '. ');
    var st = document.getElementById('gh-state'); if (st) st.textContent = 'live';
  }).catch(function () {}).then(function () { var g = document.getElementById('gh-grid'); if (g && !g.children.length) { var a = g.closest('.act'); if (a) a.hidden = true; } });
})();

// lectr case study: one lot traced, read live from lectr.bid (CORS * on the data files)
(function () {
  if (!document.getElementById('trace')) return;
  // The pinned lot. lectr drops a lot's comps from the served feed once it
  // sells, so this needs re-pinning to a live flagged lot when the sale date
  // passes — otherwise the section quietly becomes a snapshot of a finished
  // lot. Pick one from lectr.bid/data/ray/comp-evidence.json.
  var ID = 'bonhams-31916-177', SALE = '2026-09-24';
  var usd = function (n) { return '$' + Math.round(n).toLocaleString('en-US'); };
  var today = new Date().toISOString().slice(0, 10);
  var when = document.getElementById('trace-when'); if (when && today > SALE) when.textContent = 'closed ' + SALE;
  // once it has closed the comps below are a record, not a live read — say so
  // rather than leaving a label that implies the lot is still on the block
  if (today > SALE) { var cs = document.getElementById('trace-comps-src'); if (cs) cs.textContent = '\u00b7 as read on ' + SALE; }
  var j = function (u) { return fetch(u, { cache: 'no-store' }).then(function (r) { if (!r.ok) throw 0; return r.json(); }); };
  j('https://lectr.bid/data/ray/comp-evidence.json').then(function (ce) {
    var rows = ce.byLot && ce.byLot[ID]; if (!rows || !rows.length) return;
    rows = rows.slice().sort(function (a, b) { return a.d < b.d ? 1 : a.d > b.d ? -1 : 0; });
    document.getElementById('trace-comps').innerHTML = rows.map(function (c) { return '<li><span>' + esc(c.h) + ' · ' + esc(c.d) + '</span><span class="v">' + usd(c.p) + '</span></li>'; }).join('');
    document.getElementById('trace-comps-src').textContent = '· live · generated ' + (ce.generatedAt || '').slice(0, 10);
  }).catch(function () {});
  j('https://lectr.bid/data/ray/receipts.json').then(function (rc) {
    var seenT = {}; var rows = (rc.rows || []).filter(function (r) { if (!(r.p && r.r) || seenT[r.t]) return false; seenT[r.t] = 1; return true; }).slice(0, 5); if (!rows.length) return;
    document.getElementById('trace-rec').innerHTML = rows.map(function (r) {
      var t = r.t.length > 64 ? r.t.slice(0, 62) + '…' : r.t;
      return '<li><span>' + esc(t) + ' · ' + esc(r.h) + ' · called ' + esc(r.d) + '</span><span class="v">called ' + usd(r.p) + ' → realized ' + usd(r.r) + '</span></li>';
    }).join('');
    var g = rc.record && rc.record.vsbid && rc.record.vsbid.graded; if (g) document.getElementById('bt-graded').textContent = g.toLocaleString('en-US');
    document.getElementById('trace-rec-src').textContent = 'Live from lectr.bid, generated ' + (rc.generatedAt || '') + '.';
  }).catch(function () {});
  j('https://lectr.bid/data/ray/backtest.json').then(function (bt) {
    var f = bt.flagged, u = bt.unflagged; if (!f || !u) return;
    document.getElementById('bt-flag-n').textContent = f.n.toLocaleString('en-US');
    document.getElementById('bt-flag-perf').textContent = (f.medianPerfPct >= 0 ? '+' : '') + f.medianPerfPct + '%';
    document.getElementById('bt-unflag-perf').textContent = (u.medianPerfPct >= 0 ? '+' : '') + u.medianPerfPct + '%';
    document.getElementById('bt-flag-beat').textContent = f.beatHighPct + '%';
    document.getElementById('bt-unflag-beat').textContent = u.beatHighPct + '%';
  }).catch(function () {});
})();

// ── entrance + scroll motion (skipped entirely under reduced motion) ──
(function () {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  // headline lines rise one after another
  [].forEach.call(document.querySelectorAll('h1.display'), function (h) {
    var lines = h.innerHTML.split(/<br\s*\/?>/i); if (!h.textContent.trim()) return;
    h.innerHTML = lines.map(function (l, i) { return '<span class="ln"><span class="li" style="animation-delay:' + (140 + i * 120) + 'ms">' + l + '</span></span>'; }).join('');
    h.classList.remove('rv', 'd1'); h.classList.add('split');
  });
  // below-the-fold blocks reveal on scroll; anything already in view is left alone
  var blocks = document.querySelectorAll('.sheet-h, .sec, .facts, .frame, .legs, .trace, .ledger, .two, .repos, .act, .cta, .prose, #trace-rec, .sheet, .room, .plates, .pairs, figure.plate.wide, .jobs');
  var vh = innerHeight, pending = [];
  [].forEach.call(blocks, function (b) { var r = b.getBoundingClientRect(); if (r.top > vh * 0.92) { (b.classList.contains('frame') ? b.querySelector('.cells') || b : b).classList.add('sr'); if (b.classList.contains('frame')) b.classList.add('sr'); pending.push(b); } });
  function show(b) { if (b.classList.contains('in')) return; b.classList.add('in'); var c = b.querySelector('.cells'); if (c) c.classList.add('in'); countUp(b); }
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
  // ledes and statements arrive word by word
  [].forEach.call(document.querySelectorAll('.lede, .statement'), function (p) {
    if (p.querySelector('a, b')) return;
    var html = p.innerHTML, parts = html.split(/(<[^>]+>)/g), k = 0;
    p.innerHTML = parts.map(function (part) { if (!part || part[0] === '<') return part; return part.split(/(\s+)/).map(function (w) { if (!w.trim()) return w; return '<span class="w" style="transition-delay:' + (k++ * 28) + 'ms">' + w + '</span>'; }).join(''); }).join('');
    p.classList.add('wr'); requestAnimationFrame(function () { requestAnimationFrame(function () { p.classList.add('in'); }); });
  });
  // big numbers count up the first time they are seen
  [].forEach.call(document.querySelectorAll('.facts'), function (f) { if (pending.indexOf(f) < 0) countUp(f); });
  function countUp(root) {
    [].forEach.call(root.querySelectorAll('.facts .n, .n'), function (n) {
      if (n.dataset.counted) return; n.dataset.counted = '1';
      var m = /^([^\d]*)([\d,]+)(.*)$/.exec(n.textContent.trim()); if (!m || /→/.test(n.textContent)) return;
      var target = parseInt(m[2].replace(/,/g, ''), 10), pre = m[1], post = m[3], t0 = performance.now(), D = 1100, comma = m[2].indexOf(',') >= 0;
      n.style.fontVariantNumeric = 'tabular-nums';
      // Only count when there is something to count. "1.14M" parses to the
      // integer 1, so animating it printed "0.14M lots in the corpus" for a
      // whole second — a wrong number, stated as a fact. A hidden tab freezes
      // rAF at that same first frame, so it could sit there indefinitely.
      if (target < 10 || document.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      (function tick(now) { var u = Math.min(1, (now - t0) / D); u = 1 - Math.pow(1 - u, 4); var v = Math.round(target * u); n.textContent = pre + (comma ? v.toLocaleString('en-US') : String(v)) + post; if (u < 1) requestAnimationFrame(tick); })(t0);
    });
  }
})();

// ── the ape. Press him and it all goes wrong for about eleven seconds ───────
(function () {
  var ape = document.getElementById('ape'); if (!ape) return;
  var busy = false, reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  try { var seen = parseInt(localStorage.getItem('kaiju') || '0', 10); if (seen > 0) ape.title = 'survived \u00d7 ' + seen; } catch (e) {}
  function roar() {
    try {
      var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; var ac = new AC(), t = ac.currentTime;
      var g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.55, t + 0.09); g.gain.setValueAtTime(0.55, t + 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
      var f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(1400, t); f.frequency.exponentialRampToValueAtTime(180, t + 1.5); f.Q.value = 6;
      var ws = ac.createWaveShaper(), curve = new Float32Array(256); for (var i = 0; i < 256; i++) { var x = i / 128 - 1; curve[i] = Math.tanh(x * 4); } ws.curve = curve;
      ws.connect(f); f.connect(g); g.connect(ac.destination);
      [[70, 34, 'sawtooth'], [93, 45, 'square'], [140, 52, 'sawtooth']].forEach(function (p) { var o = ac.createOscillator(); o.type = p[2]; o.frequency.setValueAtTime(p[0], t); o.frequency.exponentialRampToValueAtTime(p[1], t + 1.3); var v = ac.createGain(); v.gain.value = 0.5; o.connect(v); v.connect(ws); o.start(t); o.stop(t + 1.7); });
      var buf = ac.createBuffer(1, ac.sampleRate * 1.6, ac.sampleRate), d = buf.getChannelData(0); for (var j = 0; j < d.length; j++) d[j] = (Math.random() * 2 - 1) * 0.35;
      var n = ac.createBufferSource(); n.buffer = buf; n.connect(ws); n.start(t); n.stop(t + 1.6);
      setTimeout(function () { ac.close(); }, 2500);
    } catch (e) {}
  }
  function chomp(ac, t) {
    var buf = ac.createBuffer(1, ac.sampleRate * 0.12, ac.sampleRate), d = buf.getChannelData(0); for (var j = 0; j < d.length; j++) d[j] = (Math.random() * 2 - 1) * Math.pow(1 - j / d.length, 2);
    var n = ac.createBufferSource(); n.buffer = buf; var f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500; var g = ac.createGain(); g.gain.value = 0.5; n.connect(f); f.connect(g); g.connect(ac.destination); n.start(t);
  }
  function boing(ac, t) {
    var o = ac.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(900, t + 0.35); var g = ac.createGain(); g.gain.setValueAtTime(0.35, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5); o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + 0.5);
  }
  function sfx(kind) {
    try { var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; var ac = new AC(), t = ac.currentTime;
      if (kind === 'chew') for (var i = 0; i < 7; i++) chomp(ac, t + i * 0.34); else boing(ac, t);
      setTimeout(function () { ac.close(); }, 3000); } catch (e) {}
  }
  function planes(n) {
    var box = document.createElement('div'); box.className = 'egg-planes'; box.setAttribute('aria-hidden', 'true');
    for (var i = 0; i < n; i++) { var sp = document.createElement('span'); sp.textContent = '\u2708\uFE0F'; sp.style.cssText = 'top:' + (8 + Math.random() * 40) + 'vh;animation-delay:' + (i * 0.9) + 's;animation-duration:' + (3.2 + Math.random() * 1.6) + 's;font-size:' + (26 + Math.random() * 22) + 'px;' + (i % 2 ? 'animation-name:egg-fly-back;' : ''); box.appendChild(sp); }
    document.body.appendChild(box); return box;
  }
  function heads(n) {
    var frag = document.createDocumentFragment();
    for (var i = 0; i < n; i++) {
      var banana = Math.random() < 0.45, im;
      if (banana) { im = document.createElement('span'); im.textContent = '\uD83C\uDF4C'; im.className = 'egg-head egg-banana'; }
      else { im = document.createElement('img'); im.src = 'assets/ape.svg'; im.alt = ''; im.className = 'egg-head'; }
      var size = 22 + Math.random() * 64;
      im.style.cssText = 'left:' + (Math.random() * 100) + 'vw;' + (banana ? 'font-size:' + size + 'px;' : 'width:' + size + 'px;') + 'animation-delay:' + (Math.random() * 2.4) + 's;animation-duration:' + (2.2 + Math.random() * 2.2) + 's;--spin:' + ((Math.random() > 0.5 ? 1 : -1) * (360 + Math.random() * 720)) + 'deg';
      frag.appendChild(im);
    }
    var box = document.createElement('div'); box.className = 'egg-rain'; box.setAttribute('aria-hidden', 'true'); box.appendChild(frag); document.body.appendChild(box); return box;
  }
  ape.addEventListener('click', function () {
    if (busy) return; busy = true;
    var root = document.documentElement, body = document.body, page = [].slice.call(body.children).filter(function (e) { return /^(HEADER|MAIN|FOOTER)$/.test(e.tagName); });
    var title = document.title, icon = document.querySelector('link[rel=icon]'), iconHref = icon && icon.getAttribute('href');
    roar();
    var bub = document.createElement('span'); bub.className = 'egg-bubble'; bub.textContent = 'RAWR'; ape.appendChild(bub);
    ape.classList.remove('roar'); void ape.offsetWidth; ape.classList.add('roar');
    root.classList.add('egg'); document.title = '🦍 KAIJU ALERT'; if (icon) icon.setAttribute('href', 'assets/ape.svg');
    (window.__mx || []).forEach(function (m) { if (m.setWord) { m.__word = m.word; m.setWord('RAWR'); } });
    // the ticker
    var tick = document.createElement('div'); tick.className = 'egg-tick'; tick.setAttribute('role', 'status'); tick.innerHTML = '<span>' + new Array(9).join('⚠ KAIJU ALERT · ') + '</span><span aria-hidden="true">' + new Array(9).join('⚠ KAIJU ALERT · ') + '</span>'; body.appendChild(tick);
    var kong = document.createElement('div'); kong.className = 'egg-kong'; kong.setAttribute('aria-hidden', 'true'); kong.innerHTML = '<img src="assets/ape.svg" alt="">'; body.appendChild(kong);
    var rain = null, fleet = null, timers = [], caught = 0;
    var at = function (ms, fn) { timers.push(setTimeout(fn, ms)); };
    if (reduce) {
      at(200, function () { tick.classList.add('in'); });
      at(2600, finish);
    } else {
      body.classList.add('quake'); at(900, function () { body.classList.remove('quake'); });
      at(150, function () { tick.classList.add('in'); });
      at(400, function () { rain = heads(innerWidth < 640 ? 34 : 70); });
      at(1400, function () { kong.classList.add('up'); fleet = planes(innerWidth < 640 ? 2 : 4); });
      at(2400, function () { if (!rain) return; var r = kong.querySelector('img').getBoundingClientRect(); [].forEach.call(rain.querySelectorAll('.egg-banana'), function (b) { var x = parseFloat(b.style.left) / 100 * innerWidth; if (x > r.left + r.width * 0.25 && x < r.right - r.width * 0.25) { caught++; b.classList.add('egg-caught'); } }); });
      at(3600, function () {
        // eaten: the page shrinks into the mouth
        var r = kong.querySelector('img').getBoundingClientRect(), ox = r.left + r.width * 0.5, oy = r.top + r.height * 0.76;
        page.forEach(function (e) { var b = e.getBoundingClientRect(); e.style.transformOrigin = (ox - b.left) + 'px ' + (oy - b.top) + 'px'; e.classList.add('egg-eaten'); });
        body.classList.add('quake');
      });
      at(4900, function () { body.classList.remove('quake'); kong.classList.add('chew'); sfx('chew'); tick.querySelectorAll('span').forEach(function (sp) { sp.textContent = new Array(7).join('NOM NOM NOM · \uD83C\uDF4C ' + caught + ' CAUGHT · '); }); });
      at(7400, function () {
        // spat back out
        kong.classList.remove('chew'); kong.classList.add('spit'); sfx('boing');
        page.forEach(function (e) { e.classList.remove('egg-eaten'); e.classList.add('egg-spat'); });
        tick.querySelectorAll('span').forEach(function (sp) { sp.textContent = new Array(9).join('OK BYE · '); });
        body.classList.add('quake'); at(700, function () { body.classList.remove('quake'); });
      });
      at(8600, function () { kong.classList.remove('up'); tick.classList.remove('in'); });
      at(9600, finish);
    }
    function finish() {
      timers.forEach(clearTimeout);
      page.forEach(function (e) { e.classList.remove('egg-eaten', 'egg-spat'); e.style.transformOrigin = ''; });
      kong.remove(); tick.remove(); if (rain) rain.remove(); if (fleet) fleet.remove(); bub.remove(); body.classList.remove('quake');
      var n = 0; try { n = (parseInt(localStorage.getItem('kaiju') || '0', 10) || 0) + 1; localStorage.setItem('kaiju', n); } catch (e) {}
      ape.title = 'survived \u00d7 ' + n;
      var tally = document.createElement('span'); tally.className = 'egg-tally'; tally.textContent = 'survived \u00d7 ' + n; ape.appendChild(tally); setTimeout(function () { tally.remove(); }, 4200);
      root.classList.remove('egg'); document.title = title; if (icon && iconHref) icon.setAttribute('href', iconHref);
      (window.__mx || []).forEach(function (m) { if (m.replay) { var w = m.__word; if (w) m.setWord(w); m.replay(); } });
      busy = false;
    }
    document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { document.removeEventListener('keydown', esc); finish(); } });
  });
})();

// ── the footer map marks the page it is on ─────────────────────────────────
(function () {
  var here = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  [].forEach.call(document.querySelectorAll('footer .foot-map a'), function (a) { if (a.getAttribute('href').toLowerCase() === here) { a.classList.add('on'); a.setAttribute('aria-current', 'page'); } });
})();
