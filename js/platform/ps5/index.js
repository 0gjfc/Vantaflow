// PS5 platform module: models, homebrew environment (etaHEN), customization capabilities and
// compatibility rules. Nothing here is shared with the PS4 module.
import { assessPS5 } from './compat.js';
import etahenDemo from './etahen.js';

// Model families. Disc drive: 'built-in', 'none', or 'optional' (detachable drive can be added;
// Sony lists the add-on drive for the CFI-2000 / CFI-7000 model groups).
export const MODELS = [
  { id: 'ps5', short: 'PS5', name: 'PlayStation 5', group: 'CFI-1000 series, disc', discDrive: 'built-in' },
  { id: 'ps5-digital', short: 'PS5 Digital', name: 'PlayStation 5 Digital Edition', group: 'CFI-1000 series, digital', discDrive: 'none' },
  { id: 'ps5-slim', short: 'PS5 Slim', name: 'PlayStation 5 (slim)', group: 'CFI-2000 model group, disc', discDrive: 'built-in' },
  { id: 'ps5-slim-digital', short: 'PS5 Slim Digital', name: 'PlayStation 5 Digital Edition (slim)', group: 'CFI-2000 model group, digital', discDrive: 'optional' },
  { id: 'ps5-pro', short: 'PS5 Pro', name: 'PlayStation 5 Pro', group: 'CFI-7000 model group', discDrive: 'optional' },
];

// `data`: { etahen: shared/compatibility/etahen.json, customization: shared/customization.json }
export function createPS5Platform(data) {
  return {
    id: 'ps5',
    name: 'PlayStation 5',
    models: MODELS,
    environmentName: 'etaHEN',
    environmentData: data.etahen,
    customization: data.customization?.ps5 ?? [],
    hen: etahenDemo, // demo panel content (plugins, tools, files)
    assess: (detection) => assessPS5(detection, { models: MODELS, etahen: data.etahen }),
  };
}
