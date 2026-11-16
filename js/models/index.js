// Shared data models (see docs/data-models.md). The Android companion mirrors these shapes in
// android/app/src/main/java/app/vantaflow/companion/model/Models.kt.
// Factories normalise input and drop unknown enum values, so the rest of the app never sees a
// half-valid object. Evidence defaults to "not verified": nothing is trusted unless it says so.

export const GENERATIONS = ['ps4', 'ps5'];
export const ENVIRONMENTS = ['goldhen', 'etahen'];
export const CONNECTION_STATES = ['connected', 'disconnected', 'unknown'];
// 'unsupported-method': no documented read-only way exists to check (real detection, Stage 4).
export const ENVIRONMENT_STATES = ['active', 'absent', 'unknown', 'unsupported-method'];

export const STATUS = Object.freeze({
  COMPATIBLE: 'compatible',
  PARTIAL: 'partial',
  UNSUPPORTED: 'unsupported',
  UNKNOWN: 'unknown',
  NOT_DETECTED: 'not-detected',
});
export const STATUS_LABEL = Object.freeze({
  compatible: 'Compatible',
  partial: 'Partially compatible',
  unsupported: 'Unsupported',
  unknown: 'Unknown',
  'not-detected': 'Not detected',
});

const one = (v, allowed, fallback) => (allowed.includes(v) ? v : fallback);
const text = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const freeze = Object.freeze;
const obj = (v) => (v && typeof v === 'object' ? v : {}); // null / undefined / junk → {}

export const connectionStatus = (raw, c = obj(raw)) => freeze({
  state: one(c.state, CONNECTION_STATES, 'unknown'),
  transport: text(c.transport) ?? 'none',
  address: text(c.address),
  lastSeen: text(c.lastSeen),
});

export const networkStatus = (raw, n = obj(raw)) => freeze({
  state: one(n.state, ['online', 'offline'], 'unknown'),
  power: one(n.power, ['on', 'standby'], 'unknown'), // from the console's own discovery reply
});

export const consoleInfo = (raw, c = obj(raw)) => freeze({
  generation: one(c.generation, GENERATIONS, null),
  model: text(c.model),
  name: text(c.name), // the console's own name, when it reports one
  verified: c.verified === true,
  source: text(c.source) ?? 'unknown',
});

export const firmwareInfo = (raw, f = obj(raw)) => freeze({
  version: text(f.version),
  raw: text(f.raw), // value as reported, before decoding (e.g. DDP system-version)
  verified: f.verified === true,
  source: text(f.source) ?? 'unknown',
});

// Installed homebrew environment. `components` holds optional parts such as kstuff or the ELF
// loader: true = reported present, false = reported missing, absent = not reported.
export const environmentInfo = (raw, e = obj(raw)) => freeze({
  kind: one(e.kind, ENVIRONMENTS, null),
  state: one(e.state, ENVIRONMENT_STATES, 'unknown'),
  version: text(e.version),
  verified: e.verified === true,
  source: text(e.source) ?? 'unknown',
  evidence: text(e.evidence),
  components: freeze({ ...(e.components && typeof e.components === 'object' ? e.components : {}) }),
});

export const storageDrive = (raw, s = obj(raw)) => freeze({
  name: text(s.name) ?? 'Drive',
  total: Number(s.total) || 0,
  holds: one(s.holds, GENERATIONS, null),
  categories: freeze({ ...(s.categories || {}) }),
});

export const errorInfo = (raw, e = obj(raw)) => freeze({
  code: text(e.code) ?? 'unknown-error',
  message: text(e.message) ?? 'Something went wrong.',
  recoverable: e.recoverable !== false,
  action: text(e.action),
  at: text(e.at) ?? new Date().toISOString(),
});

// What a provider tried, how, and what it could not get (Stage 4).
export const providerReport = (raw, r = obj(raw)) => freeze({
  provider: text(r.provider) ?? 'unknown',
  method: text(r.method),
  attempted: freeze((r.attempted || []).filter((x) => typeof x === 'string')),
  unavailable: freeze((r.unavailable || []).filter((x) => x && x.field).map((x) => freeze({ field: String(x.field), reason: String(x.reason ?? '') }))),
});

// The five homebrew-environment states shown to the user.
export const HEN_STATUS = Object.freeze({
  INSTALLED: 'Verified installed',
  NOT_INSTALLED: 'Verified not installed',
  UNKNOWN: 'Unknown',
  NOT_DETECTED: 'Not detected',
  UNSUPPORTED: 'Unsupported detection method',
});
export function henStatus(d) {
  if (!d || d.connection.state !== 'connected') return HEN_STATUS.NOT_DETECTED;
  const e = d.environment;
  if (e.state === 'unsupported-method') return HEN_STATUS.UNSUPPORTED;
  if (e.verified && e.state === 'active') return HEN_STATUS.INSTALLED;
  if (e.verified && e.state === 'absent') return HEN_STATUS.NOT_INSTALLED;
  return HEN_STATUS.UNKNOWN;
}

export const detectionResult = (raw, d = obj(raw)) => freeze({
  consoleId: text(d.consoleId),
  connection: connectionStatus(d.connection),
  network: networkStatus(d.network),
  console: consoleInfo(d.console),
  firmware: firmwareInfo(d.firmware),
  environment: environmentInfo(d.environment),
  storage: freeze((d.storage || []).map((x) => storageDrive(x))),
  detectedAt: text(d.detectedAt),
  errors: freeze((d.errors || []).map((x) => errorInfo(x))),
  report: providerReport(d.report),
});

export const reason = (status, code, message) => freeze({ status, code, message });

export const compatibilityResult = (raw, r = obj(raw)) => freeze({
  status: one(r.status, Object.values(STATUS), STATUS.UNKNOWN),
  label: STATUS_LABEL[r.status] ?? STATUS_LABEL.unknown,
  reasons: freeze(r.reasons || []),
  environment: text(r.environment),
  release: text(r.release),
  supported: freeze(r.supported || []),
  unsupported: freeze(r.unsupported || []), // [{ label, why }]
  unverified: freeze(r.unverified || []), // [{ label, why }]
  requirements: freeze(r.requirements || []),
  limitations: freeze(r.limitations || []),
  dataVerified: text(r.dataVerified),
  sources: freeze(r.sources || []),
  evaluatedAt: text(r.evaluatedAt),
});
