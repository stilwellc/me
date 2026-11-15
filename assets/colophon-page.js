// the colophon playground: a second engine, fed by the reader. Pick one of the site's marks or
// give it a picture (the file button, or drop one on the band) and watch it carve.
// loaded with a plain <script src> after engine.js and site.js (no inline script).
(function () {
  var c = document.getElementById('play'), file = document.getElementById('play-pic'), again = document.getElementById('play-again'), drop = document.getElementById('play-drop');
  if (!c || typeof matrix !== 'function') return;
  var chips = [].slice.call(document.querySelectorAll('.play-presets [data-src]'));
  var first = chips.filter(function (b) { return b.getAttribute('aria-pressed') === 'true'; })[0] || chips[0];
  var src = null, label = '', flat = false, last = null, blob = null, m = null;

  function build() {
    // tear the old engine down before the canvas is replaced, so its frame loop and listeners go with it
    if (m && typeof m.destroy === 'function') { try { m.destroy(); } catch (e) {} }
    var n = document.createElement('canvas'); n.id = 'play'; n.setAttribute('role', 'img');
    n.setAttribute('aria-label', label + ', drawn in the line screen');
    c.replaceWith(n); c = n;
    m = matrix(c, { src: src, prev: last && last !== src ? last : null, flat: flat, fit: flat ? 'contain' : null, focus: flat ? '0.5,1' : null });
    last = blob ? null : src;   // the next pick starts from this picture, as a page does
  }
  function press(el) { chips.forEach(function (b) { b.setAttribute('aria-pressed', b === el ? 'true' : 'false'); }); }
  function pick(b) {
    if (blob) { URL.revokeObjectURL(blob); blob = null; }
    src = b.getAttribute('data-src'); label = b.getAttribute('data-label') || b.textContent.trim(); flat = b.hasAttribute('data-flat');
    press(b); build();
  }
  function use(f) {
    if (!f || !/^image\//.test(f.type)) return;
    if (blob) URL.revokeObjectURL(blob);
    blob = src = URL.createObjectURL(f); label = 'Your picture'; flat = false;
    press(null); build();
  }

  if (first) pick(first);
  chips.forEach(function (b) { b.addEventListener('click', function () { pick(b); }); });
  if (file) file.addEventListener('change', function () { use(file.files && file.files[0]); file.value = ''; });
  if (again) again.addEventListener('click', function () { if (m && m.replay) m.replay(); });
  if (drop) {
    ['dragenter', 'dragover'].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
    ['dragleave', 'drop'].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
    drop.addEventListener('drop', function (e) { var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; use(f); });
  }
})();
