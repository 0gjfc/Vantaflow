// Platform registry and the active console.
//
// PS4 and PS5 are separate modules (./ps4, ./ps5) with their own models, homebrew environment,
// customization capabilities and compatibility rules. This file only picks the one that
// matches the active profile, runs detection through the detection service, and asks the
// compatibility engine about a console.
// Two detection providers feed it: the demo consoles (shared/mock-consoles.json) and, on the
// desktop, the user's own consoles on the local network through the local agent (read-only).
import { activeProfile, selectedConsole, setSelectedConsole, switchProfile } from '../core/settings.js';
import { titles } from '../data/library.js';
import { evaluate } from '../compat/engine.js';
import { DetectionService } from '../detection/service.js';
import { MockDetectionProvider } from '../detection/mock-provider.js';
import { lanProvider, isLan, lanId, saveConsole, savedConsole, updateConsole, removeConsole, bestReport, detectionFromReport } from '../detection/lan-provider.js';
import { agentInfo, discoverConsoles, probeAddress } from '../detection/agent-client.js';
import { createPS4Platform } from './ps4/index.js';
import { createPS5Platform } from './ps5/index.js';
import goldhen from './ps4/goldhen.js';
import etahen from './ps5/etahen.js';

export const HENS = [goldhen, etahen];
const DEFAULT_CONSOLE = { ps4: 'ps4-goldhen-supported', ps5: 'ps5-etahen-supported' };

let platforms = {};
let detection;
let consoles = [];
let agent = null; // local desktop agent, when VantaFlow runs through desktop/server.mjs
const listeners = new Set();
export const onDetection = (fn) => listeners.add(fn);
const changed = () => listeners.forEach((fn) => fn());

const json = (path) => fetch(path).then((r) => {
  if (!r.ok) throw new Error(`Could not load ${path} (${r.status})`);
  return r.json();
});

export async function initPlatforms() {
  const [goldhenData, etahenData, customization, mock] = await Promise.all([
    'shared/compatibility/goldhen.json', 'shared/compatibility/etahen.json', 'shared/customization.json', 'shared/mock-consoles.json',
  ].map(json));
  const data = { goldhen: goldhenData, etahen: etahenData, customization };
  platforms = { ps4: createPS4Platform(data), ps5: createPS5Platform(data) };
  const demo = new MockDetectionProvider(mock.consoles, { latencyMs: 60 });
  detection = new DetectionService({
    name: 'demo+lan',
    list: async () => [...(await demo.list()).map((c) => ({ ...c, source: 'demo' })), ...(await lanProvider.list())],
    detect: (id) => (isLan(id) ? lanProvider : demo).detect(id),
  }, { timeoutMs: 6000 });
  [agent, consoles] = await Promise.all([agentInfo(), detection.list()]);
  await Promise.all(consoles.filter((c) => c.source === 'demo').map((c) => detection.detect(c.id)));
  // Saved consoles are re-checked in the background, only when the agent runs and the user left them connected.
  if (agent) consoles.filter((c) => isLan(c.id) && savedConsole(c.id)?.connected).forEach((c) => refresh(c.id));
}

export const agentAvailable = () => Boolean(agent);
export const isRealConsole = isLan;
export { savedConsole };

async function relist() {
  consoles = await detection.list();
  changed();
}

export async function refresh(id) {
  const result = await detection.detect(id);
  await relist();
  return result;
}

// Discovery: only after the user agreed (the Consoles page asks first).
export async function discover() {
  const { devices, errors } = await discoverConsoles();
  return { devices: devices.filter((r) => r.retrieved?.generation), errors };
}

// Save a console the user picked from the discovery list, then check it again directly.
export async function addDiscovered(r) {
  const id = lanId(r.address);
  saveConsole({ id, address: r.address, generation: r.retrieved.generation, name: r.retrieved.name, connected: true, addedAt: new Date().toISOString(), lastVerified: r.at });
  return refresh(id);
}

// Save a typed address and check it. Saved even when nothing answers, so the user can retry;
// it is shown as not identified until a reply proves what it is.
export async function addByAddress(address) {
  const { reports } = await probeAddress(address);
  const r = bestReport(reports);
  const id = lanId(address);
  saveConsole({ id, address, generation: r.retrieved?.generation ?? null, name: r.retrieved?.name ?? null, connected: true, addedAt: new Date().toISOString(), lastVerified: r.retrieved?.generation ? r.at : null });
  await refresh(id);
  return { id, report: r, detection: detectionFromReport(r, address) };
}

export async function connect(id) {
  updateConsole(id, { connected: true });
  return refresh(id);
}

export async function disconnect(id) {
  updateConsole(id, { connected: false });
  return refresh(id);
}

export async function forget(id) {
  removeConsole(id);
  for (const p of ['ps4', 'ps5']) if (selectedConsole(p) === id) setSelectedConsole(p, null);
  await relist();
}

export const platform = () => platforms[activeProfile()];
export const platformOf = (generation) => platforms[generation] ?? null;
export const consoleRefs = () => consoles;
export const activeConsoleId = () => selectedConsole() ?? DEFAULT_CONSOLE[activeProfile()];
export const detectionOf = (id) => detection.last(id);
export const activeDetection = () => detectionOf(activeConsoleId());
export const compatibilityOf = (id) => evaluate(detectionOf(id), platforms);
export const redetect = (id) => (isLan(id) ? refresh(id) : detection.detect(id));

// Make a console the active one. Its generation decides the profile (PS4 or PS5); a console
// that is not identified as either cannot be assigned. Returns false in that case.
export function selectConsole(id) {
  const generation = detectionOf(id)?.console.generation;
  if (!generation) return false;
  setSelectedConsole(generation, id);
  switchProfile(generation); // no-op when already on that profile
  return true;
}

const gb = (size) => parseFloat(size) || 0;

// Drives of the active console, split into categories. Game sizes come from the installed titles.
export function storageInfo() {
  const d = activeDetection();
  if (!d || d.connection.state !== 'connected') return [];
  return d.storage.map((drive) => {
    const cats = Object.entries(drive.categories).map(([name, size]) => ({ name, size }));
    if (drive.holds) cats.unshift({ name: 'Games', size: titles('games').filter((g) => g.platform === drive.holds).reduce((n, g) => n + gb(g.size), 0) });
    const used = cats.reduce((n, c) => n + c.size, 0);
    return { name: drive.name, total: drive.total, used, free: Math.max(0, drive.total - used), cats };
  });
}

// Each logo is requested once at start-up. A missing file falls back to the plain name,
// so the browser logs at most one "not found" per logo instead of one per render.
const logoFound = {};
export const probeLogos = () => Promise.all(HENS.map((h) => new Promise((done) => {
  const img = new Image();
  img.onload = () => { logoFound[h.id] = true; done(); };
  img.onerror = () => { logoFound[h.id] = false; done(); };
  img.src = h.logo;
})));

export const henLogo = (h, cls) => (logoFound[h.id]
  ? `<img class="${cls}" src="${h.logo}" alt="${h.name} logo">`
  : `<span class="${cls} hen-text">${h.name}</span>`);
