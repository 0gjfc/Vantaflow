// Shared UI components: escaping, icons, controller glyphs, tags, small widgets, toasts,
// sounds and music, dialogs, splash screens.
import { settings } from '../core/settings.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// 24×24 stroke icons (drawn for this project).
export const ICONS = {
  games: '<path d="M6.5 8.5h11a4 4 0 0 1 3.9 4.9l-.8 3.5a2.1 2.1 0 0 1-3.7.9L15.2 16H8.8l-1.7 1.8a2.1 2.1 0 0 1-3.7-.9l-.8-3.5a4 4 0 0 1 3.9-4.9z"/><path d="M7.8 11.2v3M6.3 12.7h3"/><circle cx="15.8" cy="12" r=".5"/><circle cx="17.6" cy="13.8" r=".5"/>',
  apps: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>',
  store: '<path d="M5 8h14l-1.2 11.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8z"/><path d="M9 10V6.5a3 3 0 0 1 6 0V10"/>',
  settings: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="6.6"/><path d="M12 2.5v2.9M12 18.6v2.9M2.5 12h2.9M18.6 12h2.9M5.3 5.3l2 2M16.7 16.7l2 2M5.3 18.7l2-2M16.7 7.3l2-2"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20.5h7M10 17h4"/>',
  friends: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><circle cx="17" cy="9.5" r="2.5"/><path d="M15.6 14.1A4.5 4.5 0 0 1 21 18.5"/>',
  bell: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  media: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M10 9.2v5.6l4.6-2.8z"/>',
  folder: '<path d="M3 7.5A1.5 1.5 0 0 1 4.5 6H9l2 2h8.5A1.5 1.5 0 0 1 21 9.5v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z"/>',
  flask: '<path d="M9.5 3.5h5M10.5 3.5v5.2L5.3 17.6A2 2 0 0 0 7 20.5h10a2 2 0 0 0 1.7-2.9l-5.2-8.9V3.5"/><path d="M7.6 14h8.8"/>',
  power: '<path d="M12 3.5v8"/><path d="M7.2 6.6a7 7 0 1 0 9.6 0"/>',
  file: '<path d="M7 3.5h6.5L18 8v12.5H7z"/><path d="M13.5 3.5V8H18"/>',
  music: '<path d="M9 17.5V6l10-2v11"/><circle cx="7" cy="17.5" r="2"/><circle cx="17" cy="15" r="2"/>',
  image: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M4 17l5-4.5 3.5 3 3-2.5 4.5 4"/>',
  film: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="M7.5 5v14M16.5 5v14M3.5 9.5h4M3.5 14.5h4M16.5 9.5h4M16.5 14.5h4"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 3.5 5.4 3.5 8.5s-1 5.9-3.5 8.5c-2.5-2.6-3.5-5.4-3.5-8.5s1-5.9 3.5-8.5z"/>',
  tv: '<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 20.5h8M12 17v3.5"/>',
  remote: '<rect x="6" y="3" width="12" height="18" rx="2"/><path d="M10.5 17.5h3"/><circle cx="12" cy="9" r="2.5"/>',
  save: '<path d="M5 4h11l3 3v13H5z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/>',
  network: '<rect x="9" y="3.5" width="6" height="5" rx="1"/><rect x="3" y="15.5" width="6" height="5" rx="1"/><rect x="15" y="15.5" width="6" height="5" rx="1"/><path d="M12 8.5v3.5M6 15.5V12h12v3.5"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.6v.01"/>',
  check: '<circle cx="12" cy="12" r="8.5"/><path d="M8 12.3l2.7 2.7L16 9.6"/>',
  warn: '<path d="M12 4l9 15.5H3z"/><path d="M12 10v4.5M12 17v.01"/>',
  heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
  download: '<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14"/>',
  moon: '<path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z"/>',
  restart: '<path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4.5V9h-4.5"/>',
  'circle-x': '<circle cx="12" cy="12" r="8.5"/><path d="M9 9l6 6M15 9l-6 6"/>',
  user: '<circle cx="12" cy="8.5" r="3.6"/><path d="M5 20a7 7 0 0 1 14 0"/>',
  plugin: '<path d="M9 3.5v3M15 3.5v3M7 6.5h10v4a5 5 0 0 1-10 0z"/><path d="M12 15.5v5"/>',
  sim: '<circle cx="12" cy="12" r="8.5"/><path d="M8 12h8M12 8v8"/>',
  search: '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/>',
  plus: '<circle cx="12" cy="12" r="8.5"/><path d="M12 8v8M8 12h8"/>',
  console: '<rect x="3" y="7.5" width="18" height="9" rx="2"/><path d="M6.5 12h4M17 11v2M7 16.5v2M17 16.5v2"/>',
  up: '<path d="M7 14l5-5 5 5"/>',
};

export const icon = (name, cls = '') => `<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ICONS.file}</svg>`;

const GLYPHS = {
  cross: '<path d="M8.2 8.2l7.6 7.6M15.8 8.2l-7.6 7.6"/>',
  circle: '<circle cx="12" cy="12" r="4.4"/>',
  square: '<rect x="7.8" y="7.8" width="8.4" height="8.4"/>',
  triangle: '<path d="M12 7.2l4.8 8.3H7.2z"/>',
};
const PILLS = { options: 'OPTIONS', l1: 'L1', r1: 'R1', l1r1: 'L1 · R1', updown: '↑↓', leftright: '←→' };

// Controller button. With "Confirm with ○" enabled the cross/circle glyphs swap.
export function btn(action) {
  let name = action;
  if (settings.swapConfirm && (action === 'cross' || action === 'circle')) name = action === 'cross' ? 'circle' : 'cross';
  if (GLYPHS[name]) return `<span class="btn-glyph g-${name}"><svg viewBox="0 0 24 24">${GLYPHS[name]}</svg></span>`;
  return `<span class="btn-pill">${PILLS[name] || esc(name)}</span>`;
}

export const tag = (kind) => ({
  live: '<span class="tag live" title="Works for real in this prototype">LIVE</span>',
  real: '<span class="tag live" title="Your own console, checked read-only on the local network">READ-ONLY</span>',
}[kind] ?? '<span class="tag sim" title="Mock data / simulated action">SIMULATED</span>');

// Small widgets used by several sections.
export const bar = (p) => `<span class="progress"><i style="width:${p}%"></i></span>`;
export const kv = (pairs) => `<dl class="kv">${pairs.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;
// Call-to-action inside a detail pane. Clicking it does the same as pressing ✕ on the row.
export const cta = (label, sim = true) => `<button class="cta">${btn('cross')}<span>${esc(label)}</span>${sim ? '<span class="mini-sim">SIM</span>' : ''}</button>`;

// ---------------------------------------------------------------- toasts ---
const TOAST_ICON = { info: 'info', sim: 'sim', success: 'check', warn: 'warn' };
export function toast(title, msg = '', kind = 'info') {
  const host = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `toast t-${kind}`;
  el.innerHTML = `${icon(TOAST_ICON[kind] || 'info')}<div><b>${esc(title)}</b>${msg ? `<span>${esc(msg)}</span>` : ''}</div>`;
  host.prepend(el);
  while (host.children.length > 3) host.lastChild.remove();
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, 3200);
}
export const simulated = (what) => toast('Simulated', `${what} — no console is connected in Stage 1.`, 'sim');

// ---------------------------------------------------------------- sounds ---
let audio;
// Browsers only start audio after user input; call this from the input handler.
export const wakeAudio = () => { if (audio?.state === 'suspended') audio.resume(); };

export function blip(kind = 'move') {
  if (!settings.uiSounds || !settings.volume) return;
  try {
    audio ??= new AudioContext();
    const o = audio.createOscillator();
    const g = audio.createGain();
    const t = audio.currentTime;
    o.type = 'sine';
    o.frequency.value = { move: 620, select: 880, back: 420, error: 200 }[kind] ?? 620;
    g.gain.setValueAtTime((settings.volume / 100) * 0.06, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    o.connect(g).connect(audio.destination);
    o.start(t);
    o.stop(t + 0.1);
  } catch { /* audio unavailable */ }
}

// Background music: a soft generated ambient chord (no audio files needed).
let music = null;
export function setMusic(on, volume) {
  try {
    if (!on || !volume) { music?.stop(); music = null; return; }
    audio ??= new AudioContext();
    if (!music) {
      const out = audio.createGain();
      out.gain.value = 0;
      out.connect(audio.destination);
      const voices = [110, 164.81, 220, 277.18].map((hz, i) => {
        const o = audio.createOscillator();
        const g = audio.createGain();
        o.frequency.value = hz;
        o.detune.value = (i - 1.5) * 5;
        g.gain.value = 0.25;
        o.connect(g).connect(out);
        o.start();
        return o;
      });
      const lfo = audio.createOscillator(); // slow swell
      const depth = audio.createGain();
      lfo.frequency.value = 0.07;
      depth.gain.value = 0.4;
      lfo.connect(depth).connect(voices[3].frequency);
      lfo.start();
      music = { out, stop: () => { [...voices, lfo].forEach((o) => o.stop()); out.disconnect(); } };
    }
    music.out.gain.setTargetAtTime((volume / 100) * 0.05, audio.currentTime, 0.6);
  } catch { /* audio unavailable */ }
}

// --------------------------------------------------------------- dialogs ---
let dialog = null;

export function confirmDialog({ title, message, confirm = 'Confirm', cancel = 'Cancel', sim = true }) {
  return new Promise((resolve) => {
    const el = document.getElementById('dialog');
    dialog = { sel: 1, resolve, el };
    const render = () => {
      el.innerHTML = `<div class="dialog-box"><h2>${esc(title)} ${sim ? tag('sim') : ''}</h2><p>${esc(message)}</p>
        <div class="dialog-btns"><button data-i="0" class="${dialog.sel === 0 ? 'sel' : ''}">${esc(cancel)}</button><button data-i="1" class="${dialog.sel === 1 ? 'sel' : ''}">${esc(confirm)}</button></div></div>`;
    };
    dialog.render = render;
    el.onclick = (e) => { const b = e.target.closest('button'); if (b) close(b.dataset.i === '1'); };
    render();
    el.hidden = false;
  });
}

// Text entry (e.g. username). Resolves to the new text, or null when cancelled.
// On a console the system keyboard would open here; in the browser it is a text field.
export function textDialog({ title, value = '', maxLength = 16, hint = '' }) {
  return new Promise((resolve) => {
    const el = document.getElementById('dialog');
    el.innerHTML = `<div class="dialog-box"><h2>${esc(title)}</h2>${hint ? `<p>${esc(hint)}</p>` : ''}
      <input class="dialog-input" maxlength="${maxLength}" value="${esc(value)}" spellcheck="false">
      <div class="dialog-btns"><button data-i="0">Cancel</button><button data-i="1" class="sel">Save</button></div></div>`;
    const input = el.querySelector('input');
    dialog = {
      el, sel: 1,
      resolve: (ok) => resolve(ok ? input.value.trim() : null),
      render: () => el.querySelectorAll('.dialog-btns button').forEach((b) => b.classList.toggle('sel', Number(b.dataset.i) === dialog.sel)),
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); close(true); }
      if (e.key === 'Escape') { e.preventDefault(); close(false); }
    });
    el.onclick = (e) => { const b = e.target.closest('button'); if (b) close(b.dataset.i === '1'); };
    el.hidden = false;
    input.focus();
    input.select();
  });
}

// Pick one option from a list (console actions, discovered consoles). Resolves to the option's
// id, or null when cancelled. ↑/↓ moves, ✕ picks, ○ cancels; options can also be clicked.
export function choiceDialog({ title, message = '', options }) {
  return new Promise((resolve) => {
    const el = document.getElementById('dialog');
    const state = { el, sel: 0, list: options.length, resolve: (ok) => resolve(ok ? options[state.sel]?.id ?? null : null) };
    state.render = () => {
      el.innerHTML = `<div class="dialog-box"><h2>${esc(title)}</h2>${message ? `<p>${esc(message)}</p>` : ''}
        <div class="choice-list">${options.map((o, i) => `<button data-i="${i}" class="choice${i === state.sel ? ' sel' : ''}">${esc(o.label)}${o.hint ? `<small>${esc(o.hint)}</small>` : ''}</button>`).join('')}</div>
        <div class="dialog-btns"><button data-cancel>Cancel</button></div></div>`;
    };
    dialog = state;
    el.onclick = (e) => {
      if (e.target.closest('[data-cancel]')) { close(false); return; }
      const b = e.target.closest('[data-i]');
      if (b) { state.sel = Number(b.dataset.i); close(true); }
    };
    state.render();
    el.hidden = false;
  });
}

// Confirmation screen for installs, replacements, removals and recovery: what happens, what is
// affected, whether data could change, whether a backup is made, whether it can be undone.
// Destructive actions start on Cancel and need ✕ twice on the confirm button ("armed").
// rows: [[label, text | string[]]]. Resolves to true only on explicit confirmation.
export function confirmSheet({ title, summary = '', rows = [], warnings = [], confirm = 'Confirm', destructive = false, tagKind = null }) {
  return new Promise((resolve) => {
    const el = document.getElementById('dialog');
    const list = (v) => (Array.isArray(v)
      ? `<ul class="plain small">${v.slice(0, 5).map((x) => `<li>${esc(x)}</li>`).join('')}${v.length > 5 ? `<li class="more">and ${v.length - 5} more</li>` : ''}${v.length ? '' : '<li>none</li>'}</ul>`
      : esc(v));
    const state = { el, sel: destructive ? 0 : 1, armed: false, resolve };
    state.render = () => {
      const label = state.armed ? `Press ✕ again to ${confirm.toLowerCase()}` : confirm;
      el.innerHTML = `<div class="dialog-box sheet${destructive ? ' destructive' : ''}"><h2>${esc(title)}${tagKind ? ` ${tag(tagKind)}` : ''}</h2>
        <div class="sheet-body">${summary ? `<p>${esc(summary)}</p>` : ''}
        ${warnings.length ? `<ul class="sheet-warn">${warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}
        <dl class="sheet-kv">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${list(v)}</dd>`).join('')}</dl></div>
        <div class="dialog-btns"><button data-i="0" class="${state.sel === 0 ? 'sel' : ''}">Cancel</button><button data-i="1" class="${state.sel === 1 ? 'sel' : ''}${destructive ? ' danger' : ''}${state.armed ? ' armed' : ''}">${esc(label)}</button></div></div>`;
    };
    state.onCross = () => {
      if (state.sel === 0) { close(false); return; }
      if (destructive && !state.armed) { state.armed = true; state.render(); blip(); return; }
      close(true);
    };
    state.onMove = () => { state.armed = false; };
    dialog = state;
    el.onclick = (e) => {
      const b = e.target.closest('[data-i]');
      if (!b) return;
      if (state.sel !== Number(b.dataset.i)) { state.sel = Number(b.dataset.i); state.armed = false; }
      state.onCross();
    };
    state.render();
    el.hidden = false;
  });
}

// Progress of a running operation. Input is ignored while it runs (nothing can be started or
// cancelled halfway); close() hides it.
export function progressDialog(title) {
  const el = document.getElementById('dialog');
  dialog = { el, locked: true, resolve: () => {} };
  el.onclick = null;
  const render = (p = {}) => {
    const pct = p.fraction != null ? Math.round(p.fraction * 100) : p.of ? Math.round((p.step / p.of) * 100) : 0;
    el.innerHTML = `<div class="dialog-box progress-box"><h2>${esc(title)}</h2>
      <p>${esc(p.label ?? 'Starting…')}${p.of ? ` <span class="step">(step ${p.step + 1} of ${p.of})</span>` : ''}</p>
      <div class="bar"><i style="width:${pct}%"></i></div><p class="note">Please wait. Do not close VantaFlow while this runs.</p></div>`;
  };
  render();
  el.hidden = false;
  return {
    update: render,
    close() { if (dialog?.locked) { dialog = null; el.hidden = true; } },
  };
}

// A result the user must acknowledge (success or failure of an operation).
export function infoDialog({ title, message, lines = [], ok = 'OK', kind = 'info' }) {
  return new Promise((resolve) => {
    const el = document.getElementById('dialog');
    el.innerHTML = `<div class="dialog-box sheet result-${kind}"><h2>${icon(kind === 'success' ? 'check' : kind === 'warn' ? 'warn' : 'info')}${esc(title)}</h2>
      <p>${esc(message)}</p>${lines.length ? `<ul class="plain small">${lines.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      <div class="dialog-btns"><button data-i="0" class="sel">${esc(ok)}</button></div></div>`;
    dialog = { el, sel: 0, resolve: () => resolve(true), onCross: () => close(true), render: () => {} };
    el.onclick = (e) => { if (e.target.closest('[data-i]')) close(true); };
    el.hidden = false;
  });
}

function close(ok) {
  const d = dialog;
  dialog = null;
  d.el.hidden = true;
  d.el.onclick = null;
  blip(ok ? 'select' : 'back');
  d.resolve(ok);
}

// Returns true when a dialog consumed the action.
export function dialogHandle(action) {
  if (!dialog) return false;
  if (dialog.locked) return true; // an operation is running
  if (dialog.onCross && !dialog.list) {
    if (action === 'cross') dialog.onCross();
    else if (action === 'circle') close(false);
    else if ((action === 'left' || action === 'right') && dialog.render) {
      dialog.sel = action === 'left' ? 0 : 1;
      dialog.onMove?.();
      dialog.render();
      blip();
    }
    return true;
  }
  if (dialog.list && (action === 'up' || action === 'down')) {
    dialog.sel = Math.max(0, Math.min(dialog.list - 1, dialog.sel + (action === 'up' ? -1 : 1)));
    dialog.render();
    blip();
  } else if (dialog.list && action === 'cross') close(true);
  else if (!dialog.list && (action === 'left' || action === 'right')) { dialog.sel = action === 'left' ? 0 : 1; dialog.render(); blip(); }
  else if (action === 'cross') close(dialog.sel === 1);
  else if (action === 'circle') close(false);
  return true;
}

// ---------------------------------------------------------------- splash ---
// Full-screen overlay for simulated launch / rest mode. Any input dismisses a "wait" splash.
let splash = null;
export function showSplash(html, { ms = 0, wait = false } = {}) {
  const el = document.getElementById('splash');
  el.innerHTML = html;
  el.hidden = false;
  requestAnimationFrame(() => el.classList.add('on'));
  return new Promise((resolve) => {
    splash = { resolve, wait };
    if (ms) setTimeout(hideSplash, ms);
  });
}
export function hideSplash() {
  if (!splash) return;
  const el = document.getElementById('splash');
  const { resolve } = splash;
  splash = null;
  el.classList.remove('on');
  setTimeout(() => { el.hidden = true; }, 350);
  resolve();
}
export function splashHandle() {
  if (!splash) return false;
  if (splash.wait) hideSplash();
  return true;
}
