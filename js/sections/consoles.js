// Console management page (desktop).
// Two kinds of consoles are listed:
//  - the user's own consoles on the local network, added by discovery or by IP address and
//    checked read-only through the local agent (desktop/server.mjs);
//  - the demonstration consoles from shared/mock-consoles.json, always labelled as demo data.
// Choosing a PS4 or PS5 console switches to that profile, whose settings are kept separately.
import {
  consoleRefs, detectionOf, compatibilityOf, redetect, selectConsole, activeConsoleId, platformOf,
  agentAvailable, isRealConsole, savedConsole, discover, addDiscovered, addByAddress, connect, disconnect, refresh, forget,
} from '../platform/index.js';
import { STATUS_LABEL, henStatus } from '../models/index.js';
import { esc, tag, kv, toast, confirmDialog, textDialog, choiceDialog } from '../ui/ui.js';

export const statusChip = (status) => `<span class="compat c-${status}">${esc(STATUS_LABEL[status])}</span>`;
const when = (iso) => (iso ? new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'medium' }) : '—');
const GEN = { ps4: 'PS4', ps5: 'PS5' };
const HEN = { ps4: 'GoldHEN', ps5: 'etaHEN' };
const POWER = { on: 'On', standby: 'Rest mode' };
const GROUPS = [['ps4', 'Demo · PS4'], ['ps5', 'Demo · PS5'], [null, 'Demo · not identified']];
const LEVELS = ['official', 'homebrew', 'experimental', 'unsupported'];
const NO_AGENT = 'Needs the VantaFlow desktop agent. Start VantaFlow with: node desktop/server.mjs';

const reasonsHTML = (c) => `<ul class="reasons">${c.reasons.map((r) => `<li><span class="rdot c-${r.status}"></span>${esc(r.message)}</li>`).join('')}</ul>`;
const listHTML = (items, max = 5) => `<ul class="plain small">${items.slice(0, max).map((x) => `<li>${esc(x.label ?? x)}${x.why ? `<em> — ${esc(x.why)}</em>` : ''}</li>`).join('')}${items.length > max ? `<li class="more">and ${items.length - max} more</li>` : ''}</ul>`;

// ------------------------------------------------------------ real consoles ---

function connectionText(d, saved) {
  if (!d) return 'Not checked yet';
  if (d.connection.state === 'connected') return `Connected — the console answered at ${when(d.connection.lastSeen)}`;
  if (d.connection.state === 'disconnected') return 'Disconnected by you — VantaFlow does not contact it';
  return `No answer${d.errors[0] ? ` — ${d.errors[0].message}` : ''}${saved?.lastVerified ? ` (last answered ${when(saved.lastVerified)})` : ''}`;
}

function firmwareText(d) {
  const f = d?.firmware;
  if (!f || d.connection.state !== 'connected') return 'Not available — the console is not connected';
  if (f.version) return `${f.version} — ${f.verified ? 'verified' : 'not confirmed'} (system-version ${f.raw})`;
  if (f.raw) return `Not available — system-version ${f.raw} has no documented decoding`;
  return 'Not available — the console did not report it';
}

function generationText(d, saved) {
  const g = d?.console.generation;
  if (g && d.console.verified) return `${GEN[g]} — verified (discovery reply host-type and protocol)`;
  if (saved?.generation) return `${GEN[saved.generation]} — last known, not checked now`;
  return 'Not identified';
}

function realDetail(it) {
  const id = it.ref.id;
  const saved = savedConsole(id);
  const d = detectionOf(id);
  const c = compatibilityOf(id);
  const connected = d?.connection.state === 'connected';
  const gen = d?.console.generation ?? saved?.generation;
  const unavailable = d?.report.unavailable ?? [];
  const model = unavailable.find((u) => u.field === 'model');
  const verified = connected ? [
    `Console type: ${GEN[d.console.generation]}`,
    d.console.name && `Name: ${d.console.name} (as the console reports it)`,
    d.network.power !== 'unknown' && `Power: ${POWER[d.network.power]}`,
    d.firmware.verified && `Firmware: ${d.firmware.version}`,
  ].filter(Boolean) : [];
  return `<div class="console-head"><h2>${esc(d?.console.name ?? saved?.name ?? saved?.address ?? it.ref.label)}</h2>${statusChip(c.status)}${tag('real')}</div>
    ${kv([
      ['IP address', saved?.address ?? '—'],
      ['Generation', generationText(d, saved)],
      ['Model', model ? 'Not available — no documented read-only method (see below)' : 'Not available'],
      ['Firmware', firmwareText(d)],
      ['Connection', connectionText(d, saved)],
      ['Power', connected ? POWER[d.network.power] ?? 'Unknown' : 'Unknown'],
      [`${gen ? HEN[gen] : 'Homebrew'} status`, henStatus(d)],
      ['Compatibility', c.label],
      ['Last successful check', saved?.lastVerified ? when(saved.lastVerified) : 'Never'],
      ['Last detection', when(d?.detectedAt)],
    ])}
    ${verified.length ? `<h3>Verified from the console</h3><ul class="plain small">${verified.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    ${unavailable.length ? `<h3>Not available</h3><ul class="plain small unavailable">${unavailable.map((u) => `<li><b>${esc(u.field)}</b> — ${esc(u.reason)}</li>`).join('')}</ul>` : ''}
    ${d?.errors.length ? `<h3>Errors</h3><ul class="plain small">${d.errors.map((e) => `<li>${esc(e.message)}${e.action ? `<em> — ${esc(e.action)}</em>` : ''}</li>`).join('')}</ul>` : ''}
    <h3>Why “${esc(c.label)}”</h3>${reasonsHTML(c)}
    ${d?.report.method ? `<h3>Method</h3><p class="note">${esc(d.report.method)}${d.report.attempted.length ? `<br>Sent: ${esc(d.report.attempted.join('; '))}` : ''}</p>` : ''}
    <p class="note">Read-only: VantaFlow only sends the discovery request (SRCH). It never wakes, controls or changes the console. ✕ actions · △ refresh.</p>`;
}

async function checked(promise, label) {
  const d = await promise;
  if (d.connection.state === 'connected') toast('Console answered', `${label}: ${GEN[d.console.generation]}${d.console.name ? ` “${d.console.name}”` : ''} — read-only check.`, 'success');
  else if (d.connection.state === 'disconnected') toast('Disconnected', `${label}: VantaFlow will not contact it until you connect again.`, 'info');
  else toast('No answer', `${label}: ${d.errors[0]?.message ?? 'the console did not answer.'}`, 'warn');
  return d;
}

async function consoleActions(it, panel) {
  const id = it.ref.id;
  const saved = savedConsole(id);
  const label = saved?.name || saved?.address || it.ref.label;
  const identified = Boolean(detectionOf(id)?.console.generation);
  const options = [
    saved?.connected
      ? { id: 'disconnect', label: 'Disconnect', hint: 'Stop contacting this console. It stays saved.' }
      : { id: 'connect', label: 'Connect', hint: 'Check it now with a discovery request.' },
    { id: 'refresh', label: 'Refresh information', hint: saved?.connected ? 'Ask the console again (read-only).' : 'Connect first.' },
    ...(identified && id !== activeConsoleId() ? [{ id: 'active', label: 'Make active console', hint: 'Use it for the top bar, HEN page and compatibility.' }] : []),
    { id: 'remove', label: 'Remove saved console', hint: 'Forget it on this computer.' },
  ];
  const pick = await choiceDialog({ title: label, message: `${saved?.address ?? ''}`, options });
  if (!pick) return;
  if ((pick === 'connect' || pick === 'refresh') && !agentAvailable()) { toast('Desktop agent not running', NO_AGENT, 'warn'); return; }
  if (pick === 'connect') await checked(connect(id), label);
  else if (pick === 'disconnect') await checked(disconnect(id), label);
  else if (pick === 'refresh') {
    if (!saved?.connected) toast('Not connected', 'Connect this console first; a disconnected console is not contacted.', 'info');
    else await checked(refresh(id), label);
  } else if (pick === 'active') makeActive(it, label);
  else if (pick === 'remove' && await confirmDialog({ title: 'Remove console', message: `Forget ${label} (${saved?.address})? Nothing is sent to the console.`, confirm: 'Remove', sim: false })) {
    await forget(id);
    toast('Console removed', label, 'info');
  }
  panel.app.refreshChrome();
}

function makeActive(it, label) {
  if (it.ref.id === activeConsoleId()) { toast('Already active', label, 'info'); return; }
  if (!selectConsole(it.ref.id)) {
    toast('Cannot use this device', 'It is not identified as a PS4 or a PS5, so it cannot be assigned to a console profile.', 'warn');
    return;
  }
  toast('Active console changed', `${label}${isRealConsole(it.ref.id) ? '' : ' — demonstration data'}.`, 'success');
}

// --------------------------------------------------------- add a console ---

const PRIVACY = 'VantaFlow sends one discovery request (SRCH) for PS4 on UDP port 987 and one for PS5 on UDP port 9302 '
  + 'to this network\'s broadcast address, and listens for 2 seconds. Consoles that answer report their type, name, '
  + 'system version and whether they are on or in rest mode. Nothing leaves your local network, no ports are scanned, '
  + 'and only the consoles you then pick are saved, on this computer. The running game and console ID in the replies are discarded.';

async function discoverFlow() {
  if (!agentAvailable()) { toast('Desktop agent not running', NO_AGENT, 'warn'); return; }
  if (!await confirmDialog({ title: 'Discover consoles on this network?', message: PRIVACY, confirm: 'Search', sim: false })) return;
  toast('Searching…', 'Waiting for consoles on this network to answer.', 'info');
  let found;
  try {
    found = await discover();
  } catch (e) {
    toast('Discovery failed', e.message, 'warn');
    return;
  }
  if (!found.devices.length) {
    toast('No consoles answered', `No answer does not mean there is none: the console may be off, on another network, or have network features off in rest mode. Add it by IP address instead.${found.errors[0] ? ` (${found.errors[0].message})` : ''}`, 'warn');
    return;
  }
  const pick = await choiceDialog({
    title: `${found.devices.length} console${found.devices.length > 1 ? 's' : ''} answered`,
    message: 'Pick the console to save. Only the one you pick is contacted again.',
    options: found.devices.map((r, i) => ({
      id: String(i),
      label: `${r.retrieved.name ?? 'Unnamed console'} — ${GEN[r.retrieved.generation]}`,
      hint: `${r.address} · ${POWER[r.retrieved.power] ?? 'power unknown'}${savedConsole(`lan-${r.address}`) ? ' · already saved' : ''}`,
    })),
  });
  if (pick === null) return;
  const r = found.devices[Number(pick)];
  await checked(addDiscovered(r), r.retrieved.name ?? r.address);
}

async function addFlow() {
  if (!agentAvailable()) { toast('Desktop agent not running', NO_AGENT, 'warn'); return; }
  const address = await textDialog({ title: 'Add console by IP address', maxLength: 15, hint: 'The console\'s IPv4 address on your network, e.g. 192.168.1.20 (PS4/PS5: Settings → Network → View Connection Status). VantaFlow sends it one discovery request.' });
  if (!address) return;
  try {
    const { detection } = await addByAddress(address);
    if (detection.console.generation) toast('Console added', `${address}: ${GEN[detection.console.generation]}${detection.console.name ? ` “${detection.console.name}”` : ''} answered.`, 'success');
    else toast('Saved, not identified', `${address}: ${detection.errors[0]?.message ?? 'no discovery reply.'} You can refresh it later.`, 'warn');
  } catch (e) {
    toast(e.code === 'invalid-address' ? 'Invalid address' : 'Could not add console', e.message, 'warn');
  }
}

const ACTIONS = [
  { id: 'discover', title: 'Discover consoles on this network…', icon: 'search', run: discoverFlow,
    help: `<h2>Discover consoles</h2><p>${esc(PRIVACY)}</p><p class="note">You are asked before anything is sent. If your console does not answer, add it by IP address.</p>` },
  { id: 'add-ip', title: 'Add console by IP address…', icon: 'plus', run: addFlow,
    help: '<h2>Add by IP address</h2><p>Type the console\'s address on your network. Only private addresses are accepted (10.x, 172.16–31.x, 192.168.x, 169.254.x): VantaFlow never contacts internet addresses.</p><p class="note">The address is saved even when nothing answers, shown as “not identified”, so you can refresh it later. An address is never assumed to be a PlayStation until it answers as one.</p>' },
];

// --------------------------------------------------------------- demo ---

function evidence(field, value) {
  if (!value) return 'Not reported';
  return `${value} · ${field.verified ? 'verified' : 'not verified'} (${field.source})`;
}

function environmentText(d) {
  const e = d.environment;
  const name = { goldhen: 'GoldHEN', etahen: 'etaHEN' }[e.kind] ?? 'Homebrew environment';
  if (e.state === 'absent') return 'None detected';
  if (e.state === 'unknown') return 'Unknown';
  return `${name} ${e.version ?? '(version not reported)'} · ${e.verified ? 'verified' : 'not verified'} (${e.source})`;
}

function demoDetail(it) {
  const d = detectionOf(it.ref.id);
  if (!d) return `<h2>${esc(it.ref.label)}</h2><p>Not detected yet. △ detects again.</p>`;
  const c = compatibilityOf(it.ref.id);
  const p = platformOf(d.console.generation);
  const model = p?.models.find((m) => m.id === d.console.model);
  const connected = d.connection.state === 'connected';
  const custom = p ? LEVELS.map((l) => `${p.customization.filter((x) => x.level === l).length} ${l}`).join(' · ') : '';
  return `<div class="console-head"><h2>${esc(it.ref.label)}</h2>${statusChip(c.status)}${tag('sim')}</div>
    ${kv([
      ['Connection', connected ? `Connected (${d.connection.transport})` : `Not connected${d.connection.lastSeen ? ` — last seen ${when(d.connection.lastSeen)}` : ''}`],
      ['Network', d.network.state],
      ['Generation', p ? p.name : 'Not identified'],
      ['Model', model ? `${model.name} (${model.group})` : evidence(d.console, d.console.model)],
      ['Firmware', evidence(d.firmware, d.firmware.version)],
      ['Homebrew', environmentText(d)],
      ['HEN status', henStatus(d)],
      ['Last detection', when(d.detectedAt)],
    ])}
    <h3>Why “${esc(c.label)}”</h3>${reasonsHTML(c)}
    ${c.supported.length ? `<h3>Supported features (${c.supported.length})</h3><div class="chips small">${c.supported.map((f) => `<span>${esc(f)}</span>`).join('')}</div>` : ''}
    ${c.unsupported.length ? `<h3>Not supported (${c.unsupported.length})</h3>${listHTML(c.unsupported)}` : ''}
    ${c.unverified.length ? `<h3>Not verified for this release (${c.unverified.length})</h3>${listHTML(c.unverified, 3)}` : ''}
    ${c.requirements.length ? `<h3>Requirements</h3>${listHTML(c.requirements, 3)}` : ''}
    ${c.limitations.length ? `<h3>Limitations</h3>${listHTML(c.limitations, 4)}` : ''}
    ${custom ? `<h3>Customization on ${esc(p.name)}</h3><p class="note">${esc(custom)} — details in docs/customization.md</p>` : ''}
    ${c.dataVerified ? `<p class="note">${esc(c.environment)} data verified ${esc(c.dataVerified)} from the project's GitHub releases and README.</p>` : ''}
    <p class="note">Demonstration data from shared/mock-consoles.json — no console was contacted. This is not proof that a real console behaves this way.</p>`;
}

// ------------------------------------------------------------- section ---

const consoleRow = (ref) => {
  const d = detectionOf(ref.id);
  const real = isRealConsole(ref.id);
  const saved = real ? savedConsole(ref.id) : null;
  const state = !real ? ref.scenario
    : !d ? `${saved?.address} · not checked yet`
      : `${saved?.address} · ${d.connection.state === 'connected' ? `${GEN[d.console.generation]} · connected` : d.connection.state === 'disconnected' ? 'disconnected' : 'no answer'}`;
  return { ref, title: ref.label, sub: state, icon: ref.id === activeConsoleId() ? 'check' : 'console', valueHTML: statusChip(compatibilityOf(ref.id).status) };
};

export const consolesSection = {
  id: 'consoles', label: 'Consoles', icon: 'console', view: 'panel', kind: 'real', slot: 'status', // opened from the console status, not an icon
  items() {
    const refs = consoleRefs();
    const real = refs.filter((r) => isRealConsole(r.id));
    const demo = refs.filter((r) => !isRealConsole(r.id));
    return [
      { group: 'Your consoles' },
      ...ACTIONS.map((a) => ({ action: a, title: a.title, sub: agentAvailable() ? 'Local network only · asks first' : NO_AGENT, icon: a.icon })),
      ...(real.length ? real.map(consoleRow) : [{ id: 'none', title: 'No consoles saved yet', sub: 'Discover or add one above', icon: 'info', noAction: true }]),
      ...GROUPS.flatMap(([gen, title]) => {
        const group = demo.filter((r) => (detectionOf(r.id)?.console.generation ?? null) === gen);
        return group.length ? [{ group: title }, ...group.map(consoleRow)] : [];
      }),
    ];
  },
  detail(it) {
    if (it.action) return it.action.help + (agentAvailable() ? '' : `<p class="note">${esc(NO_AGENT)}</p>`);
    if (it.id === 'none') return '<h2>No consoles saved</h2><p>Your own PS4 or PS5 appears here once you discover it or add it by IP address. Until then, the top bar uses a demonstration console.</p>';
    return isRealConsole(it.ref.id) ? realDetail(it) : demoDetail(it);
  },
  async activate(it, panel) {
    if (it.action) await it.action.run();
    else if (isRealConsole(it.ref.id)) await consoleActions(it, panel);
    else makeActive(it, it.ref.label);
    panel.app.refreshChrome();
  },
  on: {
    async triangle(it, panel) {
      if (!it?.ref) return;
      if (isRealConsole(it.ref.id)) {
        if (!agentAvailable()) toast('Desktop agent not running', NO_AGENT, 'warn');
        else if (!savedConsole(it.ref.id)?.connected) toast('Not connected', 'Connect this console first; a disconnected console is not contacted.', 'info');
        else await checked(refresh(it.ref.id), it.ref.label);
      } else {
        await redetect(it.ref.id);
        toast('Detection finished', `${it.ref.label}: mock provider, nothing was sent to a console.`, 'sim');
      }
      panel.render();
      panel.app.refreshChrome();
    },
  },
  prompts(it) {
    if (it?.action) return [['cross', 'Open'], ['circle', 'Back'], ['updown', 'Navigate']];
    if (it?.ref && isRealConsole(it.ref.id)) return [['cross', 'Actions'], ['triangle', 'Refresh'], ['circle', 'Back'], ['updown', 'Navigate']];
    if (it?.ref) return [['cross', it.ref.id === activeConsoleId() ? 'Active' : 'Use console'], ['triangle', 'Detect again'], ['circle', 'Back'], ['updown', 'Navigate']];
    return [['circle', 'Back'], ['updown', 'Navigate']];
  },
};
