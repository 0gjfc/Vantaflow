// Install & Recovery (desktop), opened from Settings → System. Installs or updates VantaFlow
// from a package, copies VantaFlow's PS4 package to a USB drive, backs up and restores
// settings and app files, recovers interrupted operations and cleans up temporary files.
// Every change goes through a confirmation sheet first, runs in the desktop agent with progress,
// and is reported only after the agent verified the result. See docs/installation.md.
import { agentAvailable } from '../platform/index.js';
import { snapshot, replaceAll } from '../core/store.js';
import { setupState, plan, run, backupKeys } from '../core/setup-client.js';
import { esc, kv, toast, confirmSheet, progressDialog, infoDialog, choiceDialog, textDialog } from '../ui/ui.js';

let state = null;
let loading = null;
// Called when the page is opened, so it always shows the current state of the files.
export const forgetSetupState = () => { state = null; };
let installPlans = {};
const NO_AGENT = 'Needs the VantaFlow desktop agent. Start VantaFlow with: node desktop/server.mjs';
const when = (iso) => (iso ? new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const kb = (n) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const chip = (cls, text) => `<span class="status-chip s-${cls}">${esc(text)}</span>`;

async function refresh(panel) {
  if (!agentAvailable()) return;
  loading ??= (async () => {
    try {
      state = await setupState();
      installPlans = {};
      for (const p of state.packages.filter((x) => x.kind === 'desktop' && x.ok)) installPlans[p.name] = await plan('install', { package: p.name });
    } catch (e) {
      state = { error: e.message };
    }
  })();
  await loading;
  loading = null;
  panel?.render();
}

// Confirm → run with progress → verified result. Returns the finished operation, or null.
async function perform({ sheet, op, args, progressTitle }) {
  if (!await confirmSheet(sheet)) { toast('Cancelled', 'Nothing was changed.', 'info'); return null; }
  const progress = progressDialog(progressTitle);
  let entry;
  try {
    entry = await run(op, args, (p) => progress.update(p));
  } catch (e) {
    entry = { state: 'failed', error: { message: e.message } };
  }
  progress.close();
  if (entry.state === 'done') await infoDialog({ title: 'Done', message: entry.result.message ?? 'Finished and verified.', kind: 'success' });
  else await infoDialog({ title: 'It did not work', message: entry.error?.message ?? 'The operation failed.', kind: 'warn' });
  return entry;
}

const planRows = (p, extra = []) => [
  ...extra,
  ['Your data', p.data],
  ['Backup', p.backup],
  ['Can be undone', p.reversible],
];

// ------------------------------------------------------------------ actions

async function installDesktop(pkg, panel) {
  const p = await plan('install', { package: pkg.name }); // checked again now: the file may have changed
  if (p.blocked) { await infoDialog({ title: 'Cannot install', message: p.blocked, lines: p.errors?.slice(1) ?? [], kind: p.action === 'same-version' ? 'info' : 'warn' }); return; }
  const c = p.changes;
  await perform({
    progressTitle: `${p.action === 'update' ? 'Updating' : 'Installing'} VantaFlow ${p.package.version}`,
    op: 'install', args: { package: pkg.name, settings: snapshot() },
    sheet: {
      title: { install: 'Install VantaFlow', update: 'Update VantaFlow', downgrade: 'Replace with an older version', repair: 'Repair VantaFlow' }[p.action],
      summary: p.summary, confirm: { install: 'Install', update: 'Update', downgrade: 'Replace', repair: 'Repair' }[p.action], destructive: p.destructive,
      warnings: [...(p.action === 'downgrade' ? [`${p.package.version} is older than the installed ${p.current}.`] : []), ...p.warnings],
      rows: planRows(p, [
        ['Package', `${p.package.name} ${p.package.version} (${p.file}) — checked: every file's checksum matches`],
        ['Platform', 'Desktop (this computer)'],
        ['Requirements', p.requirements],
        ['Install folder', p.target],
        ['What happens', `${c.add.length} files added, ${c.replace.length} replaced, ${c.remove.length} removed, ${c.unchanged} unchanged.`],
        ['Files affected', [...c.add.map((f) => `+ ${f}`), ...c.replace.map((f) => `~ ${f}`), ...c.remove.map((f) => `− ${f}`)]],
      ]),
    },
  });
  await refresh(panel);
}

async function copyPs4(pkg, panel) {
  const target = await textDialog({ title: 'USB drive for the PS4 package', maxLength: 260, hint: 'The USB drive\'s folder as a full path, e.g. E:\\ (Windows), /Volumes/USB (macOS) or /media/you/USB (Linux). The package is copied to the top of the drive; nothing on the drive is replaced.' });
  if (!target) return;
  const p = await plan('ps4-copy', { package: pkg.name, target });
  if (p.blocked) { await infoDialog({ title: p.alreadyThere ? 'Already on the drive' : 'Cannot copy', message: p.blocked, kind: p.alreadyThere ? 'info' : 'warn' }); return; }
  await perform({
    progressTitle: 'Copying the PS4 package', op: 'ps4-copy', args: { package: pkg.name, target },
    sheet: {
      title: 'Copy VantaFlow to a USB drive for the PS4', summary: p.summary, confirm: 'Copy', tagKind: 'sim', warnings: p.warnings,
      rows: planRows(p, [
        ['Package', `${p.package.contentId} (title ${p.package.titleId}, ${p.package.contentTypeName}, ${kb(p.package.fileSize)}) — header checked`],
        ['Platform', 'PS4 with GoldHEN'],
        ['Prerequisites', p.requirements],
        ['Files affected', p.affects],
        ['After copying', p.after],
      ]),
    },
  });
  await refresh(panel);
}

async function removeDesktop(panel) {
  const p = await plan('remove');
  if (p.blocked) { await infoDialog({ title: 'Nothing to remove', message: p.blocked }); return; }
  await perform({
    progressTitle: 'Removing VantaFlow', op: 'remove', args: { settings: snapshot() },
    sheet: { title: 'Remove VantaFlow from this computer', summary: p.summary, confirm: 'Remove', destructive: true, rows: planRows(p, [['Files affected', p.affects]]) },
  });
  await refresh(panel);
}

async function backupNow(panel) {
  const keys = snapshot();
  await perform({
    progressTitle: 'Backing up', op: 'backup', args: { settings: keys, description: 'Backup of settings (made by you)' },
    sheet: {
      title: 'Back up your settings', confirm: 'Back up',
      summary: `Copies your ${Object.keys(keys).length} VantaFlow settings entries into a new backup in ${state.paths.backups}.`,
      rows: [
        ['Affected', 'Nothing is changed. Copied: both console profiles, account, appearance, custom backgrounds, favourites, saved consoles.'],
        ['Your data', 'Not changed.'],
        ['Backup', 'This creates one. Earlier backups are kept.'],
        ['Can be undone', 'Nothing to undo; the backup can be deleted later.'],
      ],
    },
  });
  await refresh(panel);
}

async function restoreSettings(b, panel) {
  let keys;
  try { keys = await backupKeys(b.id); } catch (e) { await infoDialog({ title: 'This backup cannot be restored', message: e.message, lines: e.problems ?? [], kind: 'warn' }); return; }
  const groups = [...new Set(Object.keys(keys).map((k) => k.slice('vantaflow.'.length).split('.')[0]))];
  if (!await confirmSheet({
    title: 'Restore settings', destructive: true, confirm: 'Restore',
    summary: `Replace your current VantaFlow settings with the ones saved ${when(b.createdAt)} (${b.description}). The backup was checked: every file's checksum matches.`,
    rows: [
      ['Affected', `${Object.keys(keys).length} ${Object.keys(keys).length === 1 ? 'entry' : 'entries'}: ${groups.join(', ')}`],
      ['Your data', 'Your current settings in this browser are replaced.'],
      ['Backup', 'Yes: your current settings are backed up first.'],
      ['Can be undone', 'Yes: restore the backup made first.'],
    ],
  })) { toast('Cancelled', 'Nothing was changed.', 'info'); return; }
  const progress = progressDialog('Restoring settings');
  progress.update({ step: 0, of: 2, label: 'Backing up your current settings' });
  const safety = await run('backup', { settings: snapshot(), description: `Before restoring settings from ${when(b.createdAt)}`, reason: 'before-restore' }).catch((e) => ({ state: 'failed', error: { message: e.message } }));
  if (safety.state !== 'done') { progress.close(); await infoDialog({ title: 'Not restored', message: `Your current settings could not be backed up, so nothing was changed. ${safety.error?.message ?? ''}`, kind: 'warn' }); return; }
  progress.update({ step: 1, of: 2, label: 'Writing and checking the restored settings' });
  const ok = replaceAll(keys);
  progress.close();
  if (!ok) { await infoDialog({ title: 'Not restored', message: 'The browser did not store the settings exactly (storage full or blocked). Your previous settings were put back.', kind: 'warn' }); return; }
  await infoDialog({ title: 'Settings restored', message: 'Every entry was written and read back unchanged. VantaFlow reloads now to use them.', kind: 'success' });
  location.reload();
}

async function restoreApp(b, panel) {
  const p = await plan('restore-app', { backupId: b.id });
  if (p.blocked) { await infoDialog({ title: 'Cannot restore', message: p.blocked, kind: 'warn' }); return; }
  await perform({ progressTitle: 'Restoring app files', op: 'restore-app', args: { backupId: b.id }, sheet: { title: 'Restore app files', summary: p.summary, confirm: 'Restore', destructive: p.destructive, rows: planRows(p, [['Files affected', p.affects]]) } });
  await refresh(panel);
}

async function deleteBackup(b, panel) {
  await perform({
    progressTitle: 'Deleting the backup', op: 'delete-backup', args: { backupId: b.id, allowValid: b.status === 'valid' },
    sheet: {
      title: 'Delete backup', destructive: true, confirm: 'Delete',
      summary: `Delete "${b.description}" (${b.status}${b.createdAt ? `, ${when(b.createdAt)}` : ''}).`,
      rows: [['Files affected', [`${state.paths.backups}/${b.id}`]], ['Your data', 'Settings and the installed app are not changed. Other backups are kept.'], ['Backup', 'No.'], ['Can be undone', 'No.']],
    },
  });
  await refresh(panel);
}

async function backupActions(b, panel) {
  const options = b.status === 'valid'
    ? [
      ...(b.contains.settings ? [{ id: 'settings', label: 'Restore these settings', hint: 'Replaces your current settings (backed up first).' }] : []),
      ...(b.contains.app ? [{ id: 'app', label: `Restore these app files (VantaFlow ${b.appVersion})`, hint: 'Replaces the installed app (backed up first).' }] : []),
      { id: 'delete', label: 'Delete this backup', hint: 'Cannot be undone.' },
    ]
    : [{ id: 'delete', label: 'Delete this backup', hint: `It is ${b.status} and cannot be restored.` }];
  const pick = await choiceDialog({ title: b.description, message: `${b.status === 'valid' ? 'Valid' : b.status === 'damaged' ? 'Damaged' : 'Incomplete'} · ${when(b.createdAt)}`, options });
  if (pick === 'settings') await restoreSettings(b, panel);
  else if (pick === 'app') await restoreApp(b, panel);
  else if (pick === 'delete') await deleteBackup(b, panel);
}

async function recovery(panel) {
  const r = state.recovery;
  if (r.ok) { await infoDialog({ title: 'No recovery needed', message: r.message, kind: 'success' }); return; }
  if (!r.options.length) { await infoDialog({ title: 'Recovery', message: r.issues.join(' '), lines: ['No automatic option is available. See docs/installation.md.'], kind: 'warn' }); return; }
  const pick = await choiceDialog({ title: 'Recovery', message: r.issues[0], options: r.options.map((o) => ({ id: o.id, label: o.label, hint: o.detail })) });
  const o = r.options.find((x) => x.id === pick);
  if (!o) return;
  await perform({
    progressTitle: 'Recovering', op: 'recover', args: { option: o.id },
    sheet: {
      title: 'Recovery', summary: o.label, confirm: 'Recover', destructive: Boolean(o.destructive),
      rows: [
        ['What happens', o.detail],
        ['Your data', 'Settings, console profiles, backgrounds, backups and packages are not changed.'],
        ['Backup', o.id === 'restore-backup' ? 'Yes: the current app files are backed up first if they are intact.' : 'Not needed for this option.'],
        ['Can be undone', o.destructive ? 'No.' : 'Yes, from the backups.'],
        ['Result', 'Reported as successful only after the files are checked.'],
      ],
    },
  });
  await refresh(panel);
}

async function cleanup(panel) {
  const p = await plan('cleanup');
  const keepLines = p.keep.map((k) => `${k.path.split(/[\\/]/).pop() || k.path} — ${k.reason}`);
  if (!p.remove.length) { await infoDialog({ title: 'Nothing to clean up', message: 'There are no VantaFlow temporary files to remove.', lines: keepLines }); return; }
  const entry = await perform({
    progressTitle: 'Cleaning up', op: 'cleanup', args: { token: p.token },
    sheet: {
      title: 'Clean up temporary files', destructive: true, confirm: 'Clean up',
      summary: `Removes ${p.remove.length} item${p.remove.length > 1 ? 's' : ''} (${kb(p.bytes)}) that VantaFlow created and no longer needs. Only what is listed here is removed.`,
      rows: [
        ['Will be removed', p.remove.map((r) => `${r.path} (${r.purpose}, ${kb(r.size)})`)],
        ['Kept', keepLines],
        ['Your data', 'Settings, profiles, backups, packages and your own files are not touched.'],
        ['Backup', 'Not needed: only VantaFlow\'s temporary files are removed.'],
        ['Can be undone', 'No (they are not needed).'],
      ],
    },
  });
  if (entry?.state === 'done') toast('Cleanup', `Removed ${entry.result.removed.length}, kept ${entry.result.kept.length}${entry.result.failed.length ? `, ${entry.result.failed.length} could not be removed` : ''}.`, 'info');
  await refresh(panel);
}

// ------------------------------------------------------------------ rows and details

function statusRow() {
  const s = state.install;
  const r = state.recovery;
  const [cls, text] = !r.ok ? ['bad', 'Needs recovery'] : s.installed ? ['ok', `${s.installed.version} · verified`] : ['off', 'Not installed'];
  return { id: 'status', title: 'VantaFlow on this computer', sub: state.paths.app, icon: 'check', valueHTML: chip(cls, text) };
}

function packageRow(p) {
  const plan = installPlans[p.name];
  const [cls, text] = !p.ok ? ['bad', 'Not installable'] : p.kind === 'ps4' ? ['warn', 'Copy to USB'] : plan?.blocked ? ['off', 'Installed'] : ['ok', { update: 'Update', downgrade: 'Older version', repair: 'Repair' }[plan?.action] ?? 'Install'];
  const what = p.kind === 'desktop' ? `Desktop package ${p.manifest?.version ?? ''}` : p.kind === 'ps4' ? `PS4 package ${p.header?.contentId ?? ''}` : p.kind === 'android' ? 'Android package' : 'Unknown file';
  return { id: `pkg:${p.name}`, pkg: p, title: p.name, sub: `${what} · ${kb(p.size)}`, icon: 'download', valueHTML: chip(cls, text) };
}

function backupRow(b) {
  const [cls, text] = { valid: ['ok', 'Valid'], damaged: ['bad', 'Damaged'], incomplete: ['warn', 'Incomplete'] }[b.status];
  const contents = [b.contains?.settings && 'settings', b.contains?.app && `app ${b.appVersion}`].filter(Boolean).join(' + ');
  return { id: `backup:${b.id}`, backup: b, title: b.description, sub: `${when(b.createdAt)}${contents ? ` · ${contents}` : ''}${b.size ? ` · ${kb(b.size)}` : ''}`, icon: 'save', valueHTML: chip(cls, text) };
}

function detail(it) {
  if (it.id === 'agent') return `<h2>Install & Recovery</h2><p>${esc(NO_AGENT)}</p><p class="note">Installing, backups, recovery and cleanup work with files on this computer, which only the local agent can do.</p>`;
  if (it.id === 'loading') return '<h2>Install & Recovery</h2><p>Checking…</p>';
  if (it.id === 'error') return `<h2>Install & Recovery</h2><p>${esc(state.error)}</p>`;
  if (it.id === 'status') {
    const s = state.install;
    return `<h2>VantaFlow on this computer</h2>${kv([
      ['Installed', s.installed ? `${s.installed.version} (${s.installed.files} files, ${when(s.installed.installedAt)})` : 'Not installed in the install folder'],
      ['Files', s.integrity ? (s.integrity.ok ? 'Every file verified (checksums match)' : `${s.integrity.problems.length} missing or changed`) : '—'],
      ['Last operation', state.install.lastOperation ? `${state.install.lastOperation.title} — ${state.install.lastOperation.state}` : 'None'],
    ])}<h3>Folders</h3><ul class="plain small">${Object.entries(state.paths).map(([k, v]) => `<li>${esc(k)}: <span class="path">${esc(v)}</span></li>`).join('')}</ul>
      <p class="note">VantaFlow writes only inside its data folder (and, for the PS4, the one package it copies to the USB drive you choose). Your settings stay in this browser.</p>`;
  }
  if (it.id === 'no-packages') return `<h2>No packages yet</h2><p>Put a VantaFlow package in the packages folder, then come back here:</p><p class="path">${esc(state.paths.packages)}</p><ul class="plain small"><li>Desktop: <b>vantaflow-&lt;version&gt;.vfpkg</b> (build one with <span class="path">node tools/build-package.mjs 0.5.0</span>)</li><li>PS4: VantaFlow's <b>.pkg</b> — none has been built yet</li><li>Android: install updates from the companion app on the phone</li></ul>`;
  if (it.pkg) {
    const p = it.pkg;
    const plan = installPlans[p.name];
    const facts = p.kind === 'desktop' && p.manifest ? [['Package', `${p.manifest.name} ${p.manifest.version}`], ['Platform', 'Desktop'], ['Requires', `Node.js ${p.manifest.requires?.node ?? '>=18'}`], ['Created', when(p.manifest.created)]]
      : p.kind === 'ps4' && p.header ? [['Content ID', p.header.contentId], ['Title ID', p.header.titleId], ['Type', p.header.contentTypeName], ['DRM', p.header.drmType], ['Size', `${kb(p.header.fileSize)}${p.header.declaredSize === p.header.fileSize ? ' (matches the header)' : ''}`], ['Console installation', 'Not verified by VantaFlow']]
        : [['Kind', p.kind]];
    return `<h2>${esc(p.name)}</h2>${kv(facts)}
      ${p.errors.length ? `<h3>Problems</h3><ul class="plain small">${p.errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>` : `<h3>Checks</h3><p class="note">${p.kind === 'desktop' ? 'Format, identity, version, Node.js requirement, safe paths, required parts and every file\'s checksum.' : 'PS4 header ("CNT"), content ID format, application type, VantaFlow identity and declared size. The package body is not opened.'}</p>`}
      ${p.warnings?.length ? `<ul class="sheet-warn">${p.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}
      ${plan ? `<p>${esc(plan.blocked ?? plan.summary)}</p>` : ''}
      ${p.ok ? `<p class="note">✕ ${p.kind === 'ps4' ? 'choose a USB drive and review the copy' : 'review what the installation will do'}. Nothing changes before you confirm.</p>` : ''}`;
  }
  if (it.id === 'remove') return '<h2>Remove VantaFlow</h2><p>Removes the installed app from this computer after backing it up. Your settings, backups and packages are kept.</p>';
  if (it.id === 'backup-now') return `<h2>Back up settings</h2><p>Saves every VantaFlow setting in this browser — both console profiles, your account, appearance, custom backgrounds, favourites and saved consoles — to a new backup.</p><p class="path">${esc(state.paths.backups)}</p><p class="note">Automatic backups are also made before every installation, update, restore, removal and reset.</p>`;
  if (it.backup) {
    const b = it.backup;
    return `<h2>${esc(b.description)}</h2>${kv([
      ['Status', b.status === 'valid' ? 'Valid — every file checked' : b.status === 'damaged' ? 'Damaged — cannot be restored' : 'Incomplete — never finished, cannot be restored'],
      ['Made', when(b.createdAt)], ['Reason', b.reason ?? '—'],
      ['Contains', [b.contains?.settings && `settings (${b.contains.settingsEntries} entries)`, b.contains?.app && `app files of VantaFlow ${b.appVersion}`].filter(Boolean).join(', ') || '—'],
      ['Size', b.size ? kb(b.size) : '—'], ['Id', b.id],
    ])}${b.problems?.length ? `<h3>Problems</h3><ul class="plain small">${b.problems.slice(0, 6).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}`;
  }
  if (it.id === 'recovery') {
    const r = state.recovery;
    return `<h2>Recovery</h2>${r.ok ? `<p>${esc(r.message)}</p>` : `<ul class="reasons">${r.issues.map((x) => `<li><span class="rdot c-unsupported"></span>${esc(x)}</li>`).join('')}</ul>
      <h3>Options</h3><ul class="plain small">${r.options.map((o) => `<li><b>${esc(o.label)}</b><em> — ${esc(o.detail)}</em></li>`).join('')}</ul>`}
      <p class="note">Recovery never erases your settings, profiles or backups, and is reported as successful only after the files are checked.</p>`;
  }
  if (it.id === 'cleanup') return `<h2>Clean up temporary files</h2><p>Removes only folders VantaFlow created in its temporary folder (each carries a VantaFlow marker) and leftovers of interrupted writes. You see the full list, and what is kept, before anything is removed.</p><p class="note">Never removed: backups, packages, the installed app, settings, your own files, anything outside VantaFlow's folders, anything whose owner is uncertain.</p>`;
  if (it.id === 'android') return '<h2>Android companion</h2><p>Updates to the Android companion are installed on the phone: open VantaFlow → Install &amp; recovery → <b>Install update from APK file</b>. The app checks the file (same app, same signature, newer version), backs up its settings, then hands it to Android, which asks you to confirm.</p><p class="note">Android asks once for permission to install apps from VantaFlow ("Install unknown apps"). Your app data is kept during updates.</p>';
  if (it.id === 'ps4') return '<h2>PS4</h2><p>VantaFlow checks its PS4 package and copies it to a USB drive. You install it on the PS4 with GoldHEN\'s Debug Settings → Package Installer.</p><p class="note">Not verified on a console: VantaFlow cannot see whether the installation on the PS4 worked. No VantaFlow PS4 package has been built yet; this workflow is tested with mock packages only.</p>';
  return '';
}

export const setupSection = {
  id: 'setup', label: 'Install & Recovery', icon: 'download', view: 'panel', kind: 'live', slot: 'settings',
  items(panel) {
    if (!agentAvailable()) return [{ id: 'agent', title: 'Desktop agent not running', sub: NO_AGENT, icon: 'warn', noAction: true }];
    if (!state && !loading) refresh(panel);
    if (!state) return [{ id: 'loading', title: 'Checking…', icon: 'restart', noAction: true }];
    if (state.error) return [{ id: 'error', title: 'Could not read the installation state', sub: state.error, icon: 'warn', noAction: true }];
    return [
      { group: 'This computer' },
      statusRow(),
      { group: 'Install' },
      ...(state.packages.length ? state.packages.map(packageRow) : [{ id: 'no-packages', title: 'No packages found', sub: state.paths.packages, icon: 'info', noAction: true }]),
      ...(state.install.installed ? [{ id: 'remove', title: 'Remove VantaFlow from this computer…', sub: 'Backed up first', icon: 'power' }] : []),
      { group: 'Backups' },
      { id: 'backup-now', title: 'Back up settings now…', sub: 'Profiles, appearance, backgrounds, favourites, saved consoles', icon: 'save' },
      ...state.backups.map(backupRow),
      { group: 'Recovery and cleanup' },
      { id: 'recovery', title: state.recovery.ok ? 'Recovery: nothing to recover' : 'Recover from an interrupted or failed installation…', sub: state.recovery.ok ? 'Installation verified' : state.recovery.issues[0], icon: 'restart', valueHTML: chip(state.recovery.ok ? 'ok' : 'bad', state.recovery.ok ? 'OK' : 'Action needed') },
      { id: 'cleanup', title: 'Clean up temporary files…', sub: 'Preview first; backups and your files are never removed', icon: 'file' },
      { group: 'Other platforms' },
      { id: 'android', title: 'Android companion', sub: 'Updates are installed on the phone', icon: 'remote', noAction: true },
      { id: 'ps4', title: 'PS4', sub: 'USB copy · not verified on a console', icon: 'console', noAction: true },
    ];
  },
  detail,
  async activate(it, panel) {
    if (it.pkg) {
      if (!it.pkg.ok) { await infoDialog({ title: 'Cannot install', message: it.pkg.errors[0], lines: it.pkg.errors.slice(1), kind: 'warn' }); return; }
      await (it.pkg.kind === 'ps4' ? copyPs4 : installDesktop)(it.pkg, panel);
    } else if (it.id === 'remove') await removeDesktop(panel);
    else if (it.id === 'backup-now') await backupNow(panel);
    else if (it.backup) await backupActions(it.backup, panel);
    else if (it.id === 'recovery') await recovery(panel);
    else if (it.id === 'cleanup') await cleanup(panel);
  },
  on: { triangle: (it, panel) => { refresh(panel); toast('Checking again', 'Packages, backups and installed files.', 'info'); } },
  back(panel) { panel.app.goto('settings'); return true; },
  prompts: (it) => [...(it?.noAction ? [] : [['cross', 'Select']]), ['triangle', 'Check again'], ['circle', 'Back'], ['updown', 'Navigate']],
};
