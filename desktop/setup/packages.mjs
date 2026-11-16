// VantaFlow packages: reading and validating them. Nothing here installs anything.
//
// Desktop package (.vfpkg): gzip-compressed JSON
//   { format: "vantaflow-package", formatVersion: 1,
//     manifest: { id, name, version, platform: "desktop", requires: { node }, description, created },
//     files: [{ path, size, sha256, data (base64) }] }
// PS4 package (.pkg): only the header is read (big-endian, layout as in LibOrbisPkg's
//   PkgReader.ReadHeader): magic "\x7FCNT" at 0x00, content ID (36 characters) at 0x40,
//   DRM type at 0x70, content type at 0x74, package size (u64) at 0x430.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { sha256, safeRelative } from './store.mjs';

const IDENTITY = JSON.parse(fs.readFileSync(new URL('../../shared/packages.json', import.meta.url), 'utf8'));
export { IDENTITY };
const MAX_DESKTOP = 200 * 1024 * 1024;
const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

export const compareVersions = (a, b) => {
  const x = SEMVER.exec(a).slice(1).map(Number);
  const y = SEMVER.exec(b).slice(1).map(Number);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return Math.sign(x[i] - y[i]);
  return 0;
};

function fileProblem(file, max) {
  if (!fs.existsSync(file)) return 'The package file does not exist (it may have been moved or deleted).';
  const st = fs.lstatSync(file);
  if (!st.isFile()) return 'This is not a regular file.';
  if (st.size === 0) return 'The package file is empty.';
  if (max && st.size > max) return `The package is larger than ${max / 1024 / 1024} MB.`;
  return null;
}

// Reads and checks a desktop package. Returns { ok, errors[], warnings[], manifest, files[] }.
// `files` carries the decoded contents only when ok.
export function readDesktopPackage(file, { nodeMajor = Number(process.versions.node.split('.')[0]) } = {}) {
  const want = IDENTITY.desktop;
  const result = { ok: false, kind: 'desktop', file, errors: [], warnings: [], manifest: null, files: [] };
  const missing = fileProblem(file, MAX_DESKTOP);
  if (missing) { result.errors.push(missing); return result; }
  let pkg;
  try {
    pkg = JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString('utf8'));
  } catch {
    result.errors.push('The file is not a readable VantaFlow package (it is damaged, incomplete or another kind of file).');
    return result;
  }
  const m = pkg?.manifest;
  if (pkg?.format !== 'vantaflow-package' || pkg?.formatVersion !== want.formatVersion || !m) {
    result.errors.push('The file is not a VantaFlow package in a format this version understands.');
    return result;
  }
  result.manifest = { id: m.id, name: m.name, version: m.version, platform: m.platform, requires: m.requires ?? {}, description: m.description ?? '', created: m.created ?? null };
  if (m.id !== want.id) result.errors.push(`This package is "${m.id}", not VantaFlow desktop. VantaFlow installs only its own packages.`);
  if (m.platform !== 'desktop') result.errors.push(`This package is for "${m.platform}", not for the desktop.`);
  if (!SEMVER.test(m.version ?? '')) result.errors.push(`The version "${m.version}" is not valid (expected e.g. 0.5.0).`);
  const needNode = Number(String(m.requires?.node ?? `>=${want.minNodeMajor}`).replace(/[^\d]/g, '')) || want.minNodeMajor;
  if (nodeMajor < needNode) result.errors.push(`It needs Node.js ${needNode} or later; this computer has Node.js ${nodeMajor}.`);
  const files = Array.isArray(pkg.files) ? pkg.files : [];
  if (!files.length) result.errors.push('The package contains no files.');
  const seen = new Set();
  for (const f of files) {
    if (!safeRelative(f?.path)) { result.errors.push(`Unsafe file path in the package: "${String(f?.path).slice(0, 80)}".`); continue; }
    if (seen.has(f.path)) { result.errors.push(`The file "${f.path}" appears twice.`); continue; }
    seen.add(f.path);
    const data = Buffer.from(String(f.data ?? ''), 'base64');
    if (data.length !== f.size) result.errors.push(`"${f.path}": size ${data.length}, the manifest says ${f.size}.`);
    else if (sha256(data) !== f.sha256) result.errors.push(`"${f.path}": checksum does not match (the package is damaged).`);
    else result.files.push({ path: f.path, size: f.size, sha256: f.sha256, data });
  }
  for (const req of want.requiredFiles) if (!seen.has(req)) result.errors.push(`A required part is missing: ${req}.`);
  result.ok = result.errors.length === 0;
  if (!result.ok) result.files = [];
  result.totalSize = result.files.reduce((n, f) => n + f.size, 0);
  return result;
}

// Builds a desktop package from a folder (used by tools/build-package.mjs and the tests).
export function buildDesktopPackage(fromDir, filePaths, manifest) {
  const files = filePaths.map((p) => {
    const data = fs.readFileSync(path.join(fromDir, p));
    return { path: p, size: data.length, sha256: sha256(data), data: data.toString('base64') };
  });
  return zlib.gzipSync(JSON.stringify({ format: 'vantaflow-package', formatVersion: IDENTITY.desktop.formatVersion, manifest: { id: IDENTITY.desktop.id, platform: 'desktop', requires: { node: `>=${IDENTITY.desktop.minNodeMajor}` }, created: new Date().toISOString(), ...manifest }, files }));
}

const CONTENT_TYPE = { 0x1a: 'Application or patch (GD)', 0x1b: 'Additional content with data (AC)', 0x1c: 'Additional content without data (AL)', 0x1e: 'Delta patch (DP)' };
const DRM_TYPE = { 0x0: 'none', 0xf: 'PS4' };

// Reads and checks a PS4 package header. Read-only; the package body is never decrypted.
export function readPs4Package(file) {
  const want = IDENTITY.ps4;
  const result = { ok: false, kind: 'ps4', file, errors: [], warnings: [], header: null };
  const missing = fileProblem(file);
  if (missing) { result.errors.push(missing); return result; }
  const size = fs.statSync(file).size;
  if (size < 0x480) { result.errors.push('The file is too small to be a PS4 package.'); return result; }
  const head = Buffer.alloc(0x480);
  const fd = fs.openSync(file, 'r');
  try { fs.readSync(fd, head, 0, head.length, 0); } finally { fs.closeSync(fd); }
  if (head.toString('latin1', 0, 4) !== '\x7FCNT') { result.errors.push('This is not a PS4 package (the "CNT" header is missing).'); return result; }
  const contentId = head.toString('latin1', 0x40, 0x40 + 0x30).replace(/\0.*$/s, '');
  const h = {
    contentId,
    titleId: contentId.slice(7, 16),
    contentType: head.readUInt32BE(0x74),
    contentTypeName: CONTENT_TYPE[head.readUInt32BE(0x74)] ?? 'unknown',
    drmType: DRM_TYPE[head.readUInt32BE(0x70)] ?? `unknown (0x${head.readUInt32BE(0x70).toString(16)})`,
    entryCount: head.readUInt32BE(0x10),
    bodySize: Number(head.readBigUInt64BE(0x28)),
    declaredSize: Number(head.readBigUInt64BE(0x430)),
    fileSize: size,
  };
  result.header = h;
  if (!/^[A-Z]{2}[0-9]{4}-[A-Z]{4}[0-9]{5}_00-[A-Z0-9]{16}$/.test(contentId)) result.errors.push(`The content ID "${contentId}" is not in the PS4 format (e.g. UP0000-CUSA00000_00-0000000000000000).`);
  if (h.declaredSize && h.declaredSize !== size) result.errors.push(`The package is ${size} bytes but its header says ${h.declaredSize}: it is incomplete or damaged.`);
  if (!h.declaredSize) result.warnings.push('The header does not state the package size, so completeness could not be checked.');
  if (h.contentType !== 0x1a) result.errors.push(`This is a "${h.contentTypeName}" package, not an application.`);
  if (contentId !== want.contentId) result.errors.push(`This package is ${contentId} (title ${h.titleId}), not VantaFlow (${want.contentId}). VantaFlow installs only its own package.`);
  result.ok = result.errors.length === 0;
  return result;
}

// Builds a header-only mock PS4 package for tests (not a working package).
export function mockPs4Package({ contentId = IDENTITY.ps4.contentId, contentType = 0x1a, size = 0x1000, declaredSize = size } = {}) {
  const b = Buffer.alloc(size);
  b.write('\x7FCNT', 0, 'latin1');
  b.write(contentId, 0x40, 'latin1');
  b.writeUInt32BE(0xf, 0x70);
  b.writeUInt32BE(contentType, 0x74);
  b.writeBigUInt64BE(BigInt(declaredSize), 0x430);
  return b;
}

// Everything in the packages folder, each with its check result. Unknown files are listed as
// such and never touched.
export function listPackages(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => {
    const file = path.join(dir, e.name);
    const ext = path.extname(e.name).toLowerCase();
    const r = ext === IDENTITY.desktop.extension ? readDesktopPackage(file)
      : ext === '.pkg' ? readPs4Package(file)
        : ext === '.apk' ? { ok: false, kind: 'android', file, errors: ['Android packages are installed from the VantaFlow companion app on the phone (Install & recovery → Install update from APK file).'], warnings: [] }
          : { ok: false, kind: 'unknown', file, errors: ['Not a VantaFlow package. Left untouched.'], warnings: [] };
    const { files, ...summary } = r;
    return { name: e.name, size: fs.statSync(file).size, ...summary };
  }).sort((a, b) => a.name.localeCompare(b.name));
}
