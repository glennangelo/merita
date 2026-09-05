/* Text size control.
   Remembers the visitor's choice in this browser so they only set it once.
   The buttons stay hidden unless JavaScript runs, so nothing on the page is
   broken or dead for someone without it. */
(function () {
  var KEY = 'memorial:textsize';
  var root = document.documentElement;
  var control = document.querySelector('[data-textsize-control]');

  function apply(size) {
    root.setAttribute('data-textsize', size);
    if (!control) return;
    control.querySelectorAll('button[data-size]').forEach(function (btn) {
      btn.setAttribute('aria-pressed', String(btn.dataset.size === size));
    });
  }

  var saved;
  try { saved = localStorage.getItem(KEY); } catch (e) { /* private mode */ }
  apply(saved === 'large' || saved === 'larger' ? saved : 'normal');

  if (!control) return;
  control.hidden = false;
  control.addEventListener('click', function (event) {
    var btn = event.target.closest('button[data-size]');
    if (!btn) return;
    apply(btn.dataset.size);
    try { localStorage.setItem(KEY, btn.dataset.size); } catch (e) { /* ignore */ }
  });
})();
