// VantaFlow desktop: serves the app and a small local API for read-only console detection.
//
//   node desktop/server.mjs            → http://127.0.0.1:8080
//
// Browsers cannot send UDP, so network work happens here, in Node, and the web UI asks for it
// over HTTP. The server listens on 127.0.0.1 only, answers only requests addressed to it
// (Host check against DNS rebinding) and only API calls carrying the VantaFlow header (so other
// web pages cannot call it). It never contacts anything outside the local network and stores
// nothing: saved consoles live in the browser on this computer. No runtime dependencies.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPs4Provider } from './agent/providers/ps4.mjs';
import { createPs5Provider } from './agent/providers/ps5.mjs';
import { discover, validateAddress, broadcastTargets } from './agent/discovery.mjs';
import { DDP } from './agent/ddp.mjs';
import { handleSetup } from './setup/api.mjs';
import { dataDir as dataDirPath } from './setup/store.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = process.env;
const PORT = Number(env.VANTAFLOW_PORT ?? 8080);
// Test-only overrides: a fake console on 127.0.0.1 instead of a real one. Never needed in use.
const TEST = env.VANTAFLOW_TEST === '1';
const ports = { ps4: Number(TEST && env.VANTAFLOW_TEST_PS4_PORT) || DDP.ps4.port, ps5: Number(TEST && env.VANTAFLOW_TEST_PS5_PORT) || DDP.ps5.port };
const timeoutMs = Number(TEST && env.VANTAFLOW_TEST_TIMEOUT_MS) || 2000;
const allowLoopback = TEST;
const targets = () => (TEST && env.VANTAFLOW_TEST_DISCOVERY_TARGET ? [env.VANTAFLOW_TEST_DISCOVERY_TARGET] : broadcastTargets());

const providers = { ps4: createPs4Provider({ port: ports.ps4, timeoutMs }), ps5: createPs5Provider({ port: ports.ps5, timeoutMs }) };

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.md': 'text/plain; charset=utf-8' };
const json = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); };

// Small bodies for detection; settings snapshots for backups can hold custom background images.
function readBody(req, limit = 4096) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { reject(new Error('invalid JSON')); } });
  });
}

// Probe one user-chosen address. With a known generation only that provider runs.
async function probe(address, generation) {
  const which = generation && providers[generation] ? [providers[generation]] : [providers.ps4, providers.ps5];
  return Promise.all(which.map((p) => p.probe(address)));
}

async function api(req, res, url) {
  if (url.pathname === '/api/agent' && req.method === 'GET') {
    return json(res, 200, { agent: 'vantaflow-desktop', readOnly: true, setup: true, providers: Object.values(providers).map((p) => ({ name: p.name, generation: p.generation, method: p.method })), test: TEST });
  }
  if (url.pathname.startsWith('/api/setup/')) {
    let body = {};
    if (req.method === 'POST') { try { body = await readBody(req, 32 * 1024 * 1024); } catch (e) { return json(res, 400, { error: e.message }); } }
    try { return json(res, 200, await handleSetup(req, url, body)); } catch (e) { return json(res, e.status ?? 400, { error: e.message, code: e.code ?? 'failed', problems: e.problems }); }
  }
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  let body;
  try { body = await readBody(req); } catch (e) { return json(res, 400, { error: e.message }); }
  if (url.pathname === '/api/discover') {
    if (body.consent !== true) return json(res, 403, { error: 'Discovery needs the user\'s permission first.' });
    const result = await discover({ providers, targets: targets(), ports, timeoutMs: timeoutMs + 500, allowLoopback });
    return json(res, 200, result);
  }
  if (url.pathname === '/api/probe') {
    const check = validateAddress(body.address, { allowLoopback });
    if (!check.ok) return json(res, 400, { error: check.error, code: 'invalid-address' });
    return json(res, 200, { reports: await probe(check.ip, body.generation) });
  }
  return json(res, 404, { error: 'Not found' });
}

const server = http.createServer(async (req, res) => {
  const host = req.headers.host ?? '';
  if (host !== `127.0.0.1:${PORT}` && host !== `localhost:${PORT}`) { res.writeHead(421); return res.end('Misdirected request'); }
  const url = new URL(req.url, `http://${host}`);
  if (url.pathname.startsWith('/api/')) {
    if (req.headers['x-vantaflow'] !== '1') return json(res, 403, { error: 'Missing VantaFlow header' });
    return api(req, res, url).catch((e) => json(res, 500, { error: e.message }));
  }
  const file = path.resolve(ROOT, `.${decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)}`);
  if (!file.startsWith(ROOT + path.sep) || /[\\/]\.(git|gradle)/.test(file)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`VantaFlow running at http://127.0.0.1:${PORT}${TEST ? '  (TEST MODE: fake consoles on 127.0.0.1 allowed)' : ''}`);
  console.log('Console detection is read-only and stays on your local network.');
  console.log(`Install, backups and recovery use ${dataDirPath()} (set VANTAFLOW_DATA_DIR to change it).`);
});
