// VantaFlow start-up. The app is laid out on a fixed 1920×1080 "TV" stage scaled to the window.
import { activeProfile } from './core/settings.js';
import { initAppearance } from './core/appearance.js';
import { initNavigation, dispatch } from './core/navigation.js';
import { initInput } from './core/input.js';
import { loadLibrary } from './data/library.js';
import { probeLogos, initPlatforms } from './platform/index.js';

function fit() {
  const s = Math.min(innerWidth / 1920, innerHeight / 1080);
  document.getElementById('stage').style.transform = `translate(-50%, -50%) scale(${s})`;
}
addEventListener('resize', fit);
fit();
// Mouse clicks must not leave a browser focus ring: VantaFlow draws its own highlight.
addEventListener('click', (e) => e.target.closest('button:not(.dialog-btns button)')?.blur());

await Promise.all([loadLibrary(activeProfile()), probeLogos(), initPlatforms()]);
initAppearance();
initNavigation();
initInput(dispatch);

// Hook for a future native wrapper (e.g. an on-console shell) to feed controller input:
//   window.VantaFlow.press('cross')   // up down left right cross circle square triangle options l1 r1
window.VantaFlow = { press: dispatch };
