// Console management page (desktop).
// Lists the consoles the detection provider knows about, shows what was detected and what the
// compatibility engine concluded, and lets the user choose the active console. Choosing a PS4
// or PS5 console switches to that profile, whose settings are kept separately.
// All consoles here are demonstration data (shared/mock-consoles.json).
import { consoleRefs, detectionOf, compatibilityOf, redetect, selectConsole, activeConsoleId, platformOf } from '../platform/index.js';
import { STATUS_LABEL } from '../models/index.js';
import { esc, icon, tag, kv, toast } from '../ui/ui.js';

export const statusChip = (status) => `<span class="compat c-${status}">${esc(STATUS_LABEL[status])}</span>`;
const when = (iso) => (iso ? new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'medium' }) : '—');
const GROUPS = [['ps4', 'PS4'], ['ps5', 'PS5'], [null, 'Not identified']];
const LEVELS = ['official', 'homebrew', 'experimental', 'unsupported'];

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

function detail(it) {
  const d = detectionOf(it.ref.id);
  const c = compatibilityOf(it.ref.id);
  const p = platformOf(d.console.generation);
  const model = p?.models.find((m) => m.id === d.console.model);
  const connected = d.connection.state === 'connected';
  const list = (items, max = 5) => `<ul class="plain small">${items.slice(0, max).map((x) => `<li>${esc(x.label ?? x)}${x.why ? `<em> — ${esc(x.why)}</em>` : ''}</li>`).join('')}${items.length > max ? `<li class="more">and ${items.length - max} more</li>` : ''}</ul>`;
  const custom = p ? LEVELS.map((l) => `${p.customization.filter((x) => x.level === l).length} ${l}`).join(' · ') : '';
  return `<div class="console-head"><h2>${esc(it.ref.label)}</h2>${statusChip(c.status)}${tag('sim')}</div>
    ${kv([
      ['Connection', connected ? `Connected (${d.connection.transport})` : `Not connected${d.connection.lastSeen ? ` — last seen ${when(d.connection.lastSeen)}` : ''}`],
      ['Network', d.network.state],
      ['Generation', p ? p.name : 'Not identified'],
      ['Model', model ? `${model.name} (${model.group})` : evidence(d.console, d.console.model)],
      ['Firmware', evidence(d.firmware, d.firmware.version)],
      ['Homebrew', environmentText(d)],
      ['Last detection', when(d.detectedAt)],
    ])}
    <h3>Why “${esc(c.label)}”</h3>
    <ul class="reasons">${c.reasons.map((r) => `<li><span class="rdot c-${r.status}"></span>${esc(r.message)}</li>`).join('')}</ul>
    ${c.supported.length ? `<h3>Supported features (${c.supported.length})</h3><div class="chips small">${c.supported.map((f) => `<span>${esc(f)}</span>`).join('')}</div>` : ''}
    ${c.unsupported.length ? `<h3>Not supported (${c.unsupported.length})</h3>${list(c.unsupported)}` : ''}
    ${c.unverified.length ? `<h3>Not verified for this release (${c.unverified.length})</h3>${list(c.unverified, 3)}` : ''}
    ${c.requirements.length ? `<h3>Requirements</h3>${list(c.requirements, 3)}` : ''}
    ${c.limitations.length ? `<h3>Limitations</h3>${list(c.limitations, 4)}` : ''}
    ${custom ? `<h3>Customization on ${esc(p.name)}</h3><p class="note">${esc(custom)} — details in docs/customization.md</p>` : ''}
    ${c.dataVerified ? `<p class="note">${esc(c.environment)} data verified ${esc(c.dataVerified)} from the project's GitHub releases and README.</p>` : ''}`;
}

export const consolesSection = {
  id: 'consoles', label: 'Consoles', icon: 'console', view: 'panel', kind: 'sim',
  items: () => GROUPS.flatMap(([gen, title]) => {
    const refs = consoleRefs().filter((r) => (detectionOf(r.id)?.console.generation ?? null) === gen);
    return refs.length ? [{ group: title }, ...refs.map((ref) => ({
      ref,
      title: ref.label,
      sub: ref.scenario,
      icon: ref.id === activeConsoleId() ? 'check' : 'console',
      valueHTML: statusChip(compatibilityOf(ref.id).status),
    }))] : [];
  }),
  detail,
  activate(it, panel) {
    if (it.ref.id === activeConsoleId()) { toast('Already active', it.ref.label, 'info'); return; }
    if (!selectConsole(it.ref.id)) {
      toast('Cannot use this device', 'It is not identified as a PS4 or a PS5, so it cannot be assigned to a console profile.', 'warn');
      return;
    }
    panel.app.refreshChrome();
    toast('Active console changed', `${it.ref.label} — demonstration data.`, 'success');
  },
  on: {
    async triangle(it, panel) {
      await redetect(it.ref.id);
      panel.render();
      panel.app.refreshChrome();
      toast('Detection finished', `${it.ref.label}: mock provider, nothing was sent to a console.`, 'sim');
    },
  },
  prompts: (it) => [['cross', it?.ref.id === activeConsoleId() ? 'Active' : 'Use console'], ['triangle', 'Detect again'], ['circle', 'Back'], ['updown', 'Navigate']],
};
