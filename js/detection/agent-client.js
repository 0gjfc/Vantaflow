// Client for the local VantaFlow desktop agent (desktop/server.mjs).
// This is the web UI's only path to the network: the agent, on this computer, does the
// read-only console detection. Nothing here talks to consoles or the internet directly.

async function call(path, body) {
  const res = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json', 'x-vantaflow': '1' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error ?? `The local agent answered ${res.status}.`), { code: data.code ?? 'agent-error' });
  return data;
}

// The agent's description, or null when VantaFlow was not started with the agent
// (for example when served by `python3 -m http.server`).
export async function agentInfo() {
  try {
    const a = await call('/api/agent');
    return a.agent === 'vantaflow-desktop' ? a : null;
  } catch {
    return null;
  }
}

export const discoverConsoles = () => call('/api/discover', { consent: true });
export const probeAddress = (address, generation) => call('/api/probe', { address, generation });
