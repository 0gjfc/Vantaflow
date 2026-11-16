// Stage 5 tests (desktop): installation, confirmation, backups, recovery, cleanup and the PS4
// USB copy. Everything runs in temporary folders with MOCK packages: these are SIMULATED
// installations, not installations on a device or console. Interruptions are real: a child
// process is stopped in the middle of an operation (VANTAFLOW_TEST_CRASH_AT).
// Run: node tests/install.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { layout, writeJsonAtomic, MARKER, sha256File } from '../desktop/setup/store.mjs';
import { buildDesktopPackage, readDesktopPackage, readPs4Package, mockPs4Package, listPackages, IDENTITY } from '../desktop/setup/packages.mjs';
import { createBackup, verifyBackup, listBackups, backupSettings, latestValid, deleteBackup } from '../desktop/setup/backups.mjs';
import { planInstall, install, installState, planRemove, remove, planRestoreApp, restoreApp, diagnose, recover, planPs4Copy, copyPs4Package } from '../desktop/setup/installer.mjs';
import { previewCleanup, runCleanup } from '../desktop/setup/cleanup.mjs';

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks++; };
const throwsCode = (fn, code, m) => { assert.throws(fn, (e) => e.code === code, m); checks++; };
const SETUP = new URL('../desktop/setup/', import.meta.url).pathname;
process.env.VANTAFLOW_TEST = '1';

const temp = (name) => fs.mkdtempSync(path.join(os.tmpdir(), `vantaflow-${name}-`));
function fixtureApp(version) {
  const dir = temp('src');
  const files = { 'index.html': `<!doctype html><title>VantaFlow ${version}</title>`, 'js/main.js': `export const version = '${version}';`, 'desktop/server.mjs': '// server', [`assets/v${version}.txt`]: version };
  for (const [p, text] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(dir, p)), { recursive: true }); fs.writeFileSync(path.join(dir, p), text); }
  return { dir, files: Object.keys(files) };
}
function makePackage(d, version, name = `vantaflow-${version}.vfpkg`, manifest = {}) {
  const src = fixtureApp(version);
  const file = path.join(d.packages, name);
  fs.writeFileSync(file, buildDesktopPackage(src.dir, src.files, { name: 'VantaFlow', version, description: `Test ${version}`, ...manifest }));
  return file;
}
// Settings as the browser stores them: every profile, account, background and saved console.
const SETTINGS = {
  'vantaflow.profile.active': '"ps5"',
  'vantaflow.settings.ps4': JSON.stringify({ accent: '#1d86f0', animations: true }),
  'vantaflow.settings.ps5': JSON.stringify({ accent: '#8a2be2', animations: false }),
  'vantaflow.account.shared': JSON.stringify({ username: 'Tester_01', avatarColor: '#1d86f0', presence: 'online' }),
  'vantaflow.background.ps4': JSON.stringify('data:image/png;base64,iVBORw0KGgo='),
  'vantaflow.favorites.ps4': JSON.stringify(['CUSA00001']),
  'vantaflow.lan-consoles': JSON.stringify([{ id: 'lan-192.168.1.20', address: '192.168.1.20', generation: 'ps4' }]),
};
// Runs one installer call in a child process with fault injection (a real interruption).
function child(dataDir, code, env) {
  return spawnSync(process.execPath, ['--input-type=module', '-e', `
    import { layout } from '${SETUP}store.mjs';
    import * as I from '${SETUP}installer.mjs';
    const d = layout(${JSON.stringify(dataDir)});
    ${code}`], { env: { ...process.env, VANTAFLOW_TEST: '1', ...env }, encoding: 'utf8' });
}
const userFile = (p, text = 'my own file') => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); return p; };

// ------------------------------------------------------------------ package validation
{
  const d = layout(temp('pkg'));
  const good = makePackage(d, '0.5.0');
  const r = readDesktopPackage(good);
  ok(r.ok && r.manifest.version === '0.5.0' && r.files.length === 4, 'valid package reads');
  ok(!readDesktopPackage(path.join(d.packages, 'missing.vfpkg')).ok, 'missing package is reported');
  const damaged = path.join(d.packages, 'damaged.vfpkg');
  const buf = fs.readFileSync(good); buf[buf.length - 10] ^= 0xff; fs.writeFileSync(damaged, buf);
  ok(!readDesktopPackage(damaged).ok, 'damaged (compressed) package is refused');
  const other = makePackage(d, '0.5.0', 'other.vfpkg', { id: 'com.example.other' });
  ok(/VantaFlow installs only its own packages/.test(readDesktopPackage(other).errors.join()), 'another app\'s package is refused');
  const oldNode = readDesktopPackage(good, { nodeMajor: 16 });
  ok(!oldNode.ok && /Node\.js 18/.test(oldNode.errors.join()), 'Node.js requirement is checked');
  const zlib = await import('node:zlib');
  const raw = JSON.parse(zlib.gunzipSync(fs.readFileSync(good)));
  raw.files[0].path = '../escape.txt';
  fs.writeFileSync(path.join(d.packages, 'unsafe.vfpkg'), zlib.gzipSync(JSON.stringify(raw)));
  ok(/Unsafe file path/.test(readDesktopPackage(path.join(d.packages, 'unsafe.vfpkg')).errors.join()), 'path traversal is refused');
  raw.files[0].path = 'index.html'; raw.files[1].data = Buffer.from('tampered').toString('base64');
  fs.writeFileSync(path.join(d.packages, 'tampered.vfpkg'), zlib.gzipSync(JSON.stringify(raw)));
  ok(/size|checksum/.test(readDesktopPackage(path.join(d.packages, 'tampered.vfpkg')).errors.join()), 'tampered file inside the package is refused');
  raw.files = raw.files.filter((f) => f.path !== 'desktop/server.mjs');
  fs.writeFileSync(path.join(d.packages, 'partial.vfpkg'), zlib.gzipSync(JSON.stringify(raw)));
  ok(/required part is missing: desktop\/server\.mjs/.test(readDesktopPackage(path.join(d.packages, 'partial.vfpkg')).errors.join()), 'required components are checked');
  userFile(path.join(d.packages, 'notes.txt'));
  const listed = listPackages(d.packages);
  ok(listed.find((p) => p.name === 'notes.txt').kind === 'unknown' && listed.find((p) => p.name === 'vantaflow-0.5.0.vfpkg').ok, 'packages folder lists packages and leaves other files alone');
}

// ------------------------------------------------------------------ successful installation, existing installation, cancel
{
  const d = layout(temp('install'));
  const p5 = makePackage(d, '0.5.0');
  const plan = planInstall(d, p5);
  ok(plan.action === 'install' && !plan.blocked && plan.changes.add.length === 4, 'plan: fresh installation');
  ok(plan.summary && plan.data && plan.backup && plan.reversible && plan.requirements.length, 'plan explains action, data, backup, reversibility, requirements');
  throwsCode(() => install(d, p5, { settings: SETTINGS }), 'not-confirmed', 'cancelled (unconfirmed) installation is refused');
  ok(!fs.existsSync(d.app) && !fs.existsSync(d.journal) && listBackups(d).length === 0, 'cancelled installation changed nothing');
  const steps = [];
  const res = install(d, p5, { settings: SETTINGS, confirmed: true, onProgress: (s) => steps.push(s.label) });
  ok(res.ok && res.version === '0.5.0', 'successful installation');
  ok(steps.length === 6 && steps[0] === 'Checking the package', 'progress is reported for every step');
  const st = installState(d);
  ok(st.installed.version === '0.5.0' && st.integrity.ok && !st.interrupted, 'installed files verify');
  ok(latestValid(d).contains.settings && !latestValid(d).contains.app, 'settings were backed up before the first installation');
  const again = planInstall(d, p5);
  ok(again.action === 'same-version' && /already installed/.test(again.blocked), 'existing installation is detected');
  throwsCode(() => install(d, p5, { confirmed: true }), 'blocked', 'repeated installation is prevented');

  // Update 0.5.0 → 0.6.0 with backup of app and settings.
  const p6 = makePackage(d, '0.6.0');
  const up = planInstall(d, p6);
  ok(up.action === 'update' && up.changes.add.includes('assets/v0.6.0.txt') && up.changes.remove.includes('assets/v0.5.0.txt') && up.changes.replace.includes('index.html'), 'update plan lists added, replaced and removed files');
  const before = listBackups(d).length;
  const r6 = install(d, p6, { settings: SETTINGS, confirmed: true });
  ok(r6.ok && installState(d).installed.version === '0.6.0' && installState(d).integrity.ok, 'update installed and verified');
  const b = listBackups(d).find((x) => x.id === r6.backupId);
  ok(listBackups(d).length === before + 1 && b.status === 'valid' && b.contains.app && b.contains.settings && b.appVersion === '0.5.0', 'backup of 0.5.0 app + settings made before the update');
  eq(backupSettings(d, r6.backupId), SETTINGS, 'settings and profiles preserved exactly in the backup');
  const down = planInstall(d, p5);
  ok(down.action === 'downgrade' && down.destructive, 'downgrade is flagged as destructive');
  ok(fs.readdirSync(d.tmp).length === 0, 'no temporary files left after a successful update');

  // Repair: delete an installed file → integrity fails → same-version package offers repair.
  fs.rmSync(path.join(d.app, 'js/main.js'));
  ok(!installState(d).integrity.ok && /js\/main\.js/.test(diagnose(d).issues[0]), 'missing app file is detected');
  ok(planInstall(d, p6).action === 'repair', 'same version with damaged files offers repair');
  install(d, p6, { confirmed: true });
  ok(installState(d).integrity.ok, 'repair restores the files');
}

// ------------------------------------------------------------------ failed installation → automatic rollback
{
  const d = layout(temp('fail'));
  install(d, makePackage(d, '0.5.0'), { settings: SETTINGS, confirmed: true });
  const p6 = makePackage(d, '0.6.0');
  for (const step of ['verify-package', 'backup', 'stage', 'swap-old', 'swap-new', 'record']) {
    process.env.VANTAFLOW_TEST_FAIL_AT = step;
    let err;
    try { install(d, p6, { settings: SETTINGS, confirmed: true }); } catch (e) { err = e; }
    delete process.env.VANTAFLOW_TEST_FAIL_AT;
    ok(err && /Simulated failure/.test(err.message), `failure at "${step}" is reported`);
    const st = installState(d);
    ok(st.installed.version === '0.5.0' && st.integrity.ok && !st.interrupted, `after failure at "${step}": 0.5.0 is back and verified`);
    ok(/0\.5\.0\) is in place and verified/.test(err.rollback), `after failure at "${step}": rollback result is reported`);
  }
}

// ------------------------------------------------------------------ interrupted installation (real crash) → recovery
{
  for (const [step, option] of [['swap-old', 'rollback'], ['swap-new', 'rollback'], ['stage', 'keep'], ['record', 'keep'], ['swap-new', 'restore-backup']]) {
    const d = layout(temp('crash'));
    install(d, makePackage(d, '0.5.0'), { settings: SETTINGS, confirmed: true });
    const p6 = makePackage(d, '0.6.0');
    const run = child(d.root, `I.install(d, ${JSON.stringify(p6)}, { confirmed: true });`, { VANTAFLOW_TEST_CRASH_AT: step });
    ok(run.status === 70, `process stopped at "${step}"`);
    const diag = diagnose(d);
    ok(!diag.ok && /Interrupted/.test(diag.issues[0]) && diag.state.interrupted.step, `interruption at "${step}" is detected`);
    ok(diag.options.some((o) => o.id === option), `"${option}" is offered after a stop at "${step}" (${diag.options.map((o) => o.id)})`);
    throwsCode(() => install(d, p6, { confirmed: true }), 'blocked', 'no new installation until recovery');
    const r = recover(d, option, { confirmed: true });
    const st = installState(d);
    ok(r.ok && st.integrity.ok && !st.interrupted, `recovery "${option}" after "${step}" is verified (${st.installed.version})`);
    if (option === 'rollback' || option === 'restore-backup') ok(st.installed.version === '0.5.0', 'previous version is back');
  }
  // First installation interrupted: no previous version → remove the incomplete files, settings untouched.
  const d = layout(temp('crash-first'));
  const p5 = makePackage(d, '0.5.0');
  child(d.root, `I.install(d, ${JSON.stringify(p5)}, { confirmed: true });`, { VANTAFLOW_TEST_CRASH_AT: 'swap-new' });
  const diag = diagnose(d);
  ok(diag.options.some((o) => o.id === 'remove-partial' && o.destructive), 'interrupted first installation offers removal of the incomplete files');
  throwsCode(() => recover(d, 'remove-partial'), 'not-confirmed', 'recovery needs confirmation');
  recover(d, 'remove-partial', { confirmed: true });
  ok(!fs.existsSync(d.app) && diagnose(d).ok && latestValid(d) === null, 'incomplete installation removed; nothing claimed installed');
  ok(fs.existsSync(p5), 'the package itself is kept');
}

// ------------------------------------------------------------------ backups: integrity, restore, corruption
{
  const d = layout(temp('backup'));
  install(d, makePackage(d, '0.5.0'), { confirmed: true });
  const b1 = createBackup(d, { settings: SETTINGS, includeApp: true, description: 'Manual backup', appVersion: '0.5.0' });
  ok(b1.status === 'valid' && b1.description === 'Manual backup' && b1.createdAt, 'backup has id, timestamp and description');
  ok(fs.existsSync(path.join(d.backups, b1.id, 'manifest.json')) && !d.app.startsWith(path.join(d.backups, '')), 'backups are stored apart from the app');
  ok(verifyBackup(d, b1.id).ok, 'backup integrity verifies');
  install(d, makePackage(d, '0.6.0'), { confirmed: true });
  const plan = planRestoreApp(d, b1.id);
  ok(plan.destructive && /0\.5\.0/.test(plan.summary) && plan.backup && plan.reversible, 'restore plan explains itself');
  const r = restoreApp(d, b1.id, { confirmed: true });
  ok(r.ok && installState(d).installed.version === '0.5.0' && installState(d).integrity.ok, 'restore from backup is verified');
  ok(listBackups(d).some((b) => b.reason === 'before-restore' && b.appVersion === '0.6.0'), 'the replaced version was backed up first');
  eq(backupSettings(d, b1.id), SETTINGS, 'settings read back from the backup are exact');

  // Corruption: changed file, removed manifest, invalid settings.
  const b2 = createBackup(d, { settings: SETTINGS, description: 'Settings only' });
  fs.appendFileSync(path.join(d.backups, b2.id, 'settings.json'), ' ');
  ok(listBackups(d).find((b) => b.id === b2.id).status === 'damaged', 'changed backup file → damaged');
  throwsCode(() => backupSettings(d, b2.id), 'backup-damaged', 'damaged backup is not restored');
  const b3 = createBackup(d, { settings: SETTINGS, description: 'Will lose its manifest' });
  fs.rmSync(path.join(d.backups, b3.id, 'manifest.json'));
  ok(listBackups(d).find((b) => b.id === b3.id).status === 'damaged' && planRestoreApp(d, b3.id).blocked, 'backup without manifest → damaged, not restorable');
  throwsCode(() => createBackup(d, { settings: { 'other.key': '1' } }), 'invalid-settings', 'non-VantaFlow settings are refused');
  throwsCode(() => createBackup(d, { settings: { 'vantaflow.x': '{broken' } }), 'invalid-settings', 'unreadable settings are refused');
  ok(latestValid(d, { withApp: true }).status === 'valid', 'latest valid backup skips damaged ones');

  // Interrupted backup: never becomes valid, never replaces a valid one.
  const validBefore = listBackups(d).filter((b) => b.status === 'valid').map((b) => [b.id, sha256File(path.join(d.backups, b.id, 'manifest.json'))]);
  const run = child(d.root, `const B = await import('${SETUP}backups.mjs'); B.createBackup(d, { settings: ${JSON.stringify(SETTINGS)}, description: 'crash' });`, { VANTAFLOW_TEST_CRASH_AT: 'backup-manifest' });
  ok(run.status === 70, 'backup process stopped before it finished');
  const inc = listBackups(d).find((b) => b.status === 'incomplete');
  ok(inc && !listBackups(d).some((b) => b.description === 'crash' && b.status === 'valid'), 'interrupted backup is listed as incomplete, never valid');
  eq(validBefore.map(([id]) => [id, sha256File(path.join(d.backups, id, 'manifest.json'))]), validBefore, 'existing valid backups are unchanged');
  throwsCode(() => deleteBackup(d, b1.id), 'backup-valid', 'a valid backup is not deleted without an explicit request');
  deleteBackup(d, inc.id);
  ok(!listBackups(d).some((b) => b.status === 'incomplete'), 'an incomplete backup can be deleted on request');

  // Recovery after a failed update when files go missing, from the most recent valid backup.
  fs.rmSync(path.join(d.app, 'index.html'));
  const diag = diagnose(d);
  const opt = diag.options.find((o) => o.id === 'restore-backup');
  ok(opt && /index\.html/.test(diag.issues[0]), 'missing files detected; restore from the most recent valid backup offered');
  ok(recover(d, 'restore-backup', { confirmed: true }).ok && installState(d).integrity.ok, 'recovery from backup verified');
  // Recovery is never claimed when the backup is damaged.
  fs.rmSync(path.join(d.app, 'index.html'));
  for (const b of listBackups(d).filter((x) => x.contains?.app)) fs.appendFileSync(path.join(d.backups, b.id, 'app', 'index.html'), 'x');
  ok(!diagnose(d).options.some((o) => o.id === 'restore-backup'), 'damaged backups are not offered for recovery');
  throwsCode(() => recover(d, 'restore-backup', { confirmed: true }), 'not-offered', 'recovery failure is reported clearly');
}

// ------------------------------------------------------------------ removal
{
  const d = layout(temp('remove'));
  install(d, makePackage(d, '0.5.0'), { confirmed: true });
  const plan = planRemove(d);
  ok(plan.destructive && /not removed/.test(plan.data) && plan.backup && plan.reversible, 'removal plan is destructive and explains data, backup, reversal');
  throwsCode(() => remove(d, {}), 'not-confirmed', 'removal needs confirmation');
  const r = remove(d, { settings: SETTINGS, confirmed: true });
  ok(r.ok && !fs.existsSync(d.app) && !installState(d).installed, 'removed and verified');
  ok(restoreApp(d, r.backupId, { confirmed: true }).ok && installState(d).installed.version === '0.5.0', 'removal is reversible from its backup');
}

// ------------------------------------------------------------------ cleanup
{
  const d = layout(temp('cleanup'));
  install(d, makePackage(d, '0.5.0'), { settings: SETTINGS, confirmed: true });
  const ours = path.join(d.tmp, 'stage-old-1');
  fs.mkdirSync(ours); writeJsonAtomic(path.join(ours, MARKER), { createdBy: 'vantaflow', purpose: 'stage', opId: 'install-x' }); userFile(path.join(ours, 'app/index.html'));
  const unmarked = path.join(d.tmp, 'something-else'); userFile(path.join(unmarked, 'file.txt'));
  const fake = path.join(d.tmp, 'fake-marker'); userFile(path.join(fake, MARKER), '{"createdBy":"someone"}');
  const loose = userFile(path.join(d.tmp, 'loose.txt'));
  const outside = userFile(path.join(temp('outside'), 'precious.txt'));
  fs.symlinkSync(path.dirname(outside), path.join(d.tmp, 'link-out'));
  const writing = userFile(path.join(d.root, 'journal.json.12345.writing'), '{');
  const userInRoot = userFile(path.join(d.root, 'my-notes.txt'));
  const userPackage = userFile(path.join(d.packages, 'readme.txt'));
  const preview = previewCleanup(d);
  eq(preview.remove.map((r) => path.basename(r.path)).sort(), ['journal.json.12345.writing', 'stage-old-1'], 'preview lists only VantaFlow temporary files');
  ok(['something-else', 'fake-marker', 'loose.txt', 'link-out'].every((n) => preview.keep.some((k) => path.basename(k.path) === n && k.reason)), 'preview lists what is kept and why');
  ok(preview.keep.some((k) => k.path === d.backups) && preview.keep.some((k) => k.path === d.packages), 'backups and packages are kept');
  throwsCode(() => runCleanup(d), 'stale-preview', 'cleanup without a confirmed preview removes nothing');
  ok(fs.existsSync(ours) && fs.existsSync(writing), 'nothing removed without confirmation');
  userFile(path.join(d.tmp, 'late', MARKER), JSON.stringify({ createdBy: 'vantaflow', purpose: 'stage' }));
  throwsCode(() => runCleanup(d, preview.token), 'stale-preview', 'cleanup refuses when files changed since the preview');
  const fresh = previewCleanup(d);
  const done = runCleanup(d, fresh.token);
  ok(done.removed.length === 3 && done.failed.length === 0 && done.bytes > 0, 'confirmed cleanup removes what was previewed');
  ok([unmarked, fake, loose, outside, userInRoot, userPackage].every((p) => fs.existsSync(p)), 'user files and unmarked folders are untouched');
  ok(fs.existsSync(path.join(d.tmp, 'link-out')) && fs.existsSync(outside), 'links are not followed or removed');
  ok(listBackups(d).length === 1 && listBackups(d)[0].status === 'valid' && installState(d).integrity.ok, 'backups and the installed app are untouched');
  const running = path.join(d.tmp, 'running-op');
  userFile(path.join(running, MARKER), JSON.stringify({ createdBy: 'vantaflow', purpose: 'stage', opId: 'op-live' }));
  writeJsonAtomic(d.journal, { opId: 'op-live', state: 'running', title: 'test' });
  ok(previewCleanup(d).keep.some((k) => k.path === running && /not finished/.test(k.reason)), 'files of an unfinished operation are kept for recovery');
}

// ------------------------------------------------------------------ PS4 package → USB drive (simulated drive folder)
{
  const d = layout(temp('ps4'));
  const usb = temp('usb');
  const other = userFile(path.join(usb, 'photos', 'holiday.jpg'));
  const pkg = path.join(d.packages, 'VantaFlow.pkg');
  fs.writeFileSync(pkg, mockPs4Package());
  const r = readPs4Package(pkg);
  ok(r.ok && r.header.titleId === IDENTITY.ps4.titleId && r.header.contentTypeName.startsWith('Application'), 'PS4 package header validates');
  fs.writeFileSync(path.join(d.packages, 'game.pkg'), mockPs4Package({ contentId: 'UP0000-CUSA00000_00-0000000000000000' }));
  ok(/installs only its own package/.test(readPs4Package(path.join(d.packages, 'game.pkg')).errors.join()), 'other PS4 packages are refused');
  fs.writeFileSync(path.join(d.packages, 'cut.pkg'), mockPs4Package().subarray(0, 0x800));
  ok(/incomplete or damaged/.test(readPs4Package(path.join(d.packages, 'cut.pkg')).errors.join()), 'truncated PS4 package is refused');
  fs.writeFileSync(path.join(d.packages, 'fake.pkg'), Buffer.alloc(0x1000));
  ok(/not a PS4 package/.test(readPs4Package(path.join(d.packages, 'fake.pkg')).errors.join()), 'non-PKG file is refused');
  fs.writeFileSync(path.join(d.packages, 'dlc.pkg'), mockPs4Package({ contentType: 0x1b }));
  ok(/not an application/.test(readPs4Package(path.join(d.packages, 'dlc.pkg')).errors.join()), 'non-application content type is refused');

  const plan = planPs4Copy(d, pkg, usb);
  ok(!plan.blocked && plan.requirements.some((x) => /GoldHEN/.test(x)) && /cannot see or verify/.test(plan.after), 'PS4 plan explains prerequisites and that installation is not verified');
  ok(plan.warnings.some((w) => /No VantaFlow PS4 package has been built/.test(w)), 'PS4 plan says no real VantaFlow PKG exists yet');
  ok(planPs4Copy(d, pkg, d.root).blocked && planPs4Copy(d, pkg, path.join(usb, 'nope')).blocked && planPs4Copy(d, pkg, 'relative').blocked, 'bad targets are refused');
  const copied = await copyPs4Package(d, pkg, usb, { confirmed: true });
  ok(copied.ok && sha256File(copied.path) === sha256File(pkg) && /NOT installed yet/.test(copied.message), 'copy is verified and never claims installation');
  ok(/already on the drive/.test(planPs4Copy(d, pkg, usb).blocked), 'copying the same package twice is prevented');
  fs.writeFileSync(path.join(usb, 'VantaFlow.pkg'), 'a different file with the same name');
  const keepBoth = planPs4Copy(d, pkg, usb);
  ok(keepBoth.targetName === 'VantaFlow (2).pkg' && /is kept/.test(keepBoth.warnings.join()), 'a different file with the same name is never overwritten');
  await copyPs4Package(d, pkg, usb, { confirmed: true });
  ok(fs.readFileSync(path.join(usb, 'VantaFlow.pkg'), 'utf8') === 'a different file with the same name', 'existing drive file unchanged');

  // Failure and interruption during the copy.
  const usb2 = temp('usb2');
  process.env.VANTAFLOW_TEST_FAIL_AT = 'ps4-copied';
  await assert.rejects(copyPs4Package(d, pkg, usb2, { confirmed: true }), /unfinished copy was removed/); checks++;
  delete process.env.VANTAFLOW_TEST_FAIL_AT;
  ok(fs.readdirSync(usb2).length === 0, 'failed copy leaves nothing on the drive');
  const run = child(d.root, `await I.copyPs4Package(d, ${JSON.stringify(pkg)}, ${JSON.stringify(usb2)}, { confirmed: true });`, { VANTAFLOW_TEST_CRASH_AT: 'ps4-copied' });
  ok(run.status === 70 && fs.readdirSync(usb2).some((n) => n.endsWith('.vantaflow-partial')), 'interrupted copy leaves a marked partial file');
  const diag = diagnose(d);
  ok(diag.options.some((o) => o.id === 'ps4-remove-partial'), 'interrupted copy is detected');
  recover(d, 'ps4-remove-partial', { confirmed: true });
  ok(fs.readdirSync(usb2).length === 0 && fs.existsSync(other) && diagnose(d).ok, 'only the partial file is removed; other drive files are untouched');
}

console.log(`install.test: ${checks} checks passed (SIMULATED installations in temporary folders with mock packages — not device or console installations)`);
