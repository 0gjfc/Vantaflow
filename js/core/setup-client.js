// Client for the installation, backup, recovery and cleanup API of the desktop agent
// (desktop/setup/api.mjs). The browser never touches files itself.
const call = async (path, body) => {
  const res = await fetch(`/api/setup/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json', 'x-vantaflow': '1' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error ?? `The local agent answered ${res.status}.`), { code: data.code, problems: data.problems });
  return data;
};

export const setupState = () => call('state');
export const plan = (op, args = {}) => call('plan', { op, ...args });
export const backupKeys = (backupId) => call('settings', { backupId }).then((r) => r.keys);

// Starts a confirmed operation and polls it until it ends. onProgress gets each progress step.
export async function run(op, args, onProgress = () => {}) {
  const started = await call('run', { op, ...args, confirmed: true });
  for (;;) {
    await new Promise((r) => setTimeout(r, 120));
    const entry = await call(`op?id=${started.id}`);
    if (entry.progress) onProgress(entry.progress);
    if (entry.state !== 'running') return entry;
  }
}
