// GoldHEN (PS4 homebrew enabler) — demonstration status only. Nothing here talks to a console.
const f = (name, size) => ({ name, size, modified: '2026-10-12' });

export default {
  id: 'goldhen',
  name: 'GoldHEN',
  platform: 'ps4',
  logo: 'assets/goldhen/goldhen-logo.png',
  status: 'Active',
  version: '2.4 (mock)',
  since: 'Boot + 00:42:13',
  about: 'GoldHEN is a PS4 homebrew enabler by SiSTRo.',
  dir: 'GoldHEN', // under /data
  features: ['Homebrew Enabler', 'Debug Settings', 'Remote Package Install', 'Rest Mode Support', 'External HDD Support', 'Cheat & Patch Engine', 'Plugin Loader'],
  plugins: [
    { name: 'game_patch', file: 'game_patch.prx', desc: 'Applies XML game patches at launch.', enabled: true },
    { name: 'fliprate_remover', file: 'fliprate_remover.prx', desc: 'Removes frame-rate caps where patched.', enabled: true },
    { name: 'no_share_watermark', file: 'no_share_watermark.prx', desc: 'Hides share-screen watermark.', enabled: true },
    { name: 'afr', file: 'afr.prx', desc: 'Application file redirector.', enabled: false },
  ],
  tools: [
    { id: 'cheats', title: 'Cheat Menu', icon: 'flask', sub: 'In-game cheat overlay' },
    { id: 'patches', title: 'Game Patches', icon: 'file', sub: 'XML patches in /data/GoldHEN/patches' },
    { id: 'debug', title: 'Debug Settings', icon: 'settings', sub: 'System debug menu' },
  ],
  // Folder shown in the File Manager at /data/GoldHEN.
  files: [
    { name: 'patches', children: [{ name: 'xml', children: [f('CUSA31027.xml', '6 KB'), f('CUSA24510.xml', '4 KB')] }] },
    { name: 'cheats', children: [{ name: 'json', children: [f('CUSA17702_01.04.json', '3 KB')] }] },
    f('goldhen.ini', '1 KB'),
  ],
};
