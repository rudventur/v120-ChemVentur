/* ============================================
   🧬 CHEMVENTUR STAGE 3 - CHEMISTRY DATA LAYER
   ============================================

   NEW file (does not touch any v118 file).

   CHEMVENTUR.Stage3Chem
   - Full 118-element symbol table (no more 'X' past Calcium)
   - localStorage cache (TTL + quota-safe eviction), in-memory fallback
   - PubChem PUG REST client:
       * name / CID / SMILES -> CID
       * property endpoint: Title, MolecularFormula, MolecularWeight,
         SMILES, InChIKey, XLogP, TPSA (+ IUPACName)
       * 3D conformer SDF (record_type=3d), 2D SDF fallback
       * molblock -> CID (POST, no RDKit needed)
     Polite: <= ~4-5 requests/second, 15 s timeout.
   - RDKit.js fallback: reuses CHEMVENTUR.RDKit (rdkit-v118.js) if it is
     loaded, otherwise lazy-loads the same RDKit MinimalLib build itself.
   - "What did I build?": reads CHEMVENTUR.MolecularSystem.bonds, picks the
     largest bonded fragment, writes a V2000 molblock.

   No DOM access at load time, so it can also be unit-tested in Node.
   ============================================ */

(function () {
  'use strict';

  const root = (typeof window !== 'undefined') ? window : globalThis;
  const CV = (root.CHEMVENTUR = root.CHEMVENTUR || {});

  const PUG = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug';
  const RDKIT_VERSION = '2025.3.4-1.0.0'; // same build rdkit-v118.js uses
  const RDKIT_BASE = `https://unpkg.com/@rdkit/rdkit@${RDKIT_VERSION}/dist/`;
  const PROPS = 'Title,MolecularFormula,MolecularWeight,SMILES,ConnectivitySMILES,InChIKey,XLogP,TPSA,IUPACName';

  // ===== FULL PERIODIC TABLE (index = Z - 1) =====
  const SYMBOLS = (
    'H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca ' +
    'Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr ' +
    'Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd ' +
    'Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg ' +
    'Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm ' +
    'Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og'
  ).split(' ');
  const Z_BY_SYMBOL = {};
  SYMBOLS.forEach((s, i) => { Z_BY_SYMBOL[s] = i + 1; });

  const Elements = {
    count: SYMBOLS.length,
    symbol(Z) { return SYMBOLS[(Z | 0) - 1] || null; },
    z(symbol) { return Z_BY_SYMBOL[symbol] || null; }
  };

  // ===== CACHE (localStorage, quota-safe) =====
  const Cache = {
    prefix: 'cv.stage3.v1:',
    ttlMs: 30 * 24 * 3600 * 1000,
    mem: new Map(),
    _lsChecked: false,
    _lsRef: null,

    _ls() {
      if (this._lsChecked) return this._lsRef;
      this._lsChecked = true;
      try {
        const ls = root.localStorage;
        const k = this.prefix + '__probe';
        ls.setItem(k, '1');
        ls.removeItem(k);
        this._lsRef = ls;
      } catch (e) {
        this._lsRef = null; // private mode / disabled / Node
      }
      return this._lsRef;
    },

    get(key) {
      const full = this.prefix + key;
      const now = Date.now();
      let entry = this.mem.get(full);
      if (!entry) {
        const ls = this._ls();
        if (ls) {
          try {
            const raw = ls.getItem(full);
            if (raw) entry = JSON.parse(raw);
          } catch (e) { entry = null; }
        }
      }
      if (!entry) return undefined;
      if (now - entry.t > this.ttlMs) { this.remove(key); return undefined; }
      this.mem.set(full, entry);
      return entry.v;
    },

    set(key, value) {
      const full = this.prefix + key;
      const entry = { t: Date.now(), v: value };
      this.mem.set(full, entry);
      const ls = this._ls();
      if (!ls) return;
      const raw = JSON.stringify(entry);
      try {
        ls.setItem(full, raw);
      } catch (e) {
        // Quota exceeded: drop the oldest half of OUR keys, then retry once
        this._evictOldest(0.5);
        try { ls.setItem(full, raw); } catch (e2) { /* keep in memory only */ }
      }
    },

    remove(key) {
      const full = this.prefix + key;
      this.mem.delete(full);
      const ls = this._ls();
      if (ls) { try { ls.removeItem(full); } catch (e) {} }
    },

    _ownKeys() {
      const ls = this._ls();
      const keys = [];
      if (!ls) return keys;
      for (let i = 0; i < ls.length; i++) {
        const k = ls.key(i);
        if (k && k.indexOf(this.prefix) === 0) keys.push(k);
      }
      return keys;
    },

    _evictOldest(fraction) {
      const ls = this._ls();
      if (!ls) return;
      const items = this._ownKeys().map(k => {
        let t = 0;
        try { t = JSON.parse(ls.getItem(k)).t || 0; } catch (e) {}
        return { k, t };
      }).sort((a, b) => a.t - b.t);
      const n = Math.max(1, Math.ceil(items.length * fraction));
      items.slice(0, n).forEach(it => { try { ls.removeItem(it.k); } catch (e) {} this.mem.delete(it.k); });
    },

    clear() {
      const ls = this._ls();
      this._ownKeys().forEach(k => { try { ls.removeItem(k); } catch (e) {} });
      this.mem.clear();
    },

    stats() {
      const ls = this._ls();
      const keys = this._ownKeys();
      let bytes = 0;
      keys.forEach(k => { bytes += (ls.getItem(k) || '').length * 2; });
      return { entries: keys.length, approxBytes: bytes, persistent: !!ls };
    }
  };

  // ===== PUBCHEM CLIENT =====
  const MIN_GAP_MS = 220; // PubChem asks for <= 5 requests/second
  let nextSlot = 0;
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  async function throttle() {
    const now = Date.now();
    const at = Math.max(now, nextSlot);
    nextSlot = at + MIN_GAP_MS;
    if (at > now) await sleep(at - now);
  }

  // Returns parsed JSON / text, or null for "not found" (400/404).
  // Retries once on timeout / 503 / network error (PubChem has occasional hiccups).
  async function pugFetch(path, opts) {
    try {
      return await pugFetchOnce(path, opts);
    } catch (err) {
      if (err && err.retryable === false) throw err;
      await sleep(900);
      return pugFetchOnce(path, opts);
    }
  }

  async function pugFetchOnce(path, opts) {
    const o = Object.assign({ as: 'json', method: 'GET', body: null, timeout: 12000 }, opts || {});
    await throttle();
    const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), o.timeout) : null;
    try {
      const init = { method: o.method, signal: ctrl ? ctrl.signal : undefined };
      if (o.body != null) {
        init.body = o.body;
        init.headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
      }
      const res = await fetch(PUG + path, init);
      if (res.status === 404 || res.status === 400) return null;
      if (res.status === 503) throw new Error('PubChem is busy (HTTP 503), try again in a moment');
      if (!res.ok) { const e = new Error('PubChem HTTP ' + res.status); e.retryable = res.status >= 500; throw e; }
      return o.as === 'text' ? await res.text() : await res.json();
    } catch (err) {
      if (err && err.name === 'AbortError') throw new Error('PubChem request timed out');
      throw err;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  function firstCid(json) {
    const list = json && json.IdentifierList && json.IdentifierList.CID;
    const cid = Array.isArray(list) ? list[0] : null;
    return (cid && cid > 0) ? cid : null;
  }

  const num = (v) => {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const PubChem = {
    base: PUG,

    async cidFromName(name) {
      const key = 'name2cid:' + name.trim().toLowerCase();
      const hit = Cache.get(key);
      if (hit !== undefined) return hit;
      const json = await pugFetch('/compound/name/' + encodeURIComponent(name.trim()) + '/cids/JSON');
      const cid = firstCid(json);
      Cache.set(key, cid);
      return cid;
    },

    async cidFromSmiles(smiles) {
      const key = 'smi2cid:' + smiles.trim();
      const hit = Cache.get(key);
      if (hit !== undefined) return hit;
      // Query-string form keeps '#', '/', '\' etc. safe
      const json = await pugFetch('/compound/smiles/cids/JSON?smiles=' + encodeURIComponent(smiles.trim()));
      const cid = firstCid(json);
      Cache.set(key, cid);
      return cid;
    },

    async cidFromMolblock(molblock) {
      const body = 'sdf=' + encodeURIComponent(molblock.replace(/\s*$/, '') + '\n$$$$\n');
      const json = await pugFetch('/compound/sdf/cids/JSON', { method: 'POST', body });
      return firstCid(json);
    },

    async properties(cid) {
      cid = parseInt(cid, 10);
      if (!(cid > 0)) return null;
      const key = 'props:' + cid;
      const hit = Cache.get(key);
      if (hit !== undefined) return hit;
      const json = await pugFetch('/compound/cid/' + cid + '/property/' + PROPS + '/JSON');
      const p = json && json.PropertyTable && json.PropertyTable.Properties && json.PropertyTable.Properties[0];
      const props = p ? {
        cid: p.CID,
        title: p.Title || p.IUPACName || ('CID ' + p.CID),
        iupac: p.IUPACName || '',
        formula: p.MolecularFormula || '',
        mw: num(p.MolecularWeight),
        // 'SMILES' is the full (isomeric) SMILES since PubChem's 2025 rename;
        // older names kept as fallbacks.
        smiles: p.SMILES || p.IsomericSMILES || p.CanonicalSMILES || p.ConnectivitySMILES || '',
        inchikey: p.InChIKey || '',
        xlogp: num(p.XLogP),
        tpsa: num(p.TPSA)
      } : null;
      Cache.set(key, props);
      return props;
    },

    // dim: '3d' | '2d'. Returns SDF text or null (cached either way).
    async sdf(cid, dim) {
      cid = parseInt(cid, 10);
      const key = 'sdf' + dim + ':' + cid;
      const hit = Cache.get(key);
      if (hit !== undefined) return hit;
      const text = await pugFetch('/compound/cid/' + cid + '/record/SDF?record_type=' + dim, { as: 'text' });
      const sdf = (text && text.indexOf('M  END') !== -1) ? text : null;
      Cache.set(key, sdf);
      return sdf;
    },

    compoundUrl(cid) { return 'https://pubchem.ncbi.nlm.nih.gov/compound/' + parseInt(cid, 10); }
  };

  // ===== RDKIT (reuse the game's loader, or lazy-load our own) =====
  let ownRdkitPromise = null;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (typeof document === 'undefined') { reject(new Error('no document')); return; }
      const existing = document.querySelector('script[src="' + src + '"]');
      if (existing && root.initRDKitModule) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Failed to load ' + src));
      document.head.appendChild(s);
    });
  }

  const RD = {
    override: null, // tests can inject an RDKit module here

    // Resolves to the RDKit module or null (never throws).
    async get() {
      if (this.override) return this.override;
      // 1) v118's own loader (js/rdkit-v118.js -> CHEMVENTUR.RDKit)
      if (CV.RDKit && typeof CV.RDKit.init === 'function') {
        try {
          const mod = await CV.RDKit.init();
          if (mod) return mod;
        } catch (e) { /* fall through */ }
      }
      // 2) standalone: load the same build ourselves
      if (!ownRdkitPromise) {
        ownRdkitPromise = (async () => {
          try {
            if (typeof root.initRDKitModule !== 'function') await loadScript(RDKIT_BASE + 'RDKit_minimal.js');
            if (typeof root.initRDKitModule !== 'function') throw new Error('initRDKitModule missing');
            return await root.initRDKitModule({ locateFile: (f) => RDKIT_BASE + f });
          } catch (e) {
            console.warn('⚠️ Stage3: RDKit unavailable:', e.message || e);
            return null;
          }
        })();
      }
      return ownRdkitPromise;
    },

    // SMILES or molblock -> { canonical, molblock (2D, explicit H), svg, descriptors, formula } | null
    async analyze(input) {
      const R = await this.get();
      if (!R || !input) return null;
      let mol = null;
      try {
        mol = R.get_mol(input);
        if (!mol || !mol.is_valid()) return null;
        // Game builds / add_hs output carry explicit H: drop them for a clean canonical SMILES
        try { if (typeof mol.remove_hs_in_place === 'function') mol.remove_hs_in_place(); } catch (e) {}
        const canonical = mol.get_smiles();
        const molblock = mol.add_hs(); // 2D coords + explicit hydrogens
        let svg = '';
        try { svg = mol.get_svg(300, 220); } catch (e) {}
        let descriptors = null;
        try { descriptors = JSON.parse(mol.get_descriptors()); } catch (e) {}
        let inchikey = '';
        try { inchikey = R.get_inchikey_for_inchi(mol.get_inchi()); } catch (e) {}
        return { canonical, molblock, svg, descriptors, inchikey, formula: formulaFromMolblock(molblock) };
      } catch (e) {
        return null;
      } finally {
        if (mol) { try { mol.delete(); } catch (e) {} }
      }
    }
  };

  // ===== MOLBLOCK HELPERS =====
  function formulaFromMolblock(mb) {
    const lines = String(mb).split('\n');
    const n = parseInt((lines[3] || '').substring(0, 3), 10);
    if (!(n > 0)) return '';
    const counts = {};
    for (let i = 0; i < n; i++) {
      const sym = (lines[4 + i] || '').substring(31, 34).trim();
      if (sym) counts[sym] = (counts[sym] || 0) + 1;
    }
    // Hill order: C, H, then alphabetical (alphabetical if no carbon)
    const keys = Object.keys(counts);
    const hasC = !!counts.C;
    keys.sort((a, b) => {
      if (hasC) {
        if (a === 'C') return -1; if (b === 'C') return 1;
        if (a === 'H') return -1; if (b === 'H') return 1;
      }
      return a < b ? -1 : a > b ? 1 : 0;
    });
    return keys.map(k => k + (counts[k] > 1 ? counts[k] : '')).join('');
  }

  const pad = (s, w) => String(s).padStart(w, ' ');
  const fx = (v) => pad((Math.round(v * 10000) / 10000).toFixed(4), 10);

  // atoms: [{symbol, x, y, z?}], bonds: [{a, b, order}] (0-based)
  function writeMolblock(atoms, bonds, title) {
    const out = [];
    out.push(String(title || 'ChemVentur build').substring(0, 80));
    out.push('  CHEMVENTUR-Stage3 2D');
    out.push('');
    out.push(pad(atoms.length, 3) + pad(bonds.length, 3) + '  0  0  0  0  0  0  0  0999 V2000');
    atoms.forEach(a => {
      out.push(fx(a.x) + fx(a.y) + fx(a.z || 0) + ' ' + String(a.symbol).padEnd(3, ' ') +
        ' 0  0  0  0  0  0  0  0  0  0  0  0');
    });
    bonds.forEach(b => {
      out.push(pad(b.a + 1, 3) + pad(b.b + 1, 3) + pad(b.order, 3) + '  0');
    });
    out.push('M  END');
    return out.join('\n');
  }

  // ===== "WHAT DID I BUILD?" — read the live game =====
  const ORDER_BY_TYPE = { SINGLE: 1, DOUBLE: 2, TRIPLE: 3, IONIC: 1, METALLIC: 1 };
  const PX_PER_UNIT = 33; // game bond ~50 px  ->  ~1.5 molfile units (RDKit's own depiction scale)

  function isRealAtom(a) {
    return !!a && Number.isInteger(a.p) && a.p >= 1 && a.p <= 118 &&
      !a.special && !a.isHole && !a.isMolecule;
  }

  const Builder = {
    // Returns { atoms, bonds, fragments, notes } for the largest bonded fragment,
    // or { atoms: [] , ... } if nothing is bonded.
    collect(molSys, game) {
      molSys = molSys || CV.MolecularSystem;
      game = game || CV.Game;
      const notes = [];
      const bondsIn = (molSys && Array.isArray(molSys.bonds)) ? molSys.bonds : [];

      // De-duplicate bonds per atom pair (keep the highest order)
      const pairs = new Map();
      const idOf = new Map();
      let nextId = 0;
      const id = (a) => { if (!idOf.has(a)) idOf.set(a, nextId++); return idOf.get(a); };
      let odd = 0;
      for (const b of bondsIn) {
        if (!b || !isRealAtom(b.atom1) || !isRealAtom(b.atom2) || b.atom1 === b.atom2) continue;
        const order = Math.min(3, Math.max(1, (b.order | 0) || ORDER_BY_TYPE[b.type] || 1));
        if (b.type === 'IONIC' || b.type === 'METALLIC') odd++;
        const i = id(b.atom1), j = id(b.atom2);
        const k = i < j ? i + ':' + j : j + ':' + i;
        const prev = pairs.get(k);
        if (!prev || prev.order < order) pairs.set(k, { a1: b.atom1, a2: b.atom2, order });
      }
      if (odd) notes.push(odd + ' ionic/metallic bond(s) written as single bonds');
      if (!pairs.size) return { atoms: [], bonds: [], fragments: 0, notes };

      // Connected components
      const adj = new Map();
      pairs.forEach(p => {
        if (!adj.has(p.a1)) adj.set(p.a1, []);
        if (!adj.has(p.a2)) adj.set(p.a2, []);
        adj.get(p.a1).push(p.a2);
        adj.get(p.a2).push(p.a1);
      });
      const seen = new Set();
      const comps = [];
      adj.forEach((_, start) => {
        if (seen.has(start)) return;
        const comp = [];
        const stack = [start];
        seen.add(start);
        while (stack.length) {
          const a = stack.pop();
          comp.push(a);
          for (const nb of adj.get(a)) if (!seen.has(nb)) { seen.add(nb); stack.push(nb); }
        }
        comps.push(comp);
      });

      // Largest fragment; ties -> closest to the ship
      const ship = game && game.ship;
      const dist = (comp) => {
        if (!ship) return 0;
        let sx = 0, sy = 0;
        comp.forEach(a => { sx += a.x; sy += a.y; });
        return Math.hypot(sx / comp.length - ship.x, sy / comp.length - ship.y);
      };
      comps.sort((A, B) => (B.length - A.length) || (dist(A) - dist(B)));
      const best = comps[0];
      if (comps.length > 1) notes.push((comps.length - 1) + ' other bonded fragment(s) ignored (picked the largest)');

      const index = new Map();
      let cx = 0, cy = 0;
      best.forEach(a => { cx += a.x; cy += a.y; });
      cx /= best.length; cy /= best.length;
      const atoms = best.map((a, i) => {
        index.set(a, i);
        return { symbol: Elements.symbol(a.p), Z: a.p, x: (a.x - cx) / PX_PER_UNIT, y: -(a.y - cy) / PX_PER_UNIT };
      });
      const bonds = [];
      pairs.forEach(p => {
        if (index.has(p.a1) && index.has(p.a2)) bonds.push({ a: index.get(p.a1), b: index.get(p.a2), order: p.order });
      });
      return { atoms, bonds, fragments: comps.length, notes };
    },

    molblock(frag) { return writeMolblock(frag.atoms, frag.bonds, 'ChemVentur build'); }
  };

  // ===== QUERY TYPE GUESS =====
  function guessMode(q) {
    const s = String(q || '').trim();
    if (/^(cid[:\s#]*)?\d+$/i.test(s)) return 'cid';
    if (/\s/.test(s)) return 'name';
    if (/[=#()\[\]@\/\\]/.test(s)) return 'smiles';
    if (/^(Cl|Br|[BCNOPSFI]|[cnops]|\d|%)+$/.test(s)) return 'smiles'; // CCO, c1ccccc1, CN
    return 'name';
  }

  // ===== MAIN LOOKUP =====
  // Returns a record for the viewer:
  // { query, mode, cid, props, sdf, source: 'pubchem-3d'|'rdkit-2d'|'pubchem-2d', is3D, rd, notes[] }
  async function lookup(query, mode) {
    const q = String(query || '').trim();
    if (!q) throw new Error('Type a name, CID or SMILES');
    mode = (!mode || mode === 'auto') ? guessMode(q) : mode;
    const notes = [];

    // 1) Resolve CID
    let cid = null;
    let triedSmiles = false;
    if (mode === 'cid') {
      cid = parseInt(q.replace(/\D+/g, ''), 10) || null;
    } else if (mode === 'smiles') {
      triedSmiles = true;
      cid = await PubChem.cidFromSmiles(q);
      if (!cid && guessMode(q) !== 'smiles') cid = await PubChem.cidFromName(q);
    } else {
      cid = await PubChem.cidFromName(q);
      if (!cid && /^[A-Za-z0-9@+\-\[\]()=#\/\\%.]+$/.test(q)) { triedSmiles = true; cid = await PubChem.cidFromSmiles(q); }
    }

    // 2) PubChem properties + 3D conformer
    let props = null;
    if (cid) {
      props = await PubChem.properties(cid);
      if (!props) { notes.push('PubChem has no compound with CID ' + cid); cid = null; }
    }
    if (cid) {
      const sdf3d = await PubChem.sdf(cid, '3d');
      if (sdf3d) return { query: q, mode, cid, props, sdf: sdf3d, source: 'pubchem-3d', is3D: true, rd: null, notes };
      notes.push('PubChem has no 3D conformer for CID ' + cid + ' (common for salts, metals, big or very flexible molecules)');
    }

    // 3) RDKit fallback (2D layout + descriptors)
    const smiles = (props && props.smiles) || ((triedSmiles || mode === 'smiles') ? q : '');
    if (smiles) {
      const rd = await RD.analyze(smiles);
      if (rd) {
        if (!cid) notes.push('Not found on PubChem: showing RDKit 2D layout only');
        return { query: q, mode, cid, props, sdf: rd.molblock, source: 'rdkit-2d', is3D: false, rd, notes };
      }
      notes.push('RDKit unavailable or could not parse the SMILES');
    }

    // 4) PubChem 2D record
    if (cid) {
      const sdf2d = await PubChem.sdf(cid, '2d');
      if (sdf2d) return { query: q, mode, cid, props, sdf: sdf2d, source: 'pubchem-2d', is3D: false, rd: null, notes };
    }
    throw new Error('Nothing found for "' + q + '"');
  }

  // ===== IDENTIFY THE PLAYER'S BUILD =====
  async function identifyBuild(molSys, game) {
    const frag = Builder.collect(molSys, game);
    if (!frag.atoms.length) throw new Error('Nothing bonded yet: bond some atoms in the game first!');
    const molblock = Builder.molblock(frag);
    const notes = frag.notes.slice();

    const rd = await RD.analyze(molblock); // implicit H are filled in by RDKit
    let cid = null;
    if (rd) {
      cid = await PubChem.cidFromSmiles(rd.canonical);
    } else {
      notes.push('RDKit could not read the build (unusual valence?) or is unavailable: asking PubChem directly');
      cid = await PubChem.cidFromMolblock(molblock);
    }

    if (cid) {
      const rec = await lookup(String(cid), 'cid');
      rec.build = { atoms: frag.atoms.length, bonds: frag.bonds.length, smiles: rd ? rd.canonical : '', molblock };
      rec.notes = notes.concat(rec.notes);
      if (!rec.rd && rd) rec.rd = rd;
      return rec;
    }
    if (rd) {
      notes.push('Not in PubChem: a brand-new molecule? Showing RDKit 2D layout');
      return { query: rd.canonical, mode: 'build', cid: null, props: null, sdf: rd.molblock, source: 'rdkit-2d', is3D: false, rd, notes,
        build: { atoms: frag.atoms.length, bonds: frag.bonds.length, smiles: rd.canonical, molblock } };
    }
    throw new Error('Could not identify the build (RDKit rejected it and PubChem found no match)');
  }

  CV.Stage3Chem = {
    version: '3.0.0',
    Elements,
    Cache,
    PubChem,
    RDKit: RD,
    Builder,
    guessMode,
    lookup,
    identifyBuild,
    formulaFromMolblock,
    writeMolblock
  };

  if (typeof console !== 'undefined') console.log('🧬 Stage3Chem loaded (PubChem + RDKit + cache)');
})();
