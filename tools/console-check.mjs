// VantaFlow physical-console check (read-only). Run it on a computer on the same network as
// your PS4 or PS5. It sends only the documented discovery request (DDP SRCH), prints what the
// console answered, and writes a JSON report you can share. See docs/physical-testing.md.
//
//   node tools/console-check.mjs 192.168.1.20                    PS4 and PS5 requests to one address
//   node tools/console-check.mjs 192.168.1.20 --firmware 9.00    also compare with the firmware the console shows
//   node tools/console-check.mjs 192.168.1.20 --repeat 5         ask 5 times (reliability)
//   node tools/console-check.mjs --discover                      broadcast discovery (asks first)
//
// It never wakes, controls or changes the console, never contacts GoldHEN / etaHEN ports, and
// sends nothing outside your local network. The report leaves out the console ID and the
// running game; it keeps the console's name unless you add --hide-name.
import fs from 'node:fs';
import os from 'node:os';
import readline from 'node:readline/promises';
import { DDP, searchMessage, parseReply } from '../desktop/agent/ddp.mjs';
import { exchange } from '../desktop/agent/udp.mjs';
import { createPs4Provider } from '../desktop/agent/providers/ps4.mjs';
import { createPs5Provider } from '../desktop/agent/providers/ps5.mjs';
import { validateAddress, broadcastTargets, isLocalAddress } from '../desktop/agent/discovery.mjs';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const VALUE_OPTIONS = new Set(['--firmware', '--repeat', '--timeout', '--out']);
const address = args.find((a, i) => !a.startsWith('--') && !VALUE_OPTIONS.has(args[i - 1]));
const expectedFirmware = option('--firmware', null);
const repeat = Math.max(1, Math.min(20, Number(option('--repeat', 1)) || 1));
const timeoutMs = Math.max(500, Math.min(10000, Number(option('--timeout', 3000)) || 3000));
// Test-only: fake consoles on 127.0.0.1 (same variables as desktop/server.mjs).
const TEST = process.env.VANTAFLOW_TEST === '1';
const ports = { ps4: Number(TEST && process.env.VANTAFLOW_TEST_PS4_PORT) || DDP.ps4.port, ps5: Number(TEST && process.env.VANTAFLOW_TEST_PS5_PORT) || DDP.ps5.port };
const providers = { ps4: createPs4Provider({ port: ports.ps4, timeoutMs }), ps5: createPs5Provider({ port: ports.ps5, timeoutMs }) };
const HEN = { ps4: 'GoldHEN', ps5: 'etaHEN' };
const POWER = { on: 'On', standby: 'Rest mode', unknown: 'Unknown' };

if (flag('--help') || (!address && !flag('--discover'))) {
  console.log(fs.readFileSync(new URL(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n'));
  process.exit(address || flag('--discover') ? 0 : 2);
}

// The console ID and the running game are never written anywhere.
const redact = (text) => text.split(/\r?\n/).map((l) => {
  if (/^(host-id|running-app-titleid|running-app-name)\s*:/i.test(l)) return `${l.split(':')[0]}:[removed by VantaFlow]`;
  if (flag('--hide-name') && /^host-name\s*:/i.test(l)) return 'host-name:[hidden]';
  return l;
}).join('\n');

function describe(gen, text, from) {
  const r = providers[gen].read(text, from);
  const reply = parseReply(text);
  const fw = r.detection.firmware;
  return {
    generation: gen,
    answeredFrom: from,
    rawReply: redact(text),
    statusLine: reply ? `${reply.code} ${reply.status}` : null,
    identified: r.retrieved.generation ?? null,
    name: flag('--hide-name') ? '[hidden]' : r.retrieved.name ?? null,
    power: r.retrieved.power ?? 'unknown',
    rawSystemVersion: reply?.systemVersion ?? null,
    firmware: { decoded: fw.version, confirmed: fw.verified, matchesWhatYouTyped: expectedFirmware && fw.version ? fw.version === expectedFirmware : null },
    model: 'Not available — no documented read-only method',
    homebrew: `${HEN[gen]}: Unsupported detection method — VantaFlow does not detect ${HEN[gen]}`,
    unavailable: r.unavailable,
    errors: r.errors,
  };
}

async function probe(gen) {
  const runs = [];
  for (let i = 0; i < repeat; i++) {
    const started = Date.now();
    let replies = [];
    let error = null;
    try {
      replies = await exchange({ address, port: ports[gen], message: searchMessage(gen), timeoutMs, first: true, onlyFrom: address });
    } catch (e) { error = e.message; }
    const ms = Date.now() - started;
    runs.push(replies[0] ? { ms, ...describe(gen, replies[0].text, replies[0].from) } : { ms, generation: gen, answered: false, error: error ?? `No reply within ${timeoutMs / 1000} s` });
  }
  return { generation: gen, request: `SRCH to ${address}:${ports[gen]} (protocol ${DDP[gen].protocolVersion})`, answered: runs.filter((r) => r.statusLine).length, of: repeat, runs };
}

function print(result) {
  console.log(`\n${result.generation.toUpperCase()} request: ${result.request}`);
  console.log(`  answered ${result.answered} of ${result.of}`);
  const r = result.runs.find((x) => x.statusLine) ?? result.runs[0];
  if (!r.statusLine) { console.log(`  no answer (${r.error}). No answer does not prove the device is not a ${result.generation.toUpperCase()}.`); return; }
  console.log(`  status line:      ${r.statusLine}`);
  console.log(`  identified as:    ${r.identified ? r.identified.toUpperCase() + ' (host-type and protocol version match)' : 'NOT identified — ' + (r.errors[0]?.message ?? '')}`);
  if (!r.identified) return;
  console.log(`  name:             ${r.name ?? '(none reported)'}`);
  console.log(`  power:            ${POWER[r.power]}`);
  console.log(`  system-version:   ${r.rawSystemVersion ?? '(none reported)'}`);
  if (result.generation === 'ps4') {
    if (!r.firmware.decoded) console.log('  firmware:         not available');
    else if (r.firmware.confirmed) console.log(`  firmware:         ${r.firmware.decoded} (decoding confirmed for firmware below 10.00)`);
    else console.log(`  firmware:         ${r.firmware.decoded} — NOT CONFIRMED. The decoding is documented only below 10.00. Please report the firmware shown in Settings > System > System Information together with the system-version above.`);
  } else {
    console.log('  firmware:         not available — no source documents how the PS5 system-version maps to firmware. Please report the firmware shown in Settings > System > System Software together with the system-version above.');
  }
  if (expectedFirmware) console.log(`  you typed:        ${expectedFirmware}${r.firmware.matchesWhatYouTyped === null ? ' (recorded in the report)' : r.firmware.matchesWhatYouTyped ? ' — matches' : ' — DOES NOT MATCH'}`);
  console.log('  model:            not available — no documented read-only method');
  console.log(`  ${HEN[result.generation]}:${' '.repeat(16 - HEN[result.generation].length)}Unsupported detection method — VantaFlow does not detect ${HEN[result.generation]}`.replace(':', ': '));
}

const report = {
  tool: 'vantaflow console-check', date: new Date().toISOString(), node: process.version, os: `${os.platform()} ${os.release()}`,
  readOnly: 'Only DDP SRCH requests were sent. Nothing was changed on any device.',
  mode: flag('--discover') ? 'discover' : 'address', address: address ?? null, expectedFirmware, timeoutMs, repeat, results: [],
};

if (flag('--discover')) {
  const targets = TEST ? ['127.0.0.1'] : broadcastTargets();
  console.log('Discovery sends one SRCH request for PS4 (UDP 987) and one for PS5 (UDP 9302) to this network\'s broadcast addresses');
  console.log(`(${targets.join(', ')}) and lists the consoles that answer. Nothing leaves your local network.`);
  if (!flag('--yes')) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question('Send the discovery requests? [y/N] ');
    rl.close();
    if (!/^y(es)?$/i.test(answer.trim())) { console.log('Nothing was sent.'); process.exit(0); }
  }
  for (const gen of ['ps4', 'ps5']) {
    for (const target of targets) {
      let replies = [];
      try { replies = await exchange({ address: target, port: ports[gen], message: searchMessage(gen), timeoutMs, broadcast: true }); } catch (e) { report.results.push({ generation: gen, target, error: e.message }); }
      for (const x of replies.filter((y) => isLocalAddress(y.from, { allowLoopback: TEST }))) report.results.push({ target, ...describe(gen, x.text, x.from) });
    }
  }
  const found = report.results.filter((r) => r.identified);
  console.log(found.length ? '' : '\nNo console answered. Check that it is on (or in rest mode with "Stay connected to the internet"), on this network, and try with its IP address.');
  for (const r of found) console.log(`  ${r.identified.toUpperCase()}  ${r.answeredFrom}  ${r.name ?? '(no name)'}  ${POWER[r.power]}  system-version ${r.rawSystemVersion ?? '—'}`);
} else {
  const check = validateAddress(address, { allowLoopback: TEST });
  if (!check.ok) { console.error(check.error); process.exit(2); }
  console.log(`Checking ${check.ip} (read-only: DDP SRCH only, ${timeoutMs / 1000} s timeout, ${repeat} time${repeat > 1 ? 's' : ''})`);
  for (const gen of ['ps4', 'ps5']) {
    const result = await probe(gen);
    report.results.push(result);
    print(result);
  }
  const identified = report.results.filter((r) => r.runs.some((x) => x.identified));
  console.log(`\nResult: ${identified.length ? identified.map((r) => r.generation.toUpperCase()).join(' and ') + ' identified' : 'no PlayStation identified at this address'}.`);
}

const file = option('--out', `console-check-${report.date.replace(/[:.]/g, '-')}.json`);
fs.writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
console.log(`\nReport written to ${file} (no console ID, no running game${flag('--hide-name') ? ', no console name' : ''}). Share it to record this physical test.`);
