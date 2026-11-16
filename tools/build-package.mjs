// Builds a VantaFlow desktop package (.vfpkg) from this folder: the files the desktop app needs
// to run (no tests, docs, Android code or tools).
//   node tools/build-package.mjs 0.5.0 [output-folder]
import fs from 'node:fs';
import path from 'node:path';
import { buildDesktopPackage, readDesktopPackage } from '../desktop/setup/packages.mjs';
import { listFiles } from '../desktop/setup/store.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const [version, outDir = ROOT] = process.argv.slice(2);
if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) { console.error('Usage: node tools/build-package.mjs <version, e.g. 0.5.0> [output folder]'); process.exit(2); }
const files = ['index.html', ...['css', 'js', 'assets', 'shared', 'desktop'].flatMap((dir) => listFiles(path.join(ROOT, dir)).map((p) => `${dir}/${p}`))]
  .filter((p) => !p.endsWith('.md') || p === 'README.md');
const file = path.join(outDir, `vantaflow-${version}.vfpkg`);
if (fs.existsSync(file)) { console.error(`${file} already exists; it is not overwritten.`); process.exit(1); }
fs.writeFileSync(file, buildDesktopPackage(ROOT, files, { name: 'VantaFlow', version, description: `VantaFlow desktop ${version}` }));
const check = readDesktopPackage(file);
console.log(check.ok ? `Built ${file}: ${check.files.length} files, ${Math.round(check.totalSize / 1024)} KB, verified.` : `Built ${file} but it does not verify: ${check.errors[0]}`);
process.exitCode = check.ok ? 0 : 1;
