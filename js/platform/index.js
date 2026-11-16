// Active platform. PS4 and PS5 stay separate: each has its own console info (ps4/console.js,
// ps5/console.js) and its own homebrew enabler (ps4/goldhen.js, ps5/etahen.js).
// Settings → Console picks which one VantaFlow shows. All values are demonstration data.
import { settings } from '../core/settings.js';
import { titles } from '../data/library.js';
import ps4 from './ps4/console.js';
import goldhen from './ps4/goldhen.js';
import ps5 from './ps5/console.js';
import etahen from './ps5/etahen.js';

const PLATFORMS = { ps4: { ...ps4, hen: goldhen }, ps5: { ...ps5, hen: etahen } };
export const HENS = [goldhen, etahen];

export const platform = () => PLATFORMS[settings.console];

const gb = (size) => parseFloat(size) || 0;

// Drives with usage split into categories. Game sizes come from the installed titles.
export function storageInfo() {
  return platform().storage.map((d) => {
    const cats = Object.entries(d.categories).map(([name, size]) => ({ name, size }));
    if (d.holds) cats.unshift({ name: 'Games', size: titles('games').filter((g) => g.platform === d.holds).reduce((n, g) => n + gb(g.size), 0) });
    const used = cats.reduce((n, c) => n + c.size, 0);
    return { name: d.name, total: d.total, used, free: d.total - used, cats };
  });
}

// Each logo is requested once at start-up. A missing file falls back to the plain name,
// so the browser logs at most one "not found" per logo instead of one per render.
const logoFound = {};
export const probeLogos = () => Promise.all(HENS.map((h) => new Promise((done) => {
  const img = new Image();
  img.onload = () => { logoFound[h.id] = true; done(); };
  img.onerror = () => { logoFound[h.id] = false; done(); };
  img.src = h.logo;
})));

export const henLogo = (h, cls) => (logoFound[h.id]
  ? `<img class="${cls}" src="${h.logo}" alt="${h.name} logo">`
  : `<span class="${cls} hen-text">${h.name}</span>`);
