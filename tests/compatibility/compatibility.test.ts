import { describe, it, expect } from 'vitest';
import { CompatibilityEngine } from '@polyglot/core';

describe('CompatibilityEngine', () => {
  it('should return undefined for unknown pair', () => {
    const engine = new CompatibilityEngine();
    expect(engine.get('png', 'zip')).toBeUndefined();
    expect(engine.isCompatible('png', 'zip')).toBe(false);
    expect(engine.getMode('png', 'zip')).toBe('unsupported');
  });

  it('should register and retrieve compatibility rules', () => {
    const engine = new CompatibilityEngine();
    engine.register({ front: 'png', back: 'zip', supported: true, mode: 'relocated' });

    const rule = engine.get('png', 'zip');
    expect(rule).toBeDefined();
    expect(rule?.supported).toBe(true);
    expect(rule?.mode).toBe('relocated');
  });

  it('should report compatible pairs correctly', () => {
    const engine = new CompatibilityEngine();
    engine.register({ front: 'png', back: 'zip', supported: true, mode: 'relocated' });
    engine.register({ front: 'jpeg', back: 'zip', supported: true, mode: 'relocated' });
    engine.register({ front: 'png', back: 'tar', supported: false, mode: 'unsupported' });

    expect(engine.isCompatible('png', 'zip')).toBe(true);
    expect(engine.isCompatible('jpeg', 'zip')).toBe(true);
    expect(engine.isCompatible('png', 'tar')).toBe(false);
  });

  it('should return correct modes for registered pairs', () => {
    const engine = new CompatibilityEngine();
    engine.register({ front: 'png', back: 'zip', supported: true, mode: 'relocated' });
    engine.register({ front: 'jpeg', back: 'zip', supported: true, mode: 'native' });

    expect(engine.getMode('png', 'zip')).toBe('relocated');
    expect(engine.getMode('jpeg', 'zip')).toBe('native');
  });

  it('should list all registered rules', () => {
    const engine = new CompatibilityEngine();
    engine.register({ front: 'png', back: 'zip', supported: true, mode: 'relocated' });
    engine.register({ front: 'jpeg', back: 'zip', supported: true, mode: 'relocated' });

    const rules = engine.getAllRules();
    expect(rules).toHaveLength(2);
    expect(rules.map(r => r.front)).toContain('png');
    expect(rules.map(r => r.front)).toContain('jpeg');
  });
});
