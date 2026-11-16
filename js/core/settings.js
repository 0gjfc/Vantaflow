// User preferences: defaults, validation, change events. Persisted through core/store.js.
// PS4 and PS5 are separate profiles: each keeps its own settings, favourites, background image
// and selected console, so switching consoles never mixes them.
// Pure functions (sanitize, presetOf) are DOM-free so tests can import this in Node.
import { load, save } from './store.js';

export const PRESETS = {
  itemzflow: { label: 'Itemzflow Blue (default)', accent: '#1d86f0', highlight: '#1d86f0' },
  graphite: { label: 'Graphite', accent: '#9aa4b2', highlight: '#5b6472' },
  gold: { label: 'GoldHEN Gold', accent: '#d4a017', highlight: '#a87c0c' },
  emerald: { label: 'Emerald', accent: '#22b07d', highlight: '#178a60' },
  crimson: { label: 'Crimson', accent: '#e0434f', highlight: '#b3303b' },
  violet: { label: 'Violet', accent: '#8b5cf6', highlight: '#6d43d9' },
};

export const SWATCHES = ['#1d86f0', '#4fa3ff', '#00b4d8', '#22b07d', '#7cb342', '#d4a017', '#ff8c1a', '#e0434f', '#e8508f', '#8b5cf6', '#9aa4b2', '#5b6472'];

export const DEFAULTS = Object.freeze({
  bgMode: 'shader', bgDim: 0,
  accent: PRESETS.itemzflow.accent, highlight: PRESETS.itemzflow.highlight,
  animations: true, speed: 'normal', reflections: true, bgAnimated: true,
  uiSounds: true, volume: 50, music: false,
  wrap: true, swapConfirm: false, showPrompts: true, sortBy: 'name',
  clock24: true, showTitleIds: true, navLabels: 'active', coverSize: 'itemzflow',
  username: 'Player One', avatarColor: '#1d86f0', presence: 'online',
});

export const CHOICES = {
  bgMode: ['shader', 'plain', 'image'],
  speed: ['slow', 'normal', 'fast'],
  sortBy: ['name', 'titleId', 'recent'],
  navLabels: ['active', 'always'],
  coverSize: ['itemzflow', 'large'],
  presence: ['online', 'away', 'offline'],
};

const HEX = /^#[0-9a-f]{6}$/i;
export const USERNAME = /^[\p{L}\p{N} _.-]{1,16}$/u;
const CHECKS = {
  accent: (v) => HEX.test(v),
  highlight: (v) => HEX.test(v),
  avatarColor: (v) => HEX.test(v),
  bgDim: (v) => v >= 0 && v <= 100,
  volume: (v) => v >= 0 && v <= 100,
  username: (v) => USERNAME.test(v) && v.trim() === v,
};

// Keep only known keys whose value has the default's type and passes its constraint.
export function sanitize(raw) {
  const out = { ...DEFAULTS };
  if (!raw || typeof raw !== 'object') return out;
  for (const k of Object.keys(DEFAULTS)) {
    const v = raw[k];
    if (typeof v !== typeof DEFAULTS[k]) continue;
    if (CHOICES[k] && !CHOICES[k].includes(v)) continue;
    if (CHECKS[k] && !CHECKS[k](v)) continue;
    out[k] = v;
  }
  return out;
}

export function presetOf(s) {
  const hit = Object.entries(PRESETS).find(([, p]) => p.accent === s.accent.toLowerCase() && p.highlight === s.highlight.toLowerCase());
  return hit ? hit[0] : 'custom';
}

export const PROFILES = ['ps4', 'ps5'];

// Stage 2 kept one settings object with a `console` field; it seeds both profiles once.
const legacy = load('settings.v1');
let profile = PROFILES.includes(load('profile.active')) ? load('profile.active') : (PROFILES.includes(legacy?.console) ? legacy.console : 'ps4');
const loadProfile = (id) => sanitize(load(`settings.${id}`) ?? legacy);

export const activeProfile = () => profile;
export const settings = loadProfile(profile);
const listeners = new Set();

export const onChange = (fn) => listeners.add(fn);
const emit = (patch) => listeners.forEach((fn) => fn(settings, patch));

export function set(patch) {
  Object.assign(settings, sanitize({ ...settings, ...patch }));
  save(`settings.${profile}`, settings);
  emit(patch);
}

// Switch to the other console profile. Listeners get `profile` in the patch.
export function switchProfile(id) {
  if (!PROFILES.includes(id) || id === profile) return;
  save(`settings.${profile}`, settings);
  profile = id;
  save('profile.active', id);
  Object.assign(settings, loadProfile(id));
  favorites.clear();
  loadFavorites().forEach((f) => favorites.add(f));
  emit({ ...settings, profile: id });
}

export const resetAll = () => { setBgImage(null); set({ ...DEFAULTS }); };

// Custom background (data URL), per profile. Returns false when it does not fit in storage.
export const getBgImage = () => load(`background.${profile}`);
export const setBgImage = (dataUrl) => save(`background.${profile}`, dataUrl);

// Favourite title ids, per profile.
function loadFavorites() {
  const saved = load(`favorites.${profile}`, load('favorites.v1', []));
  return Array.isArray(saved) ? saved : [];
}
export const favorites = new Set(loadFavorites());
export function toggleFavorite(id) {
  if (!favorites.delete(id)) favorites.add(id);
  save(`favorites.${profile}`, [...favorites]);
  return favorites.has(id);
}

// Selected console per profile (an id from the detection provider).
export const selectedConsole = (id = profile) => load(`console.${id}`);
export const setSelectedConsole = (id, consoleId) => save(`console.${id}`, consoleId);
