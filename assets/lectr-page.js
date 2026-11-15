// lectr, page-local: the house roll is rewritten from the live feed with " · " between
// the names. Each separator stays with the name before it, so no line starts on a dot.
(function () {
  var el = document.getElementById('houses'); if (!el || !window.MutationObserver) return;
  function bind() {
    [].forEach.call(el.childNodes, function (n) {
      if (n.nodeType !== 3) return;
      var u = n.data.replace(/^\s+· /, ' · ');
      if (u !== n.data) n.data = u;
    });
  }
  new MutationObserver(bind).observe(el, { childList: true });
  bind();
})();
