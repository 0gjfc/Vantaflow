// Runs one setup operation in its own process and reports progress as JSON lines on stdout:
//   {"progress":{...}}  …  then  {"result":{...}}  or  {"error":{"code","message"}}
// The desktop agent starts it for every operation that changes files, so a crash or a power
// cut stops only this process and leaves a journal for Recovery. Arguments come as JSON on stdin.
//   echo '{"file":"…/vantaflow-0.5.0.vfpkg","confirmed":true}' | node desktop/setup/run.mjs install
import { layout, dataDir } from './store.mjs';
import * as I from './installer.mjs';
import { createBackup, deleteBackup } from './backups.mjs';
import { runCleanup } from './cleanup.mjs';

const out = (o) => process.stdout.write(`${JSON.stringify(o)}\n`);
const chunks = [];
for await (const c of process.stdin) chunks.push(c);
const args = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
const d = layout(dataDir());
const onProgress = (p) => out({ progress: p });
const ops = {
  install: () => I.install(d, args.file, { settings: args.settings, confirmed: args.confirmed, onProgress }),
  remove: () => I.remove(d, { settings: args.settings, confirmed: args.confirmed }),
  'restore-app': () => I.restoreApp(d, args.backupId, { confirmed: args.confirmed, onProgress }),
  recover: () => I.recover(d, args.option, { confirmed: args.confirmed }),
  'ps4-copy': () => I.copyPs4Package(d, args.file, args.target, { confirmed: args.confirmed, onProgress }),
  backup: () => {
    if (!args.confirmed) throw Object.assign(new Error('Backing up needs the user\'s confirmation.'), { code: 'not-confirmed' });
    return createBackup(d, { settings: args.settings, includeApp: Boolean(args.includeApp), description: args.description, reason: args.reason ?? 'manual', appVersion: I.installState(d).installed?.version ?? null });
  },
  'delete-backup': () => {
    if (!args.confirmed) throw Object.assign(new Error('Deleting a backup needs the user\'s confirmation.'), { code: 'not-confirmed' });
    return deleteBackup(d, args.backupId, { allowValid: Boolean(args.allowValid) });
  },
  cleanup: () => {
    if (!args.confirmed) throw Object.assign(new Error('Cleanup needs the user\'s confirmation.'), { code: 'not-confirmed' });
    return runCleanup(d, args.token);
  },
};
const op = ops[process.argv[2]];
try {
  if (!op) throw Object.assign(new Error(`Unknown operation "${process.argv[2]}".`), { code: 'unknown-operation' });
  out({ result: await op() });
} catch (e) {
  out({ error: { code: e.code ?? 'failed', message: e.message } });
  process.exitCode = 1;
}
