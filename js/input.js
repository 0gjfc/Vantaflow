// Keyboard and controller input (Gamepad API, standard mapping) → abstract actions:
// up down left right cross circle square triangle options l1 r1
import { settings } from './settings.js';

const KEYS = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  Enter: 'cross', ' ': 'cross', x: 'cross',
  Escape: 'circle', Backspace: 'circle', c: 'circle',
  s: 'square', t: 'triangle', m: 'options', Tab: 'options',
  q: 'l1', e: 'r1', PageUp: 'l1', PageDown: 'r1',
};

const PAD = { 0: 'cross', 1: 'circle', 2: 'square', 3: 'triangle', 4: 'l1', 5: 'r1', 9: 'options', 12: 'up', 13: 'down', 14: 'left', 15: 'right' };
const DIRS = new Set(['up', 'down', 'left', 'right']);
const REPEAT_DELAY = 380;
const REPEAT_RATE = 110;

export function initInput(dispatch) {
  window.addEventListener('keydown', (e) => {
    if (e.target.closest?.('input, textarea, select') || e.ctrlKey || e.metaKey || e.altKey) return;
    const action = KEYS[e.key] ?? KEYS[e.key.toLowerCase()];
    if (!action) return;
    e.preventDefault();
    dispatch(action);
  });

  // Gamepad: edge-triggered buttons, held directions auto-repeat.
  const held = new Map(); // action → next repeat time
  let raf = 0;
  const poll = (now) => {
    const pads = navigator.getGamepads?.() ?? [];
    const down = new Set();
    for (const pad of pads) {
      if (!pad) continue;
      pad.buttons.forEach((b, i) => { if (b.pressed && PAD[i]) down.add(PAD[i]); });
      const [x = 0, y = 0] = pad.axes;
      if (x < -0.5) down.add('left');
      if (x > 0.5) down.add('right');
      if (y < -0.5) down.add('up');
      if (y > 0.5) down.add('down');
    }
    for (let action of down) {
      const next = held.get(action);
      if (next === undefined || (DIRS.has(action) && now >= next)) {
        held.set(action, now + (next === undefined ? REPEAT_DELAY : REPEAT_RATE));
        if (settings.swapConfirm && (action === 'cross' || action === 'circle')) action = action === 'cross' ? 'circle' : 'cross';
        dispatch(action);
      }
    }
    for (const action of held.keys()) if (!down.has(action)) held.delete(action);
    raf = requestAnimationFrame(poll);
  };
  window.addEventListener('gamepadconnected', () => { if (!raf) raf = requestAnimationFrame(poll); });
}
