// Local API for installation, backups, recovery and cleanup (used by the desktop UI through the
// agent in desktop/server.mjs, which already restricts callers to this computer's VantaFlow page).
// Read-only questions are answered here; every operation that changes files runs in its own
// process (run.mjs) after the UI sent `confirmed: true`, and reports progress.
import { spawn } from 'node:child_process';
import path from 'node:path';
import crypto from 'node:crypto';
import { layout, dataDir } from './store.mjs';
import { listPackages } from './packages.mjs';
import { listBackups, backupSettings } from './backups.mjs';
import { installState, diagnose, planInstall, planRemove, planRestoreApp, planPs4Copy } from './installer.mjs';
import { previewCleanup } from './cleanup.mjs';

const RUNNER = new URL('./run.mjs', import.meta.url).pathname;
const ops = new Map();
let running = null;
const dirs = () => layout(dataDir());

// A package is named by its file name in the packages folder, never by an arbitrary path.
function packagePath(d, name) {
  if (typeof name !== 'string' || !name || path.basename(name) !== name) throw Object.assign(new Error('Choose a package from the packages folder.'), { code: 'bad-package' });
  return path.join(d.packages, name);
}

function startOp(op, args) {
  if (running && ops.get(running)?.state === 'running') throw Object.assign(new Error('Another operation is still running.'), { code: 'busy' });
  const id = crypto.randomBytes(6).toString('hex');
  const entry = { id, op, state: 'running', progress: null, result: null, error: null, startedAt: new Date().toISOString() };
  ops.set(id, entry);
  running = id;
  const child = spawn(process.execPath, [RUNNER, op], { env: process.env, stdio: ['pipe', 'pipe', 'inherit'] });
  let buffer = '';
  child.stdout.on('data', (c) => {
    buffer += c;
    let i;
    while ((i = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, i);
      buffer = buffer.slice(i + 1);
      try {
        const msg = JSON.parse(line);
        if (msg.progress) entry.progress = msg.progress;
        if (msg.result) entry.result = msg.result;
        if (msg.error) entry.error = msg.error;
      } catch { /* not a protocol line */ }
    }
  });
  child.on('exit', (code) => {
    entry.state = entry.result ? 'done' : 'failed';
    if (!entry.result && !entry.error) entry.error = { code: 'stopped', message: `The operation stopped unexpectedly (exit code ${code}). Open Recovery to check what happened.` };
    entry.finishedAt = new Date().toISOString();
  });
  child.stdin.end(JSON.stringify(args));
  return entry;
}

export async function handleSetup(req, url, body) {
  const d = dirs();
  const p = url.pathname.replace('/api/setup/', '');
  if (p === 'state' && req.method === 'GET') {
    return {
      paths: { data: d.root, packages: d.packages, app: d.app, backups: d.backups, temp: d.tmp },
      install: installState(d), recovery: diagnose(d), packages: listPackages(d.packages), backups: listBackups(d),
      running: running && ops.get(running)?.state === 'running' ? ops.get(running) : null,
    };
  }
  if (p === 'op' && req.method === 'GET') {
    const entry = ops.get(url.searchParams.get('id'));
    if (!entry) throw Object.assign(new Error('Unknown operation.'), { code: 'not-found', status: 404 });
    return entry;
  }
  if (req.method !== 'POST') throw Object.assign(new Error('Method not allowed'), { status: 405 });
  if (p === 'plan') {
    switch (body.op) {
      case 'install': return planInstall(d, packagePath(d, body.package));
      case 'remove': return planRemove(d);
      case 'restore-app': return planRestoreApp(d, body.backupId);
      case 'ps4-copy': return planPs4Copy(d, packagePath(d, body.package), body.target);
      case 'cleanup': return previewCleanup(d);
      default: throw Object.assign(new Error('Unknown plan.'), { code: 'unknown-operation' });
    }
  }
  if (p === 'settings') return { keys: backupSettings(d, body.backupId) };
  if (p === 'run') {
    if (body.confirmed !== true) throw Object.assign(new Error('This operation needs the user\'s confirmation.'), { code: 'not-confirmed', status: 403 });
    const args = { ...body };
    if (body.package) args.file = packagePath(d, body.package);
    return startOp(body.op, args);
  }
  throw Object.assign(new Error('Not found'), { status: 404 });
}
