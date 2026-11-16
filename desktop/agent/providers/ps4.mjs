// PS4 provider (desktop). Read-only. Uses only the PS4 Device Discovery Protocol on UDP 987.
// What it can verify, and what it cannot, is listed in docs/connectivity.md.
import { DDP, searchMessage, parseReply, generationOf, powerState, ps4Firmware } from '../ddp.mjs';
import { exchange } from '../udp.mjs';
import { report, error, unsupportedEnvironment } from '../report.mjs';

const UNAVAILABLE = [
  { field: 'model', reason: 'The DDP reply does not say whether this is a PS4, PS4 Slim or PS4 Pro, and no other documented read-only method was found.' },
  { field: 'goldhen', reason: 'GoldHEN documents no read-only status or version method. Its FTP/BinLoader/Klog ports answering would not prove GoldHEN is running, so they are not used.' },
];

export function createPs4Provider({ port = DDP.ps4.port, timeoutMs = 2000, send = exchange } = {}) {
  return {
    name: 'ps4-ddp',
    generation: 'ps4',
    method: `PlayStation Device Discovery Protocol: SRCH request on UDP ${port} (read-only)`,

    // Parses one reply that arrived from `address`. Also used by discovery.
    read(text, address) {
      const r = report({ provider: this.name, generation: 'ps4', method: this.method, address });
      r.attempted.push(`DDP SRCH (protocol ${DDP.ps4.protocolVersion}) to ${address}:${port}`);
      r.unavailable.push(...UNAVAILABLE);
      const reply = parseReply(text);
      const generation = generationOf(reply, 'ps4');
      r.answered = Boolean(reply);
      if (!reply) {
        r.errors.push(error('not-ddp', 'The device answered, but not with a PlayStation discovery reply.', 'Check the address.'));
      } else if (!generation) {
        r.errors.push(error('not-ps4', `The reply did not identify a PS4 (host-type "${reply.hostType ?? '—'}", protocol "${reply.protocolVersion ?? '—'}").`));
      }
      const fw = generation ? ps4Firmware(reply.systemVersion) : { version: null, confirmed: false, raw: reply?.systemVersion ?? null };
      if (generation && !fw.version) r.unavailable.push({ field: 'firmware', reason: 'The reply had no readable system-version.' });
      if (generation && fw.version && !fw.confirmed) r.unavailable.push({ field: 'firmware-confirmation', reason: `Decoded ${fw.version} from system-version ${fw.raw}; the decoding is documented only for firmware below 10.00.` });
      r.retrieved = generation ? { generation, name: reply.hostName, power: powerState(reply.code), systemVersion: fw.raw, firmware: fw.version } : {};
      r.detection = {
        connection: { state: generation ? 'connected' : 'unknown', transport: 'ddp-udp', address, lastSeen: r.at },
        network: { state: generation ? 'online' : 'unknown', power: generation ? powerState(reply.code) : 'unknown' },
        console: { generation, model: null, name: generation ? reply.hostName : null, verified: Boolean(generation), source: 'ddp' },
        firmware: { version: fw.version, verified: fw.confirmed, source: 'ddp', raw: fw.raw },
        environment: unsupportedEnvironment('GoldHEN', UNAVAILABLE[1].reason),
        storage: [],
        errors: r.errors,
        report: { provider: r.provider, method: r.method, attempted: r.attempted, unavailable: r.unavailable },
      };
      return r;
    },

    async probe(address) {
      try {
        const replies = await send({ address, port, message: searchMessage('ps4'), timeoutMs, first: true, onlyFrom: address });
        const reply = replies.find((x) => x.from === address); // never a reply from another device
        if (reply) return this.read(reply.text, address);
        const r = report({ provider: this.name, generation: 'ps4', method: this.method, address });
        r.attempted.push(`DDP SRCH (protocol ${DDP.ps4.protocolVersion}) to ${address}:${port}`);
        r.errors.push(error('timeout', `No PS4 discovery reply from ${address} within ${timeoutMs / 1000} s.`, 'Check the address, that the console is on, and that it is on this network. No reply does not prove the device is not a PS4.'));
        return r;
      } catch (e) {
        const r = report({ provider: this.name, generation: 'ps4', method: this.method, address });
        r.attempted.push(`DDP SRCH to ${address}:${port}`);
        r.errors.push(error(e.code ?? 'network-error', e.message, 'Check this computer\'s network connection.'));
        return r;
      }
    },
  };
}
