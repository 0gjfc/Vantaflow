// Console discovery and manual addresses (desktop). Local network only, user-initiated only.
//
// Discovery sends ONE DDP SRCH datagram per console generation (UDP 987 for PS4, UDP 9302 for
// PS5) to the local network's broadcast addresses and listens briefly for replies. No port
// scanning, no other ports, no unicast sweeps of address ranges. A device counts as a console
// only when its reply identifies it (host-type and protocol version), never because it answered.
import os from 'node:os';
import { searchMessage, DDP } from './ddp.mjs';
import { exchange } from './udp.mjs';

// Private (RFC 1918) and link-local IPv4 only: VantaFlow never contacts internet addresses.
export function isLocalAddress(ip, { allowLoopback = false } = {}) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip ?? '');
  if (!m) return false;
  const [a, b, c, d] = m.slice(1).map(Number);
  if ([a, b, c, d].some((n) => n > 255)) return false;
  if (a === 127) return allowLoopback; // tests only
  if (d === 0 || d === 255) return false; // network / broadcast address, not a device
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
}

export function validateAddress(input, options) {
  const ip = String(input ?? '').trim();
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return { ok: false, error: 'Enter an IPv4 address such as 192.168.1.20.' };
  if (!isLocalAddress(ip, options)) return { ok: false, error: `${ip} is not a local network address. VantaFlow only connects to consoles on your own network (10.x, 172.16–31.x, 192.168.x, 169.254.x).` };
  return { ok: true, ip };
}

// Broadcast addresses of this computer's IPv4 networks, plus the limited broadcast address.
export function broadcastTargets() {
  const targets = new Set(['255.255.255.255']);
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      const ip = a.address.split('.').map(Number);
      const mask = a.netmask.split('.').map(Number);
      targets.add(ip.map((o, i) => (o & mask[i]) | (~mask[i] & 255)).join('.'));
    }
  }
  return [...targets];
}

// Returns { devices, errors, sent }. `providers`: { ps4, ps5 } (each with read()).
export async function discover({ providers, targets = broadcastTargets(), ports = { ps4: DDP.ps4.port, ps5: DDP.ps5.port }, timeoutMs = 2500, send = exchange, allowLoopback = false }) {
  const devices = new Map();
  const errors = [];
  const sent = [];
  await Promise.all(Object.entries(providers).flatMap(([generation, provider]) => targets.map(async (target) => {
    sent.push(`DDP SRCH to ${target}:${ports[generation]}`);
    try {
      const replies = await send({ address: target, port: ports[generation], message: searchMessage(generation), timeoutMs, broadcast: true });
      for (const { text, from } of replies) {
        if (!isLocalAddress(from, { allowLoopback })) continue;
        const r = provider.read(text, from);
        if (r.retrieved.generation) devices.set(`${generation}@${from}`, r);
      }
    } catch (e) {
      errors.push({ code: e.code ?? 'network-error', message: `${target}:${ports[generation]}: ${e.message}`, recoverable: true });
    }
  })));
  return { devices: [...devices.values()], errors, sent };
}
