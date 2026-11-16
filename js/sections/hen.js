// Homebrew-enabler sections: GoldHEN for PS4, etaHEN for PS5. They share a layout but keep
// separate ids and separate data (platform/ps4/goldhen.js, platform/ps5/etahen.js), and each
// one appears only while its console is selected. Everything shown is simulated.
import goldhen from '../platform/ps4/goldhen.js';
import ps4 from '../platform/ps4/console.js';
import etahen from '../platform/ps5/etahen.js';
import ps5 from '../platform/ps5/console.js';
import { henLogo } from '../platform/index.js';
import { esc, tag, kv, cta, toast, simulated } from '../ui/ui.js';

function henSection(h, con) {
  const hero = () => `<div class="gh-hero">${henLogo(h, 'gh-logo-img')}<div>
    <div class="status-pill"><span class="dot ok"></span>${esc(h.status)} ${tag('sim')}</div>
    <div class="gh-ver">${esc(h.name)} ${esc(h.version)} · ${esc(con.model)} · FW ${esc(con.firmware)}</div></div></div>`;
  return {
    id: h.id, label: h.name, icon: 'flask', view: 'panel', kind: 'sim', platform: h.platform,
    items: () => [
      { id: 'status', title: 'Status', sub: 'Demonstration status — no console connected', icon: 'check', valueHTML: `<span class="dot ok"></span><span class="val">${esc(h.status)}</span>` },
      { group: 'Plugins' },
      ...h.plugins.map((p) => ({ title: p.name, sub: p.desc, icon: 'plugin', plugin: p, valueHTML: `<span class="switch${p.enabled ? ' on' : ''}"><i></i></span>` })),
      { group: 'Tools' },
      ...h.tools.map((t) => ({ ...t, tool: true })),
      { group: 'About' },
      { id: 'about', title: `About ${h.name}`, icon: 'info', noAction: true },
    ],
    detail(it) {
      if (it.id === 'status') {
        return `${hero()}${kv([['Status', `${h.status} (simulated)`], ['Version', h.version], ['Console', con.model], ['Firmware', `${con.firmware} (simulated)`], ['Uptime', h.since], ['Plugins loaded', String(h.plugins.filter((p) => p.enabled).length)]])}
          <div class="chips">${h.features.map((f) => `<span>${esc(f)}</span>`).join('')}</div>
          <p class="note">Nothing is sent to a console and no payloads are run. ✕ refreshes this demo status.</p>`;
      }
      if (it.plugin) {
        return `${hero()}<h2>${esc(it.plugin.name)}</h2><p>${esc(it.plugin.desc)}</p>
          ${kv([['State', it.plugin.enabled ? 'Enabled (simulated)' : 'Disabled (simulated)'], ['File', `/data/${h.dir}/plugins/${it.plugin.file}`]])}<p class="note">←/→ or ✕ toggles the demo state.</p>`;
      }
      if (it.id === 'about') {
        return `${hero()}<h2>About ${esc(h.name)}</h2><p>${esc(h.about)} VantaFlow shows a demonstration status panel only; real integration is researched separately in a later stage.</p>
          <p class="note">${h.platform === 'ps4' ? 'PS4' : 'PS5'} only. Switch consoles in Settings → Console.</p>`;
      }
      return `${hero()}<h2>${esc(it.title)}</h2><p>${esc(it.sub)}.</p>${cta('Open')}`;
    },
    adjust(it) {
      if (!it.plugin) return false;
      it.plugin.enabled = !it.plugin.enabled;
      return true;
    },
    activate(it) {
      if (it.id === 'status') toast('Status refreshed', `${h.name}: ${h.status} — demonstration data.`, 'sim');
      else if (it.plugin) { it.plugin.enabled = !it.plugin.enabled; toast('Simulated', `${it.plugin.name} ${it.plugin.enabled ? 'enabled' : 'disabled'} (demo only).`, 'sim'); }
      else if (it.tool) simulated(`Opening ${h.name} ${it.title}`);
    },
  };
}

export const goldhenSection = henSection(goldhen, ps4);
export const etahenSection = henSection(etahen, ps5);
