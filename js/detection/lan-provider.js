// Detection provider for the user's own consoles on the local network (desktop).
// Consoles are added only by the user (discovery result or typed IP address) and saved on this
// computer. Detection goes through the local agent; a console the user disconnected is not
// contacted at all.
import { load, save } from '../core/store.js';
import { probeAddress } from './agent-client.js';

const KEY = 'lan-consoles';
export const lanId = (address) => `lan-${address}`;
export const isLan = (id) => typeof id === 'string' && id.startsWith('lan-');

// [{ id, address, generation, name, connected, addedAt, lastVerified }]
export const savedConsoles = () => (Array.isArray(load(KEY)) ? load(KEY) : []);
const write = (list) => save(KEY, list);
export const savedConsole = (id) => savedConsoles().find((c) => c.id === id) ?? null;

export function saveConsole(entry) {
  const list = savedConsoles().filter((c) => c.id !== entry.id);
  list.push(entry);
  write(list);
  return entry;
}
export const updateConsole = (id, patch) => { const c = savedConsole(id); if (c) saveConsole({ ...c, ...patch }); };
export const removeConsole = (id) => write(savedConsoles().filter((c) => c.id !== id));

// Pick the report that identified a console; otherwise the most informative failure.
export function bestReport(reports, generation) {
  return reports.find((r) => r.retrieved?.generation && (!generation || r.retrieved.generation === generation))
    ?? reports.find((r) => r.retrieved?.generation)
    ?? reports.find((r) => r.errors?.some((e) => e.code !== 'timeout'))
    ?? reports[0];
}

// Turns a provider report into a detection result. A failed check is "not identified" with the
// provider's errors — never a success.
export function detectionFromReport(r, address) {
  if (r?.detection && r.retrieved?.generation) return r.detection;
  return {
    connection: { state: 'unknown', transport: 'ddp-udp', address },
    console: { generation: null, model: null, verified: false, source: 'ddp' },
    firmware: { version: null, verified: false, source: 'ddp' },
    environment: { state: 'unknown', verified: false, source: 'none' },
    errors: r?.errors ?? [{ code: 'no-report', message: 'The detection did not return a result.' }],
    report: r ? { provider: r.provider, method: r.method, attempted: r.attempted, unavailable: r.unavailable } : null,
  };
}

export const lanProvider = {
  name: 'lan',
  async list() {
    return savedConsoles().map((c) => ({ id: c.id, label: c.name || c.address, scenario: c.address, generation: c.generation, source: 'lan' }));
  },
  async detect(id) {
    const c = savedConsole(id);
    if (!c) throw Object.assign(new Error('This console is no longer saved.'), { code: 'not-found' });
    if (!c.connected) {
      return {
        connection: { state: 'disconnected', transport: 'ddp-udp', address: c.address, lastSeen: c.lastVerified },
        console: { generation: c.generation, model: null, name: c.name, verified: false, source: 'last-known' },
        firmware: { version: null, verified: false, source: 'last-known' },
        environment: { state: 'unknown', verified: false, source: 'none' },
        report: { provider: 'lan', method: 'Disconnected by you: VantaFlow does not contact this console until you connect again.', attempted: [], unavailable: [] },
      };
    }
    const { reports } = await probeAddress(c.address, c.generation ?? undefined);
    const r = bestReport(reports, c.generation);
    if (r.retrieved?.generation) updateConsole(id, { generation: r.retrieved.generation, name: r.retrieved.name ?? c.name, lastVerified: r.at });
    return detectionFromReport(r, c.address);
  },
};
