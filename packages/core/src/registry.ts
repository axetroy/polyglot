import type { FrontAdapter, BackAdapter, CompatibilityRule } from './types.js';

export class FormatRegistry {
  private readonly fronts = new Map<string, FrontAdapter>();
  private readonly backs = new Map<string, BackAdapter>();
  private readonly compatibility = new Map<string, CompatibilityRule>();

  registerFront(adapter: FrontAdapter): void {
    this.fronts.set(adapter.id, adapter);
  }

  registerBack(adapter: BackAdapter): void {
    this.backs.set(adapter.id, adapter);
  }

  registerCompatibility(rule: CompatibilityRule): void {
    const key = `${rule.front}:${rule.back}`;
    this.compatibility.set(key, rule);
  }

  getFront(id: string): FrontAdapter | undefined {
    return this.fronts.get(id);
  }

  getBack(id: string): BackAdapter | undefined {
    return this.backs.get(id);
  }

  getCompatibility(frontId: string, backId: string): CompatibilityRule | undefined {
    return this.compatibility.get(`${frontId}:${backId}`);
  }

  getAllFronts(): FrontAdapter[] {
    return Array.from(this.fronts.values());
  }

  getAllBacks(): BackAdapter[] {
    return Array.from(this.backs.values());
  }
}
