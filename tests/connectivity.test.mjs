// Stage 4 connectivity tests (desktop): DDP parsing, PS4/PS5 providers, discovery, address
// checks, the local agent API and the compatibility integration.
// Every console here is a FAKE on 127.0.0.1 (tests/fake-console.mjs). Passing these tests
// proves VantaFlow's logic, not that detection works with a physical console.
// Run: node tests/connectivity.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { parseReply, generationOf, powerState, ps4Firmware, searchMessage, DDP } from '../desktop/agent/ddp.mjs';
import { createPs4Provider } from '../desktop/agent/providers/ps4.mjs';
import { createPs5Provider } from '../desktop/agent/providers/ps5.mjs';
import { discover, validateAddress, isLocalAddress } from '../desktop/agent/discovery.mjs';
import { startFakeConsole } from './fake-console.mjs';
import { evaluate } from '../js/compat/engine.js';
import { detectionResult, henStatus, HEN_STATUS, STATUS } from '../js/models/index.js';
import { createPS4Platform } from '../js/platform/ps4/index.js';
import { createPS5Platform } from '../js/platform/ps5/index.js';

const read = (p) => JSON.parse(fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const samples = read('shared/ddp-samples.json').samples;
const reply = (id) => samples.find((s) => s.id === id).reply;
const data = { goldhen: read('shared/compatibility/goldhen.json'), etahen: read('shared/compatibility/etahen.json'), customization: read('shared/customization.json') };
const platforms = { ps4: createPS4Platform(data), ps5: createPS5Platform(data) };
let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks++; };
const eq = (a, b, msg) => { assert.deepEqual(a, b, msg); checks++; };

// ------------------------------------------------------------ DDP format (shared vectors)
eq(searchMessage('ps4'), 'SRCH * HTTP/1.1\ndevice-discovery-protocol-version:00020020\n', 'PS4 SRCH message');
eq(searchMessage('ps5'), 'SRCH * HTTP/1.1\ndevice-discovery-protocol-version:00030010\n', 'PS5 SRCH message');
eq([DDP.ps4.port, DDP.ps5.port], [987, 9302], 'documented ports');
for (const s of samples) {
  const r = parseReply(s.reply);
  if (s.expect.notDdp) { ok(r === null, `${s.id}: not a DDP reply`); continue; }
  const gen = generationOf(r, s.askedAs);
  eq(gen, s.expect.generation, `${s.id}: generation`);
  if (!gen) continue;
  eq(powerState(r.code), s.expect.power, `${s.id}: power`);
  eq(r.hostName, s.expect.name, `${s.id}: name`);
  ok(!('running-app-titleid' in r) && !Object.values(r).includes('CUSA00000'), `${s.id}: running app is dropped`);
  if (gen === 'ps4') {
    const fw = ps4Firmware(r.systemVersion);
    eq(fw.version, s.expect.firmware, `${s.id}: firmware`);
    eq(fw.confirmed, s.expect.firmwareConfirmed, `${s.id}: firmware confirmed`);
  } else {
    eq(r.systemVersion, s.expect.rawSystemVersion, `${s.id}: PS5 raw system-version kept, not converted`);
  }
}

// ------------------------------------------------------------ address checks
for (const bad of ['', 'abc', '192.168.1', '192.168.1.300', '8.8.8.8', '1.1.1.1', '192.168.1.255', '192.168.1.0', '127.0.0.1', '::1', 'ps4.local']) {
  ok(!validateAddress(bad).ok, `rejects "${bad}"`);
}
for (const good of ['192.168.1.20', '10.0.0.5', '172.20.3.4', '169.254.10.10', ' 192.168.0.42 ']) ok(validateAddress(good).ok, `accepts "${good}"`);
ok(isLocalAddress('127.0.0.1', { allowLoopback: true }) && !isLocalAddress('127.0.0.1'), 'loopback only in test mode');
ok(!isLocalAddress('172.32.0.1') && !isLocalAddress('172.15.0.1'), '172.16/12 boundaries');

// ------------------------------------------------------------ providers against a fake console
const replyMap = (id) => (text) => (text.startsWith('SRCH') ? reply(id) : null);
let fake = await startFakeConsole(replyMap('ps4-on-900'));
const ps4 = createPs4Provider({ port: fake.port, timeoutMs: 400 });
let r = await ps4.probe('127.0.0.1');
ok(fake.received[0] === searchMessage('ps4'), 'PS4 provider sends exactly the SRCH message');
eq(r.retrieved.generation, 'ps4', 'PS4 identified');
eq(r.retrieved.firmware, '9.00', 'PS4 firmware read');
ok(r.detection.console.verified && r.detection.firmware.verified, 'PS4 generation and firmware verified');
ok(r.detection.console.model === null && r.unavailable.some((u) => u.field === 'model'), 'PS4 model reported as unavailable, not guessed');
ok(r.unavailable.some((u) => u.field === 'goldhen') && r.detection.environment.state === 'unsupported-method', 'GoldHEN check reported as unsupported');
ok(r.attempted.length === 1 && /987|SRCH/.test(r.attempted[0]), 'report says what was attempted');
let d = detectionResult(r.detection);
eq(henStatus(d), HEN_STATUS.UNSUPPORTED, 'GoldHEN status: Unsupported detection method');
let c = evaluate(d, platforms);
eq(c.status, STATUS.UNKNOWN, 'a real PS4 with unknown model and unchecked GoldHEN is Unknown, not Compatible');
ok(c.reasons.some((x) => x.code === 'environment-check-unsupported') && c.reasons.some((x) => x.code === 'model-unknown'), 'reasons name both gaps');
await fake.close();

fake = await startFakeConsole(replyMap('ps4-1100-unconfirmed'));
r = await createPs4Provider({ port: fake.port, timeoutMs: 400 }).probe('127.0.0.1');
ok(r.retrieved.firmware === '11.00' && r.detection.firmware.verified === false, 'PS4 11.00 decoded but marked unconfirmed');
ok(evaluate(detectionResult(r.detection), platforms).reasons.some((x) => x.code === 'firmware-unverified'), 'unconfirmed firmware stays unverified in the engine');
await fake.close();

fake = await startFakeConsole(replyMap('ps4-no-system-version'));
r = await createPs4Provider({ port: fake.port, timeoutMs: 400 }).probe('127.0.0.1');
ok(r.retrieved.generation === 'ps4' && r.retrieved.firmware === null && r.unavailable.some((u) => u.field === 'firmware'), 'missing firmware reported as unavailable');
ok(evaluate(detectionResult(r.detection), platforms).reasons.some((x) => x.code === 'firmware-unknown'), 'missing firmware stays unknown');
await fake.close();

fake = await startFakeConsole(replyMap('ps5-on'));
const ps5 = createPs5Provider({ port: fake.port, timeoutMs: 400 });
r = await ps5.probe('127.0.0.1');
ok(fake.received[0] === searchMessage('ps5'), 'PS5 provider sends the PS5 SRCH message');
eq(r.retrieved.generation, 'ps5', 'PS5 identified');
ok(r.detection.firmware.version === null && r.detection.firmware.raw === '09400001', 'PS5 firmware not converted; raw value kept');
ok(['model', 'firmware', 'etahen'].every((f) => r.unavailable.some((u) => u.field === f)), 'PS5 unavailable fields listed');
d = detectionResult(r.detection);
eq(henStatus(d), HEN_STATUS.UNSUPPORTED, 'etaHEN status: Unsupported detection method');
eq(evaluate(d, platforms).status, STATUS.UNKNOWN, 'a real PS5 is Unknown: responding does not prove etaHEN');
await fake.close();

// A PS4 reply arriving on the PS5 port is not accepted as a PS5.
fake = await startFakeConsole(replyMap('ps4-reply-on-ps5-port'));
r = await createPs5Provider({ port: fake.port, timeoutMs: 400 }).probe('127.0.0.1');
ok(!r.retrieved.generation && r.errors.some((e) => e.code === 'not-ps5'), 'wrong console type is not accepted');
eq(evaluate(detectionResult(r.detection), platforms).status, STATUS.NOT_DETECTED, 'unidentified reply → not detected');
await fake.close();

// Unknown generation / not a PlayStation.
fake = await startFakeConsole(replyMap('unknown-host-type'));
r = await createPs4Provider({ port: fake.port, timeoutMs: 400 }).probe('127.0.0.1');
ok(!r.retrieved.generation && r.errors.some((e) => e.code === 'not-ps4'), 'unknown host type not identified');
await fake.close();
fake = await startFakeConsole(replyMap('not-ddp'));
r = await createPs4Provider({ port: fake.port, timeoutMs: 400 }).probe('127.0.0.1');
ok(r.errors.some((e) => e.code === 'not-ddp'), 'non-DDP answer is not treated as a console');
await fake.close();

// Timeout: device silent.
fake = await startFakeConsole(() => null);
const t0 = Date.now();
r = await createPs4Provider({ port: fake.port, timeoutMs: 300 }).probe('127.0.0.1');
ok(r.errors[0].code === 'timeout' && Date.now() - t0 < 1500, 'silent device → timeout error, quickly');
ok(/does not prove/.test(r.errors[0].action), 'timeout does not claim the device is not a console');
eq(evaluate(detectionResult(r.detection ?? {}), platforms).status, STATUS.NOT_DETECTED, 'timeout → not detected');
await fake.close();

// Network error from the transport.
r = await createPs4Provider({ send: async () => { throw Object.assign(new Error('ENETUNREACH: network is unreachable'), { code: 'network-error' }); } }).probe('192.168.1.20');
ok(r.errors[0].code === 'network-error', 'network errors are reported');

// ------------------------------------------------------------ discovery
const fakePs4 = await startFakeConsole(replyMap('ps4-on-900'));
const fakePs5 = await startFakeConsole(replyMap('ps5-on'));
const found = await discover({
  providers: { ps4: createPs4Provider(), ps5: createPs5Provider() },
  targets: ['127.0.0.1'], ports: { ps4: fakePs4.port, ps5: fakePs5.port }, timeoutMs: 400, allowLoopback: true,
});
eq(found.devices.map((x) => x.retrieved.generation).sort(), ['ps4', 'ps5'], 'discovery finds a PS4 and a PS5');
eq(found.sent.length, 2, 'discovery sends one message per generation per target, nothing else');
ok(fakePs4.received.length === 1 && fakePs5.received.length === 1, 'each fake console received exactly one SRCH');
const noLoopback = await discover({ providers: { ps4: createPs4Provider() }, targets: ['127.0.0.1'], ports: { ps4: fakePs4.port }, timeoutMs: 300 });
eq(noLoopback.devices.length, 0, 'replies from non-local addresses are ignored');
await fakePs4.close();
await fakePs5.close();

// ------------------------------------------------------------ reliability (Stage 4.1)
// A probe of one address is never answered by another device: 127.0.0.2 answers as a PS4 to a
// probe of 127.0.0.1, and the probe must time out instead of identifying 127.0.0.1.
{
  const dgram = await import('node:dgram');
  const listen = dgram.createSocket('udp4');
  const other = dgram.createSocket('udp4');
  await new Promise((done) => listen.bind(0, '127.0.0.1', done));
  await new Promise((done) => other.bind(0, '127.0.0.2', done));
  listen.on('message', (_, rinfo) => other.send(Buffer.from(reply('ps4-on-900')), rinfo.port, rinfo.address));
  const r = await createPs4Provider({ port: listen.address().port, timeoutMs: 500 }).probe('127.0.0.1');
  listen.close();
  other.close();
  ok(!r.retrieved.generation && r.errors[0].code === 'timeout', 'a reply from another address never identifies the probed address');
}

// Random and mutated replies never produce a false identification.
{
  let seed = 4; // mulberry32
  const rnd = (n) => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return (((t ^ (t >>> 14)) >>> 0) % n); };
  const lines = samples.flatMap((s) => s.reply.split('\n')).filter(Boolean);
  const alphabet = 'HTTP/1.1 200 Ok620host-type:PS4PS5device-discovery-protocol-version:0002002000030010\n :-xyz';
  let identified = 0;
  let wrong = 0;
  for (let i = 0; i < 5000; i++) {
    // a real sample with lines dropped, replaced or mixed in · random sample lines · random characters
    const base = samples[rnd(samples.length)].reply.split('\n');
    const text = [
      () => base.map((l) => [l, l, l, '', lines[rnd(lines.length)], l.slice(0, rnd(l.length + 1))][rnd(6)]).join('\n'),
      () => Array.from({ length: rnd(8) }, () => lines[rnd(lines.length)]).join('\n'),
      () => Array.from({ length: rnd(200) }, () => alphabet[rnd(alphabet.length)]).join(''),
    ][i % 3]();
    for (const [gen, provider] of [['ps4', createPs4Provider()], ['ps5', createPs5Provider()]]) {
      const r = provider.read(text, '192.168.1.20');
      if (!r.retrieved.generation) {
        if (r.detection.connection.state === 'connected') wrong++;
        continue;
      }
      identified++;
      const first = text.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? '';
      if (!first.startsWith('HTTP/1.1 ') || !text.includes(`host-type:${DDP[gen].hostType}`) || !text.includes(`device-discovery-protocol-version:${DDP[gen].protocolVersion}`) || r.retrieved.generation !== gen) wrong++;
    }
  }
  ok(identified > 100, `fuzz produced enough valid replies to be meaningful (${identified})`);
  ok(wrong === 0, `10 000 mutated replies: no false identification (${identified} valid identifications)`);
}

// Demonstration consoles and real consoles never mix.
{
  const mock = read('shared/mock-consoles.json').consoles;
  ok(mock.every((c) => !c.id.startsWith('lan-')), 'no demo console id looks like a saved real console');
  ok(mock.every((c) => c.detection.console.source !== 'ddp' && c.detection.connection.transport !== 'ddp-udp'), 'demo data never claims a DDP source');
}

// ------------------------------------------------------------ physical-test tool (tools/console-check.mjs)
{
  const { execFile } = await import('node:child_process');
  const os = await import('node:os');
  const t4 = await startFakeConsole((m) => (m.includes('00020020') ? reply('ps4-on-900') : null));
  const t5 = await startFakeConsole(() => null);
  const env = { ...process.env, VANTAFLOW_TEST: '1', VANTAFLOW_TEST_PS4_PORT: String(t4.port), VANTAFLOW_TEST_PS5_PORT: String(t5.port) };
  const out = `${os.tmpdir()}/vantaflow-check-${process.pid}.json`;
  const tool = (args, input) => new Promise((done) => {
    const child = execFile(process.execPath, [new URL('../tools/console-check.mjs', import.meta.url).pathname, ...args, '--out', out], { env }, (e, stdout, stderr) => done({ code: e?.code ?? 0, text: stdout + stderr }));
    if (input !== undefined) child.stdin.end(input);
  });
  let r = await tool(['127.0.0.1', '--firmware', '9.00', '--timeout', '600']);
  const saved = JSON.parse(fs.readFileSync(out, 'utf8'));
  ok(r.code === 0 && /identified as:\s+PS4/.test(r.text) && /you typed:\s+9\.00 — matches/.test(r.text), 'tool identifies a fake PS4 and compares firmware');
  ok(/GoldHEN:\s+Unsupported detection method/.test(r.text) && !/GoldHEN (is )?(installed|running|detected)/i.test(r.text), 'tool never claims GoldHEN detection');
  ok(!JSON.stringify(saved).includes('0123456789AB') && JSON.stringify(saved).includes('host-id:[removed by VantaFlow]'), 'tool report leaves out the console ID');
  ok(saved.results.find((x) => x.generation === 'ps5').answered === 0, 'tool reports a silent PS5 request as unanswered, not identified');
  r = await tool(['127.0.0.1', '--hide-name', '--timeout', '600']);
  ok(!fs.readFileSync(out, 'utf8').includes('Living room PS4'), 'tool --hide-name leaves out the console name');
  r = await tool(['8.8.8.8']);
  ok(r.code === 2 && /not a local network address/.test(r.text), 'tool refuses internet addresses');
  const before = t4.received.length;
  r = await tool(['--discover', '--timeout', '600'], 'n\n');
  ok(/Nothing was sent/.test(r.text) && t4.received.length === before, 'tool discovery sends nothing without a yes');
  fs.rmSync(out, { force: true });
  await t4.close();
  await t5.close();
}

// ------------------------------------------------------------ local agent API
const agentPs4 = await startFakeConsole(replyMap('ps4-on-900'));
const PORT = 18000 + Math.floor(Math.random() * 1000);
const server = spawn(process.execPath, ['desktop/server.mjs'], {
  cwd: new URL('..', import.meta.url).pathname,
  env: { ...process.env, VANTAFLOW_PORT: String(PORT), VANTAFLOW_TEST: '1', VANTAFLOW_TEST_PS4_PORT: String(agentPs4.port), VANTAFLOW_TEST_PS5_PORT: '9', VANTAFLOW_TEST_TIMEOUT_MS: '300', VANTAFLOW_TEST_DISCOVERY_TARGET: '127.0.0.1' },
  stdio: ['ignore', 'pipe', 'inherit'],
});
await new Promise((done) => server.stdout.once('data', done));
const call = (path, body, headers = { 'x-vantaflow': '1' }) => fetch(`http://127.0.0.1:${PORT}${path}`, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...headers }, body: body && JSON.stringify(body) });
try {
  ok((await call('/api/agent')).status === 200, 'agent answers');
  ok((await call('/api/agent', null, {})).status === 403, 'API refuses calls without the VantaFlow header');
  const rebinding = await new Promise((done) => http.get({ host: '127.0.0.1', port: PORT, path: '/api/agent', headers: { 'x-vantaflow': '1', host: `evil.example:${PORT}` } }, (res) => { res.resume(); done(res.statusCode); }));
  ok(rebinding === 421, 'API refuses other Host names (DNS rebinding)');
  ok((await call('/api/discover', { consent: false })).status === 403, 'discovery refused without consent');
  const disc = await (await call('/api/discover', { consent: true })).json();
  ok(disc.devices.length === 1 && disc.devices[0].retrieved.generation === 'ps4', 'discovery via agent finds the fake PS4');
  const bad = await call('/api/probe', { address: '8.8.8.8' });
  ok(bad.status === 400 && (await bad.json()).code === 'invalid-address', 'public address refused');
  const probe = await (await call('/api/probe', { address: '127.0.0.1' })).json();
  const ps4Report = probe.reports.find((x) => x.generation === 'ps4');
  const ps5Report = probe.reports.find((x) => x.generation === 'ps5');
  ok(ps4Report.retrieved.generation === 'ps4' && ps5Report.errors[0].code === 'timeout', 'manual probe tries PS4 and PS5 separately');
  ok((await fetch(`http://127.0.0.1:${PORT}/../package.json`)).status !== 200, 'no files outside the app are served');
} finally {
  server.kill();
  await agentPs4.close();
}

console.log(`connectivity.test: ${checks} checks passed (fake consoles on 127.0.0.1 — not physical-console proof)`);
