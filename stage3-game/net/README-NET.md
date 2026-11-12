# Stage 3 multiplayer with the useRbox profile (`js/s3g-net.js`)

Other players fly as ghost ships with a name tag. The tag shows what they chose to share from their **approved** useRbox profile. Tap or click a tag (or press **I**) and their profile opens in the middle column of the useRbox.

## Turning it on
- The option is **"Show me to others"** in the steering options window (⚙ or O). It is **off by default**.
- Being seen needs **two** switches, and the game never flips the second one by itself:
  1. "Show me to others" in the game.
  2. "Show me in the room list" in the useRbox (and the useRbox not in private mode 🌐).
  If the second one is off, the option says you are hidden and offers a **👁 Show me in the room list** button. Until you press it, nothing leaves the browser. You still see the other players.

## Which room
- The game joins the **room or channel picked in the useRbox** (`rudventur_channel`). If none was ever picked, it uses `chemventur` and gives the empty choice back when you turn multiplayer off.
- Joining another room or channel in the useRbox while playing (the room buttons, 📡 CHANNELS, an invite link) **moves the game there**. Your ship record leaves the old room and the old ghosts disappear.
- The useRbox people list (`rvUserbox.setChannelPeople`) shows everyone in the room. Players flying in the game have a **🚀** after their name.

## What your ship carries
Your ship carries this only while all three are true: the option is on, you are in a room, and room sharing is on in the useRbox.

| Field | From the useRbox | When |
|---|---|---|
| `x y z yaw pitch roll gun` | the game | always (positions are clamped to ±200, angles to −π…π) |
| `p.name` | the approved name | once a profile has been approved |
| `p.avatar` | the approved avatar emoji | if set |
| `p.robot` | "🤖 I am a robot" | only if answered |
| `p.now.mood / status / doing / energy / chat / game / looking` | the "right now" lines | **only the lines with their 👁 share box ticked** |

- **Never shared:** the builder's unapproved draft (it sits in `rvProfileDraft` and the game never reads it), location, signature, notes, languages, burial wish, restaurant, wallet.
- **Draft only:** a profile that was never approved sends **no profile**, and other players see "useR".
- **Live updates:** approving a change in the useRbox (✅ APPROVE AND CREATE PROFILE), answering the robot question, or saving updates your ship at once. Otherwise it is checked every second. Other players' tags and the people list update as soon as their ship record changes.
- **Incoming cleanup:** ships from other players are cleaned the same way. Anything outside the list above is dropped before it reaches the screen.

## The database
- Ship records live at `games/chemventur/rooms/<room>/<uid>` in the same Firebase project as the useRbox presence (`popcoin-c039a`).
- They use the useRbox's own anonymous sign-in (Firebase app `rvpresence`), so the uid matches the presence record.
- Each record is removed when you leave, switch room, or close the tab (`onDisconnect`).

### Needs publishing by hand
`presence-ship.rules.addition.json` is a proposed addition. It is **not applied**. It allows:
- **Who:** only signed-in useRs, each writing only their own ship.
- **When:** only while their presence record in the **same room** says `online: true`.
- **What:** only the fields in the table above, with the same limits as the useRbox presence rules. `robot` may only be `true`, and the time must be the server's.

Everything else in the rules stays exactly as it is.

To publish it:
1. Paste the `games` block (without `_note`) into `popcoin/database.rules.json` in rudventur/RudVentur.com, next to `presence`.
2. Publish the rules in the Firebase console.

Until then, the database refuses ship records. The game backs off and the option shows "the ship database rules are not published yet". Presence (who is in the room) still works, so ghosts are parked in a ring without moving.

## Tests (never the live database)
- **`tests/s3g-net-headless.js`:** headless Chrome with a mocked useRbox and a fake transport. It covers the profile gate (option, room sharing, private mode, draft), the fields that go out, name tags, opening a profile by click and by key, the people list, live edits, following the useRbox room, and switching off.
  - With `REAL_RBOX=1` it also loads the real live useRbox for screenshots (`v120-net-ghost-tags.png`, `v120-net-ghost-profile.png`). Every Firebase and config request is blocked there, so nothing reaches the database.
- **`net/ship-rules.test.mjs`:** the rules addition merged into the hub's rules, run against the **Realtime Database emulator** only, with the made-up project `demo-chemventur`:
  `npx firebase emulators:exec --only database --project demo-chemventur "node stage3-game/net/ship-rules.test.mjs /path/to/RudVentur.com/popcoin/database.rules.json"`

## The adapter
`CHEMVENTUR.net`:
- `.join(room?)`, `.leave()`, `.setEnabled(on)`, `.status()`
- `.onPeers(cb)`, `.onState(cb)`, `.onProfile(cb)`
- `.sendState(ship)`, `.sharedProfile()`, `.approvedProfile()`, `.roomSharing()`, `.refreshProfile()`
- `.showPeer(id)`, `.showNearest()`
- `.useTransport({ sendState(room, rec), onState(cb), watch(room), leave(room) })`

The key **I** is the rebindable `peerProfile` action in the keyboard options. In the I J K L preset it is the slash key.
