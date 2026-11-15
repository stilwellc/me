// Soirée, page-local: the live list writes its times as "3 PM" and joins venue, town and
// time with " · ". The number and its meridiem are one word, and a separator stays with
// the word before it, so no line ends on "3" or starts on a dot.
(function () {
  var list = document.getElementById('tonight'); if (!list || !window.MutationObserver) return;
  function bind() {
    [].forEach.call(list.querySelectorAll('.v'), function (v) {
      var t = v.textContent, u = t.replace(/(\d) ([AP]M)\b/g, '$1 $2').replace(/ · /g, ' · ');
      if (u !== t) v.textContent = u;
    });
  }
  new MutationObserver(bind).observe(list, { childList: true });
  bind();
})();
