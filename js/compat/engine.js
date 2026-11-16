// Compatibility engine.
//
// Flow shared by every platform: connection → generation → that platform's own rules
// (js/platform/ps4/compat.js or js/platform/ps5/compat.js) → one result with a reason for
// every check. The worst check decides the status:
//   not-detected > unsupported > unknown > partial > compatible
// A last guard downgrades anything to "unknown" if the console, model, firmware or homebrew
// environment is not identified and verified — an unverified configuration is never reported
// as compatible.
import { STATUS, reason, compatibilityResult, detectionResult } from '../models/index.js';

const RANK = { 'not-detected': 4, unsupported: 3, unknown: 2, partial: 1, compatible: 0 };
export const worstStatus = (reasons) => reasons.reduce((s, r) => (RANK[r.status] > RANK[s] ? r.status : s), STATUS.COMPATIBLE);

const fullyVerified = (d) => Boolean(d.console.verified && d.console.model && d.firmware.verified && d.firmware.version
  && d.environment.verified && d.environment.state === 'active' && d.environment.kind && d.environment.version);

// `platforms`: { ps4: { assess(detection) }, ps5: { assess(detection) } }
export function evaluate(input, platforms, now = new Date().toISOString()) {
  const d = detectionResult(input);
  if (d.connection.state !== 'connected') {
    const why = d.errors[0]?.message
      ?? (d.connection.lastSeen ? `The console is not connected (last seen ${d.connection.lastSeen}). Nothing can be checked until it is detected again.` : 'No console is connected.');
    return compatibilityResult({ status: STATUS.NOT_DETECTED, reasons: [reason(STATUS.NOT_DETECTED, 'not-connected', why)], evaluatedAt: now });
  }
  const platform = platforms[d.console.generation];
  if (!platform) {
    return compatibilityResult({
      status: STATUS.UNKNOWN,
      reasons: [reason(STATUS.UNKNOWN, 'generation-unknown', 'The console could not be identified as a PS4 or a PS5, so no compatibility rules can be applied.')],
      evaluatedAt: now,
    });
  }
  const r = platform.assess(d);
  const reasons = [...r.reasons];
  let status = worstStatus(reasons);
  if ((status === STATUS.COMPATIBLE || status === STATUS.PARTIAL) && !fullyVerified(d)) {
    reasons.push(reason(STATUS.UNKNOWN, 'not-verified', 'Some console details are not verified, so compatibility cannot be confirmed.'));
    status = STATUS.UNKNOWN;
  }
  return compatibilityResult({ ...r, status, reasons, evaluatedAt: now });
}
