/* ============================================
   🚀 CHEMVENTUR STAGE 3 GAME - CORE
   ============================================
   Namespace, config, element data (CPK colours, covalent radii, valence),
   tiny vector helpers, Hill formulas and SDF/molblock parsing.
   No DOM / three.js here, so it also runs in Node for tests.
   ============================================ */

(function () {
  'use strict';
  const root = (typeof window !== 'undefined') ? window : globalThis;
  const CV = (root.CHEMVENTUR = root.CHEMVENTUR || {});
  const G = (CV.Stage3Game = CV.Stage3Game || {});

  G.version = '0.1.0';

  G.Config = {
    THREE_URLS: [
      'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.min.js',
      'https://unpkg.com/three@0.169.0/build/three.module.min.js'
    ],
    WORLD_PER_ANGSTROM: 2.0,   // 1 Å = 2 world units
    ARENA_RADIUS: 90,
    MAX_ATOMS: 260,
    START_ATOMS: 70,
    SHIP_ACCEL: 38,
    SHIP_MAX_SPEED: 32,
    SHIP_TURN: 1.8,            // rad/s
    ATOM_SPEED: 36,
    BLASTER_SPEED: 70,
    DOT_SPEED: 46,
    DOT_LIFE: 2.6,
    C2C_INTERVAL: 0.085,       // seconds between dots in a c2c series
    RAIN_INTERVAL: 4.5,
    BOND_K: 14,
    PALETTE: ['H', 'C', 'N', 'O', 'F', 'P', 'S', 'Cl', 'Na', 'Br']
  };

  // ===== ELEMENTS: CPK (Jmol) colour, covalent radius (Å), default valence =====
  const E = {
    H:  ['#ffffff', 0.31, 1], He: ['#d9ffff', 0.28, 0], Li: ['#cc80ff', 1.28, 1], Be: ['#c2ff00', 0.96, 2],
    B:  ['#ffb5b5', 0.84, 3], C:  ['#909090', 0.76, 4], N:  ['#3050f8', 0.71, 3], O:  ['#ff0d0d', 0.66, 2],
    F:  ['#90e050', 0.57, 1], Ne: ['#b3e3f5', 0.58, 0], Na: ['#ab5cf2', 1.66, 1], Mg: ['#8aff00', 1.41, 2],
    Al: ['#bfa6a6', 1.21, 3], Si: ['#f0c8a0', 1.11, 4], P:  ['#ff8000', 1.07, 3], S:  ['#ffff30', 1.05, 2],
    Cl: ['#1ff01f', 1.02, 1], Ar: ['#80d1e3', 1.06, 0], K:  ['#8f40d4', 2.03, 1], Ca: ['#3dff00', 1.76, 2],
    Fe: ['#e06633', 1.32, 2], Cu: ['#c88033', 1.32, 1], Zn: ['#7d80b0', 1.22, 2], Br: ['#a62929', 1.20, 1],
    I:  ['#940094', 1.39, 1], U:  ['#008fff', 1.96, 4]
  };
  const DEFAULT = ['#ff1493', 1.2, 1];

  G.Elements = {
    info(sym) {
      const d = E[sym] || DEFAULT;
      return { symbol: sym, color: d[0], cov: d[1], valence: d[2] };
    },
    Z(sym) { return (CV.Stage3Chem && CV.Stage3Chem.Elements.z(sym)) || null; },
    symbol(Z) { return (CV.Stage3Chem && CV.Stage3Chem.Elements.symbol(Z)) || null; },
    displayRadius(sym) {
      return Math.max(0.5, G.Elements.info(sym).cov * G.Config.WORLD_PER_ANGSTROM * 0.55);
    },
    bondLength(symA, symB, order) {
      const a = G.Elements.info(symA).cov, b = G.Elements.info(symB).cov;
      return (a + b) * G.Config.WORLD_PER_ANGSTROM * (1 - 0.08 * ((order || 1) - 1));
    }
  };

  // ===== VECTORS (plain {x,y,z}) =====
  const V = {
    v(x, y, z) { return { x: x || 0, y: y || 0, z: z || 0 }; },
    add(a, b) { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; },
    sub(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; },
    scale(a, s) { return { x: a.x * s, y: a.y * s, z: a.z * s }; },
    len(a) { return Math.hypot(a.x, a.y, a.z); },
    dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); },
    norm(a) { const l = Math.hypot(a.x, a.y, a.z) || 1; return { x: a.x / l, y: a.y / l, z: a.z / l }; },
    dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; },
    addTo(a, b, s) { s = s === undefined ? 1 : s; a.x += b.x * s; a.y += b.y * s; a.z += b.z * s; return a; },
    randUnit() {
      const u = Math.random() * 2 - 1, t = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u);
      return { x: r * Math.cos(t), y: u, z: r * Math.sin(t) };
    }
  };
  G.V = V;

  // ===== HILL FORMULA from a list of symbols =====
  G.hillFormula = function (symbols) {
    const c = {};
    symbols.forEach(s => { c[s] = (c[s] || 0) + 1; });
    const keys = Object.keys(c);
    const hasC = !!c.C;
    keys.sort((a, b) => {
      if (hasC) {
        if (a === 'C') return -1; if (b === 'C') return 1;
        if (a === 'H') return -1; if (b === 'H') return 1;
      }
      return a < b ? -1 : a > b ? 1 : 0;
    });
    return keys.map(k => k + (c[k] > 1 ? c[k] : '')).join('');
  };

  // ===== V2000 MOLBLOCK / SDF PARSER (fixed columns) =====
  G.parseMolblock = function (text) {
    const lines = String(text || '').split(/\r?\n/);
    const counts = lines[3] || '';
    const nA = parseInt(counts.substring(0, 3), 10);
    const nB = parseInt(counts.substring(3, 6), 10);
    if (!(nA > 0)) return null;
    const atoms = [];
    for (let i = 0; i < nA; i++) {
      const l = lines[4 + i] || '';
      atoms.push({
        x: parseFloat(l.substring(0, 10)), y: parseFloat(l.substring(10, 20)), z: parseFloat(l.substring(20, 30)),
        symbol: l.substring(31, 34).trim()
      });
    }
    const bonds = [];
    for (let i = 0; i < (nB || 0); i++) {
      const l = lines[4 + nA + i] || '';
      const a = parseInt(l.substring(0, 3), 10) - 1, b = parseInt(l.substring(3, 6), 10) - 1;
      const order = parseInt(l.substring(6, 9), 10) || 1;
      if (a >= 0 && b >= 0 && a < nA && b < nA) bonds.push({ a, b, order: Math.min(3, order) });
    }
    return { atoms, bonds };
  };

  // ===== c2c TONE GUN NOTE TABLES =====
  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  G.C2C = {
    C4: 440 * Math.pow(2, -9 / 12), // 261.6256 Hz (≈261.63), equal temperament with A4 = 440 Hz
    MODES: {
      chromatic: { label: 'c2c 13', semitones: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
      major:     { label: 'c2c 8',  semitones: [0, 2, 4, 5, 7, 9, 11, 12] }
    },
    freq(semitone) { return G.C2C.C4 * Math.pow(2, semitone / 12); }, // equal temperament
    // One "shot" descriptor per dot: note, frequency, colour (hue per pitch class), size, effect
    series(mode) {
      const m = G.C2C.MODES[mode];
      if (!m) throw new Error('unknown c2c mode ' + mode);
      return m.semitones.map((st, i) => {
        const pc = st % 12;
        const octaveUp = st >= 12;
        const hue = pc * 30;
        const light = octaveUp ? 78 : 55;
        let effect = 'harmony';
        if (st === 0) effect = 'bond';
        else if (st === 12) effect = 'resonance';
        else if ([1, 3, 6, 8, 10].indexOf(pc) !== -1) effect = 'dissonance';
        return {
          index: i, semitone: st, pitchClass: pc,
          note: NOTE_NAMES[pc] + (octaveUp ? '5' : '4'),
          freq: Math.round(G.C2C.freq(st) * 100) / 100,
          color: 'hsl(' + hue + ', 100%, ' + light + '%)',
          hue, light,
          radius: Math.round((0.78 - 0.03 * st) * 1000) / 1000,
          effect
        };
      });
    }
  };
})();
