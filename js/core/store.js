// Local persistence: namespaced JSON in localStorage, so preferences survive a restart.
// Fails soft: with storage disabled or full, values simply stay in memory.

const ls = typeof localStorage !== 'undefined' ? localStorage : null;
const NS = 'vantaflow.';

export function load(key, fallback = null) {
  try {
    const raw = ls?.getItem(NS + key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

// Returns false when the value could not be written (quota exceeded or storage disabled).
export function save(key, value) {
  try {
    if (value == null) ls?.removeItem(NS + key);
    else ls?.setItem(NS + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

// Every VantaFlow entry exactly as stored (raw text), for backups.
export function snapshot() {
  const out = {};
  if (!ls) return out;
  for (let i = 0; i < ls.length; i++) {
    const k = ls.key(i);
    if (k.startsWith(NS)) out[k] = ls.getItem(k);
  }
  return out;
}

// Replaces every VantaFlow entry with `keys`, then reads them back. Returns true only when the
// stored entries match exactly; on any failure the previous entries are put back.
export function replaceAll(keys) {
  const before = snapshot();
  const write = (entries) => {
    for (const k of Object.keys(snapshot())) ls.removeItem(k);
    for (const [k, v] of Object.entries(entries)) ls.setItem(k, v);
  };
  try {
    write(keys);
    const now = snapshot();
    if (Object.keys(now).length === Object.keys(keys).length && Object.entries(keys).every(([k, v]) => now[k] === v)) return true;
    throw new Error('read-back mismatch');
  } catch {
    try { write(before); } catch { /* storage unavailable */ }
    return false;
  }
}
