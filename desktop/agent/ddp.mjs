// PlayStation Device Discovery Protocol (DDP) — message format only, no networking.
//
// DDP is the discovery service PS4 and PS5 consoles answer for Sony's Remote Play / Second
// Screen apps. Sony does not publish it; this follows the documentation in well-known
// open-source implementations (see docs/connectivity.md):
//   chiaki-ng   lib/include/chiaki/discovery.h, lib/src/discovery.c
//   pyremoteplay / pyps4-2ndscreen  ddp.py
//   Home Assistant core  components/ps4/media_player.py  (system-version → firmware)
// VantaFlow only ever sends the read-only SRCH request. WAKEUP and LAUNCH (which change the
// console's state and need the user's credential) are deliberately not implemented.

export const DDP = Object.freeze({
  ps4: { port: 987, protocolVersion: '00020020', hostType: 'PS4' },
  ps5: { port: 9302, protocolVersion: '00030010', hostType: 'PS5' },
});

// "SRCH * HTTP/1.1\ndevice-discovery-protocol-version:<version>\n"
export const searchMessage = (generation) => `SRCH * HTTP/1.1\ndevice-discovery-protocol-version:${DDP[generation].protocolVersion}\n`;

// Parses a reply. Returns null when the text is not a DDP reply at all.
// Fields VantaFlow does not need (running-app-titleid, running-app-name, host-id) are dropped
// here so they are never stored or shown.
export function parseReply(text) {
  if (typeof text !== 'string') return null;
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const status = /^HTTP\/1\.1 (\d{3}) ?(.*)$/.exec(lines[0] ?? '');
  if (!status) return null;
  const fields = {};
  for (const line of lines.slice(1)) {
    const i = line.indexOf(':');
    if (i > 0) fields[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return {
    code: Number(status[1]),
    status: status[2],
    hostType: fields['host-type'] ?? null,
    hostName: fields['host-name'] ?? null,
    systemVersion: fields['system-version'] ?? null,
    protocolVersion: fields['device-discovery-protocol-version'] ?? null,
    requestPort: fields['host-request-port'] ? Number(fields['host-request-port']) : null,
  };
}

// 200 = on, 620 = rest mode ("Server Standby"); anything else is not interpreted.
export const powerState = (code) => (code === 200 ? 'on' : code === 620 ? 'standby' : 'unknown');

// Which generation a reply proves. A reply counts only if host-type AND protocol version agree
// with the generation that was asked on that generation's port; anything else is "unknown".
export function generationOf(reply, askedGeneration) {
  const want = DDP[askedGeneration];
  if (!reply || !want) return null;
  return reply.hostType === want.hostType && reply.protocolVersion === want.protocolVersion ? askedGeneration : null;
}

// PS4 system-version → firmware. Home Assistant's PS4 integration reads digits 2–4 of the
// 8-digit value as X.YZ ("07020001" → "7.02"), which matches chiaki-ng's thresholds
// (8000000 = PS4 8.0). That reading is confirmed only for a leading "0" (firmware 1.00–9.99).
// For 10.00 and later the same layout gives "10.50", but no source shows such a value, so the
// result is returned as unconfirmed.
export function ps4Firmware(systemVersion) {
  if (!/^\d{8}$/.test(systemVersion ?? '')) return { version: null, confirmed: false, raw: systemVersion ?? null };
  const major = Number(systemVersion.slice(0, 2));
  const version = `${major}.${systemVersion.slice(2, 4)}`;
  return { version: major >= 1 ? version : null, confirmed: systemVersion[0] === '0' && major >= 1, raw: systemVersion };
}

// PS5 system-version: chiaki-ng only compares it with thresholds (≥ 8050001 means "PS5 1.0 or
// later" for protocol selection). No source documents how it maps to the firmware number shown
// on the console, so VantaFlow reports the raw value and no firmware version.
export const ps5Firmware = (systemVersion) => ({ version: null, confirmed: false, raw: systemVersion ?? null });
