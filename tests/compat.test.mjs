// Compatibility engine, researched data and detection tests. Run: node tests/compat.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { evaluate } from '../js/compat/engine.js';
import { firmwareStatement, findRelease, parseFirmware } from '../js/compat/release-data.js';
import { createPS4Platform, MODELS as PS4_MODELS } from '../js/platform/ps4/index.js';
import { createPS5Platform, MODELS as PS5_MODELS } from '../js/platform/ps5/index.js';
import { DetectionService } from '../js/detection/service.js';
import { MockDetectionProvider } from '../js/detection/mock-provider.js';
import { STATUS } from '../js/models/index.js';

const read = (p) => JSON.parse(fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const goldhen = read('shared/compatibility/goldhen.json');
const etahen = read('shared/compatibility/etahen.json');
const customization = read('shared/customization.json');
const mock = read('shared/mock-consoles.json');
const platforms = { ps4: createPS4Platform({ goldhen, etahen, customization }), ps5: createPS5Platform({ goldhen, etahen, customization }) };
let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks++; };

// ---------------------------------------------------------------- researched data integrity
for (const data of [goldhen, etahen]) {
  ok(/^\d{4}-\d{2}-\d{2}$/.test(data.lastVerified), `${data.name}: lastVerified date`);
  ok(data.sources.length && data.sources.every((s) => s.url.startsWith('https://github.com/')), `${data.name}: primary GitHub sources`);
  const versions = data.releases.map((r) => r.version);
  ok(new Set(versions).size === versions.length, `${data.name}: unique versions`);
  ok(versions.includes(data.readmeDescribes), `${data.name}: readmeDescribes is a release`);
  for (const f of data.features) ok(f.since === null || versions.includes(f.since), `${data.name}: feature ${f.id} since ${f.since} is a release`);
  for (const r of data.releases) {
    ok(/^\d{4}-\d{2}-\d{2}$/.test(r.date), `${data.name} ${r.version}: date`);
    for (const s of r.firmware) {
      ok(['documented', 'limited'].includes(s.level) && s.evidence, `${data.name} ${r.version}: statement has level and evidence`);
      ok((s.versions || s.range).every((v) => parseFirmware(v) != null), `${data.name} ${r.version}: firmware values are valid`);
    }
  }
}
// Releases are newest first by date.
for (const data of [goldhen, etahen]) {
  const dates = data.releases.map((r) => r.date);
  ok(dates.every((d, i) => i === 0 || dates[i - 1] >= d), `${data.name}: releases newest first`);
}

// ---------------------------------------------------------------- mock console scenarios
const required = ['ps4-goldhen-supported', 'ps4-unsupported-firmware', 'ps4-no-goldhen', 'ps5-etahen-supported', 'ps5-unsupported-firmware', 'ps5-no-etahen', 'unknown-console', 'ps4-disconnected'];
for (const id of required) ok(mock.consoles.some((c) => c.id === id), `mock scenario ${id} exists`);
for (const c of mock.consoles) {
  const r = evaluate(c.detection, platforms);
  assert.equal(r.status, c.expected, `${c.id}: got ${r.status}, expected ${c.expected}\n${r.reasons.map((x) => x.message).join('\n')}`);
  checks++;
  ok(r.reasons.length > 0 && r.reasons.every((x) => x.message.length > 10), `${c.id}: every result explains itself`);
}

// ---------------------------------------------------------------- targeted rules
const det = (generation, model, firmware, env) => ({
  connection: { state: 'connected', transport: 'test' },
  console: { generation, model, verified: true, source: 'test' },
  firmware: { version: firmware, verified: true, source: 'test' },
  environment: { state: 'active', verified: true, source: 'test', ...env },
});
const status = (...a) => evaluate(det(...a), platforms);
const codes = (r) => r.reasons.map((x) => x.code);

let r = status('ps4', 'ps4', '11.00', { kind: 'goldhen', version: '2.3' });
ok(r.status === STATUS.UNSUPPORTED && codes(r).includes('firmware-not-in-release'), 'GoldHEN 2.3 does not list 11.00');
r = status('ps4', 'ps4', '9.60', { kind: 'goldhen', version: '2.4b17' });
ok(r.status === STATUS.UNSUPPORTED, 'GoldHEN 2.4b17 does not list 9.60 (added in 2.4b17.3)');
r = status('ps4', 'ps4', '9.60', { kind: 'goldhen', version: '2.4b17.3' });
ok(r.status === STATUS.COMPATIBLE, 'GoldHEN 2.4b17.3 lists 9.60');
r = status('ps4', 'ps4', '6.71', { kind: 'goldhen', version: '2.2.1' });
ok(r.status === STATUS.UNSUPPORTED, 'GoldHEN 2.2.1 shipped no 6.71 payload');
r = status('ps4', 'ps4-pro', '9.00', { kind: 'etahen', version: '2.4B' });
ok(r.status === STATUS.UNSUPPORTED && codes(r).includes('environment-mismatch'), 'etaHEN on a PS4 is a mismatch');
r = status('ps5', 'ps5', '9.00', { kind: 'goldhen', version: '2.4b18' });
ok(r.status === STATUS.UNSUPPORTED && codes(r).includes('environment-mismatch'), 'GoldHEN on a PS5 is a mismatch');
r = status('ps5', 'ps5', '8.20', { kind: 'etahen', version: '2.4B', components: { elfldr: true } });
ok(r.status === STATUS.UNKNOWN && codes(r).includes('firmware-not-restated'), 'etaHEN 2.4B does not restate 8.20: unknown, not compatible');
r = status('ps5', 'ps5', '9.60', { kind: 'etahen', version: '2.5B', components: { elfldr: true } });
ok(r.status === STATUS.UNKNOWN, 'latest etaHEN with no firmware statement is never assumed compatible');
r = status('ps5', 'ps5', '9.60', { kind: 'etahen', version: '2.4B', components: { elfldr: true } });
ok(r.status === STATUS.COMPATIBLE, 'etaHEN 2.4B documents 8.40–10.01');
r = status('ps5', 'ps5', '9.60', { kind: 'etahen', version: '2.4B', components: { elfldr: false } });
ok(r.status === STATUS.UNKNOWN && codes(r).includes('component-missing'), 'missing required ELF loader makes the result inconsistent');
r = status('ps5', 'ps5', '5.10', { kind: 'etahen', version: '2.0b' });
ok(r.status === STATUS.PARTIAL && r.unsupported.some((f) => /PS5Debug/.test(f.label)), 'etaHEN 2.0b disables PS5Debug on 5.xx');
r = status('ps5', 'ps5-digital', '8.20', { kind: 'etahen', version: '2.3B' });
ok(r.unsupported.some((f) => /disc/i.test(f.label)), 'disc features are unsupported on a Digital Edition');
r = status('ps5', 'ps5', '3.20', { kind: 'etahen', version: '1.3b' });
ok(r.status === STATUS.PARTIAL, 'etaHEN 1.3b: 3.xx other than 3.00 is limited');
r = status('ps5', 'ps5', '3.00', { kind: 'etahen', version: '1.3b' });
ok(r.status === STATUS.COMPATIBLE, 'etaHEN 1.3b: 3.00 is documented as tested');
r = status('ps4', 'ps4', '9', { kind: 'goldhen', version: '2.4b18' });
ok(r.status === STATUS.UNKNOWN, 'malformed firmware is unknown');
r = status('ps4', 'ps9-mega', '9.00', { kind: 'goldhen', version: '2.4b18' });
ok(r.status === STATUS.UNKNOWN, 'unknown model is unknown');
r = evaluate(null, platforms);
ok(r.status === STATUS.NOT_DETECTED, 'no detection result → not detected');

// ---------------------------------------------------------------- review decision: strict etaHEN rule
// Kept after the Stage 3 review: unless an etaHEN release itself states a firmware, the result
// is never Compatible (and never Partially compatible). Checked for every release × firmware.
const ps5Firmware = ['2.50', '3.00', '3.20', '4.02', '4.51', '5.10', '6.50', '7.61', '8.00', '8.20', '8.40', '8.60', '9.00', '9.40', '9.60', '10.01', '10.20', '11.00'];
for (const rel of etahen.releases) {
  for (const fw of ps5Firmware) {
    const res = status('ps5', 'ps5', fw, { kind: 'etahen', version: rel.version, components: { elfldr: true, kstuff: true } });
    const st = firmwareStatement(rel, fw);
    if (!st) ok(res.status === STATUS.UNKNOWN || res.status === STATUS.UNSUPPORTED, `etaHEN ${rel.version} on ${fw}: not stated → ${res.status}`);
    else if (st.level === 'limited') ok(res.status !== STATUS.COMPATIBLE, `etaHEN ${rel.version} on ${fw}: limited → never compatible`);
  }
}

// ---------------------------------------------------------------- invariant (randomised)
// Whatever the input, "compatible" or "partial" needs every detail identified, verified and
// documented for that exact release. 20 000 random configurations, fixed seed.
let seed = 42;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (xs) => xs[Math.floor(rand() * xs.length)];
const fws = ['3.00', '4.51', '5.05', '6.72', '8.20', '9.00', '9.03', '9.60', '10.01', '11.00', '12.50', '', null, '9', 'x.yz'];
const models = [...PS4_MODELS, ...PS5_MODELS].map((m) => m.id).concat([null, 'ps3']);
const envVersions = [...goldhen.releases, ...etahen.releases].map((x) => x.version).concat([null, '9.9', '3.0B']);
for (let i = 0; i < 20000; i++) {
  const d = {
    connection: { state: pick(['connected', 'connected', 'connected', 'disconnected', 'unknown', 'bogus']) },
    console: { generation: pick(['ps4', 'ps5', null, 'ps3']), model: pick(models), verified: rand() > 0.2 },
    firmware: { version: pick(fws), verified: rand() > 0.2 },
    environment: { kind: pick(['goldhen', 'etahen', null, 'mira']), state: pick(['active', 'active', 'absent', 'unknown']), version: pick(envVersions), verified: rand() > 0.2, components: { elfldr: pick([true, false, undefined]), kstuff: pick([true, false, undefined]) } },
  };
  const res = evaluate(d, platforms);
  if (res.status !== STATUS.COMPATIBLE && res.status !== STATUS.PARTIAL) continue;
  const gen = d.console.generation;
  const data = gen === 'ps4' ? goldhen : etahen;
  const release = findRelease(data, d.environment.version);
  const statement = release && firmwareStatement(release, d.firmware.version);
  const catalog = gen === 'ps4' ? PS4_MODELS : PS5_MODELS;
  const known = d.connection.state === 'connected' && catalog.some((m) => m.id === d.console.model) && d.console.verified && d.firmware.verified
    && d.environment.verified && d.environment.state === 'active' && d.environment.kind === data.environment && statement;
  assert.ok(known, `unverified configuration reported ${res.status}: ${JSON.stringify(d)}`);
  if (res.status === STATUS.COMPATIBLE) assert.equal(statement.level, 'documented', `compatible needs a documented statement: ${JSON.stringify(d)}`);
}
checks++;

// ---------------------------------------------------------------- detection service
const service = new DetectionService(new MockDetectionProvider(mock.consoles, { latencyMs: 1 }), { timeoutMs: 200 });
ok((await service.list()).length === mock.consoles.length, 'provider lists every mock console');
const found = await service.detect('ps4-goldhen-supported');
ok(found.detectedAt && found.console.generation === 'ps4' && service.last('ps4-goldhen-supported') === found, 'detection is timestamped and cached');
const missing = await service.detect('no-such-console');
ok(missing.errors[0].code === 'not-found' && evaluate(missing, platforms).status === STATUS.NOT_DETECTED, 'failed detection → not detected with an error');
const slow = new DetectionService({ name: 'slow', list: async () => [], detect: () => new Promise(() => {}) }, { timeoutMs: 20 });
const timedOut = await slow.detect('x');
ok(timedOut.errors[0].code === 'timeout' && evaluate(timedOut, platforms).status === STATUS.NOT_DETECTED, 'timeout → not detected');

// ---------------------------------------------------------------- shared design tokens still match the desktop CSS
const tokens = read('shared/design-tokens.json');
const css = fs.readFileSync(new URL('../css/vantaflow.css', import.meta.url), 'utf8');
for (const [name, value] of [['--accent', tokens.color.accent], ['--highlight', tokens.color.highlight], ['--grey', tokens.color.panelGrey]]) ok(css.includes(`${name}: ${value};`), `CSS ${name} matches design tokens`);
for (const [s, colour] of Object.entries(tokens.color.status)) ok(css.toLowerCase().includes(`.c-${s} { color: ${colour}`), `CSS status colour ${s} matches design tokens`);

console.log(`compat.test: ${checks} checks passed (incl. 20 000 random configurations)`);
