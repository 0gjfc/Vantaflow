// PS5 compatibility rules (etaHEN). Kept separate from the PS4 rules on purpose.
//
// etaHEN release notes only mention firmware a release adds, fixes or tests; there is no
// complete list. So:
//   firmware stated by this release (documented) → compatible
//   stated by this release as limited / untested → partially compatible
//   stated only by other releases                 → unknown (not restated for this release)
//   stated by no release                           → unsupported (not documented anywhere)
// etaHEN also relies on parts loaded separately (ELF loader, kstuff); a release that requires
// a part the detection reports missing makes the result unknown.
import { STATUS, reason } from '../../models/index.js';
import { firmwareStatement, findRelease, releasesMentioning, featuresFor, parseFirmware } from '../../compat/release-data.js';

const COMPONENT_NAMES = { elfldr: 'Payload SDK ELF loader', kstuff: 'kstuff' };

export function assessPS5(d, { models, etahen }) {
  const reasons = [];
  const add = (status, code, message) => reasons.push(reason(status, code, message));
  const out = { reasons, environment: 'etaHEN', dataVerified: etahen.lastVerified, sources: etahen.sources, requirements: [], limitations: [] };

  // Model
  const model = models.find((m) => m.id === d.console.model);
  if (!model) add(STATUS.UNKNOWN, 'model-unknown', d.console.model ? `"${d.console.model}" is not a known PS5 model.` : 'The PS5 model was not reported.');
  else if (!d.console.verified) add(STATUS.UNKNOWN, 'model-unverified', `${model.name} was reported but not verified (source: ${d.console.source}).`);
  else add(STATUS.COMPATIBLE, 'model', `${model.name} (${model.group}). etaHEN documents no model-specific requirement.`);

  // Firmware
  const fw = d.firmware.version;
  const fwKnown = parseFirmware(fw) != null;
  if (!fwKnown) add(STATUS.UNKNOWN, 'firmware-unknown', fw ? `Firmware "${fw}" is not a valid PS5 version number.` : 'The firmware version was not reported.');
  else if (!d.firmware.verified) add(STATUS.UNKNOWN, 'firmware-unverified', `Firmware ${fw} was not verified (source: ${d.firmware.source}).`);
  const mentionedBy = fwKnown ? releasesMentioning(etahen, fw).map((r) => r.version) : [];
  const mentionedText = mentionedBy.length ? `Firmware ${fw} is mentioned by etaHEN ${mentionedBy.join(', ')}.` : `No etaHEN release mentions firmware ${fw}.`;
  if (fwKnown && !mentionedBy.length) add(STATUS.UNSUPPORTED, 'firmware-not-documented', `No etaHEN release note (data verified ${etahen.lastVerified}) mentions firmware ${fw}.`);

  // Environment
  const env = d.environment;
  if (env.kind === 'goldhen') {
    add(STATUS.UNSUPPORTED, 'environment-mismatch', 'GoldHEN is a PS4 environment; it cannot run on a PS5.');
  } else if (env.state === 'absent') {
    add(STATUS.UNSUPPORTED, 'environment-absent', `etaHEN is not running. VantaFlow's console features need etaHEN on a PS5.${fwKnown ? ` ${mentionedText}` : ''}`);
  } else if (env.state === 'unknown') {
    add(STATUS.UNKNOWN, 'environment-unknown', 'Whether etaHEN is running could not be determined.');
  } else if (env.kind !== 'etahen') {
    add(STATUS.UNKNOWN, 'environment-unidentified', 'A homebrew environment is running, but it was not identified as etaHEN.');
  } else if (!env.verified) {
    add(STATUS.UNKNOWN, 'environment-unverified', `etaHEN is not verified: ${env.evidence ?? `source ${env.source}`}`);
  } else {
    const release = findRelease(etahen, env.version);
    if (!release) {
      add(STATUS.UNKNOWN, 'version-unknown', `etaHEN ${env.version ?? '(no version)'} is not in the researched release data (verified ${etahen.lastVerified}).`);
    } else {
      out.release = release.version;
      out.requirements = [...release.requires];
      out.limitations.push(...release.knownIssues);
      for (const c of release.requiresComponents || []) {
        if (env.components[c] === false) add(STATUS.UNKNOWN, 'component-missing', `etaHEN ${release.version} needs the ${COMPONENT_NAMES[c] ?? c} to load, but detection reports it missing. The detection result is inconsistent.`);
      }
      if (env.components.kstuff === false) out.limitations.push('kstuff is not loaded, so features that depend on it are unavailable.');
      const statement = fwKnown ? firmwareStatement(release, fw) : null;
      if (fwKnown && !statement && mentionedBy.length) add(STATUS.UNKNOWN, 'firmware-not-restated', `etaHEN ${release.version} release notes do not mention firmware ${fw}. ${mentionedText} Support is not assumed to carry over.`);
      else if (statement?.level === 'limited') add(STATUS.PARTIAL, 'firmware-limited', `etaHEN ${release.version} documents only limited support on ${fw}: ${statement.evidence}.`);
      else if (statement) add(STATUS.COMPATIBLE, 'firmware-documented', `etaHEN ${release.version} documents firmware ${fw}: ${statement.evidence}.`);
      if (statement) {
        const f = featuresFor(etahen, release, { firmware: fw, statement, model });
        Object.assign(out, { supported: f.supported, unsupported: f.unsupported, unverified: f.unverified });
        out.limitations.push(...f.limitations);
        if ((release.restrictions || []).some((r) => f.unsupported.some((u) => u.why === r.text))) {
          add(STATUS.PARTIAL, 'feature-restricted', `etaHEN ${release.version} disables some features on firmware ${fw}.`);
        }
      }
    }
  }
  return out;
}
