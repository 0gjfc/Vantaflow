// Self-check for the DOM-free logic. Run: node tests/logic.test.mjs
import assert from 'node:assert/strict';
import { mod } from '../js/carousel.js';
import { sanitize, presetOf, DEFAULTS } from '../js/settings.js';
import { games, sortItems, resolvePath, fileTree } from '../js/data.js';

// carousel wrap-around index
assert.equal(mod(-1, 12), 11);
assert.equal(mod(12, 12), 0);
assert.equal(mod(-13, 12), 11);

// settings validation: unknown keys, wrong types, bad enum/colour/range all fall back to defaults
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
assert.equal(presetOf(DEFAULTS), 'itemzflow');
assert.equal(presetOf({ accent: '#123456', highlight: '#123456' }), 'custom');

// sorting and the mock file tree
assert.equal(sortItems(games, 'name')[0].title, 'Ashen Frontier');
assert.equal(sortItems(games, 'titleId')[0].id, 'CUSA17702');
assert.equal(sortItems(games, 'recent')[0].lastPlayed, '2026-11-15');
assert.equal(resolvePath(fileTree, ['data', 'GoldHEN']).name, 'GoldHEN');
assert.equal(resolvePath(fileTree, ['data', 'nope']), null);

console.log('logic.test: all checks passed');
