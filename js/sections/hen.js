// Homebrew-enabler sections: GoldHEN for PS4, etaHEN for PS5. They share a layout but keep
// separate ids and separate data (platform/ps4/goldhen.js, platform/ps5/etahen.js), and each
// one appears only while its console profile is active. Status comes from the active console's
// detection result and the compatibility engine; plugins and tools are demo content.
import goldhen from '../platform/ps4/goldhen.js';
import etahen from '../platform/ps5/etahen.js';
import { henLogo, activeDetection, activeConsoleId, compatibilityOf, platformOf, isRealConsole } from '../platform/index.js';
import { henStatus, HEN_STATUS } from '../models/index.js';
import { statusChip } from './consoles.js';
import { esc, tag, kv, cta, toast, simulated } from '../ui/ui.js';

// What the active console reports about this environment, in words (one of HEN_STATUS).
function liveStatus(h) {
  const d = activeDetection();
  const status = henStatus(d);
  const e = d?.environment;
  if (status === HEN_STATUS.INSTALLED && e.kind && e.kind !== h.id) return { text: 'Other environment reported', dot: 'away', version: '—' };
  const dot = { [HEN_STATUS.INSTALLED]: 'ok', [HEN_STATUS.UNKNOWN]: 'away' }[status] ?? 'off';
  return { text: status, dot, version: status === HEN_STATUS.INSTALLED || status === HEN_STATUS.UNKNOWN ? e.version ?? 'not reported' : '—' };
}

function henSection(h) {
  const consoleLine = () => {
    const d = activeDetection();
    const model = platformOf(d?.console.generation)?.models.find((m) => m.id === d.console.model);
    const name = isRealConsole(activeConsoleId()) ? `${d?.console.name ?? 'Your console'} (model not available)` : model?.short ?? 'Unknown console';
    return `${name} · FW ${d?.firmware.version ?? '?'}`;
  };
  const hero = () => {
    const st = liveStatus(h);
    return `<div class="gh-hero">${henLogo(h, 'gh-logo-img')}<div>
    <div class="status-pill"><span class="dot ${st.dot}"></span>${esc(st.text)} ${tag(isRealConsole(activeConsoleId()) ? 'real' : 'sim')}</div>
    <div class="gh-ver">${esc(h.name)} ${esc(st.version)} · ${esc(consoleLine())}</div>
    <div class="gh-compat">${statusChip(compatibilityOf(activeConsoleId()).status)}</div></div></div>`;
  };
  return {
    id: h.id, label: h.name, icon: 'flask', view: 'panel', kind: 'sim', platform: h.platform,
    items: () => [
      { id: 'status', title: 'Status', sub: isRealConsole(activeConsoleId()) ? 'From your console (read-only)' : 'From the active console (demonstration data)', icon: 'check', valueHTML: `<span class="dot ${liveStatus(h).dot}"></span><span class="val">${esc(liveStatus(h).text)}</span>` },
      { group: 'Plugins' },
      ...h.plugins.map((p) => ({ title: p.name, sub: p.desc, icon: 'plugin', plugin: p, valueHTML: `<span class="switch${p.enabled ? ' on' : ''}"><i></i></span>` })),
      { group: 'Tools' },
      ...h.tools.map((t) => ({ ...t, tool: true })),
      { group: 'About' },
      { id: 'about', title: `About ${h.name}`, icon: 'info', noAction: true },
    ],
    detail(it) {
      if (it.id === 'status') {
        const c = compatibilityOf(activeConsoleId());
        const real = isRealConsole(activeConsoleId());
        return `${hero()}${kv([['Status', `${liveStatus(h).text}${real ? '' : ' (demonstration data)'}`], ['Version', liveStatus(h).version], ['Console', consoleLine()], ['Compatibility', c.label], ['Plugins loaded (demo)', String(h.plugins.filter((p) => p.enabled).length)]])}
          <ul class="reasons">${c.reasons.map((r) => `<li><span class="rdot c-${r.status}"></span>${esc(r.message)}</li>`).join('')}</ul>
          <p class="note">${real ? `${esc(h.name)} status is never guessed: an open port or a connected console is not proof that ${esc(h.name)} runs.` : 'Nothing is sent to a console and no payloads are run.'} ✕ re-reads this status; Consoles shows the full compatibility report.</p>`;
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
      if (it.id === 'status') toast('Status', `${h.name}: ${liveStatus(h).text}${isRealConsole(activeConsoleId()) ? '' : ' — demonstration data'}.`, isRealConsole(activeConsoleId()) ? 'info' : 'sim');
      else if (it.plugin) { it.plugin.enabled = !it.plugin.enabled; toast('Simulated', `${it.plugin.name} ${it.plugin.enabled ? 'enabled' : 'disabled'} (demo only).`, 'sim'); }
      else if (it.tool) simulated(`Opening ${h.name} ${it.title}`);
    },
  };
}

export const goldhenSection = henSection(goldhen);
export const etahenSection = henSection(etahen);
