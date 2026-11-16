// PS4 compatibility rules (GoldHEN). Kept separate from the PS5 rules on purpose.
//
// GoldHEN publishes a complete firmware list for every release (one payload file per firmware
// up to v2.3, a "Supported Firmware" list from v2.4b17), so a firmware missing from a release's
// list means that release does not support it.
import { STATUS, reason } from '../../models/index.js';
import { firmwareStatement, findRelease, releasesMentioning, describeFirmware, featuresFor, parseFirmware } from '../../compat/release-data.js';

export function assessPS4(d, { models, goldhen }) {
  const reasons = [];
  const add = (status, code, message) => reasons.push(reason(status, code, message));
  const out = { reasons, environment: 'GoldHEN', dataVerified: goldhen.lastVerified, sources: goldhen.sources, requirements: [], limitations: [] };

  // Model
  const model = models.find((m) => m.id === d.console.model);
  if (!model) add(STATUS.UNKNOWN, 'model-unknown', d.console.model ? `"${d.console.model}" is not a known PS4 model.` : 'The PS4 model was not reported.');
  else if (!d.console.verified) add(STATUS.UNKNOWN, 'model-unverified', `${model.name} was reported but not verified (source: ${d.console.source}).`);
  else add(STATUS.COMPATIBLE, 'model', `${model.name} (${model.group}). GoldHEN documents no model-specific requirement.`);

  // Firmware
  const fw = d.firmware.version;
  const fwKnown = parseFirmware(fw) != null;
  if (!fwKnown) add(STATUS.UNKNOWN, 'firmware-unknown', fw ? `Firmware "${fw}" is not a valid PS4 version number.` : 'The firmware version was not reported.');
  else if (!d.firmware.verified) add(STATUS.UNKNOWN, 'firmware-unverified', `Firmware ${fw} was not verified (source: ${d.firmware.source}).`);
  const listedBy = fwKnown ? releasesMentioning(goldhen, fw).map((r) => r.version) : [];
  const listedText = listedBy.length ? `Firmware ${fw} is listed by GoldHEN ${listedBy.join(', ')}.` : `No GoldHEN release lists firmware ${fw}.`;
  if (fwKnown && !listedBy.length) add(STATUS.UNSUPPORTED, 'firmware-not-documented', `No GoldHEN release (data verified ${goldhen.lastVerified}) lists firmware ${fw}.`);

  // Environment
  const env = d.environment;
  if (env.kind === 'etahen') {
    add(STATUS.UNSUPPORTED, 'environment-mismatch', 'etaHEN is a PS5 environment; it cannot run on a PS4.');
  } else if (env.state === 'absent') {
    add(STATUS.UNSUPPORTED, 'environment-absent', `GoldHEN is not running. VantaFlow's console features need GoldHEN on a PS4.${fwKnown ? ` ${listedText}` : ''}`);
  } else if (env.state === 'unsupported-method') {
    add(STATUS.UNKNOWN, 'environment-check-unsupported', `GoldHEN status cannot be checked: ${env.evidence ?? 'no documented read-only method exists.'}`);
  } else if (env.state === 'unknown') {
    add(STATUS.UNKNOWN, 'environment-unknown', 'Whether GoldHEN is running could not be determined.');
  } else if (env.kind !== 'goldhen') {
    add(STATUS.UNKNOWN, 'environment-unidentified', 'A homebrew environment is running, but it was not identified as GoldHEN.');
  } else if (!env.verified) {
    add(STATUS.UNKNOWN, 'environment-unverified', `GoldHEN is not verified: ${env.evidence ?? `source ${env.source}`}`);
  } else {
    const release = findRelease(goldhen, env.version);
    if (!release) {
      add(STATUS.UNKNOWN, 'version-unknown', `GoldHEN ${env.version ?? '(no version)'} is not in the researched release data (verified ${goldhen.lastVerified}).`);
    } else {
      out.release = release.version;
      out.requirements = [...release.requires];
      out.limitations.push(...release.knownIssues);
      if (release.channel === 'pre-release') out.limitations.push(`GoldHEN ${release.version} is published as a pre-release.`);
      const statement = fwKnown ? firmwareStatement(release, fw) : null;
      if (fwKnown && !statement) add(STATUS.UNSUPPORTED, 'firmware-not-in-release', `GoldHEN ${release.version} supports ${describeFirmware(release)}; ${fw} is not one of them. ${listedText}`);
      else if (statement) add(STATUS.COMPATIBLE, 'firmware-documented', `GoldHEN ${release.version} supports firmware ${fw} (${statement.evidence}).`);
      if (statement) {
        const f = featuresFor(goldhen, release, { firmware: fw, statement, model });
        Object.assign(out, { supported: f.supported, unsupported: f.unsupported, unverified: f.unverified });
        out.limitations.push(...f.limitations);
      }
    }
  }
  return out;
}
