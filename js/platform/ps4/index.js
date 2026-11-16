// PS4 platform module: models, homebrew environment (GoldHEN), customization capabilities and
// compatibility rules. Nothing here is shared with the PS5 module.
import { assessPS4 } from './compat.js';
import goldhenDemo from './goldhen.js';

// Model families. Every family has a built-in disc drive.
export const MODELS = [
  { id: 'ps4', short: 'PS4', name: 'PlayStation 4', group: 'CUH-1000 series', discDrive: 'built-in' },
  { id: 'ps4-slim', short: 'PS4 Slim', name: 'PlayStation 4 Slim', group: 'CUH-2000 series', discDrive: 'built-in' },
  { id: 'ps4-pro', short: 'PS4 Pro', name: 'PlayStation 4 Pro', group: 'CUH-7000 series', discDrive: 'built-in' },
];

// `data`: { goldhen: shared/compatibility/goldhen.json, customization: shared/customization.json }
export function createPS4Platform(data) {
  return {
    id: 'ps4',
    name: 'PlayStation 4',
    models: MODELS,
    environmentName: 'GoldHEN',
    environmentData: data.goldhen,
    customization: data.customization?.ps4 ?? [],
    hen: goldhenDemo, // demo panel content (plugins, tools, files)
    assess: (detection) => assessPS4(detection, { models: MODELS, goldhen: data.goldhen }),
  };
}
