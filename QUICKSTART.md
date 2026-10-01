# 🎃 QUICK SETUP GUIDE - 5 MINUTES! 🎃

## Step 1: Fix Firebase Rules (2 minutes)

1. Go to: https://console.firebase.google.com/project/chemventurmulti117/database/chemventurmulti117-default-rtdb/rules
2. Change the rules to:
```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```
3. Click **"Publish"**

✅ Done!

---

## Step 2: Test Locally FIRST (1 minute)

1. Download all files from `/mnt/user-data/outputs/ChemVentur-v117-Multi/`
2. Open `index.html` in your browser
3. Test:
   - ✅ Does the game load?
   - ✅ Can you move the ship?
   - ✅ Click "CONNECT TO MULTIPLAYER" - does it work?
   - ✅ Click "ENABLE MIC" - does it work?

If YES → Continue to Step 3!

If NO → Tell me what's broken!

---

## Step 3: Upload to GitHub (2 minutes)

### Option A: Create New Repo

1. Go to GitHub → New Repository
2. Name: `ChemVentur-v117-Multi`
3. Public ✅
4. NO README (we have one!)
5. Create!

Then in your folder:
```bash
git init
git add .
git commit -m "🎃 v117 Multi - Valentine's Day!"
git remote add origin https://github.com/YOUR_USERNAME/ChemVentur-v117-Multi.git
git push -u origin main
```

### Option B: Add to Existing Repo

```bash
cd ChemVentur
git checkout -b v117-multi
# Copy all v117 files here
git add .
git commit -m "🎃 v117 Multi - Multiplayer + Touch + Mic!"
git push origin v117-multi
```

Then create a Pull Request on GitHub!

---

## Step 4: Enable GitHub Pages

1. Go to repo → Settings → Pages
2. Source: `main` (or `v117-multi`) branch
3. Folder: `/ (root)`
4. Save!

Wait 1-2 minutes... then visit:
`https://YOUR_USERNAME.github.io/ChemVentur-v117-Multi/`

---

## 🎉 DONE!

Now share the link with friends for Valentine's Day multiplayer! 💝

---

## 🐛 Quick Fixes

### "Multiplayer not connecting"
→ Did you set Firebase rules? (Step 1)

### "Microphone not working"
→ Must be HTTPS or localhost
→ Allow permission when asked
→ Turn on Grid to see waves!

### "Touch not working"
→ Open on phone/tablet
→ Touch the BLACK area (canvas)

---

**Any problems? Just ask Pumpkin! 🎃💚**
