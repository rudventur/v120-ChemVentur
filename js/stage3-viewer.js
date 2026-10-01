/* ============================================
   🧬 CHEMVENTUR STAGE 3 - 3D MOLECULE VIEWER
   ============================================

   NEW file (does not touch any v118 file). Needs js/stage3-chem.js first.

   Public entry points:
     CHEMVENTUR.Stage3.open([query])   open the Stage 3 panel (optionally load a molecule)
     CHEMVENTUR.Stage3.close()
     CHEMVENTUR.Stage3.toggle()
     CHEMVENTUR.Stage3.load(query, mode)      mode: 'auto' | 'name' | 'cid' | 'smiles'
     CHEMVENTUR.Stage3.whatDidIBuild()        identify the player's bonded atoms
     CHEMVENTUR.Stage3.setStyle('stick'|'ballstick'|'sphere'), .setSpin(bool), .reset()

   3Dmol.js is lazy-loaded from a CDN the first time the panel opens.
   All UI is built with createElement/textContent + addEventListener:
   no inline handlers, no HTML built from user input.
   ============================================ */

(function () {
  'use strict';

  const CV = (window.CHEMVENTUR = window.CHEMVENTUR || {});

  const THREEDMOL_URLS = [
    'https://cdn.jsdelivr.net/npm/3dmol@2.5.2/build/3Dmol-min.js',
    'https://unpkg.com/3dmol@2.5.2/build/3Dmol-min.js'
  ];

  const QUICK_PICKS = [
    { label: '☕ Caffeine', q: 'caffeine' },
    { label: '💊 Aspirin', q: 'aspirin' },
    { label: '🍬 Glucose', q: 'glucose' },
    { label: '🧠 Dopamine', q: 'dopamine' },
    { label: '😊 Serotonin', q: 'serotonin' },
    { label: '⬡ Benzene', q: 'benzene' },
    { label: '🍺 Ethanol', q: 'ethanol' },
    { label: '⚽ C60', q: 'buckminsterfullerene' },
    { label: '🧂 NaCl', q: 'sodium chloride' }
  ];

  const STYLES = {
    stick:     { stick: { radius: 0.16, colorscheme: 'Jmol' } },
    ballstick: { stick: { radius: 0.12, colorscheme: 'Jmol' }, sphere: { scale: 0.28, colorscheme: 'Jmol' } },
    sphere:    { sphere: { colorscheme: 'Jmol' } }
  };

  // ---------- tiny DOM helper (text only, never innerHTML) ----------
  function el(tag, attrs, children) {
    const n = document.createElement(tag);
    if (attrs) {
      for (const k of Object.keys(attrs)) {
        const v = attrs[k];
        if (v === undefined || v === null || v === false) continue;
        if (k === 'text') n.textContent = v;
        else if (k === 'className') n.className = v;
        else n.setAttribute(k, v === true ? '' : String(v));
      }
    }
    (children || []).forEach(c => { if (c) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => { s.remove(); reject(new Error('Failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }

  let threeDmolPromise = null;
  function load3Dmol() {
    if (window.$3Dmol && window.$3Dmol.createViewer) return Promise.resolve(window.$3Dmol);
    if (!threeDmolPromise) {
      threeDmolPromise = (async () => {
        let lastErr = null;
        for (const url of THREEDMOL_URLS) {
          try {
            await loadScript(url);
            if (window.$3Dmol && window.$3Dmol.createViewer) return window.$3Dmol;
          } catch (e) { lastErr = e; }
        }
        threeDmolPromise = null; // allow retry later
        throw lastErr || new Error('3Dmol.js did not load');
      })();
    }
    return threeDmolPromise;
  }

  const fmt = (v, digits, unit) => (v === null || v === undefined || v === '') ? '—'
    : (typeof v === 'number' ? (digits != null ? v.toFixed(digits) : String(v)) : String(v)) + (unit || '');

  const SOURCE_LABEL = {
    'pubchem-3d': '3D · PubChem conformer',
    'rdkit-2d': '2D · RDKit layout (no 3D record)',
    'pubchem-2d': '2D · PubChem record (no 3D record)'
  };

  const Stage3 = {
    version: '3.0.0',
    isOpen: false,
    current: null,      // last loaded record
    styleName: 'ballstick',
    spinning: true,
    viewer: null,
    dom: null,
    _token: 0,
    _built: false,

    // ================= PUBLIC API =================
    async open(query) {
      if (!(await this._reveal())) return false;
      if (query) return this.load(query, 'auto');
      if (!this.current) return this.load('caffeine', 'name');
      this._resize();
      return true;
    },

    // Show the panel and make sure 3Dmol + the viewer exist. Resolves true/false.
    async _reveal() {
      this._build();
      this.dom.root.classList.add('visible');
      this.dom.root.setAttribute('aria-hidden', 'false');
      this.isOpen = true;
      this._fitBesideLeftPanel();
      document.body.classList.add('stage3-open');
      this._gameStatus('🧬 STAGE 3: 3D Molecules');
      this._updateGameButtons();
      try {
        await this._ensureViewer();
        return true;
      } catch (e) {
        this._busy(false);
        this._setStatus('❌ 3D viewer failed to load (offline or CDN blocked): ' + e.message, 'error');
        return false;
      }
    },

    close() {
      if (!this.dom) return;
      this.dom.root.classList.remove('visible');
      this.dom.root.setAttribute('aria-hidden', 'true');
      this.isOpen = false;
      document.body.classList.remove('stage3-open');
      if (this.viewer) { try { this.viewer.spin(false); } catch (e) {} }
    },

    toggle() { return this.isOpen ? this.close() : this.open(); },

    async load(query, mode) {
      const token = ++this._token;
      this._build();
      if (this.dom.input.value.trim() !== String(query).trim()) this.dom.input.value = String(query);
      this._busy(true, '🔍 Looking up "' + String(query).slice(0, 60) + '"…');
      try {
        const rec = await CV.Stage3Chem.lookup(query, mode || this.dom.mode.value || 'auto');
        if (token !== this._token) return false; // a newer request won
        await this._show(rec, token);
        return true;
      } catch (e) {
        if (token !== this._token) return false;
        this._setStatus('❌ ' + (e.message || e), 'error');
        return false;
      } finally {
        if (token === this._token) this._busy(false);
      }
    },

    async whatDidIBuild() {
      if (!this.isOpen || !this.viewer) { if (!(await this._reveal())) return false; }
      const token = ++this._token;
      this._busy(true, '🧪 Reading your bonded atoms…');
      try {
        const rec = await CV.Stage3Chem.identifyBuild(CV.MolecularSystem, CV.Game);
        if (token !== this._token) return false;
        await this._show(rec, token);
        const b = rec.build;
        const who = rec.props ? rec.props.title : 'an unknown molecule';
        this._setStatus('🧪 You built ' + who + '! (' + b.atoms + ' atoms, ' + b.bonds + ' bonds' + (b.smiles ? ', ' + b.smiles : '') + ')', 'ok');
        this._gameStatus('🧪 You built ' + who + '!');
        return rec;
      } catch (e) {
        if (token !== this._token) return false;
        this._setStatus('❌ ' + (e.message || e), 'error');
        return false;
      } finally {
        if (token === this._token) this._busy(false);
      }
    },

    setStyle(name) {
      if (!STYLES[name]) return;
      this.styleName = name;
      if (this.dom) this.dom.styleBtns.forEach(b => b.classList.toggle('active', b.dataset.style === name));
      if (this.viewer && this.current) {
        this.viewer.setStyle({}, STYLES[name]);
        this.viewer.render();
      }
    },

    setSpin(on) {
      this.spinning = !!on;
      if (this.dom) {
        this.dom.spinBtn.classList.toggle('active', this.spinning);
        this.dom.spinBtn.textContent = this.spinning ? '⟳ Spin: ON' : '⟳ Spin: OFF';
      }
      if (this.viewer) {
        try { this.viewer.spin(this.spinning ? 'y' : false, 0.6); } catch (e) {}
      }
    },

    reset() {
      if (!this.viewer) return;
      this.viewer.zoomTo();
      this.viewer.zoom(0.9);
      this.viewer.render();
    },

    // ================= INTERNALS =================
    _build() {
      if (this._built) return;
      this._built = true;

      const closeBtn = el('button', { type: 'button', className: 's3-btn s3-close', title: 'Close (Esc)', 'aria-label': 'Close Stage 3', text: '✕' });
      const viewerBox = el('div', { className: 's3-viewer', id: 'stage3-viewer' });
      const overlay = el('div', { className: 's3-overlay', text: 'Loading 3D engine…' });
      const badge = el('div', { className: 's3-badge', text: '' });

      const mode = el('select', { className: 's3-select', 'aria-label': 'Search type' }, [
        el('option', { value: 'auto', text: 'Auto' }),
        el('option', { value: 'name', text: 'Name' }),
        el('option', { value: 'cid', text: 'CID' }),
        el('option', { value: 'smiles', text: 'SMILES' })
      ]);
      const input = el('input', { type: 'text', className: 's3-input', placeholder: 'caffeine · 2244 · CC(=O)Oc1ccccc1C(=O)O', 'aria-label': 'Molecule name, CID or SMILES', autocomplete: 'off', spellcheck: 'false' });
      const goBtn = el('button', { type: 'submit', className: 's3-btn s3-go', title: 'Search PubChem', text: '🔍' });
      const form = el('form', { className: 's3-search' }, [mode, input, goBtn]);

      const quick = el('div', { className: 's3-quick' });
      QUICK_PICKS.forEach(p => {
        const b = el('button', { type: 'button', className: 's3-btn s3-chip', text: p.label });
        b.dataset.q = p.q;
        quick.appendChild(b);
      });

      const styleBtns = [['stick', 'Stick'], ['ballstick', 'Ball & Stick'], ['sphere', 'Spheres']].map(([k, label]) => {
        const b = el('button', { type: 'button', className: 's3-btn s3-style', text: label });
        b.dataset.style = k;
        return b;
      });
      const spinBtn = el('button', { type: 'button', className: 's3-btn', text: '⟳ Spin: ON' });
      const resetBtn = el('button', { type: 'button', className: 's3-btn', text: '⌖ Reset view' });
      const buildBtn = el('button', { type: 'button', className: 's3-btn s3-build', text: '🧪 What did I build?' });
      const spawnBtn = el('button', { type: 'button', className: 's3-btn s3-spawn', text: '🚀 Spawn in game' });

      const info = {};
      const rows = [['name', 'Name'], ['formula', 'Formula'], ['mw', 'Mol. weight'], ['xlogp', 'XLogP'], ['tpsa', 'TPSA'], ['inchikey', 'InChIKey'], ['smiles', 'SMILES'], ['cid', 'PubChem']];
      const dl = el('dl', { className: 's3-info' });
      rows.forEach(([k, label]) => {
        const dd = el('dd', { text: '—' });
        info[k] = dd;
        dl.appendChild(el('dt', { text: label }));
        dl.appendChild(dd);
      });

      const depictImg = el('img', { className: 's3-depict-img', alt: '2D structure' });
      const depict = el('div', { className: 's3-depict', hidden: true }, [el('div', { className: 's3-label', text: '2D structure (RDKit)' }), depictImg]);
      const notes = el('ul', { className: 's3-notes' });
      const status = el('div', { className: 's3-status', role: 'status', 'aria-live': 'polite', text: '' });

      const root = el('div', { id: 'stage3-panel', className: 'stage3-panel', role: 'dialog', 'aria-modal': 'false', 'aria-label': 'ChemVentur Stage 3: 3D molecules', 'aria-hidden': 'true' }, [
        el('div', { className: 's3-header' }, [
          el('h3', { className: 's3-title', text: '🧬 STAGE 3 · 3D MOLECULES' }),
          el('span', { className: 's3-sub', text: 'PubChem conformers · RDKit · 3Dmol.js' }),
          closeBtn
        ]),
        el('div', { className: 's3-body' }, [
          el('div', { className: 's3-stage' }, [viewerBox, overlay, badge]),
          el('div', { className: 's3-side' }, [
            form,
            quick,
            el('div', { className: 's3-row' }, styleBtns),
            el('div', { className: 's3-row' }, [spinBtn, resetBtn]),
            el('div', { className: 's3-row' }, [buildBtn, spawnBtn]),
            dl,
            depict,
            notes,
            status
          ])
        ])
      ]);
      document.body.appendChild(root);

      this.dom = { root, viewerBox, overlay, badge, mode, input, form, quick, styleBtns, spinBtn, resetBtn, buildBtn, spawnBtn, info, depict, depictImg, notes, status };

      // ---- listeners (no inline handlers) ----
      closeBtn.addEventListener('click', () => this.close());
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const q = input.value.trim();
        if (q) this.load(q, mode.value);
      });
      quick.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-q]');
        if (b) { input.value = b.dataset.q; mode.value = 'auto'; this.load(b.dataset.q, 'name'); }
      });
      styleBtns.forEach(b => b.addEventListener('click', () => this.setStyle(b.dataset.style)));
      spinBtn.addEventListener('click', () => this.setSpin(!this.spinning));
      resetBtn.addEventListener('click', () => this.reset());
      buildBtn.addEventListener('click', () => this.whatDidIBuild());
      spawnBtn.addEventListener('click', () => this._spawnInGame());

      // Keep game hotkeys (1-0, A/D/S, …) from firing while using the panel
      root.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { this.close(); }
        e.stopPropagation();
      });
      root.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
      document.addEventListener('keydown', (e) => {
        if (this.isOpen && e.key === 'Escape') this.close();
      });
      window.addEventListener('resize', () => { this._fitBesideLeftPanel(); this._resize(); });

      this.setStyle(this.styleName);
      this.setSpin(this.spinning);
      this._updateGameButtons();
    },

    async _ensureViewer() {
      if (this.viewer) { this._resize(); return this.viewer; }
      this._busy(true, 'Loading 3D engine…');
      const $3Dmol = await load3Dmol();
      if (!this.viewer) {
        this.viewer = $3Dmol.createViewer(this.dom.viewerBox, { backgroundColor: '#000a03', antialias: true });
      }
      this._busy(false);
      return this.viewer;
    },

    async _show(rec, token) {
      await this._ensureViewer();
      if (token !== this._token) return;
      const v = this.viewer;
      this.current = rec;

      v.clear();
      v.addModel(rec.sdf, 'sdf');
      v.setStyle({}, STYLES[this.styleName]);
      v.zoomTo();
      v.zoom(0.9);
      v.render();
      this.setSpin(this.spinning);
      this._resize();

      this.dom.badge.textContent = SOURCE_LABEL[rec.source] || rec.source;
      this.dom.badge.className = 's3-badge ' + (rec.is3D ? 's3-badge-3d' : 's3-badge-2d');
      this._fillInfo(rec);
      this._setStatus((rec.is3D ? '✅ ' : '⚠️ ') + ((rec.props && rec.props.title) || rec.query) + ' · ' + (SOURCE_LABEL[rec.source] || rec.source), rec.is3D ? 'ok' : 'warn');
      this._updateGameButtons();

      // 2D depiction + any missing values from RDKit (non-blocking)
      const smiles = (rec.rd && rec.rd.canonical) || (rec.props && rec.props.smiles);
      if (rec.rd) this._fillRdkit(rec, rec.rd);
      else if (smiles) {
        CV.Stage3Chem.RDKit.analyze(smiles).then(rd => {
          if (rd && this.current === rec) { rec.rd = rd; this._fillRdkit(rec, rd); }
        });
      }
    },

    _fillInfo(rec) {
      const p = rec.props || {};
      const rd = rec.rd || null;
      const d = rd && rd.descriptors;
      const I = this.dom.info;
      I.name.textContent = p.title || (rec.build ? 'Unknown (not in PubChem)' : rec.query) || '—';
      I.name.title = p.iupac || '';
      I.formula.textContent = p.formula || (rd && rd.formula) || '—';
      I.mw.textContent = p.mw != null ? fmt(p.mw, 2, ' g/mol') : (d && d.amw != null ? fmt(d.amw, 2, ' g/mol (RDKit)') : '—');
      I.xlogp.textContent = p.xlogp != null ? fmt(p.xlogp, 1) : (d && d.CrippenClogP != null ? fmt(d.CrippenClogP, 2, ' (RDKit cLogP)') : '—');
      I.tpsa.textContent = p.tpsa != null ? fmt(p.tpsa, 1, ' Å²') : (d && d.tpsa != null ? fmt(d.tpsa, 1, ' Å² (RDKit)') : '—');
      I.inchikey.textContent = p.inchikey || (rd && rd.inchikey) || '—';
      I.smiles.textContent = p.smiles || (rd && rd.canonical) || '—';

      I.cid.textContent = '';
      if (rec.cid) {
        const a = el('a', { href: CV.Stage3Chem.PubChem.compoundUrl(rec.cid), target: '_blank', rel: 'noopener noreferrer', text: 'CID ' + rec.cid + ' ↗' });
        I.cid.appendChild(a);
      } else {
        I.cid.textContent = 'not in PubChem';
      }

      this.dom.notes.textContent = '';
      (rec.notes || []).forEach(n => this.dom.notes.appendChild(el('li', { text: n })));
      if (!rd) { this.dom.depict.hidden = true; this.dom.depictImg.removeAttribute('src'); }
    },

    _fillRdkit(rec, rd) {
      if (rd.svg) {
        // SVG goes through an <img> data URL: it can never run script
        this.dom.depictImg.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(rd.svg);
        this.dom.depict.hidden = false;
      }
      this._fillInfo(rec);
      if (rd.svg) this.dom.depict.hidden = false;
    },

    _spawnInGame() {
      const rec = this.current;
      const smiles = rec && ((rec.props && rec.props.smiles) || (rec.rd && rec.rd.canonical));
      if (!smiles || !CV.RDKit || typeof CV.RDKit.spawnFromSmiles !== 'function' || !CV.Game || !CV.Game.ship) {
        this._setStatus('⚠️ Spawning needs the main game (CHEMVENTUR.RDKit + Game)', 'warn');
        return;
      }
      const name = (rec.props && rec.props.title) || smiles;
      CV.RDKit.spawnFromSmiles(smiles, CV.Game.ship.x, CV.Game.ship.y - 50).then(res => {
        if (res) { this._gameStatus('🚀 Spawned ' + name + ' from Stage 3!'); this.close(); }
        else this._setStatus('❌ RDKit could not spawn this molecule in 2D', 'error');
      });
    },

    _updateGameButtons() {
      if (!this.dom) return;
      const hasGame = !!(CV.MolecularSystem && Array.isArray(CV.MolecularSystem.bonds));
      this.dom.buildBtn.disabled = !hasGame;
      this.dom.buildBtn.title = hasGame ? 'Identify the largest bonded molecule in the game' : 'Needs the main game (CHEMVENTUR.MolecularSystem)';
      const canSpawn = !!(CV.RDKit && CV.RDKit.spawnFromSmiles && CV.Game && CV.Game.ship && this.current);
      this.dom.spawnBtn.disabled = !canSpawn;
      this.dom.spawnBtn.title = canSpawn ? 'Spawn this molecule as bonded atoms in the 2D game' : 'Needs the main game and a loaded molecule';
    },

    _busy(on, msg) {
      if (!this.dom) return;
      this.dom.root.classList.toggle('s3-busy', !!on);
      this.dom.overlay.hidden = !on;
      if (on && msg) { this.dom.overlay.textContent = msg; this._setStatus(msg, 'info'); }
    },

    _setStatus(msg, kind) {
      if (!this.dom) return;
      this.dom.status.textContent = msg;
      this.dom.status.className = 's3-status s3-' + (kind || 'info');
    },

    _gameStatus(msg) {
      try { if (CV.UI && typeof CV.UI.showStatus === 'function') CV.UI.showStatus(msg); } catch (e) {}
    },

    // Keep the game's left panel (and the #btn-stage3 button in it) uncovered
    // and clickable: the overlay starts right of #left-panel when there is room.
    // On narrow screens (phone drawer) it stays full-screen; close with ✕ / Esc.
    _fitBesideLeftPanel() {
      if (!this.dom) return;
      const st = this.dom.root.style;
      const lp = document.getElementById('left-panel');
      let left = 0;
      if (lp) {
        const r = lp.getBoundingClientRect();
        const visible = r.width > 0 && r.right > 0 && getComputedStyle(lp).display !== 'none';
        if (visible && (window.innerWidth - r.right) >= 420) left = Math.ceil(r.right) + 8;
      }
      if (left) { st.left = left + 'px'; this.dom.root.classList.add('s3-beside-panel'); }
      else { st.left = ''; this.dom.root.classList.remove('s3-beside-panel'); }
    },

    _resize() {
      if (this.viewer && this.isOpen) {
        try { this.viewer.resize(); this.viewer.render(); } catch (e) {}
      }
    }
  };

  CV.Stage3 = Stage3;
  console.log('🧬 Stage 3 viewer loaded: CHEMVENTUR.Stage3.open()');
})();
