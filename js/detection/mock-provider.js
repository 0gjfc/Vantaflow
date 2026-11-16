// Mock detection provider: returns the demonstration consoles from shared/mock-consoles.json.
// It has the same interface a real provider will have (see docs/detection.md).
export class MockDetectionProvider {
  constructor(configs, { latencyMs = 120 } = {}) {
    this.name = 'mock';
    this.configs = configs;
    this.latencyMs = latencyMs;
  }

  async list() {
    return this.configs.map(({ id, label, scenario, detection }) => ({ id, label, scenario, generation: detection.console.generation }));
  }

  async detect(id) {
    await new Promise((done) => setTimeout(done, this.latencyMs));
    const config = this.configs.find((c) => c.id === id);
    if (!config) throw Object.assign(new Error(`No console with id "${id}".`), { code: 'not-found' });
    return structuredClone(config.detection);
  }
}
