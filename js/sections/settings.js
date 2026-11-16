// Settings section: appearance, interface, storage, console and system rows.
// Every row except Storage changes the interface immediately and is saved locally.
import { settings, set, CHOICES, PRESETS, SWATCHES, DEFAULTS, presetOf, getBgImage, setBgImage, resetAll, activeProfile, switchProfile, PROFILES } from '../core/settings.js';
import { storageInfo, agentAvailable } from '../platform/index.js';
import { mod } from '../ui/carousel.js';
import { esc, tag, bar, kv, toast, blip, confirmSheet } from '../ui/ui.js';
import { snapshot } from '../core/store.js';
import { run } from '../core/setup-client.js';
import { forgetSetupState } from './setup.js';

const LABELS = {
  bgMode: { shader: 'Itemzflow (default)', plain: 'Plain dark', image: 'Custom image' },
  speed: { slow: 'Slow', normal: 'Itemzflow (default)', fast: 'Fast' },
  sortBy: { name: 'Name', titleId: 'Title ID', recent: 'Recently played' },
  navLabels: { active: 'Active section only', always: 'Always' },
  coverSize: { itemzflow: 'Itemzflow (default)', large: 'Large' },
};

// Storage category colours (chart only).
const CAT_COLORS = { Games: 'var(--accent)', Applications: '#22b07d', 'Captures & media': '#d4a017', 'Saved data': '#8b5cf6', System: '#9aa4b2', Backups: '#e8508f', Music: '#00b4d8' };

const PROFILE_LABEL = { ps4: 'PS4 · GoldHEN', ps5: 'PS5 · etaHEN' };

let pending = null; // custom background shown in the preview, not yet applied

const ROWS = () => [
  { group: 'Appearance' },
  { key: 'bgMode', type: 'choice', title: 'Background', preview: true, options: CHOICES.bgMode.filter((m) => m !== 'image' || getBgImage()),
    desc: 'Itemzflow (default) is a dark animated field of controller-symbol outlines, like Itemzflow’s built-in background. Plain dark uses Itemzflow’s #1F1F1F clear colour.' },
  { id: 'pick', type: 'action', title: 'Choose custom image…', preview: true, desc: 'Pick a PNG, JPG or WebP. It is shown in the preview first; nothing changes until you apply it.', run: pickImage },
  ...(pending ? [
    { id: 'apply', type: 'action', title: 'Apply previewed image', preview: 'pending', desc: 'Use the previewed picture as the background.', run: applyPending },
    { id: 'discard', type: 'action', title: 'Discard preview', preview: 'pending', desc: 'Throw the previewed picture away.', run: () => { pending = null; } },
  ] : []),
  { key: 'bgDim', type: 'range', title: 'Background dim', unit: '%', step: 10, preview: true, desc: 'Darkens the background so covers and text stand out.' },
  { id: 'resetBg', type: 'action', title: 'Restore default background', preview: true, desc: 'Back to the Itemzflow-style background with no dim. Deletes the stored custom image.', run: resetBackground },
  { id: 'preset', type: 'preset', title: 'Color preset', desc: 'Sets accent and selection colours together. Itemzflow Blue is Itemzflow’s own selection colour, rgb(29, 134, 240).' },
  { key: 'accent', type: 'color', title: 'Accent color', desc: 'Icons, underline, progress bars. ←/→ cycles swatches, ✕ opens a full colour picker.' },
  { key: 'highlight', type: 'color', title: 'Selection highlight', desc: 'The bar behind the selected row and the outline of the selected cover.' },
  { id: 'resetColors', type: 'action', title: 'Restore default colors', desc: 'Back to Itemzflow Blue.', run: () => { set({ accent: DEFAULTS.accent, highlight: DEFAULTS.highlight }); toast('Colors restored', 'Itemzflow Blue', 'success'); } },
  { id: 'resetLook', type: 'action', title: 'Restore default appearance', preview: true, desc: 'Default background, no dim and Itemzflow Blue colours in one step.', run: resetAppearance },
  { group: 'Interface · Animation' },
  { key: 'animations', type: 'toggle', title: 'Interface animations', desc: 'Turns off every transition, including the coverflow slide and backflip.' },
  { key: 'speed', type: 'choice', title: 'Animation speed', desc: 'Speed of the coverflow and all transitions. Itemzflow moves one cover in 0.1976 s.' },
  { key: 'reflections', type: 'toggle', title: 'Cover reflections', desc: 'Mirrored covers on the floor, like Itemzflow’s Reflections option.' },
  { key: 'bgAnimated', type: 'toggle', title: 'Animated background', desc: 'Freeze the background shader to save power on slower TVs.' },
  { group: 'Interface · Sound' },
  { key: 'uiSounds', type: 'toggle', title: 'Interface sounds', desc: 'Short tones when moving and selecting.' },
  { key: 'volume', type: 'range', title: 'Volume', unit: '%', step: 10, desc: 'Volume of interface sounds and background music.' },
  { key: 'music', type: 'toggle', title: 'Background music', desc: 'A soft generated ambient loop. Itemzflow can loop an MP3 from USB; reading music files arrives with console integration.' },
  { group: 'Interface · Navigation' },
  { key: 'wrap', type: 'toggle', title: 'Carousel wrap-around', desc: 'Moving past the last cover returns to the first, as in Itemzflow.' },
  { key: 'swapConfirm', type: 'toggle', title: 'Confirm with ○', desc: 'Swap ✕ and ○ on a controller (Japanese layout). Keyboard keys do not change.' },
  { key: 'sortBy', type: 'choice', title: 'Sort titles by', desc: 'Order of covers in Games, Applications and Homebrew.' },
  { key: 'showPrompts', type: 'toggle', title: 'Show button prompts', desc: 'The controller hints in the bottom-right corner.' },
  { group: 'Interface · Display' },
  { key: 'clock24', type: 'toggle', title: '24-hour clock', desc: 'Clock format in the top bar.' },
  { key: 'showTitleIds', type: 'toggle', title: 'Show Title IDs', desc: 'Show CUSA / PPSA IDs under the selected title.' },
  { key: 'navLabels', type: 'choice', title: 'Navigation labels', desc: 'Show names under all top-bar icons, or only under the open section.' },
  { key: 'coverSize', type: 'choice', title: 'Cover size', desc: 'Itemzflow size is about 260 px wide at 1080p. Large is 25% bigger.' },
  { group: 'Storage (simulated)' },
  ...(storageInfo().length
    ? storageInfo().map((d) => ({ id: 'storage', type: 'info', noAction: true, dev: d, title: d.name, sub: `${d.used.toFixed(1)} GB used of ${d.total} GB`,
      valueHTML: `${bar((d.used / d.total) * 100)}<span class="val">${d.free.toFixed(1)} GB free</span>` }))
    : [{ id: 'storage', type: 'info', noAction: true, dev: null, title: 'No storage information', sub: 'The active console is not connected' }]),
  { group: 'Console' },
  { id: 'profile', type: 'profile', title: 'Console profile', sim: true, desc: 'PS4 and PS5 are separate profiles: each keeps its own appearance and interface settings, favourites, background image and selected console. Your name, avatar colour and online status are shared unless you turn on separate profiles on the Profile page.' },
  { id: 'consoles', type: 'action', title: 'Manage consoles…', desc: 'Connection, firmware, homebrew status and compatibility of each console, and which one is active.', run: (panel) => panel.app.goto('consoles') },
  { group: 'System' },
  { id: 'setup', type: 'action', title: 'Install, backups & recovery…', desc: 'Install or update VantaFlow, back up and restore your settings, recover from an interrupted installation, and clean up temporary files.', run: (panel) => { forgetSetupState(); panel.app.goto('setup'); } },
  { id: 'resetAll', type: 'action', title: 'Reset all settings', desc: 'Restores every option, colour, background and profile setting to the defaults. With the desktop agent running, your settings are backed up first.', run: resetEverything },
];

function display(r) {
  const v = settings[r.key];
  const sim = r.sim ? '<span class="mini-sim">SIM</span>' : '';
  switch (r.type) {
    case 'toggle': return { valueHTML: `${sim}<span class="switch${v ? ' on' : ''}"><i></i></span>`, text: v ? 'On' : 'Off' };
    case 'choice': return { valueHTML: `${sim}<span class="val">${esc(LABELS[r.key][v])}</span>`, text: LABELS[r.key][v] };
    case 'range': return { valueHTML: `${bar(v)}<span class="val">${v}${r.unit}</span>`, text: `${v}${r.unit}` };
    case 'color': return { valueHTML: `<span class="chip" style="background:${v}"></span><span class="val">${v.toUpperCase()}</span>`, text: v.toUpperCase() };
    case 'preset': { const p = PRESETS[presetOf(settings)]?.label ?? 'Custom'; return { value: p, text: p }; }
    case 'info': return {};
    case 'profile': { const t = PROFILE_LABEL[activeProfile()]; return { valueHTML: `${sim}<span class="val">${t}</span>`, text: t }; }
    default: return { value: '›' };
  }
}

function adjustSetting(r, dir) {
  const v = settings[r.key];
  switch (r.type) {
    case 'toggle': set({ [r.key]: !v }); return true;
    case 'choice': { const o = r.options ?? CHOICES[r.key]; set({ [r.key]: o[mod(o.indexOf(v) + dir, o.length)] }); return true; }
    case 'range': set({ [r.key]: Math.max(0, Math.min(100, v + dir * r.step)) }); if (r.key === 'volume') blip(); return true;
    case 'color': { const i = SWATCHES.indexOf(v.toLowerCase()); set({ [r.key]: SWATCHES[mod((i < 0 && dir > 0 ? -1 : i) + dir, SWATCHES.length)] }); return true; }
    case 'preset': {
      const keys = Object.keys(PRESETS);
      const i = keys.indexOf(presetOf(settings));
      const k = keys[mod((i < 0 && dir > 0 ? -1 : i) + dir, keys.length)];
      set({ accent: PRESETS[k].accent, highlight: PRESETS[k].highlight });
      return true;
    }
    case 'profile': switchProfile(PROFILES[mod(PROFILES.indexOf(activeProfile()) + dir, PROFILES.length)]); return true;
    default: return false;
  }
}

// Hidden native inputs (file / colour) reused between calls.
export function nativeInput(type) {
  let el = document.getElementById(`native-${type}`);
  if (!el) {
    el = Object.assign(document.createElement('input'), { type, id: `native-${type}`, className: 'native-input', tabIndex: -1 });
    if (type === 'file') el.accept = 'image/png,image/jpeg,image/webp';
    document.body.append(el);
  }
  return el;
}

function pickImage(panel) {
  const input = nativeInput('file');
  input.value = '';
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    try {
      pending = await downscale(file);
      panel.render();
      panel.selectWhere((x) => x.id === 'apply');
      panel.render();
      toast('Preview ready', 'Check it on the right, then apply or discard.', 'info');
    } catch {
      toast('Could not read image', file.name, 'warn');
    }
  };
  input.click();
}

// Fit within the 1920×1080 stage (cover-fit) and re-encode so it fits in local storage.
async function downscale(file) {
  const bmp = await createImageBitmap(file);
  const s = Math.min(1, Math.max(1920 / bmp.width, 1080 / bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * s);
  c.height = Math.round(bmp.height * s);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.85);
}

function applyPending() {
  if (!setBgImage(pending)) { toast('Image too large', 'Browser storage is full. Try a smaller picture.', 'warn'); return; }
  pending = null;
  set({ bgMode: 'image' });
  toast('Background applied', 'Saved on this device.', 'success');
}

function resetBackground() {
  setBgImage(null);
  pending = null;
  set({ bgMode: 'shader', bgDim: 0 });
  toast('Background restored', 'Itemzflow-style default.', 'success');
}

function resetAppearance() {
  setBgImage(null);
  pending = null;
  set({ bgMode: DEFAULTS.bgMode, bgDim: DEFAULTS.bgDim, accent: DEFAULTS.accent, highlight: DEFAULTS.highlight });
  toast('Appearance restored', 'Default background and Itemzflow Blue.', 'success');
}

async function resetEverything() {
  const agent = agentAvailable();
  if (!await confirmSheet({
    title: 'Reset all settings', destructive: true, confirm: 'Reset',
    rows: [
      ['What happens', 'Every option, colour, background and profile setting goes back to the default.'],
      ['Affected', 'All VantaFlow settings in this browser: both console profiles, your account, backgrounds, favourites.'],
      ['Your data', 'Settings are replaced by the defaults. Saved consoles and installed files are not touched.'],
      ['Backup', agent ? 'Yes: your current settings are backed up first.' : 'No: the desktop agent is not running, so no backup can be made.'],
      ['Can be undone', agent ? 'Yes: restore the backup in Install, backups & recovery.' : 'No.'],
    ],
  })) return;
  if (agent) {
    const r = await run('backup', { settings: snapshot(), description: 'Before resetting all settings', reason: 'before-reset' });
    if (r.state !== 'done') { toast('Not reset', `The backup failed, so nothing was changed: ${r.error?.message ?? ''}`, 'warn'); return; }
  }
  pending = null;
  resetAll();
  toast('Settings reset', agent ? 'All defaults restored. Your previous settings are in a backup.' : 'All defaults restored.', 'success');
}

function preview(r, panel) {
  let bg = '#1f1f1f';
  let label = 'Plain dark · #1F1F1F';
  const img = r.preview === 'pending' ? pending : settings.bgMode === 'image' && getBgImage();
  if (img) { bg = `url('${img}') center/cover`; label = r.preview === 'pending' ? 'Preview — not applied yet' : 'Custom image'; }
  else if (settings.bgMode === 'shader') { const snap = panel.app.bgSnapshot(); bg = snap ? `url('${snap}') center/cover` : '#050505'; label = 'Itemzflow-style animated background'; }
  return `<div class="preview" style="background:${bg}"><div class="pv-dim" style="opacity:${settings.bgDim / 100}"></div>
    <div class="pv-covers"><i></i><i></i><i class="c"></i><i></i><i></i></div><span class="pv-label">${esc(label)}</span></div>`;
}

function storageDetail(d) {
  if (!d) return `<h2>No storage information ${tag('sim')}</h2><p>The active console is not connected, so its drives cannot be read. Pick a connected console in Consoles.</p>`;
  const seg = (name, size) => `<i style="width:${(size / d.total) * 100}%;background:${CAT_COLORS[name] || '#888'}" title="${esc(name)}"></i>`;
  return `<h2>${esc(d.name)} ${tag('sim')}</h2>
    <div class="stack">${d.cats.map((c) => seg(c.name, c.size)).join('')}</div>
    <ul class="legend">${d.cats.map((c) => `<li><i style="background:${CAT_COLORS[c.name] || '#888'}"></i>${esc(c.name)}<b>${c.size.toFixed(1)} GB</b></li>`).join('')}
      <li><i class="free"></i>Free space<b>${d.free.toFixed(1)} GB</b></li></ul>
    ${kv([['Capacity', `${d.total} GB`], ['Used', `${d.used.toFixed(1)} GB (${Math.round((d.used / d.total) * 100)}%)`], ['Free', `${d.free.toFixed(1)} GB`]])}
    <p class="note">Demonstration figures. Game sizes are the installed demo titles; real drive data arrives with console integration.</p>`;
}

export const settingsSection = {
  id: 'settings', label: 'Settings', icon: 'settings', view: 'panel', kind: 'live',
  items: () => ROWS().map((r) => (r.group ? r : { ...r, ...display(r) })),
  adjust: (r, dir) => adjustSetting(r, dir),
  activate(r, panel) {
    if (r.type === 'action') return r.run(panel);
    if (r.type === 'color') {
      const input = nativeInput('color');
      input.value = settings[r.key];
      input.oninput = () => { set({ [r.key]: input.value }); panel.render(); };
      input.click();
      return undefined;
    }
    if (r.type === 'range') set({ [r.key]: settings[r.key] >= 100 ? 0 : settings[r.key] + r.step }); // ✕ steps up and wraps
    else adjustSetting(r, 1);
    return undefined;
  },
  detail(r, panel) {
    if (r.type === 'info') return storageDetail(r.dev);
    let html = `<h2>${esc(r.title)} ${r.sim ? tag('sim') : ''}</h2><p>${esc(r.desc)}</p>`;
    if (r.text) html += `<div class="current">Current: <b>${esc(r.text)}</b></div>`;
    if (r.preview) html += preview(r, panel);
    if (r.type === 'color' || r.type === 'preset') {
      const cur = r.type === 'color' ? settings[r.key] : '';
      html += `<div class="swatches">${(r.type === 'color' ? SWATCHES.map((c) => `<i class="${c === cur ? 'on' : ''}" style="background:${c}"></i>`) : Object.values(PRESETS).map((p) => `<i class="${p.accent === settings.accent && p.highlight === settings.highlight ? 'on' : ''}" title="${esc(p.label)}" style="background:linear-gradient(135deg, ${p.accent} 50%, ${p.highlight} 50%)"></i>`)).join('')}</div>
        <div class="sample"><div class="row sel"><div class="txt"><b>Selected row</b></div></div><div class="row"><div class="txt"><b>Other row</b></div>${bar(64)}</div></div>`;
    }
    return html;
  },
  prompts: (r) => {
    if (!r) return null;
    if (r.type === 'info') return [['circle', 'Back'], ['updown', 'Navigate']];
    if (r.type === 'action') return [['cross', 'Select'], ['circle', 'Back'], ['updown', 'Navigate']];
    if (r.type === 'color') return [['leftright', 'Swatch'], ['cross', 'Color picker'], ['circle', 'Back']];
    return [['leftright', 'Change'], ['cross', 'Next'], ['circle', 'Back'], ['updown', 'Navigate']];
  },
};
