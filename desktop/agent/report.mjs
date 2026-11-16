// Provider report: what a provider tried, what it got, how sure it is, and what it cannot get.
// Shared shape for the PS4 and PS5 providers (each builds its own content).

export const report = ({ provider, generation, method, address }) => ({
  provider,
  generation,
  method,
  address,
  attempted: [],
  answered: false,
  retrieved: {},
  unavailable: [],
  errors: [],
  detection: null, // DetectionResult-shaped object for the compatibility engine (js/models)
  at: new Date().toISOString(),
});

export const error = (code, message, action) => ({ code, message, recoverable: true, action });

// The homebrew-environment check has no documented read-only method on either console.
export const unsupportedEnvironment = (name, why) => ({
  kind: null, state: 'unsupported-method', version: null, verified: false, source: 'none', evidence: why, name,
});
