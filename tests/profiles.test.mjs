// Console profiles and the shared account. Run: node tests/profiles.test.mjs
// Uses an in-memory localStorage so the real persistence code runs unchanged.
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};
let fresh = 0;
const load = () => import(`../js/core/settings.js?run=${fresh++}`); // new module state each time
const stored = (k) => JSON.parse(mem.get(`vantaflow.${k}`) ?? 'null');

// 1. Default: the account is shared by PS4 and PS5, console settings are not.
let m = await load();
assert.equal(m.activeProfile(), 'ps4');
assert.equal(m.accountsSeparate(), false);
m.set({ username: 'Shared_Kai', avatarColor: '#22b07d', accent: '#e0434f' });
m.switchProfile('ps5');
assert.equal(m.settings.username, 'Shared_Kai', 'name is shared by default');
assert.equal(m.settings.avatarColor, '#22b07d', 'avatar is shared by default');
assert.equal(m.settings.accent, m.DEFAULTS.accent, 'appearance stays per console');
m.set({ username: 'Renamed' });
m.switchProfile('ps4');
assert.equal(m.settings.username, 'Renamed', 'renaming on PS5 renames the shared account');
assert.equal(m.settings.accent, '#e0434f');
assert.ok(!('username' in stored('settings.ps4')), 'account is not stored inside console settings');

// 2. Separate accounts: each console keeps its own name; turning it on changes nothing on screen.
m.setAccountsSeparate(true);
assert.equal(m.settings.username, 'Renamed');
m.switchProfile('ps5');
assert.equal(m.settings.username, 'Renamed', 'PS5 starts from the account that was shared');
m.set({ username: 'PS5_Player' });
m.switchProfile('ps4');
assert.equal(m.settings.username, 'Renamed', 'PS4 keeps its own account');
m.switchProfile('ps5');
assert.equal(m.settings.username, 'PS5_Player');

// 3. Survives a restart.
m = await load();
assert.equal(m.activeProfile(), 'ps5');
assert.equal(m.accountsSeparate(), true);
assert.equal(m.settings.username, 'PS5_Player');

// 4. Turning separate accounts off keeps the current account as the shared one.
m.setAccountsSeparate(false);
m.switchProfile('ps4');
assert.equal(m.settings.username, 'PS5_Player');

// 5. Upgrade from Stage 3: the account stored inside the active console profile becomes shared.
mem.clear();
mem.set('vantaflow.profile.active', JSON.stringify('ps4'));
mem.set('vantaflow.settings.ps4', JSON.stringify({ username: 'Legacy', avatarColor: '#8b5cf6', accent: '#d4a017' }));
mem.set('vantaflow.settings.ps5', JSON.stringify({ username: 'Other', accent: '#22b07d' }));
m = await load();
assert.equal(m.settings.username, 'Legacy');
m.switchProfile('ps5');
assert.equal(m.settings.username, 'Legacy', 'shared account after upgrade');
assert.equal(m.settings.accent, '#22b07d', 'PS5 appearance kept');

console.log('profiles.test: all checks passed');
