// Browser test of Install & Recovery (Stage 5) with the desktop agent and a TEMPORARY data
// folder. Installations are SIMULATED: real files in a temporary folder, mock PS4 package, no
// device or console. Failures and interruptions are injected in test mode.
//   NODE_PATH=/opt/node-tools/node_modules node tests/ui-setup.cjs [screenshot-folder]
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const PORT = 8094;
const URL = `http://127.0.0.1:${PORT}/`;
const SHOTS = process.argv[2] || null;
const wait = (p, ms = 250) => p.waitForTimeout(ms);
let passed = 0;
const check = async (name, fn) => { await fn(); passed++; console.log(`ok  ${name}`); };

const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'vantaflow-ui-setup-'));
const USB = fs.mkdtempSync(path.join(os.tmpdir(), 'vantaflow-usb-'));
let server;
function startServer(env = {}) {
  server?.kill();
  server = spawn(process.execPath, ['desktop/server.mjs'], { cwd: ROOT, env: { ...process.env, VANTAFLOW_PORT: String(PORT), VANTAFLOW_TEST: '1', VANTAFLOW_DATA_DIR: DATA, ...env }, stdio: 'ignore' });
  return new Promise((r) => setTimeout(r, 700));
}
const api = (p, body) => fetch(`${URL}api/setup/${p}`, { method: body ? 'POST' : 'GET', headers: { 'x-vantaflow': '1', 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json());

(async () => {
  // Packages: two real builds of this app (0.5.0, 0.6.0), a later 0.7.0, a mock PS4 package, an unrelated file.
  fs.mkdirSync(path.join(DATA, 'packages'), { recursive: true });
  for (const v of ['0.5.0', '0.6.0', '0.7.0']) execFileSync(process.execPath, ['tools/build-package.mjs', v, path.join(DATA, 'packages')], { cwd: ROOT });
  const { mockPs4Package } = await import(path.join(ROOT, 'desktop/setup/packages.mjs'));
  fs.writeFileSync(path.join(DATA, 'packages', 'VantaFlow.pkg'), mockPs4Package());
  fs.writeFileSync(path.join(DATA, 'packages', 'notes.txt'), 'my notes');
  await startServer();

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: SHOTS ? 2 : 1 });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const shot = async (name) => { if (SHOTS) await p.screenshot({ path: path.join(SHOTS, `${name}.png`) }); };
  const dialog = () => p.textContent('#dialog');
  const select = async (sel) => { if (!(await p.$(`${sel}.sel`))) { await p.click(sel); await wait(p, 150); } };
  const row = (text) => `.panel-list .row:has-text("${text}")`;
  const open = async (text) => { await select(row(text)); await p.keyboard.press('Enter'); await wait(p, 300); };
  const button = async (label) => { await p.click(`#dialog button:has-text("${label}")`); await wait(p, 250); };
  const finish = async () => { await p.waitForSelector('#dialog .dialog-btns button:text-is("OK")', { timeout: 15000 }); const text = await dialog(); await button('OK'); await wait(p, 600); return text; };
  const state = () => api('state');

  await p.goto(URL);
  await wait(p, 1200);

  await check('Install & Recovery opens from Settings; the top bar keeps its 11 icons, Settings lit', async () => {
    await p.click('.nav-btn[data-id="settings"]');
    await wait(p);
    await p.click(row('Install, backups & recovery'));
    await p.click(row('Install, backups & recovery'));
    await wait(p, 1200);
    assert.equal(await p.textContent('.panel-head h1'), 'Install & Recovery');
    assert.equal(await p.$$eval('#nav .nav-btn', (b) => b.length), 11);
    assert.equal(await p.getAttribute('.nav-btn.active', 'data-id'), 'settings');
    const list = await p.textContent('.panel-list');
    for (const t of ['This computer', 'Not installed', 'vantaflow-0.5.0.vfpkg', 'VantaFlow.pkg', 'notes.txt', 'Not installable', 'Back up settings now', 'Clean up temporary files']) assert.ok(list.includes(t), t);
    await shot('1-install-and-recovery');
  });

  await check('install: confirmation explains action, files, data, backup, reversibility; cancel changes nothing', async () => {
    await open('vantaflow-0.5.0.vfpkg');
    const t = await dialog();
    for (const x of ['Install VantaFlow', 'Package', 'Platform', 'Requirements', 'Install folder', 'What happens', 'Files affected', 'Your data', 'Backup', 'Can be undone', 'checksum matches']) assert.ok(t.includes(x), x);
    await shot('2-install-confirmation');
    await button('Cancel');
    assert.match(await p.textContent('#toasts'), /Cancelled/);
    assert.equal((await state()).install.installed, null);
  });

  await check('install: progress, then a verified success; settings backed up first', async () => {
    await open('vantaflow-0.5.0.vfpkg');
    await button('Install');
    await p.waitForSelector('.progress-box', { timeout: 3000 }).catch(() => {});
    const done = await finish();
    assert.match(done, /0\.5\.0 is installed and every file verified/);
    const s = await state();
    assert.ok(s.install.installed.version === '0.5.0' && s.install.integrity.ok);
    assert.ok(s.backups.some((b) => b.status === 'valid' && b.contains.settings));
    assert.match(await p.textContent('.panel-list'), /0\.5\.0 · verified/);
  });

  await check('repeated installation of the same version is prevented', async () => {
    await open('vantaflow-0.5.0.vfpkg');
    assert.match(await dialog(), /already installed/);
    await button('OK');
  });

  await check('update to 0.6.0 backs up 0.5.0 app files and settings, then verifies', async () => {
    await open('vantaflow-0.6.0.vfpkg');
    assert.match(await dialog(), /Update VantaFlow from 0\.5\.0 to 0\.6\.0/);
    await button('Update');
    assert.match(await finish(), /0\.6\.0 is installed/);
    const s = await state();
    assert.ok(s.install.installed.version === '0.6.0' && s.backups.some((b) => b.contains.app && b.appVersion === '0.5.0' && b.status === 'valid'));
  });

  await check('failed update rolls back and says so', async () => {
    await startServer({ VANTAFLOW_TEST_FAIL_AT: 'swap-new' });
    await p.reload(); await wait(p, 1000);
    await p.click('.nav-btn[data-id="settings"]'); await wait(p);
    await p.click(row('Install, backups & recovery')); await p.click(row('Install, backups & recovery')); await wait(p, 1200);
    await open('vantaflow-0.7.0.vfpkg');
    await button('Update');
    const text = await finish();
    assert.match(text, /It did not work/);
    assert.match(text, /previous version \(0\.6\.0\) is in place and verified/);
    const s = await state();
    assert.ok(s.install.installed.version === '0.6.0' && s.install.integrity.ok && s.recovery.ok);
  });

  await check('interrupted update is detected; recovery puts 0.6.0 back and verifies it', async () => {
    await startServer({ VANTAFLOW_TEST_CRASH_AT: 'swap-old' });
    await p.reload(); await wait(p, 1000);
    await p.click('.nav-btn[data-id="settings"]'); await wait(p);
    await p.click(row('Install, backups & recovery')); await p.click(row('Install, backups & recovery')); await wait(p, 1200);
    await open('vantaflow-0.7.0.vfpkg');
    await button('Update');
    assert.match(await finish(), /stopped unexpectedly/);
    await startServer();
    await p.keyboard.press('t'); await wait(p, 1200); // △ check again
    assert.match(await p.textContent('.panel-list'), /Needs recovery/);
    assert.match(await p.textContent('.panel-list'), /Action needed/);
    await open('Recover from an interrupted');
    assert.match(await dialog(), /Put the previous version \(0\.6\.0\) back/);
    await shot('3-recovery-options');
    await p.click('#dialog .choice:has-text("Put the previous version")'); await wait(p, 300);
    assert.match(await dialog(), /Reported as successful only after the files are checked/);
    await button('Recover');
    assert.match(await finish(), /0\.6\.0 is in place and every file verified/);
    const s = await state();
    assert.ok(s.recovery.ok && s.install.installed.version === '0.6.0' && s.install.integrity.ok);
  });

  await check('back up settings, then restore them (destructive: two presses), verified and reloaded', async () => {
    const before = await p.evaluate(() => localStorage.getItem('vantaflow.account.shared'));
    await open('Back up settings now');
    await button('Back up');
    assert.match(await finish(), /Done/);
    await p.evaluate(() => { const a = JSON.parse(localStorage.getItem('vantaflow.account.shared') ?? '{}'); localStorage.setItem('vantaflow.account.shared', JSON.stringify({ ...a, username: 'Changed_Name' })); });
    await p.keyboard.press('t'); await wait(p, 1000);
    await open('Backup of settings (made by you)');
    await p.click('#dialog .choice:has-text("Restore these settings")'); await wait(p, 600);
    assert.match(await dialog(), /Your current settings in this browser are replaced/);
    await p.click('#dialog button:has-text("Restore")'); await wait(p, 200);
    assert.match(await dialog(), /Press ✕ again to restore/);
    await shot('4-restore-settings-armed');
    await p.click('#dialog button:has-text("Press ✕ again")');
    await p.waitForSelector('#dialog button:text-is("OK")', { timeout: 10000 });
    assert.match(await dialog(), /read back unchanged/);
    await button('OK');
    await wait(p, 1500);
    assert.equal(await p.evaluate(() => localStorage.getItem('vantaflow.account.shared')), before);
    assert.ok((await state()).backups.some((b) => /Before restoring settings/.test(b.description) && b.status === 'valid'), 'current settings were backed up before restoring');
  });

  await check('a damaged backup is shown as damaged and can only be deleted (with confirmation)', async () => {
    const s = await state();
    const victim = s.backups.find((b) => b.status === 'valid' && /made by you/.test(b.description));
    fs.appendFileSync(path.join(DATA, 'backups', victim.id, 'settings.json'), ' ');
    await p.click('.nav-btn[data-id="settings"]'); await wait(p);
    await p.click(row('Install, backups & recovery')); await p.click(row('Install, backups & recovery')); await wait(p, 1200);
    assert.match(await p.textContent(row('made by you')), /Damaged/);
    await open('made by you');
    const options = await p.$$eval('#dialog .choice', (els) => els.map((e) => e.textContent));
    assert.equal(options.length, 1);
    assert.match(options[0], /Delete this backup/);
    await p.click('#dialog .choice'); await wait(p, 300);
    await p.click('#dialog button:has-text("Delete")'); await wait(p, 150);
    await p.click('#dialog button:has-text("Press ✕ again")');
    await finish();
    assert.ok(!(await state()).backups.some((b) => b.id === victim.id));
  });

  await check('cleanup: preview, cancel keeps everything, confirm removes only VantaFlow temp files', async () => {
    const ours = path.join(DATA, 'tmp', 'stage-left-over');
    fs.mkdirSync(ours, { recursive: true });
    fs.writeFileSync(path.join(ours, '.vantaflow-temp'), JSON.stringify({ createdBy: 'vantaflow', purpose: 'stage', opId: 'old' }));
    const mine = path.join(DATA, 'tmp', 'my-folder'); fs.mkdirSync(mine, { recursive: true }); fs.writeFileSync(path.join(mine, 'keep.txt'), 'mine');
    await open('Clean up temporary files');
    const t = await dialog();
    assert.match(t, /Will be removed[\s\S]*stage-left-over/);
    assert.match(t, /my-folder — Not created by VantaFlow/);
    assert.match(t, /Backups are never removed/);
    await shot('5-cleanup-preview');
    await button('Cancel');
    assert.ok(fs.existsSync(ours));
    await open('Clean up temporary files');
    await p.click('#dialog button:has-text("Clean up")'); await wait(p, 150);
    await p.click('#dialog button:has-text("Press ✕ again")');
    await finish();
    assert.ok(!fs.existsSync(ours) && fs.existsSync(path.join(mine, 'keep.txt')) && fs.existsSync(path.join(DATA, 'packages', 'notes.txt')));
  });

  await check('PS4: package checked, copied to the USB folder and verified, never claimed installed', async () => {
    fs.writeFileSync(path.join(USB, 'holiday.jpg'), 'photo');
    await open('VantaFlow.pkg');
    await p.fill('#dialog input', USB);
    await p.keyboard.press('Enter'); await wait(p, 600);
    const t = await dialog();
    for (const x of ['Copy VantaFlow to a USB drive', 'IV0000-VNTF00001_00-VANTAFLOWPS40000', 'Prerequisites', 'GoldHEN', 'After copying', 'cannot see or verify', 'No VantaFlow PS4 package has been built', 'SIMULATED']) assert.ok(t.includes(x), x);
    await shot('6-ps4-usb-confirmation');
    await button('Copy');
    const done = await finish();
    assert.match(done, /NOT installed yet/);
    assert.ok(fs.existsSync(path.join(USB, 'VantaFlow.pkg')) && fs.readFileSync(path.join(USB, 'holiday.jpg'), 'utf8') === 'photo');
  });

  await check('remove VantaFlow: destructive confirmation, backup first, settings kept', async () => {
    const keys = await p.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('vantaflow.')).length);
    await open('Remove VantaFlow from this computer');
    assert.match(await dialog(), /Your settings, profiles and backgrounds are not removed/);
    await p.click('#dialog button:has-text("Remove")'); await wait(p, 150);
    await p.click('#dialog button:has-text("Press ✕ again")');
    assert.match(await finish(), /was removed/);
    const s = await state();
    assert.ok(!s.install.installed && s.backups.some((b) => b.reason === 'before-remove' && b.status === 'valid'));
    assert.equal(await p.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('vantaflow.')).length), keys);
  });

  await check('reset all settings backs them up first', async () => {
    await p.click('.nav-btn[data-id="settings"]'); await wait(p);
    await p.click(row('Reset all settings')); await p.click(row('Reset all settings')); await wait(p, 300);
    assert.match(await dialog(), /your current settings are backed up first/);
    await p.click('#dialog button:has-text("Reset")'); await wait(p, 150);
    await p.click('#dialog button:has-text("Press ✕ again")'); await wait(p, 1500);
    assert.ok((await state()).backups.some((b) => b.reason === 'before-reset' && b.status === 'valid'));
  });

  await check('no script errors during the run', async () => assert.deepEqual(errors, []));

  await check('without the desktop agent the page explains how to start it', async () => {
    const c2 = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await c2.route('**/api/agent', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    const q = await c2.newPage();
    await q.goto(URL); await q.waitForTimeout(1000);
    await q.click('.nav-btn[data-id="settings"]'); await q.waitForTimeout(300);
    await q.click(row('Install, backups & recovery')); await q.click(row('Install, backups & recovery')); await q.waitForTimeout(500);
    assert.match(await q.textContent('.panel-list'), /node desktop\/server\.mjs/);
    await c2.close();
  });

  console.log(`\n${passed} checks passed (SIMULATED installations in a temporary folder — not device or console installations)`);
  await browser.close();
  server.kill();
  fs.rmSync(DATA, { recursive: true, force: true });
  fs.rmSync(USB, { recursive: true, force: true });
})().catch((e) => { console.error('FAIL', e.message); server?.kill(); process.exit(1); });
