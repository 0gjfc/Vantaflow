// Browser test of the Consoles page with the desktop agent and FAKE consoles on 127.0.0.1.
// It proves the UI flows (consent, discovery, manual IP, connect/disconnect/refresh/remove,
// switching the active console, errors) — NOT that detection works with a physical console.
//   NODE_PATH=/opt/node-tools/node_modules node tests/ui-consoles.cjs
// Needs Playwright (not a project dependency). Starts its own server; exits non-zero on failure.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const PORT = 8093;
const URL = `http://127.0.0.1:${PORT}/`;
const wait = (p, ms = 250) => p.waitForTimeout(ms);
const keys = async (p, ...ks) => { for (const k of ks) { await p.keyboard.press(k); await wait(p, 120); } };
let passed = 0;
const check = async (name, fn) => { await fn(); passed++; console.log(`ok  ${name}`); };
const samples = require('../shared/ddp-samples.json').samples;
const reply = (id, name) => samples.find((s) => s.id === id).reply.replace(/host-name:[^\n]*/, `host-name:${name}`);

let server;
(async () => {
  const { startFakeConsole } = await import('./fake-console.mjs');
  const ps4 = await startFakeConsole((m) => (m.includes('00020020') ? reply('ps4-on-900', 'Test PS4') : null));
  const ps5 = await startFakeConsole((m) => (m.includes('00030010') ? reply('ps5-on', 'Test PS5') : null));
  server = spawn(process.execPath, ['desktop/server.mjs'], {
    cwd: ROOT,
    env: { ...process.env, VANTAFLOW_PORT: String(PORT), VANTAFLOW_TEST: '1', VANTAFLOW_TEST_PS4_PORT: String(ps4.port), VANTAFLOW_TEST_PS5_PORT: String(ps5.port), VANTAFLOW_TEST_TIMEOUT_MS: '400', VANTAFLOW_TEST_DISCOVERY_TARGET: '127.0.0.1' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 50; i++) {
    try { await fetch(URL); break; } catch { await new Promise((r) => setTimeout(r, 100)); }
  }

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const toasts = () => p.textContent('#toasts');
  const detail = () => p.textContent('.panel-detail');
  const lanRow = (ip) => `.row:has(small:text-matches("^${ip} "))`;
  const choose = async (label) => { await p.click(`#dialog .choice:has-text("${label}")`); await wait(p, 900); };
  // Clicking the selected row activates it, so only click rows that are not selected yet.
  const select = async (sel) => { if (!(await p.$(`${sel}.sel`))) { await p.click(sel); await wait(p, 150); } };
  const openActions = async (ip) => { await select(lanRow(ip)); await keys(p, 'Enter'); await wait(p); };

  await p.goto(URL);
  await wait(p, 1200);
  await p.click('#console-status');
  await wait(p, 400);

  await check('consoles page offers discovery and manual IP; nothing is sent before consent', async () => {
    const list = await p.textContent('.panel-list');
    for (const t of ['Your consoles', 'Discover consoles on this network', 'Add console by IP address', 'No consoles saved yet', 'Demo · PS4']) assert.ok(list.includes(t), t);
    assert.equal(ps4.received.length + ps5.received.length, 0);
  });

  await check('discovery asks first and explains what it collects; cancel sends nothing', async () => {
    await select('.row:has-text("Discover consoles")');
    await keys(p, 'Enter');
    const text = await p.textContent('#dialog');
    for (const t of ['UDP port 987', 'UDP port 9302', 'Nothing leaves your local network', 'discarded']) assert.ok(text.includes(t), t);
    assert.ok(!text.includes('SIMULATED'), 'real discovery is not labelled simulated');
    await keys(p, 'Escape');
    await wait(p, 600);
    assert.equal(ps4.received.length + ps5.received.length, 0);
  });

  await check('discovery lists the consoles that answered; picking one saves and checks it', async () => {
    await keys(p, 'Enter', 'Enter'); // open, then confirm "Search"
    await wait(p, 1500);
    const names = await p.$$eval('#dialog .choice', (els) => els.map((e) => e.textContent));
    assert.equal(names.length, 2, `${await toasts()} | ${await p.textContent('#dialog')}`);
    assert.ok(names.some((n) => /Test PS4 — PS4/.test(n)) && names.some((n) => /Test PS5 — PS5/.test(n)));
    assert.ok(ps4.received.some((m) => m.startsWith('SRCH')) && ps5.received.some((m) => m.startsWith('SRCH')));
    await choose('Test PS4');
    assert.match(await toasts(), /Console answered/);
    assert.match(await p.textContent('.panel-list'), /127\.0\.0\.1 · PS4 · connected/);
  });

  await check('real console detail: verified vs unavailable, HEN status never guessed', async () => {
    await select(lanRow('127.0.0.1'));
    await wait(p);
    const d = await detail();
    for (const t of ['READ-ONLY', 'IP address', '127.0.0.1', 'PS4 — verified', '9.00 — verified', 'Connected', 'Power', 'On',
      'GoldHEN status', 'Unsupported detection method', 'Compatibility', 'Unknown', 'Last successful check', 'Last detection',
      'Verified from the console', 'Not available', 'model', 'goldhen', 'Method', 'SRCH']) assert.ok(d.includes(t), t);
    assert.doesNotMatch(d, /Verified installed|Compatible —|SIMULATED/);
    assert.equal(await p.textContent(`${lanRow('127.0.0.1')} .compat`), 'Unknown');
  });

  await check('make a real console active: top bar and GoldHEN page show read-only results', async () => {
    await openActions('127.0.0.1');
    await choose('Make active console');
    const status = await p.textContent('#console-status');
    assert.match(status, /PS4 “Test PS4” · FW 9\.00/);
    assert.doesNotMatch(status, /MOCK/);
    assert.match(await p.getAttribute('#gh-badge', 'title'), /GoldHEN — Unsupported detection method/);
    await p.click('#gh-badge');
    await wait(p);
    const d = await detail();
    assert.match(d, /Unsupported detection method/);
    assert.match(d, /READ-ONLY/);
    assert.match(d, /never guessed/);
    await p.click('#console-status');
    await wait(p);
  });

  await check('disconnect: not contacted any more, top bar says not connected', async () => {
    await openActions('127.0.0.1');
    await choose('Disconnect');
    assert.match(await toasts(), /Disconnected/);
    assert.match(await p.textContent('#console-status'), /Not connected/);
    const before = ps4.received.length;
    await select(lanRow('127.0.0.1'));
    await keys(p, 't'); // △ refresh
    await wait(p, 600);
    assert.equal(ps4.received.length, before);
    assert.match(await toasts(), /Connect this console first/);
    assert.match(await detail(), /Disconnected by you/);
    assert.match(await detail(), /GoldHEN status\s*Not detected/);
  });

  await check('connect and refresh contact the console again', async () => {
    const before = ps4.received.length;
    await openActions('127.0.0.1');
    await choose('Connect');
    assert.match(await toasts(), /Console answered/);
    assert.ok(ps4.received.length > before);
    const n = ps4.received.length;
    await keys(p, 't');
    await wait(p, 900);
    assert.ok(ps4.received.length > n);
    assert.match(await p.textContent('#console-status'), /FW 9\.00/);
  });

  await check('manual IP: invalid and internet addresses are refused and not saved', async () => {
    for (const bad of ['not-an-ip', '8.8.8.8']) {
      await select('.row:has-text("Add console by IP address")');
      await keys(p, 'Enter');
      await p.fill('#dialog input', bad);
      await keys(p, 'Enter');
      await wait(p, 500);
      assert.match(await toasts(), /Invalid address/);
    }
    assert.doesNotMatch(await p.textContent('.panel-list'), /8\.8\.8\.8|not-an-ip/);
  });

  await check('manual IP that does not answer: saved as not identified, never a success', async () => {
    await select('.row:has-text("Add console by IP address")');
    await keys(p, 'Enter');
    await p.fill('#dialog input', '127.0.0.2');
    await keys(p, 'Enter');
    await wait(p, 1500);
    assert.match(await toasts(), /Saved, not identified/);
    assert.match(await p.textContent('.panel-list'), /127\.0\.0\.2 · no answer/);
    await select(lanRow('127.0.0.2'));
    await wait(p);
    const d = await detail();
    assert.match(d, /Not identified/);
    assert.match(d, /No answer/);
    assert.doesNotMatch(d, /Connected —/);
    await keys(p, 'Enter');
    const options = await p.$$eval('#dialog .choice', (els) => els.map((e) => e.textContent));
    assert.ok(!options.some((o) => /Make active/.test(o)), 'an unidentified device cannot become active');
    await keys(p, 'Escape');
    await wait(p);
  });

  await check('removing the active console falls back to the demo console', async () => {
    await openActions('127.0.0.1');
    await choose('Remove saved console');
    await keys(p, 'ArrowRight', 'Enter'); // confirm
    await wait(p, 600);
    assert.match(await toasts(), /Console removed/);
    // Removing the active console falls back to the demo console.
    assert.match(await p.textContent('#console-status'), /MOCK/);
  });

  await check('remove a saved console', async () => {
    await openActions('127.0.0.2');
    await choose('Remove saved console');
    await keys(p, 'Enter'); // confirm dialog defaults to the confirm button
    await wait(p, 600);
    assert.doesNotMatch(await p.textContent('.panel-list'), /127\.0\.0\.2/);
    assert.match(await p.textContent('.panel-list'), /No consoles saved yet/);
  });

  await check('saved consoles survive a restart and are re-checked only when connected', async () => {
    await select('.row:has-text("Discover consoles")');
    await keys(p, 'Enter', 'Enter');
    await wait(p, 1500);
    await choose('Test PS5');
    assert.match(await p.textContent('.panel-list'), /127\.0\.0\.1 · PS5 · connected/);
    const n = ps5.received.length;
    await p.reload();
    await wait(p, 1500);
    assert.ok(ps5.received.length > n, 'connected console re-checked at start-up');
    await p.click('#console-status');
    await wait(p);
    assert.match(await p.textContent('.panel-list'), /Test PS5/);
    await select(lanRow('127.0.0.1'));
    await wait(p);
    const d = await detail();
    assert.match(d, /PS5 — verified/);
    assert.match(d, /etaHEN status\s*Unsupported detection method/);
    assert.match(d, /Firmware\s*Not available/); // no documented PS5 decoding
  });

  // The two refused addresses answer HTTP 400, which the browser logs; nothing else may.
  await check('no script errors during the run', async () => assert.deepEqual(errors, Array(2).fill('Failed to load resource: the server responded with a status of 400 (Bad Request)')));

  await check('without the desktop agent, real-console actions explain how to start it', async () => {
    const c2 = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    await c2.route('**/api/agent', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    const q = await c2.newPage();
    await q.goto(URL);
    await wait(q, 1000);
    await q.click('#console-status');
    await wait(q);
    assert.match(await q.textContent('.panel-list'), /node desktop\/server\.mjs/);
    const n = ps4.received.length + ps5.received.length;
    await q.click('.row:has-text("Discover consoles")');
    await keys(q, 'Enter');
    await wait(q, 500);
    assert.match(await q.textContent('#toasts'), /Desktop agent not running/);
    assert.equal(ps4.received.length + ps5.received.length, n);
    await c2.close();
  });

  console.log(`\n${passed} checks passed (fake consoles on 127.0.0.1 — not physical-console proof)`);
  await browser.close();
  server.kill();
  await ps4.close();
  await ps5.close();
})().catch((e) => { console.error('FAIL', e.message); server?.kill(); process.exit(1); });
