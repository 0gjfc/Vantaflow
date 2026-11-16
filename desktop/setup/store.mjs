// VantaFlow's own data directory and the small file helpers every setup module uses.
//
// Layout (nothing outside it is ever written or deleted, except a PS4 package copied to the
// USB folder the user chose):
//   packages/        packages the user puts here to install (VantaFlow only reads them)
//   app/             the installed VantaFlow desktop app
//   installation.json  what is installed: version and the hash of every file
//   journal.json     the operation in progress or the last one (detects interruptions)
//   backups/<id>/    complete, verified backups;  backups/.incomplete-<id>/ while one is written
//   tmp/<name>/      VantaFlow's temporary files, each with a .vantaflow-temp marker
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

export function dataDir(env = process.env) {
  if (env.VANTAFLOW_DATA_DIR) return path.resolve(env.VANTAFLOW_DATA_DIR);
  const home = os.homedir();
  if (process.platform === 'win32') return path.join(env.APPDATA ?? path.join(home, 'AppData', 'Roaming'), 'VantaFlow');
  if (process.platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'VantaFlow');
  return path.join(env.XDG_DATA_HOME ?? path.join(home, '.local', 'share'), 'vantaflow');
}

export function layout(root) {
  const d = {
    root,
    packages: path.join(root, 'packages'),
    app: path.join(root, 'app'),
    installation: path.join(root, 'installation.json'),
    journal: path.join(root, 'journal.json'),
    backups: path.join(root, 'backups'),
    tmp: path.join(root, 'tmp'),
  };
  for (const dir of [d.packages, d.backups, d.tmp]) fs.mkdirSync(dir, { recursive: true });
  return d;
}

export const MARKER = '.vantaflow-temp';
export const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
export const sha256File = (file) => sha256(fs.readFileSync(file));
export const newId = (prefix) => `${prefix}-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${crypto.randomBytes(3).toString('hex')}`;

// True only when `p` is `dir` itself or inside it (after resolving `..`).
export function inside(dir, p) {
  const rel = path.relative(path.resolve(dir), path.resolve(p));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

// A relative path from a package or backup: no absolute paths, no `..`, no drive letters.
export const safeRelative = (p) => typeof p === 'string' && p.length > 0 && p.length < 400
  && !p.includes('\\') && !p.includes('\0') && !path.posix.isAbsolute(p) && !/^[a-zA-Z]:/.test(p)
  && p.split('/').every((part) => part && part !== '.' && part !== '..');

export function readJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

// Write to a temporary name, flush, then rename: a crash leaves the old file or the new one,
// never half of each.
export function writeJsonAtomic(file, value) {
  const tmp = `${file}.${process.pid}.writing`;
  const fd = fs.openSync(tmp, 'w');
  try {
    fs.writeSync(fd, `${JSON.stringify(value, null, 2)}\n`);
    fs.fsyncSync(fd);
  } finally { fs.closeSync(fd); }
  fs.renameSync(tmp, file);
}

// Every file under `dir` as relative POSIX paths (symlinks are listed but never followed).
export function listFiles(dir, base = dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listFiles(full, base));
    else out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out.sort();
}

// { path, size, sha256 } for every regular file under `dir`.
export const fileTable = (dir) => listFiles(dir).map((p) => {
  const full = path.join(dir, p);
  const st = fs.lstatSync(full);
  return st.isFile() ? { path: p, size: st.size, sha256: sha256File(full) } : { path: p, size: 0, sha256: null, notAFile: true };
});

// Compares a directory with an expected file table. Returns the problems found.
export function verifyTable(dir, table) {
  const problems = [];
  for (const f of table) {
    const full = path.join(dir, f.path);
    if (!fs.existsSync(full)) { problems.push({ path: f.path, problem: 'missing' }); continue; }
    const st = fs.lstatSync(full);
    if (!st.isFile()) problems.push({ path: f.path, problem: 'not a file' });
    else if (st.size !== f.size) problems.push({ path: f.path, problem: `size ${st.size}, expected ${f.size}` });
    else if (sha256File(full) !== f.sha256) problems.push({ path: f.path, problem: 'content changed (checksum)' });
  }
  return problems;
}

export function copyTree(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const p of listFiles(from)) {
    const src = path.join(from, p);
    if (!fs.lstatSync(src).isFile()) continue; // never copy symlinks or special files
    fs.mkdirSync(path.dirname(path.join(to, p)), { recursive: true });
    fs.copyFileSync(src, path.join(to, p));
  }
}

// A temporary folder in tmp/ with a marker saying VantaFlow made it, for what and when.
// Cleanup removes only folders with a valid marker.
export function makeTemp(d, purpose, opId) {
  const dir = path.join(d.tmp, newId(purpose));
  fs.mkdirSync(dir, { recursive: true });
  writeJsonAtomic(path.join(dir, MARKER), { createdBy: 'vantaflow', purpose, opId, createdAt: new Date().toISOString() });
  return dir;
}

// Test-only fault injection: VANTAFLOW_TEST_CRASH_AT=<step> stops the process at that step,
// like a power cut; VANTAFLOW_TEST_FAIL_AT=<step> throws there. Ignored outside test mode.
export function checkpoint(step, env = process.env) {
  if (env.VANTAFLOW_TEST !== '1') return;
  if (env.VANTAFLOW_TEST_CRASH_AT === step) process.exit(70);
  if (env.VANTAFLOW_TEST_FAIL_AT === step) throw Object.assign(new Error(`Simulated failure at "${step}" (test mode).`), { code: 'simulated-failure' });
}
