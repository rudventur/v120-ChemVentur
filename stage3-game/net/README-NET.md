# Stage 3 multiplayer preview (`js/s3g-net.js`)

There's no multiplayer gameplay yet. This file only gets the wiring ready.

## What works now
- **The capital R:** the useRbox from RudVentur.com (`https://rudventur.github.io/RudVentur.com/embed/useRbox.js`) loads on both game pages, at the top right. The game's top-right buttons move left of it, and on phones the R is smaller.
- **Pausing:** while the big useRbox panel is open, the game pauses and held keys are cleared. It resumes when the panel closes, but only if the useRbox was what paused it. Typing in the useRbox never triggers game keys, because the keys layer ignores input fields.
- **The option:** "Show me to others (multiplayer preview)" is in the steering options window (⚙ or O). It's **off by default**. When on, it puts you in the useRbox room `chemventur`, using the useRbox's own "Show me in the room list". When off, the previous room is given back.
- **Ghost ships:** other people in that room appear as cyan wireframe ghost ships, parked in a ring near the start point.

## What needs a merge first
The live presence code (Firebase, `rvUserbox.presence`) is on RudVentur.com branch `fix/restore-capital-r` in commit `f009b2c`. It is **not on `main` yet**, because it was pushed after pull request 46 was merged. Until it's merged and its rules are published, the option says the R is there but nobody else shows up.

## What needs database rules
Ship positions (`CHEMVENTUR.net.sendState`) need a place in the database. The presence rules reject any extra fields. `presence-ship.rules.addition.json` is a proposed, **not applied** addition. It's a separate `games/chemventur/rooms/<room>/<uid>` node, only for signed-in users, and each user can only write their own entry. You must be in the presence room first, and the numbers are range-checked. Popcoin and presence rules don't change. Until then `sendState` returns `false` and nothing leaves the browser.

A transport can be plugged in with `CHEMVENTUR.net.useTransport({ sendState(room, state), onState(cb) })`.

## The adapter
`CHEMVENTUR.net.join(room)`, `.leave()`, `.onPeers(cb)`, `.sendState(ship)`, `.onState(cb)`, `.setEnabled(on)`, `.status()`.
