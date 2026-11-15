// Four Walls, page-local: on phones each room's extra photographs sit in a snapping
// strip; this prints the strip's position and the current caption under it, and makes
// the plan stages (wider than a phone) keyboard-scrollable. Moved out of the page so
// the CSP carries only the two shared hashes.
(function () {
  var mq = window.matchMedia('(max-width: 760px)');
  [].forEach.call(document.querySelectorAll('.pt-stage'), function (st) {
    // the scroll cue under the plan: a rail whose thumb is the part of the plan in view
    var track = document.createElement('div'); track.className = 'pt-track'; track.setAttribute('aria-hidden', 'true');
    track.innerHTML = '<span class="pt-rail"><span class="pt-pos"></span></span><span class="pt-hint">Drag<svg width="16" height="8" viewBox="0 0 16 8"><path d="M1 4h14M4 1 1 4l3 3M12 1l3 3-3 3"/></svg></span>';
    st.parentNode.insertBefore(track, st.nextSibling);
    var pos = track.querySelector('.pt-pos'), raf = 0;
    function place() {
      var sw = st.scrollWidth, cw = st.clientWidth; if (!sw) return;
      var fits = sw <= cw + 1; track.hidden = fits; if (fits) return;
      pos.style.width = (100 * cw / sw).toFixed(2) + '%'; pos.style.left = (100 * st.scrollLeft / sw).toFixed(2) + '%';
    }
    st.addEventListener('scroll', function () { if (raf) return; raf = requestAnimationFrame(function () { raf = 0; place(); }); }, { passive: true });
    window.addEventListener('resize', place);
    [].forEach.call(st.querySelectorAll('img'), function (im) { if (!im.complete) im.addEventListener('load', place); });
    function m() { if (mq.matches) { st.setAttribute('tabindex', '0'); st.setAttribute('role', 'group'); st.setAttribute('aria-label', 'Floor plan, scroll sideways'); } else { st.removeAttribute('tabindex'); st.removeAttribute('role'); st.removeAttribute('aria-label'); } place(); }
    if (mq.addEventListener) mq.addEventListener('change', m); else mq.addListener(m); m();
  });
  function two(n) { return (n < 10 ? '0' : '') + n; }
  [].forEach.call(document.querySelectorAll('.sec.room .more'), function (strip) {
    var slides = [].slice.call(strip.querySelectorAll('figure.plate'));
    if (!slides.length) return;
    var total = parseInt(strip.getAttribute('data-count'), 10) || slides.length + 1;
    var offset = total - slides.length;
    var room = strip.closest('.sec.room'), key = room && room.querySelector('.k');
    var foot = document.createElement('div'); foot.className = 'strip-foot'; foot.setAttribute('aria-hidden', 'true');
    var num = document.createElement('span'); num.className = 'strip-n';
    var cap = document.createElement('span'); cap.className = 'strip-cap';
    foot.appendChild(num); foot.appendChild(cap);
    strip.parentNode.insertBefore(foot, strip.nextSibling);
    var cur = -1;
    function show(i) {
      if (i === cur) return; cur = i;
      num.textContent = slides.length > 1 ? two(offset + i + 1) + ' / ' + two(total) : two(offset + 1);   // a strip of one prints its number, not a position
      var t = slides[i].querySelector('figcaption .t') || slides[i].querySelector('figcaption');
      cap.textContent = t ? t.textContent : '';
    }
    function update() {
      var x = strip.scrollLeft, base = slides[0].offsetLeft, best = 0, bd = Infinity;
      for (var i = 0; i < slides.length; i++) { var d = Math.abs((slides[i].offsetLeft - base) - x); if (d < bd) { bd = d; best = i; } }
      show(best);
    }
    var raf = 0;
    strip.addEventListener('scroll', function () { if (raf) return; raf = requestAnimationFrame(function () { raf = 0; update(); }); }, { passive: true });
    function mode() {
      if (mq.matches) { strip.setAttribute('tabindex', '0'); strip.setAttribute('role', 'group'); strip.setAttribute('aria-label', (key ? key.textContent.trim() + ' · ' : '') + 'more photographs, scroll sideways'); }
      else { strip.removeAttribute('tabindex'); strip.removeAttribute('role'); strip.removeAttribute('aria-label'); }
      update();
    }
    if (mq.addEventListener) mq.addEventListener('change', mode); else mq.addListener(mode);
    mode();
  });
})();
