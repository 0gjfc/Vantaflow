// Section definitions for the top navigation. Flow sections feed the coverflow;
// panel sections describe their list rows, detail pane and actions.
import { games, apps, homebrew, store, trophyNames, friends, notifications, media, fileTree, resolvePath, powerOptions, goldhen, sortItems } from './data.js';
import { settings, set, CHOICES, PRESETS, SWATCHES, presetOf, getBgImage, setBgImage, resetAll, favorites } from './settings.js';
import { coverArt } from './art.js';
import { mod } from './carousel.js';
import { esc, icon, btn, tag, toast, simulated, confirmDialog, showSplash, blip } from './ui.js';

export const GH_LOGO = 'assets/goldhen/goldhen-logo.png';

const withFav = (it) => ({ ...it, fav: favorites.has(it.id) });
const pct = (a, b) => Math.round((a / b) * 100);
const bar = (p) => `<span class="progress"><i style="width:${p}%"></i></span>`;
const kv = (pairs) => `<dl class="kv">${pairs.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;
const cta = (label) => `<div class="cta">${btn('cross')}<span>${esc(label)}</span><span class="mini-sim">SIM</span></div>`;

// ------------------------------------------------------------- settings ---
const LABELS = {
  bgMode: { shader: 'Itemzflow (default)', plain: 'Plain dark', image: 'Custom image' },
  speed: { slow: 'Slow', normal: 'Itemzflow (default)', fast: 'Fast' },
  sortBy: { name: 'Name', titleId: 'Title ID', recent: 'Recently played' },
  navLabels: { active: 'Active section only', always: 'Always' },
  coverSize: { itemzflow: 'Itemzflow (default)', large: 'Large' },
};

let pending = null; // custom background shown in the preview, not yet applied

const ROWS = () => [
  { group: 'Background' },
  { key: 'bgMode', type: 'choice', title: 'Background', preview: true, options: CHOICES.bgMode.filter((m) => m !== 'image' || getBgImage()),
    desc: 'Itemzflow (default) is a dark animated field of controller-symbol outlines, like Itemzflow’s built-in background. Plain dark uses Itemzflow’s #1F1F1F clear colour.' },
  { id: 'pick', type: 'action', title: 'Choose custom image…', preview: true, desc: 'Pick a PNG or JPG. It is shown in the preview first; nothing changes until you apply it.', run: pickImage },
  ...(pending ? [
    { id: 'apply', type: 'action', title: 'Apply previewed image', preview: 'pending', desc: 'Use the previewed picture as the background.', run: applyPending },
    { id: 'discard', type: 'action', title: 'Discard preview', preview: 'pending', desc: 'Throw the previewed picture away.', run: () => { pending = null; } },
  ] : []),
  { key: 'bgDim', type: 'range', title: 'Background dim', unit: '%', step: 10, preview: true, desc: 'Darkens the background so covers and text stand out.' },
  { id: 'resetBg', type: 'action', title: 'Restore default background', preview: true, desc: 'Back to the Itemzflow-style background with no dim. Deletes the stored custom image.', run: resetBackground },
  { group: 'Colors' },
  { id: 'preset', type: 'preset', title: 'Color preset', desc: 'Sets accent and selection colours together. Itemzflow Blue is Itemzflow’s own selection colour, rgb(29, 134, 240).' },
  { key: 'accent', type: 'color', title: 'Accent color', desc: 'Icons, underline, progress bars. ←/→ cycles swatches, ✕ opens a full colour picker.' },
  { key: 'highlight', type: 'color', title: 'Selection highlight', desc: 'The bar behind the selected row and the outline of the selected cover.' },
  { id: 'resetColors', type: 'action', title: 'Restore default colors', desc: 'Back to Itemzflow Blue.', run: () => { set({ accent: PRESETS.itemzflow.accent, highlight: PRESETS.itemzflow.highlight }); toast('Colors restored', 'Itemzflow Blue', 'success'); } },
  { group: 'Animation' },
  { key: 'animations', type: 'toggle', title: 'Interface animations', desc: 'Turns off every transition, including the coverflow slide and backflip.' },
  { key: 'speed', type: 'choice', title: 'Carousel speed', desc: 'Itemzflow moves one cover in 0.1976 s. Slow and Fast change that.' },
  { key: 'reflections', type: 'toggle', title: 'Cover reflections', desc: 'Mirrored covers on the floor, like Itemzflow’s Reflections option.' },
  { key: 'bgAnimated', type: 'toggle', title: 'Animated background', desc: 'Freeze the background shader to save power on slower TVs.' },
  { group: 'Sound' },
  { key: 'uiSounds', type: 'toggle', title: 'Interface sounds', desc: 'Short tones when moving and selecting.' },
  { key: 'volume', type: 'range', title: 'Volume', unit: '%', step: 10, desc: 'Volume of interface sounds.' },
  { key: 'music', type: 'toggle', title: 'Background music', sim: true, desc: 'Itemzflow can loop an MP3 from USB. Stored only; no music plays in Stage 1.' },
  { group: 'Navigation' },
  { key: 'wrap', type: 'toggle', title: 'Carousel wrap-around', desc: 'Moving past the last cover returns to the first, as in Itemzflow.' },
  { key: 'swapConfirm', type: 'toggle', title: 'Confirm with ○', desc: 'Swap ✕ and ○ on a controller (Japanese layout). Keyboard keys do not change.' },
  { key: 'sortBy', type: 'choice', title: 'Sort titles by', desc: 'Order of covers in Games, Applications and Homebrew.' },
  { key: 'showPrompts', type: 'toggle', title: 'Show button prompts', desc: 'The controller hints in the bottom-right corner.' },
  { group: 'Display' },
  { key: 'clock24', type: 'toggle', title: '24-hour clock', desc: 'Clock format in the top bar.' },
  { key: 'showTitleIds', type: 'toggle', title: 'Show Title IDs', desc: 'Show CUSA IDs under the selected title.' },
  { key: 'navLabels', type: 'choice', title: 'Navigation labels', desc: 'Show names under all top-bar icons, or only under the open section.' },
  { key: 'coverSize', type: 'choice', title: 'Cover size', desc: 'Itemzflow size is about 260 px wide at 1080p. Large is 25% bigger.' },
  { group: 'System' },
  { id: 'resetAll', type: 'action', title: 'Reset all settings', desc: 'Restores every option, colour and background to the defaults.', run: resetEverything },
];

function display(r) {
  const v = settings[r.key];
  const sim = r.sim ? '<span class="mini-sim">SIM</span>' : '';
  switch (r.type) {
    case 'toggle': return { valueHTML: `${sim}<span class="switch${v ? ' on' : ''}"><i></i></span>`, text: v ? 'On' : 'Off' };
    case 'choice': return { value: LABELS[r.key][v], text: LABELS[r.key][v] };
    case 'range': return { valueHTML: `${bar(v)}<span class="val">${v}${r.unit}</span>`, text: `${v}${r.unit}` };
    case 'color': return { valueHTML: `<span class="chip" style="background:${v}"></span><span class="val">${v.toUpperCase()}</span>`, text: v.toUpperCase() };
    case 'preset': { const p = PRESETS[presetOf(settings)]?.label ?? 'Custom'; return { value: p, text: p }; }
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
    default: return false;
  }
}

// Hidden native inputs (file / colour) reused between calls.
function nativeInput(type) {
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

// Fit within the 1920×1080 stage (cover-fit) and re-encode so it fits in localStorage.
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
  toast('Background applied', 'Saved in this browser.', 'success');
}

function resetBackground() {
  setBgImage(null);
  pending = null;
  set({ bgMode: 'shader', bgDim: 0 });
  toast('Background restored', 'Itemzflow-style default.', 'success');
}

async function resetEverything() {
  if (await confirmDialog({ title: 'Reset all settings', message: 'Restore every option, colour and background to the defaults?', confirm: 'Reset', sim: false })) {
    pending = null;
    resetAll();
    toast('Settings reset', 'All defaults restored.', 'success');
  }
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

const settingsSection = {
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
    if (r.type !== 'range') adjustSetting(r, 1);
    return undefined;
  },
  detail(r, panel) {
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
    if (r.type === 'action') return [['cross', 'Select'], ['circle', 'Back'], ['updown', 'Navigate']];
    if (r.type === 'color') return [['leftright', 'Swatch'], ['cross', 'Color picker'], ['circle', 'Back']];
    return [['leftright', 'Change'], ['cross', r.type === 'range' ? '—' : 'Next'], ['circle', 'Back'], ['updown', 'Navigate']].filter(([, l]) => l !== '—');
  },
};

// ------------------------------------------------------------- trophies ---
const trophySection = {
  id: 'trophies', label: 'Trophies', icon: 'trophy', view: 'panel', kind: 'sim',
  items: () => games.map((g) => ({ title: g.title, sub: `${g.trophies[0]} / ${g.trophies[1]} trophies`, g, p: pct(...g.trophies) }))
    .sort((a, b) => b.p - a.p)
    .map((it) => ({ ...it, valueHTML: `${bar(it.p)}<span class="val">${it.p}%</span>` })),
  detail({ g, p }) {
    const [e, t] = g.trophies;
    const plat = e === t ? 1 : 0;
    const gold = Math.round(e * 0.1);
    const silver = Math.round(e * 0.25);
    const recent = [0, 3, 5].map((o) => trophyNames[(parseInt(g.id.slice(-2), 10) + o) % trophyNames.length]);
    return `<h2>${esc(g.title)}</h2><div class="big">${p}%</div>${bar(p)}
      <div class="trophy-counts"><span class="tp">● ${plat} Platinum</span><span class="tg">● ${gold} Gold</span><span class="ts">● ${silver} Silver</span><span class="tb">● ${e - plat - gold - silver} Bronze</span></div>
      <h3>Recently earned</h3><ul class="plain">${recent.map((n) => `<li>${icon('trophy')} ${esc(n)}</li>`).join('')}</ul>`;
  },
  activate: (it) => simulated(`Opening trophy list for ${it.g.title}`),
};

// -------------------------------------------------------------- friends ---
const STATUS = { online: ['ok', 'Online'], away: ['away', 'Away'], offline: ['off', 'Offline'] };
const friendsSection = {
  id: 'friends', label: 'Friends', icon: 'friends', view: 'panel', kind: 'sim',
  items: () => ['online', 'away', 'offline'].flatMap((st) => {
    const list = friends.filter((f) => f.status === st);
    return list.length ? [{ group: `${STATUS[st][1]} (${list.length})` }, ...list.map((f) => ({ title: f.name, sub: f.activity, f, lead: `<span class="dot ${STATUS[st][0]}"></span>`, value: `Lv ${f.level}` }))] : [];
  }),
  detail: ({ f }) => `<div class="person"><div class="avatar xl">${esc(f.name[0].toUpperCase())}</div><div><h2>${esc(f.name)}</h2>
    <div class="status-line"><span class="dot ${STATUS[f.status][0]}"></span>${esc(STATUS[f.status][1])} · ${esc(f.activity)}</div></div></div>
    ${kv([['Level', f.level], ['Status', STATUS[f.status][1]]])}${cta('Send message')}`,
  activate: ({ f }) => simulated(`Messaging ${f.name}`),
};

// -------------------------------------------------------- notifications ---
const notificationsSection = {
  id: 'notifications', label: 'Notifications', icon: 'bell', view: 'panel', kind: 'sim',
  items: () => notifications.map((n) => ({ title: n.title, sub: n.msg, icon: n.icon, value: n.time, unread: !n.read, n })),
  detail: ({ n }) => `<h2>${esc(n.title)}</h2><p>${esc(n.msg)}</p>${kv([['Received', n.time], ['State', n.read ? 'Read' : 'Unread']])}`,
  activate({ n }, panel) { n.read = true; panel.app.refreshChrome(); },
  prompts: () => [['cross', 'Mark as read'], ['circle', 'Back'], ['updown', 'Navigate']],
};

// ---------------------------------------------------------------- media ---
const mediaSection = {
  id: 'media', label: 'Media', icon: 'media', view: 'panel', kind: 'sim',
  items: () => media.map((m) => ({ ...m })),
  detail: (m) => `<div class="media-hero">${icon(m.icon)}</div><h2>${esc(m.title)}</h2><p>${esc(m.sub)}</p>${cta(m.icon === 'image' ? 'View' : 'Play')}`,
  activate: (m) => simulated(`${m.icon === 'image' ? 'Opening' : 'Playing'} ${m.title}`),
};

// ---------------------------------------------------------------- store ---
const storeSection = {
  id: 'store', label: 'PlayStation Store', short: 'Store', icon: 'store', view: 'panel', kind: 'sim',
  items: () => store.map((s) => ({ title: s.title, sub: `${s.tag} · ★ ${s.rating}`, value: s.price, s, lead: `<img class="thumb" src="${coverArt(s)}" alt="">` })),
  detail: ({ s }) => `<div class="store-detail"><img class="store-cover" src="${coverArt(s)}" alt=""><div><h2>${esc(s.title)}</h2><p>${esc(s.desc)}</p>
    ${kv([['Price', s.price], ['Size', s.size], ['Rating', s.rating], ['Category', s.tag]])}${cta(s.price === 'Included' ? 'Add to Library' : 'Purchase')}</div></div>`,
  activate: ({ s }) => simulated(`Store checkout for ${s.title}`),
};

// --------------------------------------------------------- file manager ---
const path = [];
const fileItems = () => {
  const node = resolvePath(fileTree, path) ?? fileTree;
  const list = [...node.children].sort((a, b) => Number(!!b.children) - Number(!!a.children) || a.name.localeCompare(b.name));
  return [
    ...(path.length ? [{ title: '..', sub: 'Up one level', icon: 'up', up: true }] : []),
    ...list.map((c) => (c.children
      ? { title: c.name, icon: 'folder', value: `${c.children.length} items`, node: c }
      : { title: c.name, icon: 'file', sub: c.size ? `${c.size} · ${c.modified}` : 'Read-only', node: c })),
  ];
};
function goUp(panel) {
  const prev = path.pop();
  panel.index = fileItems().findIndex((x) => x.title === prev);
}
const filesSection = {
  id: 'files', label: 'File Manager', short: 'Files', icon: 'folder', view: 'panel', kind: 'sim',
  crumb: () => `/${path.join('/')}`,
  items: fileItems,
  detail(it) {
    if (it.up) return `<h2>..</h2><p>Go up to /${esc(path.slice(0, -1).join('/'))}</p>`;
    const full = `/${[...path, it.node.name].join('/')}`;
    if (it.node.children) {
      return `<div class="media-hero">${icon('folder')}</div><h2>${esc(it.node.name)}</h2>${kv([['Path', full], ['Contains', `${it.node.children.length} items`]])}
        <ul class="plain">${it.node.children.slice(0, 6).map((c) => `<li>${icon(c.children ? 'folder' : 'file')} ${esc(c.name)}</li>`).join('')}</ul>`;
    }
    return `<div class="media-hero">${icon('file')}</div><h2>${esc(it.node.name)}</h2>${kv([['Path', full], ['Size', it.node.size || '—'], ['Modified', it.node.modified]])}
      <p class="note">Mock file system. Files cannot be opened, moved or deleted in Stage 1.</p>`;
  },
  activate(it, panel) {
    if (it.up) goUp(panel);
    else if (it.node.children) { path.push(it.node.name); panel.index = 1; } // row 0 is ".."
    else simulated(`Opening ${it.node.name}`);
  },
  back(panel) {
    if (!path.length) return false;
    goUp(panel);
    return true;
  },
  prompts: (it) => [['cross', it?.node?.children || it?.up ? 'Open' : 'Select'], ['circle', path.length ? 'Up' : 'Back'], ['updown', 'Navigate']],
};

// ---------------------------------------------------------------- power ---
const powerSection = {
  id: 'power', label: 'Power Options', short: 'Power', icon: 'power', view: 'panel', kind: 'sim',
  items: () => powerOptions.map((p) => ({ title: p.title, sub: p.sub, icon: p.icon, p, valueHTML: p.live ? tag('live') : '' })),
  detail: ({ p }) => `<div class="media-hero">${icon(p.icon)}</div><h2>${esc(p.title)}</h2><p>${esc(p.sub)}.</p>
    <p class="note">${p.live ? 'This option really reloads the prototype.' : 'Simulated: plays a short demo. The console is not contacted.'}</p>`,
  async activate({ p }) {
    if (p.id === 'reload') { location.reload(); return; }
    if (p.confirm && !(await confirmDialog({ title: p.title, message: `${p.title}? In Stage 1 this only plays a short simulation.`, confirm: 'Continue' }))) return;
    if (p.id === 'rest') await showSplash(`<div class="rest">${icon('moon')}<h2>Rest Mode</h2><p>${tag('sim')} Press any button to wake.</p></div>`, { wait: true });
    else if (p.id === 'restart') await showSplash(`<div class="launch"><div class="spinner"></div><h2>Restarting…</h2><p>${tag('sim')} Nothing is actually restarted.</p></div>`, { ms: 2400 });
    else if (p.id === 'off') await showSplash(`<div class="rest">${icon('power')}<h2>Console is off</h2><p>${tag('sim')} Press any button to turn it back on.</p></div>`, { wait: true });
    else simulated('Closing VantaFlow');
  },
};

// -------------------------------------------------------------- GoldHEN ---
const ghLogo = () => `<div class="gh-logo"><img class="gh-logo-img" src="${GH_LOGO}" alt="GoldHEN logo">
  <div class="gh-logo-ph">GoldHEN<small>Official logo not bundled — add ${GH_LOGO}</small></div></div>`;
const goldhenSection = {
  id: 'goldhen', label: 'GoldHEN', icon: 'flask', view: 'panel', kind: 'sim',
  items: () => [
    { id: 'status', title: 'Status', icon: 'check', valueHTML: `<span class="dot ok"></span><span class="val">${esc(goldhen.status)}</span>` },
    { group: 'Plugins' },
    ...goldhen.plugins.map((p) => ({ title: p.name, sub: p.desc, icon: 'plugin', plugin: p, valueHTML: `<span class="switch${p.enabled ? ' on' : ''}"><i></i></span>` })),
    { group: 'Tools' },
    { id: 'cheats', title: 'Cheat Menu', icon: 'flask', sub: 'In-game cheat overlay' },
    { id: 'patches', title: 'Game Patches', icon: 'file', sub: 'XML patches in /data/GoldHEN/patches' },
    { id: 'debug', title: 'Debug Settings', icon: 'settings', sub: 'System debug menu' },
    { group: 'About' },
    { id: 'about', title: 'About GoldHEN', icon: 'info' },
  ],
  detail(it) {
    const hero = `<div class="gh-hero">${ghLogo()}<div><div class="status-pill"><span class="dot ok"></span>${esc(goldhen.status)} ${tag('sim')}</div><div class="gh-ver">Version ${esc(goldhen.version)}</div></div></div>`;
    if (it.id === 'status') {
      return `${hero}${kv([['Status', `${goldhen.status} (mock)`], ['Version', goldhen.version], ['Firmware', goldhen.firmware], ['Uptime', goldhen.since], ['Plugins loaded', String(goldhen.plugins.filter((p) => p.enabled).length)]])}
        <div class="chips">${goldhen.features.map((f) => `<span>${esc(f)}</span>`).join('')}</div>
        <p class="note">Stage 1 is visual only: nothing is sent to a console and no payloads are run.</p>`;
    }
    if (it.plugin) return `${hero}<h2>${esc(it.plugin.name)}</h2><p>${esc(it.plugin.desc)}</p>${kv([['State', it.plugin.enabled ? 'Enabled' : 'Disabled'], ['File', `/data/GoldHEN/plugins/${it.plugin.name}.prx`]])}<p class="note">←/→ or ✕ toggles the mock state.</p>`;
    if (it.id === 'about') {
      return `${hero}<h2>About GoldHEN</h2><p>GoldHEN is a PS4 homebrew enabler by SiSTRo. VantaFlow shows a mock status panel only; real GoldHEN integration is researched separately in a later stage.</p>
        <p class="note">Logo: VantaFlow does not draw its own version of the GoldHEN logo. Put the official image at <code>${GH_LOGO}</code> and it appears here and in the top bar.</p>`;
    }
    return `${hero}<h2>${esc(it.title)}</h2><p>${esc(it.sub)}.</p>${cta('Open')}`;
  },
  adjust(it, dir) {
    if (!it.plugin) return false;
    it.plugin.enabled = !it.plugin.enabled;
    return true;
  },
  activate(it) {
    if (it.plugin) { it.plugin.enabled = !it.plugin.enabled; toast('Simulated', `${it.plugin.name} ${it.plugin.enabled ? 'enabled' : 'disabled'} (mock only).`, 'sim'); }
    else if (it.id !== 'status' && it.id !== 'about') simulated(`Opening GoldHEN ${it.title}`);
  },
};

// ------------------------------------------------------------- sections ---
const flow = (id, label, short, iconName, shape, noun, source) => ({
  id, label, short, icon: iconName, view: 'flow', shape, noun, items: () => sortItems(source, settings.sortBy).map(withFav),
});

export const SECTIONS = [
  flow('games', 'Games', 'Games', 'games', 'case', 'installed', games),
  flow('apps', 'Applications', 'Apps', 'apps', 'square', 'apps', apps),
  storeSection,
  settingsSection,
  trophySection,
  friendsSection,
  notificationsSection,
  mediaSection,
  filesSection,
  flow('homebrew', 'Homebrew Applications', 'Homebrew', 'flask', 'square', 'homebrew apps', homebrew),
  powerSection,
  goldhenSection,
];
