// Desktop installation, update, removal and recovery of VantaFlow, plus copying VantaFlow's
// PS4 package to a USB drive. Every operation:
//   1. is planned first (what happens, what is affected, backup, reversible) for the
//      confirmation screen; nothing is changed by planning;
//   2. records itself in journal.json before changing anything, so an interruption is found
//      at the next start;
//   3. backs up the installed app and the settings before replacing or removing anything;
//   4. stages new files in tmp/, verifies them, then swaps folders with renames;
//   5. verifies the result before reporting success, and rolls back on failure.
import fs from 'node:fs';
import path from 'node:path';
import { readJson, writeJsonAtomic, makeTemp, verifyTable, sha256, sha256File, newId, checkpoint, inside, MARKER } from './store.mjs';
import { readDesktopPackage, readPs4Package, compareVersions, IDENTITY } from './packages.mjs';
import { createBackup, verifyBackup, latestValid } from './backups.mjs';

const fail = (code, message, extra) => Object.assign(new Error(message), { code, ...extra });

// What is installed and whether its files are intact.
export function installState(d) {
  const record = readJson(d.installation);
  const journal = readJson(d.journal);
  const interrupted = journal?.state === 'running' ? journal : null;
  let integrity = null;
  if (record) {
    const problems = fs.existsSync(d.app) ? verifyTable(d.app, record.files ?? []) : [{ path: '(app folder)', problem: 'missing' }];
    integrity = { ok: problems.length === 0, problems };
  } else if (fs.existsSync(d.app)) {
    integrity = { ok: false, problems: [{ path: '(installation record)', problem: 'missing: the app folder exists but VantaFlow has no record of what was installed' }] };
  }
  return { installed: record ? { version: record.version, installedAt: record.installedAt, files: record.files.length } : null, integrity, interrupted, lastOperation: journal };
}

function journal(d, entry) {
  writeJsonAtomic(d.journal, { ...entry, updatedAt: new Date().toISOString() });
  return entry;
}

function busy(d) {
  const j = readJson(d.journal);
  if (j?.state === 'running') throw fail('interrupted-operation', `An earlier operation (${j.title}) did not finish. Open Recovery first.`);
}

// ------------------------------------------------------------------ desktop install / update

export function planInstall(d, file) {
  const pkg = readDesktopPackage(file);
  const state = installState(d);
  const current = state.installed?.version ?? null;
  const plan = {
    kind: 'desktop', file: path.basename(file), package: pkg.manifest, packageOk: pkg.ok, errors: pkg.errors, warnings: pkg.warnings,
    target: d.app, current, action: null, blocked: null, destructive: false,
    requirements: [`Node.js ${IDENTITY.desktop.minNodeMajor} or later (this computer: ${process.version})`, `About ${Math.ceil((pkg.totalSize ?? 0) / 1024)} KB of disk space`],
  };
  if (!pkg.ok) { plan.blocked = pkg.errors[0]; return plan; }
  if (state.interrupted) { plan.blocked = `An earlier operation (${state.interrupted.title}) did not finish. Open Recovery first.`; return plan; }
  const cmp = current ? compareVersions(pkg.manifest.version, current) : 1;
  const damaged = state.integrity && !state.integrity.ok;
  plan.action = !current ? 'install' : cmp > 0 ? 'update' : cmp < 0 ? 'downgrade' : damaged ? 'repair' : 'same-version';
  if (plan.action === 'same-version') plan.blocked = `VantaFlow ${current} is already installed and its files are intact. Nothing to do.`;
  const oldTable = readJson(d.installation)?.files ?? [];
  const oldPaths = new Map(oldTable.map((f) => [f.path, f.sha256]));
  const newPaths = new Set(pkg.files.map((f) => f.path));
  plan.changes = {
    add: pkg.files.filter((f) => !oldPaths.has(f.path)).map((f) => f.path),
    replace: pkg.files.filter((f) => oldPaths.has(f.path) && oldPaths.get(f.path) !== f.sha256).map((f) => f.path),
    remove: oldTable.filter((f) => !newPaths.has(f.path)).map((f) => f.path),
    unchanged: pkg.files.filter((f) => oldPaths.get(f.path) === f.sha256).length,
  };
  plan.backup = current ? 'Yes: the installed app files and your settings are backed up first.' : 'Your settings are backed up first. No app is installed yet.';
  plan.data = 'Your settings, console profiles, appearance and custom backgrounds are not changed. They stay in this browser and are also copied into the backup.';
  plan.reversible = current ? `Yes: the previous version (${current}) can be restored from the backup.` : 'Yes: the installation can be removed; your settings are not touched.';
  plan.summary = {
    install: `Install VantaFlow ${pkg.manifest.version} into ${d.app}.`,
    update: `Update VantaFlow from ${current} to ${pkg.manifest.version}.`,
    downgrade: `Replace VantaFlow ${current} with the OLDER version ${pkg.manifest.version}.`,
    repair: `Repair VantaFlow ${current}: reinstall its files (some are missing or changed).`,
  }[plan.action] ?? null;
  plan.destructive = plan.action === 'downgrade';
  return plan;
}

export function install(d, file, { settings = null, confirmed = false, onProgress = () => {} } = {}) {
  if (!confirmed) throw fail('not-confirmed', 'Installation needs the user\'s confirmation.');
  const plan = planInstall(d, file);
  if (plan.blocked) throw fail('blocked', plan.blocked);
  busy(d);
  const steps = ['Checking the package', 'Backing up', 'Writing the new files', 'Checking the new files', 'Replacing the app', 'Checking the installed app'];
  const progress = (i) => onProgress({ step: i, of: steps.length, label: steps[i] });
  const opId = newId('install');
  const title = `${plan.summary}`;
  const j = journal(d, { opId, type: 'install', title, state: 'running', step: 'start', from: plan.current, to: plan.package.version, backupId: null, stage: null, old: null, startedAt: new Date().toISOString() });
  let swapped = false;
  try {
    progress(0);
    const pkg = readDesktopPackage(file); // read again: the file may have changed since planning
    if (!pkg.ok) throw fail('package-invalid', pkg.errors[0]);
    checkpoint('verify-package');

    progress(1);
    if (settings || plan.current) {
      const b = createBackup(d, { settings, includeApp: Boolean(plan.current), description: `Before ${plan.action === 'install' ? 'installing' : plan.action === 'update' ? 'updating to' : 'replacing with'} VantaFlow ${pkg.manifest.version}`, reason: `before-${plan.action}`, appVersion: plan.current });
      j.backupId = b.id;
    }
    journal(d, { ...j, step: 'backup' });
    checkpoint('backup');

    progress(2);
    j.stage = makeTemp(d, 'stage', opId);
    const stagedApp = path.join(j.stage, 'app');
    for (const f of pkg.files) {
      const target = path.join(stagedApp, f.path);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, f.data);
    }
    journal(d, { ...j, step: 'stage' });
    checkpoint('stage');

    progress(3);
    const table = pkg.files.map(({ path: p, size, sha256: h }) => ({ path: p, size, sha256: h }));
    const stagedProblems = verifyTable(stagedApp, table);
    if (stagedProblems.length) throw fail('stage-unverified', `The new files did not verify: ${stagedProblems[0].path} ${stagedProblems[0].problem}.`);

    progress(4);
    if (fs.existsSync(d.app)) {
      j.old = makeTemp(d, 'previous', opId);
      journal(d, { ...j, step: 'swap-old' });
      fs.renameSync(d.app, path.join(j.old, 'app'));
      checkpoint('swap-old');
    }
    fs.renameSync(stagedApp, d.app);
    swapped = true;
    journal(d, { ...j, step: 'swap-new' });
    checkpoint('swap-new');
    writeJsonAtomic(d.installation, { id: pkg.manifest.id, version: pkg.manifest.version, installedAt: new Date().toISOString(), opId, files: table });
    journal(d, { ...j, step: 'record' });
    checkpoint('record');

    progress(5);
    const problems = verifyTable(d.app, table);
    if (problems.length) throw fail('install-unverified', `The installed app did not verify: ${problems[0].path} ${problems[0].problem}.`);
    for (const dir of [j.stage, j.old]) if (dir) fs.rmSync(dir, { recursive: true, force: true });
    journal(d, { ...j, step: 'done', state: 'done', finishedAt: new Date().toISOString(), result: `VantaFlow ${pkg.manifest.version} installed and verified (${table.length} files).` });
    return { ok: true, version: pkg.manifest.version, files: table.length, backupId: j.backupId, message: `VantaFlow ${pkg.manifest.version} is installed and every file verified.${plan.current ? ' Restart VantaFlow to use the new version.' : ''}` };
  } catch (e) {
    const rollback = rollBackInstall(d, j, swapped);
    journal(d, { ...j, state: 'failed', finishedAt: new Date().toISOString(), error: e.message, rollback });
    throw fail(e.code ?? 'install-failed', `${e.message} ${rollback}`, { rollback });
  }
}

// Puts the previous app back after a failed install, and says what happened.
function rollBackInstall(d, j, swapped) {
  try {
    const oldApp = j.old && path.join(j.old, 'app');
    if (oldApp && fs.existsSync(oldApp)) {
      if (fs.existsSync(d.app)) fs.renameSync(d.app, path.join(makeTemp(d, 'failed', j.opId), 'app'));
      fs.renameSync(oldApp, d.app);
      if (j.backupId) {
        const prev = readJson(path.join(d.backups, j.backupId, 'manifest.json'));
        if (prev?.appVersion) restoreRecordFromBackup(d, j.backupId);
      }
    } else if (swapped && !j.from) {
      // First installation that failed after the swap: take the unverified files out of use.
      fs.renameSync(d.app, path.join(makeTemp(d, 'failed', j.opId), 'app'));
      fs.rmSync(d.installation, { force: true });
    }
    if (j.stage) fs.rmSync(j.stage, { recursive: true, force: true });
    const state = installState(d);
    if (!state.installed) return 'Nothing was installed; your settings were not changed.';
    return state.integrity.ok ? `The previous version (${state.installed.version}) is in place and verified.` : 'The previous version could not be fully restored. Open Recovery.';
  } catch (e) {
    return `Rolling back also failed (${e.message}). Open Recovery.`;
  }
}

function restoreRecordFromBackup(d, backupId) {
  const m = readJson(path.join(d.backups, backupId, 'manifest.json'));
  const files = m.files.filter((f) => f.path.startsWith('app/')).map((f) => ({ ...f, path: f.path.slice(4) }));
  writeJsonAtomic(d.installation, { id: IDENTITY.desktop.id, version: m.appVersion, installedAt: m.createdAt, restoredFrom: backupId, files });
}

// ------------------------------------------------------------------ removal

export function planRemove(d) {
  const state = installState(d);
  if (!state.installed && !fs.existsSync(d.app)) return { blocked: 'VantaFlow is not installed in this location.' };
  return {
    kind: 'remove', action: 'remove', destructive: true, current: state.installed?.version ?? null, target: d.app,
    summary: `Remove VantaFlow ${state.installed?.version ?? '(unrecorded version)'} from ${d.app}.`,
    affects: [`${d.app} (${state.installed?.files ?? '?'} app files)`, d.installation],
    data: 'Your settings, profiles and backgrounds are not removed; they stay in this browser. Backups and the packages folder are kept.',
    backup: 'Yes: the app files and your settings are backed up first.',
    reversible: 'Yes: restore the backup made before removal.',
  };
}

export function remove(d, { settings = null, confirmed = false } = {}) {
  if (!confirmed) throw fail('not-confirmed', 'Removal needs the user\'s confirmation.');
  const plan = planRemove(d);
  if (plan.blocked) throw fail('blocked', plan.blocked);
  busy(d);
  const opId = newId('remove');
  const j = journal(d, { opId, type: 'remove', title: plan.summary, state: 'running', step: 'start', from: plan.current, startedAt: new Date().toISOString() });
  const b = createBackup(d, { settings, includeApp: true, description: `Before removing VantaFlow ${plan.current ?? ''}`.trim(), reason: 'before-remove', appVersion: plan.current });
  journal(d, { ...j, backupId: b.id, step: 'backup' });
  const out = makeTemp(d, 'removed', opId);
  fs.renameSync(d.app, path.join(out, 'app'));
  fs.rmSync(d.installation, { force: true });
  fs.rmSync(out, { recursive: true, force: true });
  if (fs.existsSync(d.app)) throw fail('remove-unverified', 'The app folder is still there.');
  journal(d, { ...j, backupId: b.id, state: 'done', step: 'done', finishedAt: new Date().toISOString(), result: 'Removed and verified.' });
  return { ok: true, backupId: b.id, message: `VantaFlow was removed. Backup ${b.id} can restore it.` };
}

// ------------------------------------------------------------------ restore app files from a backup

export function planRestoreApp(d, backupId) {
  const check = verifyBackup(d, backupId);
  if (!check.ok) return { blocked: `This backup cannot be restored: ${check.problems[0]}` };
  if (!check.manifest.contains?.app) return { blocked: 'This backup contains settings only, no app files.' };
  const state = installState(d);
  return {
    kind: 'restore-app', action: 'restore', destructive: Boolean(state.installed), current: state.installed?.version ?? null, target: d.app,
    summary: `Restore VantaFlow ${check.manifest.appVersion ?? ''} from the backup of ${check.manifest.createdAt}.`.replace('  ', ' '),
    affects: [`${d.app}`, d.installation],
    data: 'Only app files are replaced. Your settings are not changed (restore them separately if you want to).',
    backup: state.installed ? 'Yes: the currently installed files are backed up first.' : 'No app is installed, so there is nothing to back up.',
    reversible: state.installed ? 'Yes: from the backup made first.' : 'Yes: the app can be removed again.',
  };
}

export function restoreApp(d, backupId, { confirmed = false, onProgress = () => {}, skipBusyCheck = false } = {}) {
  if (!confirmed) throw fail('not-confirmed', 'Restoring needs the user\'s confirmation.');
  const plan = planRestoreApp(d, backupId);
  if (plan.blocked) throw fail('blocked', plan.blocked);
  if (!skipBusyCheck) busy(d);
  const opId = newId('restore');
  const j = journal(d, { opId, type: 'restore-app', title: plan.summary, state: 'running', step: 'start', backupId, startedAt: new Date().toISOString() });
  const stage = makeTemp(d, 'stage', opId);
  const old = makeTemp(d, 'previous', opId);
  journal(d, { ...j, stage, old, step: 'stage' });
  let swapped = false;
  try {
    onProgress({ step: 0, of: 3, label: 'Backing up the current files' });
    let safety = null;
    if (plan.current && installState(d).integrity?.ok) safety = createBackup(d, { includeApp: true, description: `Before restoring backup ${backupId}`, reason: 'before-restore', appVersion: plan.current }).id;
    onProgress({ step: 1, of: 3, label: 'Copying the backed-up files' });
    const m = readJson(path.join(d.backups, backupId, 'manifest.json'));
    const files = m.files.filter((f) => f.path.startsWith('app/'));
    for (const f of files) {
      const target = path.join(stage, f.path);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.join(d.backups, backupId, f.path), target);
    }
    const table = files.map((f) => ({ ...f, path: f.path.slice(4) }));
    if (verifyTable(path.join(stage, 'app'), table).length) throw fail('stage-unverified', 'The copied files did not verify. Nothing was replaced.');
    checkpoint('restore-stage');
    onProgress({ step: 2, of: 3, label: 'Replacing the app' });
    if (fs.existsSync(d.app)) fs.renameSync(d.app, path.join(old, 'app'));
    fs.renameSync(path.join(stage, 'app'), d.app);
    swapped = true;
    restoreRecordFromBackup(d, backupId);
    const problems = verifyTable(d.app, table);
    if (problems.length) throw fail('restore-unverified', `The restored app did not verify: ${problems[0].path} ${problems[0].problem}.`);
    for (const dir of [stage, old]) fs.rmSync(dir, { recursive: true, force: true });
    journal(d, { ...j, state: 'done', step: 'done', safetyBackupId: safety, finishedAt: new Date().toISOString(), result: `Restored VantaFlow ${m.appVersion} and verified ${table.length} files.` });
    return { ok: true, version: m.appVersion, files: table.length, safetyBackupId: safety, message: `VantaFlow ${m.appVersion} was restored from the backup and every file verified.` };
  } catch (e) {
    let rollback = 'Nothing was replaced.';
    if (swapped && fs.existsSync(path.join(old, 'app'))) {
      fs.renameSync(d.app, path.join(makeTemp(d, 'failed', opId), 'app'));
      fs.renameSync(path.join(old, 'app'), d.app);
      rollback = 'The previous files were put back.';
    }
    fs.rmSync(stage, { recursive: true, force: true });
    journal(d, { ...j, state: 'failed', finishedAt: new Date().toISOString(), error: e.message, rollback });
    throw fail(e.code ?? 'restore-failed', `${e.message} ${rollback}`);
  }
}

// ------------------------------------------------------------------ recovery

// What went wrong, and what can be done. Nothing is changed here.
export function diagnose(d) {
  const state = installState(d);
  const issues = [];
  const options = [];
  const j = state.interrupted;
  if (j) {
    issues.push(`Interrupted: ${j.title} (stopped at step "${j.step}", started ${j.startedAt}).`);
    if (j.type === 'ps4-copy') {
      options.push({ id: 'ps4-remove-partial', label: 'Remove the unfinished copy from the USB drive', detail: `Deletes only ${j.partial}, which VantaFlow was writing. The USB drive's other files are not touched.`, destructive: false });
    } else {
      const oldApp = j.old && path.join(j.old, 'app');
      if (oldApp && fs.existsSync(oldApp)) options.push({ id: 'rollback', label: `Put the previous version (${j.from}) back`, detail: 'Moves the previous app files, kept during the update, back into place and checks them.' });
      const backup = (j.backupId && verifyBackup(d, j.backupId).ok && j.backupId) || latestValid(d, { withApp: true })?.id;
      if (backup) options.push({ id: 'restore-backup', backupId: backup, label: 'Restore the most recent valid backup', detail: `Restores the app files from backup ${backup} and checks them. Settings are not changed.` });
      if (state.integrity?.ok) options.push({ id: 'keep', label: `Keep what is installed (VantaFlow ${state.installed.version}, verified)`, detail: 'The installed files are intact; only the interrupted record is closed.' });
      if (!j.from && fs.existsSync(d.app) && !state.integrity?.ok) options.push({ id: 'remove-partial', label: 'Remove the incomplete installation', detail: 'Takes the unfinished app files out of use. Settings, backups and packages are not touched.', destructive: true });
    }
  } else if (state.integrity && !state.integrity.ok) {
    issues.push(`Installed app files are missing or changed: ${state.integrity.problems.slice(0, 3).map((p) => `${p.path} (${p.problem})`).join('; ')}${state.integrity.problems.length > 3 ? ` and ${state.integrity.problems.length - 3} more` : ''}.`);
    const backup = latestValid(d, { withApp: true });
    if (backup) options.push({ id: 'restore-backup', backupId: backup.id, label: 'Restore the most recent valid backup', detail: `Restores the app files from backup ${backup.id} (${backup.appVersion}). Settings are not changed.` });
    options.push({ id: 'reinstall', label: 'Repair from a package', detail: `Put a VantaFlow ${state.installed?.version ?? ''} package in ${d.packages} and install it; VantaFlow offers "Repair".` });
  }
  return { ok: issues.length === 0, state, issues, options, message: issues.length ? null : state.installed ? `VantaFlow ${state.installed.version} is installed and every file verified. No recovery needed.` : 'Nothing is installed and nothing was interrupted.' };
}

export function recover(d, optionId, { confirmed = false } = {}) {
  if (!confirmed) throw fail('not-confirmed', 'Recovery needs the user\'s confirmation.');
  const diag = diagnose(d);
  const option = diag.options.find((o) => o.id === optionId);
  if (!option) throw fail('not-offered', 'That recovery option is not available now.');
  const j = diag.state.interrupted;
  const close = (result) => j && journal(d, { ...j, state: 'recovered', recovery: optionId, finishedAt: new Date().toISOString(), result });
  switch (optionId) {
    case 'rollback': {
      const oldApp = path.join(j.old, 'app');
      if (fs.existsSync(d.app)) fs.renameSync(d.app, path.join(makeTemp(d, 'failed', j.opId), 'app'));
      fs.renameSync(oldApp, d.app);
      if (j.backupId && verifyBackup(d, j.backupId).ok) restoreRecordFromBackup(d, j.backupId);
      break;
    }
    case 'restore-backup':
      if (j) journal(d, { ...j, state: 'recovering' });
      restoreApp(d, option.backupId, { confirmed: true, skipBusyCheck: true });
      break;
    case 'keep':
      break;
    case 'remove-partial':
      fs.renameSync(d.app, path.join(makeTemp(d, 'failed', j.opId), 'app'));
      fs.rmSync(d.installation, { force: true });
      break;
    case 'ps4-remove-partial':
      if (j.partial && fs.existsSync(j.partial) && j.partial.endsWith('.vantaflow-partial')) fs.rmSync(j.partial);
      break;
    default:
      throw fail('not-offered', 'That option needs a package: see the instructions.');
  }
  // Report success only when the result checks out.
  const after = diagnose(d);
  const state = after.state;
  const verified = optionId === 'ps4-remove-partial' ? !fs.existsSync(j.partial)
    : optionId === 'remove-partial' ? !fs.existsSync(d.app)
      : Boolean(state.installed && state.integrity?.ok);
  if (!verified) throw fail('recovery-unverified', `Recovery did not produce a verified result. ${after.issues[0] ?? ''}`.trim());
  const message = optionId === 'ps4-remove-partial' ? 'The unfinished copy was removed from the USB drive.'
    : optionId === 'remove-partial' ? 'The incomplete installation was taken out of use. Settings, backups and packages were not touched.'
      : `VantaFlow ${state.installed.version} is in place and every file verified.`;
  close(message);
  return { ok: true, message };
}

// ------------------------------------------------------------------ PS4: copy the package to a USB drive

export function planPs4Copy(d, file, targetDir) {
  const pkg = readPs4Package(file);
  const plan = { kind: 'ps4', file: path.basename(file), package: pkg.header, packageOk: pkg.ok, errors: pkg.errors, warnings: pkg.warnings, target: targetDir, blocked: null, destructive: false };
  plan.requirements = [
    'A PS4 with GoldHEN running (its Debug Settings provide the Package Installer).',
    'A USB drive formatted FAT32 or exFAT; the package goes to the top folder of the drive.',
    `Free space needed on the drive: ${Math.ceil(fs.existsSync(file) ? fs.statSync(file).size / 1024 : 0)} KB.`,
  ];
  if (!pkg.ok) { plan.blocked = pkg.errors[0]; return plan; }
  if (!IDENTITY.ps4.exists) plan.warnings.push(IDENTITY.ps4.existsNote);
  const busyJ = readJson(d.journal);
  if (busyJ?.state === 'running') { plan.blocked = `An earlier operation (${busyJ.title}) did not finish. Open Recovery first.`; return plan; }
  if (!targetDir || !path.isAbsolute(targetDir)) { plan.blocked = 'Choose the USB drive\'s folder as a full path (e.g. E:\\ or /media/you/USB).'; return plan; }
  if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) { plan.blocked = 'That folder does not exist. Is the USB drive connected?'; return plan; }
  if (inside(d.root, targetDir)) { plan.blocked = 'Choose the USB drive, not a folder inside VantaFlow\'s own data.'; return plan; }
  try { fs.accessSync(targetDir, fs.constants.W_OK); } catch { plan.blocked = 'VantaFlow cannot write to that folder (read-only drive or no permission).'; return plan; }
  const size = fs.statSync(file).size;
  try {
    const s = fs.statfsSync(targetDir);
    if (s.bavail * s.bsize < size) { plan.blocked = 'Not enough free space on the drive.'; return plan; }
  } catch { plan.warnings.push('Free space could not be checked.'); }
  const name = path.basename(file);
  const existing = path.join(targetDir, name);
  plan.targetName = name;
  if (fs.existsSync(existing)) {
    if (sha256File(existing) === sha256File(file)) { plan.blocked = `This exact package is already on the drive (${name}). Nothing to copy.`; plan.alreadyThere = true; return plan; }
    let n = 2;
    while (fs.existsSync(path.join(targetDir, name.replace(/\.pkg$/i, ` (${n}).pkg`)))) n++;
    plan.targetName = name.replace(/\.pkg$/i, ` (${n}).pkg`);
    plan.warnings.push(`A different file named ${name} is already on the drive. It is kept; the package is copied as "${plan.targetName}".`);
  }
  plan.summary = `Copy ${plan.package.contentId} to ${path.join(targetDir, plan.targetName)}.`;
  plan.affects = [path.join(targetDir, plan.targetName)];
  plan.data = 'Nothing on the PS4 is changed by VantaFlow. No existing file on the drive is changed.';
  plan.backup = 'Not needed: VantaFlow only adds one file to the drive.';
  plan.reversible = 'Yes: delete the copied file from the drive.';
  plan.after = 'On the PS4 (GoldHEN running): Settings → Debug Settings → Game → Package Installer → choose the package. VantaFlow cannot see or verify the installation on the console.';
  return plan;
}

export async function copyPs4Package(d, file, targetDir, { confirmed = false, onProgress = () => {} } = {}) {
  if (!confirmed) throw fail('not-confirmed', 'Copying needs the user\'s confirmation.');
  const plan = planPs4Copy(d, file, targetDir);
  if (plan.blocked) throw fail('blocked', plan.blocked);
  const final = path.join(targetDir, plan.targetName);
  const partial = `${final}.vantaflow-partial`;
  const opId = newId('ps4copy');
  const j = journal(d, { opId, type: 'ps4-copy', title: `Copy the PS4 package to ${targetDir}`, state: 'running', step: 'copy', partial, final, startedAt: new Date().toISOString() });
  try {
    const expected = sha256File(file);
    const total = fs.statSync(file).size;
    await new Promise((resolve, reject) => {
      let done = 0;
      const rs = fs.createReadStream(file);
      const ws = fs.createWriteStream(partial, { flags: 'wx' }); // never overwrites
      rs.on('data', (c) => { done += c.length; onProgress({ step: 0, of: 2, label: 'Copying', fraction: done / total }); });
      rs.on('error', reject);
      ws.on('error', reject);
      ws.on('finish', resolve);
      rs.pipe(ws);
    });
    checkpoint('ps4-copied');
    onProgress({ step: 1, of: 2, label: 'Checking the copy' });
    if (sha256File(partial) !== expected) throw fail('copy-unverified', 'The copy on the drive does not match the package (checksum).');
    if (fs.existsSync(final)) throw fail('target-exists', 'A file with that name appeared on the drive meanwhile; nothing was replaced.');
    fs.renameSync(partial, final);
    if (sha256File(final) !== expected) throw fail('copy-unverified', 'The file on the drive does not match the package after renaming.');
    journal(d, { ...j, state: 'done', step: 'done', finishedAt: new Date().toISOString(), result: `Copied and verified: ${final}` });
    return { ok: true, path: final, message: `The package is on the drive and verified (${plan.targetName}). It is NOT installed yet: ${plan.after}` };
  } catch (e) {
    if (fs.existsSync(partial)) fs.rmSync(partial); // only the file VantaFlow was writing
    journal(d, { ...j, state: 'failed', finishedAt: new Date().toISOString(), error: e.message });
    throw fail(e.code ?? 'copy-failed', `${e.message} The unfinished copy was removed; nothing else on the drive was touched.`);
  }
}

export { MARKER, sha256 };
