// Console detection service.
//
// Asks a provider about a console and returns a normalised DetectionResult (js/models).
// Providers only observe: no exploits, no payloads, no writes, nothing sent that changes the
// console. Every field carries evidence (verified + source), so the compatibility engine can
// refuse weak hints — an open network port, for example, never counts as proof that GoldHEN
// or etaHEN is running. See docs/detection.md for the provider contract and future providers.
import { detectionResult, errorInfo } from '../models/index.js';

const withTimeout = (promise, ms) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(Object.assign(new Error(`No answer within ${ms / 1000} s.`), { code: 'timeout' })), ms)),
]);

export class DetectionService {
  // provider: { name, list(): Promise<ConsoleRef[]>, detect(id): Promise<raw detection> }
  constructor(provider, { timeoutMs = 5000 } = {}) {
    this.provider = provider;
    this.timeoutMs = timeoutMs;
    this.results = new Map();
  }

  list() {
    return this.provider.list();
  }

  last(id) {
    return this.results.get(id) ?? null;
  }

  async detect(id) {
    const detectedAt = new Date().toISOString();
    let result;
    try {
      const raw = await withTimeout(this.provider.detect(id), this.timeoutMs);
      result = detectionResult({ ...raw, consoleId: id, detectedAt });
    } catch (err) {
      // A failed detection is a result too: "not detected", with a recoverable error to show.
      result = detectionResult({
        consoleId: id,
        detectedAt,
        connection: { state: 'unknown', transport: this.provider.name },
        errors: [{ code: err.code ?? 'detection-failed', message: err.message, recoverable: true, action: 'Check that the console is on and on the same network, then detect again.' }],
      });
    }
    this.results.set(id, result);
    return result;
  }
}

export const detectionError = errorInfo;
