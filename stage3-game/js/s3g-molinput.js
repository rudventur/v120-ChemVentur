/* ============================================
   🧪 CHEMVENTUR STAGE 3 - ONE MOLECULE INPUT
   ============================================
   CHEMVENTUR.MolInput (also CHEMVENTUR.Stage3Game.MolInput)

   One door for every molecule that goes into, or comes out of, Stage 3:
   the data window search box, "What did I build?", the Scientist and
   Produce bots, and the molecule rain all call this file.

   Accepts (auto-detected, or forced with a prefix such as "smiles:" or "formula:"):
     SMILES (isomeric, aromatic, charged, dotted salts) · InChI · InChIKey ·
     PubChem compound number ("702", "CID 702", "cid:702") · CAS number ·
     common or IUPAC name · molecular formula ("C2H6O", "CO₂", "NH4+")
     · molfile / SDF block pasted in

   RDKit.js runs first, locally, for anything structural (validation,
   canonical SMILES, InChI, InChIKey, formula, mass, charge, 2D drawing),
   so SMILES and molfiles still work when PubChem cannot be reached.
   PubChem PUG REST adds names, synonyms, the compound number, properties
   and the 3D conformer. SMILES, InChI and names are sent with POST, so
   "/", "\", "#" and spaces never break a URL. Requests are throttled,
   time out, retry with backoff on HTTP 503 / 429 / network hiccups, and
   are cached (memory + localStorage through Stage3Chem.Cache).

   resolve(text) -> one normalised record (see makeRecord below).
   No DOM access at load time, so it runs in Node tests as well.
   ============================================ */

(function () {
  'use strict';
  const root = (typeof window !== 'undefined') ? window : globalThis;
  const CV = (root.CHEMVENTUR = root.CHEMVENTUR || {});
  const G = (CV.Stage3Game = CV.Stage3Game || {});

  const PUG = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug';
  const PROPS = 'Title,IUPACName,MolecularFormula,MolecularWeight,ExactMass,SMILES,ConnectivitySMILES,InChI,InChIKey,Charge,XLogP,TPSA';
  const MAX_INPUT = 200000;
  const NEG_TTL_MS = 24 * 3600 * 1000;   // "not in PubChem" answers are re-checked after a day
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const S = () => CV.Stage3Chem;

  const KIND_LABEL = {
    smiles: 'SMILES', inchi: 'InChI', inchikey: 'InChIKey', cid: 'PubChem compound number', cas: 'CAS number',
    name: 'name', formula: 'molecular formula', molfile: 'molfile', build: 'your build'
  };

  // ===== ERRORS THE GAME CAN SHOW AS THEY ARE =====
  class MolInputError extends Error {
    constructor(message, code) { super(message); this.name = 'MolInputError'; this.code = code || 'bad-input'; }
  }

  // ===== SMALL CACHE WRAPPER (negative answers expire after a day) =====
  const mem = new Map();
  const Cache = {
    get(key) {
      const C = S() && S().Cache;
      const e = C ? C.get('mi1:' + key) : mem.get(key);
      if (e === undefined || e === null) return undefined;
      if (e.neg) return (Date.now() - e.neg < NEG_TTL_MS) ? null : undefined;
      return e.v;
    },
    set(key, v) {
      const e = (v === null || v === undefined) ? { neg: Date.now() } : { v };
      const C = S() && S().Cache;
      if (C) C.set('mi1:' + key, e); else mem.set(key, e);
    }
  };

  // ===== NETWORK (PubChem) =====
  const net = {
    fetch: null,           // tests can inject a fake fetch here
    minGapMs: 220,         // PubChem asks for at most 5 requests per second
    timeoutMs: 10000,
    retries: 3,
    backoffMs: 600,
    downForMs: 20000,      // after a network failure, fail fast for a while instead of waiting on every call
    downUntil: 0,
    nextSlot: 0,
    log: [],               // last requests (for tests and the notes line)
    reset() { this.downUntil = 0; this.nextSlot = 0; this.log.length = 0; },
    isDown() { return Date.now() < this.downUntil || (typeof navigator !== 'undefined' && navigator.onLine === false && !this.fetch); }
  };

  class NetError extends Error {
    constructor(message, retryable) { super(message); this.name = 'NetError'; this.retryable = retryable !== false; this.offline = true; }
  }

  async function throttle() {
    const now = Date.now();
    const at = Math.max(now, net.nextSlot);
    net.nextSlot = at + net.minGapMs;
    if (at > now) await sleep(at - now);
  }

  async function pugOnce(path, o) {
    await throttle();
    const f = net.fetch || (typeof fetch !== 'undefined' ? fetch : null);
    if (!f) throw new NetError('no fetch available', false);
    const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), o.timeout || net.timeoutMs) : null;
    const init = { method: o.body != null ? 'POST' : 'GET', signal: ctrl ? ctrl.signal : undefined };
    if (o.body != null) { init.body = o.body; init.headers = { 'Content-Type': 'application/x-www-form-urlencoded' }; }
    net.log.push({ path, method: init.method, t: Date.now() });
    if (net.log.length > 60) net.log.shift();
    let res;
    try {
      res = await f(PUG + path, init);
    } catch (err) {
      if (err && err.name === 'AbortError') throw new NetError('PubChem did not answer in time', true);
      throw new NetError('PubChem cannot be reached (' + ((err && err.message) || err) + ')', true);
    } finally {
      if (timer) clearTimeout(timer);
    }
    if (res.status === 404) return null;
    if (res.status === 400) { const e = new Error('PubChem could not read that input'); e.badRequest = true; e.retryable = false; throw e; }
    if (res.status === 503 || res.status === 429) {
      const e = new NetError('PubChem is busy (HTTP ' + res.status + ')', true); e.offline = false; e.busy = true; throw e;
    }
    if (!res.ok) { const e = new NetError('PubChem answered HTTP ' + res.status, res.status >= 500); e.offline = false; throw e; }
    return o.as === 'text' ? res.text() : res.json();
  }

  // GET or POST to PubChem. null = "not found". Throws NetError when PubChem can't be reached.
  async function pug(path, opts) {
    const o = opts || {};
    if (net.isDown()) throw new NetError('PubChem is unreachable right now (offline?)', true);
    let last = null;
    for (let attempt = 0; attempt <= net.retries; attempt++) {
      try {
        return await pugOnce(path, o);
      } catch (err) {
        if (err.badRequest) return o.badRequestIsNull === false ? Promise.reject(err) : null;
        last = err;
        if (!err.retryable || attempt === net.retries) break;
        await sleep(net.backoffMs * Math.pow(2, attempt) + Math.random() * 150);
      }
    }
    if (last && last.offline) net.downUntil = Date.now() + net.downForMs;
    throw last;
  }

  const form = (k, v) => k + '=' + encodeURIComponent(v);
  const cidList = (json) => {
    const l = json && json.IdentifierList && json.IdentifierList.CID;
    return Array.isArray(l) ? l.filter(c => c > 0) : [];
  };
  const num = (v) => { if (v === undefined || v === null || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null; };

  async function cached(key, fn) {
    const hit = Cache.get(key);
    if (hit !== undefined) return { v: hit, cache: true };
    const v = await fn();
    Cache.set(key, v);
    return { v, cache: false };
  }

  const PubChem = {
    // every *Cids returns { v: [cid…] | null, cache }
    smilesCids: (smi) => cached('smi:' + smi, async () => { const l = cidList(await pug('/compound/smiles/cids/JSON', { body: form('smiles', smi) })); return l.length ? l : null; }),
    inchiCids: (inchi) => cached('inchi:' + inchi, async () => { const l = cidList(await pug('/compound/inchi/cids/JSON', { body: form('inchi', inchi) })); return l.length ? l : null; }),
    inchikeyCids: (key) => cached('ikey:' + key, async () => { const l = cidList(await pug('/compound/inchikey/' + encodeURIComponent(key) + '/cids/JSON')); return l.length ? l : null; }),
    nameCids: (name) => cached('name:' + name.toLowerCase(), async () => { const l = cidList(await pug('/compound/name/cids/JSON', { body: form('name', name) })); return l.length ? l : null; }),
    formulaCids: (f, max) => cached('formula:' + f + ':' + (max || 10), async () => {
      let json = null;
      try { json = await pug('/compound/fastformula/' + encodeURIComponent(f) + '/cids/JSON?MaxRecords=' + (max || 10)); }
      catch (e) { if (e.offline || e.busy) throw e; json = null; }    // PubChem answers 500 for impossible formulas
      const l = cidList(json); return l.length ? l : null;
    }),
    molblockCids: (mb) => cached('sdf:' + hash(mb), async () => { const l = cidList(await pug('/compound/sdf/cids/JSON', { body: form('sdf', mb.replace(/\s*$/, '') + '\n$$$$\n') })); return l.length ? l : null; }),

    async props(cids) {
      const list = [].concat(cids).map(c => parseInt(c, 10)).filter(c => c > 0);
      const out = {}, need = [];
      let fromCache = true;
      list.forEach(c => { const h = Cache.get('props:' + c); if (h !== undefined) out[c] = h; else need.push(c); });
      if (need.length) {
        fromCache = false;
        const json = await pug('/compound/cid/' + need.join(',') + '/property/' + PROPS + '/JSON');
        const rows = (json && json.PropertyTable && json.PropertyTable.Properties) || [];
        rows.forEach(p => {
          const v = {
            cid: p.CID, title: p.Title || p.IUPACName || ('CID ' + p.CID), iupac: p.IUPACName || '',
            formula: p.MolecularFormula || '', mw: num(p.MolecularWeight), exactMass: num(p.ExactMass),
            smiles: p.SMILES || p.IsomericSMILES || p.CanonicalSMILES || p.ConnectivitySMILES || '',
            connectivitySmiles: p.ConnectivitySMILES || p.CanonicalSMILES || '',
            inchi: p.InChI || '', inchikey: p.InChIKey || '', charge: num(p.Charge), xlogp: num(p.XLogP), tpsa: num(p.TPSA)
          };
          out[p.CID] = v; Cache.set('props:' + p.CID, v);
        });
        need.forEach(c => { if (!(c in out)) { out[c] = null; Cache.set('props:' + c, null); } });
      }
      return { v: out, cache: fromCache };
    },
    sdf: (cid, dim) => cached('sdf' + dim + ':' + cid, async () => {
      const t = await pug('/compound/cid/' + cid + '/record/SDF?record_type=' + dim, { as: 'text' });
      return (t && t.indexOf('M  END') !== -1) ? t : null;
    }),
    synonyms: (cid) => cached('syn:' + cid, async () => {
      const j = await pug('/compound/cid/' + cid + '/synonyms/JSON');
      const info = j && j.InformationList && j.InformationList.Information && j.InformationList.Information[0];
      return info && info.Synonym ? info.Synonym.slice(0, 12) : null;
    }),
    compoundUrl: (cid) => 'https://pubchem.ncbi.nlm.nih.gov/compound/' + parseInt(cid, 10)
  };

  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36) + ':' + s.length; }

  // ===== TEXT CLEAN-UP =====
  const SUB = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9', '₊': '+', '₋': '-',
    '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁺': '+', '⁻': '-' };
  function clean(text) {
    let s = String(text == null ? '' : text);
    if (s.length > MAX_INPUT) throw new MolInputError('That is too long to be one molecule (' + s.length + ' characters)', 'too-long');
    s = s.replace(/^\uFEFF/, '').replace(/[\u200B-\u200D\u2060]/g, '');
    if (isMolfile(s)) return { text: s.replace(/\r\n?/g, '\n').replace(/^\s*\n/, '\n'), molfile: true };
    s = s.replace(/[₀-₉₊₋⁰¹²³⁴-⁹⁺⁻]/g, c => SUB[c] || c);
    try { s = s.normalize('NFKC'); } catch (e) {}
    s = s.replace(/[\u2010-\u2015\u2212\uFE63\uFF0D]/g, '-')     // dashes and the unicode minus
      .replace(/[\u00A0\u2000-\u200A\u202F\u3000\t]/g, ' ')
      .replace(/\s+/g, ' ').trim()
      .replace(/^["'“”‘’`]+|["'“”‘’`]+$/g, '').trim();
    if (/[\u0000-\u001F\u007F]/.test(s)) throw new MolInputError('That text has hidden control characters: retype it', 'control-chars');
    return { text: s, molfile: false };
  }
  function isMolfile(s) { return /(^|\n)M {2}END/.test(s) || (/\n/.test(s) && /V[23]000/.test(s)); }

  // ===== DETECTION =====
  const ELEMENTS = new Set(('H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr ' +
    'Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg ' +
    'Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og D T').split(' '));
  const PREFIX = /^(smiles|smi|inchikey|inchi|ikey|cid|pubchem|cas|formula|name|iupac|molfile|mol|sdf)\s*[:=]\s*/i;

  // "C2H6O", "CO2", "NH4+", "Ca(OH)2", "SO4 2-"  ->  { formula, charge } | null
  function parseFormula(s) {
    const m = /^((?:[A-Z][a-z]?\d*|\((?:[A-Z][a-z]?\d*)+\)\d*)+)\s*(?:\^\s*(\d*)([+-])|(\d*)([+-])$|([+-])(\d*))?$/.exec(s);
    if (!m) return null;
    if (/[A-Za-z)]1(?!\d)/.test(m[1])) return null;          // nobody writes a count of 1: "C1CC" is a SMILES ring, not a formula
    const symbols = m[1].match(/[A-Z][a-z]?/g) || [];
    if (!symbols.every(x => ELEMENTS.has(x))) return null;
    let charge = 0;
    if (m[3]) charge = (m[3] === '+' ? 1 : -1) * (parseInt(m[2] || '1', 10));
    if (m[5]) charge = (m[5] === '+' ? 1 : -1) * (parseInt(m[4] || '1', 10));
    if (m[6]) charge = (m[6] === '+' ? 1 : -1) * (parseInt(m[7] || '1', 10));
    // Hill order with expanded brackets, so "Ca(OH)2" -> "CaH2O2"
    const counts = {};
    const walk = (str, mult) => {
      const re = /\(([^()]+)\)(\d*)|([A-Z][a-z]?)(\d*)/g; let t;
      while ((t = re.exec(str))) {
        if (t[1]) walk(t[1], mult * (parseInt(t[2] || '1', 10)));
        else counts[t[3]] = (counts[t[3]] || 0) + mult * parseInt(t[4] || '1', 10);
      }
    };
    walk(m[1], 1);
    const keys = Object.keys(counts).sort((a, b) => {
      if (counts.C) { if (a === 'C') return -1; if (b === 'C') return 1; if (a === 'H') return -1; if (b === 'H') return 1; }
      return a < b ? -1 : a > b ? 1 : 0;
    });
    const hill = keys.map(k => k + (counts[k] > 1 ? counts[k] : '')).join('');
    return { formula: hill + (charge ? (Math.abs(charge) > 1 ? Math.abs(charge) : '') + (charge > 0 ? '+' : '-') : ''), hill, charge, counts };
  }

  function casValid(s) {
    const m = /^(\d{2,7})-(\d{2})-(\d)$/.exec(s);
    if (!m) return false;
    const digits = (m[1] + m[2]).split('').reverse();
    const sum = digits.reduce((acc, d, i) => acc + (i + 1) * parseInt(d, 10), 0);
    return sum % 10 === parseInt(m[3], 10);
  }

  // SMILES ring numbers come in pairs ("C1CC1"); a formula digit stands alone ("CO2")
  function ringsPaired(s) {
    const n = {};
    s.replace(/\[[^\]]*\]/g, '').replace(/%(\d\d)|(\d)/g, (m, two, one) => { const k = two || one; n[k] = (n[k] || 0) + 1; return m; });
    return Object.keys(n).every(k => n[k] % 2 === 0);
  }
  const SMILES_CHARS = /^[A-Za-z0-9@+\-\[\]()=#$:\/\\%.*~]+$/;
  const SMILES_ONLY = /[=#()\[\]@\/\\%.]/;

  // Returns { kind, value, alt?, forced? }. `rdkitOk(smiles)` is optional (true / false / null when RDKit is missing).
  function detect(text, rdkitOk) {
    let c = clean(text), s = c.text;
    if (!s) throw new MolInputError('Type or paste a molecule: SMILES, InChI, InChIKey, name, formula, compound number, CAS number or a molfile', 'empty');
    if (c.molfile) return { kind: 'molfile', value: s };
    if (/^InChI=/i.test(s)) {
      s = 'InChI=' + s.slice(6).replace(/\s+/g, '');
      if (!/^InChI=1S?\/[^\s]+$/.test(s)) throw new MolInputError('That InChI looks cut off: it should start "InChI=1S/" followed by the formula', 'bad-inchi');
      return { kind: 'inchi', value: s };
    }
    const p = PREFIX.exec(s);
    let forced = null;
    if (p) {
      forced = p[1].toLowerCase();
      s = s.slice(p[0].length).trim();
      forced = { smi: 'smiles', ikey: 'inchikey', pubchem: 'cid', iupac: 'name', mol: 'molfile', sdf: 'molfile' }[forced] || forced;
      if (forced === 'inchi' && !/^InChI=/i.test(s)) s = 'InChI=' + s;
      if (!s) throw new MolInputError('Nothing after "' + p[0].trim() + '": type the ' + (KIND_LABEL[forced] || forced) + ' too', 'empty');
    }
    if (/^1S?\/[A-Z]/.test(s) && !forced) return { kind: 'inchi', value: 'InChI=' + s.replace(/\s+/g, '') };
    if (/^[A-Za-z]{14}-[A-Za-z]{10}-[A-Za-z]$/.test(s) && (!forced || forced === 'inchikey')) return { kind: 'inchikey', value: s.toUpperCase() };
    if (forced === 'inchikey') throw new MolInputError('An InChIKey looks like LFQSCWFLJHTTHZ-UHFFFAOYSA-N (14 letters, 10 letters, 1 letter)', 'bad-inchikey');
    const cidM = /^(?:pubchem\s*)?(?:cid)?\s*[:#]?\s*(\d{1,10})$/i.exec(s);
    if (cidM && (!forced || forced === 'cid')) {
      const cid = parseInt(cidM[1], 10);
      if (!(cid > 0)) throw new MolInputError('Compound numbers start at 1', 'bad-cid');
      return { kind: 'cid', value: cid };
    }
    if (forced === 'cid') throw new MolInputError('A PubChem compound number is just digits, like 702 or CID 702', 'bad-cid');
    if (/^\d{2,7}-\d{2}-\d$/.test(s) && (!forced || forced === 'cas')) {
      if (!casValid(s)) throw new MolInputError('"' + s + '" looks like a CAS number but its check digit is wrong: check for a typo', 'bad-cas');
      return { kind: 'cas', value: s };
    }
    if (forced === 'cas') throw new MolInputError('A CAS number looks like 64-17-5 (digits-two digits-one check digit)', 'bad-cas');
    if (forced === 'name') return { kind: 'name', value: s, forced: true };
    if (forced === 'formula') {
      const f = parseFormula(s.replace(/\s+/g, ''));
      if (!f) throw new MolInputError('"' + s + '" is not a formula made of real element symbols (like C2H6O or NaCl)', 'bad-formula');
      return { kind: 'formula', value: f.formula, formula: f, forced: true };
    }
    if (forced === 'smiles') return { kind: 'smiles', value: s.replace(/\s+/g, ''), forced: true };
    if (forced === 'molfile') throw new MolInputError('A molfile needs its lines, ending with "M  END": paste the whole block', 'bad-molfile');

    if (/\s/.test(s)) {
      const sp = /^(\S+)\s+(\d*[+-]|[+-]\d*)$/.exec(s);                                        // "SO4 2-", "NH4 +"
      const f = sp ? parseFormula(sp[1] + (/^\d/.test(sp[2]) ? '^' + sp[2] : sp[2])) : null;
      if (f) return { kind: 'formula', value: f.formula, formula: f };
      return { kind: 'name', value: s };
    }
    const looksSmiles = SMILES_CHARS.test(s);
    const f = parseFormula(s);
    const rd = looksSmiles && rdkitOk ? rdkitOk(s) : null;
    if (rd === true) {
      // valid SMILES; if it is also a formula ("CO", "NO", "CCO"), offer the formula reading too
      return (f && /^[A-Z]{2}$/.test(s) && s[0] !== s[1])
        ? { kind: 'smiles', value: s, alt: { kind: 'formula', value: f.formula } } : { kind: 'smiles', value: s };
    }
    if (rd === null && looksSmiles && !/H/.test(s) && ringsPaired(s) && (SMILES_ONLY.test(s) || /^(Cl|Br|[BCNOPSFI]|[cnops]|\d)+$/.test(s))) return { kind: 'smiles', value: s };
    if (f) return { kind: 'formula', value: f.formula, formula: f };
    if (rd === false && looksSmiles && /\d/.test(s) && !ringsPaired(s) && !/[-,]/.test(s)) return { kind: 'smiles', value: s, invalid: true };
    if (rd === false && SMILES_ONLY.test(s) && !/^[A-Za-z][a-z]{3,}/.test(s)) return { kind: 'smiles', value: s, invalid: true };
    if (rd === null && looksSmiles && SMILES_ONLY.test(s)) return { kind: 'smiles', value: s };
    return { kind: 'name', value: s };
  }

  // ===== RDKIT (local, works offline once the library is loaded) =====
  let R = null, rdTried = false;
  async function rdkit() {
    if (Api.rdkitOverride !== undefined) return Api.rdkitOverride;
    if (R) return R;
    const loader = S() && S().RDKit;
    if (!loader) return null;
    R = await loader.get();
    rdTried = true;
    return R;
  }
  function getMol(Rk, input) {
    let m = null;
    try { m = Rk.get_mol(input); } catch (e) { m = null; }
    if (m && typeof m.is_valid === 'function' && !m.is_valid()) { try { m.delete(); } catch (e) {} m = null; }
    return m;
  }
  function smilesOk(s) {
    if (!R) return null;
    const m = getMol(R, s);
    if (!m) return false;
    m.delete();
    return true;
  }

  // Parse V2000 molblock with charges: { atoms:[{symbol,x,y,z,charge}], bonds:[{a,b,order}], has3D }
  function parseMol(text) {
    const lines = String(text || '').split(/\r?\n/);
    const nA = parseInt((lines[3] || '').substring(0, 3), 10), nB = parseInt((lines[3] || '').substring(3, 6), 10);
    if (!(nA > 0) || !/V2000/.test(lines[3] || 'V2000')) return null;
    const atoms = [], bonds = [];
    const OLD = { 1: 3, 2: 2, 3: 1, 5: -1, 6: -2, 7: -3 };
    for (let i = 0; i < nA; i++) {
      const l = lines[4 + i] || '';
      atoms.push({ x: parseFloat(l.substring(0, 10)) || 0, y: parseFloat(l.substring(10, 20)) || 0, z: parseFloat(l.substring(20, 30)) || 0,
        symbol: l.substring(31, 34).trim(), charge: OLD[parseInt(l.substring(36, 39), 10)] || 0 });
    }
    for (let i = 0; i < (nB || 0); i++) {
      const l = lines[4 + nA + i] || '';
      const a = parseInt(l.substring(0, 3), 10) - 1, b = parseInt(l.substring(3, 6), 10) - 1;
      const order = parseInt(l.substring(6, 9), 10) || 1;
      if (a >= 0 && b >= 0 && a < nA && b < nA) bonds.push({ a, b, order: order === 4 ? 1.5 : Math.min(3, order) });
    }
    let chgSeen = false;
    for (let i = 4 + nA + (nB || 0); i < lines.length; i++) {
      const l = lines[i];
      if (/^M {2}END/.test(l)) break;
      if (/^M {2}CHG/.test(l)) {
        if (!chgSeen) { atoms.forEach(a => { a.charge = 0; }); chgSeen = true; }
        const parts = l.substring(6).trim().split(/\s+/).map(Number);
        for (let k = 1; k + 1 < parts.length; k += 2) if (atoms[parts[k] - 1]) atoms[parts[k] - 1].charge = parts[k + 1];
      }
    }
    return { atoms, bonds, has3D: atoms.some(a => Math.abs(a.z) > 1e-3) };
  }

  function hill(atoms, charge) {
    const c = {};
    atoms.forEach(a => { c[a.symbol] = (c[a.symbol] || 0) + 1; });
    const keys = Object.keys(c).sort((a, b) => {
      if (c.C) { if (a === 'C') return -1; if (b === 'C') return 1; if (a === 'H') return -1; if (b === 'H') return 1; }
      return a < b ? -1 : a > b ? 1 : 0;
    });
    return keys.map(k => k + (c[k] > 1 ? c[k] : '')).join('') + (charge ? (Math.abs(charge) > 1 ? Math.abs(charge) : '') + (charge > 0 ? '+' : '-') : '');
  }

  // SMILES or molblock -> structural facts from RDKit, or null (with .why) when RDKit can't read it.
  async function rdkitFacts(input, opts) {
    const Rk = await rdkit();
    if (!Rk) return { missing: true };
    const m = getMol(Rk, input);
    if (!m) return null;
    try {
      const o = opts || {};
      let canonical = '', flat = '';
      try { if (o.removeHs !== false && typeof m.remove_hs_in_place === 'function') m.remove_hs_in_place(); } catch (e) {}
      canonical = m.get_smiles();
      try { flat = m.get_smiles(JSON.stringify({ doIsomericSmiles: false })); } catch (e) { flat = canonical; }
      if (!flat) flat = canonical;
      let inchi = '', inchikey = '';
      try { inchi = m.get_inchi() || ''; } catch (e) {}
      try { if (inchi && typeof Rk.get_inchikey_for_inchi === 'function') inchikey = Rk.get_inchikey_for_inchi(inchi) || ''; } catch (e) {}
      let desc = null;
      try { desc = JSON.parse(m.get_descriptors()); } catch (e) {}
      let svg = '';
      try { svg = m.get_svg(300, 220); } catch (e) {}
      let mbH = '';
      try { mbH = m.add_hs(); } catch (e) { mbH = ''; }
      const parsed = parseMol(mbH) || { atoms: [], bonds: [] };
      const charge = parsed.atoms.reduce((s, a) => s + (a.charge || 0), 0);
      return {
        canonical, flat, inchi, inchikey, svg, molblock2D: mbH, parsed, charge,
        formula: parsed.atoms.length ? hill(parsed.atoms, charge) : '',
        mw: desc && num(desc.amw), exactMass: desc && num(desc.exactmw)
      };
    } finally { try { m.delete(); } catch (e) {} }
  }

  // ===== THE RECORD =====
  function makeRecord(input, kind) {
    return {
      input: typeof input === 'string' ? input : '', kind, kindLabel: KIND_LABEL[kind] || kind,
      smiles: '',            // canonical isomeric SMILES (RDKit when it ran, else PubChem)
      flatSmiles: '',        // without stereo marks
      inchi: '', inchikey: '', cid: null, name: '', iupac: '', synonyms: [],
      formula: '', mass: null, exactMass: null, charge: 0, xlogp: null, tpsa: null,
      atoms: [], bonds: [],  // [{symbol,x,y,z,charge}] (Å), [{a,b,order}] with explicit hydrogens
      coords3D: false,       // true when atoms carry real 3D coordinates (PubChem conformer or a 3D molfile)
      molblock: '',          // best molblock for the 3D shapes (3D when we have it)
      molblock2D: '', svg: '',
      choices: [],           // other matches (formula search, an InChIKey shared by several entries…)
      alt: null,             // another reading of the same text (e.g. "CO" as SMILES or as a formula)
      sources: { rdkit: false, pubchem: false, cache: false, pubchem3D: false, offline: false },
      notes: []
    };
  }

  function applyFacts(rec, f) {
    rec.sources.rdkit = true;
    rec.smiles = f.canonical; rec.flatSmiles = f.flat;
    rec.inchi = rec.inchi || f.inchi; rec.inchikey = rec.inchikey || f.inchikey;
    rec.formula = rec.formula || f.formula; rec.charge = f.charge;
    rec.mass = rec.mass != null ? rec.mass : f.mw; rec.exactMass = rec.exactMass != null ? rec.exactMass : f.exactMass;
    rec.svg = f.svg; rec.molblock2D = f.molblock2D;
    if (!rec.atoms.length) { rec.atoms = f.parsed.atoms; rec.bonds = f.parsed.bonds; rec.molblock = f.molblock2D; }
  }

  function applyProps(rec, p) {
    if (!p) return;
    rec.sources.pubchem = true;
    rec.cid = p.cid; rec.name = p.title; rec.iupac = p.iupac;
    rec.formula = p.formula || rec.formula;
    if (p.mw != null) rec.mass = p.mw;
    if (p.exactMass != null) rec.exactMass = p.exactMass;
    if (p.charge != null) rec.charge = p.charge;
    rec.xlogp = p.xlogp; rec.tpsa = p.tpsa;
    if (!rec.smiles) rec.smiles = p.smiles;
    if (!rec.flatSmiles) rec.flatSmiles = p.connectivitySmiles || p.smiles;
    rec.pubchemSmiles = p.smiles;
    if (!rec.inchi) rec.inchi = p.inchi;
    if (p.inchikey) rec.inchikey = p.inchikey;
    rec.props = p;
  }

  const isNet = (e) => e && (e.name === 'NetError' || e.offline || e.busy);

  // Resolve a list of CIDs into props; first one wins, the rest become choices.
  async function propsFor(rec, cids, maxChoices) {
    const list = cids.slice(0, maxChoices || 10);
    const r = await PubChem.props(list);
    if (r.cache) rec.sources.cache = true;
    const rows = list.map(c => r.v[c]).filter(Boolean);
    if (rows.length > 1) rec.choices = rows.map(p => ({ cid: p.cid, name: p.title, formula: p.formula, smiles: p.smiles }));
    return rows[0] || null;
  }

  async function add3D(rec, opts) {
    if (!rec.cid || (opts && opts.want3D === false)) return;
    let sdf = null;
    try { const r = await PubChem.sdf(rec.cid, '3d'); sdf = r.v; if (r.cache) rec.sources.cache = true; }
    catch (e) { if (!isNet(e)) throw e; rec.notes.push('PubChem 3D shape could not be fetched (' + e.message + ')'); return; }
    if (!sdf) { rec.notes.push('PubChem has no 3D shape for CID ' + rec.cid + ' (common for salts, metals and very big or floppy molecules)'); return; }
    const p = parseMol(sdf);
    if (!p) return;
    rec.atoms = p.atoms; rec.bonds = p.bonds; rec.coords3D = true; rec.molblock = sdf; rec.sources.pubchem3D = true;
  }

  async function needPubChem(rec, what) {
    throw new MolInputError(what + ' needs PubChem to turn it into a structure, and PubChem cannot be reached right now. SMILES and molfiles still work offline.', 'offline');
  }

  // ===== MAIN ENTRY =====
  // resolve(text, { kind?: force a kind, want3D?: default true, synonyms?: default false, pick?: cid from a choice list })
  async function resolve(text, opts) {
    const o = Object.assign({ want3D: true, synonyms: false }, opts || {});
    await rdkit();                                        // so detection can ask RDKit "is this a SMILES?"
    let d;
    if (o.kind && o.kind !== 'auto') {
      const pre = { smiles: 'smiles:', inchi: 'inchi:', inchikey: 'inchikey:', cid: 'cid:', cas: 'cas:', name: 'name:', formula: 'formula:', molfile: '' }[o.kind];
      d = detect((o.kind === 'molfile' ? '' : (pre || '')) + String(text == null ? '' : text), smilesOk);
    } else d = detect(text, smilesOk);
    const rec = makeRecord(String(text == null ? '' : text), d.kind);
    rec.value = d.value;
    if (d.alt) {
      rec.alt = d.alt;
      rec.notes.push('Read "' + d.value + '" as SMILES. For the formula ' + d.alt.value + ' type "formula: ' + d.alt.value + '"');
    }

    try {
      switch (d.kind) {
        case 'smiles': case 'molfile': await resolveStructure(rec, d, o); break;
        case 'inchi': await resolveByCids(rec, () => PubChem.inchiCids(d.value), 'That InChI', o); break;
        case 'inchikey': await resolveByCids(rec, () => PubChem.inchikeyCids(d.value), 'That InChIKey', o); break;
        case 'cid': await resolveByCids(rec, async () => ({ v: [d.value] }), 'Compound ' + d.value, o); break;
        case 'cas': await resolveByCids(rec, () => PubChem.nameCids(d.value), 'CAS ' + d.value, o); break;
        case 'formula': await resolveByCids(rec, () => PubChem.formulaCids(d.formula ? d.formula.formula.replace(/(\d*)([+-])$/, '') : d.value, 10), 'The formula ' + d.value, o, true); break;
        default: await resolveByCids(rec, () => PubChem.nameCids(d.value), '"' + d.value + '"', o);
      }
    } catch (e) {
      if (isNet(e)) await needPubChem(rec, KIND_LABEL[d.kind] ? 'A ' + KIND_LABEL[d.kind] : 'That');
      throw e;
    }
    if (o.synonyms && rec.cid) {
      try { const s = await PubChem.synonyms(rec.cid); rec.synonyms = s.v || []; } catch (e) { /* optional */ }
    }
    if (!rec.name && !rec.cid) rec.name = '';
    return rec;
  }

  async function resolveStructure(rec, d, o) {
    const facts = await rdkitFacts(d.value, { removeHs: true });
    let inputParsed = null;
    if (d.kind === 'molfile') {
      inputParsed = parseMol(d.value);
      if (!inputParsed && !/V3000/.test(d.value)) throw new MolInputError('That molfile could not be read: check the counts line (4th line) and that it ends with "M  END"', 'bad-molfile');
    }
    if (facts && facts.missing) {
      rec.notes.push('RDKit is not loaded: asking PubChem directly');
    } else if (!facts) {
      if (d.kind === 'molfile') throw new MolInputError('RDKit could not read that molfile (odd valence or a broken bond line?)', 'bad-molfile');
      // RDKit said no. A clear typo (open branch, ring or bracket) is reported straight away;
      // anything else gets one go with PubChem's more forgiving parser before we call it bad input
      const why = smilesHelp(d.value);
      if (!/could not read/.test(why)) throw new MolInputError(why, 'bad-smiles');
      let alt = null;
      try { alt = await PubChem.smilesCids(d.value); } catch (e) { if (!isNet(e)) throw e; }
      if (alt && alt.v) { rec.notes.push('RDKit could not read that SMILES, but PubChem could'); return finishCids(rec, alt.v, o); }
      throw new MolInputError(smilesHelp(d.value), 'bad-smiles');
    } else {
      applyFacts(rec, facts);
      if (inputParsed && inputParsed.has3D) { rec.atoms = inputParsed.atoms; rec.bonds = inputParsed.bonds; rec.coords3D = true; rec.molblock = d.value; }
    }
    // PubChem: InChIKey first (exact, stereo aware, no encoding trouble), then the SMILES by POST
    let cids = null;
    try {
      if (rec.inchikey) { const r = await PubChem.inchikeyCids(rec.inchikey); cids = r.v; if (r.cache) rec.sources.cache = true; }
      if (!cids && (rec.smiles || d.kind === 'smiles')) { const r = await PubChem.smilesCids(rec.smiles || d.value); cids = r.v; if (r.cache) rec.sources.cache = true; }
      if (!cids && rec.flatSmiles && rec.flatSmiles !== rec.smiles) {
        const r = await PubChem.smilesCids(rec.flatSmiles); cids = r.v;
        if (cids) rec.notes.push('PubChem knows this without the stereo marks: showing the closest match');
      }
      if (!cids && d.kind === 'molfile' && !rec.sources.rdkit) { const r = await PubChem.molblockCids(d.value); cids = r.v; }
    } catch (e) {
      if (!isNet(e)) throw e;
      if (!rec.sources.rdkit) throw e;
      rec.sources.offline = true;
      rec.notes.push('PubChem cannot be reached (' + e.message + '): the structure comes from RDKit only, without a name');
      return rec;
    }
    if (!cids) {
      rec.notes.push('Not in PubChem: a brand-new molecule? Shape and facts come from RDKit');
      return rec;
    }
    return finishCids(rec, cids, o, true);
  }

  async function finishCids(rec, cids, o, keepStructure) {
    let p = null;
    try { p = await propsFor(rec, cids, 10); }
    catch (e) {
      if (!isNet(e) || !rec.sources.rdkit) throw e;
      rec.sources.offline = true; rec.notes.push('PubChem stopped answering (' + e.message + ')'); return rec;
    }
    if (!p) { rec.notes.push('PubChem has no entry for compound ' + cids[0]); return rec; }
    if (cids.length > 1 && !rec.choices.length) rec.choices = [{ cid: p.cid, name: p.title, formula: p.formula }];
    applyProps(rec, p);
    if (!rec.sources.rdkit && p.smiles) {
      const f = await rdkitFacts(p.smiles);
      if (f && !f.missing) applyFacts(rec, f);
    }
    if (!(keepStructure && rec.coords3D)) await add3D(rec, o);
    if (!rec.atoms.length) {
      try { const r = await PubChem.sdf(rec.cid, '2d'); const pm = r.v && parseMol(r.v); if (pm) { rec.atoms = pm.atoms; rec.bonds = pm.bonds; rec.molblock = r.v; } } catch (e) {}
    }
    return rec;
  }

  async function resolveByCids(rec, getCids, what, o, isFormula) {
    let r;
    try { r = await getCids(); }
    catch (e) { throw e; }
    if (r.cache) rec.sources.cache = true;
    let cids = r.v;
    if (o.pick) cids = [parseInt(o.pick, 10)].concat((cids || []).filter(c => c !== parseInt(o.pick, 10)));
    if (!cids || !cids.length) {
      const hint = isFormula ? ' (no compound in PubChem has exactly that formula)' : rec.kind === 'name' ? ': check the spelling, or paste a SMILES' : '';
      throw new MolInputError(what + ' is not in PubChem' + hint, 'not-found');
    }
    const p = await propsFor(rec, cids, isFormula ? 10 : 10);
    if (!p) throw new MolInputError(what + ' is not in PubChem', 'not-found');
    if (isFormula && rec.choices.length > 1) rec.notes.push(rec.choices.length + ' compounds share ' + p.formula + ': showing ' + p.title + '. Pick another one below');
    else if (cids.length > 1 && rec.kind === 'inchikey') rec.notes.push(cids.length + ' PubChem entries share this InChIKey: showing the first');
    rec.choices = isFormula ? rec.choices : (rec.kind === 'inchikey' ? rec.choices : []);
    applyProps(rec, p);
    if (p.smiles) {
      const f = await rdkitFacts(p.smiles);
      if (f && !f.missing) applyFacts(rec, f);
      else if (f && f.missing) rec.notes.push('RDKit is not loaded: no 2D drawing');
    }
    await add3D(rec, o);
    if (!rec.atoms.length) {
      try { const s2 = await PubChem.sdf(rec.cid, '2d'); const pm = s2.v && parseMol(s2.v); if (pm) { rec.atoms = pm.atoms; rec.bonds = pm.bonds; rec.molblock = s2.v; } } catch (e) {}
    }
    return rec;
  }

  function smilesHelp(s) {
    const open = (s.match(/\(/g) || []).length, close = (s.match(/\)/g) || []).length;
    const ob = (s.match(/\[/g) || []).length, cb = (s.match(/\]/g) || []).length;
    if (open !== close) return 'That SMILES has ' + open + ' "(" but ' + close + ' ")": a branch is not closed';
    if (ob !== cb) return 'That SMILES has an unclosed "[" bracket atom';
    const rings = {};
    s.replace(/\[[^\]]*\]/g, '').replace(/%(\d\d)|(\d)/g, (m, two, one) => { const k = two || one; rings[k] = (rings[k] || 0) + 1; return m; });
    const odd = Object.keys(rings).filter(k => rings[k] % 2);
    if (odd.length) return 'That SMILES opens ring ' + odd.join(', ') + ' but never closes it';
    return 'RDKit and PubChem could not read "' + (s.length > 40 ? s.slice(0, 40) + '…' : s) + '" as SMILES or a name: check the atoms and the valences';
  }

  // ===== GAME HELPERS =====
  // A game build (molblock from World.toMolblock) -> record. Hydrogens the player left out are implicit.
  async function fromBuild(molblock, opts) {
    const o = Object.assign({ want3D: true }, opts || {});
    const rec = makeRecord('', 'build');
    rec.value = molblock;
    const facts = await rdkitFacts(molblock, { removeHs: true });
    if (facts && !facts.missing) {
      applyFacts(rec, facts);
      // a game build has no real stereo: search by the plain SMILES so random 3D poses don't invent chirality
      rec.smiles = facts.flat; rec.inchikey = '';
      try { const ff = await rdkitFacts(facts.flat); if (ff && !ff.missing) { rec.inchi = ff.inchi; rec.inchikey = ff.inchikey; } } catch (e) {}
    } else rec.notes.push('RDKit could not read it (odd valence?) or is unavailable: asked PubChem directly');
    let cids = null;
    try {
      if (rec.inchikey) cids = (await PubChem.inchikeyCids(rec.inchikey)).v;
      if (!cids && rec.smiles) cids = (await PubChem.smilesCids(rec.smiles)).v;
      if (!cids && !rec.sources.rdkit) cids = (await PubChem.molblockCids(molblock)).v;
    } catch (e) {
      if (!isNet(e) || !rec.sources.rdkit) throw e;
      rec.sources.offline = true;
      rec.notes.push('PubChem cannot be reached: RDKit says ' + rec.formula + ' (' + rec.smiles + ')');
      return rec;
    }
    if (!cids) { if (rec.sources.rdkit) rec.notes.push('Not in PubChem: a brand-new molecule?'); return rec; }
    return finishCids(rec, cids, o, false);
  }

  // Molecule in game -> canonical SMILES (RDKit), or '' when RDKit is missing
  async function toSmiles(molblock) {
    const f = await rdkitFacts(molblock, { removeHs: true });
    return f && !f.missing ? f.flat : '';
  }

  // parsed shape for World.spawnMolecule
  const toSpawn = (rec) => rec && rec.atoms && rec.atoms.length ? { atoms: rec.atoms.map(a => ({ symbol: a.symbol, x: a.x, y: a.y, z: a.z || 0 })), bonds: rec.bonds.map(b => ({ a: b.a, b: b.b, order: Math.max(1, Math.round(b.order)) })) } : null;

  // quick "what is this?" for a live hint under the search box (no network)
  function guess(text) {
    try { const d = detect(text, smilesOk); return { kind: d.kind, label: KIND_LABEL[d.kind] + (d.invalid ? ' (not valid)' : ''), value: d.value, alt: d.alt || null }; }
    catch (e) { return { kind: 'error', label: e.message, error: e.message }; }
  }

  const Api = {
    version: '1.0.0',
    resolve, fromBuild, toSmiles, toSpawn, detect: (t) => detect(t, smilesOk), guess, clean, parseFormula, casValid, parseMol,
    PubChem, Cache, net, rdkit, rdkitOverride: undefined, MolInputError, KIND_LABEL,
    get rdkitReady() { return !!R; }
  };
  CV.MolInput = Api;
  G.MolInput = Api;
  if (typeof console !== 'undefined') console.log('🧪 MolInput loaded (SMILES, InChI, InChIKey, CID, CAS, name, formula, molfile)');
})();
