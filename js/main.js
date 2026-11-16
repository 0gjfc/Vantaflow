// VantaFlow boot: top bar, section routing, focus (nav bar vs content), theme, clock.
import { SECTIONS, GH_LOGO } from './sections.js';
import { FlowView, PanelView } from './views.js';
import { createBackground } from './background.js';
import { initInput } from './input.js';
import { settings, onChange, getBgImage } from './settings.js';
import { profile, consoleStatus, notifications } from './data.js';
import { esc, icon, btn, blip, dialogHandle, splashHandle } from './ui.js';
import { mod } from './carousel.js';

const $ = (sel) => document.querySelector(sel);
const byId = Object.fromEntries(SECTIONS.map((s) => [s.id, s]));
const order = SECTIONS.map((s) => s.id);
const SPEEDS = { slow: 0.32, normal: 0.1976, fast: 0.12 };
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const animate = () => settings.animations && !reducedMotion;

let current = 'games';
let focus = 'content'; // 'content' | 'nav'

const bg = createBackground($('#bg-shader'), $('#bg-image'));

const app = {
  flowConfig: () => ({
    wrap: settings.wrap,
    unitScale: settings.coverSize === 'large' ? 1.25 : 1,
    stepSeconds: animate() ? SPEEDS[settings.speed] : 0,
  }),
  updatePrompts,
  refreshChrome,
  // JPEG snapshot of the shader for the settings preview (drawn on demand).
  bgSnapshot: () => bg.snapshot(),
};

const flow = new FlowView($('#view-flow'), app);
const panel = new PanelView($('#view-panel'), app);
const view = () => (byId[current].view === 'flow' ? flow : panel);

// ---------------------------------------------------------------- top bar ---
$('.profile').innerHTML = `<div class="avatar">${esc(profile.name[0])}</div><div>${esc(profile.name)}<small>Level ${profile.level}</small></div>`;
$('#nav').innerHTML = SECTIONS.filter((s) => s.id !== 'goldhen').map((s) => `<button class="nav-btn" data-id="${s.id}" title="${esc(s.label)}" aria-label="${esc(s.label)}">
  ${icon(s.icon)}<span class="lbl">${esc(s.short || s.label)}</span>${s.id === 'notifications' ? '<span class="badge"></span>' : ''}</button>`).join('');
$('#console-status').innerHTML = `<span class="dot ok"></span>${esc(consoleStatus.model)} · FW ${esc(consoleStatus.firmware)} <span class="mock">MOCK</span>`;
$('#gh-badge').innerHTML = `<img class="gh-mini-img" src="${GH_LOGO}" alt="GoldHEN"><span class="dot ok"></span>`;
document.querySelectorAll('.nav-btn').forEach((b) => b.addEventListener('click', () => { goto(b.dataset.id); setFocus('content'); }));

function refreshChrome() {
  const unread = notifications.filter((n) => !n.read).length;
  const badge = $('.nav-btn[data-id="notifications"] .badge');
  badge.textContent = unread || '';
  badge.hidden = !unread;
  document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.id === current));
}

function tickClock() {
  $('#clock').textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: !settings.clock24 });
}
setInterval(tickClock, 5000);

function updatePrompts() {
  const list = focus === 'nav'
    ? [['leftright', 'Sections'], ['cross', 'Open'], ['circle', 'Back']]
    : view().prompts();
  $('#prompts').innerHTML = list.map(([a, label]) => `<span class="prompt">${btn(a)}<span>${esc(label)}</span></span>`).join('');
}

// ---------------------------------------------------------------- routing ---
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

function dispatch(action) {
  if (splashHandle() || dialogHandle(action)) return;
  if (action === 'l1' || action === 'r1') {
    goto(order[mod(order.indexOf(current) + (action === 'l1' ? -1 : 1), order.length)]);
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
    if (action === 'left' || action === 'right') { action === 'left' ? dispatch('l1') : dispatch('r1'); return; }
    if (action === 'down' || action === 'cross' || action === 'circle') { setFocus('content'); blip(action === 'circle' ? 'back' : 'select'); }
    return;
  }
  if (view().handle(action)) return;
  if (action === 'up' || action === 'circle') { setFocus('nav'); blip('back'); }
}

// ------------------------------------------------------------------ theme ---
function applyTheme(patch = {}) {
  const root = document.documentElement;
  root.style.setProperty('--accent', settings.accent);
  root.style.setProperty('--highlight', settings.highlight);
  const b = document.body.classList;
  b.toggle('no-anim', !settings.animations);
  b.toggle('no-reflect', !settings.reflections);
  b.toggle('labels-always', settings.navLabels === 'always');
  b.toggle('hide-prompts', !settings.showPrompts);
  b.toggle('hide-tid', !settings.showTitleIds);
  bg.update({ mode: settings.bgMode, image: getBgImage(), dim: settings.bgDim, animated: settings.bgAnimated && animate() });
  tickClock();
  if ('sortBy' in patch && byId[current].view === 'flow') flow.show(byId[current]);
  else if ('wrap' in patch || 'coverSize' in patch) flow.cf.refresh();
  updatePrompts();
}
onChange((_, patch) => applyTheme(patch));

// ---------------------------------------------------------------- scaling ---
// The UI is laid out on a fixed 1920×1080 "TV" stage and scaled to fit any window.
function fit() {
  const s = Math.min(innerWidth / 1920, innerHeight / 1080);
  $('#stage').style.transform = `translate(-50%, -50%) scale(${s})`;
}
addEventListener('resize', fit);

fit();
applyTheme();
initInput(dispatch);
goto('games');
