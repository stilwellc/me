
// ── the matrix: picture → text, in cells ────────────────────────────────────
// One engine for every header. A cell grid over the canvas. Phase 1 (if a
// picture is given): the picture as a line screen, vertical dashes sized by
// luminance. Phase 2: the dashes fly into the word's letterform as squares;
// the rest of the band is a faint filler-dot field. A cursor-driven flow field
// smears the screen; click replays from wherever the bodies are. Once the word
// has settled the band goes still and stops drawing until something wakes it.
// Reduced motion: the picture as a still, then a short dissolve to the word.
var GRAIN = null;
function grainTile() { if (GRAIN) return GRAIN; GRAIN = document.createElement('canvas'); GRAIN.width = GRAIN.height = 256; var g = GRAIN.getContext('2d'), gd = g.createImageData(256, 256); for (var i = 0; i < gd.data.length; i += 4) { var v = 128 + (Math.random() * 90 - 45) | 0; gd.data[i] = gd.data[i + 1] = gd.data[i + 2] = v; gd.data[i + 3] = 255; } g.putImageData(gd, 0, 0); return GRAIN; }
// ink + accent, read once; re-read only on an explicit call (themeColors.refresh
// / window.mxRetheme) or when the root's class list changes (the egg re-accents)
var THEME = { ink: '#161616', accent: '#FF5A1F', read: false };
function readTheme() {
  if (!document.body) return false;
  var cs = getComputedStyle(document.body), ink = cs.color || THEME.ink, ac = cs.getPropertyValue('--accent').trim() || THEME.accent;
  var changed = ink !== THEME.ink || ac !== THEME.accent; THEME.ink = ink; THEME.accent = ac; THEME.read = true; return changed;
}
function themeColors() { if (!THEME.read) readTheme(); return THEME; }
themeColors.refresh = function () { if (readTheme()) (window.__mx || []).concat(window.__plates || []).forEach(function (m) { if (m.wake) m.wake(true); }); };
window.mxRetheme = themeColors.refresh;
if (window.MutationObserver && document.documentElement && !window.__mxThemeMO) {
  window.__mxThemeMO = new MutationObserver(function () { if (THEME.read) themeColors.refresh(); });
  window.__mxThemeMO.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
}

function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

function matrix(c, opts) {
  // A line-screen that always fills its band. Every cell of the canvas carries
  // something: a faint filler dot when nothing else is there, a vertical dash
  // whose height follows a photograph's luminance in a picture phase, a square
  // whose size follows the word mask in a text phase. Phases do not cut or cull:
  // they MORPH, cell by cell, with a gust through the flow field so the screen
  // smears into its next shape and settles. Film grain on top.
  opts = opts || {};
  var ctx = c.getContext('2d');
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var dpr = opts.plate ? 1 : Math.min(2, window.devicePixelRatio || 1);   // a 5 px dot screen does not need a 2x bitmap
  var W = 0, H = 0, cols = 0, rows = 0, cell = 4, N = 0, th, t0 = 0, tStart = 0, raf = 0, word = opts.text || '', img = null, prevImg = null, showPic = true;
  var maskF = null, pic = null, picPrev = null;          // fields: {v: Float32Array, e: Float32Array|null}
  var fc, fr, F = 5, vx, vy, tmpx, tmpy, pmx = -1, pmy = -1, pmt = 0;   // flow grid, F fine cells per flow cell
  var GAIN = 1.4, DECAY = 0.94, DIFF = 0.11, MAXV = 2.4;                 // in flow cells
  var FILL_IN = 0.35, PIC_HOLD = opts.picHold != null ? +opts.picHold : (c.id === 'field' ? 2.2 : 1.6), MORPH = 0.8, WORD_MORPH = 0.6;
  var GATHER = 0.9, EXPLODE = 0.32, SCATTER = 0.22, PREVIEW = 0.24, LAYER_GATHER = 1.5;
  var RM_HOLD = 1.2, RM_FADE = 0.3, RM_WORD = 0.12;                      // reduced motion: still, hold, dissolve
  var PLATE_GATHER = 0.75, PLATE_SETTLE = 1.0;                           // plate veils: gather, no hold
  var IDLE_AFTER = 1.0, AMP_FADE = 0.6, EPS = 0.004, LONG_PRESS = 450;
  var grain = null, A = null, B = null, SR = null, CR = null, SC = null, CC = null, curK = 0;
  // scratch rectangles, reused every frame: [x,y,w,h]* for ink and accent, [x,y,d]* for filler, [x,y,w,h,alpha,ink]* for fades
  var RI = null, RA = null, RF = null, RD = null, nI = 0, nA = 0, nF = 0, nD = 0;
  function grow(b, need) { if (b.length >= need) return b; var nb = new Float32Array(Math.max(need, b.length * 2)); nb.set(b); return nb; }
  var fitPref = (c.dataset && c.dataset.fit) || opts.fit || null;
  var plate = !!opts.plate, still = !!opts.still, veil = plate && !still, noFill = opts.filler === false, settled = false;
  var layers = !plate && !!(opts.layers || (c.dataset && c.dataset.layers === '1'));
  var fromRect = !plate && opts.fromRect && isFinite(opts.fromRect.x) && isFinite(opts.fromRect.y) && opts.fromRect.w > 4 && opts.fromRect.h > 4 ? opts.fromRect : null;
  var focus = [0.5, 0.5];
  if (c.dataset && c.dataset.focus) { var fp = c.dataset.focus.split(',').map(parseFloat); if (fp.length === 2 && !isNaN(fp[0]) && !isNaN(fp[1])) focus = fp; }
  // lifecycle
  var dead = false, sleeping = false, dirty = false, visible = true, fontReady = false, started = false;
  var settledAt = -1, lastAct = 0, amp = 1, lastNow = 0, gateAt = -1, gfx = 0, gfy = 0;
  var previewing = false, pvWord = null, scrollP = 0, scrollFlag = false, rmT = 0, rsT = 0, lpT = 0, lpFired = -1e9, lpX = 0, lpY = 0;
  var cache = { key: '', pic: null, prev: null }, masks = {}, picParts = null, SP = null, idleTok = 0;
  var io = null, ro = null, gridKey = '';
  function curPic() { return img && cache.key === gridKey ? cache.pic : null; }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function smooth(v) { v = clamp01(v); return v * v * (3 - 2 * v); }
  function bez(x1, y1, x2, y2) {   // css cubic-bezier as a function of x
    return function (x) {
      if (x <= 0) return 0; if (x >= 1) return 1; var t = x;
      for (var i = 0; i < 8; i++) { var it = 1 - t, bx = 3 * x1 * t * it * it + 3 * x2 * t * t * it + t * t * t - x, d = 3 * x1 * it * it + 6 * (x2 - x1) * t * it + 3 * (1 - x2) * t * t; if (Math.abs(bx) < 1e-5 || Math.abs(d) < 1e-6) break; t = clamp01(t - bx / d); }
      var jt = 1 - t; return 3 * y1 * t * jt * jt + 3 * y2 * t * t * jt + t * t * t;
    };
  }
  var EASE_IN = bez(0.5, 0, 0.75, 0);
  (function () { var r = c.getBoundingClientRect(); visible = plate || (r.bottom > 0 && r.top < innerHeight); })();

  // ── grid + fields ────────────────────────────────────────────────────────
  function measure() {
    var r = c.getBoundingClientRect(), w = Math.max(1, Math.floor(r.width)), h = Math.max(1, Math.floor(r.height));
    var ce = opts.cell || (w < 640 ? 5 : 4);   // coarser on a phone, not finer
    var cl = Math.floor(w / ce), rw = Math.floor(h / ce);
    return { W: w, H: h, cell: ce, cols: cl, rows: rw, N: cl * rw, key: cl + 'x' + rw + '@' + ce };
  }
  function applyGrid(G) {
    gridKey = G.key; W = G.W; H = G.H; cell = G.cell; cols = G.cols; rows = G.rows; N = G.N;
    c.width = W * dpr; c.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    th = new Float32Array(N); for (var i = 0; i < N; i++) th[i] = Math.random();
    fc = Math.ceil(cols / F) + 1; fr = Math.ceil(rows / F) + 1;
    vx = new Float32Array(fc * fr); vy = new Float32Array(fc * fr); tmpx = new Float32Array(fc * fr); tmpy = new Float32Array(fc * fr);
    A = new Float32Array(rows); B = new Float32Array(cols); SR = null;
    RI = new Float32Array(N * 4); RA = new Float32Array(N * 4); RF = new Float32Array(N * 3); RD = new Float32Array(Math.max(6, N * 6)); nI = nA = nF = nD = 0;
    masks = {}; picParts = null; SP = null;
    grain = grainTile();
  }
  function buildMask(w, G) {
    // one cap height for every word, so "Wave" and "SecMCPHub" sit in the same
    // band at the same size; only a word that would overflow shrinks
    G = G || { cols: cols, rows: rows, N: N };
    var m = document.createElement('canvas'); m.width = Math.max(1, G.cols); m.height = Math.max(1, G.rows);
    var mc = m.getContext('2d');
    mc.fillStyle = '#000'; mc.textBaseline = 'middle'; mc.textAlign = 'center';
    var fs = G.rows * 0.62, font = function (s) { return '300 ' + s + 'px "Bricolage Grotesque", Geist, Helvetica, Arial, sans-serif'; };
    mc.font = font(fs);
    var mw = mc.measureText(w).width; if (mw > G.cols * 0.92) { fs = Math.max(8, Math.floor(fs * (G.cols * 0.92) / mw)); mc.font = font(fs); }
    mc.fillText(w, G.cols / 2, G.rows * 0.53);
    var px = mc.getImageData(0, 0, m.width, m.height).data, out = new Float32Array(G.N);
    for (var i = 0; i < G.N; i++) out[i] = px[i * 4 + 3] / 255;
    return { v: out, e: null };
  }
  function maskFor(w) { if (!fontReady) return null; return masks[w] || (masks[w] = buildMask(w)); }
  function halftone(im, G) {
    // luminance (2x supersampled; 1x on a phone), a percentile stretch, a little
    // local contrast so flat screenshots keep their structure, and an edge
    // channel that widens the dash on detail. Polarity flips so a light picture
    // draws its darks. Photographs cover the band; drawings (svg) sit inside it.
    var cols = G.cols, rows = G.rows, N = G.N;
    var S = innerWidth <= 760 ? 1 : 2, cw = cols * S, rh = rows * S;
    var p = document.createElement('canvas'); p.width = Math.max(1, cw); p.height = Math.max(1, rh);
    var pc = p.getContext('2d', { willReadFrequently: true }); pc.imageSmoothingEnabled = true; pc.imageSmoothingQuality = 'high';
    var iw = im.naturalWidth || im.width || 1, ih = im.naturalHeight || im.height || 1;
    var isSvg = /\.svg(\?|$)/i.test(im.src || '');
    // landscape photographs cover the band; drawings and portraits sit inside it over the filler
    var fit = fitPref || (isSvg ? 'contain' : ((iw / ih) >= 1.3 ? 'cover' : 'contain'));
    var padX = fit === 'cover' ? 0 : Math.round(cw * 0.03), padY = fit === 'cover' ? 0 : Math.round(rh * 0.05);
    var sx = (cw - 2 * padX) / iw, sy = (rh - 2 * padY) / ih, s = fit === 'cover' ? Math.max(sx, sy) : Math.min(sx, sy);
    var dw = Math.round(iw * s), dh = Math.round(ih * s);
    var ox = fit === 'cover' ? Math.round((cw - dw) * focus[0]) : Math.round((cw - dw) / 2);
    var oy = fit === 'cover' ? Math.round((rh - dh) * focus[1]) : Math.round((rh - dh) / 2);
    pc.fillStyle = '#fff'; pc.fillRect(0, 0, cw, rh); pc.drawImage(im, ox, oy, dw, dh);
    var d = pc.getImageData(0, 0, p.width, p.height).data;
    var raw = new Float32Array(N), inside = new Uint8Array(N), list = [], mean = 0, nIn = 0, ss = S * S;
    for (var y = 0; y < rows; y++) for (var x = 0; x < cols; x++) {
      var acc = 0;
      for (var yy = 0; yy < S; yy++) for (var xx = 0; xx < S; xx++) { var j = ((y * S + yy) * cw + (x * S + xx)) * 4; acc += (d[j] * 299 + d[j + 1] * 587 + d[j + 2] * 114) / 255000; }
      var i = y * cols + x; raw[i] = acc / ss;
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
    var res = { v: out, e: edge };
    if (veil) {
      // the veil's ground: the photograph's own border tone (the studio mat on
      // a studio render), so the lift is dark → dark, never through a grey slab
      var br = 0, bg = 0, bb = 0, bn = 0, m = Math.max(1, Math.round(Math.min(cw, rh) * 0.04));
      for (var yq = 0; yq < rh; yq++) for (var xq = 0; xq < cw; xq++) {
        if (yq >= m && yq < rh - m && xq >= m && xq < cw - m) { xq = cw - m - 1; continue; }
        var q = (yq * cw + xq) * 4; br += d[q]; bg += d[q + 1]; bb += d[q + 2]; bn++;
      }
      res.bg = bn ? 'rgb(' + Math.round(br / bn) + ',' + Math.round(bg / bn) + ',' + Math.round(bb / bn) + ')' : '#161616';
    }
    return res;
  }
  function idle(fn) { return window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 300 }) : setTimeout(fn, 1); }
  function ensureFields(G, cb) {
    // halftones are built off the critical path and cached per grid, so a
    // replay or a height-only resize never pays for them twice
    if (cache.key !== G.key) cache = { key: G.key, pic: null, prev: null };
    var needPic = img && !cache.pic, needPrev = prevImg && !cache.prev;
    if (!needPic && !needPrev) { cb(); return; }
    var tok = ++idleTok, key = G.key;
    idle(function () {
      if (dead || tok !== idleTok) return;
      if (cache.key !== key) cache = { key: key, pic: null, prev: null };
      try { if (img && !cache.pic) cache.pic = halftone(img, G); } catch (e) { img = null; }
      try { if (prevImg && !cache.prev) cache.prev = halftone(prevImg, G); } catch (e) { prevImg = null; }
      cb();
    });
  }

  // ── flow field ───────────────────────────────────────────────────────────
  function flowAt(f, x, y) {
    if (x < 0 || y < 0 || x > cols - 1 || y > rows - 1) return 0;   // bodies born beyond the band read no wind
    var gx = x / F, gy = y / F, x0 = gx | 0, y0 = gy | 0, x1 = x0 + 1 < fc ? x0 + 1 : x0, y1 = y0 + 1 < fr ? y0 + 1 : y0, fx = gx - x0, fy = gy - y0;
    return (f[y0 * fc + x0] * (1 - fx) + f[y0 * fc + x1] * fx) * (1 - fy) + (f[y1 * fc + x0] * (1 - fx) + f[y1 * fc + x1] * fx) * fy;
  }
  function stepFlow() {
    var en = 0;
    for (var y = 0; y < fr; y++) for (var x = 0; x < fc; x++) {
      var i = y * fc + x, l = x > 0 ? i - 1 : i, r = x < fc - 1 ? i + 1 : i, u = y > 0 ? i - fc : i, d = y < fr - 1 ? i + fc : i;
      var a = (vx[i] * (1 - 4 * DIFF) + DIFF * (vx[l] + vx[r] + vx[u] + vx[d])) * DECAY, b = (vy[i] * (1 - 4 * DIFF) + DIFF * (vy[l] + vy[r] + vy[u] + vy[d])) * DECAY;
      tmpx[i] = a; tmpy[i] = b; a = a < 0 ? -a : a; b = b < 0 ? -b : b; if (a + b > en) en = a + b;
    }
    var t = vx; vx = tmpx; tmpx = t; t = vy; vy = tmpy; tmpy = t;
    return en;
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

  // ── particles ───────────────────────────────────────────────────────────
  // Every drawn cell is a body with a home. A change of picture is not an
  // interpolation in place: the bodies explode outward from the centre and
  // are drawn back to their new homes, paired by angle so each one flies out
  // and returns along its own bearing. The first picture gathers in from
  // beyond the band's edges (or from the previous page's glyph, or from the
  // card that was clicked); leaving a page scatters it.
  var SEQ = [], PARTS = [], PAIRS = [], gusted = [], gustDir = 1;
  function makeParticles(st) {
    if (st.parts) return st.parts;
    var fill = new Uint8Array(N), P = { n: 0, hx: null, hy: null, v: null, e: null, t: null, kind: st.kind, fill: fill };
    if (!st.f) { fill.fill(1); P.hx = P.hy = P.v = P.e = P.t = new Float32Array(0); return P; }
    var f = st.f.v, e = st.f.e, thr = st.kind === 'word' ? 0.3 : 0.06, n = 0;
    var hx = new Float32Array(N), hy = new Float32Array(N), v = new Float32Array(N), ee = new Float32Array(N), tt = new Float32Array(N);
    for (var y = 0; y < rows; y++) for (var x = 0; x < cols; x++) {
      var i = y * cols + x, val = f[i];
      if (val < thr) { fill[i] = 1; continue; }
      hx[n] = x; hy[n] = y; v[n] = val; ee[n] = e ? e[i] : 1; tt[n] = th[i]; n++;
    }
    P.n = n; P.hx = hx; P.hy = hy; P.v = v; P.e = ee; P.t = tt; return P;
  }
  function snapshot() {
    // the bodies exactly where the last frame drew them, as a particle set, so
    // a replay / setWord / scatter leaves from what is on screen, not from blank
    var n = (nI + nA) >> 2; if (!n || !cols || !th) return null;
    var hx = new Float32Array(n), hy = new Float32Array(n), v = new Float32Array(n), e = new Float32Array(n), t = new Float32Array(n), kd = new Uint8Array(n), fill = new Uint8Array(N);
    fill.fill(1);
    var dashW = Math.max(1.2, cell * 0.55), sq = cell * 0.7, j = 0;
    function put(X, Y, w, h, isW) {
      var cx = (X + w / 2) / cell - 0.5, cy = (Y + h / 2) / cell - 0.5, ix = Math.round(cx), iy = Math.round(cy), id = iy * cols + ix, inb = ix >= 0 && iy >= 0 && ix < cols && iy < rows;
      hx[j] = cx; hy[j] = cy; kd[j] = isW ? 1 : 0; t[j] = inb ? th[id] : Math.random();
      if (isW) { v[j] = clamp01((w / sq - 0.6) / 0.4); e[j] = 1; }
      else { e[j] = clamp01((w / dashW - 0.85) / 0.6); v[j] = clamp01((h / (cell * (0.78 + 0.22 * e[j])) - 0.2) / 0.9); }
      if (inb) fill[id] = 0; j++;
    }
    for (var q = 0; q < nI; q += 4) put(RI[q], RI[q + 1], RI[q + 2], RI[q + 3], true);
    for (var q2 = 0; q2 < nA; q2 += 4) put(RA[q2], RA[q2 + 1], RA[q2 + 2], RA[q2 + 3], false);
    return { n: n, hx: hx, hy: hy, v: v, e: e, t: t, kd: kd, kind: nI >= nA ? 'word' : 'pic', fill: fill };
  }
  function byAngle(P) {
    if (P._idx) return P._idx;
    var cx = cols / 2, cy = rows / 2, idx = new Array(P.n), key = new Float32Array(P.n), sq = rows / cols;
    for (var i = 0; i < P.n; i++) { idx[i] = i; key[i] = Math.atan2(P.hy[i] - cy, (P.hx[i] - cx) * sq) + 0.003 * Math.hypot(P.hx[i] - cx, P.hy[i] - cy); }
    idx.sort(function (a, b) { return key[a] - key[b]; }); P._idx = idx; return idx;
  }
  function makePairs(A, B, step) {
    var mode = (step && step.mode) || 'edge';
    var cx = cols / 2, cy = rows / 2, R = Math.hypot(cx, cy);
    var gather = A.n === 0, scatter = B.n === 0, n = scatter ? A.n : B.n;
    var Q = { n: n, gather: gather, scatter: scatter, direct: mode === 'direct', mode: mode, sk: A.kind, tk: B.kind, skd: A.kd ? new Uint8Array(n) : null,
      sx: new Float32Array(n), sy: new Float32Array(n), sv: new Float32Array(n), se: new Float32Array(n),
      tx: new Float32Array(n), ty: new Float32Array(n), tv: new Float32Array(n), te: new Float32Array(n),
      bx: new Float32Array(n), by: new Float32Array(n), t: new Float32Array(n), fill: new Uint8Array(N),
      ax: new Float32Array(n), ay: new Float32Array(n) };   // momentum picked up from the flow field while in the air
    for (var c0 = 0; c0 < N; c0++) Q.fill[c0] = A.fill[c0] & B.fill[c0];
    var ia = A.n ? byAngle(A) : null, ib = B.n ? byAngle(B) : null;
    // gather from a rectangle (the card that was clicked), in band cells
    var rc = null;
    if (gather && mode === 'rect' && step.rect) {
      var r = step.rect; rc = { x: r.x, y: r.y, w: r.w, h: r.h };
      rc.y = Math.min(rc.y, rows - rc.h * 0.5); rc.y = Math.max(rc.y, -rc.h * 0.5); rc.x = Math.min(rc.x, cols - rc.w * 0.5); rc.x = Math.max(rc.x, -rc.w * 0.5);
      Q.s0 = Math.max(0.25, Math.min(1, rc.w / cols));
    }
    var ymin = 1e9, ymax = -1e9;
    if (gather && mode === 'layers') { for (var yq = 0; yq < B.n; yq++) { if (B.hy[yq] < ymin) ymin = B.hy[yq]; if (B.hy[yq] > ymax) ymax = B.hy[yq]; } Q.dl = new Float32Array(n); Q.span = Math.max(1, ymax - ymin + 1); }
    for (var j = 0; j < n; j++) {
      var a = scatter ? j : (gather ? -1 : ia[Math.floor(j * A.n / B.n)]), b = scatter ? -1 : ib[j];
      var srcI = scatter ? ia[j] : a;
      if (srcI >= 0) { Q.sx[j] = A.hx[srcI]; Q.sy[j] = A.hy[srcI]; Q.sv[j] = A.v[srcI]; Q.se[j] = A.e[srcI]; Q.t[j] = A.t[srcI]; if (Q.skd) Q.skd[j] = A.kd[srcI]; }
      if (b >= 0) { Q.tx[j] = B.hx[b]; Q.ty[j] = B.hy[b]; Q.tv[j] = B.v[b]; Q.te[j] = B.e[b]; if (srcI < 0) Q.t[j] = B.t[b]; }
      if (gather && mode === 'layers') {
        // printed bottom-up, one row per layer; the head lays each row from alternating sides
        var dir = (Q.ty[j] | 0) % 2 ? 1 : -1;
        Q.sx[j] = Q.tx[j] + dir * (4 + 10 * Q.t[j]); Q.sy[j] = Q.ty[j]; Q.sv[j] = Q.tv[j] * 0.3; Q.se[j] = Q.te[j];
        Q.dl[j] = (ymax - Q.ty[j]) / Q.span; Q.bx[j] = Q.sx[j]; Q.by[j] = Q.sy[j];
      } else if (gather && rc) {
        // born inside the card's rectangle, each body at its own place in the picture
        Q.sx[j] = rc.x + (Q.tx[j] / cols) * rc.w + (Q.t[j] - 0.5) * 0.6; Q.sy[j] = rc.y + (Q.ty[j] / rows) * rc.h;
        Q.sv[j] = Q.tv[j]; Q.se[j] = Q.te[j]; Q.bx[j] = Q.sx[j]; Q.by[j] = Q.sy[j];
      } else if (gather) {
        // born beyond the band's edge, on the target's own bearing
        var ang = Math.atan2(Q.ty[j] - cy, Q.tx[j] - cx) + (Q.t[j] - 0.5) * 0.9, rad = R * (1.05 + 0.6 * Q.t[j]);
        Q.sx[j] = cx + Math.cos(ang) * rad; Q.sy[j] = cy + Math.sin(ang) * rad; Q.sv[j] = Q.tv[j] * 0.5; Q.se[j] = Q.te[j]; Q.bx[j] = Q.sx[j]; Q.by[j] = Q.sy[j];
      } else {
        var dx = Q.sx[j] - cx, dy = (Q.sy[j] - cy) * (cols / rows), L = Math.hypot(dx, dy) || 1, rot = (Q.t[j] - 0.5) * 1.2, cs = Math.cos(rot), sn = Math.sin(rot);
        var ux = (dx * cs - dy * sn) / L, uy = (dx * sn + dy * cs) / L, len = R * (scatter ? 0.9 : 0.45) * (0.5 + Q.t[j]);
        Q.bx[j] = Q.sx[j] + ux * len; Q.by[j] = Q.sy[j] + uy * len * (rows / cols);
        if (scatter) { Q.tx[j] = Q.bx[j] + ux * len; Q.ty[j] = Q.by[j] + uy * len * (rows / cols); Q.tv[j] = 0; Q.te[j] = Q.se[j]; }
      }
    }
    // when there are more bodies than homes, the rest fly off and fade
    if (!gather && !scatter && A.n > B.n) {
      var used = new Uint8Array(A.n); for (var k = 0; k < n; k++) used[ia[Math.floor(k * A.n / B.n)]] = 1;
      var extra = []; for (var m = 0; m < A.n; m++) if (!used[m]) extra.push(m);
      var more = function (arr, add) { var o = new (arr.constructor)(arr.length + add); o.set(arr); return o; };
      var base = n; n += extra.length;
      ['sx', 'sy', 'sv', 'se', 'tx', 'ty', 'tv', 'te', 'bx', 'by', 't', 'ax', 'ay'].forEach(function (key) { Q[key] = more(Q[key], extra.length); });
      if (Q.skd) Q.skd = more(Q.skd, extra.length);
      Q.die = new Uint8Array(n);
      for (var q = 0; q < extra.length; q++) {
        var s = extra[q], jj = base + q; Q.die[jj] = 1;
        Q.sx[jj] = A.hx[s]; Q.sy[jj] = A.hy[s]; Q.sv[jj] = A.v[s]; Q.se[jj] = A.e[s]; Q.t[jj] = A.t[s]; if (Q.skd) Q.skd[jj] = A.kd[s];
        var ddx = A.hx[s] - cx, ddy = (A.hy[s] - cy) * (cols / rows), LL = Math.hypot(ddx, ddy) || 1, ln = R * 0.6 * (0.5 + A.t[s]);
        Q.bx[jj] = A.hx[s] + ddx / LL * ln; Q.by[jj] = A.hy[s] + ddy / LL * ln * (rows / cols); Q.tx[jj] = Q.bx[jj] + ddx / LL * ln; Q.ty[jj] = Q.by[jj] + ddy / LL * ln * (rows / cols); Q.tv[jj] = 0; Q.te[jj] = A.e[s];
      }
      Q.n = n;
    }
    return Q;
  }
  function stepOf(key, f, kind, hold, dur) { return { key: key, f: f, kind: kind, hold: hold, dur: dur }; }
  function finalStep() { return stepOf('mask', maskF, 'word', 1e9, WORD_MORPH); }
  function setSeq(s, gustedAll) {
    SEQ = s; PARTS = s.map(function () { return null; }); PAIRS = s.map(function () { return null; }); gusted = s.map(function () { return !!gustedAll; });
    settledAt = -1; SP = null; computeGate();
  }
  function computeGate() {
    // the word waits for the display face; the picture never does
    gateAt = -1; var acc = 0;
    for (var k = 0; k < SEQ.length; k++) {
      if (SEQ[k].key === 'mask' && !SEQ[k].f) { gateAt = k === 0 ? 0 : Math.max(0, acc - SEQ[k - 1].dur - 0.001); return; }
      acc += SEQ[k].hold + SEQ[k].dur;
    }
  }
  function sequence() {
    var s = [], picOn = pic && showPic;
    if (plate) {   // a veil gathers its photograph and settles; a still just holds
      if (pic && !reduce && !still) s.push(stepOf(null, null, 'pic', 0, PLATE_GATHER));
      s.push(stepOf(pic ? 'pic' : 'mask', pic || maskF, pic ? 'pic' : 'word', 1e9, MORPH));
      setSeq(s); return;
    }
    if (reduce) {   // designed, not frozen: the picture as a still, then a short dissolve to the word
      if (picOn) s.push(stepOf('pic', pic, 'pic', RM_HOLD, RM_FADE));
      s.push(finalStep()); setSeq(s); return;
    }
    if (layers && picOn) s.push({ key: null, f: null, kind: 'pic', hold: 0, dur: LAYER_GATHER, mode: 'layers' });
    else if (fromRect) {
      var r = c.getBoundingClientRect();
      s.push({ key: null, f: null, kind: picOn ? 'pic' : 'word', hold: 0, dur: GATHER * 1.15, mode: 'rect', rect: { x: (fromRect.x - r.left) / cell, y: (fromRect.y - r.top) / cell, w: fromRect.w / cell, h: fromRect.h / cell } });
    }
    else if (picPrev) s.push(stepOf('prev', picPrev, 'pic', 0, GATHER));   // the previous page's glyph is where the bodies start
    else s.push(stepOf(null, null, picOn ? 'pic' : 'word', 0, GATHER));
    fromRect = null;   // one hop
    if (picOn) s.push(stepOf('pic', pic, 'pic', PIC_HOLD, MORPH));
    s.push(finalStep());
    setSeq(s);
  }
  function partsAt(k) { return PARTS[k] || (PARTS[k] = makeParticles(SEQ[k])); }
  function pairsAt(k) { return PAIRS[k] || (PAIRS[k] = makePairs(partsAt(k), partsAt(k + 1), SEQ[k])); }
  function eio(x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }
  function eo(x) { return 1 - Math.pow(1 - x, 3); }
  function fireSettled() {
    if (api.onSettled) { try { api.onSettled(); } catch (e) {} }
    try { c.dispatchEvent(new CustomEvent('mx:settled', { bubbles: true, detail: { word: word, plate: plate } })); } catch (e) {}
  }

  // ── drawing ─────────────────────────────────────────────────────────────
  var dashW = 1.2, sq = 1, fillDot = 1, fillIn = 1;
  function emitParts(P, sp) {
    for (var i = 0; i < P.n; i++) {
      var hx = P.hx[i], hy = P.hy[i], val = P.v[i], iy = hy < 0 ? 0 : hy >= rows ? rows - 1 : hy | 0, ix = hx < 0 ? 0 : hx >= cols ? cols - 1 : hx | 0;
      var off = (flowAt(vx, hx, hy) * F + A[iy] * B[ix]) * cell;
      var isW = P.kind === 'word', ww = isW ? sq * (0.6 + 0.4 * val) : dashW * (0.85 + 0.6 * P.e[i]);
      var hh = isW ? ww : cell * (0.2 + 0.9 * val) * (0.78 + 0.22 * P.e[i]);
      var PX = hx * cell + (cell - ww) / 2 + off, PY = hy * cell + (cell - hh) / 2 + off * 0.4;
      if (isW) { RI[nI++] = PX; RI[nI++] = PY; RI[nI++] = ww; RI[nI++] = hh; }
      else { RA[nA++] = PX; RA[nA++] = PY; RA[nA++] = ww; RA[nA++] = hh; }
    }
  }
  function emitMorph(Q, u, lay) {
    for (var j = 0; j < Q.n; j++) {
      var st = Q.t[j], tj, x, y, mix, alpha = 1;
      if (Q.direct) {   // scroll-driven: straight, deterministic, reversible
        tj = clamp01((u - 0.35 * st) / 0.65); mix = smooth(tj);
        x = Q.sx[j] + (Q.tx[j] - Q.sx[j]) * mix; y = Q.sy[j] + (Q.ty[j] - Q.sy[j]) * mix;
        if (Q.die && Q.die[j]) alpha = 1 - mix;
      } else if (lay) {
        tj = clamp01((u - 0.8 * Q.dl[j]) / 0.2); if (tj <= 0) continue;
        mix = eo(tj); x = Q.sx[j] + (Q.tx[j] - Q.sx[j]) * mix; y = Q.ty[j];
      } else {
        tj = clamp01((u - 0.12 * st) / 0.88);
        if (Q.gather) { var g = eio(tj); x = Q.sx[j] + (Q.tx[j] - Q.sx[j]) * g; y = Q.sy[j] + (Q.ty[j] - Q.sy[j]) * g; mix = g; }
        else {
          var ex = eo(Math.min(1, tj / EXPLODE)), cv = eio(Math.max(0, (tj - 0.22) / 0.78));
          var px = Q.sx[j] + (Q.bx[j] - Q.sx[j]) * ex, py = Q.sy[j] + (Q.by[j] - Q.sy[j]) * ex;
          if (Q.scatter || (Q.die && Q.die[j])) { x = px + (Q.tx[j] - Q.bx[j]) * cv; y = py + (Q.ty[j] - Q.by[j]) * cv; mix = 0; alpha = 1 - clamp01((tj - 0.15) / 0.55); }
          else { x = px + (Q.tx[j] - px) * cv; y = py + (Q.ty[j] - py) * cv; mix = cv; }
        }
      }
      if (alpha <= 0.02) continue;
      // a body in the air takes the wind: the flow at its position adds to a
      // drift that persists through the flight and bleeds off as it lands
      if (!Q.direct && !lay && mix < 0.999) { Q.ax[j] += flowAt(vx, x, y) * F * 0.22; Q.ay[j] += flowAt(vy, x, y) * F * 0.22; }
      x += Q.ax[j] * (1 - mix); y += Q.ay[j] * (1 - mix);
      var v = Q.sv[j] * (1 - mix) + Q.tv[j] * mix; if (v < 0.04 && !Q.gather) continue;
      var kA = Q.skd ? (Q.skd[j] ? 'word' : 'pic') : Q.sk, kB = Q.scatter ? kA : Q.tk;
      var wA = kA === 'pic' ? dashW * (0.85 + 0.6 * Q.se[j]) : sq * (0.6 + 0.4 * Q.sv[j]);
      var hA = kA === 'pic' ? cell * (0.2 + 0.9 * Q.sv[j]) * (0.78 + 0.22 * Q.se[j]) : wA;
      var wB = kB === 'pic' ? dashW * (0.85 + 0.6 * Q.te[j]) : sq * (0.6 + 0.4 * Q.tv[j]);
      var hB = kB === 'pic' ? cell * (0.2 + 0.9 * Q.tv[j]) * (0.78 + 0.22 * Q.te[j]) : wB;
      if (kB === 'word' && kA !== 'word' && !Q.direct) { var pop = 1 + 0.18 * Math.sin(Math.PI * clamp01((mix - 0.45) / 0.55)); wB *= pop; hB *= pop; }
      var w = wA * (1 - mix) + wB * mix, h = hA * (1 - mix) + hB * mix;
      if (Q.s0) { var sc = Q.s0 + (1 - Q.s0) * mix; w *= sc; h *= sc; }
      if (h < 0.5) continue;
      var ox = (flowAt(vx, x, y) * F + A[Math.min(rows - 1, Math.max(0, y | 0))] * B[Math.min(cols - 1, Math.max(0, x | 0))]) * cell;
      var X = x * cell + (cell - w) / 2 + ox, Y = y * cell + (cell - h) / 2;
      var toInk = ((mix + (st - 0.5) * 0.3) < 0.5 ? kA : kB) === 'word';
      if (alpha < 1) { RD = grow(RD, nD + 6); RD[nD++] = X; RD[nD++] = Y; RD[nD++] = w; RD[nD++] = h; RD[nD++] = alpha; RD[nD++] = toInk ? 1 : 0; }
      else if (toInk) { RI = grow(RI, nI + 4); RI[nI++] = X; RI[nI++] = Y; RI[nI++] = w; RI[nI++] = h; }
      else { RA = grow(RA, nA + 4); RA[nA++] = X; RA[nA++] = Y; RA[nA++] = w; RA[nA++] = h; }
    }
  }
  function emitFill(fillMask) {
    // filler: the band is always a full rectangle
    if (!(fillIn > 0) || !fillMask || noFill) return;
    for (var fy = 0; fy < rows; fy++) { var ay = A[fy], sr = SR[fy] * amp, cr = CR[fy] * amp; for (var fx = 0; fx < cols; fx++) { var fi = fy * cols + fx; if (!fillMask[fi]) continue;
      var fd = fillDot * (0.7 + 0.5 * th[fi]) * (0.85 + 0.15 * (sr * CC[fx] + cr * SC[fx])), fo = (flowAt(vx, fx, fy) * F + ay * B[fx]) * cell * 0.3;
      RF[nF++] = fx * cell + (cell - fd) / 2 + fo; RF[nF++] = fy * cell + (cell - fd) / 2; RF[nF++] = fd; } }
  }
  function paint(list, n, col, alpha, square) {
    if (!n || alpha <= 0) return; ctx.fillStyle = col; ctx.globalAlpha = alpha; ctx.beginPath();
    if (square) for (var q = 0; q < n; q += 3) ctx.rect(list[q], list[q + 1], list[q + 2], list[q + 2]);
    else for (var q2 = 0; q2 < n; q2 += 4) ctx.rect(list[q2], list[q2 + 1], list[q2 + 2], list[q2 + 3]);
    ctx.fill();
  }
  function paintAll(m, inkCol, accent, fillCol) {
    paint(RF, nF, fillCol, 0.13 * fillIn * m, true);
    paint(RA, nA, accent, 0.95 * m, false);
    paint(RI, nI, inkCol, 0.92 * m, false);
    for (var z = 0; z < nD; z += 6) { ctx.globalAlpha = 0.95 * RD[z + 4] * m; ctx.fillStyle = RD[z + 5] ? inkCol : accent; ctx.fillRect(RD[z], RD[z + 1], RD[z + 2], RD[z + 3]); }
  }
  function frame(now, force) {
    raf = 0;
    if (dead || !SEQ.length || !cols) return;
    if (!visible && !force) { dirty = true; return; }   // nothing is drawn for a band nobody can see
    dirty = false;
    var dt = lastNow ? Math.min(0.1, Math.max(0, (now - lastNow) / 1000)) : 0.016; lastNow = now;
    var el = (now - t0) / 1000;
    if (!fontReady && gateAt >= 0 && el > gateAt) { t0 = now - gateAt * 1000; el = gateAt; }
    var k = 0, u = 0, tt = el, morphing = false;
    while (k < SEQ.length - 1) {
      if (tt < SEQ[k].hold) break;
      tt -= SEQ[k].hold; var d = SEQ[k].dur;
      if (tt < d) { morphing = true; u = tt / d; break; }
      tt -= d; k++;
    }
    curK = k;
    var last = k === SEQ.length - 1 && !morphing, fin = SEQ[SEQ.length - 1];
    if (last && settledAt < 0) { settledAt = now; if (!plate && fin.f) fireSettled(); }
    var idleNow = !plate && (reduce || (last && !previewing && now - Math.max(settledAt, lastAct) > IDLE_AFTER * 1000));
    var ampT = idleNow || reduce ? 0 : 1;
    if (reduce) amp = 0; else amp += Math.max(-dt / AMP_FADE, Math.min(dt / AMP_FADE, ampT - amp));
    var energy = reduce ? 0 : stepFlow();
    // scroll dissolve: the settled word slides back toward the picture's dashes as the band leaves
    if (scrollFlag) { scrollFlag = false; var br = c.getBoundingClientRect(); scrollP = clamp01((-br.top) / Math.max(1, br.height * 0.85)); }
    var picAny = curPic();
    var sp = (!reduce && !plate && last && fin.key === 'mask' && fin.f && picAny && !previewing) ? scrollP : 0;
    ctx.clearRect(0, 0, W, H);
    var th_ = themeColors(), inkCol = th_.ink, accent = th_.accent, fillCol = veil ? '#FCFBFA' : inkCol;
    fillIn = reduce ? 1 : Math.min(1, (now - tStart) / 1000 / FILL_IN);
    var t = now / 1000, amb = (SEQ[k].kind === 'pic' ? 0.9 : 0.25) * amp;
    for (var yy = 0; yy < rows; yy++) A[yy] = amb * Math.sin(yy * 0.09 + t * 0.7);
    for (var xx = 0; xx < cols; xx++) B[xx] = Math.cos(xx * 0.05 - t * 0.45);
    dashW = Math.max(1.2, cell * 0.55); sq = cell * 0.7; fillDot = cell * 0.22;
    if (!SR) { SR = new Float32Array(rows); CR = new Float32Array(rows); SC = new Float32Array(cols); CC = new Float32Array(cols); for (var c2 = 0; c2 < cols; c2++) { SC[c2] = Math.sin(c2 * 0.05); CC[c2] = Math.cos(c2 * 0.05); } }
    for (var r2 = 0; r2 < rows; r2++) { SR[r2] = Math.sin(t * 0.6 + r2 * 0.09); CR[r2] = Math.cos(t * 0.6 + r2 * 0.09); }
    nI = nA = nF = nD = 0;
    var lay = null;
    if (reduce && morphing) {
      // an opacity dissolve between two stills
      var P0 = partsAt(k), P1 = partsAt(k + 1);
      emitParts(P0); emitFill(P0.fill); paintAll(1 - u, inkCol, accent, fillCol);
      nI = nA = nF = nD = 0; emitParts(P1); emitFill(P1.fill); paintAll(u, inkCol, accent, fillCol);
    } else {
      if (morphing) {
        var Q = pairsAt(k);
        if (!gusted[k] && !Q.gather) { gusted[k] = true; gust(gustDir); gustDir = -gustDir; }
        var uu = SEQ[k].ease ? SEQ[k].ease(u) : u;
        emitMorph(Q, uu, SEQ[k].mode === 'layers');
        emitFill(Q.fill);
        if (SEQ[k].mode === 'layers') lay = { v: Math.floor(clamp01(u / 0.8) * Q.span), a: 1, span: Q.span };
      } else if (sp > 0.001) {
        var Pk = partsAt(k);
        if (!picParts) picParts = makeParticles({ f: picAny, kind: 'pic' });
        if (!SP || SP.src !== Pk) { SP = makePairs(Pk, picParts, { mode: 'direct' }); SP.src = Pk; }
        emitMorph(SP, sp, false); emitFill(SP.fill);
      } else {
        var P = partsAt(k); emitParts(P); emitFill(P.fill);
      }
      if (SEQ[0].mode === 'layers' && k >= 1 && k <= 2 && PAIRS[0]) { var sp0 = PAIRS[0].span; lay = k === 1 ? { v: sp0, a: morphing ? 1 - u : 1 } : null; }
      paintAll(1, inkCol, accent, fillCol);
    }
    if (grain) {
      if (!idleNow && !reduce) { gfx = -((Math.random() * 256) | 0); gfy = -((Math.random() * 256) | 0); }   // grain holds still once the band is idle
      ctx.globalAlpha = 0.22; ctx.globalCompositeOperation = 'source-atop';
      for (var gy = gfy; gy < H; gy += 256) for (var gx = gfx; gx < W; gx += 256) ctx.drawImage(grain, gx, gy);
      ctx.globalCompositeOperation = 'source-over';
    }
    if (veil && picAny && picAny.bg) { ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'destination-over'; ctx.fillStyle = picAny.bg; ctx.fillRect(0, 0, W, H); ctx.globalCompositeOperation = 'source-over'; }
    if (lay && lay.a > 0.01) {
      var s4 = ('0000' + lay.v).slice(-4);
      ctx.globalAlpha = 0.6 * lay.a; ctx.fillStyle = inkCol; ctx.font = '400 11px "Geist Mono", ui-monospace, Menlo, monospace'; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
      ctx.fillText('L ' + s4, W - 12, H - 10);
    }
    ctx.globalAlpha = 1;
    if (force) return;
    // what next
    if (plate) {
      if (!settled && last && (still || reduce || el > PLATE_SETTLE)) { settled = true; fireSettled(); return; }
      raf = requestAnimationFrame(frame); return;
    }
    if (reduce) {
      if (morphing) { raf = requestAnimationFrame(frame); return; }
      if (k < SEQ.length - 1 && !(!fontReady && gateAt >= 0 && el >= gateAt - 0.002)) { clearTimeout(rmT); rmT = setTimeout(run, Math.max(16, (SEQ[k].hold - tt) * 1000)); }
      sleeping = true; return;
    }
    if (idleNow && amp <= 0 && energy < EPS && !scrollFlag) { sleeping = true; return; }   // the band is still: stop drawing
    raf = requestAnimationFrame(frame);
  }
  function run() {
    if (dead) return;
    cancelAnimationFrame(raf); raf = 0; clearTimeout(rmT); sleeping = false; lastNow = 0;
    if (!SEQ.length || !cols) return;
    if (!visible && !plate) { dirty = true; return; }   // resumes on intersect
    if (reduce) frame(performance.now()); else raf = requestAnimationFrame(frame);
  }
  function wake(force) {
    if (dead || !SEQ.length || !cols) return;
    if (plate) { if (force && settled) frame(performance.now(), true); return; }
    lastAct = performance.now();
    if (reduce) { if (force || dirty) run(); return; }
    if (sleeping || !raf) run();
  }

  // ── playing ─────────────────────────────────────────────────────────────
  function play() {
    // a fresh sequence from nothing: first load, long-press re-gather, plates
    if (dead) return;
    settled = false;   // a replay (resize, __repaintStills) must be allowed to settle again, or a still loops forever
    var G = measure();
    ensureFields(G, function () {
      if (dead) return;
      applyGrid(G);
      pic = img && showPic ? cache.pic : null; picPrev = prevImg ? cache.prev : null;
      maskF = maskFor(word);
      sequence(); t0 = tStart = performance.now(); run();
    });
  }
  function resetFrom(src, target, dur, ease) {
    // morph from whatever is on screen (a snapshot of the bodies) to a target
    var s0 = src || (SEQ.length ? SEQ[SEQ.length - 1] : null);
    if (src && src.parts) s0 = { key: 'snap', f: null, parts: src.parts, kind: src.parts.kind, hold: 0, dur: dur, ease: ease };
    else if (s0) s0 = { key: s0.key, f: s0.f, kind: s0.kind, hold: 0, dur: dur, ease: ease };
    var s = (s0 && (s0.f || s0.parts)) ? [s0] : [];
    if (s.length) s[0].dur = dur;
    return s.concat(target);
  }
  function snapStep() { var p = reduce ? null : snapshot(); return p ? { parts: p } : null; }
  function morphTo(target, dur) {
    if (reduce) { var fin = SEQ[SEQ.length - 1]; setSeq(fin && fin.f ? [stepOf(fin.key, fin.f, fin.kind, 0, RM_WORD), target] : [target]); }
    else setSeq(resetFrom(snapStep(), [target], dur));
    t0 = performance.now(); lastAct = t0; run();
  }
  function setWord(w) {
    word = String(w == null ? '' : w); showPic = false;
    if (!cols) return;   // not drawn yet: play() will use the new word
    maskF = maskFor(word);
    if (previewing) return;   // the preview holds; unpreview lands on the new word
    morphTo(finalStep(), WORD_MORPH);
  }
  function replay() {
    if (dead) return;
    if (plate || !cols || !SEQ.length) { showPic = true; return play(); }
    showPic = true; prevImg = null; picPrev = null; previewing = false;
    if (reduce) return toggle();
    var p0 = curPic();
    if (img && !p0) return play();
    pic = p0;
    var target = pic ? [stepOf('pic', pic, 'pic', PIC_HOLD, MORPH), finalStep()] : [finalStep()];
    var sn = snapStep();
    if (!sn) return play();
    setSeq(resetFrom(sn, target, GATHER));
    t0 = performance.now(); lastAct = t0; run();
  }
  function toggle() {
    // reduced motion: a click dissolves between the picture still and the word
    var fin = SEQ[SEQ.length - 1], p0 = curPic(); if (!fin || !p0) return;
    var toPic = fin.key !== 'pic', target = toPic ? stepOf('pic', p0, 'pic', 1e9, RM_FADE) : finalStep();
    setSeq([stepOf(fin.key, fin.f, fin.kind, 0, RM_FADE), target]); t0 = performance.now(); run();
  }
  function scatter(cb) {
    // the page is leaving: everything flies off the band (≈220 ms, ease-in), then the caller navigates
    cb = typeof cb === 'function' ? cb : function () {};
    if (dead || reduce || !cols || !SEQ.length || !visible || plate) { setTimeout(cb, 0); return; }
    var sn = snapStep(), cur = SEQ[Math.min(curK, SEQ.length - 1)]; if (!cur.f && !cur.parts) cur = SEQ[SEQ.length - 1];
    var kind = sn ? sn.parts.kind : cur.kind;
    setSeq(resetFrom(sn || cur, [stepOf(null, null, kind, 1e9, SCATTER)], SCATTER, EASE_IN), true);
    previewing = false; t0 = performance.now(); lastAct = t0; run(); setTimeout(cb, SCATTER * 1000 + 20);
  }
  function restore() {
    // back/forward cache: the settled word, instantly, no gather
    if (dead) return;
    if (!cols || !fontReady) { if (started) play(); return; }
    var G = measure(); if (G.W !== W || G.H !== H) applyGrid(G);
    previewing = false; maskF = maskFor(word);
    vx.fill(0); vy.fill(0);
    setSeq([finalStep()], true); t0 = performance.now(); settledAt = t0 - IDLE_AFTER * 1000 - 1; lastAct = 0; amp = 0; scrollFlag = true;
    run(); fireSettled();
  }
  function preview(w) {
    if (dead || !cols || !fontReady || plate || !SEQ.length) return;
    w = String(w == null ? '' : w); if (!w) return;
    previewing = true; pvWord = w;
    morphTo(stepOf('pv', maskFor(w), 'word', 1e9, PREVIEW), PREVIEW);
  }
  function unpreview() {
    if (!previewing || dead) return;
    previewing = false; pvWord = null; maskF = maskFor(word);
    morphTo(finalStep(), PREVIEW);
  }
  function onFont() {
    if (dead || fontReady) return;
    fontReady = true; masks = {};
    if (!cols || !SEQ.length) return;
    maskF = maskFor(word);
    for (var k = 0; k < SEQ.length; k++) if (SEQ[k].key === 'mask' && !SEQ[k].f) { SEQ[k].f = maskF; PARTS[k] = null; PAIRS[k] = null; if (k) PAIRS[k - 1] = null; }
    computeGate(); SP = null;
    if (reduce) run(); else wake();
  }
  function onResize() {
    // a size change never replays: rebuild the grid and carry on at the same moment
    if (dead || !started || !SEQ.length) return;
    var G = measure(); if (G.W === W && G.H === H) return;
    var el = performance.now() - t0;
    ensureFields(G, function () {
      if (dead) return;
      applyGrid(G);
      var pc = img ? cache.pic : null; pic = pic ? pc : null; picPrev = picPrev ? cache.prev : null; maskF = maskFor(word);
      var remap = function (s) {
        var f = s.key === 'pic' ? pc : s.key === 'prev' ? picPrev : s.key === 'mask' ? maskF : s.key === 'pv' ? maskFor(pvWord || word) : null;
        return { key: s.key, f: f, kind: s.kind, hold: s.hold, dur: s.dur, mode: s.mode, rect: s.rect, ease: s.ease };
      };
      var hasSnap = SEQ.some(function (s) { return s.parts || (s.key === 'pic' && !pc) || (s.key === 'prev' && !picPrev); });
      if (hasSnap) { var f0 = remap(SEQ[SEQ.length - 1]); f0.hold = 1e9; setSeq([f0], true); t0 = performance.now() - 1e4; settledAt = performance.now() - IDLE_AFTER * 1000 - 1; }
      else { var sa = settledAt; setSeq(SEQ.map(remap), true); t0 = performance.now() - el; if (sa >= 0) settledAt = sa; }
      if (reduce) run(); else if (visible) { lastNow = 0; cancelAnimationFrame(raf); raf = 0; sleeping = false; frame(performance.now()); } else dirty = true;
    });
  }

  // ── wiring ──────────────────────────────────────────────────────────────
  var L = [];   // [target, type, fn, opts] for destroy()
  function on(tg, ty, fn, o) { tg.addEventListener(ty, fn, o); L.push([tg, ty, fn, o]); }
  function clickReplay() { if (performance.now() - lpFired < 800) return; if (reduce) toggle(); else replay(); }
  if (!plate) {
    on(c, 'pointerenter', function () { wake(); });
    on(c, 'pointermove', function (e) {
      if (lpT && Math.hypot(e.clientX - lpX, e.clientY - lpY) > 10) { clearTimeout(lpT); lpT = 0; }
      if (!vx) return;
      var r = c.getBoundingClientRect(), x = (e.clientX - r.left) / (cell * F), y = (e.clientY - r.top) / (cell * F), now = performance.now();
      if (pmx >= 0 && !reduce) { var dt = Math.max(8, now - pmt) / 16.7; inject(x, y, (x - pmx) / dt, (y - pmy) / dt); }
      pmx = x; pmy = y; pmt = now; wake();
    });
    on(c, 'pointerleave', function () { pmx = pmy = -1; clearTimeout(lpT); lpT = 0; });
    on(c, 'click', clickReplay);
    // long press on touch: scatter, then gather again (never blocks the scroll: nothing is prevented)
    on(c, 'pointerdown', function (e) {
      if (e.pointerType === 'mouse' || reduce) return;
      lpX = e.clientX; lpY = e.clientY; clearTimeout(lpT);
      lpT = setTimeout(function () { lpT = 0; lpFired = performance.now(); scatter(function () { showPic = true; prevImg = null; picPrev = null; previewing = false; play(); }); }, LONG_PRESS);
    }, { passive: true });
    var lpEnd = function () { clearTimeout(lpT); lpT = 0; };
    on(c, 'pointerup', lpEnd); on(c, 'pointercancel', lpEnd);
    on(c, 'contextmenu', function (e) { if (lpT || performance.now() - lpFired < 900) e.preventDefault(); });
    var hint = c.parentElement && c.parentElement.querySelector('.hint');
    if (hint && hint.tagName !== 'BUTTON') {
      var b = document.createElement('button'); b.type = 'button'; b.className = hint.className; b.id = hint.id;
      var touch = matchMedia('(hover: none)').matches, verb = touch ? 'tap' : 'click';
      var isPic = !!(opts.src && !/\.svg(\?|$)/i.test(opts.src)) && !c.id;
      b.textContent = c.id === 'field' ? (touch ? 'tap to replay · type to rewrite' : 'move the cursor · type to rewrite') : verb + ' to replay · ' + (isPic ? 'picture' : 'glyph') + ' → text';
      b.setAttribute('aria-label', 'Replay the header animation'); hint.replaceWith(b); hint = b;
      on(hint, 'click', function () { if (reduce) toggle(); else replay(); });
    }
    if (window.ResizeObserver) { ro = new ResizeObserver(function () { clearTimeout(rsT); rsT = setTimeout(onResize, 120); }); ro.observe(c); }
    else on(window, 'resize', function () { clearTimeout(rsT); rsT = setTimeout(onResize, 120); });
    if (!reduce) on(window, 'scroll', function () { if (lpT) { clearTimeout(lpT); lpT = 0; } if (!visible || dead || !SEQ.length) return; scrollFlag = true; if (!raf) raf = requestAnimationFrame(frame); }, { passive: true });
    on(window, 'pageshow', function (e) { if (e.persisted) restore(); });
    if ('IntersectionObserver' in window) {
      io = new IntersectionObserver(function (es) { es.forEach(function (e) {
        visible = e.isIntersecting;
        if (visible) { if (SEQ.length) { scrollFlag = true; if (dirty || !reduce) wake(true); } }
        else { cancelAnimationFrame(raf); raf = 0; sleeping = true; }
      }); }, { threshold: 0 });
      io.observe(c);
    }
  }
  function start() {
    if (dead) return;
    started = true;
    var imgDone = !opts.src, prevDone = !(opts.prev && !reduce && !plate), prevT = 0, went = false;
    function go() { if (went || dead) return; went = true; play(); }
    function maybe() {
      if (!imgDone) return;
      if (!prevDone) { if (!prevT) prevT = setTimeout(function () { prevDone = true; if (prevImg && !(prevImg.complete && prevImg.naturalWidth)) prevImg = null; maybe(); }, 250); return; }
      go();
    }
    // the picture starts as soon as it is in (reduced motion too: it is the still)
    if (opts.src) { img = new Image(); img.decoding = 'async'; img.onload = function () { imgDone = true; maybe(); }; img.onerror = function () { img = null; imgDone = true; maybe(); }; img.src = opts.src; }
    if (!prevDone) { prevImg = new Image(); prevImg.decoding = 'async'; prevImg.onload = function () { prevDone = true; maybe(); }; prevImg.onerror = function () { prevImg = null; prevDone = true; maybe(); }; prevImg.src = opts.prev; }
    maybe();
  }
  // only the word waits for the display face
  var FONT = '300 40px "Bricolage Grotesque"';
  try { fontReady = !document.fonts || document.fonts.check(FONT); } catch (e) { fontReady = true; }
  if (!fontReady) { setTimeout(onFont, 3000); try { document.fonts.load(FONT).then(onFont, onFont); } catch (e) { onFont(); } }
  start();

  function destroy() {
    if (dead) return; dead = true;
    cancelAnimationFrame(raf); raf = 0; clearTimeout(rmT); clearTimeout(rsT); clearTimeout(lpT); idleTok++;
    if (io) io.disconnect(); if (ro) ro.disconnect();
    L.forEach(function (l) { l[0].removeEventListener(l[1], l[2], l[3]); }); L = [];
    [window.__mx, window.__plates].forEach(function (arr) { if (!arr) return; var i = arr.indexOf(api); if (i >= 0) arr.splice(i, 1); });
    img = prevImg = null; cache = { key: '', pic: null, prev: null }; masks = {}; SEQ = []; PARTS = []; PAIRS = []; picParts = SP = null;
  }
  var api = {
    setWord: setWord, replay: replay, scatter: scatter, restore: restore, destroy: destroy, wake: wake, preview: preview, unpreview: unpreview,
    visible: function () { return visible; },
    get word() { return word; },
    get fields() { return { pic: pic, prev: picPrev, mask: maskF, cols: cols, rows: rows }; },
    get state() { return { sleeping: sleeping, visible: visible, raf: !!raf, k: curK, n: SEQ.length, settled: settledAt >= 0, amp: amp, previewing: previewing, dead: dead, fontReady: fontReady }; },
    // seek(seconds): draw the band as it looks that far into its sequence, once
    seek: function (s) { if (dead || !SEQ.length) return; cancelAnimationFrame(raf); raf = 0; t0 = performance.now() - s * 1000; frame(performance.now(), true); sleeping = true; }
  };
  if (plate) (window.__plates = window.__plates || []).push(api); else (window.__mx = window.__mx || []).push(api);
  return api;
}
