/* CHEMVENTUR Stage 3: STAGE SELECTOR on the opening screen.
   Stage 3 is this game. Stages 0, 1 and 2 are the older game (game-v118.html in the repository root): the three
   cards link there, and you pick the stage inside it. Stage 4 is shown as "coming soon" (not clickable).
   The links work from stage3-game/index.html and from the repository root index.html: they are resolved from this
   script's own address (…/stage3-game/js/s3g-stages.js → two folders up). */
(function () {
  'use strict';
  const CV = (window.CHEMVENTUR = window.CHEMVENTUR || {});
  const G = (CV.Stage3Game = CV.Stage3Game || {});
  const here = (document.currentScript && document.currentScript.src) || location.href;
  const older = (() => { try { return new URL('../../game-v118.html', here).href; } catch (e) { return 'game-v118.html'; } })();

  const STAGES = [
    { id: 0, icon: '🎻', name: 'Stage 0', sub: 'Strings', href: older, info: 'Opens the older game. Pick Stage 0 (Strings) in its STAGE SELECT box.' },
    { id: 1, icon: '⚛️', name: 'Stage 1', sub: 'Atoms', href: older, info: 'Opens the older game. Pick Stage 1 (Atoms) in its STAGE SELECT box.' },
    { id: 2, icon: '🧬', name: 'Stage 2', sub: 'Molecules', href: older, info: 'Opens the older game. Pick Stage 2 (Molecules) in its STAGE SELECT box.' },
    { id: 3, icon: '🚀', name: 'Stage 3', sub: 'Molecules in 3D', current: true, info: 'This game: fly, shoot and bond atoms in 3D.' },
    { id: 4, icon: '✈️', name: 'Stage 4', sub: 'Coming soon', soon: true, info: 'Coming soon.' }
  ];

  function el(tag, props, kids) {
    const e = document.createElement(tag);
    Object.entries(props || {}).forEach(([k, v]) => { if (k === 'text') e.textContent = v; else if (k === 'className') e.className = v; else e.setAttribute(k, v); });
    (kids || []).forEach(k => e.appendChild(k));
    return e;
  }

  const Stages = {
    list: STAGES, olderUrl: older, box: null,
    attach(game) {
      this.game = game;
      const h = game.hud, so = h.startOverlay;
      const row = el('div', { className: 's3g-stagelist' });
      STAGES.forEach(s => {
        const inner = [el('span', { className: 's3g-stage-icon', text: s.icon }), el('b', { text: s.name }), el('span', { className: 's3g-stage-sub', text: s.sub })];
        let node;
        if (s.soon) node = el('span', { className: 's3g-stage soon', 'aria-disabled': 'true', title: s.info, 'data-stage': String(s.id) }, inner);
        else if (s.current) {
          node = el('button', { type: 'button', className: 's3g-stage current', 'aria-current': 'true', title: s.info + ' Click to start.', 'data-stage': String(s.id) }, inner);
          node.addEventListener('click', () => game.start());
        } else node = el('a', { className: 's3g-stage older', href: s.href, title: s.info, 'data-stage': String(s.id) }, inner);
        row.appendChild(node);
      });
      const box = el('div', { className: 's3g-stagepick' }, [el('b', { text: 'Choose a stage' }), row]);
      box.title = 'Stages 0, 1 and 2 open the older game (choose the stage in its STAGE SELECT box). Stage 4 is on its way.';
      const startBtn = so.querySelector('.s3g-start-btn');
      so.insertBefore(box, startBtn ? startBtn.nextSibling : so.firstChild.nextSibling);
      this.box = box;
    },
    debugState() {
      return STAGES.map(s => { const n = this.box && this.box.querySelector('[data-stage="' + s.id + '"]'); return { id: s.id, name: s.name, sub: s.sub, tag: n ? n.tagName : null, href: n && n.getAttribute('href'), soon: !!s.soon, current: !!s.current }; });
    }
  };
  G.Stages = Stages;
})();
