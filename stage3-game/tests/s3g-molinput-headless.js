/* Headless-Chrome test for the one molecule input (js/s3g-molinput.js) and the data window (dev only).
   npm i puppeteer-core ; serve the repo (python3 -m http.server 8790)
   CHROME=/usr/bin/google-chrome node tests/s3g-molinput-headless.js http://localhost:8790/stage3-game/ [outDir] [screenshotDir]
   Parts:  1) detection of every input type and bad input (RDKit only, no network)
           2) offline fallback and retries with a mocked network (request interception, PubChem never called)
           3) live PubChem checks (needs the internet; LIVE=0 skips them)
           4) the data window: search box, matches, copy buttons, drop into the arena, a screenshot  */
'use strict';
const puppeteer = require('puppeteer-core');
const path = require('path');
const url = process.argv[2] || 'http://localhost:8790/stage3-game/';
const shotDir = process.argv[4] || process.argv[3] || path.join(__dirname, '..');
const LIVE = process.env.LIVE !== '0';
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✅ ' : '  ❌ ') + m + (x ? '  ' + x : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const IGNORE = /status of 404|popcoin-shop-items|net::ERR_FAILED|ERR_INTERNET_DISCONNECTED|pubchem/i;

(async () => {
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: true,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']
  });
  const errors = [];
  const open = async (opts = {}) => {
    const ctx = await browser.createBrowserContext();
    await ctx.overridePermissions(new URL(url).origin, ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write']);
    const page = await ctx.newPage();
    await page.setViewport(opts.vp || { width: 1280, height: 800 });
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !IGNORE.test(m.text())) errors.push('console: ' + m.text()); });
    if (opts.intercept) { await page.setRequestInterception(true); page.on('request', opts.intercept); }
    await page.goto(url + (opts.query || ''), { waitUntil: 'load', timeout: 60000 });
    await page.evaluate(() => CHEMVENTUR.Stage3Game.ready);
    await page.evaluate(() => CHEMVENTUR.MolInput.rdkit());
    return { ctx, page };
  };

  // ---------- 1) detection (no network needed) ----------
  console.log('# detection');
  let { ctx, page } = await open();
  ok(await page.evaluate(() => !!(CHEMVENTUR.MolInput && CHEMVENTUR.Stage3Game.MolInput && CHEMVENTUR.MolInput.rdkitReady)), 'MolInput loaded and RDKit ready');
  const det = await page.evaluate(() => {
    const M = CHEMVENTUR.MolInput, o = {};
    const cases = ['CCO', 'c1ccccc1', 'C1=CC=CC=C1', 'OC[C@H]1OC(O)[C@H](O)[C@@H](O)[C@@H]1O', 'F/C=C/F', '[NH4+]', '[Na+].[Cl-]', 'C#N',
      'InChI=1S/C2H6O/c1-2-3/h3H,2H2,1H3', '1S/H2O/h1H2', 'LFQSCWFLJHTTHZ-UHFFFAOYSA-N', 'lfqscwfljhtthz-uhfffaoysa-n', '702', 'CID 702', 'cid:702', 'CID#702', '64-17-5',
      'caffeine', 'acetic acid', '2-propanol', 'Neon', 'C2H6O', 'CO2', 'CO₂', 'H₂O', 'C₆H₁₂O₆', 'NH4+', 'NH₄⁺', 'SO4 2-', 'Ca(OH)2', 'NaCl', 'CH3CH2OH', 'CO',
      'formula: CO', 'smiles: CO', 'name: CO', '  CCO  ', '“aspirin”', 'C\u200BCO', 'inchikey: XLYOFNOQVPJJNP-UHFFFAOYSA-N', 'C(C'];
    for (const t of cases) { try { const d = M.detect(t); o[t] = d.kind + ':' + d.value + (d.alt ? ' alt=' + d.alt.kind : '') + (d.invalid ? ' invalid' : ''); } catch (e) { o[t] = 'ERR:' + e.message; } }
    return o;
  });
  const want = {
    'CCO': 'smiles:CCO', 'c1ccccc1': 'smiles:c1ccccc1', 'C1=CC=CC=C1': 'smiles:C1=CC=CC=C1', 'OC[C@H]1OC(O)[C@H](O)[C@@H](O)[C@@H]1O': 'smiles:OC[C@H]1OC(O)[C@H](O)[C@@H](O)[C@@H]1O',
    'F/C=C/F': 'smiles:F/C=C/F', '[NH4+]': 'smiles:[NH4+]', '[Na+].[Cl-]': 'smiles:[Na+].[Cl-]', 'C#N': 'smiles:C#N',
    'InChI=1S/C2H6O/c1-2-3/h3H,2H2,1H3': 'inchi:InChI=1S/C2H6O/c1-2-3/h3H,2H2,1H3', '1S/H2O/h1H2': 'inchi:InChI=1S/H2O/h1H2',
    'LFQSCWFLJHTTHZ-UHFFFAOYSA-N': 'inchikey:LFQSCWFLJHTTHZ-UHFFFAOYSA-N', 'lfqscwfljhtthz-uhfffaoysa-n': 'inchikey:LFQSCWFLJHTTHZ-UHFFFAOYSA-N',
    '702': 'cid:702', 'CID 702': 'cid:702', 'cid:702': 'cid:702', 'CID#702': 'cid:702', '64-17-5': 'cas:64-17-5',
    'caffeine': 'name:caffeine', 'acetic acid': 'name:acetic acid', '2-propanol': 'name:2-propanol', 'Neon': 'name:Neon',
    'C2H6O': 'formula:C2H6O', 'CO2': 'formula:CO2', 'CO₂': 'formula:CO2', 'H₂O': 'formula:H2O', 'C₆H₁₂O₆': 'formula:C6H12O6', 'NH4+': 'formula:H4N+', 'NH₄⁺': 'formula:H4N+',
    'SO4 2-': 'formula:O4S2-', 'Ca(OH)2': 'formula:CaH2O2', 'NaCl': 'formula:ClNa', 'CH3CH2OH': 'formula:C2H6O', 'CO': 'smiles:CO alt=formula',
    'formula: CO': 'formula:CO', 'smiles: CO': 'smiles:CO', 'name: CO': 'name:CO', '  CCO  ': 'smiles:CCO', '“aspirin”': 'name:aspirin', 'C\u200BCO': 'smiles:CCO',
    'inchikey: XLYOFNOQVPJJNP-UHFFFAOYSA-N': 'inchikey:XLYOFNOQVPJJNP-UHFFFAOYSA-N', 'C(C': 'smiles:C(C invalid'
  };
  const groups = {
    'SMILES (plain, aromatic, Kekulé, isomeric, cis/trans, charged, salts, triple bond)': ['CCO', 'c1ccccc1', 'C1=CC=CC=C1', 'OC[C@H]1OC(O)[C@H](O)[C@@H](O)[C@@H]1O', 'F/C=C/F', '[NH4+]', '[Na+].[Cl-]', 'C#N'],
    'InChI (with and without "InChI=")': ['InChI=1S/C2H6O/c1-2-3/h3H,2H2,1H3', '1S/H2O/h1H2'],
    'InChIKey (any case)': ['LFQSCWFLJHTTHZ-UHFFFAOYSA-N', 'lfqscwfljhtthz-uhfffaoysa-n'],
    'PubChem compound number: 702, CID 702, cid:702, CID#702': ['702', 'CID 702', 'cid:702', 'CID#702'],
    'CAS number with a valid check digit': ['64-17-5'],
    'names (single word, with spaces, with digits)': ['caffeine', 'acetic acid', '2-propanol', 'Neon'],
    'formulas (plain, condensed, unicode subscripts and superscripts, charges, brackets, salts)': ['C2H6O', 'CH3CH2OH', 'CO2', 'CO₂', 'H₂O', 'C₆H₁₂O₆', 'NH4+', 'NH₄⁺', 'SO4 2-', 'Ca(OH)2', 'NaCl'],
    '"CO" reads as SMILES (methanol) and offers the formula reading': ['CO'],
    'prefixes force a type: formula:, smiles:, name:, inchikey:': ['formula: CO', 'smiles: CO', 'name: CO', 'inchikey: XLYOFNOQVPJJNP-UHFFFAOYSA-N'],
    'clean-up: spaces, curly quotes, zero-width characters': ['  CCO  ', '“aspirin”', 'C\u200BCO'],
    'a broken SMILES is still read as SMILES (and flagged invalid)': ['C(C']
  };
  for (const [label, keys] of Object.entries(groups)) {
    const bad = keys.filter(k => det[k] !== want[k]);
    ok(!bad.length, 'detects ' + label, bad.map(k => JSON.stringify(k) + ' -> ' + det[k] + ' (wanted ' + want[k] + ')').join('; '));
  }
  const molfiles = await page.evaluate(async () => {
    const M = CHEMVENTUR.MolInput, R = await M.rdkit();
    const m = R.get_mol('CC(=O)O'); const v2 = m.add_hs(); const v3 = m.get_v3Kmolblock(); m.delete();
    const sdf = v2 + '\n>  <NAME>\nacetic acid\n\n$$$$\n';
    return { v2: M.detect(v2).kind, v3: M.detect(v3).kind, sdf: M.detect(sdf).kind, crlf: M.detect(v2.replace(/\n/g, '\r\n')).kind, v2text: v2 };
  });
  ok(molfiles.v2 === 'molfile' && molfiles.v3 === 'molfile' && molfiles.sdf === 'molfile' && molfiles.crlf === 'molfile', 'detects molfile blocks (V2000, V3000, SDF with data fields, Windows line ends)', JSON.stringify({ ...molfiles, v2text: undefined }));

  const bad = await page.evaluate(async () => {
    const M = CHEMVENTUR.MolInput, o = {};
    for (const t of ['', '   ', '64-17-6', 'C(C', 'C1CC', 'C[C', 'InChI=1S', 'cid: abc', 'formula: Xy2', 'inchikey: NOTAKEY', 'molfile: CCO', 'x'.repeat(200001), 'CC\u0007O']) {
      try { await M.resolve(t); o[t.slice(0, 20)] = 'NO ERROR'; } catch (e) { o[t.slice(0, 20)] = (e.name === 'MolInputError' ? 'ok:' : 'other:') + e.code + ':' + e.message; }
    }
    return o;
  });
  const allClear = Object.values(bad).every(v => /^ok:/.test(v));
  ok(allClear, 'bad input gives a clear in-game message (empty, wrong CAS check digit, open branch, open ring, open bracket, cut InChI, bad CID, fake element, bad InChIKey, molfile without lines, too long, control characters)', allClear ? '' : JSON.stringify(bad));
  ok(/branch is not closed/.test(bad['C(C']) && /ring 1/.test(bad['C1CC']) && /check digit/.test(bad['64-17-6']) && /Type or paste/.test(bad['']),
    'messages say what is wrong ("branch is not closed", "opens ring 1", "check digit", "Type or paste…")', [bad['C(C'], bad['C1CC']].join(' / '));
  await ctx.close();

  // ---------- 2) offline + retries with a mocked network ----------
  console.log('# offline fallback (PubChem blocked) and retries (mocked 503)');
  ({ ctx, page } = await open({ intercept: r => r.url().includes('pubchem.ncbi.nlm.nih.gov') ? r.abort('internetdisconnected') : r.continue() }));
  const off = await page.evaluate(async () => {
    const M = CHEMVENTUR.MolInput; CHEMVENTUR.Stage3Chem.Cache.clear(); M.net.reset(); M.net.backoffMs = 50;
    const o = {}; const t0 = Date.now();
    const r1 = await M.resolve('CCO'); o.smiles = { smiles: r1.smiles, formula: r1.formula, inchikey: r1.inchikey, mass: r1.mass, offline: r1.sources.offline, rdkit: r1.sources.rdkit, atoms: r1.atoms.length, svg: !!r1.svg, note: r1.notes.join(' | ') };
    o.firstMs = Date.now() - t0;
    const t1 = Date.now();
    const r2 = await M.resolve('OC[C@H]1OC(O)[C@H](O)[C@@H](O)[C@@H]1O'); o.glucose = { smiles: r2.smiles, offline: r2.sources.offline, inchi: r2.inchi.slice(0, 20) };
    o.fastMs = Date.now() - t1;
    const R = await M.rdkit(); const m = R.get_mol('c1ccccc1O'); const mb = m.get_molblock(); m.delete();
    const r3 = await M.resolve(mb); o.molfile = { kind: r3.kind, smiles: r3.smiles, offline: r3.sources.offline };
    for (const t of ['caffeine', 'InChI=1S/H2O/h1H2', 'CID 702', 'C2H6O']) { try { await M.resolve(t); o[t] = 'NO ERROR'; } catch (e) { o[t] = e.code + ':' + e.message; } }
    return o;
  });
  ok(off.smiles.smiles === 'CCO' && off.smiles.formula === 'C2H6O' && off.smiles.offline && off.smiles.rdkit && off.smiles.atoms === 9 && off.smiles.svg && Math.abs(off.smiles.mass - 46.07) < 0.05 && /^LFQSCWFLJHTTHZ/.test(off.smiles.inchikey),
    'offline: a SMILES still gives canonical SMILES, formula, mass, InChIKey, atoms and a 2D drawing from RDKit', JSON.stringify(off.smiles));
  ok(off.glucose.offline && /@/.test(off.glucose.smiles) && /^InChI=1S\/C6H12O6/.test(off.glucose.inchi) && off.molfile.kind === 'molfile' && off.molfile.smiles === 'Oc1ccccc1',
    'offline: stereo SMILES and pasted molfiles work too', JSON.stringify([off.glucose, off.molfile]));
  ok(off.fastMs < 1500, 'offline: after the first failure the next lookups fail fast (no long waits)', 'first ' + off.firstMs + ' ms, next ' + off.fastMs + ' ms');
  ok(['caffeine', 'InChI=1S/H2O/h1H2', 'CID 702', 'C2H6O'].every(k => /^offline:.*PubChem cannot be reached/.test(off[k])), 'offline: names, InChI, compound numbers and formulas say clearly that they need PubChem', off.caffeine);
  const offId = await page.evaluate(async () => { const o = await CHEMVENTUR.Stage3Game.debug.identifyEthanolSkeleton(); return o; });
  ok(offId && !offId.error && offId.canonical === 'CCO' && /Offline/.test(offId.title) && offId.formula === 'C2H6O', 'offline: "What did I build?" still names the structure from RDKit (C2H6O, CCO) instead of failing', JSON.stringify(offId));
  await ctx.close();

  // cache: lookups made online are answered from the cache when PubChem goes away
  if (LIVE) {
    let block = false;
    ({ ctx, page } = await open({ intercept: r => (block && r.url().includes('pubchem.ncbi.nlm.nih.gov')) ? r.abort('internetdisconnected') : r.continue() }));
    await page.evaluate(async () => { CHEMVENTUR.Stage3Chem.Cache.clear(); CHEMVENTUR.MolInput.net.reset(); await CHEMVENTUR.MolInput.resolve('caffeine'); });
    block = true;
    const cachedRec = await page.evaluate(async () => { const n = CHEMVENTUR.MolInput.net.log.length; const r = await CHEMVENTUR.MolInput.resolve('caffeine'); return { name: r.name, cid: r.cid, cache: r.sources.cache, coords3D: r.coords3D, requests: CHEMVENTUR.MolInput.net.log.length - n }; });
    ok(cachedRec.name === 'Caffeine' && cachedRec.cid === 2519 && cachedRec.cache && cachedRec.coords3D && cachedRec.requests === 0, 'cache: a molecule looked up once comes back offline with no network request (memory + localStorage)', JSON.stringify(cachedRec));
    const persisted = await page.evaluate(() => Object.keys(localStorage).filter(k => k.indexOf('mi1:') !== -1).length);
    ok(persisted >= 3, 'cache: entries are saved in localStorage', persisted + ' entries');
    await ctx.close();
  }

  // retries: PubChem answers 503 twice, then works (mocked answers, so this is not live)
  let hits = 0;
  const fake = (r) => {
    if (!r.url().includes('pubchem.ncbi.nlm.nih.gov')) return r.continue();
    hits++;
    const u = r.url(), body = r.postData() || '';
    if (/\/inchikey\//.test(u) && hits <= 2) return r.respond({ status: 503, contentType: 'application/json', body: '{"Fault":{"Code":"PUGREST.ServerBusy"}}' });
    if (/\/inchikey\/LFQSCWFLJHTTHZ/.test(u)) return r.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '{"IdentifierList":{"CID":[702]}}' });
    if (/\/property\//.test(u)) return r.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ PropertyTable: { Properties: [{ CID: 702, Title: 'Ethanol (mock)', MolecularFormula: 'C2H6O', MolecularWeight: '46.07', SMILES: 'CCO', InChIKey: 'LFQSCWFLJHTTHZ-UHFFFAOYSA-N', Charge: 0 }] } }) });
    if (/\/name\/cids/.test(u) && /name=acetic%20acid/.test(body)) return r.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '{"IdentifierList":{"CID":[176]}}' });
    return r.respond({ status: 404, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '{"Fault":{"Code":"PUGREST.NotFound"}}' });
  };
  ({ ctx, page } = await open({ intercept: fake }));
  const retry = await page.evaluate(async () => {
    const M = CHEMVENTUR.MolInput; CHEMVENTUR.Stage3Chem.Cache.clear(); M.net.reset(); M.net.backoffMs = 80;
    const t0 = Date.now(); const r = await M.resolve('CCO', { want3D: false });
    const log = M.net.log.map(l => l.method + ' ' + l.path.split('?')[0]);
    let nameErr = ''; try { await M.resolve('acetic acid', { want3D: false }); } catch (e) { nameErr = e.message; }
    return { name: r.name, cid: r.cid, ms: Date.now() - t0, log, nameErr, post: M.net.log.filter(l => l.method === 'POST').map(l => l.path) };
  });
  ok(retry.name === 'Ethanol (mock)' && retry.cid === 702 && retry.log.filter(l => /inchikey/.test(l)).length === 3, 'retries: two HTTP 503 answers, then success (backoff between tries)', retry.ms + ' ms · ' + retry.log.join(', '));
  ok(retry.post.some(p => /\/compound\/name\/cids\/JSON$/.test(p)), 'names go to PubChem by POST (spaces and slashes never touch the URL)', JSON.stringify(retry.post));
  await ctx.close();

  // SMILES with "#", "/" and "\" go by POST, untouched (mock echo)
  let posted = [];
  ({ ctx, page } = await open({ intercept: r => {
    if (!r.url().includes('pubchem.ncbi.nlm.nih.gov')) return r.continue();
    if (r.method() === 'POST') posted.push({ url: r.url(), body: r.postData() });
    return r.respond({ status: 404, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '{}' });
  } }));
  await page.evaluate(async () => { CHEMVENTUR.Stage3Chem.Cache.clear(); CHEMVENTUR.MolInput.net.reset(); await CHEMVENTUR.MolInput.resolve('F/C=C\\C#N', { want3D: false }); try { await CHEMVENTUR.MolInput.resolve('InChI=1S/C2H6O/c1-2-3/h3H,2H2,1H3'); } catch (e) {} });
  const smiPost = posted.find(p => /\/smiles\/cids/.test(p.url)), inPost = posted.find(p => /\/inchi\/cids/.test(p.url));
  const smiSent = smiPost ? decodeURIComponent(smiPost.body.replace(/^smiles=/, '')) : '';
  ok(smiPost && /#/.test(smiSent) && /\//.test(smiSent) && /\\/.test(smiSent) && !/[#\\]/.test(smiPost.url) && /\/compound\/smiles\/cids\/JSON$/.test(smiPost.url),
    'SMILES with "/", "\\" and "#" are sent by POST in the body, never in the URL, and arrive whole', smiSent);
  ok(inPost && decodeURIComponent(inPost.body.replace(/^inchi=/, '')) === 'InChI=1S/C2H6O/c1-2-3/h3H,2H2,1H3', 'InChI is sent by POST and arrives unchanged', inPost && inPost.body);
  await ctx.close();

  // ---------- 3) live PubChem ----------
  if (LIVE) {
    console.log('# live PubChem');
    ({ ctx, page } = await open());
    const live = await page.evaluate(async () => {
      const M = CHEMVENTUR.MolInput; CHEMVENTUR.Stage3Chem.Cache.clear(); M.net.reset();
      const o = {};
      const one = async (k, t, opts) => { try { const r = await M.resolve(t, opts); o[k] = { kind: r.kind, cid: r.cid, name: r.name, smiles: r.smiles, formula: r.formula, charge: r.charge, inchikey: r.inchikey, inchi: r.inchi, coords3D: r.coords3D, atoms: r.atoms.length, bonds: r.bonds.length, choices: r.choices.map(c => c.cid), mass: r.mass, rdkit: r.sources.rdkit, pubchem: r.sources.pubchem, svg: !!r.svg }; } catch (e) { o[k] = { err: e.message }; } };
      await one('water', 'water'); await one('waterSmiles', 'O');
      await one('ethanol', 'CCO'); await one('ethanolInchi', 'InChI=1S/C2H6O/c1-2-3/h3H,2H2,1H3'); await one('ethanolKey', 'LFQSCWFLJHTTHZ-UHFFFAOYSA-N'); await one('ethanolCas', '64-17-5');
      await one('caffeine', 'caffeine'); await one('caffeineSmiles', 'CN1C=NC2=C1C(=O)N(C(=O)N2C)C');
      await one('benzene', 'c1ccccc1'); await one('benzeneKekule', 'C1=CC=CC=C1');
      await one('aspirin', 'aspirin'); await one('aspirinCid', 'CID 2244');
      await one('glucose', 'C([C@@H]1[C@H]([C@@H]([C@H]([C@H](O1)O)O)O)O)O'); await one('glucoseName', 'D-glucose');
      await one('ammonium', '[NH4+]'); await one('ammoniumFormula', 'NH₄⁺');
      await one('spaces', 'acetic acid'); await one('spaces2', 'sodium chloride');
      await one('formula', 'C2H6O');
      await one('notFound', 'notarealmoleculexyzzy');
      return o;
    });
    const L = live;
    ok(L.water.cid === 962 && L.water.name === 'Water' && L.water.formula === 'H2O' && L.water.coords3D && L.waterSmiles.cid === 962, 'live: water by name and by SMILES "O" -> CID 962 with a 3D shape', JSON.stringify(L.water));
    ok([L.ethanol, L.ethanolInchi, L.ethanolKey, L.ethanolCas].every(r => r.cid === 702 && r.name === 'Ethanol' && r.smiles === 'CCO' && r.inchikey === 'LFQSCWFLJHTTHZ-UHFFFAOYSA-N' && r.atoms === 9 && r.coords3D),
      'live: ethanol by SMILES, InChI, InChIKey and CAS number -> the same record (CID 702, 9 atoms in 3D)', [L.ethanol, L.ethanolInchi, L.ethanolKey, L.ethanolCas].map(r => r.kind + ':' + r.cid).join(' '));
    ok(L.caffeine.cid === 2519 && L.caffeineSmiles.cid === 2519 && L.caffeine.formula === 'C8H10N4O2' && L.caffeine.atoms === 24 && Math.abs(L.caffeine.mass - 194.19) < 0.05, 'live: caffeine by name and by SMILES -> CID 2519, C8H10N4O2, 194.19 g/mol', JSON.stringify({ smiles: L.caffeine.smiles }));
    ok(L.benzene.cid === 241 && L.benzeneKekule.cid === 241 && L.benzene.smiles === 'c1ccccc1' && L.benzeneKekule.smiles === 'c1ccccc1', 'live: benzene aromatic and Kekulé SMILES -> CID 241, one canonical SMILES', L.benzeneKekule.smiles);
    ok(L.aspirin.cid === 2244 && L.aspirinCid.cid === 2244 && L.aspirin.name === 'Aspirin' && L.aspirin.formula === 'C9H8O4', 'live: aspirin by name and by CID 2244', L.aspirin.smiles);
    ok(L.glucose.cid === 79025 && /@/.test(L.glucose.smiles) && /\/t/.test(L.glucose.inchi) && L.glucoseName.cid === 5793 && L.glucose.inchikey !== L.glucoseName.inchikey,
      'live: glucose keeps its stereo (alpha-D-glucopyranose SMILES -> CID 79025, "D-glucose" -> CID 5793, different InChIKeys)', L.glucose.name + ' / ' + L.glucoseName.name);
    ok(L.ammonium.cid === 223 && L.ammonium.charge === 1 && L.ammonium.formula === 'H4N+' && L.ammoniumFormula.cid === 223, 'live: ammonium ion [NH4+] and the formula NH₄⁺ -> CID 223, charge +1', JSON.stringify({ f: L.ammonium.formula, c: L.ammonium.charge }));
    ok(L.spaces.cid === 176 && L.spaces.name === 'Acetic Acid' && L.spaces2.cid === 5234, 'live: names with spaces ("acetic acid", "sodium chloride")', L.spaces.name + ', ' + L.spaces2.name);
    ok(L.spaces2.atoms === 2 && !L.spaces2.coords3D, 'live: a salt with no PubChem 3D shape still gets atoms (2D layout)', JSON.stringify({ atoms: L.spaces2.atoms }));
    ok(L.formula.cid === 702 && L.formula.choices.length >= 2 && L.formula.choices.indexOf(8254) !== -1, 'live: the formula C2H6O lists several matches (ethanol 702, dimethyl ether 8254, …)', JSON.stringify(L.formula.choices));
    ok(L.notFound.err && /not in PubChem/.test(L.notFound.err), 'live: an unknown name gives a clear message', L.notFound.err);
    const ids = await page.evaluate(async () => { const o = await CHEMVENTUR.Stage3Game.debug.identifyEthanolSkeleton(); return o; });
    ok(ids && ids.title === 'Ethanol' && ids.cid === 702 && ids.canonical === 'CCO' && ids.is3D, 'live: "What did I build?" goes through the same input (C–C–O -> Ethanol)', JSON.stringify(ids));
    const sm = await page.evaluate(async () => {
      const W = CHEMVENTUR.Stage3Game.debug.world;
      const s = CHEMVENTUR.Stage3Game.debug.buildEthanolSkeleton();
      const comp = W.components().find(c => c.atoms.indexOf(s.atoms[0]) !== -1);
      return CHEMVENTUR.MolInput.toSmiles(W.toMolblock(comp));
    });
    ok(sm === 'CCO', 'a molecule built in the game exports to SMILES', sm);
    await ctx.close();
  }

  // ---------- 4) the data window ----------
  console.log('# data window');
  ({ ctx, page } = await open({ query: '?autostart=1', intercept: LIVE ? null : (r => r.url().includes('pubchem') ? r.abort('internetdisconnected') : r.continue()) }));
  await page.evaluate(() => CHEMVENTUR.Stage3Game.start());
  await sleep(300);
  await page.evaluate(() => document.querySelector('.s3g-actions button[title^="Look up"]').click());
  await sleep(200);
  const focused = await page.evaluate(() => document.activeElement && document.activeElement.classList.contains('s3g-molq') && !document.querySelector('.s3g-id').hidden);
  ok(focused, 'the 🔎 button opens the data window with the search box focused');
  const gunBefore = await page.evaluate(() => CHEMVENTUR.Stage3Game.Game.gun);
  await page.type('.s3g-molq', 'CC(=O)Oc1ccccc1C(=O)O');
  const hint = await page.$eval('.s3g-molhint', e => e.textContent);
  const gunAfter = await page.evaluate(() => CHEMVENTUR.Stage3Game.Game.gun);
  ok(/SMILES/.test(hint), 'the hint under the box says what the text looks like while typing', hint);
  ok(gunBefore === gunAfter, 'typing digits and letters in the box does not fire game keys (gun stays ' + gunAfter + ')');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => { const o = CHEMVENTUR.Stage3Game.Game.lastIdentify; return o && o.lookup && (o.record || o.error); }, { timeout: 30000 });
  const view = await page.evaluate(() => {
    const R = CHEMVENTUR.Stage3Game.Game.hud.idRows, o = CHEMVENTUR.Stage3Game.Game.lastIdentify;
    return { title: R.title.textContent, smiles: R.smiles.textContent, inchi: R.inchi.textContent, inchikey: R.inchikey.textContent, cid: R.cid.textContent, source: R.source.textContent,
      svg: !document.querySelector('.s3g-molsvg').hidden, copy: [...document.querySelectorAll('.s3g-copy')].map(b => b.disabled), err: o.error };
  });
  ok(view.smiles === 'CC(=O)Oc1ccccc1C(=O)O' && /^InChI=1S\/C9H8O4/.test(view.inchi) && view.inchikey === 'BSYNRYMUTXBXSQ-UHFFFAOYSA-N' && view.svg && /RDKit/.test(view.source),
    'a SMILES lookup fills the data window: canonical SMILES, InChI, InChIKey, RDKit 2D drawing', JSON.stringify(view));
  if (LIVE) ok(view.title === 'Aspirin' && /CID 2244/.test(view.cid) && view.copy.every(d => !d), 'live: name Aspirin, CID 2244 link, all four copy buttons on', view.title + ' · ' + view.cid);
  await sleep(300);
  await page.screenshot({ path: path.join(shotDir, 'molinput-data-window.png') });
  const copied = [];
  for (const k of ['smiles', 'inchi', 'inchikey', 'cid']) {
    await page.evaluate(k => CHEMVENTUR.Stage3Game.Game.hud.copyBtns[k].click(), k);
    await sleep(150);
    copied.push(await page.evaluate(async () => { const c = CHEMVENTUR.Stage3Game.Game.lastCopied; let clip = ''; try { clip = await navigator.clipboard.readText(); } catch (e) { clip = '(no read)'; } return { key: c && c.key, ok: c && c.ok, value: c && c.value, clip }; }));
  }
  ok(copied[0].value === 'CC(=O)Oc1ccccc1C(=O)O' && copied[2].value === 'BSYNRYMUTXBXSQ-UHFFFAOYSA-N' && copied.every(c => !c.value || c.ok) && copied.filter(c => c.value).every(c => c.clip === c.value || c.clip === '(no read)'),
    'copy buttons put SMILES, InChI, InChIKey and CID on the clipboard', copied.map(c => c.key + '=' + (c.value || '').slice(0, 18) + (c.clip === c.value ? ' ✓clip' : '')).join(' '));
  const before = await page.evaluate(() => CHEMVENTUR.Stage3Game.debug.world.atoms.length);
  await page.evaluate(() => CHEMVENTUR.Stage3Game.Game.hud.swapBtn.click());
  const after = await page.evaluate(() => ({ atoms: CHEMVENTUR.Stage3Game.debug.world.atoms.length, btn: CHEMVENTUR.Stage3Game.Game.hud.swapBtn.textContent }));
  ok(after.atoms - before === 21 && /Drop/.test(after.btn), '"Drop into the arena" puts the looked-up molecule (21 atoms with hydrogens) in front of the ship', (after.atoms - before) + ' atoms');
  // bad input in the box
  await page.evaluate(() => { const q = document.querySelector('.s3g-molq'); q.value = 'C1CC(('; q.dispatchEvent(new Event('input')); });
  await page.focus('.s3g-molq'); await page.keyboard.press('Enter');
  await page.waitForFunction(() => { const o = CHEMVENTUR.Stage3Game.Game.lastIdentify; return o && o.query === 'C1CC(('; }, { timeout: 30000 });
  // (other game messages may take over the status line a moment later, so the status is caught as it is written)
  const badView = await page.evaluate(() => ({ err: CHEMVENTUR.Stage3Game.Game.lastIdentify.error, notes: document.querySelector('.s3g-notes').textContent, hint: document.querySelector('.s3g-molhint').textContent }));
  ok(/branch is not closed/.test(badView.err) && /Error: .*branch is not closed/.test(badView.notes) && /not valid/.test(badView.hint), 'bad input in the box shows the reason in the window (and in the status line)', badView.err);
  if (LIVE) {
    await page.evaluate(() => { const q = document.querySelector('.s3g-molq'); q.value = 'C2H6O'; });
    await page.focus('.s3g-molq'); await page.keyboard.press('Enter');
    await page.waitForFunction(() => { const o = CHEMVENTUR.Stage3Game.Game.lastIdentify; return o && o.query === 'C2H6O' && (o.record || o.error); }, { timeout: 30000 });
    const nChoices = await page.$$eval('.s3g-choice', b => b.length);
    await page.evaluate(() => { const b = [...document.querySelectorAll('.s3g-choice')].find(x => /ether/i.test(x.textContent)); if (b) b.click(); });
    await page.waitForFunction(() => { const o = CHEMVENTUR.Stage3Game.Game.lastIdentify; return o && o.cid === 8254; }, { timeout: 30000 }).catch(() => {});
    const picked = await page.evaluate(() => ({ title: CHEMVENTUR.Stage3Game.Game.hud.idRows.title.textContent, cid: CHEMVENTUR.Stage3Game.Game.lastIdentify.cid, still: document.querySelectorAll('.s3g-choice').length }));
    ok(nChoices >= 2 && picked.cid === 8254 && picked.still >= 2, 'formula search shows match buttons; picking "dimethyl ether" switches the window and keeps the list', JSON.stringify({ nChoices, ...picked }));
    // paste a PubChem 3D SDF: its own 3D coordinates are kept
    const sdfRec = await page.evaluate(async () => {
      const sdf = (await CHEMVENTUR.MolInput.PubChem.sdf(962, '3d')).v;
      const r = await CHEMVENTUR.Stage3Game.Game.lookupMolecule(sdf);
      return { kind: r.record && r.record.kind, cid: r.cid, coords3D: r.record && r.record.coords3D, title: r.title };
    });
    ok(sdfRec.kind === 'molfile' && sdfRec.cid === 962 && sdfRec.coords3D, 'pasting a 3D SDF block finds water and keeps the pasted 3D coordinates', JSON.stringify(sdfRec));
  }
  await ctx.close();

  // phone: the data window fits
  ({ ctx, page } = await open({ vp: { width: 844, height: 390, isMobile: true, hasTouch: true }, query: '?autostart=1', intercept: r => r.url().includes('pubchem') ? r.abort('internetdisconnected') : r.continue() }));
  await page.evaluate(() => { CHEMVENTUR.Stage3Game.start(); CHEMVENTUR.Stage3Game.Game.openLookup(); });
  await page.evaluate(() => CHEMVENTUR.Stage3Game.Game.lookupMolecule('c1ccccc1O'));
  const fit = await page.evaluate(() => { const r = document.querySelector('.s3g-id').getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, w: innerWidth, h: innerHeight, scroll: document.querySelector('.s3g-id').scrollHeight }; });
  ok(fit.left >= 0 && fit.right <= fit.w && fit.bottom <= fit.h + 1, 'phone (844×390): the data window stays on screen and scrolls inside', JSON.stringify(fit));
  await page.screenshot({ path: path.join(shotDir, 'molinput-data-window-phone.png') });
  await ctx.close();

  ok(!errors.length, 'no page errors', errors.slice(0, 4).join(' | '));
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
