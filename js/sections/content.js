// Panel sections that show demonstration content: Profile, PlayStation Store, Trophies,
// Friends, Notifications, Media, File Manager and Power Options.
// Anything that would need a console is labelled SIMULATED and only shows what would happen.
import { store, trophyNames, friends, notifications, media, buildFileTree, resolvePath, powerOptions, profile } from '../data/mock.js';
import { titles } from '../data/library.js';
import { platform, platformOf, activeDetection } from '../platform/index.js';
import { settings, set, SWATCHES, USERNAME, accountsSeparate, setAccountsSeparate } from '../core/settings.js';
import { load, save } from '../core/store.js';
import { coverArt } from '../ui/art.js';
import { mod } from '../ui/carousel.js';
import { esc, icon, tag, bar, kv, cta, toast, simulated, confirmDialog, textDialog, showSplash } from '../ui/ui.js';

const pct = (a, b) => Math.round((a / b) * 100);
const STATUS = { online: ['ok', 'Online'], away: ['away', 'Away'], offline: ['off', 'Offline'] };

// -------------------------------------------------------------- profile ---
const PRESENCE = { online: ['ok', 'Online'], away: ['away', 'Away'], offline: ['off', 'Appear offline'] };
const trophyTotals = () => titles('games').reduce((n, g) => n + g.trophies[0], 0);

export const profileSection = {
  id: 'profile', get label() { return settings.username; }, icon: 'user', view: 'panel', kind: 'live', slot: 'profile', // the avatar, not an icon
  items: () => [
    { id: 'name', title: 'Username', icon: 'user', value: settings.username },
    { id: 'avatar', title: 'Avatar color', icon: 'image', valueHTML: `<span class="chip" style="background:${settings.avatarColor}"></span>` },
    { id: 'presence', title: 'Online status', icon: 'friends', valueHTML: `<span class="dot ${PRESENCE[settings.presence][0]}"></span><span class="val">${PRESENCE[settings.presence][1]}</span>` },
    { id: 'separate', title: 'Separate PS4 and PS5 profiles', sub: accountsSeparate() ? `This profile belongs to the ${platform().name}` : 'Shared by both consoles', icon: 'console',
      valueHTML: `<span class="switch${accountsSeparate() ? ' on' : ''}"><i></i></span>` },
    { group: 'Activity' },
    { id: 'trophies', title: 'Trophies', sub: `${trophyTotals()} earned on this console`, icon: 'trophy', value: '›' },
    { id: 'friends', title: 'Friends', sub: `${friends.filter((f) => f.status === 'online').length} online of ${friends.length}`, icon: 'friends', value: '›' },
    { id: 'signout', title: 'Sign out', icon: 'power', valueHTML: '<span class="mini-sim">SIM</span>' },
  ],
  detail(it) {
    const d = activeDetection();
    const model = platformOf(d?.console.generation)?.models.find((m) => m.id === d.console.model);
    const notes = {
      name: '✕ edits the name shown in the top bar. 1–16 letters, numbers, spaces, _ . or -.',
      avatar: '←/→ or ✕ changes the avatar colour.',
      presence: '←/→ or ✕ changes the dot on your avatar.',
      separate: 'Off (default): name, avatar colour and online status are the same on PS4 and PS5. Turn it on if you use different PlayStation accounts; each console profile then keeps its own. Appearance, favourites, backgrounds and the active console are always kept per console.',
      trophies: '✕ opens Trophies.',
      friends: '✕ opens Friends.',
      signout: 'Simulated: there is no real account to sign out of.',
    };
    return `<div class="person"><div class="avatar xl">${esc(settings.username[0])}<i class="dot ${PRESENCE[settings.presence][0]}"></i></div>
      <div><h2>${esc(settings.username)}</h2><div class="status-line">Level ${profile.level} · ${esc(PRESENCE[settings.presence][1])}</div></div></div>
      ${kv([['Console', `${model?.name ?? 'Not identified'} (simulated)`], ['Firmware', `${d?.firmware.version ?? 'unknown'} (simulated)`], ['Profile', platform().name], ['Trophies', String(trophyTotals())], ['Account', accountsSeparate() ? `Separate — this is the ${platform().name} profile` : 'Shared by PS4 and PS5']])}
      <p class="note">${esc(notes[it.id])}</p>`;
  },
  adjust(it, dir) {
    if (it.id === 'avatar') { const i = SWATCHES.indexOf(settings.avatarColor); set({ avatarColor: SWATCHES[mod((i < 0 ? 0 : i) + dir, SWATCHES.length)] }); return true; }
    if (it.id === 'presence') { const o = Object.keys(PRESENCE); set({ presence: o[mod(o.indexOf(settings.presence) + dir, o.length)] }); return true; }
    if (it.id === 'separate') { setAccountsSeparate(!accountsSeparate()); return true; }
    return false;
  },
  async activate(it, panel) {
    if (it.id === 'name') {
      const name = await textDialog({ title: 'Change username', value: settings.username, hint: '1–16 letters, numbers, spaces, _ . or -' });
      if (name == null) return;
      if (!USERNAME.test(name)) { toast('Username not changed', 'Use 1–16 letters, numbers, spaces, _ . or -.', 'warn'); return; }
      set({ username: name });
      toast('Username saved', name, 'success');
    } else if (it.id === 'trophies' || it.id === 'friends') panel.app.goto(it.id);
    else if (it.id === 'signout') simulated('Signing out');
    else this.adjust(it, 1);
  },
};

// ------------------------------------------------------------- trophies ---
export const trophySection = {
  id: 'trophies', label: 'Trophies', icon: 'trophy', view: 'panel', kind: 'sim',
  items: () => titles('games').map((g) => ({ title: g.title, sub: `${g.trophies[0]} / ${g.trophies[1]} trophies`, g, p: pct(...g.trophies) }))
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
      <h3>Recently earned</h3><ul class="plain">${recent.map((n) => `<li>${icon('trophy')} ${esc(n)}</li>`).join('')}</ul>${cta('Full trophy list')}`;
  },
  activate: (it) => simulated(`Opening the trophy list for ${it.g.title}`),
};

// -------------------------------------------------------------- friends ---
export const friendsSection = {
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
// Read state is saved on this device, so the badge count survives a restart.
const read = new Set(load('notifications.read', []));
const isRead = (n) => n.read || read.has(n.id);
const markRead = (list) => { list.forEach((n) => read.add(n.id)); save('notifications.read', [...read]); };
export const unreadCount = () => notifications.filter((n) => !isRead(n)).length;

export const notificationsSection = {
  id: 'notifications', label: 'Notifications', icon: 'bell', view: 'panel', kind: 'sim',
  items: () => notifications.map((n) => ({ title: n.title, sub: n.msg, icon: n.icon, value: n.time, unread: !isRead(n), n })),
  detail: ({ n }) => `<h2>${esc(n.title)}</h2><p>${esc(n.msg)}</p>${kv([['Received', n.time], ['State', isRead(n) ? 'Read' : 'Unread']])}
    <p class="note">Demonstration notifications. Read state is saved on this device.</p>`,
  activate({ n }, panel) { markRead([n]); panel.app.refreshChrome(); },
  on: { square: (_, panel) => { markRead(notifications); panel.app.refreshChrome(); toast('All notifications read', '', 'success'); } },
  prompts: () => [['cross', 'Mark as read'], ['square', 'Mark all read'], ['circle', 'Back'], ['updown', 'Navigate']],
};

// ---------------------------------------------------------------- media ---
export const mediaSection = {
  id: 'media', label: 'Media', icon: 'media', view: 'panel', kind: 'sim',
  items: () => media.map((m) => ({ ...m })),
  detail: (m) => `<div class="media-hero">${icon(m.icon)}</div><h2>${esc(m.title)}</h2><p>${esc(m.sub)}</p>${cta(m.icon === 'image' ? 'View' : 'Play')}`,
  activate: (m) => simulated(`${m.icon === 'image' ? 'Opening' : 'Playing'} ${m.title}`),
};

// ---------------------------------------------------------------- store ---
export const storeSection = {
  id: 'store', label: 'PlayStation Store', short: 'Store', icon: 'store', view: 'panel', kind: 'sim',
  items: () => store.map((s) => ({ title: s.title, sub: `${s.tag} · ★ ${s.rating}`, value: s.price, s, lead: `<img class="thumb" src="${coverArt(s)}" alt="">` })),
  detail: ({ s }) => `<div class="store-detail"><img class="store-cover" src="${coverArt(s)}" alt=""><div><h2>${esc(s.title)}</h2><p>${esc(s.desc)}</p>
    ${kv([['Price', s.price], ['Size', s.size], ['Rating', s.rating], ['Category', s.tag]])}${cta(s.price === 'Included' ? 'Add to Library' : 'Purchase')}</div></div>`,
  activate: ({ s }) => simulated(`Store checkout for ${s.title} — no purchase or download happens`),
};

// --------------------------------------------------------- file manager ---
const path = [];
const tree = () => buildFileTree(platform().hen, titles('games'));
const fileItems = () => {
  let node = resolvePath(tree(), path);
  if (!node) { path.length = 0; node = tree(); } // folder gone after a console switch
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
export const filesSection = {
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
      <p class="note">Demonstration file system of the ${esc(platform().name)} profile. Files cannot be opened, moved or deleted.</p>`;
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
export const powerSection = {
  id: 'power', label: 'Power Options', short: 'Power', icon: 'power', view: 'panel', kind: 'sim',
  items: () => powerOptions.map((p) => ({ title: p.title, sub: p.sub, icon: p.icon, p, valueHTML: p.live ? tag('live') : '<span class="mini-sim">SIM</span>' })),
  detail: ({ p }) => `<div class="media-hero">${icon(p.icon)}</div><h2>${esc(p.title)}</h2><p>${esc(p.sub)}.</p>
    <p class="note">${p.live ? 'This option really reloads VantaFlow.' : 'Simulated: plays a short demo. The console is not contacted and its power state does not change.'}</p>`,
  async activate({ p }) {
    if (p.id === 'reload') { location.reload(); return; }
    if (p.confirm && !(await confirmDialog({ title: p.title, message: `${p.title}? This only plays a short simulation.`, confirm: 'Continue' }))) return;
    if (p.id === 'rest') await showSplash(`<div class="rest">${icon('moon')}<h2>Rest Mode</h2><p>${tag('sim')} Press any button to wake.</p></div>`, { wait: true });
    else if (p.id === 'restart') await showSplash(`<div class="launch"><div class="spinner"></div><h2>Restarting…</h2><p>${tag('sim')} Nothing is actually restarted.</p></div>`, { ms: 2400 });
    else if (p.id === 'off') await showSplash(`<div class="rest">${icon('power')}<h2>Console is off</h2><p>${tag('sim')} Press any button to turn it back on.</p></div>`, { wait: true });
    else simulated('Closing VantaFlow');
  },
};
