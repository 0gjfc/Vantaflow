// etaHEN (PS5 homebrew enabler) — demo panel content (plugins, tools, files).
// Live status, version and compatibility come from detection: see platform/index.js.
const f = (name, size) => ({ name, size, modified: '2026-11-02' });

export default {
  id: 'etahen',
  name: 'etaHEN',
  platform: 'ps5',
  logo: 'assets/etahen/etahen-logo.png',
  about: 'etaHEN is a PS5 homebrew enabler by LightningMods and contributors.',
  dir: 'etaHEN', // under /data
  features: ['Homebrew Enabler', 'Debug Settings', 'FTP Server', 'Cheats', 'Plugin Loader', 'Toolbox Menu'],
  plugins: [
    { name: 'ftp_server', file: 'ftp_server.elf', desc: 'File transfer over the local network.', enabled: true },
    { name: 'cheats', file: 'cheats.elf', desc: 'In-game cheat engine.', enabled: true },
    { name: 'klog_server', file: 'klog_server.elf', desc: 'Streams the kernel log for debugging.', enabled: false },
  ],
  tools: [
    { id: 'toolbox', title: 'etaHEN Toolbox', icon: 'apps', sub: 'Quick menu with homebrew tools' },
    { id: 'ftp', title: 'FTP Server', icon: 'network', sub: 'File transfer over the local network' },
    { id: 'debug', title: 'Debug Settings', icon: 'settings', sub: 'System debug menu' },
  ],
  // Folder shown in the File Manager at /data/etaHEN.
  files: [
    { name: 'cheats', children: [f('PPSA04218.json', '2 KB')] },
    { name: 'logs', children: [f('etaHEN.log', '64 KB')] },
    f('config.ini', '1 KB'),
  ],
};
