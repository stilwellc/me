// the colophon playground: a second engine, fed by the reader.
// loaded with a plain <script src> after engine.js and site.js (no inline script, CSP script-src 'self').
(function () {
  var c = document.getElementById('play'), inp = document.getElementById('play-word'), file = document.getElementById('play-pic'), again = document.getElementById('play-again');
  if (!c || typeof matrix !== 'function') return;
  var chips = [].slice.call(document.querySelectorAll('.play-presets [data-src]'));
  var word = (inp && inp.value.trim().slice(0, 14)) || 'Hello', src = null, label = null, blob = null, m = null;

  function build() {
    // tear the old engine down before the canvas is replaced, so its frame loop and listeners go with it
    if (m && typeof m.destroy === 'function') { try { m.destroy(); } catch (e) {} }
    var n = document.createElement('canvas'); n.id = 'play'; n.setAttribute('role', 'img');
    n.setAttribute('aria-label', (label ? label + ', decoded into the word ' : 'The word ') + word);
    c.replaceWith(n); c = n; m = matrix(c, { src: src, text: word });
  }
  function press(el) { chips.forEach(function (b) { b.setAttribute('aria-pressed', b === el ? 'true' : 'false'); }); }

  build();
  if (inp) inp.addEventListener('input', function () {
    var v = inp.value.trim().slice(0, 14); if (!v) return; word = v;
    if (m && m.setWord) m.setWord(word);
    c.setAttribute('aria-label', (label ? label + ', decoded into the word ' : 'The word ') + word);
  });
  chips.forEach(function (b) {
    b.addEventListener('click', function () {
      if (blob) { URL.revokeObjectURL(blob); blob = null; }
      src = b.getAttribute('data-src'); label = b.getAttribute('data-label') || b.textContent.trim();
      press(b); build();
    });
  });
  if (file) file.addEventListener('change', function () {
    var f = file.files && file.files[0]; if (!f || !/^image\//.test(f.type)) return;
    if (blob) URL.revokeObjectURL(blob);
    blob = src = URL.createObjectURL(f); label = 'Your picture';
    press(null); build();
  });
  if (again) again.addEventListener('click', function () { if (m && m.replay) m.replay(); });
})();
