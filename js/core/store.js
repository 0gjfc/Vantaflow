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
