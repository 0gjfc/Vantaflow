// Title library: the one place Games, Applications and Homebrew come from.
//
// Stage 2 reads mock data. To use real titles later, replace `source.load` with a loader
// that asks the console (or a file listing) and resolves to the same shape:
//   { games: Title[], apps: Title[], homebrew: Title[] }
//   Title = { id, title, kind, platform, version, type, size, desc, ...optional extras }
// Everything else (carousel, trophies, storage, file manager) reads through `titles()`.
import * as mock from './mock.js';

const source = {
  async load(platformId) {
    return {
      // A PS5 also runs backward-compatible PS4 titles; a PS4 runs only its own.
      games: mock.games.filter((g) => g.platform === platformId || (platformId === 'ps5' && g.platform === 'ps4')),
      apps: mock.apps,
      homebrew: mock.homebrew,
    };
  },
};

let library = { games: [], apps: [], homebrew: [] };

export async function loadLibrary(platformId) {
  library = await source.load(platformId);
  return library;
}

export const titles = (kind) => library[kind];

export function sortItems(items, by) {
  const out = [...items];
  if (by === 'titleId') out.sort((a, b) => a.id.localeCompare(b.id));
  else if (by === 'recent') out.sort((a, b) => (b.lastPlayed || '').localeCompare(a.lastPlayed || '') || a.title.localeCompare(b.title));
  else out.sort((a, b) => a.title.localeCompare(b.title));
  return out;
}

export function formatPlayed(mins) {
  if (!mins) return '—';
  const h = Math.floor(mins / 60);
  return h ? `${h} h ${mins % 60} min` : `${mins} min`;
}
