
// ── the matrix: picture → text, in cells ────────────────────────────────────
// One engine for every header. A cell grid over the canvas. Phase 1 (if a
// picture is given): the picture, sampled per cell as squares sized by
// luminance — a halftone. Phase 2: the squares dissolve into random hex.
// Phase 3: cells inside the text's letterform resolve left→right into solid
// squares; the rest fall back to a faint dot field. Hover un-resolves cells
// near the cursor; click replays from the picture. Reduced motion: text only.
var GRAIN = null;
function grainTile() { if (GRAIN) return GRAIN; GRAIN = document.createElement('canvas'); GRAIN.width = GRAIN.height = 256; var g = GRAIN.getContext('2d'), gd = g.createImageData(256, 256); for (var i = 0; i < gd.data.length; i += 4) { var v = 128 + (Math.random() * 90 - 45) | 0; gd.data[i] = gd.data[i + 1] = gd.data[i + 2] = v; gd.data[i + 3] = 255; } g.putImageData(gd, 0, 0); return GRAIN; }
// theme colours, read once per frame across all engines, refreshed when the theme changes
var THEME = { epoch: 0, at: -1, ink: '#161616', accent: '#FF5A1F' };
function themeColors(now) { if (THEME.epoch !== THEME.seen || now - THEME.at > 150) { THEME.seen = THEME.epoch; THEME.at = now; var cs = getComputedStyle(document.body); THEME.ink = cs.color || THEME.ink; THEME.accent = cs.getPropertyValue('--accent').trim() || THEME.accent; } return THEME; }

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
  var dpr = opts.plate ? 1 : Math.min(2, window.devicePixelRatio || 1);   // a 5 px dot screen does not need a 2x bitmap
  var W, H, cols, rows, cell, N, th, t0 = 0, raf = 0, word = opts.text, img = null, prevImg = null, showPic = true;
  var maskF = null, pic = null, picPrev = null;          // fields: {v: Float32Array, e: Float32Array|null}
  var fc, fr, F = 5, vx, vy, tmpx, tmpy, pmx = -1, pmy = -1, pmt = 0;   // flow grid, F fine cells per flow cell
  var GAIN = 1.4, DECAY = 0.94, DIFF = 0.11, MAXV = 2.4;                 // in flow cells
  var FILL_IN = 0.35, PREV_HOLD = 0.9, PIC_HOLD = 2.6, MORPH = 0.85, WORD_MORPH = 0.6;
  var grain = null, A = null, B = null, SR = null, CR = null, SC = null, CC = null, curK = 0;
  // scratch rectangles, reused every frame: [x,y,w,h]* for ink and accent, [x,y,d]* for filler, [x,y,w,h,alpha,ink]* for fades
  var RI = null, RA = null, RF = null, RD = null, nI = 0, nA = 0, nF = 0, nD = 0;
  function grow(b, need) { if (b.length >= need) return b; var nb = new Float32Array(Math.max(need, b.length * 2)); nb.set(b); return nb; }
  var fitPref = (c.dataset && c.dataset.fit) || opts.fit || null;
  var plate = !!opts.plate, still = !!opts.still, noFill = opts.filler === false, settled = false;
  var focus = [0.5, 0.5];
  if (c.dataset && c.dataset.focus) { var fp = c.dataset.focus.split(',').map(parseFloat); if (fp.length === 2 && !isNaN(fp[0]) && !isNaN(fp[1])) focus = fp; }
  function css(v) { return getComputedStyle(document.body).getPropertyValue(v).trim(); }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function smooth(v) { v = clamp01(v); return v * v * (3 - 2 * v); }

  function buildGrid() {
    var r = c.getBoundingClientRect();
    W = Math.max(1, Math.floor(r.width)); H = Math.max(1, Math.floor(r.height));
    c.width = W * dpr; c.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cell = opts.cell || (W < 640 ? 5 : 4);   // coarser on a phone, not finer
    cols = Math.floor(W / cell); rows = Math.floor(H / cell); N = cols * rows;
    th = new Float32Array(N); for (var i = 0; i < N; i++) th[i] = Math.random();
    fc = Math.ceil(cols / F) + 1; fr = Math.ceil(rows / F) + 1;
    vx = new Float32Array(fc * fr); vy = new Float32Array(fc * fr); tmpx = new Float32Array(fc * fr); tmpy = new Float32Array(fc * fr);
    A = new Float32Array(rows); B = new Float32Array(cols); SR = null;
    var N0 = cols * rows; RI = new Float32Array(N0 * 4); RA = new Float32Array(N0 * 4); RF = new Float32Array(N0 * 3); RD = new Float32Array(N0 * 6);
    grain = grainTile();
  }
  function buildMask(w) {
    // one cap height for every word, so "Wave" and "SecMCPHub" sit in the same
    // band at the same size; only a word that would overflow shrinks
    var m = document.createElement('canvas'); m.width = cols; m.height = rows;
    var mc = m.getContext('2d');
    mc.fillStyle = '#000'; mc.textBaseline = 'middle'; mc.textAlign = 'center';
    var fs = rows * 0.62, font = function (s) { return '300 ' + s + 'px "Bricolage Grotesque", Geist, Helvetica, Arial, sans-serif'; };
    mc.font = font(fs);
    var mw = mc.measureText(w).width; if (mw > cols * 0.92) { fs = Math.max(8, Math.floor(fs * (cols * 0.92) / mw)); mc.font = font(fs); }
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
  function flowAt(f, x, y) {
    if (x < 0 || y < 0 || x > cols - 1 || y > rows - 1) return 0;   // bodies born beyond the band read no wind
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
  // ── particles ───────────────────────────────────────────────────────────
  // Every drawn cell is a body with a home. A change of picture is not an
  // interpolation in place: the bodies explode outward from the centre and
  // are drawn back to their new homes, paired by angle so each one flies out
  // and returns along its own bearing. The first picture gathers in from
  // beyond the band's edges; leaving a page scatters it.
  var SEQ = [], PARTS = [], PAIRS = [], gusted = [], gustDir = 1;
  var GATHER = 1.05, EXPLODE = 0.32, SCATTER = 0.34;
  function makeParticles(st) {
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
  function byAngle(P) {
    if (P._idx) return P._idx;
    var cx = cols / 2, cy = rows / 2, idx = new Array(P.n), key = new Float32Array(P.n), sq = rows / cols;
    for (var i = 0; i < P.n; i++) { idx[i] = i; key[i] = Math.atan2(P.hy[i] - cy, (P.hx[i] - cx) * sq) + 0.003 * Math.hypot(P.hx[i] - cx, P.hy[i] - cy); }
    idx.sort(function (a, b) { return key[a] - key[b]; }); P._idx = idx; return idx;
  }
  function makePairs(A, B) {
    var cx = cols / 2, cy = rows / 2, R = Math.hypot(cx, cy);
    var gather = A.n === 0, scatter = B.n === 0, n = scatter ? A.n : B.n;
    var Q = { n: n, gather: gather, scatter: scatter, sk: A.kind, tk: B.kind,
      sx: new Float32Array(n), sy: new Float32Array(n), sv: new Float32Array(n), se: new Float32Array(n),
      tx: new Float32Array(n), ty: new Float32Array(n), tv: new Float32Array(n), te: new Float32Array(n),
      bx: new Float32Array(n), by: new Float32Array(n), t: new Float32Array(n), fill: new Uint8Array(N),
      ax: new Float32Array(n), ay: new Float32Array(n) };   // momentum picked up from the flow field while in the air
    for (var c = 0; c < N; c++) Q.fill[c] = A.fill[c] & B.fill[c];
    var ia = A.n ? byAngle(A) : null, ib = B.n ? byAngle(B) : null;
    for (var j = 0; j < n; j++) {
      var a = scatter ? j : (gather ? -1 : ia[Math.floor(j * A.n / B.n)]), b = scatter ? -1 : ib[j];
      var srcI = scatter ? ia[j] : a;
      if (srcI >= 0) { Q.sx[j] = A.hx[srcI]; Q.sy[j] = A.hy[srcI]; Q.sv[j] = A.v[srcI]; Q.se[j] = A.e[srcI]; Q.t[j] = A.t[srcI]; }
      if (b >= 0) { Q.tx[j] = B.hx[b]; Q.ty[j] = B.hy[b]; Q.tv[j] = B.v[b]; Q.te[j] = B.e[b]; if (srcI < 0) Q.t[j] = B.t[b]; }
      if (gather) {
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
      var grow = function (arr, more) { var o = new Float32Array(arr.length + more); o.set(arr); return o; };
      var base = n; n += extra.length;
      ['sx', 'sy', 'sv', 'se', 'tx', 'ty', 'tv', 'te', 'bx', 'by', 't', 'ax', 'ay'].forEach(function (key) { Q[key] = grow(Q[key], extra.length); });
      Q.die = new Uint8Array(n);
      for (var q = 0; q < extra.length; q++) {
        var s = extra[q], jj = base + q; Q.die[jj] = 1;
        Q.sx[jj] = A.hx[s]; Q.sy[jj] = A.hy[s]; Q.sv[jj] = A.v[s]; Q.se[jj] = A.e[s]; Q.t[jj] = A.t[s];
        var ddx = A.hx[s] - cx, ddy = (A.hy[s] - cy) * (cols / rows), LL = Math.hypot(ddx, ddy) || 1, ln = R * 0.6 * (0.5 + A.t[s]);
        Q.bx[jj] = A.hx[s] + ddx / LL * ln; Q.by[jj] = A.hy[s] + ddy / LL * ln * (rows / cols); Q.tx[jj] = Q.bx[jj] + ddx / LL * ln; Q.ty[jj] = Q.by[jj] + ddy / LL * ln * (rows / cols); Q.tv[jj] = 0; Q.te[jj] = A.e[s];
      }
      Q.n = n;
    }
    return Q;
  }
  function sequence() {
    var s = [];
    if (plate) {   // a plate gathers its photograph, holds, and is then lifted away; a still just holds
      if (pic && !reduce && !still) s.push({ f: null, kind: 'pic', hold: 0, dur: GATHER });
      s.push({ f: pic || maskF, kind: pic ? 'pic' : 'word', hold: 1e9, dur: MORPH });
      SEQ = s; PARTS = s.map(function () { return null; }); PAIRS = s.map(function () { return null; }); gusted = s.map(function () { return false; }); return;
    }
    if (!reduce) s.push({ f: null, kind: (picPrev ? 'pic' : (pic && showPic ? 'pic' : 'word')), hold: 0, dur: GATHER });   // the gather
    if (picPrev && !reduce) s.push({ f: picPrev, kind: 'pic', hold: PREV_HOLD, dur: MORPH });
    if (pic && showPic && !reduce) s.push({ f: pic, kind: 'pic', hold: PIC_HOLD, dur: MORPH });
    s.push({ f: maskF, kind: 'word', hold: 1e9, dur: WORD_MORPH });
    SEQ = s; PARTS = s.map(function () { return null; }); PAIRS = s.map(function () { return null; }); gusted = s.map(function () { return false; });
  }
  function partsAt(k) { return PARTS[k] || (PARTS[k] = makeParticles(SEQ[k])); }
  function pairsAt(k) { return PAIRS[k] || (PAIRS[k] = makePairs(partsAt(k), partsAt(k + 1))); }
  function eio(x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }
  function eo(x) { return 1 - Math.pow(1 - x, 3); }
  function frame(now) {
    var el = (now - t0) / 1000;
    ctx.clearRect(0, 0, W, H);
    var th_ = themeColors(now), inkCol = th_.ink, accent = th_.accent;
    if (!reduce) stepFlow();
    var k = 0, u = 0, tt = el, morphing = false;
    while (k < SEQ.length - 1) {
      if (tt < SEQ[k].hold) break;
      tt -= SEQ[k].hold; var d = SEQ[k].dur;
      if (tt < d) { morphing = true; u = tt / d; break; }
      tt -= d; k++;
    }
    if (reduce) { k = SEQ.length - 1; morphing = false; }
    curK = k;
    var fillIn = reduce ? 1 : Math.min(1, el / FILL_IN);
    var t = now / 1000;
    var amb = SEQ[k].kind === 'pic' ? 0.9 : 0.25;
    for (var yy = 0; yy < rows; yy++) A[yy] = amb * Math.sin(yy * 0.09 + t * 0.7);
    for (var xx = 0; xx < cols; xx++) B[xx] = Math.cos(xx * 0.05 - t * 0.45);
    var dashW = Math.max(1.2, cell * 0.55), sq = cell * 0.7, fillDot = cell * 0.22;
    if (!SR) { SR = new Float32Array(rows); CR = new Float32Array(rows); SC = new Float32Array(cols); CC = new Float32Array(cols); for (var c2 = 0; c2 < cols; c2++) { SC[c2] = Math.sin(c2 * 0.05); CC[c2] = Math.cos(c2 * 0.05); } }
    for (var r2 = 0; r2 < rows; r2++) { SR[r2] = Math.sin(t * 0.6 + r2 * 0.09); CR[r2] = Math.cos(t * 0.6 + r2 * 0.09); }
    nI = nA = nF = nD = 0;
    var fillMask;
    if (morphing) {
      var Q = pairsAt(k);
      if (!gusted[k] && !Q.gather) { gusted[k] = true; gust(gustDir); gustDir = -gustDir; }
      fillMask = Q.fill;
      for (var j = 0; j < Q.n; j++) {
        var st = Q.t[j], tj = Math.min(1, Math.max(0, (u - 0.12 * st) / 0.88)), x, y, mix, alpha = 1;
        if (Q.gather) { var g = eio(tj); x = Q.sx[j] + (Q.tx[j] - Q.sx[j]) * g; y = Q.sy[j] + (Q.ty[j] - Q.sy[j]) * g; mix = g; }
        else {
          var ex = eo(Math.min(1, tj / EXPLODE)), cv = eio(Math.max(0, (tj - 0.22) / 0.78));
          var px = Q.sx[j] + (Q.bx[j] - Q.sx[j]) * ex, py = Q.sy[j] + (Q.by[j] - Q.sy[j]) * ex;
          if (Q.scatter || (Q.die && Q.die[j])) { x = px + (Q.tx[j] - Q.bx[j]) * cv; y = py + (Q.ty[j] - Q.by[j]) * cv; mix = 0; alpha = 1 - Math.min(1, Math.max(0, (tj - 0.15) / 0.55)); }
          else { x = px + (Q.tx[j] - px) * cv; y = py + (Q.ty[j] - py) * cv; mix = cv; }
        }
        if (alpha <= 0.02) continue;
        // a body in the air takes the wind: the flow at its position adds to a
        // drift that persists through the flight and bleeds off as it lands
        if (!reduce && mix < 0.999) { var fxw = flowAt(vx, x, y), fyw = flowAt(vy, x, y); Q.ax[j] += fxw * F * 0.22; Q.ay[j] += fyw * F * 0.22; }
        x += Q.ax[j] * (1 - mix); y += Q.ay[j] * (1 - mix);
        var v = Q.sv[j] * (1 - mix) + Q.tv[j] * mix; if (v < 0.04 && !Q.gather) continue;
        var kA = Q.sk, kB = Q.tk;
        var wA = kA === 'pic' ? dashW * (0.85 + 0.6 * Q.se[j]) : sq * (0.6 + 0.4 * Q.sv[j]);
        var hA = kA === 'pic' ? cell * (0.2 + 0.9 * Q.sv[j]) * (0.78 + 0.22 * Q.se[j]) : wA;
        var wB = kB === 'pic' ? dashW * (0.85 + 0.6 * Q.te[j]) : sq * (0.6 + 0.4 * Q.tv[j]);
        var hB = kB === 'pic' ? cell * (0.2 + 0.9 * Q.tv[j]) * (0.78 + 0.22 * Q.te[j]) : wB;
        if (kB === 'word' && kA !== 'word') { var pop = 1 + 0.18 * Math.sin(Math.PI * Math.min(1, Math.max(0, (mix - 0.45) / 0.55))); wB *= pop; hB *= pop; }
        var w = wA * (1 - mix) + wB * mix, h = hA * (1 - mix) + hB * mix; if (h < 0.5) continue;
        var ox = (flowAt(vx, x, y) * F + A[Math.min(rows - 1, Math.max(0, y | 0))] * B[Math.min(cols - 1, Math.max(0, x | 0))]) * cell;
        var X = x * cell + (cell - w) / 2 + ox, Y = y * cell + (cell - h) / 2;
        var toInk = ((mix + (st - 0.5) * 0.3) < 0.5 ? kA : kB) === 'word';
        if (alpha < 1) { RD = grow(RD, nD + 6); RD[nD++] = X; RD[nD++] = Y; RD[nD++] = w; RD[nD++] = h; RD[nD++] = alpha; RD[nD++] = toInk ? 1 : 0; }
        else if (toInk) { RI = grow(RI, nI + 4); RI[nI++] = X; RI[nI++] = Y; RI[nI++] = w; RI[nI++] = h; }
        else { RA = grow(RA, nA + 4); RA[nA++] = X; RA[nA++] = Y; RA[nA++] = w; RA[nA++] = h; }
      }
    } else {
      var P = partsAt(k); fillMask = P.fill;
      for (var i = 0; i < P.n; i++) {
        var hx = P.hx[i], hy = P.hy[i], val = P.v[i];
        var off = (flowAt(vx, hx, hy) * F + A[hy] * B[hx]) * cell;
        var isW = P.kind === 'word', ww = isW ? sq * (0.6 + 0.4 * val) : dashW * (0.85 + 0.6 * P.e[i]);
        var hh = isW ? ww : cell * (0.2 + 0.9 * val) * (0.78 + 0.22 * P.e[i]);
        var PX = hx * cell + (cell - ww) / 2 + off, PY = hy * cell + (cell - hh) / 2 + off * 0.4;
        if (isW) { RI = grow(RI, nI + 4); RI[nI++] = PX; RI[nI++] = PY; RI[nI++] = ww; RI[nI++] = hh; }
        else { RA = grow(RA, nA + 4); RA[nA++] = PX; RA[nA++] = PY; RA[nA++] = ww; RA[nA++] = hh; }
      }
    }
    // filler: the band is always a full rectangle
    if (fillIn > 0 && fillMask && !noFill) for (var fy = 0; fy < rows; fy++) { var ay = A[fy]; for (var fx = 0; fx < cols; fx++) { var fi = fy * cols + fx; if (!fillMask[fi]) continue;
      var fd = fillDot * (0.7 + 0.5 * th[fi]) * (0.85 + 0.15 * (SR[fy] * CC[fx] + CR[fy] * SC[fx])), fo = (flowAt(vx, fx, fy) * F + ay * B[fx]) * cell * 0.3;
      RF = grow(RF, nF + 3); RF[nF++] = fx * cell + (cell - fd) / 2 + fo; RF[nF++] = fy * cell + (cell - fd) / 2; RF[nF++] = fd; } }
    function paint(list, n, col, alpha, square) {
      if (!n) return; ctx.fillStyle = col; ctx.globalAlpha = alpha; ctx.beginPath();
      if (square) for (var q = 0; q < n; q += 3) ctx.rect(list[q], list[q + 1], list[q + 2], list[q + 2]);
      else for (var q2 = 0; q2 < n; q2 += 4) ctx.rect(list[q2], list[q2 + 1], list[q2 + 2], list[q2 + 3]);
      ctx.fill();
    }
    paint(RF, nF, inkCol, 0.13 * fillIn, true);
    paint(RA, nA, accent, 0.95, false);
    paint(RI, nI, inkCol, 0.92, false);
    for (var z = 0; z < nD; z += 6) { ctx.globalAlpha = 0.95 * RD[z + 4]; ctx.fillStyle = RD[z + 5] ? inkCol : accent; ctx.fillRect(RD[z], RD[z + 1], RD[z + 2], RD[z + 3]); }
    if (grain && !reduce) { ctx.globalAlpha = 0.22; ctx.globalCompositeOperation = 'source-atop'; var gx0 = -((Math.random() * 256) | 0), gy0 = -((Math.random() * 256) | 0); for (var gy = gy0; gy < H; gy += 256) for (var gx = gx0; gx < W; gx += 256) ctx.drawImage(grain, gx, gy); ctx.globalCompositeOperation = 'source-over'; }
    ctx.globalAlpha = 1;
    if (plate && !settled && k === SEQ.length - 1 && !morphing && (still || reduce || el > GATHER + 0.45)) { settled = true; if (api.onSettled) api.onSettled(); raf = 0; return; }
    if (!reduce) raf = requestAnimationFrame(frame);
  }
  function run() { cancelAnimationFrame(raf); if (reduce) frame(performance.now()); else raf = requestAnimationFrame(frame); }
  function play() {
    buildGrid(); maskF = buildMask(word);
    picPrev = prevImg ? halftone(prevImg) : null; pic = (img && showPic) ? halftone(img) : null;
    sequence(); t0 = performance.now(); run();
  }
  function setWord(w) {
    word = w; showPic = false;
    if (!cols) return play();
    var cur = SEQ.length ? SEQ[SEQ.length - 1] : null; maskF = buildMask(w);
    if (reduce || !cur || !cur.f) { SEQ = [{ f: maskF, kind: 'word', hold: 1e9, dur: WORD_MORPH }]; }
    else SEQ = [{ f: cur.f, kind: cur.kind, hold: 0, dur: WORD_MORPH }, { f: maskF, kind: 'word', hold: 1e9, dur: WORD_MORPH }];
    PARTS = SEQ.map(function () { return null; }); PAIRS = SEQ.map(function () { return null; }); gusted = SEQ.map(function () { return false; });
    t0 = performance.now(); run();
  }
  function scatter(cb) {
    // the page is leaving: everything flies off the band, then the caller navigates
    if (reduce || !cols || !SEQ.length) { cb(); return; }
    var cur = SEQ[Math.min(curK, SEQ.length - 1)]; if (!cur.f) cur = SEQ[SEQ.length - 1];
    SEQ = [{ f: cur.f, kind: cur.kind, hold: 0, dur: SCATTER }, { f: null, kind: cur.kind, hold: 1e9, dur: SCATTER }];
    PARTS = SEQ.map(function () { return null; }); PAIRS = SEQ.map(function () { return null; }); gusted = [true, true];
    t0 = performance.now(); run(); setTimeout(cb, SCATTER * 1000 + 40);
  }
  if (!plate) {
    c.addEventListener('pointermove', function (e) {
      var r = c.getBoundingClientRect(), x = (e.clientX - r.left) / (cell * F), y = (e.clientY - r.top) / (cell * F), now = performance.now();
      if (pmx >= 0 && vx) { var dt = Math.max(8, now - pmt) / 16.7; inject(x, y, (x - pmx) / dt, (y - pmy) / dt); }
      pmx = x; pmy = y; pmt = now;
    });
    c.addEventListener('pointerleave', function () { pmx = pmy = -1; });
    c.addEventListener('click', function () { showPic = true; prevImg = null; play(); });
    var hint = c.parentElement && c.parentElement.querySelector('.hint');
    if (hint && hint.tagName !== 'BUTTON') {
      var b = document.createElement('button'); b.type = 'button'; b.className = hint.className; b.id = hint.id;
      var touch = matchMedia('(hover: none)').matches, verb = touch ? 'tap' : 'click';
      var isPic = !!(opts.src && !/\.svg(\?|$)/i.test(opts.src)) && !c.id;
      b.textContent = c.id === 'field' ? (touch ? 'tap to replay · type to rewrite' : 'move the cursor · type to rewrite') : verb + ' to replay · ' + (isPic ? 'picture' : 'glyph') + ' → text';
      b.setAttribute('aria-label', 'Replay the header animation'); hint.replaceWith(b); hint = b;
      hint.addEventListener('click', function () { showPic = true; prevImg = null; play(); });
    }
    var rt; addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(play, 120); });
  }
  function start() {
    if (reduce) { play(); return; }
    var pending = 0;
    function done() { if (--pending <= 0) play(); }
    if (opts.prev) { pending++; prevImg = new Image(); prevImg.onload = done; prevImg.onerror = function () { prevImg = null; done(); }; prevImg.src = opts.prev; }
    if (opts.src) { pending++; img = new Image(); img.onload = done; img.onerror = function () { img = null; done(); }; img.src = opts.src; }
    if (!pending) play();
  }
  if (document.fonts && document.fonts.load) Promise.all([document.fonts.load('300 40px "Bricolage Grotesque"'), document.fonts.load('400 12px "Geist Mono"')]).then(start, start); else start();
  if ('IntersectionObserver' in window && !plate) new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { if (!raf && !reduce) raf = requestAnimationFrame(frame); } else { cancelAnimationFrame(raf); raf = 0; } }); }, { threshold: 0 }).observe(c);
  var api = { setWord: setWord, replay: play, scatter: scatter, get word() { return word; }, get fields() { return { pic: pic, prev: picPrev, mask: maskF, cols: cols, rows: rows }; },
    // seek(seconds): draw the band as it looks that far into its sequence, once
    seek: function (s) { cancelAnimationFrame(raf); t0 = performance.now() - s * 1000; frame(performance.now()); cancelAnimationFrame(raf); raf = 0; } };
  if (plate) (window.__plates = window.__plates || []).push(api); else (window.__mx = window.__mx || []).push(api);
  return api;
}

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
    { t: 'Home', h: 'g h', u: 'index.html' }, { t: 'Digital', h: 'g d', u: 'digital.html' }, { t: 'Physical', h: 'g p', u: 'physical.html' }, { t: 'Project 1122', h: 'residence', u: '1122.html' }, { t: '3D prints', h: 'text → print', u: 'prints.html' }, { t: 'Wave panel', h: '3D prints', u: 'wave.html' }, { t: 'Security', h: 'g s', u: 'security.html' }, { t: 'Writing', h: 'g n', u: 'writing.html' }, { t: 'GitHub', h: 'g g', u: 'github.html' }, { t: 'About', h: 'g a', u: 'about.html' }, { t: 'Résumé', h: 'g r', u: 'resume.html' },
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
