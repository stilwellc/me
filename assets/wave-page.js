// Wave panel page: the tile map is the picker, the plate under it shows the
// lit tile, and the 3D viewer (assets/wave3d.js) shows it or the full run.
// Moved out of the page so the site can run with script-src 'self'.
(function () {
  var TILES = {"v1": [{"id": "r0_c0", "stl": "assets/physical/wave/v1/wave_tile_r0_c0.stl", "img": "assets/physical/wave/v1/r0_c0.jpg", "kb": 533}, {"id": "r0_c1", "stl": "assets/physical/wave/v1/wave_tile_r0_c1.stl", "img": "assets/physical/wave/v1/r0_c1.jpg", "kb": 521}, {"id": "r0_c2", "stl": "assets/physical/wave/v1/wave_tile_r0_c2.stl", "img": "assets/physical/wave/v1/r0_c2.jpg", "kb": 461}, {"id": "r0_c3", "stl": "assets/physical/wave/v1/wave_tile_r0_c3.stl", "img": "assets/physical/wave/v1/r0_c3.jpg", "kb": 533}, {"id": "r0_c4", "stl": "assets/physical/wave/v1/wave_tile_r0_c4.stl", "img": "assets/physical/wave/v1/r0_c4.jpg", "kb": 533}, {"id": "r1_c0", "stl": "assets/physical/wave/v1/wave_tile_r1_c0.stl", "img": "assets/physical/wave/v1/r1_c0.jpg", "kb": 511}, {"id": "r1_c1", "stl": "assets/physical/wave/v1/wave_tile_r1_c1.stl", "img": "assets/physical/wave/v1/r1_c1.jpg", "kb": 520}, {"id": "r1_c2", "stl": "assets/physical/wave/v1/wave_tile_r1_c2.stl", "img": "assets/physical/wave/v1/r1_c2.jpg", "kb": 533}, {"id": "r1_c3", "stl": "assets/physical/wave/v1/wave_tile_r1_c3.stl", "img": "assets/physical/wave/v1/r1_c3.jpg", "kb": 533}, {"id": "r1_c4", "stl": "assets/physical/wave/v1/wave_tile_r1_c4.stl", "img": "assets/physical/wave/v1/r1_c4.jpg", "kb": 533}], "light": [{"id": "r0_c0", "stl": "assets/physical/wave/light/wave_tile_r0_c0.stl", "img": "assets/physical/wave/light/r0_c0.jpg", "kb": 428}, {"id": "r0_c1", "stl": "assets/physical/wave/light/wave_tile_r0_c1.stl", "img": "assets/physical/wave/light/r0_c1.jpg", "kb": 420}, {"id": "r0_c2", "stl": "assets/physical/wave/light/wave_tile_r0_c2.stl", "img": "assets/physical/wave/light/r0_c2.jpg", "kb": 378}, {"id": "r0_c3", "stl": "assets/physical/wave/light/wave_tile_r0_c3.stl", "img": "assets/physical/wave/light/r0_c3.jpg", "kb": 428}, {"id": "r0_c4", "stl": "assets/physical/wave/light/wave_tile_r0_c4.stl", "img": "assets/physical/wave/light/r0_c4.jpg", "kb": 428}, {"id": "r1_c0", "stl": "assets/physical/wave/light/wave_tile_r1_c0.stl", "img": "assets/physical/wave/light/r1_c0.jpg", "kb": 412}, {"id": "r1_c1", "stl": "assets/physical/wave/light/wave_tile_r1_c1.stl", "img": "assets/physical/wave/light/r1_c1.jpg", "kb": 419}, {"id": "r1_c2", "stl": "assets/physical/wave/light/wave_tile_r1_c2.stl", "img": "assets/physical/wave/light/r1_c2.jpg", "kb": 428}, {"id": "r1_c3", "stl": "assets/physical/wave/light/wave_tile_r1_c3.stl", "img": "assets/physical/wave/light/r1_c3.jpg", "kb": 428}, {"id": "r1_c4", "stl": "assets/physical/wave/light/wave_tile_r1_c4.stl", "img": "assets/physical/wave/light/r1_c4.jpg", "kb": 428}], "tasteful": [{"id": "r0_c0", "stl": "assets/physical/wave/tasteful/wave_tile_r0_c0.stl", "img": "assets/physical/wave/tasteful/r0_c0.jpg", "kb": 276}, {"id": "r0_c1", "stl": "assets/physical/wave/tasteful/wave_tile_r0_c1.stl", "img": "assets/physical/wave/tasteful/r0_c1.jpg", "kb": 299}, {"id": "r0_c2", "stl": "assets/physical/wave/tasteful/wave_tile_r0_c2.stl", "img": "assets/physical/wave/tasteful/r0_c2.jpg", "kb": 299}, {"id": "r0_c3", "stl": "assets/physical/wave/tasteful/wave_tile_r0_c3.stl", "img": "assets/physical/wave/tasteful/r0_c3.jpg", "kb": 299}, {"id": "r0_c4", "stl": "assets/physical/wave/tasteful/wave_tile_r0_c4.stl", "img": "assets/physical/wave/tasteful/r0_c4.jpg", "kb": 299}, {"id": "r0_c5", "stl": "assets/physical/wave/tasteful/wave_tile_r0_c5.stl", "img": "assets/physical/wave/tasteful/r0_c5.jpg", "kb": 275}, {"id": "r1_c0", "stl": "assets/physical/wave/tasteful/wave_tile_r1_c0.stl", "img": "assets/physical/wave/tasteful/r1_c0.jpg", "kb": 273}, {"id": "r1_c1", "stl": "assets/physical/wave/tasteful/wave_tile_r1_c1.stl", "img": "assets/physical/wave/tasteful/r1_c1.jpg", "kb": 299}, {"id": "r1_c2", "stl": "assets/physical/wave/tasteful/wave_tile_r1_c2.stl", "img": "assets/physical/wave/tasteful/r1_c2.jpg", "kb": 299}, {"id": "r1_c3", "stl": "assets/physical/wave/tasteful/wave_tile_r1_c3.stl", "img": "assets/physical/wave/tasteful/r1_c3.jpg", "kb": 299}, {"id": "r1_c4", "stl": "assets/physical/wave/tasteful/wave_tile_r1_c4.stl", "img": "assets/physical/wave/tasteful/r1_c4.jpg", "kb": 299}, {"id": "r1_c5", "stl": "assets/physical/wave/tasteful/wave_tile_r1_c5.stl", "img": "assets/physical/wave/tasteful/r1_c5.jpg", "kb": 274}]};
  var smooth = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  var label = function (id) { return id.replace('_', ' '); };          // r0_c0 → "r0 c0", one format everywhere

  var cells = Array.prototype.slice.call(document.querySelectorAll('.tm-cell'));
  var img = document.getElementById('tile-img'), cap = document.getElementById('tile-cap'), dl = document.getElementById('tile-dl');
  if (cells.length && img && window.Wave3D) {
    var fig = img.closest('figure'), v = new Wave3D.Viewer(fig, 'tasteful'), b1 = document.getElementById('tile-3d'), b2 = document.getElementById('run-3d'), mode = '', cur = 0;
    var pick = function (i) {
      var t = TILES.tasteful[i]; cur = i;
      img.src = t.img; img.alt = 'Tile ' + label(t.id) + ', studio render';
      cap.textContent = label(t.id) + ' \u00b7 ' + t.kb + ' KB';
      dl.href = t.stl; dl.textContent = 'Download ' + label(t.id) + ' STL';
      cells.forEach(function (c) { var on = +c.dataset.tile === i; c.classList.toggle('on', on); c.setAttribute('aria-pressed', on); });
      if (mode === 'tile') v.show([t]);
    };
    var set = function (m) {
      mode = m; b1.setAttribute('aria-pressed', m === 'tile'); b2.setAttribute('aria-pressed', m === 'run'); b1.classList.toggle('on', m === 'tile'); b2.classList.toggle('on', m === 'run');
      if (!m) { v.hide(); pick(cur); return; }
      if (m === 'tile') v.show([TILES.tasteful[cur]]); else { v.show(TILES.tasteful); cap.textContent = 'Full run \u00b7 twelve tiles \u00b7 3.5 MB'; }
      fig.scrollIntoView({ block: 'nearest', behavior: smooth });
    };
    cells.forEach(function (c) {
      c.addEventListener('click', function () {
        pick(+c.dataset.tile);
        fig.scrollIntoView({ block: 'nearest', behavior: smooth });
      });
    });
    b1.addEventListener('click', function () { set(mode === 'tile' ? '' : 'tile'); });
    b2.addEventListener('click', function () { set(mode === 'run' ? '' : 'run'); });
    pick(0);
    // the hero's "View in 3D" pill jumps here and opens the full run
    var hero = document.getElementById('hero-3d');
    if (hero) hero.addEventListener('click', function (e) { e.preventDefault(); if (mode !== 'run') set('run'); else fig.scrollIntoView({ block: 'center', behavior: smooth }); });
  }

  // the two earlier builds keep a small select of their own
  document.querySelectorAll('.wave-view').forEach(function (w) {
    if (!window.Wave3D) return;
    var key = w.dataset.build, i2 = w.querySelector('[data-role=img]'), c2 = w.querySelector('[data-role=cap]'),
        sel = w.querySelector('[data-role=sel]'), d2 = w.querySelector('[data-role=dl]'), run = i2.getAttribute('src');
    var fig2 = i2.closest('figure'), v2 = new Wave3D.Viewer(fig2, key), b3 = w.querySelector('[data-role=v3d]'), on3 = false;
    var show3 = function () { var i = parseInt(sel.value, 10); v2.show(i < 0 ? TILES[key] : [TILES[key][i]]); };
    b3.addEventListener('click', function () { on3 = !on3; b3.setAttribute('aria-pressed', on3); b3.classList.toggle('on', on3); if (on3) show3(); else v2.hide(); });
    sel.addEventListener('change', function () {
      if (on3) show3();
      var i = parseInt(sel.value, 10);
      if (i < 0) { i2.src = run; c2.textContent = 'Full run \u00b7 ' + TILES[key].length + ' tiles'; d2.setAttribute('aria-disabled', 'true'); d2.removeAttribute('href'); return; }
      var t = TILES[key][i]; i2.src = t.img; i2.alt = 'Tile ' + label(t.id) + ', studio render';
      c2.textContent = label(t.id) + ' \u00b7 ' + t.kb + ' KB';
      d2.href = t.stl; d2.removeAttribute('aria-disabled');
    });
  });
})();
