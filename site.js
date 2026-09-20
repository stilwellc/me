// ── theme (explicit toggle persists; otherwise system) ─────────────────────
(function () {
  var root = document.documentElement;
  function current() { var t = root.getAttribute('data-theme'); if (t) return t; return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; }
  function set(t) { root.setAttribute('data-theme', t); try { localStorage.setItem('theme', t); } catch (e) {} }
  window.__toggleTheme = function () { set(current() === 'dark' ? 'light' : 'dark'); };
  var b = document.getElementById('theme'); if (b) b.addEventListener('click', window.__toggleTheme);
})();

// ── the matrix: picture → text, in cells ────────────────────────────────────
// One engine for every header. A cell grid over the canvas. Phase 1 (if a
// picture is given): the picture, sampled per cell as squares sized by
// luminance — a halftone. Phase 2: the squares dissolve into random hex.
// Phase 3: cells inside the text's letterform resolve left→right into solid
// squares; the rest fall back to a faint dot field. Hover un-resolves cells
// near the cursor; click replays from the picture. Reduced motion: text only.
function matrix(c, opts) {
  // A line-screen. The canvas is a fine grid (4px cells on desktop); every cell is a
  // vertical dash whose height follows the source: a photograph's luminance in the
  // picture phase, the word mask in the text phase. A coarse flow field, driven by
  // cursor velocity, displaces where each cell samples from, so the screen smears
  // under the pointer and settles back. Film grain on top.
  var ctx = c.getContext('2d');
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var dpr = Math.min(2, window.devicePixelRatio || 1);
  var W, H, cols, rows, cell, maskF, lum, th, t0, img = null, word = opts.text, raf = 0, showPic = true;
  var fc, fr, F = 5, vx, vy, tmpx, tmpy, pmx = -1, pmy = -1, pmt = 0;   // flow grid, F fine cells per flow cell
  var PIC = 3.0, DISSOLVE = 0.7, RESOLVE = 1.5;
  var PREV = 1.0, PREV_DIS = 0.45, prevImg = null, lumPrev = null;
  var outMask = null, outT = 0, OUT = 0.35;
  var GAIN = 1.4, DECAY = 0.94, DIFF = 0.11, MAXV = 2.4;                 // in flow cells
  var grain = null, gctx = null;
  function css(v) { return getComputedStyle(document.body).getPropertyValue(v).trim(); }
  function build() {
    var r = c.getBoundingClientRect();
    W = Math.max(1, Math.floor(r.width)); H = Math.max(1, Math.floor(r.height));
    c.width = W * dpr; c.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cell = W < 640 ? 3 : 4;
    cols = Math.floor(W / cell); rows = Math.floor(H / cell);
    var N = cols * rows;
    var m = document.createElement('canvas'); m.width = cols; m.height = rows;
    var mc = m.getContext('2d');
    mc.fillStyle = '#000'; mc.textBaseline = 'middle'; mc.textAlign = 'center';
    var fs = rows * 0.8;
    mc.font = '300 ' + fs + 'px "Bricolage Grotesque", Geist, Helvetica, Arial, sans-serif';
    while (mc.measureText(word).width > cols * 0.9 && fs > 8) { fs -= 1; mc.font = '300 ' + fs + 'px "Bricolage Grotesque", Geist, Helvetica, Arial, sans-serif'; }
    mc.fillText(word, cols / 2, rows * 0.53);
    var px = mc.getImageData(0, 0, cols, rows).data;
    maskF = new Float32Array(N); th = new Float32Array(N);
    for (var i = 0; i < N; i++) { maskF[i] = px[i * 4 + 3] / 255; th[i] = Math.random(); }
    fc = Math.ceil(cols / F) + 1; fr = Math.ceil(rows / F) + 1;
    vx = new Float32Array(fc * fr); vy = new Float32Array(fc * fr); tmpx = new Float32Array(fc * fr); tmpy = new Float32Array(fc * fr);
    lumPrev = prevImg ? halftone(prevImg) : null;
    lum = (img && showPic) ? halftone(img) : null;
    if (!grain) { grain = document.createElement('canvas'); grain.width = grain.height = 256; gctx = grain.getContext('2d'); var gd = gctx.createImageData(256, 256); for (var g = 0; g < gd.data.length; g += 4) { var v = 128 + (Math.random() * 90 - 45) | 0; gd.data[g] = gd.data[g + 1] = gd.data[g + 2] = v; gd.data[g + 3] = 255; } gctx.putImageData(gd, 0, 0); }
    t0 = performance.now();
  }
  function halftone(img) {
    var p = document.createElement('canvas'); p.width = cols; p.height = rows;
    var pc = p.getContext('2d'); pc.imageSmoothingEnabled = true; pc.imageSmoothingQuality = 'high';
    var padX = Math.max(1, Math.round(cols * 0.03)), padY = Math.max(1, Math.round(rows * 0.05));
    var s = Math.min((cols - 2 * padX) / img.naturalWidth, (rows - 2 * padY) / img.naturalHeight), dw = img.naturalWidth * s, dh = img.naturalHeight * s;
    var ox = Math.round((cols - dw) / 2), oy = Math.round((rows - dh) / 2);
    pc.fillStyle = '#fff'; pc.fillRect(0, 0, cols, rows); pc.drawImage(img, ox, oy, dw, dh);
    var d = pc.getImageData(0, 0, cols, rows).data, out = new Float32Array(cols * rows);
    var inside = function (j) { var x = j % cols, y = (j / cols) | 0; return x >= ox && x < ox + dw && y >= oy && y < oy + dh; };
    var raw = new Float32Array(cols * rows), mean = 0, nIn = 0, inList = [];
    for (var j = 0; j < cols * rows; j++) { raw[j] = (d[j*4]*299 + d[j*4+1]*587 + d[j*4+2]*114) / 255000; if (inside(j)) { mean += raw[j]; nIn++; inList.push(raw[j]); } }
    mean /= Math.max(1, nIn); var flip = mean > 0.5;               // light picture → draw its darks
    inList.sort(function (a, b) { return a - b; });
    var lo = inList[Math.floor(inList.length * 0.03)] || 0, hi = inList[Math.floor(inList.length * 0.97)] || 1, span = Math.max(0.05, hi - lo);
    for (var k = 0; k < cols * rows; k++) { if (!inside(k)) { out[k] = 0; continue; } var v = flip ? 1 - raw[k] : raw[k]; v = (v - (flip ? 1 - hi : lo)) / span; v = Math.min(1, Math.max(0, v)); out[k] = Math.pow(v, 1.25); }
    return out;
  }
  function sample(f, x, y) {
    if (x < 0 || y < 0 || x > cols - 1 || y > rows - 1) return 0;
    var x0 = x | 0, y0 = y | 0, x1 = x0 + 1 < cols ? x0 + 1 : x0, y1 = y0 + 1 < rows ? y0 + 1 : y0, fx = x - x0, fy = y - y0;
    var a = f[y0 * cols + x0], b = f[y0 * cols + x1], cc = f[y1 * cols + x0], dd = f[y1 * cols + x1];
    return (a * (1 - fx) + b * fx) * (1 - fy) + (cc * (1 - fx) + dd * fx) * fy;
  }
  function flowAt(f, x, y) {   // bilinear on the coarse grid, x,y in fine cells
    var gx = x / F, gy = y / F, x0 = gx | 0, y0 = gy | 0, x1 = x0 + 1 < fc ? x0 + 1 : x0, y1 = y0 + 1 < fr ? y0 + 1 : y0, fx = gx - x0, fy = gy - y0;
    return (f[y0 * fc + x0] * (1 - fx) + f[y0 * fc + x1] * fx) * (1 - fy) + (f[y1 * fc + x0] * (1 - fx) + f[y1 * fc + x1] * fx) * fy;
  }
  function stepFlow() {
    for (var y = 0; y < fr; y++) for (var x = 0; x < fc; x++) {
      var i = y * fc + x, l = x > 0 ? i - 1 : i, r = x < fc - 1 ? i + 1 : i, u = y > 0 ? i - fc : i, d = y < fr - 1 ? i + fc : i;
      tmpx[i] = (vx[i] * (1 - 4 * DIFF) + DIFF * (vx[l] + vx[r] + vx[u] + vx[d])) * DECAY;
      tmpy[i] = (vy[i] * (1 - 4 * DIFF) + DIFF * (vy[l] + vy[r] + vy[u] + vy[d])) * DECAY;
    }
    var t = vx; vx = tmpx; tmpx = t; t = vy; vy = tmpy; tmpy = t;
  }
  function inject(gxp, gyp, dxp, dyp) {   // in flow cells
    var R = 2.6, R2 = R * R, x0 = Math.max(0, (gxp - R) | 0), x1 = Math.min(fc - 1, (gxp + R) | 0), y0 = Math.max(0, (gyp - R) | 0), y1 = Math.min(fr - 1, (gyp + R) | 0);
    var mag = Math.hypot(dxp, dyp); if (mag > MAXV) { dxp *= MAXV / mag; dyp *= MAXV / mag; }
    for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) {
      var ddx = x + 0.5 - gxp, ddy = y + 0.5 - gyp, d2 = ddx * ddx + ddy * ddy; if (d2 > R2) continue;
      var w = (1 - d2 / R2) * GAIN, i = y * fc + x; vx[i] += dxp * w; vy[i] += dyp * w;
    }
  }
  var A = null, B = null;
  function frame(now) {
    var el = (now - t0) / 1000;
    ctx.clearRect(0, 0, W, H);
    var inkCol = css('color') || '#161616', accent = css('--accent') || '#FF5A1F';
    if (outMask) {
      var ou = (now - outT) / 1000 / OUT; if (ou >= 1) { outMask = null; build(); el = 0; }
      else {
        ctx.fillStyle = inkCol; ctx.globalAlpha = 0.9; ctx.beginPath();
        var half0 = cols / 2, sw = cell * 0.7;
        for (var oy = 0; oy < rows; oy++) for (var ox = 0; ox < cols; ox++) { var oi = oy * cols + ox; if (outMask[oi] < 0.4) continue; var gone = Math.abs(ox - half0) / half0 < ou * 1.25; if (gone) { if (th[oi] < 0.25 * (1 - ou)) ctx.rect(ox * cell + cell * 0.25, oy * cell + cell * 0.25, cell * 0.5, cell * 0.5); } else ctx.rect(ox * cell + (cell - sw) / 2, oy * cell + (cell - sw) / 2, sw, sw); }
        ctx.fill(); ctx.globalAlpha = 1; raf = requestAnimationFrame(frame); return;
      }
    }
    if (!reduce) stepFlow();
    var hasPrev = !!lumPrev && !reduce, tPrev = hasPrev ? PREV + PREV_DIS : 0;
    var hasPic = !!lum && !reduce;
    var tPic = hasPic ? PIC : 0, tDis = hasPic ? DISSOLVE : 0;
    var wave = reduce ? 1e9 : (el - tPrev - tPic - tDis - 0.1) / RESOLVE;
    var picMix, src, printIn = 1;
    if (hasPrev && el < tPrev) { src = lumPrev; picMix = el < PREV ? 1 : Math.max(0, 1 - (el - PREV) / PREV_DIS); printIn = Math.min(1, el / 0.7); }
    else { src = lum; var e2 = el - tPrev; picMix = hasPic ? (e2 < tPic ? 1 : Math.max(0, 1 - (e2 - tPic) / tDis)) : 0; printIn = hasPrev ? 1 : Math.min(1, Math.max(0, e2) / 0.7); }
    printIn = 1 - Math.pow(1 - printIn, 3);
    var t = now / 1000, half = cols / 2, dmax = Math.hypot(half, rows / 2);
    // ambient drift, separable so it is cheap: ax = A[y]·B[x]
    if (!A || A.length !== rows) { A = new Float32Array(rows); B = new Float32Array(cols); }
    var amb = picMix > 0 ? 0.9 : 0.25;
    for (var yy = 0; yy < rows; yy++) A[yy] = amb * Math.sin(yy * 0.09 + t * 0.7);
    for (var xx = 0; xx < cols; xx++) B[xx] = Math.cos(xx * 0.05 - t * 0.45);
    var dashW = Math.max(1.2, cell * 0.55), sq = cell * 0.7;
    // picture: dashes in the accent colour
    if (picMix > 0) {
      ctx.fillStyle = accent; ctx.globalAlpha = 0.95 * Math.min(1, picMix * 1.2); ctx.beginPath();
      for (var y = 0; y < rows; y++) { var ay = A[y]; for (var x = 0; x < cols; x++) {
        var i = y * cols + x, ax = ay * B[x];
        var sxp = x - flowAt(vx, x, y) * F - ax, syp = y - flowAt(vy, x, y) * F - ax * 0.4;
        var L = sample(src, sxp, syp); if (L < 0.06) continue;
        var pd = Math.hypot(x - half, y - rows / 2) / dmax;
        var pin = Math.min(1, Math.max(0, (printIn * 1.5 - (0.5 * pd + 0.5 * th[i])) / 0.2)); if (pin <= 0) continue;
        var h = cell * (0.2 + 0.9 * L) * pin * (picMix < 1 ? (th[i] < picMix ? 1 : 0) : 1); if (h < 0.5) continue;
        ctx.rect(x * cell + (cell - dashW) / 2, y * cell + (cell - h) / 2, dashW, h);
      } }
      ctx.fill();
    }
    // word: squares in ink, resolving with a dithered wave; unresolved cells flicker as static
    if (picMix < 1) {
      ctx.fillStyle = inkCol; ctx.globalAlpha = 0.92 * (1 - picMix); ctx.beginPath(); var st = []; 
      for (var y2 = 0; y2 < rows; y2++) { var ay2 = A[y2]; for (var x2 = 0; x2 < cols; x2++) {
        var i2 = y2 * cols + x2, ax2 = ay2 * B[x2];
        var sx2 = x2 - flowAt(vx, x2, y2) * F - ax2, sy2 = y2 - flowAt(vy, x2, y2) * F - ax2 * 0.4;
        var m = sample(maskF, sx2, sy2); if (m < 0.3) continue;
        var resolved = wave >= (0.6 * Math.abs(x2 - half) / half + 0.4 * th[i2]);
        if (resolved) { var s2 = sq * (0.6 + 0.4 * Math.min(1, m)); ctx.rect(x2 * cell + (cell - s2) / 2, y2 * cell + (cell - s2) / 2, s2, s2); }
        else if (((now / 90) | 0) % 2 === (i2 & 1)) st.push(i2);
      } }
      ctx.fill();
      if (st.length) { ctx.globalAlpha = 0.35 * (1 - picMix); ctx.beginPath(); for (var k = 0; k < st.length; k++) { var si = st[k], sxq = si % cols, syq = (si / cols) | 0; ctx.rect(sxq * cell + cell * 0.3, syq * cell + cell * 0.3, cell * 0.4, cell * 0.4); } ctx.fill(); }
    }
    // grain
    if (grain && !reduce) { ctx.globalAlpha = 0.22; ctx.globalCompositeOperation = 'source-atop'; var gx0 = -((Math.random() * 256) | 0), gy0 = -((Math.random() * 256) | 0); for (var gy = gy0; gy < H; gy += 256) for (var gx = gx0; gx < W; gx += 256) ctx.drawImage(grain, gx, gy); ctx.globalCompositeOperation = 'source-over'; }
    ctx.globalAlpha = 1;
    if (!reduce) raf = requestAnimationFrame(frame);
  }
  function play() { build(); cancelAnimationFrame(raf); if (reduce) frame(performance.now()); else raf = requestAnimationFrame(frame); }
  function setWord(w) { word = w; showPic = false; if (maskF && !reduce && !outMask) { outMask = maskF; outT = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); } else play(); }
  c.addEventListener('pointermove', function (e) {
    var r = c.getBoundingClientRect(), x = (e.clientX - r.left) / (cell * F), y = (e.clientY - r.top) / (cell * F), now = performance.now();
    if (pmx >= 0 && vx) { var dt = Math.max(8, now - pmt) / 16.7; inject(x, y, (x - pmx) / dt, (y - pmy) / dt); }
    pmx = x; pmy = y; pmt = now;
  });
  c.addEventListener('pointerleave', function () { pmx = pmy = -1; });
  c.addEventListener('click', function () { showPic = true; play(); });
  var rt; addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(play, 120); });
  function start() {
    var pending = 0;
    function done() { if (--pending <= 0) play(); }
    if (opts.prev) { pending++; prevImg = new Image(); prevImg.onload = done; prevImg.onerror = function () { prevImg = null; done(); }; prevImg.src = opts.prev; }
    if (opts.src) { pending++; img = new Image(); img.onload = done; img.onerror = function () { img = null; done(); }; img.src = opts.src; }
    if (!pending) play();
  }
  if (document.fonts && document.fonts.load) Promise.all([document.fonts.load('300 40px "Bricolage Grotesque"'), document.fonts.load('400 12px "Geist Mono"')]).then(start, start); else start();
  if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { if (!raf && !reduce) raf = requestAnimationFrame(frame); } else { cancelAnimationFrame(raf); raf = 0; } }); }, { threshold: 0 }).observe(c);
  return { setWord: setWord, replay: play, get word() { return word; } };
}

// the glyph travels with you: the page you leave hands its glyph to the page you enter,
// which shows it first and dissolves it into its own. (sessionStorage, one hop)
var PREV_GLYPH = null;
try { PREV_GLYPH = sessionStorage.getItem('mx:prev'); sessionStorage.removeItem('mx:prev'); } catch (e) {}
var OWN_GLYPH = (document.querySelector('canvas.matrix') || {}).dataset ? document.querySelector('canvas.matrix').dataset.src : null;
document.addEventListener('click', function (e) {
  var a = e.target.closest && e.target.closest('a[href]'); if (!a || a.target === '_blank' || a.origin !== location.origin) return;
  try { if (OWN_GLYPH) sessionStorage.setItem('mx:prev', OWN_GLYPH); } catch (err) {}
});

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
  function startCycle() { if (reduce || cycle) return; cycle = setInterval(function () { wi = (wi + 1) % WORDS.length; m.setWord(WORDS[wi]); }, 10000); }
  function stopCycle() { if (cycle) { clearInterval(cycle); cycle = null; } }
  startCycle();
  window.__fieldType = function (e) {
    if (e.key === 'Escape') { typed = ''; m.setWord(WORDS[wi]); startCycle(); if (hint) hint.textContent = 'move the cursor · type to rewrite'; return true; }
    if (e.key === 'Backspace') { typed = typed.slice(0, -1); if (!typed) { m.setWord(WORDS[wi]); startCycle(); } else m.setWord(typed); return true; }
    if (e.key.length === 1 && /[a-zA-Z0-9 .&'-]/.test(e.key) && typed.length < 12) { stopCycle(); typed += e.key; m.setWord(typed); if (hint) hint.textContent = 'esc to reset'; return true; }
    return false;
  };
})();

// ── live: the page's own last commit, and lectr's live corpus ──────────────
(function () {
  var el = document.getElementById('commit');
  if (el) fetch('https://api.github.com/repos/stilwellc/me/commits/main', { headers: { Accept: 'application/vnd.github+json' } })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (j) { if (!j || !j.sha) return; var ago = Math.round((Date.now() - new Date(j.commit.committer.date)) / 36e5);
      el.textContent = 'main @ ' + j.sha.slice(0, 7) + ' · ' + (ago < 1 ? 'just now' : ago < 48 ? ago + 'h ago' : Math.round(ago / 24) + 'd ago'); }).catch(function () {});
  var lots = document.getElementById('live-lots') || document.getElementById('cs-lots');
  if (!lots) return;
  fetch('https://lectr.bid/data/ray/meta.json', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (m) {
    if (!m || !m.totalLots) return;
    var n = function (x) { return x.toLocaleString('en-US'); }, short = function (x) { return (x / 1e6).toFixed(2) + 'M'; };
    var ago = Math.round((Date.now() - new Date(m.lastCrawl)) / 36e5), when = ago < 1 ? 'under an hour ago' : ago < 48 ? ago + 'h ago' : Math.round(ago / 24) + 'd ago';
    var a = document.getElementById('live-lots'); if (a) { a.textContent = n(m.totalLots); document.getElementById('live-sold').textContent = n(m.totalSold); document.getElementById('live-when').textContent = when; var d = document.getElementById('live-dot'); if (d && ago < 36) d.classList.add('on'); }
    var b = document.getElementById('cs-lots'); if (b) { b.textContent = short(m.totalLots); document.getElementById('cs-sold').textContent = short(m.totalSold); document.getElementById('cs-when').textContent = 'crawled ' + when; }
  }).catch(function () {});
})();

// ── command palette + shortcuts ────────────────────────────────────────────
(function () {
  var pal = document.getElementById('pal'), inp = document.getElementById('pal-in'), list = document.getElementById('pal-list'), keys = document.getElementById('keys');
  if (!pal) return;
  var ITEMS = [
    { t: 'Home', h: 'g h', u: 'index.html' }, { t: 'Work', h: 'g w', u: 'work.html' }, { t: 'Physical', h: 'g p', u: 'physical.html' }, { t: 'Project 1122', h: 'residence', u: '1122.html' }, { t: '3D prints', h: 'text → print', u: 'prints.html' }, { t: 'Wave panel', h: 'wall panel', u: 'wave.html' }, { t: 'Security', h: 'g s', u: 'security.html' }, { t: 'Writing', h: 'g n', u: 'writing.html' }, { t: 'How we built the price-movement engine', h: 'lectr.bid', u: 'https://lectr.bid/blog/how-we-built-the-pricing-engine' }, { t: 'GitHub', h: 'g g', u: 'github.html' }, { t: 'About', h: 'g a', u: 'about.html' }, { t: 'Résumé', h: 'g r', u: 'resume.html' },
    { t: 'lectr — case study', h: 'g l', u: 'lectr.html' }, { t: 'SecMCPHub — case study', h: '', u: 'secmcphub.html' }, { t: 'Soirée — case study', h: '', u: 'soiree.html' },
    { t: 'Open lectr.bid', h: '↗', u: 'https://lectr.bid', x: 1 }, { t: 'Open Starling', h: '↗', u: 'https://starling-6s1.pages.dev', x: 1 }, { t: 'text2print (GitHub)', h: '↗', u: 'https://github.com/stilwellc/text2print', x: 1 }, { t: 'Open soiree.today', h: '↗', u: 'https://soiree.today', x: 1 },
    { t: 'Email hello@collin.dev', h: '', u: 'mailto:hello@collin.dev' }, { t: 'GitHub', h: '↗', u: 'https://github.com/stilwellc', x: 1 }, { t: 'LinkedIn', h: '↗', u: 'https://www.linkedin.com/in/collin-stilwell/', x: 1 }, { t: 'Substack', h: '↗', u: 'https://collinsthoughts.substack.com', x: 1 },
    { t: 'Toggle theme', h: 't', fn: function () { window.__toggleTheme && window.__toggleTheme(); } }, { t: 'Shortcuts', h: '?', fn: function () { openKeys(); } }
  ];
  var sel = 0, shown = ITEMS;
  function render() {
    var q = inp.value.trim().toLowerCase();
    shown = ITEMS.filter(function (i) { return !q || i.t.toLowerCase().indexOf(q) >= 0; });
    sel = Math.min(sel, Math.max(0, shown.length - 1));
    list.innerHTML = shown.map(function (i, k) { return '<li' + (k === sel ? ' class="on"' : '') + ' data-k="' + k + '"><span>' + i.t + '</span><span class="h">' + i.h + '</span></li>'; }).join('') || '<li><span class="h">nothing matches</span></li>';
  }
  function go(i) { if (!i) return; close(); if (i.fn) return i.fn(); if (i.x) window.open(i.u, '_blank', 'noopener'); else location.href = i.u; }
  function open() { closeKeys(); pal.hidden = false; inp.value = ''; sel = 0; render(); inp.focus(); }
  function close() { pal.hidden = true; inp.blur(); }
  function openKeys() { close(); keys.hidden = false; }
  function closeKeys() { keys.hidden = true; }
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
    if (e.key === 't') { window.__toggleTheme && window.__toggleTheme(); return; }
    var now = Date.now();
    if (pending === 'g' && now - pt < 900) { pending = null; var map = { h: 'index.html', w: 'work.html', s: 'security.html', n: 'writing.html', g: 'github.html', a: 'about.html', r: 'resume.html', l: 'lectr.html', p: 'physical.html' }; if (map[e.key]) { e.preventDefault(); location.href = map[e.key]; return; } }
    if (e.key === 'g') { pending = 'g'; pt = now; return; }
    if (window.__fieldType && window.__fieldType(e)) e.preventDefault();
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
    var own = rs.filter(function (r) { return !r.fork && r.name !== 'stilwellc' && r.name !== 'collin'; }).slice(0, 8);
    cells.innerHTML = own.map(function (r) {
      return '<a class="cell" href="' + r.html_url + '" target="_blank" rel="noopener"><div class="top"><span class="pill mono">' + (r.language || 'repo') + '</span>' + (r.stargazers_count ? '<span class="pill mono">★ ' + r.stargazers_count + '</span>' : '') + '</div><h2>' + r.name + '<span class="arrow">↗</span></h2><p>' + (r.description || '') + '</p><div class="foot">pushed ' + r.pushed_at.slice(0, 10) + '</div></a>';
    }).join('');
  }).catch(function () {});
  fetch('https://api.github.com/users/stilwellc/events/public?per_page=100', { headers: H }).then(function (r) { return r.ok ? r.json() : null; }).then(function (ev) {
    if (!ev) return;
    var pushes = ev.filter(function (e) { return e.type === 'PushEvent'; });
    document.getElementById('gh-pushes').textContent = pushes.length;
    // 12 weeks × 7 days, newest column on the right
    var days = {}; pushes.forEach(function (e) { var d = e.created_at.slice(0, 10); days[d] = (days[d] || 0) + 1; });
    var grid = document.getElementById('gh-grid'), now = new Date(), out = '';
    for (var w = 11; w >= 0; w--) for (var d = 0; d < 7; d++) {
      var dt = new Date(now); dt.setDate(now.getDate() - (w * 7 + (6 - d)));
      var k = dt.toISOString().slice(0, 10), n = days[k] || 0;
      out += '<i class="' + (n >= 6 ? 'l3' : n >= 3 ? 'l2' : n >= 1 ? 'l1' : '') + '" title="' + k + ' · ' + n + ' push' + (n === 1 ? '' : 'es') + '"></i>';
    }
    grid.innerHTML = out;
  }).catch(function () {});
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
    document.getElementById('trace-comps').innerHTML = rows.map(function (c) { return '<li><span>' + c.h + ' · ' + c.d + '</span><span class="v">' + usd(c.p) + '</span></li>'; }).join('');
    document.getElementById('trace-comps-src').textContent = '· live · generated ' + (ce.generatedAt || '').slice(0, 10);
  }).catch(function () {});
  j('https://lectr.bid/data/ray/receipts.json').then(function (rc) {
    var rows = (rc.rows || []).filter(function (r) { return r.p && r.r; }).slice(0, 5); if (!rows.length) return;
    document.getElementById('trace-rec').innerHTML = rows.map(function (r) {
      var t = r.t.length > 64 ? r.t.slice(0, 62) + '…' : r.t;
      return '<li><span>' + t + ' · ' + r.h + ' · called ' + r.d + '</span><span class="v">called ' + usd(r.p) + ' → realized ' + usd(r.r) + '</span></li>';
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
    var lines = h.innerHTML.split(/<br\s*\/?>/i); if (!lines.length) return;
    h.innerHTML = lines.map(function (l, i) { return '<span class="ln"><span class="li" style="animation-delay:' + (140 + i * 120) + 'ms">' + l + '</span></span>'; }).join('');
    h.classList.remove('rv', 'd1'); h.classList.add('split');
  });
  // below-the-fold blocks reveal on scroll; anything already in view is left alone
  var blocks = document.querySelectorAll('.sec, .facts, .frame, .legs, .trace, .ledger, .two, .repos, .act, .cta, .prose, #trace-rec, .sheet, .room, .plates, .pairs, figure.plate.wide, .jobs');
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
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) pending.forEach(show);
  // ledes and statements arrive word by word
  [].forEach.call(document.querySelectorAll('.lede, .statement'), function (p) {
    if (p.querySelector('a, b, span.dim')) { var dim = p.querySelector('span.dim'); if (!dim) return; }
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
