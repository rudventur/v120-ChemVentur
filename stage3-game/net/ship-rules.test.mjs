// Emulator-only test of presence-ship.rules.addition.json (never the live database).
// The addition is merged into the hub's rules (popcoin/database.rules.json from rudventur/RudVentur.com) and loaded
// into the Realtime Database emulator under the made-up project "demo-chemventur".
//   npm i @firebase/rules-unit-testing firebase firebase-tools   (the emulator needs Java)
//   npx firebase emulators:exec --only database --project demo-chemventur \
//     "node stage3-game/net/ship-rules.test.mjs /path/to/RudVentur.com/popcoin/database.rules.json"
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { ref, set, update, get, remove, serverTimestamp } from 'firebase/database';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const hubRules = process.argv[2] || path.join(here, '../../../RudVentur.com/popcoin/database.rules.json');
const rules = JSON.parse(fs.readFileSync(hubRules, 'utf8'));
const add = JSON.parse(fs.readFileSync(path.join(here, 'presence-ship.rules.addition.json'), 'utf8'));
delete add._note;
Object.assign(rules.rules, add);
const host = (process.env.FIREBASE_DATABASE_EMULATOR_HOST || '127.0.0.1:9000').split(':');
const env = await initializeTestEnvironment({ projectId: 'demo-chemventur', database: { rules: JSON.stringify(rules), host: host[0], port: +host[1] } });
const db = uid => env.authenticatedContext(uid).database();
const anon = env.unauthenticatedContext().database();
const TS = serverTimestamp();
let pass = 0, fail = 0;
async function t(name, expectOk, fn) {
  try { await (expectOk ? assertSucceeds : assertFails)(fn()); pass++; console.log('  ✅ ', name); }
  catch (e) { fail++; console.log('  ❌ ', name, '->', (e.message || '').split('\n')[0].slice(0, 160)); }
}
const P = 'games/chemventur/rooms/kitchen/';
const ship = (extra) => Object.assign({ x: 1.5, y: -2, z: 30, yaw: 0.5, pitch: 0, roll: -0.1, gun: 'proton', t: TS }, extra || {});
const profile = { name: 'Ann', avatar: '🦊', robot: true, now: { mood: '😀 Happy', status: 'playing', doing: '🎮 Gaming', energy: '🔋 4', chat: true, game: '🧪 ChemVentur', looking: '🤝 New friends' } };

// Alice is not in the presence room yet: no ship
await t('no ship before I am shown in the presence room', false, () => set(ref(db('alice'), P + 'alice'), ship()));
await env.withSecurityRulesDisabled(async (c) => {
  await set(ref(c.database(), 'presence/rooms/kitchen/alice'), { name: 'Ann', online: true, lastSeen: Date.now() - 10 });
  await set(ref(c.database(), 'presence/rooms/kitchen/bob'), { name: 'Bob', online: false, lastSeen: Date.now() - 10 });
});
await t('a ship with only position and gun', true, () => set(ref(db('alice'), P + 'alice'), ship()));
await t('a ship with the full public profile (name, avatar, robot, every right-now line)', true, () => set(ref(db('alice'), P + 'alice'), ship({ p: profile })));
await t('the profile can change live (an approved edit)', true, () => update(ref(db('alice'), P + 'alice/p'), { name: 'Ann B', avatar: '🚀' }));
await t('signed-in players read the room', true, () => get(ref(db('bob'), 'games/chemventur/rooms/kitchen')));
await t('a signed-out visitor cannot read the room', false, () => get(ref(anon, 'games/chemventur/rooms/kitchen')));
await t('nobody writes someone else\'s ship', false, () => set(ref(db('mallory'), P + 'alice'), ship({ p: { name: 'evil' } })));
await t('offline in presence (online false): no ship', false, () => set(ref(db('bob'), P + 'bob'), ship()));
await t('private field in the profile (location) is refused', false, () => set(ref(db('alice'), P + 'alice'), ship({ p: { name: 'Ann', loc: 'London' } })));
await t('private field in the profile (public note) is refused', false, () => set(ref(db('alice'), P + 'alice'), ship({ p: { name: 'Ann', note: 'hi' } })));
await t('extra field on the ship is refused', false, () => set(ref(db('alice'), P + 'alice'), ship({ email: 'a@b.c' })));
await t('an unknown right-now line is refused', false, () => set(ref(db('alice'), P + 'alice'), ship({ p: { name: 'Ann', now: { secret: 'x' } } })));
await t('a status outside the list is refused', false, () => set(ref(db('alice'), P + 'alice'), ship({ p: { name: 'Ann', now: { status: 'hacking' } } })));
await t('robot must be true or absent', false, () => set(ref(db('alice'), P + 'alice'), ship({ p: { name: 'Ann', robot: false } })));
await t('a profile needs a name', false, () => set(ref(db('alice'), P + 'alice'), ship({ p: { avatar: '🦊' } })));
await t('a name longer than 32 is refused', false, () => set(ref(db('alice'), P + 'alice'), ship({ p: { name: 'x'.repeat(33) } })));
await t('an avatar longer than 8 is refused', false, () => set(ref(db('alice'), P + 'alice'), ship({ p: { name: 'Ann', avatar: 'x'.repeat(9) } })));
await t('a mood longer than 24 is refused', false, () => set(ref(db('alice'), P + 'alice'), ship({ p: { name: 'Ann', now: { mood: 'x'.repeat(25) } } })));
await t('positions outside ±200 are refused', false, () => set(ref(db('alice'), P + 'alice'), ship({ x: 500 })));
await t('a made-up time is refused', false, () => set(ref(db('alice'), P + 'alice'), ship({ t: 123 })));
await t('a bad room name is refused', false, () => set(ref(db('alice'), 'games/chemventur/rooms/Bad Room!/alice'), ship()));
await t('leaving removes my ship (what onDisconnect does)', true, () => remove(ref(db('alice'), P + 'alice')));
await t('presence rules still refuse extra fields', false, () => set(ref(db('alice'), 'presence/rooms/kitchen/alice'), { name: 'Ann', online: true, lastSeen: TS, avatar: '🦊' }));
await t('popcoin balances stay private', false, () => get(ref(db('bob'), 'popcoin/users/alice')));
await env.cleanup();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
