// Self-check for the DOM-free logic. Run: node tests/logic.test.mjs
import assert from 'node:assert/strict';
import { mod } from '../js/ui/carousel.js';
import { sanitize, presetOf, DEFAULTS } from '../js/core/settings.js';
import { games, buildFileTree, resolvePath } from '../js/data/mock.js';
import { loadLibrary, titles, sortItems } from '../js/data/library.js';
import goldhen from '../js/platform/ps4/goldhen.js';
import etahen from '../js/platform/ps5/etahen.js';

// carousel wrap-around index
assert.equal(mod(-1, 12), 11);
assert.equal(mod(12, 12), 0);
assert.equal(mod(-13, 12), 11);

// settings validation: unknown keys, wrong types, bad enum/colour/range/name fall back to defaults
const s = sanitize({ bgMode: 'image', accent: '#ABCDEF', volume: 70, speed: 'warp', highlight: 'red', bgDim: 300, wrap: 'yes', evil: 1 });
assert.equal(s.bgMode, 'image');
assert.equal(s.accent, '#ABCDEF');
assert.equal(s.volume, 70);
assert.equal(s.speed, DEFAULTS.speed);
assert.equal(s.highlight, DEFAULTS.highlight);
assert.equal(s.bgDim, DEFAULTS.bgDim);
assert.equal(s.wrap, DEFAULTS.wrap);
assert.ok(!('evil' in s));
assert.deepEqual(sanitize(null), { ...DEFAULTS });
assert.equal(sanitize({ console: 'ps5' }).console, 'ps5');
assert.equal(sanitize({ console: 'ps6' }).console, 'ps4');
assert.equal(sanitize({ username: 'Kai_99' }).username, 'Kai_99');
assert.equal(sanitize({ username: '<script>' }).username, DEFAULTS.username);
assert.equal(sanitize({ username: 'x'.repeat(17) }).username, DEFAULTS.username);
assert.equal(sanitize({ presence: 'busy' }).presence, DEFAULTS.presence);
assert.equal(presetOf(DEFAULTS), 'itemzflow');
assert.equal(presetOf({ accent: '#123456', highlight: '#123456' }), 'custom');

// PS4 and PS5 libraries stay separate: PS4 sees only CUSA titles, PS5 adds its own PPSA titles
await loadLibrary('ps4');
assert.ok(titles('games').every((g) => g.platform === 'ps4'));
const ps4Count = titles('games').length;
await loadLibrary('ps5');
assert.ok(titles('games').some((g) => g.platform === 'ps5'));
assert.equal(titles('games').length, games.length);
assert.ok(titles('games').length > ps4Count);

// sorting
assert.equal(sortItems(games, 'name')[0].title, 'Aether Drift');
assert.equal(sortItems(games, 'titleId')[0].id, 'CUSA17702');
assert.equal(sortItems(games, 'recent')[0].lastPlayed, '2026-11-16');

// file tree follows the console's homebrew enabler
assert.ok(resolvePath(buildFileTree(goldhen, []), ['data', 'GoldHEN', 'plugins']));
assert.equal(resolvePath(buildFileTree(goldhen, []), ['data', 'etaHEN']), null);
assert.ok(resolvePath(buildFileTree(etahen, []), ['data', 'etaHEN', 'plugins']));
assert.notEqual(goldhen.id, etahen.id);
assert.equal(etahen.logo, 'assets/etahen/etahen-logo.png');

console.log('logic.test: all checks passed');
