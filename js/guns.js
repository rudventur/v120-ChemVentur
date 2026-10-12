/* ============================================
   CHEMVENTUR v120 - GUNS (cleaned + enhanced)
   Fixed duplicate method definitions.
   Added Stage-3 friendly molecular options.
   ============================================ */

(function() {
  const Config = CHEMVENTUR.Config;
  const Particles = CHEMVENTUR.Particles;
  const Elements = CHEMVENTUR.Elements;

  CHEMVENTUR.GunSystem = {
    currentGun: 5, // Default to Atom Gun
    selectedElement: 1,
    aimAngle: -Math.PI / 2,

    getGunConfig(gunId) { return CHEMVENTUR.Guns[gunId]; },
    getOption(gunId, name) {
      const gun = this.getGunConfig(gunId);
      return gun?.options[name]?.value;
    },
    setOption(gunId, name, value) {
      const gun = this.getGunConfig(gunId);
      if (gun?.options[name]) { gun.options[name].value = value; return true; }
      return false;
    },

    setAimAngle(shipX, shipY, mouseX, mouseY) {
      this.aimAngle = Math.atan2(mouseY - shipY, mouseX - shipX);
    },

    fire(shipX, shipY, atoms, projectiles) {
      const gun = this.getGunConfig(this.currentGun);
      if (!gun) return null;

      switch (gun.special) {
        case 'proton': return this.fireBasic(shipX, shipY, 'proton', atoms);
        case 'neutron': return this.fireBasic(shipX, shipY, 'neutron', atoms);
        case 'electron': return this.fireElectronWithMusic(shipX, shipY, atoms);
        case 'zen': return null;
        case null: return this.fireAtom(shipX, shipY, atoms);
        case 'shotgun': return this.fireStringAtomShotgun(shipX, shipY, atoms);
        case 'electrogun': return this.fireElectroGun(shipX, shipY, atoms);
        case 'energies': return this.fireEnergies(shipX, shipY, projectiles);
        case 'antigun': return this.fireAntiGun(shipX, shipY, projectiles);
        case 'annihilator': return this.fireAnnihilator(shipX, shipY, atoms, projectiles);
        case 'gravityorb': return this.fireGravityOrb(shipX, shipY, projectiles);
        case 'timezone': return this.fireTimeZone(shipX, shipY, projectiles);
        case 'molecular': return this.fireMolecular(shipX, shipY, atoms);
        default: return this.fireAtom(shipX, shipY, atoms);
      }
    },

    // v120: Molecular / Stage-3 friendly shot
    fireMolecular(shipX, shipY, atoms) {
      const speed = this.getOption(this.currentGun, 'speed') || 8;
      const key = this.getOption(this.currentGun, 'molecule') || 'caffeine';
      if (CHEMVENTUR.MoleculeStructures?.[key]) {
        CHEMVENTUR.MoleculeStructures.spawn(key, shipX, shipY - 40);
        return { type: 'molecular', name: key };
      }
      // fallback to organic atom
      return this.fireAtom(shipX, shipY, atoms);
    },

    fireElectronWithMusic(shipX, shipY, atoms) {
      const speed = this.getOption(3, 'speed') || 15;
      const burst = this.getOption(3, 'burst') || 1;
      const scale = this.getOption(3, 'musicScale') || 'chromatic';

      const scales = {
        chromatic: [261.63, 277.18, 293.66, 311.13, 329.63, 349.23, 369.99, 392.00, 415.30, 440.00, 466.16, 493.88, 523.25],
        major: [261.63, 293.66, 329.63, 349.23, 392.00, 440.00, 493.88, 523.25],
        minor: [261.63, 293.66, 311.13, 349.23, 392.00, 415.30, 466.16, 523.25],
        pentatonic: [261.63, 293.66, 329.63, 392.00, 440.00, 523.25],
        blues: [261.63, 311.13, 349.23, 369.99, 392.00, 466.16, 523.25]
      };

      const notes = scales[scale] || scales.chromatic;

      for (let i = 0; i < burst; i++) {
        const vx = Math.cos(this.aimAngle) * speed + (Math.random() - 0.5) * 2;
        const vy = Math.sin(this.aimAngle) * speed;
        const p = Particles.createElectron(shipX, shipY, vx, vy);
        p.musicNote = notes[Math.floor(Math.random() * notes.length)];
        p.musicScale = scale;
        atoms.push(p);
        if (CHEMVENTUR.Audio?.playNote) CHEMVENTUR.Audio.playNote(p.musicNote, 0.1);
      }
      return { type: 'electron-music', scale };
    },

    fireElectroGun(shipX, shipY, atoms) {
      const width = this.getOption(7, 'width') || 5;
      const density = this.getOption(7, 'density') || 15;
      const speed = this.getOption(7, 'speed') || 20;
      const shots = this.getOption(7, 'chromaticShots') || 13;
      const baseFreq = this.getOption(7, 'baseFrequency') || 261.63;
      const soundEnabled = this.getOption(7, 'soundEnabled');
      const semitone = Math.pow(2, 1/12);

      for (let i = 0; i < Math.min(density, shots); i++) {
        const offset = (i - density/2) * (width * 2 / density);
        const freq = baseFreq * Math.pow(semitone, i);
        const vx = Math.cos(this.aimAngle) * speed;
        const vy = Math.sin(this.aimAngle) * speed;
        const p = Particles.createElectron(
          shipX + Math.sin(this.aimAngle) * offset,
          shipY - Math.cos(this.aimAngle) * offset,
          vx, vy
        );
        p.isBeam = true;
        p.musicFreq = freq;
        p.customColor = `hsl(${(i / shots) * 360}, 100%, 60%)`;
        atoms.push(p);
        if (soundEnabled && CHEMVENTUR.Audio?.playNote) {
          setTimeout(() => CHEMVENTUR.Audio.playNote(freq, 0.05), i * 30);
        }
      }
      return { type: 'electrogun', shots };
    },

    fireBasic(shipX, shipY, type, atoms) {
      const gunId = {proton:1, neutron:2, electron:3, positron:6}[type];
      const speed = this.getOption(gunId, 'speed') || 12;
      const burst = this.getOption(gunId, 'burst') || 1;
      const glow = this.getOption(gunId, 'glow');
      const spiral = this.getOption(gunId, 'spiral');

      for (let i = 0; i < burst; i++) {
        const vx = Math.cos(this.aimAngle) * speed + (Math.random() - 0.5) * 2;
        const vy = Math.sin(this.aimAngle) * speed;
        const p = Particles['create' + type.charAt(0).toUpperCase() + type.slice(1)](
          shipX, shipY, vx, vy, {glow, spiral}
        );
        atoms.push(p);
      }
      return {type: 'basic'};
    },

    fireAtom(shipX, shipY, atoms) {
      const speed = this.getOption(5, 'speed') || 10;
      const ionize = this.getOption(5, 'ionize') || 0;
      const spawnMode = this.getOption(5, 'spawnMode') || 'element';

      if (spawnMode === 'last-pubchem') {
        const lastKey = this.getOption(5, 'lastPubChem');
        if (lastKey && CHEMVENTUR.MoleculeStructures?.[lastKey]) {
          CHEMVENTUR.MoleculeStructures.spawn(lastKey, shipX, shipY - 30);
          return { type: 'pubchem-molecule', name: lastKey };
        }
      }

      const Z = this.selectedElement;
      const mass = Elements.getMass(Z);
      const vx = Math.cos(this.aimAngle) * speed;
      const vy = Math.sin(this.aimAngle) * speed;
      atoms.push(Particles.createAtom(shipX, shipY, Z, mass - Z, Z - ionize, { vx, vy }));
      return {type: 'atom', element: Z};
    },

    // Single clean Anti-Gun (photon / tachyon / antimatter)
    fireAntiGun(shipX, shipY, proj) {
      const mode = this.getOption(8, 'mode') || 'photon';
      const speed = this.getOption(8, 'speed') || 15;

      const p = {
        x: shipX, y: shipY,
        vx: Math.cos(this.aimAngle) * speed,
        vy: Math.sin(this.aimAngle) * speed,
        type: mode,
        trail: [],
        createTime: Date.now(),
        bounces: mode === 'photon' ? (this.getOption(8, 'photonBounces') || 10) : 0,
        bouncesLeft: mode === 'photon' ? (this.getOption(8, 'photonBounces') || 10) : 0,
        speedupFactor: mode === 'tachyon' ? (this.getOption(8, 'tachyonSpeedup') || 1.1) : 1,
        trailFade: mode === 'tachyon' ? (this.getOption(8, 'tachyonTrailFade') || 1.0) * 1000 : 500,
        strings: [],
        antimatterYield: mode === 'antimatter' ? (this.getOption(8, 'antimatterYield') || 100) : 0,
        trailLength: this.getOption(8, 'trailLength') || 20,
        repelStrength: this.getOption(8, 'repelStrength') || 10
      };

      proj.antigun = proj.antigun || [];
      proj.antigun.push(p);
      return { type: 'antigun', mode };
    },

    // Single clean Gravity Orb
    fireGravityOrb(shipX, shipY, proj) {
      const strength = this.getOption(9, 'strength') || 25;
      const repelMode = this.getOption(9, 'repelMode') || false;
      const speakerMode = this.getOption(9, 'speakerMode') || false;
      const micInput = this.getOption(9, 'microphoneInput') || false;

      const orb = {
        x: shipX, y: shipY,
        vx: Math.cos(this.aimAngle) * 6,
        vy: Math.sin(this.aimAngle) * 6,
        orbSize: this.getOption(9, 'orbSize') || 20,
        glowSize: this.getOption(9, 'glowSize') || 20,
        strength: repelMode ? -strength : strength,
        lifetime: (this.getOption(9, 'lifetime') || 8) * 1000,
        createTime: Date.now(),
        phase: 0,
        isSpeaker: speakerMode,
        isMicrophone: micInput,
        active: true
      };

      proj.gravityOrbs = proj.gravityOrbs || [];
      proj.gravityOrbs.push(orb);

      if (speakerMode && CHEMVENTUR.SoundPhysics) {
        CHEMVENTUR.SoundPhysics.linkGravityOrbToSpeaker(orb);
      }

      if (micInput && navigator.mediaDevices) {
        navigator.mediaDevices.getUserMedia({ audio: true })
          .then(stream => {
            orb.audioStream = stream;
            CHEMVENTUR.UI?.showStatus('🎤 Microphone connected!');
          })
          .catch(() => CHEMVENTUR.UI?.showStatus('🎤 Mic access denied'));
      }

      return { type: 'gravityorb', speaker: speakerMode, mic: micInput };
    },

    fireShotgun(shipX, shipY, atoms) {
      const pellets = this.getOption(6, 'pellets') || 9;
      const sMin = (this.getOption(6, 'spreadMin') || 20) * Math.PI / 180;
      const sMax = (this.getOption(6, 'spreadMax') || 80) * Math.PI / 180;
      const vMin = this.getOption(6, 'speedMin') || 5;
      const vMax = this.getOption(6, 'speedMax') || 18;
      const pType = this.getOption(6, 'particleType') || 'mixed';
      const organicMode = this.getOption(6, 'organicMode') || false;
      const includeIons = this.getOption(6, 'includeAntimatter') || false;

      const organicElements = { H: 1, C: 6, N: 7, O: 8, F: 9, P: 15, S: 16, Cl: 17 };
      const organicList = [1, 6, 7, 8, 9, 15, 16, 17];

      for (let i = 0; i < pellets; i++) {
        const spread = sMin + Math.random() * (sMax - sMin);
        const angle = this.aimAngle + (Math.random() - 0.5) * spread * 2;
        const speed = vMin + Math.random() * (vMax - vMin);
        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed;
        const x = shipX + (Math.random() - 0.5) * 20;
        const y = shipY + (Math.random() - 0.5) * 15;

        let particle;
        if (pType === 'mixed') {
          const types = ['proton', 'neutron', 'electron'];
          const type = types[Math.floor(Math.random() * 3)];
          particle = Particles['create' + type.charAt(0).toUpperCase() + type.slice(1)](x, y, vx, vy);
        } else if (pType === 'organic-mix') {
          const Z = organicList[Math.floor(Math.random() * organicList.length)];
          const ionCharge = includeIons ? Math.floor(Math.random() * 5) - 2 : 0;
          particle = Particles.createAtom(x, y, Z, Z, Z - ionCharge, { vx, vy });
        } else if (pType === 'all-chaos') {
          const chaos = Math.random();
          if (chaos < 0.3) {
            const types = ['proton', 'neutron', 'electron', 'positron'];
            const type = types[Math.floor(Math.random() * types.length)];
            particle = Particles['create' + type.charAt(0).toUpperCase() + type.slice(1)](x, y, vx, vy);
          } else if (chaos < 0.7) {
            const Z = organicList[Math.floor(Math.random() * organicList.length)];
            particle = Particles.createAtom(x, y, Z, Z, Z, { vx, vy });
          } else {
            const Z = Math.floor(Math.random() * 35) + 1;
            particle = Particles.createAtom(x, y, Z, Z, Z, { vx, vy });
          }
        } else if (organicElements[pType]) {
          const Z = organicElements[pType];
          const ionCharge = includeIons ? Math.floor(Math.random() * 3) - 1 : 0;
          particle = Particles.createAtom(x, y, Z, Z, Z - ionCharge, { vx, vy });
        } else if (['proton', 'neutron', 'electron', 'positron'].includes(pType)) {
          particle = Particles['create' + pType.charAt(0).toUpperCase() + pType.slice(1)](x, y, vx, vy);
        } else {
          particle = Particles.createProton(x, y, vx, vy);
        }

        if (organicMode && particle.p > 0) particle.organicBond = true;
        atoms.push(particle);
      }
      return {type: 'shotgun', organic: organicMode};
    },


    // ===== v120 GUN 5: String + Atom Shotgun =====
    fireStringAtomShotgun(shipX, shipY, atoms) {
      const pellets = this.getOption(5, 'pellets') || 12;
      const sMin = (this.getOption(5, 'spreadMin') || 15) * Math.PI / 180;
      const sMax = (this.getOption(5, 'spreadMax') || 70) * Math.PI / 180;
      const vMin = this.getOption(5, 'speedMin') || 6;
      const vMax = this.getOption(5, 'speedMax') || 16;
      const mix = this.getOption(5, 'mixRatio') ?? 0.5;
      const preferOrganic = this.getOption(5, 'includeOrganic') !== false;

      const organic = [1, 6, 7, 8, 9, 15, 16, 17];
      const StringSystem = CHEMVENTUR.StringSystem;

      for (let i = 0; i < pellets; i++) {
        const spread = sMin + Math.random() * (sMax - sMin);
        const angle = this.aimAngle + (Math.random() - 0.5) * spread * 2;
        const speed = vMin + Math.random() * (vMax - vMin);
        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed;
        const x = shipX + (Math.random() - 0.5) * 18;
        const y = shipY + (Math.random() - 0.5) * 12;

        if (Math.random() < mix) {
          // Atom
          const Z = preferOrganic
            ? organic[Math.floor(Math.random() * organic.length)]
            : Math.floor(Math.random() * 20) + 1;
          atoms.push(Particles.createAtom(x, y, Z, Z, Z, { vx, vy }));
        } else if (StringSystem?.createString) {
          // String
          const s = StringSystem.createString(x, y, vx, vy, 'mixed');
          if (s) {
            StringSystem.strings = StringSystem.strings || [];
            StringSystem.strings.push(s);
          }
        } else {
          // Fallback atom if no string system
          atoms.push(Particles.createProton(x, y, vx, vy));
        }
      }
      return { type: 'string-atom-shotgun', pellets };
    },

    // ===== v120 GUN 7: Pure Energies =====
    fireEnergies(shipX, shipY, proj) {
      const mode = this.getOption(7, 'mode') || 'photon';
      const intensity = this.getOption(7, 'intensity') || 8;
      const speed = this.getOption(7, 'speed') || 25;
      const spreadDeg = this.getOption(7, 'spread') || 15;
      const colorShift = this.getOption(7, 'colorShift') !== false;

      proj.energies = proj.energies || [];

      for (let i = 0; i < intensity; i++) {
        const angle = this.aimAngle + (Math.random() - 0.5) * (spreadDeg * Math.PI / 180);
        const p = {
          x: shipX, y: shipY,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          type: mode,
          energy: true,
          hue: colorShift ? (i / intensity) * 360 : 180,
          createTime: Date.now(),
          trail: []
        };
        proj.energies.push(p);
      }
      return { type: 'energies', mode, count: intensity };
    },

    // ===== v120 GUN 8: Uranium Annihilator =====
    fireAnnihilator(shipX, shipY, atoms, proj) {
      const mode = this.getOption(8, 'mode') || 'antimatter';
      const speed = this.getOption(8, 'speed') || 12;
      const yieldE = this.getOption(8, 'yield') || 150;
      const radius = this.getOption(8, 'radius') || 40;
      const showU = this.getOption(8, 'showUranium') !== false;

      if (mode === 'uranium' || showU) {
        // Shoot real uranium atom (Z=92)
        const vx = Math.cos(this.aimAngle) * speed;
        const vy = Math.sin(this.aimAngle) * speed;
        const u = Particles.createAtom(shipX, shipY, 92, 238, 92, { vx, vy });
        u.isUranium = true;
        u.annihilationYield = yieldE;
        u.blastRadius = radius;
        atoms.push(u);
        return { type: 'uranium', Z: 92, yield: yieldE };
      }

      // Other annihilation modes as projectiles
      const p = {
        x: shipX, y: shipY,
        vx: Math.cos(this.aimAngle) * speed,
        vy: Math.sin(this.aimAngle) * speed,
        type: mode,
        yield: yieldE,
        radius,
        createTime: Date.now(),
        trail: []
      };
      proj.annihilators = proj.annihilators || [];
      proj.annihilators.push(p);
      return { type: 'annihilator', mode };
    },

    fireTimeZone(shipX, shipY, proj) {
      let lts = 1 + (this.getOption(0, 'timeEffect') || -5) / 5;
      if (this.getOption(0, 'freezeZone')) lts = 0;
      if (this.getOption(0, 'reverseZone')) lts = -1;
      const speed = 4;
      const zone = {
        x: shipX, y: shipY,
        vx: Math.cos(this.aimAngle) * speed, vy: Math.sin(this.aimAngle) * speed,
        size: this.getOption(0, 'zoneSize') || 50,
        localTimeScale: lts,
        lifetime: (this.getOption(0, 'lifetime') || 10) * 1000,
        visualStyle: this.getOption(0, 'visualStyle') || 'ripple',
        createTime: Date.now(), phase: 0
      };
      proj.timeZones = proj.timeZones || [];
      proj.timeZones.push(zone);
      return {type: 'timezone'};
    }
  };

  // ProjectilePhysics stays the same (already clean)
  CHEMVENTUR.ProjectilePhysics = CHEMVENTUR.ProjectilePhysics || {};
  // ... (keep existing update methods if present, or they live elsewhere)
})();
