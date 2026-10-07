(function () {
  var EXPLAIN = {
    older: 'Opens the older ChemVentur stages (0\u20132) in game-v118.html.'
  };
  function label(el) {
    return (el.innerText || el.getAttribute('aria-label') || el.id || 'button').replace(/\s+/g, ' ').trim();
  }
  function explain(el) {
    if (el.dataset && el.dataset.rxplanation) return el.dataset.rxplanation;
    if (el.id && EXPLAIN[el.id]) return EXPLAIN[el.id];
    var title = el.getAttribute('title');
    if (title && title !== 'Right-click for rxplanation') return title;
    return label(el) + ' \u2014 activates this control. Right-click any button to open its rxplanation.';
  }
  function ensureStyle() {
    if (document.getElementById('rxplanation-style')) return;
    var style = document.createElement('style');
    style.id = 'rxplanation-style';
    style.textContent = '#rxplanation{position:fixed;z-index:100000;display:none;max-width:320px;padding:10px 12px;background:#101820;color:#e8eef6;border:1px solid #3a5168;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.35);font:13px/1.4 Segoe UI,sans-serif}#rxplanation .rx-title{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#3dcaa0;margin-bottom:4px}#rxplanation .rx-close{margin-top:8px;background:#1e2a38;color:#e8eef6;border:1px solid #3a5168;border-radius:8px;padding:4px 8px;cursor:pointer}';
    document.head.appendChild(style);
  }
  function menu() {
    ensureStyle();
    var m = document.getElementById('rxplanation');
    if (m) return m;
    m = document.createElement('div');
    m.id = 'rxplanation';
    m.setAttribute('role', 'dialog');
    m.setAttribute('aria-label', 'rxplanation');
    m.innerHTML = '<div class="rx-title">rxplanation</div><div class="rx-body"></div><button type="button" class="rx-close" data-rxplanation="Closes this rxplanation panel.">close</button>';
    document.body.appendChild(m);
    m.querySelector('.rx-close').addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      m.style.display = 'none';
    });
    return m;
  }
  function show(el, x, y) {
    var m = menu();
    m.querySelector('.rx-body').textContent = explain(el);
    m.style.display = 'block';
    var w = m.offsetWidth || 280;
    var h = m.offsetHeight || 120;
    m.style.left = Math.max(8, Math.min(x, window.innerWidth - w - 8)) + 'px';
    m.style.top = Math.max(8, Math.min(y, window.innerHeight - h - 8)) + 'px';
  }
  document.addEventListener('contextmenu', function (e) {
    var el = e.target.closest('button, a, [role="button"], .btn, .bb, .mb');
    if (!el) return;
    e.preventDefault();
    show(el, e.clientX || 24, e.clientY || 24);
  }, true);
  var pressTimer = null;
  document.addEventListener('touchstart', function (e) {
    var el = e.target.closest('button, a, [role="button"], .btn, .bb, .mb');
    if (!el) return;
    pressTimer = setTimeout(function () {
      show(el, e.touches[0].clientX, e.touches[0].clientY);
    }, 550);
  }, true);
  document.addEventListener('touchend', function () { clearTimeout(pressTimer); }, true);
  document.addEventListener('click', function (e) {
    var m = document.getElementById('rxplanation');
    if (!m || m.style.display !== 'block') return;
    if (!m.contains(e.target)) m.style.display = 'none';
  });
  function stamp() {
    document.querySelectorAll('button, a, [role="button"]').forEach(function (el) {
      if (!el.getAttribute('title')) el.setAttribute('title', 'Right-click for rxplanation');
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', stamp);
  else stamp();
  new MutationObserver(stamp).observe(document.documentElement, { childList: true, subtree: true });
})();
