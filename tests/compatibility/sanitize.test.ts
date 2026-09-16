import { describe, it, expect } from 'vitest';
import {
  CompatibilityEngine,
  sanitizeEntryPath,
  validateArchiveLimits,
  DEFAULT_SECURITY_LIMITS,
} from '@polyglot/core';

describe('sanitizeEntryPath', () => {
  it('accepts normal relative path', () => {
    expect(sanitizeEntryPath('a/b/c.txt')).toBe('a/b/c.txt');
  });

  it('normalizes backslashes to forward slashes', () => {
    expect(sanitizeEntryPath('a\\b\\c.txt')).toBe('a/b/c.txt');
  });

  it('throws on empty string', () => {
    expect(() => sanitizeEntryPath('')).toThrow('empty');
  });

  it('throws on single dot', () => {
    expect(() => sanitizeEntryPath('.')).toThrow('entry path is "."');
  });

  it('throws on absolute path', () => {
    expect(() => sanitizeEntryPath('/etc/passwd')).toThrow('absolute');
  });

  it('throws on parent traversal', () => {
    expect(() => sanitizeEntryPath('../secret')).toThrow('".." component');
    expect(() => sanitizeEntryPath('a/../../b')).toThrow('".." component');
  });

  it('allows dots in filename (not a component)', () => {
    expect(sanitizeEntryPath('file.v1.2.tar.gz')).toBe('file.v1.2.tar.gz');
  });

  it('allows nested safe path', () => {
    expect(sanitizeEntryPath('sub/dir/file.txt')).toBe('sub/dir/file.txt');
  });
});

describe('validateArchiveLimits', () => {
  it('passes when all entries are within limits', () => {
    const entries = [
      { name: 'a.txt', data: Buffer.from('hello') },
      { name: 'b.txt', data: Buffer.from('world') },
    ];
    expect(() => validateArchiveLimits(entries, DEFAULT_SECURITY_LIMITS)).not.toThrow();
  });

  it('throws when entry count exceeds maxEntries', () => {
    const entries = Array.from({ length: 101 }, (_, i) => ({
      name: `f${i}.txt`,
      data: Buffer.from('x'),
    }));
    expect(() => validateArchiveLimits(entries, { ...DEFAULT_SECURITY_LIMITS, maxEntries: 100 }))
      .toThrow(/exceeds limit/);
  });

  it('throws when single entry exceeds maxEntrySize', () => {
    const huge = Buffer.alloc(1024 * 1024 * 2); // 2 MB
    expect(() => validateArchiveLimits([{ name: 'big.bin', data: huge }], {
      ...DEFAULT_SECURITY_LIMITS,
      maxEntrySize: 1024 * 1024, // 1 MB
    })).toThrow(/exceeds max size/);
  });

  it('throws when total size exceeds maxTotalSize', () => {
    const entries = Array.from({ length: 6 }, () => ({
      name: 'x.bin',
      data: Buffer.alloc(1024 * 1024), // 1 MB each, 6 MB total
    }));
    expect(() => validateArchiveLimits(entries, {
      ...DEFAULT_SECURITY_LIMITS,
      maxTotalSize: 5 * 1024 * 1024, // 5 MB cap
    })).toThrow(/Total archive size exceeds limit/);
  });
});

describe('CompatibilityEngine defaults', () => {
  it('isCompatible returns false for unregistered pair', () => {
    const engine = new CompatibilityEngine();
    expect(engine.isCompatible('gif', 'tar')).toBe(false);
  });

  it('getMode returns unsupported for unregistered pair', () => {
    const engine = new CompatibilityEngine();
    expect(engine.getMode('gif', 'tar')).toBe('unsupported');
  });

  it('getAllRules returns empty array when nothing registered', () => {
    const engine = new CompatibilityEngine();
    expect(engine.getAllRules()).toEqual([]);
  });
});
