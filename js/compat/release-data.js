// Helpers for reading researched release data (shared/compatibility/*.json).
// Pure lookups only — no decisions. Each platform's compat.js decides what the matches mean.

// PlayStation firmware versions look like "9.00" or "10.01" (major.two-digit minor).
const FW = /^(\d{1,2})\.(\d{2})$/;
export const parseFirmware = (v) => {
  const m = FW.exec(v ?? '');
  return m ? Number(m[1]) * 100 + Number(m[2]) : null;
};

// The statement in `release` that covers firmware `fw`; "documented" beats "limited".
export function firmwareStatement(release, fw) {
  const n = parseFirmware(fw);
  if (n == null) return null;
  let best = null;
  for (const s of release.firmware) {
    const hit = s.versions ? s.versions.some((v) => parseFirmware(v) === n) : n >= parseFirmware(s.range[0]) && n <= parseFirmware(s.range[1]);
    if (hit && (!best || (best.level === 'limited' && s.level === 'documented'))) best = s;
  }
  return best;
}

export const findRelease = (data, version) => data.releases.find((r) => r.version === version) ?? null;

// Releases (newest first) whose own notes or files mention this firmware.
export const releasesMentioning = (data, fw) => data.releases.filter((r) => firmwareStatement(r, fw));

// Human-readable list of what a release states, e.g. "5.05, 6.72, 9.00" or "8.40–10.01".
export const describeFirmware = (release) => release.firmware
  .map((s) => (s.versions ? s.versions.join(', ') : `${s.range[0]}–${s.range[1]}`) + (s.level === 'limited' ? ' (limited)' : ''))
  .join('; ') || 'no firmware statement';

// Features of the environment for one release, split by what the researched data supports.
// `context`: { firmware, statement, model } — model.discDrive is 'built-in' | 'optional' | 'none'.
export function featuresFor(data, release, { firmware, statement, model }) {
  const index = (v) => data.releases.findIndex((r) => r.version === v); // newest first
  const out = { supported: [], unsupported: [], unverified: [], limitations: [] };
  const n = parseFirmware(firmware);
  for (const f of data.features) {
    const restriction = (release.restrictions || []).find((r) => r.feature === f.id && n != null && n >= parseFirmware(r.range[0]) && n <= parseFirmware(r.range[1]));
    if (f.since && index(release.version) > index(f.since)) out.unsupported.push({ label: f.label, why: `Added in ${data.name} ${f.since}.` });
    else if (f.firmware && !(n >= parseFirmware(f.firmware[0]) && n <= parseFirmware(f.firmware[1]))) out.unsupported.push({ label: f.label, why: `Only on firmware ${f.firmware[0]}–${f.firmware[1]}.` });
    else if (restriction) out.unsupported.push({ label: f.label, why: restriction.text });
    else if (f.requires?.includes('disc-drive') && model?.discDrive === 'none') out.unsupported.push({ label: f.label, why: `${model.name} has no disc drive.` });
    else if (!f.since && release.version !== data.readmeDescribes) out.unverified.push({ label: f.label, why: `Listed in the current README (${data.name} ${data.readmeDescribes}); the release that added it is not documented.` });
    else if (statement?.level === 'limited') out.unverified.push({ label: f.label, why: `Support on firmware ${firmware} is documented as limited: ${statement.evidence}.` });
    else {
      out.supported.push(f.label);
      if (f.experimental) out.limitations.push(`${f.label}: experimental. ${f.note ?? ''}`.trim());
      if (f.requires?.includes('disc-drive') && model?.discDrive === 'optional') out.limitations.push(`${f.label}: needs the detachable disc drive attached.`);
    }
  }
  return out;
}
