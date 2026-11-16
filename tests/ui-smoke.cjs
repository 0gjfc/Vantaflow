// End-to-end smoke test in a real browser. Optional: needs Playwright (not a project dependency).
//   node desktop/server.mjs &          # from the project folder (python3 -m http.server also works)
//   node tests/ui-smoke.cjs http://localhost:8080/
// Exits non-zero on the first failed check.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');

const URL = process.argv[2] || 'http://localhost:8080/';
const wait = (p, ms = 250) => p.waitForTimeout(ms);
const keys = async (p, ...ks) => { for (const k of ks) { await p.keyboard.press(k); await wait(p, 120); } };
const title = (p) => p.textContent('.flow-info h2');
const head = async (p) => (await p.isVisible('#view-panel') ? p.textContent('.panel-head h1') : `flow:${await p.textContent('.flow-caption b')}`);
let passed = 0;
const check = async (name, fn) => { await fn(); passed++; console.log(`ok  ${name}`); };

// Any real image works for the background test; use one shipped with the project.
const png = path.join(__dirname, '..', 'assets', 'etahen', 'etahen-logo.png');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  // Fake standard-mapping gamepad driven by window.__pad (button index → pressed).
  await ctx.addInitScript(() => {
    window.__pad = {};
    const pad = () => ({ connected: true, mapping: 'standard', axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: !!window.__pad[i], value: window.__pad[i] ? 1 : 0 })) });
    navigator.getGamepads = () => [pad()];
  });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto(URL);
  await wait(p, 1200);

  await check('boots without errors', async () => assert.deepEqual(errors, []));

  await check('every section opens and is highlighted (PS4 order)', async () => {
    const seen = [];
    for (let i = 0; i < 14; i++) {
      seen.push(await head(p));
      const active = await p.$$eval('.nav-btn.active', (els) => els.map((e) => e.dataset.id));
      assert.equal(active.length, 1);
      await keys(p, 'e');
    }
    for (const name of ['flow:Games', 'flow:Applications', 'PlayStation Store', 'Settings', 'Trophies', 'Friends', 'Notifications', 'Media', 'File Manager', 'flow:Homebrew Applications', 'Power Options', 'GoldHEN', 'Player One', 'Consoles']) assert.ok(seen.includes(name), name);
    assert.ok(!seen.includes('etaHEN'));
    assert.equal(await head(p), 'flow:Games');
  });

  await check('top navigation keeps its 11 icons; Consoles opens from the console status', async () => {
    assert.equal(await p.$$eval('#nav .nav-btn', (els) => els.length), 11);
    assert.equal(await p.$('#nav .nav-btn[data-id="consoles"]'), null);
    await p.click('#console-status');
    await wait(p);
    assert.equal(await head(p), 'Consoles');
    assert.equal(await p.getAttribute('.nav-btn.active', 'id'), 'console-status');
    await p.click('.nav-btn[data-id="games"]');
    await wait(p);
  });

  await check('top-bar buttons switch sections', async () => {
    for (const id of ['store', 'files', 'power', 'games']) {
      await p.click(`.nav-btn[data-id="${id}"]`);
      await wait(p);
      assert.equal(await p.getAttribute('.nav-btn.active', 'data-id'), id);
    }
  });

  await check('carousel moves, wraps and updates title/description', async () => {
    const t0 = await title(p);
    await keys(p, 'ArrowRight');
    await wait(p, 300);
    const t1 = await title(p);
    assert.notEqual(t0, t1);
    await keys(p, 'ArrowLeft', 'ArrowLeft');
    await wait(p, 300);
    assert.notEqual(await title(p), t0); // wrapped to the last title
    await keys(p, 'ArrowRight');
    await wait(p, 300);
    assert.equal(await title(p), t0);
    assert.equal(await p.$$eval('.cf-item', (els) => els.length) >= 5, true); // neighbours visible
  });

  await check('game selection opens the game page and simulated launch', async () => {
    await keys(p, 'Enter');
    await wait(p, 500);
    assert.ok(await p.$eval('#view-flow', (e) => e.classList.contains('paged')));
    await keys(p, 'Enter');
    await wait(p, 400);
    assert.ok(await p.isVisible('#splash'));
    await wait(p, 2600);
    assert.match(await p.textContent('#toasts'), /Simulated launch/);
    await keys(p, 'Escape');
    await wait(p, 400);
    assert.ok(!(await p.$eval('#view-flow', (e) => e.classList.contains('paged'))));
  });

  await check('accent colour changes the interface', async () => {
    await keys(p, 'm');
    await p.click('.row:has-text("Accent color")');
    await wait(p);
    const before = await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
    await keys(p, 'ArrowRight');
    const after = await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
    assert.notEqual(before, after);
  });

  await check('animation speed changes transition timing', async () => {
    await p.click('.row:has-text("Animation speed")');
    await keys(p, 'ArrowRight');
    assert.equal(await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--k').trim()), '0.6');
    await keys(p, 'ArrowLeft');
    await p.click('.row:has-text("Background music")');
    await keys(p, 'Enter', 'Enter'); // music on, then off
  });

  await check('background image: preview, then apply', async () => {
    p.once('filechooser', (fc) => fc.setFiles(png));
    await p.click('.row:has-text("Choose custom image")');
    await p.click('.row:has-text("Choose custom image")');
    await wait(p, 900);
    assert.ok(await p.isVisible('.row:has-text("Apply previewed image")'));
    assert.match(await p.textContent('.panel-detail'), /not applied yet/);
    assert.ok(await p.isHidden('#bg-image')); // preview only
    await keys(p, 'Enter');
    await wait(p, 400);
    assert.ok(await p.isVisible('#bg-image'));
  });

  await check('profile name, avatar and status are editable', async () => {
    await p.click('#profile');
    await wait(p);
    await keys(p, 'Enter');
    await p.fill('.dialog-input', 'Tester_01');
    await keys(p, 'Enter');
    await wait(p, 300);
    assert.match(await p.textContent('#profile'), /Tester_01/);
    await p.click('.row:has-text("Online status")');
    await keys(p, 'ArrowRight');
    assert.ok(await p.$('#profile .dot.away'));
    await p.click('.row:has-text("Avatar color")');
    const a0 = await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--avatar').trim());
    await keys(p, 'ArrowRight');
    assert.notEqual(await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--avatar').trim()), a0);
  });

  await check('notifications: mark all read', async () => {
    await p.click('.nav-btn[data-id="notifications"]');
    await wait(p);
    await keys(p, 's');
    assert.ok(await p.isHidden('.nav-btn[data-id="notifications"] .badge'));
  });

  await check('file manager: Enter opens folders, Backspace goes up', async () => {
    await p.click('.nav-btn[data-id="files"]');
    await wait(p);
    await keys(p, 'Enter');
    assert.equal(await p.textContent('.crumb'), '/data');
    await keys(p, 'Backspace');
    assert.equal(await p.textContent('.crumb'), '/');
  });

  await check('storage widget opens categorised storage', async () => {
    await p.click('.nav-btn[data-id="games"]');
    await wait(p);
    await p.click('.storage');
    await wait(p);
    assert.match(await p.textContent('.panel-detail'), /Games[\s\S]*Free space/);
    assert.match(await p.textContent('.panel-detail'), /SIMULATED/);
  });

  await check('controller: D-pad, ✕ and ○ via the Gamepad API', async () => {
    await p.click('.nav-btn[data-id="games"]');
    await wait(p);
    await p.evaluate(() => window.dispatchEvent(new Event('gamepadconnected')));
    const press = async (i) => { await p.evaluate((b) => { window.__pad[b] = true; }, i); await wait(p, 80); await p.evaluate((b) => { window.__pad[b] = false; }, i); await wait(p, 300); };
    const t0 = await title(p);
    await press(15); // D-pad right
    assert.notEqual(await title(p), t0);
    await press(0); // ✕
    assert.ok(await p.$eval('#view-flow', (e) => e.classList.contains('paged')));
    await press(1); // ○
    assert.ok(!(await p.$eval('#view-flow', (e) => e.classList.contains('paged'))));
    await press(5); // R1
    assert.equal(await head(p), 'flow:Applications');
    await press(4); // L1
  });

  let ps4Accent;
  await check('consoles page lists every mock console with its compatibility', async () => {
    ps4Accent = await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
    await p.click('#console-status');
    await wait(p, 400);
    assert.equal(await head(p), 'Consoles');
    await p.click('.row:has-text("Living room PS4 Pro")'); // first row is "Discover consoles"
    await wait(p);
    const chips = await p.$$eval('.panel-list .compat', (els) => els.map((e) => e.textContent));
    assert.equal(chips.length, 11);
    for (const label of ['Compatible', 'Partially compatible', 'Unsupported', 'Unknown', 'Not detected']) assert.ok(chips.includes(label), label);
    const detail = await p.textContent('.panel-detail');
    for (const field of ['Connection', 'Generation', 'Model', 'Firmware', 'Homebrew', 'Last detection', 'Why', 'Supported features']) assert.ok(detail.includes(field), field);
    await keys(p, 't'); // △ detect again
    await wait(p, 400);
    assert.match(await p.textContent('#toasts'), /Detection finished/);
  });

  await check('unknown device cannot become the active console', async () => {
    await p.click('.row:has-text("Unidentified device")');
    await p.click('.row:has-text("Unidentified device")');
    await wait(p, 300);
    assert.match(await p.textContent('#toasts'), /Cannot use this device/);
    assert.match(await p.textContent('#console-status'), /PS4 Pro/);
  });

  await check('PS5 console: etaHEN, PS5 library, separate storage, files and settings', async () => {
    await p.click('.row:has-text("Living room PS5")');
    await p.click('.row:has-text("Living room PS5")');
    await wait(p, 500);
    assert.match(await p.textContent('#console-status'), /PS5 · FW 8\.20/);
    assert.equal(await p.getAttribute('#gh-badge', 'data-id'), 'etahen');
    assert.match(await p.textContent('#profile'), /Tester_01/); // account is shared by default
    assert.ok(await p.isHidden('#bg-image')); // background is per console
    await p.click('#gh-badge');
    await wait(p);
    assert.equal(await head(p), 'etaHEN');
    assert.match(await p.textContent('.panel-detail'), /SIMULATED/);
    assert.match(await p.textContent('.panel-detail'), /Compatible/);
    await p.click('.nav-btn[data-id="games"]');
    await wait(p);
    assert.match(await p.textContent('.flow-caption'), /17 installed/);
    assert.match(await p.textContent('.storage'), /Internal SSD/);
    await p.click('.nav-btn[data-id="files"]');
    await keys(p, 'Enter');
    assert.match(await p.textContent('.panel-list'), /etaHEN/);
    assert.doesNotMatch(await p.textContent('.panel-list'), /GoldHEN/);
    const seen = [];
    for (let i = 0; i < 14; i++) { seen.push(await head(p)); await keys(p, 'e'); }
    assert.ok(seen.includes('etaHEN') && !seen.includes('GoldHEN'));
  });

  await check('separate PS4 and PS5 profiles can be turned on', async () => {
    await p.click('#profile');
    await wait(p);
    await p.click('.row:has-text("Separate PS4 and PS5 profiles")');
    await keys(p, 'Enter');
    assert.ok(await p.$('.row.sel .switch.on'));
    await p.click('.row:has-text("Username")');
    await keys(p, 'Enter');
    await p.fill('.dialog-input', 'PS5_Player');
    await keys(p, 'Enter');
    await wait(p, 300);
    assert.match(await p.textContent('#profile'), /PS5_Player/);
  });

  await check('no script errors during the whole run', async () => assert.deepEqual(errors, []));

  await check('preferences survive a restart, per console profile', async () => {
    await p.close();
    const q = await ctx.newPage();
    await q.goto(URL);
    await wait(q, 1200);
    assert.match(await q.textContent('#console-status'), /PS5/); // PS5 profile still active
    assert.match(await q.textContent('#profile'), /PS5_Player/); // its own account
    assert.ok(await q.isHidden('.nav-btn[data-id="notifications"] .badge'));
    // Back to the PS4 profile: its own name, accent and background are all still there.
    await q.click('#console-status');
    await q.click('.row:has-text("Living room PS4 Pro")');
    await q.click('.row:has-text("Living room PS4 Pro")');
    await wait(q, 500);
    assert.match(await q.textContent('#profile'), /Tester_01/); // PS4 account untouched
    assert.equal(await q.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()), ps4Accent);
    assert.ok(await q.isVisible('#bg-image'));
    // Restore default appearance: background image gone, Itemzflow Blue back.
    await keys(q, 'm');
    await q.click('.row:has-text("Restore default appearance")');
    await q.click('.row:has-text("Restore default appearance")');
    await wait(q, 300);
    assert.ok(await q.isHidden('#bg-image'));
    assert.equal(await q.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()), '#1d86f0');
    await q.close();
  });

  await check('missing logos fall back to text with one error each', async () => {
    const c2 = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    await c2.route('**/goldhen-logo.png', (r) => r.fulfill({ status: 404, body: '' }));
    await c2.route('**/etahen-logo.png', (r) => r.fulfill({ status: 404, body: '' }));
    const q = await c2.newPage();
    const errs = [];
    q.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    await q.goto(URL);
    await wait(q, 1000);
    assert.equal(await q.textContent('#gh-badge .hen-text'), 'GoldHEN');
    for (let i = 0; i < 15; i++) await keys(q, 'e'); // visit every section, incl. GoldHEN
    await q.click('#gh-badge');
    await wait(q);
    assert.equal(await q.textContent('.gh-hero .hen-text'), 'GoldHEN');
    assert.ok(errs.length <= 2, `expected at most 2 logo errors, got ${errs.length}`);
    await c2.close();
  });

  await check('scales to different window sizes', async () => {
    for (const [w, h] of [[1280, 720], [1024, 768], [390, 844], [2560, 1440]]) {
      const c3 = await browser.newContext({ viewport: { width: w, height: h } });
      const q = await c3.newPage();
      await q.goto(URL);
      await wait(q, 700);
      const box = await q.$eval('#stage', (e) => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom, r.width / r.height]; });
      assert.ok(box[0] >= -1 && box[1] >= -1 && box[2] <= w + 1 && box[3] <= h + 1, `${w}x${h} overflows`);
      assert.ok(Math.abs(box[4] - 16 / 9) < 0.01);
      await c3.close();
    }
  });

  console.log(`\n${passed} checks passed`);
  await browser.close();
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
