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
function esc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

function matrix(c, opts) {
  // A line-screen that always fills its band. Every cell of the canvas carries
  // something: a faint filler dot when nothing else is there, a vertical dash
  // whose height follows a photograph's luminance in a picture phase, a square
  // whose size follows the word mask in a text phase. Phases do not cut or cull:
  // they MORPH, cell by cell, along a dithered sweep, with a gust through the
  // flow field so the screen smears into its next shape and settles. A coarse
  // flow field driven by cursor velocity displaces where each cell samples
  // from. Film grain on top.
  var ctx = c.getContext('2d');
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var dpr = Math.min(2, window.devicePixelRatio || 1);
  var W, H, cols, rows, cell, N, th, t0 = 0, raf = 0, word = opts.text, img = null, prevImg = null, showPic = true;
  var maskF = null, pic = null, picPrev = null;          // fields: {v: Float32Array, e: Float32Array|null}
  var fc, fr, F = 5, vx, vy, tmpx, tmpy, pmx = -1, pmy = -1, pmt = 0;   // flow grid, F fine cells per flow cell
  var GAIN = 1.4, DECAY = 0.94, DIFF = 0.11, MAXV = 2.4;                 // in flow cells
  var FILL_IN = 0.35, PREV_HOLD = 0.9, PIC_HOLD = 2.6, MORPH = 0.85, WORD_MORPH = 0.6, PRINT = 0.7;
  var states = [], gusted = [], gustDir = 1;
  var grain = null, gctx = null, A = null, B = null;
  var fitPref = (c.dataset && c.dataset.fit) || opts.fit || null;
  var focus = [0.5, 0.5];
  if (c.dataset && c.dataset.focus) { var fp = c.dataset.focus.split(',').map(parseFloat); if (fp.length === 2 && !isNaN(fp[0]) && !isNaN(fp[1])) focus = fp; }
  function css(v) { return getComputedStyle(document.body).getPropertyValue(v).trim(); }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function smooth(v) { v = clamp01(v); return v * v * (3 - 2 * v); }

  function buildGrid() {
    var r = c.getBoundingClientRect();
    W = Math.max(1, Math.floor(r.width)); H = Math.max(1, Math.floor(r.height));
    c.width = W * dpr; c.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cell = W < 640 ? 3 : 4;
    cols = Math.floor(W / cell); rows = Math.floor(H / cell); N = cols * rows;
    th = new Float32Array(N); for (var i = 0; i < N; i++) th[i] = Math.random();
    fc = Math.ceil(cols / F) + 1; fr = Math.ceil(rows / F) + 1;
    vx = new Float32Array(fc * fr); vy = new Float32Array(fc * fr); tmpx = new Float32Array(fc * fr); tmpy = new Float32Array(fc * fr);
    A = new Float32Array(rows); B = new Float32Array(cols);
    if (!grain) { grain = document.createElement('canvas'); grain.width = grain.height = 256; gctx = grain.getContext('2d'); var gd = gctx.createImageData(256, 256); for (var g = 0; g < gd.data.length; g += 4) { var v = 128 + (Math.random() * 90 - 45) | 0; gd.data[g] = gd.data[g + 1] = gd.data[g + 2] = v; gd.data[g + 3] = 255; } gctx.putImageData(gd, 0, 0); }
  }
  function buildMask(w) {
    // one cap height for every word, so "Wave" and "SecMCPHub" sit in the same
    // band at the same size; only a word that would overflow shrinks
    var m = document.createElement('canvas'); m.width = cols; m.height = rows;
    var mc = m.getContext('2d');
    mc.fillStyle = '#000'; mc.textBaseline = 'middle'; mc.textAlign = 'center';
    var fs = rows * 0.62, font = function (s) { return '300 ' + s + 'px "Bricolage Grotesque", Geist, Helvetica, Arial, sans-serif'; };
    mc.font = font(fs);
    while (mc.measureText(w).width > cols * 0.92 && fs > 8) { fs -= 1; mc.font = font(fs); }
    mc.fillText(w, cols / 2, rows * 0.53);
    var px = mc.getImageData(0, 0, cols, rows).data, out = new Float32Array(N);
    for (var i = 0; i < N; i++) out[i] = px[i * 4 + 3] / 255;
    return { v: out, e: null };
  }
  function halftone(im) {
    // 2x supersampled luminance, a percentile stretch, a little local contrast
    // so flat screenshots keep their structure, and an edge channel that
    // widens the dash on detail. Polarity flips so a light picture draws its
    // darks. Photographs cover the band; drawings (svg) sit inside it.
    var S = 2, cw = cols * S, rh = rows * S;
    var p = document.createElement('canvas'); p.width = cw; p.height = rh;
    var pc = p.getContext('2d'); pc.imageSmoothingEnabled = true; pc.imageSmoothingQuality = 'high';
    var iw = im.naturalWidth || im.width, ih = im.naturalHeight || im.height;
    var isSvg = /\.svg(\?|$)/i.test(im.src || '');
    // landscape photographs cover the band (a viewport-dependent test flipped
    // between cover and contain as the band's own aspect changed); drawings and
    // portraits sit inside it over the filler
    var fit = fitPref || (isSvg ? 'contain' : ((iw / ih) >= 1.3 ? 'cover' : 'contain'));
    var padX = fit === 'cover' ? 0 : Math.round(cw * 0.03), padY = fit === 'cover' ? 0 : Math.round(rh * 0.05);
    var sx = (cw - 2 * padX) / iw, sy = (rh - 2 * padY) / ih, s = fit === 'cover' ? Math.max(sx, sy) : Math.min(sx, sy);
    var dw = Math.round(iw * s), dh = Math.round(ih * s);
    var ox = fit === 'cover' ? Math.round((cw - dw) * focus[0]) : Math.round((cw - dw) / 2);
    var oy = fit === 'cover' ? Math.round((rh - dh) * focus[1]) : Math.round((rh - dh) / 2);
    pc.fillStyle = '#fff'; pc.fillRect(0, 0, cw, rh); pc.drawImage(im, ox, oy, dw, dh);
    var d = pc.getImageData(0, 0, cw, rh).data;
    var raw = new Float32Array(N), inside = new Uint8Array(N), list = [], mean = 0, nIn = 0;
    for (var y = 0; y < rows; y++) for (var x = 0; x < cols; x++) {
      var acc = 0;
      for (var yy = 0; yy < S; yy++) for (var xx = 0; xx < S; xx++) { var j = ((y * S + yy) * cw + (x * S + xx)) * 4; acc += (d[j] * 299 + d[j + 1] * 587 + d[j + 2] * 114) / 255000; }
      var i = y * cols + x; raw[i] = acc / (S * S);
      var cx = x * S + S / 2, cy = y * S + S / 2;
      // one supersampled pixel in from the picture's edge: the antialiased
      // boundary blends with the white fill and read as a bright bar
      if (cx >= ox + 1 && cx < ox + dw - 1 && cy >= oy + 1 && cy < oy + dh - 1) { inside[i] = 1; list.push(raw[i]); mean += raw[i]; nIn++; }
    }
    mean /= Math.max(1, nIn); var flip = mean > 0.5;
    list.sort(function (a, b) { return a - b; });
    var lo = list[Math.floor(list.length * 0.03)] || 0, hi = list[Math.floor(list.length * 0.97)] || 1, span = Math.max(0.05, hi - lo);
    var v0 = new Float32Array(N);
    for (var k = 0; k < N; k++) { if (!inside[k]) continue; var u = flip ? 1 - raw[k] : raw[k]; u = (u - (flip ? 1 - hi : lo)) / span; v0[k] = clamp01(u); }
    // local contrast + edges from a 3x3 box blur
    var out = new Float32Array(N), edge = new Float32Array(N);
    for (var y2 = 0; y2 < rows; y2++) for (var x2 = 0; x2 < cols; x2++) {
      var i2 = y2 * cols + x2; if (!inside[i2]) continue;
      var sum = 0, n = 0;
      for (var dy = -1; dy <= 1; dy++) { var yb = y2 + dy; if (yb < 0 || yb >= rows) continue; for (var dx = -1; dx <= 1; dx++) { var xb = x2 + dx; if (xb < 0 || xb >= cols) continue; sum += v0[yb * cols + xb]; n++; } }
      var bl = sum / n, dv = v0[i2] - bl;
      out[i2] = Math.pow(clamp01(v0[i2] + 0.55 * dv), 1.2);
      edge[i2] = clamp01(Math.abs(dv) * 3.2);
    }
    return { v: out, e: edge };
  }
  function sample(f, x, y) {
    if (x < 0 || y < 0 || x > cols - 1 || y > rows - 1) return 0;
    var x0 = x | 0, y0 = y | 0, x1 = x0 + 1 < cols ? x0 + 1 : x0, y1 = y0 + 1 < rows ? y0 + 1 : y0, fx = x - x0, fy = y - y0;
    var a = f[y0 * cols + x0], b = f[y0 * cols + x1], cc = f[y1 * cols + x0], dd = f[y1 * cols + x1];
    return (a * (1 - fx) + b * fx) * (1 - fy) + (cc * (1 - fx) + dd * fx) * fy;
  }
  function flowAt(f, x, y) {
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
  function inject(gxp, gyp, dxp, dyp) {
    var R = 2.6, R2 = R * R, x0 = Math.max(0, (gxp - R) | 0), x1 = Math.min(fc - 1, (gxp + R) | 0), y0 = Math.max(0, (gyp - R) | 0), y1 = Math.min(fr - 1, (gyp + R) | 0);
    var mag = Math.hypot(dxp, dyp); if (mag > MAXV) { dxp *= MAXV / mag; dyp *= MAXV / mag; }
    for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) {
      var ddx = x + 0.5 - gxp, ddy = y + 0.5 - gyp, d2 = ddx * ddx + ddy * ddy; if (d2 > R2) continue;
      var w = (1 - d2 / R2) * GAIN, i = y * fc + x; vx[i] += dxp * w; vy[i] += dyp * w;
    }
  }
  function gust(dir) {
    // a wind through the whole band at the start of a morph: the screen smears
    // into its next shape instead of switching to it
    for (var y = 0; y < fr; y++) { var g = 1.5 * (0.7 + 0.3 * Math.sin(y * 0.6)); for (var x = 0; x < fc; x++) { var i = y * fc + x; vx[i] = Math.max(-MAXV, Math.min(MAXV, vx[i] + dir * g)); vy[i] += 0.25 * Math.sin(x * 0.4 + y); } }
  }
  function sequence() {
    // what the band shows, in order; each state holds, then morphs into the next
    var s = [];
    if (picPrev && !reduce) s.push({ f: picPrev, kind: 'pic', hold: PREV_HOLD, sweep: 'lr' });
    if (pic && showPic && !reduce) s.push({ f: pic, kind: 'pic', hold: PIC_HOLD, sweep: 'centre' });
    s.push({ f: maskF, kind: 'word', hold: 1e9, sweep: 'lr' });
    states = s; gusted = s.map(function () { return false; });
  }
  function frame(now) {
    var el = (now - t0) / 1000;
    ctx.clearRect(0, 0, W, H);
    var inkCol = css('color') || '#161616', accent = css('--accent') || '#FF5A1F';
    if (!reduce) stepFlow();
    // where are we in the sequence
    var k = 0, u = 0, tt = el, morphing = false, morphT = MORPH;
    while (k < states.length - 1) {
      var d = states[k].kind === 'word' && states[k + 1].kind === 'word' ? WORD_MORPH : MORPH;
      if (tt < states[k].hold) break;
      tt -= states[k].hold;
      if (tt < d) { morphing = true; u = tt / d; morphT = d; break; }
      tt -= d; k++;
    }
    if (reduce) { k = states.length - 1; morphing = false; }
    var SA = states[k], SB = morphing ? states[k + 1] : null;
    if (morphing && !gusted[k]) { gusted[k] = true; states[k].dir = gustDir; gust(gustDir); gustDir = -gustDir; }
    var sdir = SA.dir || 1;
    var printIn = k === 0 ? 1 - Math.pow(1 - Math.min(1, el / PRINT), 3) : 1;
    var fillIn = reduce ? 1 : Math.min(1, el / FILL_IN);
    var t = now / 1000, half = cols / 2, dmax = Math.hypot(half, rows / 2);
    // ambient drift, separable so it is cheap
    var amb = SA.kind === 'pic' ? 0.9 : 0.25;
    for (var yy = 0; yy < rows; yy++) A[yy] = amb * Math.sin(yy * 0.09 + t * 0.7);
    for (var xx = 0; xx < cols; xx++) B[xx] = Math.cos(xx * 0.05 - t * 0.45);
    var dashW = Math.max(1.2, cell * 0.55), sq = cell * 0.7, fillDot = cell * 0.22;
    var accentRects = [], inkRects = [], fillRects = [];
    var fA = SA.f, fB = SB ? SB.f : null, sweep = SB ? SB.sweep : null, up = u * 1.35;
    for (var y = 0; y < rows; y++) {
      var ay = A[y];
      for (var x = 0; x < cols; x++) {
        var i = y * cols + x, ax = ay * B[x];
        var fxv = flowAt(vx, x, y) * F, fyv = flowAt(vy, x, y) * F;
        var sxp = x - fxv - ax, syp = y - fyv - ax * 0.4;
        // per-cell mix into the next state, along a dithered sweep
        var mix = 0;
        if (SB) { var dpos = sweep === 'centre' ? Math.abs(x - half) / half : (sdir > 0 ? x / cols : 1 - x / cols); mix = smooth((up - (0.7 * dpos + 0.3 * th[i])) / 0.28); }
        var vA = sample(fA.v, sxp, syp), vB = fB ? sample(fB.v, sxp, syp) : 0;
        if (SA.kind === 'word' && vA < 0.3) vA = 0; if (fB && SB.kind === 'word' && vB < 0.3) vB = 0;
        if (SA.kind === 'pic' && vA < 0.06) vA = 0; if (fB && SB.kind === 'pic' && vB < 0.06) vB = 0;
        var v = vA * (1 - mix) + vB * mix;
        if (k === 0 && printIn < 1) { var pd = Math.hypot(x - half, y - rows / 2) / dmax; var pin = clamp01((printIn * 1.5 - (0.5 * pd + 0.5 * th[i])) / 0.2); v *= pin; }
        if (v < 0.04) {
          // filler: the band is always a full rectangle
          if (fillIn > 0) { var fd = fillDot * (0.7 + 0.5 * th[i]) * (0.85 + 0.15 * Math.sin(t * 0.6 + x * 0.05 + y * 0.09)); fillRects.push(x * cell + (cell - fd) / 2 - fxv * cell * 0.3, y * cell + (cell - fd) / 2 - fyv * cell * 0.3, fd); }
          continue;
        }
        // shape: dash for a picture, square for a word, blended by mix
        var kindA = SA.kind, kindB = SB ? SB.kind : kindA;
        var wA = kindA === 'pic' ? dashW * (0.85 + 0.6 * (fA.e ? fA.e[i] : 0)) : sq * (0.6 + 0.4 * vA);
        var hA = kindA === 'pic' ? cell * (0.2 + 0.9 * vA) * (0.78 + 0.22 * (fA.e ? fA.e[i] : 1)) : wA;
        var wB = !SB ? wA : (kindB === 'pic' ? dashW * (0.85 + 0.6 * (fB.e ? fB.e[i] : 0)) : sq * (0.6 + 0.4 * vB));
        var hB = !SB ? hA : (kindB === 'pic' ? cell * (0.2 + 0.9 * vB) * (0.78 + 0.22 * (fB.e ? fB.e[i] : 1)) : wB);
        if (SB && kindB === 'word' && kindA !== 'word') { var pop = 1 + 0.18 * Math.sin(Math.PI * clamp01((mix - 0.45) / 0.55)); wB *= pop; hB *= pop; }
        var w = wA * (1 - mix) + wB * mix, h = hA * (1 - mix) + hB * mix;
        if (h < 0.5) continue;
        var toInk = (mix < 0.5 ? kindA : kindB) === 'word';
        (toInk ? inkRects : accentRects).push(x * cell + (cell - w) / 2, y * cell + (cell - h) / 2, w, h);
      }
    }
    function paint(list, col, alpha, square) {
      if (!list.length) return; ctx.fillStyle = col; ctx.globalAlpha = alpha; ctx.beginPath();
      if (square) for (var q = 0; q < list.length; q += 3) ctx.rect(list[q], list[q + 1], list[q + 2], list[q + 2]);
      else for (var q2 = 0; q2 < list.length; q2 += 4) ctx.rect(list[q2], list[q2 + 1], list[q2 + 2], list[q2 + 3]);
      ctx.fill();
    }
    paint(fillRects, inkCol, 0.13 * fillIn, true);
    paint(accentRects, accent, 0.95, false);
    paint(inkRects, inkCol, 0.92, false);
    if (grain && !reduce) { ctx.globalAlpha = 0.22; ctx.globalCompositeOperation = 'source-atop'; var gx0 = -((Math.random() * 256) | 0), gy0 = -((Math.random() * 256) | 0); for (var gy = gy0; gy < H; gy += 256) for (var gx = gx0; gx < W; gx += 256) ctx.drawImage(grain, gx, gy); ctx.globalCompositeOperation = 'source-over'; }
    ctx.globalAlpha = 1;
    if (!reduce) raf = requestAnimationFrame(frame);
  }
  function play() {
    buildGrid(); maskF = buildMask(word);
    picPrev = prevImg ? halftone(prevImg) : null; pic = (img && showPic) ? halftone(img) : null;
    sequence(); t0 = performance.now();
    cancelAnimationFrame(raf); if (reduce) frame(performance.now()); else raf = requestAnimationFrame(frame);
  }
  function setWord(w) {
    word = w; showPic = false;
    if (!cols) return play();
    var old = maskF; maskF = buildMask(w);
    if (reduce || !old) { states = [{ f: maskF, kind: 'word', hold: 1e9, sweep: 'lr' }]; gusted = [false]; }
    else { states = [{ f: old, kind: 'word', hold: 0, sweep: 'lr' }, { f: maskF, kind: 'word', hold: 1e9, sweep: 'lr' }]; gusted = [false, false]; }
    t0 = performance.now(); cancelAnimationFrame(raf); if (reduce) frame(performance.now()); else raf = requestAnimationFrame(frame);
  }
  c.addEventListener('pointermove', function (e) {
    var r = c.getBoundingClientRect(), x = (e.clientX - r.left) / (cell * F), y = (e.clientY - r.top) / (cell * F), now = performance.now();
    if (pmx >= 0 && vx) { var dt = Math.max(8, now - pmt) / 16.7; inject(x, y, (x - pmx) / dt, (y - pmy) / dt); }
    pmx = x; pmy = y; pmt = now;
  });
  c.addEventListener('pointerleave', function () { pmx = pmy = -1; });
  c.addEventListener('click', function () { showPic = true; prevImg = null; play(); });
  if (!c.hasAttribute('tabindex')) c.tabIndex = 0;
  c.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showPic = true; prevImg = null; play(); } });
  var rt; addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(play, 120); });
  function start() {
    if (reduce) { play(); return; }
    var pending = 0;
    function done() { if (--pending <= 0) play(); }
    if (opts.prev) { pending++; prevImg = new Image(); prevImg.onload = done; prevImg.onerror = function () { prevImg = null; done(); }; prevImg.src = opts.prev; }
    if (opts.src) { pending++; img = new Image(); img.onload = done; img.onerror = function () { img = null; done(); }; img.src = opts.src; }
    if (!pending) play();
  }
  if (document.fonts && document.fonts.load) Promise.all([document.fonts.load('300 40px "Bricolage Grotesque"'), document.fonts.load('400 12px "Geist Mono"')]).then(start, start); else start();
  if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { if (!raf && !reduce) raf = requestAnimationFrame(frame); } else { cancelAnimationFrame(raf); raf = 0; } }); }, { threshold: 0 }).observe(c);
  var api = { setWord: setWord, replay: play, get word() { return word; }, get fields() { return { pic: pic, prev: picPrev, mask: maskF, cols: cols, rows: rows }; },
    // seek(seconds): draw the band as it looks that far into its sequence, once.
    // For checking a moment of the animation without waiting for it.
    seek: function (s) { cancelAnimationFrame(raf); t0 = performance.now() - s * 1000; frame(performance.now()); cancelAnimationFrame(raf); raf = 0; } };
  (window.__mx = window.__mx || []).push(api);
  return api;
}

// the glyph travels with you: the page you leave hands its glyph to the page you enter,
// which shows it first and dissolves it into its own. (sessionStorage, one hop)
var PREV_GLYPH = null;
try { PREV_GLYPH = sessionStorage.getItem('mx:prev'); sessionStorage.removeItem('mx:prev'); } catch (e) {}
var _own = document.querySelector('canvas.matrix');
var OWN_GLYPH = _own ? _own.dataset.src : (document.getElementById('field') ? 'assets/collin.jpg' : null);
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

// ── live: the page's own last commit, and lectr's live corpus ──────────────
(function () {
  var el = document.getElementById('commit');
  // one GitHub call a session for the version pill, not one a page: the
  // unauthenticated limit is 60 an hour per address
  var paint = function (sha, date) { var ago = Math.round((Date.now() - new Date(date)) / 36e5); el.textContent = 'main @ ' + sha.slice(0, 7) + ' · ' + (ago < 1 ? 'just now' : ago < 48 ? ago + 'h ago' : Math.round(ago / 24) + 'd ago'); };
  var cached = null; try { cached = JSON.parse(sessionStorage.getItem('commit') || 'null'); } catch (e) {}
  if (el && cached && cached.sha && Date.now() - cached.at < 6e5) paint(cached.sha, cached.date);
  else if (el) fetch('https://api.github.com/repos/stilwellc/me/commits/main', { headers: { Accept: 'application/vnd.github+json' } })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (j) { if (!j || !j.sha) return; paint(j.sha, j.commit.committer.date); try { sessionStorage.setItem('commit', JSON.stringify({ sha: j.sha, date: j.commit.committer.date, at: Date.now() })); } catch (e) {} }).catch(function () {});
  var lots = document.getElementById('cs-lots');
  if (!lots) return;
  fetch('https://lectr.bid/data/ray/meta.json', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (m) {
    if (!m || !m.totalLots) return;
    var n = function (x) { return x.toLocaleString('en-US'); }, short = function (x) { return (x / 1e6).toFixed(2) + 'M'; };
    var ago = Math.round((Date.now() - new Date(m.lastCrawl)) / 36e5), when = ago < 1 ? 'under an hour ago' : ago < 48 ? ago + 'h ago' : Math.round(ago / 24) + 'd ago';
    var b = document.getElementById('cs-lots'); if (b) { b.textContent = short(m.totalLots); document.getElementById('cs-sold').textContent = short(m.totalSold); document.getElementById('cs-when').textContent = 'crawled ' + when; }
  }).catch(function () {});
})();

// ── the shortcuts dialog, rendered from one table so help and keymap agree
(function () {
  var grid = document.querySelector('#keys .keys-grid'); if (!grid || grid.children.length) return;
  var ROWS = [['⌘K', 'command palette'], ['g h', 'home'], ['g w', 'work'], ['g p', 'physical'], ['g s', 'security'], ['g n', 'writing'], ['g g', 'github'], ['g a', 'about'], ['g r', 'résumé'], ['g l', 'lectr'], ['t', 'toggle theme'], ['enter', 'on a focused header: replay picture → text'], ['a–z', 'on the home page: type into the letterform'], ['?', 'this']];
  grid.innerHTML = ROWS.map(function (r) { return '<span>' + r[0].split(' ').map(function (k) { return '<kbd>' + esc(k) + '</kbd>'; }).join(' ') + '</span><span>' + esc(r[1]) + '</span>'; }).join('');
})();

// ── command palette + shortcuts ────────────────────────────────────────────
(function () {
  var pal = document.getElementById('pal'), inp = document.getElementById('pal-in'), list = document.getElementById('pal-list'), keys = document.getElementById('keys');
  if (!pal) return;
  var ITEMS = [
    { t: 'Home', h: 'g h', u: 'index.html' }, { t: 'Work', h: 'g w', u: 'work.html' }, { t: 'Physical', h: 'g p', u: 'physical.html' }, { t: 'Project 1122', h: 'residence', u: '1122.html' }, { t: '3D prints', h: 'text → print', u: 'prints.html' }, { t: 'Wave panel', h: '3D prints', u: 'wave.html' }, { t: 'Security', h: 'g s', u: 'security.html' }, { t: 'Writing', h: 'g n', u: 'writing.html' }, { t: 'GitHub', h: 'g g', u: 'github.html' }, { t: 'About', h: 'g a', u: 'about.html' }, { t: 'Résumé', h: 'g r', u: 'resume.html' },
    { t: 'lectr — case study', h: 'g l', u: 'lectr.html' }, { t: 'SecMCPHub — case study', h: 'work', u: 'secmcphub.html' }, { t: 'Soirée — case study', h: 'work', u: 'soiree.html' }, { t: 'Starling', h: 'work', u: 'work.html#starling' }, { t: 'Elixir security', h: 'work', u: 'work.html#elixir' },
    { t: 'Open lectr.bid', h: '↗', u: 'https://lectr.bid', x: 1 }, { t: 'How we built the price-movement engine', h: '↗', u: 'https://lectr.bid/blog/how-we-built-the-pricing-engine', x: 1 }, { t: 'Open Starling', h: '↗', u: 'https://starling-6s1.pages.dev', x: 1 }, { t: 'text2print (GitHub)', h: '↗', u: 'https://github.com/stilwellc/text2print', x: 1 }, { t: 'Open soiree.today', h: '↗', u: 'https://soiree.today', x: 1 },
    { t: 'Email hello@collin.dev', h: 'mail', u: 'mailto:hello@collin.dev' }, { t: 'github.com/stilwellc', h: '↗', u: 'https://github.com/stilwellc', x: 1 }, { t: 'LinkedIn', h: '↗', u: 'https://www.linkedin.com/in/collin-stilwell/', x: 1 }, { t: 'Substack', h: '↗', u: 'https://collinsthoughts.substack.com', x: 1 },
    { t: 'Toggle theme', h: 't', fn: function () { window.__toggleTheme && window.__toggleTheme(); } }, { t: 'Shortcuts', h: '?', fn: function () { openKeys(); } }
  ];
  var sel = 0, shown = ITEMS;
  function render() {
    var q = inp.value.trim().toLowerCase();
    shown = ITEMS.filter(function (i) { return !q || i.t.toLowerCase().indexOf(q) >= 0; });
    sel = Math.min(sel, Math.max(0, shown.length - 1));
    list.innerHTML = shown.map(function (i, k) { return '<li role="option" id="pal-o' + k + '" aria-selected="' + (k === sel) + '"' + (k === sel ? ' class="on"' : '') + ' data-k="' + k + '"><span>' + esc(i.t) + '</span><span class="h">' + esc(i.h) + '</span></li>'; }).join('') || '<li><span class="h">nothing matches</span></li>';
  }
  function go(i) { if (!i) return; close(); if (i.fn) return i.fn(); if (i.x) window.open(i.u, '_blank', 'noopener'); else location.href = i.u; }
  var opener = null;
  function open() { closeKeys(); opener = document.activeElement; pal.hidden = false; inp.value = ''; sel = 0; render(); inp.focus(); inp.setAttribute('aria-expanded', 'true'); }
  function close() { pal.hidden = true; inp.setAttribute('aria-expanded', 'false'); inp.blur(); if (opener && opener.focus) { opener.focus(); opener = null; } }
  function openKeys() { close(); keys.hidden = false; var box = keys.querySelector('.keys-box'); if (box) { box.tabIndex = -1; box.focus(); } }
  function closeKeys() { keys.hidden = true; }
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
      return '<a class="cell" href="' + r.html_url + '" target="_blank" rel="noopener"><div class="top"><span class="pill mono">' + esc(r.language || 'repo') + '</span>' + (r.stargazers_count ? '<span class="pill mono">★ ' + r.stargazers_count + '</span>' : '') + '</div><h2>' + esc(r.name) + '<span class="arrow">↗</span></h2>' + (r.description ? '<p>' + esc(r.description) + '</p>' : '<p class="none">no description yet</p>') + '<div class="foot">pushed ' + r.pushed_at.slice(0, 10) + '</div></a>';
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
    grid.setAttribute('aria-label', 'Push activity: the last ' + pushes.length + ' pushes on a twelve-week grid');
    var st = document.getElementById('gh-state'); if (st) st.textContent = 'live';
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
    document.getElementById('trace-comps').innerHTML = rows.map(function (c) { return '<li><span>' + esc(c.h) + ' · ' + esc(c.d) + '</span><span class="v">' + usd(c.p) + '</span></li>'; }).join('');
    document.getElementById('trace-comps-src').textContent = '· live · generated ' + (ce.generatedAt || '').slice(0, 10);
  }).catch(function () {});
  j('https://lectr.bid/data/ray/receipts.json').then(function (rc) {
    var rows = (rc.rows || []).filter(function (r) { return r.p && r.r; }).slice(0, 5); if (!rows.length) return;
    document.getElementById('trace-rec').innerHTML = rows.map(function (r) {
      var t = r.t.length > 64 ? r.t.slice(0, 62) + '…' : r.t;
      return '<li><span>' + t + ' · ' + r.h + ' · called ' + esc(r.d) + '</span><span class="v">called ' + usd(r.p) + ' → realized ' + usd(r.r) + '</span></li>';
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
