// Navigation: top bar, section order, routing between views, focus (nav bar vs content),
// controller prompts, and the action dispatcher that every input source feeds.
import { SECTIONS } from '../sections/index.js';
import { unreadCount } from '../sections/content.js';
import { FlowView, PanelView } from '../ui/views.js';
import { settings, onChange, activeProfile } from './settings.js';
import { flowConfig, bgSnapshot } from './appearance.js';
import { platform, platformOf, henLogo, activeDetection, activeConsoleId, compatibilityOf } from '../platform/index.js';
import { loadLibrary } from '../data/library.js';
import { profile } from '../data/mock.js';
import { esc, icon, btn, blip, toast, dialogHandle, splashHandle, wakeAudio } from '../ui/ui.js';
import { mod } from '../ui/carousel.js';

const $ = (sel) => document.querySelector(sel);
const byId = Object.fromEntries(SECTIONS.map((s) => [s.id, s]));
const PRESENCE_DOT = { online: 'ok', away: 'away', offline: 'off' };
const CLICKABLE = new Set(['cross', 'circle', 'square', 'triangle', 'options']);

// ←/→ in the nav bar and L1/R1 visit: profile, the 11 main sections, then the homebrew
// enabler of the active console only (GoldHEN on PS4, etaHEN on PS5).
const order = () => SECTIONS.filter((s) => !s.platform || s.platform === activeProfile()).map((s) => s.id);

let current = 'games';
let focus = 'content'; // 'content' | 'nav'
let flow;
let panel;
const view = () => (byId[current].view === 'flow' ? flow : panel);

const app = {
  flowConfig,
  bgSnapshot,
  updatePrompts,
  refreshChrome,
  goto,
  // Jump to a Settings row, e.g. from the storage widget or the console status.
  openSettingsAt(match) {
    goto('settings');
    setFocus('content');
    panel.selectWhere(match);
    panel.render();
  },
  async reloadLibrary() {
    await loadLibrary(activeProfile());
    if (byId[current].view === 'flow') flow.show(byId[current]);
    toast('Library reloaded', 'Demo titles — a later stage reads them from the console.', 'info');
  },
};

// Only touch the DOM when the markup really changed (keeps logos from reloading).
const shown = new Map();
function put(el, html) {
  if (shown.get(el) === html) return;
  shown.set(el, html);
  el.innerHTML = html;
}

const STATUS_DOT = { compatible: 'ok', partial: 'away', unsupported: 'bad', unknown: 'off', 'not-detected': 'off' };
const HEN_DOT = (e) => (e.state === 'active' && e.verified ? 'ok' : e.state === 'absent' ? 'off' : 'away');

function refreshChrome() {
  const p = platform();
  const d = activeDetection();
  const c = compatibilityOf(activeConsoleId());
  const model = platformOf(d?.console.generation)?.models.find((m) => m.id === d.console.model);
  put($('#profile'), `<span class="avatar">${esc(settings.username[0])}<i class="dot ${PRESENCE_DOT[settings.presence]}"></i></span>
    <span class="who">${esc(settings.username)}<small>Level ${profile.level}</small></span>`);
  const hb = $('#gh-badge');
  hb.dataset.id = p.hen.id;
  hb.title = `${p.hen.name} — simulated status`;
  hb.setAttribute('aria-label', p.hen.name);
  put(hb, `${henLogo(p.hen, 'gh-mini-img')}<span class="dot ${d ? HEN_DOT(d.environment) : 'off'}"></span>`);
  const fw = d?.connection.state === 'connected' ? `FW ${esc(d.firmware.version ?? '?')}` : 'Not connected';
  put($('#console-status'), `<span class="dot ${STATUS_DOT[c.status]}" title="${esc(c.label)}"></span>${esc(model?.short ?? 'Unknown console')} · ${fw} <span class="mock">MOCK</span>`);
  const unread = unreadCount();
  const badge = $('.nav-btn[data-id="notifications"] .badge');
  badge.textContent = unread || '';
  badge.hidden = !unread;
  document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.id === current));
}

function tickClock() {
  $('#clock').textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: !settings.clock24 });
}

function updatePrompts() {
  const list = focus === 'nav' ? [['leftright', 'Sections'], ['cross', 'Open'], ['circle', 'Back']] : view().prompts();
  $('#prompts').innerHTML = list.map(([a, label]) => (CLICKABLE.has(a)
    ? `<button class="prompt" data-action="${a}">${btn(a)}<span>${esc(label)}</span></button>`
    : `<span class="prompt">${btn(a)}<span>${esc(label)}</span></span>`)).join('');
}

function goto(id) {
  current = id;
  const s = byId[id];
  $('#view-flow').hidden = s.view !== 'flow';
  $('#view-panel').hidden = s.view !== 'panel';
  view().show(s);
  refreshChrome();
  updatePrompts();
}

function setFocus(f) {
  focus = f;
  document.body.classList.toggle('nav-focus', f === 'nav');
  updatePrompts();
}

// Every input (keyboard, gamepad, clicks on prompts, a future native bridge) ends up here.
export function dispatch(action) {
  wakeAudio();
  if (splashHandle() || dialogHandle(action)) return;
  if (action === 'l1' || action === 'r1') {
    const ids = order();
    goto(ids[mod(ids.indexOf(current) + (action === 'l1' ? -1 : 1), ids.length)]);
    blip();
    return;
  }
  if (action === 'options') {
    goto(current === 'settings' ? 'games' : 'settings');
    setFocus('content');
    blip('select');
    return;
  }
  if (focus === 'nav') {
    if (action === 'left' || action === 'right') dispatch(action === 'left' ? 'l1' : 'r1');
    else if (action === 'down' || action === 'cross' || action === 'circle') { setFocus('content'); blip(action === 'circle' ? 'back' : 'select'); }
    return;
  }
  if (view().handle(action)) return;
  if (action === 'up' || action === 'circle') { setFocus('nav'); blip('back'); }
}

// Structural reactions to settings changes (appearance.js handles the visual ones).
onChange(async (_, patch) => {
  if ('profile' in patch) { // PS4 ⇄ PS5: other library, other HEN section, other settings
    await loadLibrary(activeProfile());
    if (byId[current].platform && byId[current].platform !== activeProfile()) goto('games');
    else view().show(byId[current]);
  }
  if ('sortBy' in patch && byId[current].view === 'flow') flow.show(byId[current]);
  if ('wrap' in patch || 'coverSize' in patch) flow.cf.refresh();
  tickClock();
  refreshChrome();
  updatePrompts();
});

export function initNavigation() {
  flow = new FlowView($('#view-flow'), app);
  panel = new PanelView($('#view-panel'), app);
  $('#nav').innerHTML = SECTIONS.filter((s) => s.id !== 'profile' && !s.platform).map((s) => `<button class="nav-btn" data-id="${s.id}" title="${esc(s.label)}" aria-label="${esc(s.label)}">
    ${icon(s.icon)}<span class="lbl">${esc(s.short || s.label)}</span>${s.id === 'notifications' ? '<span class="badge"></span>' : ''}</button>`).join('');
  document.querySelectorAll('.nav-btn').forEach((b) => b.addEventListener('click', () => { goto(b.dataset.id); setFocus('content'); }));
  $('#console-status').addEventListener('click', () => { goto('consoles'); setFocus('content'); });
  $('#prompts').addEventListener('click', (e) => { const b = e.target.closest('[data-action]'); if (b) dispatch(b.dataset.action); });
  setInterval(tickClock, 5000);
  tickClock();
  goto('games');
}
