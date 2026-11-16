// Section registry. The order here is the order of the top bar and of L1 / R1: profile (avatar),
// the 11 icons, the homebrew badge, then the console status (Consoles page).
// Sections with `platform` (GoldHEN, etaHEN) only appear while that console is selected.
// Sections with `slot` are opened from the avatar or the console status, not from an icon.
import { settings, favorites } from '../core/settings.js';
import { titles, sortItems } from '../data/library.js';
import { profileSection, storeSection, trophySection, friendsSection, notificationsSection, mediaSection, filesSection, powerSection } from './content.js';
import { settingsSection } from './settings.js';
import { goldhenSection, etahenSection } from './hen.js';
import { consolesSection } from './consoles.js';
import { setupSection } from './setup.js';

const withFav = (it) => ({ ...it, fav: favorites.has(it.id) });

// Coverflow sections read straight from the title library (data/library.js).
const flow = (id, label, short, icon, shape, noun) => ({
  id, label, short, icon, view: 'flow', shape, noun,
  items: () => sortItems(titles(id), settings.sortBy).map(withFav),
});

export const SECTIONS = [
  profileSection,
  flow('games', 'Games', 'Games', 'games', 'case', 'installed'),
  flow('apps', 'Applications', 'Apps', 'apps', 'square', 'apps'),
  storeSection,
  settingsSection,
  trophySection,
  friendsSection,
  notificationsSection,
  mediaSection,
  filesSection,
  flow('homebrew', 'Homebrew Applications', 'Homebrew', 'flask', 'square', 'homebrew apps'),
  powerSection,
  goldhenSection,
  etahenSection,
  consolesSection,
  setupSection, // opened from Settings → System (slot 'settings'): no icon, not in L1 / R1
];
