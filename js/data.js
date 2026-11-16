// Mock data for the Stage 1 prototype. Nothing here talks to a console.
// To use real cover art, add `cover: 'assets/covers/CUSA00000.png'` to a game entry.

export const profile = { name: 'Player One', level: 214, colors: ['#1d86f0', '#0b3f8c'] };

export const consoleStatus = {
  model: 'PS4 Pro', firmware: '9.00', connection: 'Online', ip: '192.168.1.24', temperature: '52°C',
};

export const storage = [
  { name: 'Internal', total: 825, used: 612.4 },
  { name: 'USB0', total: 1863, used: 845.1 },
];

export const games = [
  { id: 'CUSA31027', title: 'Ashen Frontier', version: '01.08', type: 'Retail', genre: 'Action RPG', publisher: 'Northwind Studios', released: '2023', size: '48.2 GB', played: 4260, lastPlayed: '2026-11-14', trophies: [31, 52],
    desc: 'Reclaim a fallen kingdom across a volcanic wasteland.', art: { motif: 'mountains', colors: ['#1a0f0b', '#7a2a14', '#e0703a', '#ffe2b8'], font: 'serif', tagline: 'The embers remember' } },
  { id: 'CUSA28411', title: 'Neon Harbor', version: '01.02', type: 'Retail', genre: 'Open World', publisher: 'Glasshouse Interactive', released: '2022', size: '61.7 GB', played: 1890, lastPlayed: '2026-11-02', trophies: [18, 44],
    desc: 'A rain-soaked port city run by rival syndicates.', art: { motif: 'city', colors: ['#05070f', '#172a52', '#3d6fb8', '#e8f1ff'], font: 'sans', tagline: 'Every light hides a deal' } },
  { id: 'CUSA19935', title: 'Tidebreaker', version: '01.15', type: 'Retail', genre: 'Naval Adventure', publisher: 'Saltline Games', released: '2021', size: '33.9 GB', played: 2710, lastPlayed: '2026-10-21', trophies: [40, 40],
    desc: 'Command a privateer fleet across uncharted seas.', art: { motif: 'ship', colors: ['#06141c', '#0f4c5c', '#5fa8b8', '#f4f1e8'], font: 'serif', tagline: 'Chart the unknown' } },
  { id: 'CUSA24510', title: 'Velocity Circuit GT', version: '02.01', type: 'Retail', genre: 'Racing', publisher: 'Apex Motorworks', released: '2024', size: '72.4 GB', played: 960, lastPlayed: '2026-11-15', trophies: [22, 61],
    desc: 'Over 300 licensed-style tracks and full career mode.', art: { motif: 'road', colors: ['#0b0b12', '#3a1020', '#d8342c', '#fff4e0'], font: 'wide', tagline: 'Own the apex' } },
  { id: 'CUSA17702', title: 'Hollow Crown', version: '01.04', type: 'Retail', genre: 'Souls-like', publisher: 'Gravemark', released: '2020', size: '27.3 GB', played: 5520, lastPlayed: '2026-09-30', trophies: [35, 41],
    desc: 'A punishing descent beneath a cursed cathedral.', art: { motif: 'ruins', colors: ['#08080a', '#2a2a33', '#8a8aa0', '#e8e4da'], font: 'serif', tagline: 'Kneel or be forgotten' } },
  { id: 'CUSA33190', title: 'Starlight Odyssey', version: '01.00', type: 'Retail', genre: 'Space Exploration', publisher: 'Parallax Works', released: '2025', size: '55.0 GB', played: 340, lastPlayed: '2026-11-10', trophies: [6, 48],
    desc: 'Explore a procedurally charted galaxy with your crew.', art: { motif: 'planet', colors: ['#03040c', '#1b1450', '#5b4bd1', '#f2ecff'], font: 'wide', tagline: 'Beyond the last beacon' } },
  { id: 'CUSA20865', title: 'Wildheart Saga', version: '01.11', type: 'Retail', genre: 'Adventure', publisher: 'Oakfield Studio', released: '2021', size: '41.6 GB', played: 3120, lastPlayed: '2026-08-18', trophies: [47, 58],
    desc: 'A hunter and her wolf journey through ancient forests.', art: { motif: 'forest', colors: ['#06100a', '#1d3d24', '#6fa36b', '#f4f7e8'], font: 'serif', tagline: 'Follow the old roads' } },
  { id: 'CUSA26093', title: 'Frostfall', version: '01.06', type: 'Retail', genre: 'Survival', publisher: 'Polar Nine', released: '2023', size: '22.8 GB', played: 780, lastPlayed: '2026-07-04', trophies: [12, 36],
    desc: 'Survive the long night at the top of the world.', art: { motif: 'peaks', colors: ['#0a1622', '#3b5a78', '#b9d3e8', '#ffffff'], font: 'sans', tagline: 'Endure the white' } },
  { id: 'CUSA22448', title: 'Shadow Protocol', version: '01.03', type: 'Retail', genre: 'Stealth Action', publisher: 'Blackline Interactive', released: '2022', size: '46.1 GB', played: 1460, lastPlayed: '2026-10-05', trophies: [29, 50],
    desc: 'Infiltrate. Extract. Leave no trace.', art: { motif: 'mask', colors: ['#050505', '#1c1c1c', '#b0141e', '#f1f1f1'], font: 'wide', tagline: 'Trust no signal' } },
  { id: 'CUSA29377', title: 'Echoes of Kaldera', version: '01.09', type: 'Retail', genre: 'JRPG', publisher: 'Lumen Field', released: '2024', size: '38.4 GB', played: 4890, lastPlayed: '2026-11-12', trophies: [44, 55],
    desc: 'Twelve heroes, one dying sun, and a song to save it.', art: { motif: 'sun', colors: ['#1b0d1f', '#7c2a4e', '#f19c5b', '#fff3d6'], font: 'serif', tagline: 'Sing the dawn back' } },
  { id: 'CUSA25516', title: 'Iron Tide', version: '01.01', type: 'Retail', genre: 'Tactical Shooter', publisher: 'Fieldline', released: '2023', size: '84.9 GB', played: 2200, lastPlayed: '2026-11-08', trophies: [20, 47],
    desc: 'Squad-based warfare on a storm-battered coastline.', art: { motif: 'waves', colors: ['#070b0e', '#28343c', '#7d8c94', '#eef2f4'], font: 'wide', tagline: 'Hold the line' } },
  { id: 'CUSA18820', title: 'Moonlit Garden', version: '01.00', type: 'Retail', genre: 'Puzzle', publisher: 'Little Lantern', released: '2020', size: '4.2 GB', played: 510, lastPlayed: '2026-06-11', trophies: [24, 24],
    desc: 'A calm puzzle journey through a garden that blooms at night.', art: { motif: 'moon', colors: ['#060a18', '#1b2a5a', '#7f9ad8', '#fdf6e3'], font: 'serif', tagline: 'Bloom after dark' } },
].map((g) => ({ ...g, kind: 'game' }));

export const apps = [
  { id: 'NPXS20001', title: 'Media Player', icon: 'media', colors: ['#0f3b78', '#1d86f0'], desc: 'Play music and video from USB or a media server.' },
  { id: 'NPXS20010', title: 'Web Browser', icon: 'globe', colors: ['#0b4d5e', '#18a5b8'], desc: 'Browse the web on your TV.' },
  { id: 'NPXS20103', title: 'Library', icon: 'apps', colors: ['#2b2f3a', '#59627a'], desc: 'All your installed games and apps.' },
  { id: 'NPXS20113', title: 'TV & Video', icon: 'tv', colors: ['#4a1530', '#c43b6e'], desc: 'Streaming services in one place.' },
  { id: 'NPXS20004', title: 'Capture Gallery', icon: 'image', colors: ['#14402a', '#2fae6a'], desc: 'Screenshots and video clips.' },
  { id: 'NPXS20011', title: 'Music', icon: 'music', colors: ['#3d1f63', '#8d5fd3'], desc: 'Background music while you play.' },
  { id: 'NPXS20991', title: 'Remote Play', icon: 'remote', colors: ['#183056', '#3f78c9'], desc: 'Stream your console to another device.' },
  { id: 'NPXS20132', title: 'Video Editor', icon: 'film', colors: ['#5a2a10', '#e07a2c'], desc: 'Edit and share your gameplay clips.' },
].map((a) => ({ ...a, kind: 'app', version: '01.00', type: 'System', size: '—' }));

export const homebrew = [
  { id: 'ITEM00001', title: 'Itemzflow', icon: 'apps', colors: ['#0c2747', '#1d86f0'], desc: 'Game manager and alternate dashboard.' },
  { id: 'APOL00004', title: 'Apollo Save Tool', icon: 'save', colors: ['#2a1c05', '#d49a1e'], desc: 'Save game manager and resigner.' },
  { id: 'RETR00001', title: 'RetroArch', icon: 'games', colors: ['#1a1a1a', '#5a5a5a'], desc: 'Multi-system emulator frontend.' },
  { id: 'LAPY20009', title: 'PS4 Xplorer', icon: 'folder', colors: ['#3b2a06', '#c79a2a'], desc: 'File manager for internal and USB storage.' },
  { id: 'NPXS39041', title: 'Homebrew Store', icon: 'store', colors: ['#0d3d33', '#22b07d'], desc: 'Browse and download homebrew.' },
  { id: 'FTPS00001', title: 'FTP Server', icon: 'network', colors: ['#162447', '#4361b8'], desc: 'Transfer files over the local network.' },
  { id: 'KODI00001', title: 'Kodi', icon: 'media', colors: ['#0d2a3a', '#17b2e8'], desc: 'Media center.' },
  { id: 'CHTM00777', title: 'Cheats Manager', icon: 'flask', colors: ['#3a2a08', '#d4a017'], desc: 'Manage GoldHEN cheat files.' },
].map((h) => ({ ...h, kind: 'homebrew', version: '1.0', type: 'Homebrew', size: '24 MB' }));

export const store = [
  { id: 'S1', title: 'Skybound Legends', price: '$59.99', tag: 'New Release', rating: '4.7', size: '52.1 GB', desc: 'Sky-island action adventure with drake mounts.', art: { motif: 'peaks', colors: ['#0b1b33', '#2f6aa8', '#9cd0f5', '#ffffff'], font: 'wide', tagline: 'Rise above' } },
  { id: 'S2', title: 'Rift Hunters', price: '$39.99', tag: 'Top Seller', rating: '4.5', size: '30.4 GB', desc: 'Co-op monster hunting across shattered dimensions.', art: { motif: 'planet', colors: ['#0a0614', '#3b1a5c', '#b061d9', '#f8eaff'], font: 'wide', tagline: 'Hunt together' } },
  { id: 'S3', title: 'Paper Lantern', price: '$14.99', tag: 'Indie Spotlight', rating: '4.9', size: '2.8 GB', desc: 'A hand-drawn platformer about finding your way home.', art: { motif: 'moon', colors: ['#120c06', '#5a3a14', '#e0a54a', '#fff4dc'], font: 'serif', tagline: 'Light the way' } },
  { id: 'S4', title: 'Gridline Tactics', price: '$29.99', tag: 'Sale −40%', rating: '4.3', size: '9.6 GB', desc: 'Turn-based squad tactics in a collapsing megacity.', art: { motif: 'city', colors: ['#06090c', '#1e3a2e', '#3fb07a', '#e8fff2'], font: 'sans', tagline: 'Every move counts' } },
  { id: 'S5', title: 'Deepwater', price: '$24.99', tag: 'Coming Soon', rating: '—', size: '18.0 GB', desc: 'Survival horror at the bottom of the ocean.', art: { motif: 'waves', colors: ['#020a10', '#06303f', '#1f8aa0', '#d8f6ff'], font: 'serif', tagline: 'Do not surface' } },
  { id: 'S6', title: 'Monthly Games Pack', price: 'Included', tag: 'Subscription', rating: '—', size: '—', desc: 'A rotating selection of games for subscribers.', art: { motif: 'sun', colors: ['#0b1020', '#1d3f8a', '#1d86f0', '#ffffff'], font: 'wide', tagline: 'Play more' } },
];

export const trophyNames = ['First Steps', 'Seasoned', 'Collector', 'Unbroken', 'Master of Arms', 'Completionist', 'Hidden Path', 'Night Owl'];

export const friends = [
  { name: 'NightCrow_88', status: 'online', activity: 'Playing Hollow Crown', level: 302 },
  { name: 'pixel.mara', status: 'online', activity: 'Playing Velocity Circuit GT', level: 117 },
  { name: 'Jaxon-Ridge', status: 'away', activity: 'Away · 25 min', level: 88 },
  { name: 'Sunfire_Kei', status: 'online', activity: 'In menu', level: 251 },
  { name: 'TheQuietOne', status: 'offline', activity: 'Last online 2 days ago', level: 63 },
  { name: 'Valkyr1e', status: 'offline', activity: 'Last online 5 hours ago', level: 190 },
  { name: 'drift_king_404', status: 'away', activity: 'Away · 1 h', level: 142 },
];

export const notifications = [
  { title: 'Trophy unlocked', msg: 'Ashen Frontier — "Master of Arms" (Gold)', time: '12 min ago', icon: 'trophy', read: false },
  { title: 'Friend request', msg: 'drift_king_404 sent you a friend request.', time: '1 h ago', icon: 'friends', read: false },
  { title: 'Download complete', msg: 'Velocity Circuit GT update 02.01 is ready.', time: '3 h ago', icon: 'download', read: false },
  { title: 'GoldHEN', msg: 'Plugins loaded: 3 (mock status).', time: 'Today', icon: 'flask', read: true },
  { title: 'Storage', msg: 'Internal storage is 74% full.', time: 'Yesterday', icon: 'folder', read: true },
  { title: 'Party invite', msg: 'NightCrow_88 invited you to a party.', time: 'Yesterday', icon: 'friends', read: true },
];

export const media = [
  { group: 'Music' },
  { title: 'Ember Overture.mp3', sub: 'Ashen Frontier OST · 3:42', icon: 'music' },
  { title: 'Harbor Lights.mp3', sub: 'Neon Harbor OST · 4:05', icon: 'music' },
  { title: 'Night Garden.mp3', sub: 'Moonlit Garden OST · 2:58', icon: 'music' },
  { group: 'Videos' },
  { title: 'GT Lap Record.mp4', sub: '1080p · 02:14 · 186 MB', icon: 'film' },
  { title: 'Hollow Crown Boss.mp4', sub: '1080p · 05:47 · 420 MB', icon: 'film' },
  { group: 'Screenshots' },
  { title: 'Kaldera_Sunrise.png', sub: '3840×2160 · 8.1 MB', icon: 'image' },
  { title: 'Tidebreaker_Storm.png', sub: '3840×2160 · 7.4 MB', icon: 'image' },
  { title: 'Frostfall_Aurora.png', sub: '3840×2160 · 6.9 MB', icon: 'image' },
];

const f = (name, size, modified = '2026-10-12') => ({ name, size, modified });
export const fileTree = {
  name: '', children: [
    { name: 'data', children: [
      { name: 'GoldHEN', children: [
        { name: 'plugins', children: [f('game_patch.prx', '84 KB'), f('fliprate_remover.prx', '22 KB'), f('no_share_watermark.prx', '18 KB')] },
        { name: 'patches', children: [{ name: 'xml', children: [f('CUSA31027.xml', '6 KB'), f('CUSA24510.xml', '4 KB')] }] },
        { name: 'cheats', children: [{ name: 'json', children: [f('CUSA17702_01.04.json', '3 KB')] }] },
        f('goldhen.ini', '1 KB'),
      ] },
      { name: 'vantaflow', children: [f('settings.ini', '2 KB', '2026-11-16'), f('vantaflow.log', '148 KB', '2026-11-16')] },
    ] },
    { name: 'mnt', children: [
      { name: 'usb0', children: [
        { name: 'music', children: [f('Ember Overture.mp3', '8.4 MB'), f('Harbor Lights.mp3', '9.1 MB')] },
        { name: 'backgrounds', children: [f('wallpaper_01.png', '2.2 MB'), f('wallpaper_02.jpg', '1.4 MB')] },
        f('readme.txt', '1 KB'),
      ] },
    ] },
    { name: 'user', children: [
      { name: 'app', children: games.slice(0, 6).map((g) => ({ name: g.id, children: [f('app.json', '1 KB')] })) },
      { name: 'home', children: [{ name: '1a2b3c4d', children: [f('profile.dat', '12 KB')] }] },
    ] },
    { name: 'system_data', children: [f('locked — protected system area', '')] },
  ],
};

// Resolve a folder by path segments; returns null for a bad path.
export function resolvePath(tree, parts) {
  let node = tree;
  for (const p of parts) {
    node = node.children?.find((c) => c.name === p && c.children);
    if (!node) return null;
  }
  return node;
}

export const powerOptions = [
  { id: 'rest', title: 'Enter Rest Mode', icon: 'moon', sub: 'Low-power standby', confirm: true },
  { id: 'restart', title: 'Restart Console', icon: 'restart', sub: 'Reboot the system', confirm: true },
  { id: 'off', title: 'Turn Off Console', icon: 'power', sub: 'Full shutdown', confirm: true },
  { id: 'reload', title: 'Reload VantaFlow', icon: 'restart', sub: 'Reloads this prototype (real)', live: true },
  { id: 'close', title: 'Close VantaFlow', icon: 'circle-x', sub: 'Return to the system home screen' },
];

export const goldhen = {
  status: 'Active', version: '2.4 (mock)', firmware: '9.00', since: 'Boot + 00:42:13',
  features: ['Homebrew Enabler', 'Debug Settings', 'Remote Package Install', 'Rest Mode Support', 'External HDD Support', 'Cheat & Patch Engine', 'Plugin Loader'],
  plugins: [
    { name: 'game_patch', desc: 'Applies XML game patches at launch.', enabled: true },
    { name: 'fliprate_remover', desc: 'Removes frame-rate caps where patched.', enabled: true },
    { name: 'no_share_watermark', desc: 'Hides share-screen watermark.', enabled: true },
    { name: 'afr', desc: 'Application file redirector.', enabled: false },
  ],
};

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
