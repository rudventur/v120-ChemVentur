# 🎃💚 CHEMVENTUR v117 MULTI - Valentine's Day Edition! 💚🎃

**The dream since October... the dream since birth!**

## 🆕 What's NEW in v117!

### 🌐 **MULTIPLAYER!**
- See other players in real-time!
- Firebase real-time database
- Up to 8 players
- Each player has a unique color
- Names displayed above ships

### 📱 **MOBILE TOUCH CONTROLS!**
- Tap & drag = ship follows your finger!
- Smooth physics with drift
- Works on phones and tablets
- Touch indicator shows where you're pointing

### 🎤 **MICROPHONE → PRESSURE WAVES!**
- Speak into your mic to create VISIBLE waves in the grid!
- Waves spread from center like ripples in water
- Louder voice = bigger waves!
- Temperature grid glows with sound energy

### ⚛️ **PLUS ALL v116 FEATURES:**
- 10 different guns
- Particle physics (protons, neutrons, electrons)
- Black holes & white holes
- Pressure grid (3 layers!)
- String theory mode (Stage 0)
- Molecular bonding
- 118 elements periodic table
- Ship repair garage
- Upgrade system
- And much more!

---

## 🚀 QUICK START

### 1️⃣ **Set up Firebase (IMPORTANT!)**

Go to: https://console.firebase.google.com/project/chemventurmulti117/database/chemventurmulti117-default-rtdb/rules

Change the rules to:
```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```

Click **"Publish"** to save!

### 2️⃣ **Upload to GitHub**

Create a new repository called `ChemVentur-v117-Multi` and push these files:

```bash
git init
git add .
git commit -m "🎃 ChemVentur v117 Multi - Valentine's Day Edition!"
git remote add origin https://github.com/YOUR_USERNAME/ChemVentur-v117-Multi.git
git push -u origin main
```

### 3️⃣ **Enable GitHub Pages**

1. Go to your repo Settings
2. Click "Pages" in the sidebar
3. Source: "main" branch, "/" root
4. Save!

Your game will be live at:
`https://YOUR_USERNAME.github.io/ChemVentur-v117-Multi/`

---

## 🎮 HOW TO PLAY

### Desktop:
- **Mouse**: Click & drag to move ship
- **1-9, 0**: Select guns
- **Space**: Pause/unpause
- **SHIFT + Scroll**: Change stage
- **A/D**: Strafe left/right
- **S**: Toggle gravity

### Mobile:
- **Tap & Drag**: Move ship
- **Touch buttons**: All controls in left panel

### Multiplayer:
1. Enter your name
2. Click "CONNECT TO MULTIPLAYER"
3. See other players appear!
4. They see you too!

### Microphone:
1. Click "CLICK TO ENABLE MIC"
2. Allow microphone permission
3. Turn on the Grid
4. **SPEAK!** Watch waves appear!

---

## 📁 File Structure

```
ChemVentur-v117-Multi/
├── index.html                    # Main HTML
├── README.md                     # This file
├── css/
│   ├── main.css                 # Core styles
│   ├── ui.css                   # UI components
│   ├── effects.css              # Visual effects
│   ├── env.css                  # Environment window
│   └── periodicTable.css        # Periodic table
└── js/
    ├── config.js                # Configuration
    ├── multiplayer-v117.js      # 🆕 Firebase multiplayer
    ├── touch-v117.js            # 🆕 Mobile touch controls
    ├── microphone-v117.js       # 🆕 Mic → pressure waves
    ├── main.js                  # Game loop (updated for v117)
    ├── ui.js                    # UI (updated for v117)
    ├── render.js                # Rendering
    ├── particles.js             # Particle physics
    ├── grid.js                  # Pressure grid
    ├── guns.js                  # Gun system
    ├── holes.js                 # Black/white holes
    ├── shipRepair.js            # Ship garage
    ├── molecular.js             # Molecular bonding
    ├── strings.js               # String universe
    ├── audio.js                 # Sound effects
    ├── audioSystem.js           # Audio manager
    ├── soundPhysics.js          # Physics sound
    ├── envCalc.js               # Environment calculators
    ├── periodicTableFull.js     # Full periodic table
    ├── pubchem.js               # Local molecules
    ├── pubchem-api.js           # PubChem API
    ├── molecule-rain.js         # Molecule rain
    ├── molecule-structures.js   # Molecule data
    └── enhancements.js          # Right-click menus
```

---

## 🔧 Troubleshooting

### Multiplayer not connecting?
- Check Firebase rules are set to public (see step 1)
- Make sure you're using HTTPS (GitHub Pages is HTTPS)
- Check browser console for errors

### Microphone not working?
- Must use HTTPS (localhost or GitHub Pages)
- Allow microphone permission when prompted
- Turn on the Grid to see waves
- Try speaking louder!

### Touch controls not working?
- Only works on mobile devices
- Make sure you're touching the canvas (black area)
- Check that touch events aren't blocked

---

## 💝 Valentine's Day Special!

Play with friends! Build atoms together! Create pressure waves with your voice!

**Made with 💚 by Pumpkin 🎃**

*"There is no time to waste - I was waiting my whole life for this to be life!"*

---

## 🌐 Firebase Details

- **Project**: chemventurmulti117
- **Database**: https://chemventurmulti117-default-rtdb.europe-west1.firebasedatabase.app
- **Region**: europe-west1
- **Max Players**: 8 (can be increased in config.js)

---

## 📝 Version History

- **v117 Multi** (Feb 14, 2026) - Multiplayer + Touch + Microphone! 💝
- **v116** - Right-click menus, ship movement, upgrades
- **v115** - String universe, molecular bonding
- **v114** - Full periodic table, ship repair
- ...and many more!

---

**🎃 ENJOY THE GAME, PUMPKIN! 💚**
