/* ============================================
   🧪 CHEMVENTUR v118 - RDKit SMILES PARSING
   ============================================

   Loads RDKit.js (the official RDKit WebAssembly build)
   on demand and uses it to turn any SMILES string into
   real 2D atom coordinates + bonds, using the exact same
   cheminformatics engine PubChem itself is built on.

   Falls back gracefully (returns null) if the CDN can't
   be reached — everything else in the game keeps working.
   ============================================ */

(function() {

  const RDKIT_VERSION = '2025.3.4-1.0.0';
  const SCALE = 30; // px per Angstrom, matches MoleculeStructures/PubChemAPI

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Failed to load ' + src));
      document.head.appendChild(s);
    });
  }

  CHEMVENTUR.RDKit = {
    baseUrl: `https://unpkg.com/@rdkit/rdkit@${RDKIT_VERSION}/dist/`,
    instance: null,
    ready: null,
    loadError: null,
    _symbolToZ: null,

    // ===== INIT (lazy, non-blocking, memoized) =====
    init() {
      if (this.ready) return this.ready;

      this.ready = (async () => {
        try {
          if (typeof window.initRDKitModule !== 'function') {
            await loadScript(this.baseUrl + 'RDKit_minimal.js');
          }
          if (typeof window.initRDKitModule !== 'function') {
            throw new Error('initRDKitModule not defined after loading script');
          }

          const mod = await window.initRDKitModule({
            locateFile: (file) => this.baseUrl + file
          });

          this.instance = mod;
          console.log('🧪 RDKit.js ready:', mod.version());
          return mod;

        } catch (err) {
          this.loadError = err.message || String(err);
          console.warn('⚠️ RDKit unavailable (SMILES parsing disabled):', this.loadError);
          return null;
        }
      })();

      return this.ready;
    },

    // ===== ELEMENT SYMBOL -> ATOMIC NUMBER (built from the full 118-element table) =====
    symbolToZ(symbol) {
      if (!this._symbolToZ) {
        this._symbolToZ = {};
        const ELEMENTS = CHEMVENTUR.PeriodicTableFull.ELEMENTS;
        for (const z of Object.keys(ELEMENTS)) {
          this._symbolToZ[ELEMENTS[z].symbol] = parseInt(z, 10);
        }
      }
      return this._symbolToZ[symbol] || null;
    },

    // ===== PARSE A V2000 MOLBLOCK (RDKit's own output — whitespace-delimited) =====
    _parseMolblock(molblock) {
      const lines = molblock.split('\n');
      const counts = lines[3];
      if (!counts) return null;

      const nAtoms = parseInt(counts.substring(0, 3), 10);
      const nBonds = parseInt(counts.substring(3, 6), 10);
      if (!Number.isFinite(nAtoms) || nAtoms <= 0) return null;

      const atoms = [];
      for (let i = 0; i < nAtoms; i++) {
        const parts = lines[4 + i].trim().split(/\s+/);
        const element = parts[3];
        const Z = this.symbolToZ(element);
        if (!Z) return null; // unsupported element symbol — bail to fallback
        atoms.push({ element, Z, x: parseFloat(parts[0]), y: parseFloat(parts[1]) });
      }

      const bonds = [];
      for (let i = 0; i < nBonds; i++) {
        const parts = lines[4 + nAtoms + i].trim().split(/\s+/);
        bonds.push({
          a1: parseInt(parts[0], 10) - 1,
          a2: parseInt(parts[1], 10) - 1,
          order: parseInt(parts[2], 10) || 1
        });
      }

      return { atoms, bonds };
    },

    // ===== SMILES -> {atoms, bonds} (async — waits for RDKit to be ready) =====
    async parseSmiles(smiles) {
      const mod = await this.init();
      if (!mod || !smiles || !smiles.trim()) return null;

      const mol = mod.get_mol(smiles.trim());
      if (!mol) return null;

      if (!mol.is_valid()) {
        mol.delete();
        return null;
      }

      // add_hs() returns a molblock with explicit hydrogens *and* their own
      // 2D coordinates, matching how the curated MoleculeStructures show atoms
      const molblock = mol.add_hs();
      const canonicalSmiles = mol.get_smiles();
      mol.delete();

      const parsed = this._parseMolblock(molblock);
      if (!parsed) return null;

      parsed.canonicalSmiles = canonicalSmiles;
      return parsed;
    },

    // ===== SPAWN A MOLECULE DIRECTLY FROM SMILES =====
    // Mirrors MoleculeStructures.spawn() / PubChemAPI.spawnWithStructure() exactly,
    // so RDKit-derived molecules bond, break and render just like the curated ones.
    async spawnFromSmiles(smiles, centerX, centerY, velocity) {
      const parsed = await this.parseSmiles(smiles);
      if (!parsed || !parsed.atoms.length) return null;

      const game = CHEMVENTUR.Game;
      const MolSys = CHEMVENTUR.MolecularSystem;
      const Particles = CHEMVENTUR.Particles;

      const cx = centerX ?? game.ship.x;
      const cy = centerY ?? (game.ship.y - 50);
      const vx = velocity?.vx ?? (Math.random() - 0.5) * 2;
      const vy = velocity?.vy ?? 2;

      // Center RDKit's layout on the spawn point
      let sumX = 0, sumY = 0;
      parsed.atoms.forEach(a => { sumX += a.x; sumY += a.y; });
      const offsetX = sumX / parsed.atoms.length;
      const offsetY = sumY / parsed.atoms.length;

      const spawnedAtoms = [];
      parsed.atoms.forEach((atomData, i) => {
        const x = cx + (atomData.x - offsetX) * SCALE;
        const y = cy + (atomData.y - offsetY) * SCALE;

        const atom = Particles.createAtom(x, y, atomData.Z, atomData.Z, atomData.Z, { vx, vy });
        atom.moleculeIndex = i;
        atom.partOfMolecule = true;

        spawnedAtoms.push(atom);
        game.atoms.push(atom);
      });

      parsed.bonds.forEach(bondData => {
        const atom1 = spawnedAtoms[bondData.a1];
        const atom2 = spawnedAtoms[bondData.a2];
        if (!atom1 || !atom2) return;

        const bondType = bondData.order === 3 ? 'TRIPLE' : bondData.order === 2 ? 'DOUBLE' : 'SINGLE';

        atom1.bonds = atom1.bonds || [];
        atom2.bonds = atom2.bonds || [];

        const bond = {
          atom1, atom2,
          type: bondType,
          strength: bondData.order || 1,
          length: Math.hypot(atom2.x - atom1.x, atom2.y - atom1.y),
          color: bondType === 'TRIPLE' ? '#00ffff' : bondType === 'DOUBLE' ? '#ffff00' : '#00ff41',
          width: (bondData.order || 1) * 2,
          vibration: 0,
          order: bondData.order || 1,
          id: Math.random().toString(36).substr(2, 9)
        };

        atom1.bonds.push(bond);
        atom2.bonds.push(bond);
        MolSys.bonds.push(bond);
      });

      console.log(`🧪 RDKit spawned "${parsed.canonicalSmiles}": ${spawnedAtoms.length} atoms, ${parsed.bonds.length} bonds`);

      return { atoms: spawnedAtoms, bonds: parsed.bonds, canonicalSmiles: parsed.canonicalSmiles };
    }
  };

  // ===== UI: SPAWN FROM A USER-TYPED SMILES STRING =====
  CHEMVENTUR.UI.spawnCustomSmiles = async function() {
    const input = document.getElementById('smiles-input');
    const smiles = input?.value?.trim();
    if (!smiles) return;

    this.showStatus('🧪 Parsing SMILES with RDKit...');

    const game = CHEMVENTUR.Game;
    const result = await CHEMVENTUR.RDKit.spawnFromSmiles(smiles, game.ship.x, game.ship.y - 50);

    if (result) {
      this.showStatus(`🧪 Spawned "${result.canonicalSmiles}" — ${result.atoms.length} atoms, ${result.bonds.length} bonds!`);
      this.closePubChemSearch();
      CHEMVENTUR.Audio?.click?.();
      if (input) input.value = '';
    } else {
      this.showStatus(`❌ Invalid SMILES or RDKit unavailable: "${smiles}"`);
    }
  };

  // Start loading in the background as soon as the game boots, so RDKit is
  // likely ready by the time a player actually asks for a SMILES structure.
  CHEMVENTUR.RDKit.init();

  console.log('🧪 RDKit SMILES module loaded!');

})();
