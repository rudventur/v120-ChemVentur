/* Node checks for js/stage3-chem.js (dev-only, not loaded by the game).
   Needs Node 18+ (global fetch) and network for the live PubChem part.
   RDKit:  npm i @rdkit/rdkit@2025.3.4-1.0.0   (set NODE_PATH if installed elsewhere)
   Optional: V118_DIR=/path/to/ChemVentur-Multi-v118 to cross-check the element table.
   Run:    node tests/stage3-node-test.js            */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (cond, msg, extra) => {
  if (cond) { pass++; console.log('  ✅ ' + msg + (extra ? '  ' + extra : '')); }
  else { fail++; console.log('  ❌ ' + msg + (extra ? '  ' + extra : '')); }
};

// --- sandbox with window/localStorage/fetch ---
const store = new Map();
const localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
  key: i => Array.from(store.keys())[i] || null,
  get length() { return store.size; }
};
let fetchCount = 0;
const sandbox = {
  console, setTimeout, clearTimeout, AbortController, URLSearchParams, localStorage,
  fetch: (...a) => { fetchCount++; return fetch(...a); }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
const root = path.join(__dirname, '..');
vm.runInContext(fs.readFileSync(path.join(root, 'js/stage3-chem.js'), 'utf8'), sandbox, { filename: 'stage3-chem.js' });
const S = sandbox.CHEMVENTUR.Stage3Chem;

(async () => {
  console.log('\n# Offline checks');
  ok(S && S.version, 'Stage3Chem namespace exists', S && S.version);
  ok(S.Elements.count === 118, 'element table has 118 symbols');
  ok(S.Elements.symbol(35) === 'Br' && S.Elements.symbol(53) === 'I' && S.Elements.symbol(92) === 'U' && S.Elements.symbol(118) === 'Og', 'Br/I/U/Og symbols correct');

  const v118 = process.env.V118_DIR;
  if (v118 && fs.existsSync(path.join(v118, 'js/periodicTableFull.js'))) {
    const sb2 = { console, CHEMVENTUR: {} };
    sb2.window = sb2;
    vm.createContext(sb2);
    vm.runInContext(fs.readFileSync(path.join(v118, 'js/periodicTableFull.js'), 'utf8'), sb2);
    const E = sb2.CHEMVENTUR.PeriodicTableFull.ELEMENTS;
    const mism = Object.keys(E).filter(z => E[z].symbol !== S.Elements.symbol(+z));
    ok(mism.length === 0 && Object.keys(E).length === 118, 'symbols match v118 periodicTableFull.js', mism.length ? 'mismatch Z=' + mism.join(',') : '');
  } else {
    console.log('  (skip) set V118_DIR to cross-check against periodicTableFull.js');
  }

  const g = S.guessMode;
  ok(g('2244') === 'cid' && g('CID 2244') === 'cid', 'guessMode: CID');
  ok(g('caffeine') === 'name' && g('sodium chloride') === 'name' && g('Neon') === 'name', 'guessMode: names');
  ok(g('CCO') === 'smiles' && g('c1ccccc1') === 'smiles' && g('CC(=O)O') === 'smiles' && g('[Na+].[Cl-]') === 'smiles', 'guessMode: SMILES');

  // Builder: ethanol skeleton + a separate 2-atom fragment + a stray atom + a special particle bond
  const C1 = { p: 6, x: 400, y: 300 }, C2 = { p: 6, x: 450, y: 300 }, O = { p: 8, x: 475, y: 257 };
  const Br1 = { p: 35, x: 10, y: 10 }, Br2 = { p: 35, x: 60, y: 10 };
  const proton = { p: 1, special: 'proton', x: 0, y: 0 };
  const molSys = { bonds: [
    { atom1: C1, atom2: C2, type: 'SINGLE' }, { atom1: C2, atom2: O, type: 'SINGLE' },
    { atom1: C2, atom2: C1, type: 'SINGLE' },              // duplicate pair
    { atom1: Br1, atom2: Br2, type: 'SINGLE' },
    { atom1: proton, atom2: C1, type: 'SINGLE' }            // must be ignored
  ] };
  const frag = S.Builder.collect(molSys, { ship: { x: 420, y: 300 } });
  ok(frag.atoms.length === 3 && frag.bonds.length === 2 && frag.fragments === 2, 'Builder picks largest fragment, dedupes bonds, skips specials',
    JSON.stringify({ atoms: frag.atoms.length, bonds: frag.bonds.length, fragments: frag.fragments }));
  const mb = S.Builder.molblock(frag);
  ok(/V2000/.test(mb) && /M {2}END/.test(mb), 'molblock is V2000');

  // RDKit
  let R = null;
  try { R = await require('@rdkit/rdkit')(); } catch (e) { console.log('  (skip RDKit) ' + e.message); }
  if (R) {
    S.RDKit.override = R;
    const rd = await S.RDKit.analyze(mb);
    ok(rd && rd.canonical === 'CCO', 'RDKit reads game molblock -> canonical SMILES', rd && rd.canonical);
    ok(rd && rd.formula === 'C2H6O', 'formula from RDKit molblock (Hill order)', rd && rd.formula);
    ok(rd && rd.svg && rd.svg.indexOf('<svg') !== -1, 'RDKit SVG depiction');
    ok(rd && rd.descriptors && rd.descriptors.tpsa != null, 'RDKit descriptors', rd && ('tpsa=' + rd.descriptors.tpsa));
    const bad = await S.RDKit.analyze('C(C)(C)(C)(C)C');
    ok(bad === null, 'invalid valence SMILES -> null (no throw)');
  }

  if (process.env.OFFLINE) { finish(); return; }

  console.log('\n# Live PubChem checks');
  const t0 = Date.now();
  const asp = await S.lookup('aspirin', 'auto');
  ok(asp.cid === 2244 && asp.source === 'pubchem-3d' && asp.is3D, 'name "aspirin" -> CID 2244 with 3D SDF', asp.source);
  ok(asp.props.title === 'Aspirin' && asp.props.formula === 'C9H8O4' && asp.props.mw === 180.16, 'property endpoint: Title/Formula/MW', JSON.stringify([asp.props.title, asp.props.formula, asp.props.mw]));
  ok(asp.props.xlogp === 1.2 && asp.props.tpsa === 63.6 && asp.props.inchikey === 'BSYNRYMUTXBXSQ-UHFFFAOYSA-N', 'XLogP/TPSA/InChIKey');
  ok(/V2000/.test(asp.sdf) && / 21 21 /.test(asp.sdf.split('\n')[3] + ' '), '3D SDF has 21 atoms / 21 bonds', asp.sdf.split('\n')[3].trim());

  const before = fetchCount;
  await S.lookup('aspirin', 'auto');
  ok(fetchCount === before, 'second lookup served from cache (0 requests)');
  ok(Array.from(store.keys()).some(k => k.indexOf('cv.stage3.v1:sdf3d:2244') === 0), 'SDF persisted in localStorage');

  const byCid = await S.lookup('2519', 'auto');
  ok(byCid.cid === 2519 && byCid.props.title === 'Caffeine' && byCid.is3D, 'CID 2519 -> Caffeine 3D');

  const bySmi = await S.lookup('CN1C=NC2=C1C(=O)N(C(=O)N2C)C', 'auto');
  ok(bySmi.cid === 2519, 'SMILES -> caffeine CID 2519', 'cid=' + bySmi.cid);

  const glu = await S.lookup('glucose', 'name');
  ok(glu.props.smiles.indexOf('@') !== -1, 'SMILES keeps stereo (not ConnectivitySMILES)', glu.props.smiles);

  const nacl = await S.lookup('sodium chloride', 'name');
  ok(nacl.cid === 5234 && !nacl.is3D && (nacl.source === 'rdkit-2d' || nacl.source === 'pubchem-2d'), 'NaCl: no 3D -> fallback', nacl.source + ' cid=' + nacl.cid);

  let err = null;
  try { await S.lookup('notarealmoleculexyzzy', 'name'); } catch (e) { err = e.message; }
  ok(err && /Nothing found/.test(err), 'unknown name -> clean error', err);

  if (R) {
    const id = await S.identifyBuild(molSys, { ship: { x: 420, y: 300 } });
    ok(id.cid === 702 && id.props.title === 'Ethanol' && id.is3D, '"What did I build?" C-C-O -> Ethanol CID 702 in 3D', id.props && id.props.title);
  }
  S.RDKit.override = null;
  // RDKit-free path: PubChem identifies a raw molblock via POST
  const cidPost = await S.PubChem.cidFromMolblock(mb);
  ok(cidPost === 702, 'POST molblock -> CID 702 (no-RDKit fallback)', 'cid=' + cidPost);
  console.log('  live checks took ' + (Date.now() - t0) + ' ms, ' + fetchCount + ' PubChem requests');
  finish();
})().catch(e => { console.error(e); fail++; finish(); });

function finish() {
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}
