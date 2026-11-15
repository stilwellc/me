// the 404 is served at any depth, so it carries <base href="/me/"> for its assets and links.
// A base also re-points "#main" at the home page: keep in-page links in the page.
(function () {
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href^="#"]') : null; if (!a) return;
    var id = a.getAttribute('href').slice(1), t = id && document.getElementById(id); if (!t) return;
    e.preventDefault();
    if (!t.hasAttribute('tabindex')) t.setAttribute('tabindex', '-1');
    t.focus({ preventScroll: true }); t.scrollIntoView();
  });
})();
