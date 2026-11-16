// Safe cleanup of VantaFlow's temporary files.
//
// Removes only:
//   - folders in tmp/ that carry a valid .vantaflow-temp marker and do not belong to an
//     operation still in progress;
//   - leftover "<name>.json.<pid>.writing" files from interrupted atomic writes in the data folder;
//   - the unfinished PS4 copy recorded by a failed or interrupted copy (exact path, ".vantaflow-partial").
// Never touches backups/, packages/, app/, settings, or anything without a marker. Anything
// uncertain is listed as kept, with the reason.
import fs from 'node:fs';
import path from 'node:path';
import { MARKER, readJson, sha256, inside, listFiles } from './store.mjs';

const sizeOf = (p) => {
  const st = fs.lstatSync(p);
  if (!st.isDirectory()) return st.size;
  return listFiles(p).reduce((n, f) => { try { return n + fs.lstatSync(path.join(p, f)).size; } catch { return n; } }, 0);
};

export function previewCleanup(d) {
  const journal = readJson(d.journal);
  const running = journal?.state === 'running' ? journal.opId : null;
  const remove = [];
  const keep = [];
  if (fs.existsSync(d.tmp)) {
    for (const e of fs.readdirSync(d.tmp, { withFileTypes: true })) {
      const full = path.join(d.tmp, e.name);
      if (e.isSymbolicLink()) { keep.push({ path: full, reason: 'A link: not followed, not removed.' }); continue; }
      if (!e.isDirectory()) { keep.push({ path: full, reason: 'Not created by VantaFlow (no marker).' }); continue; }
      const marker = readJson(path.join(full, MARKER));
      if (marker?.createdBy !== 'vantaflow') { keep.push({ path: full, reason: 'Not created by VantaFlow, or its purpose is unknown (no valid marker).' }); continue; }
      if (running && marker.opId === running) { keep.push({ path: full, reason: 'Belongs to an operation that has not finished. Open Recovery first.' }); continue; }
      remove.push({ path: full, purpose: marker.purpose, createdAt: marker.createdAt, size: sizeOf(full) });
    }
  }
  for (const e of fs.readdirSync(d.root, { withFileTypes: true })) {
    if (e.isFile() && /^(journal|installation)\.json\.\d+\.writing$/.test(e.name)) remove.push({ path: path.join(d.root, e.name), purpose: 'interrupted-write', size: sizeOf(path.join(d.root, e.name)) });
  }
  if (journal?.type === 'ps4-copy' && journal.state !== 'running' && journal.partial?.endsWith('.vantaflow-partial') && fs.existsSync(journal.partial)) {
    remove.push({ path: journal.partial, purpose: 'unfinished PS4 copy', size: sizeOf(journal.partial) });
  }
  keep.push(
    { path: d.backups, reason: 'Backups are never removed by cleanup.' },
    { path: d.packages, reason: 'Your packages folder is never cleaned.' },
    { path: d.app, reason: 'The installed app.' },
    { path: '(browser)', reason: 'Settings, console profiles and backgrounds are not files here and are not touched.' },
  );
  const token = sha256(JSON.stringify(remove.map((r) => r.path)));
  return { remove, keep, token, bytes: remove.reduce((n, r) => n + r.size, 0) };
}

// Removes exactly what the confirmed preview listed. If anything changed since the preview
// (token differs), nothing is removed and a new preview is needed.
export function runCleanup(d, token) {
  const preview = previewCleanup(d);
  if (!token || token !== preview.token) throw Object.assign(new Error('The files changed since the preview. Nothing was removed; review the cleanup again.'), { code: 'stale-preview', preview });
  const removed = [];
  const failed = [];
  for (const item of preview.remove) {
    try {
      const inTmp = inside(d.tmp, item.path) && path.dirname(item.path) === d.tmp;
      const writing = path.dirname(item.path) === d.root && /\.json\.\d+\.writing$/.test(item.path);
      const partial = item.purpose === 'unfinished PS4 copy' && item.path.endsWith('.vantaflow-partial');
      if (!inTmp && !writing && !partial) throw new Error('outside the allowed places');
      if (inTmp && readJson(path.join(item.path, MARKER))?.createdBy !== 'vantaflow') throw new Error('marker missing at removal time');
      fs.rmSync(item.path, { recursive: inTmp, force: false });
      removed.push(item);
    } catch (e) {
      failed.push({ ...item, error: e.message });
    }
  }
  return { removed, failed, kept: preview.keep, bytes: removed.reduce((n, r) => n + r.size, 0) };
}
