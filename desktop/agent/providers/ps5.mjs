// PS5 provider (desktop). Read-only. Uses only the PS5 Device Discovery Protocol on UDP 9302.
// Written separately from the PS4 provider on purpose: different port, protocol version and
// firmware encoding, and etaHEN instead of GoldHEN. See docs/connectivity.md.
import { DDP, searchMessage, parseReply, generationOf, powerState, ps5Firmware } from '../ddp.mjs';
import { exchange } from '../udp.mjs';
import { report, error, unsupportedEnvironment } from '../report.mjs';

const UNAVAILABLE = [
  { field: 'model', reason: 'The DDP reply does not say which PS5 this is (standard, Digital, Slim, Slim Digital or Pro), and no other documented read-only method was found.' },
  { field: 'firmware', reason: 'The PS5 reply has a system-version value, but no source documents how it maps to the firmware number shown on the console, so it is not converted.' },
  { field: 'etahen', reason: 'etaHEN documents no read-only status or version method. Its FTP, Klog or ELF-loader ports answering would not prove etaHEN is running, so they are not used.' },
];

export function createPs5Provider({ port = DDP.ps5.port, timeoutMs = 2000, send = exchange } = {}) {
  return {
    name: 'ps5-ddp',
    generation: 'ps5',
    method: `PlayStation Device Discovery Protocol: SRCH request on UDP ${port} (read-only)`,

    read(text, address) {
      const r = report({ provider: this.name, generation: 'ps5', method: this.method, address });
      r.attempted.push(`DDP SRCH (protocol ${DDP.ps5.protocolVersion}) to ${address}:${port}`);
      r.unavailable.push(...UNAVAILABLE);
      const reply = parseReply(text);
      const generation = generationOf(reply, 'ps5');
      r.answered = Boolean(reply);
      if (!reply) {
        r.errors.push(error('not-ddp', 'The device answered, but not with a PlayStation discovery reply.', 'Check the address.'));
      } else if (!generation) {
        r.errors.push(error('not-ps5', `The reply did not identify a PS5 (host-type "${reply.hostType ?? '—'}", protocol "${reply.protocolVersion ?? '—'}").`));
      }
      const fw = ps5Firmware(reply?.systemVersion);
      r.retrieved = generation ? { generation, name: reply.hostName, power: powerState(reply.code), systemVersion: fw.raw } : {};
      r.detection = {
        connection: { state: generation ? 'connected' : 'unknown', transport: 'ddp-udp', address, lastSeen: r.at },
        network: { state: generation ? 'online' : 'unknown', power: generation ? powerState(reply.code) : 'unknown' },
        console: { generation, model: null, name: generation ? reply.hostName : null, verified: Boolean(generation), source: 'ddp' },
        firmware: { version: null, verified: false, source: 'ddp', raw: fw.raw },
        environment: unsupportedEnvironment('etaHEN', UNAVAILABLE[2].reason),
        storage: [],
        errors: r.errors,
        report: { provider: r.provider, method: r.method, attempted: r.attempted, unavailable: r.unavailable },
      };
      return r;
    },

    async probe(address) {
      try {
        const replies = await send({ address, port, message: searchMessage('ps5'), timeoutMs, first: true, onlyFrom: address });
        const reply = replies.find((x) => x.from === address); // never a reply from another device
        if (reply) return this.read(reply.text, address);
        const r = report({ provider: this.name, generation: 'ps5', method: this.method, address });
        r.attempted.push(`DDP SRCH (protocol ${DDP.ps5.protocolVersion}) to ${address}:${port}`);
        r.errors.push(error('timeout', `No PS5 discovery reply from ${address} within ${timeoutMs / 1000} s.`, 'Check the address, that the console is on, and that it is on this network. No reply does not prove the device is not a PS5.'));
        return r;
      } catch (e) {
        const r = report({ provider: this.name, generation: 'ps5', method: this.method, address });
        r.attempted.push(`DDP SRCH to ${address}:${port}`);
        r.errors.push(error(e.code ?? 'network-error', e.message, 'Check this computer\'s network connection.'));
        return r;
      }
    },
  };
}
