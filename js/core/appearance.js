// Appearance: applies settings to the page — colours, animation speed, reflections,
// labels, prompts, background layer and background music.
import { settings, onChange, getBgImage } from './settings.js';
import { createBackground } from '../ui/background.js';
import { setMusic } from '../ui/ui.js';

const SPEEDS = { slow: 1.6, normal: 1, fast: 0.6 }; // × Itemzflow timing
const ITEMZFLOW_STEP = 0.1976; // seconds per cover in Itemzflow
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const animate = () => settings.animations && !reducedMotion;

let bg;

// Coverflow timing and layout, read by the carousel on every frame.
export const flowConfig = () => ({
  wrap: settings.wrap,
  unitScale: settings.coverSize === 'large' ? 1.25 : 1,
  stepSeconds: animate() ? ITEMZFLOW_STEP * SPEEDS[settings.speed] : 0,
});

// JPEG of the background shader, used by the Settings preview.
export const bgSnapshot = () => bg.snapshot();

function apply() {
  const root = document.documentElement.style;
  root.setProperty('--accent', settings.accent);
  root.setProperty('--highlight', settings.highlight);
  root.setProperty('--avatar', settings.avatarColor);
  root.setProperty('--k', String(SPEEDS[settings.speed]));
  const b = document.body.classList;
  b.toggle('no-anim', !animate());
  b.toggle('no-reflect', !settings.reflections);
  b.toggle('labels-always', settings.navLabels === 'always');
  b.toggle('hide-prompts', !settings.showPrompts);
  b.toggle('hide-tid', !settings.showTitleIds);
  bg.update({ mode: settings.bgMode, image: getBgImage(), dim: settings.bgDim, animated: settings.bgAnimated && animate() });
  setMusic(settings.music, settings.volume);
}

export function initAppearance() {
  bg = createBackground(document.getElementById('bg-shader'), document.getElementById('bg-image'));
  apply();
  onChange(apply);
}
