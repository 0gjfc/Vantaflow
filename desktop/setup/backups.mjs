// Backups of VantaFlow settings and installed app files (desktop).
//
// A backup is written to backups/.incomplete-<id>/, verified, and only then renamed to
// backups/<id>/. So a backup that exists under its own id is always complete; a half-written
// one can never replace or look like a valid one. Existing backups are never overwritten.
//
// backups/<id>/manifest.json
//   { format: "vantaflow-backup", formatVersion: 1, id, createdAt, description, reason,
//     platform: "desktop", appVersion, contains: { settings, app }, files: [{ path, size, sha256 }] }
// backups/<id>/settings.json   { format: "vantaflow-settings", keys: { "vantaflow.…": "<stored text>" } }
// backups/<id>/app/…           copy of the installed app (when it existed)
import fs from 'node:fs';
import path from 'node:path';
import { newId, writeJsonAtomic, readJson, copyTree, fileTable, verifyTable, safeRelative, checkpoint } from './store.mjs';

const INCOMPLETE = '.incomplete-';

// Settings are the browser's localStorage entries under "vantaflow.": every profile, account,
// appearance setting, custom background, favourite and saved console.
export function settingsProblems(keys) {
  if (!keys || typeof keys !== 'object' || Array.isArray(keys)) return ['The settings are not a list of entries.'];
  const problems = [];
  for (const [k, v] of Object.entries(keys)) {
    if (!k.startsWith('vantaflow.')) problems.push(`"${k}" is not a VantaFlow setting.`);
    else if (typeof v !== 'string') problems.push(`"${k}" is not stored text.`);
    else { try { JSON.parse(v); } catch { problems.push(`"${k}" is not valid stored data.`); } }
  }
  return problems;
}

export function createBackup(d, { settings = null, includeApp = false, description, reason = 'manual', appVersion = null }) {
  if (settings) {
    const problems = settingsProblems(settings);
    if (problems.length) throw Object.assign(new Error(`The settings to back up are not valid: ${problems[0]}`), { code: 'invalid-settings' });
  }
  const hasApp = includeApp && fs.existsSync(d.app);
  if (!settings && !hasApp) throw Object.assign(new Error('There is nothing to back up.'), { code: 'nothing-to-back-up' });
  const id = newId('backup');
  const work = path.join(d.backups, `${INCOMPLETE}${id}`);
  fs.mkdirSync(work, { recursive: true });
  if (settings) writeJsonAtomic(path.join(work, 'settings.json'), { format: 'vantaflow-settings', keys: settings });
  if (hasApp) copyTree(d.app, path.join(work, 'app'));
  checkpoint('backup-files');
  const manifest = {
    format: 'vantaflow-backup', formatVersion: 1, id, createdAt: new Date().toISOString(),
    description: description ?? 'Backup', reason, platform: 'desktop', appVersion,
    contains: { settings: Boolean(settings), app: hasApp, settingsEntries: settings ? Object.keys(settings).length : 0 },
    files: fileTable(work),
  };
  writeJsonAtomic(path.join(work, 'manifest.json'), manifest);
  checkpoint('backup-manifest');
  const check = verifyDir(work);
  if (!check.ok) throw Object.assign(new Error(`The new backup did not verify: ${check.problems[0]}`), { code: 'backup-unverified' });
  const final = path.join(d.backups, id);
  if (fs.existsSync(final)) throw Object.assign(new Error('A backup with this id already exists; it is not overwritten.'), { code: 'backup-exists' });
  fs.renameSync(work, final);
  return { ...manifest, status: 'valid' };
}

function verifyDir(dir) {
  const m = readJson(path.join(dir, 'manifest.json'));
  if (!m) return { ok: false, problems: ['The backup has no readable manifest.'], manifest: null };
  if (m.format !== 'vantaflow-backup' || m.formatVersion !== 1 || !Array.isArray(m.files)) return { ok: false, problems: ['The manifest is not a VantaFlow backup manifest.'], manifest: m };
  const problems = [];
  if (m.files.some((f) => !safeRelative(f.path))) problems.push('The manifest lists an unsafe path.');
  else problems.push(...verifyTable(dir, m.files).map((p) => `${p.path}: ${p.problem}`));
  if (m.contains?.settings) {
    const s = readJson(path.join(dir, 'settings.json'));
    if (s?.format !== 'vantaflow-settings') problems.push('settings.json is not readable.');
    else problems.push(...settingsProblems(s.keys));
  }
  if (m.contains?.app && !m.files.some((f) => f.path.startsWith('app/'))) problems.push('The backup says it contains the app, but no app files are listed.');
  return { ok: problems.length === 0, problems, manifest: m };
}

// Full check of one backup: manifest, every file's size and checksum, and the settings format.
export function verifyBackup(d, id) {
  if (!/^backup-[0-9a-z-]+$/.test(id ?? '')) return { ok: false, problems: ['Unknown backup.'] };
  const dir = path.join(d.backups, id);
  if (!fs.existsSync(dir)) return { ok: false, problems: ['This backup does not exist.'] };
  return verifyDir(dir);
}

// Every backup, newest first: valid, damaged (cannot be restored) or incomplete (never finished).
export function listBackups(d) {
  if (!fs.existsSync(d.backups)) return [];
  return fs.readdirSync(d.backups, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => {
    if (e.name.startsWith(INCOMPLETE)) return { id: e.name.slice(INCOMPLETE.length), status: 'incomplete', description: 'Unfinished backup (the operation that wrote it was interrupted)', problems: ['It was never completed and cannot be restored.'], createdAt: null };
    const check = verifyDir(path.join(d.backups, e.name));
    const m = check.manifest ?? {};
    return {
      id: e.name, status: check.ok ? 'valid' : 'damaged', problems: check.problems,
      description: m.description ?? '(no description)', reason: m.reason ?? null, createdAt: m.createdAt ?? null,
      appVersion: m.appVersion ?? null, contains: m.contains ?? {},
      size: (m.files ?? []).reduce((n, f) => n + (f.size || 0), 0),
    };
  }).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export const latestValid = (d, { withApp = false } = {}) => listBackups(d).find((b) => b.status === 'valid' && (!withApp || b.contains.app)) ?? null;

// The settings stored in a backup, only after the whole backup verified.
export function backupSettings(d, id) {
  const check = verifyBackup(d, id);
  if (!check.ok) throw Object.assign(new Error(`This backup cannot be restored: ${check.problems[0]}`), { code: 'backup-damaged', problems: check.problems });
  if (!check.manifest.contains?.settings) throw Object.assign(new Error('This backup contains no settings.'), { code: 'no-settings' });
  return readJson(path.join(d.backups, id, 'settings.json')).keys;
}

// Deleting is never part of ordinary cleanup; only an explicit, confirmed request removes a
// backup, and only one that is damaged or incomplete unless `allowValid` is set.
export function deleteBackup(d, id, { allowValid = false } = {}) {
  const list = listBackups(d);
  const b = list.find((x) => x.id === id);
  if (!b) throw Object.assign(new Error('Unknown backup.'), { code: 'not-found' });
  if (b.status === 'valid' && !allowValid) throw Object.assign(new Error('This backup is valid; it is not deleted without an explicit request.'), { code: 'backup-valid' });
  fs.rmSync(path.join(d.backups, b.status === 'incomplete' ? `${INCOMPLETE}${id}` : id), { recursive: true, force: true });
  return b;
}
