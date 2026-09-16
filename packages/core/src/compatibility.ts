import type { CompatibilityRule } from './types.js';

/**
 * Default security limits for archive parsing.
 * Designed to prevent Zip Bombs, path traversal, and memory exhaustion.
 */
export interface ArchiveSecurityLimits {
  /** Maximum number of entries allowed in the archive. */
  maxEntries: number;
  /** Maximum size (in bytes) for any single entry. */
  maxEntrySize: number;
  /** Maximum total uncompressed size across all entries. */
  maxTotalSize: number;
}

export const DEFAULT_SECURITY_LIMITS: ArchiveSecurityLimits = {
  maxEntries: 10_000,
  maxEntrySize: 1024 * 1024 * 1024, // 1 GB
  maxTotalSize: 10 * 1024 * 1024 * 1024, // 10 GB
};

/**
 * Sanitize an entry path to prevent path traversal attacks.
 * Rejects paths containing '..' or absolute path prefixes.
 */
export function sanitizeEntryPath(name: string): string {
  if (!name || name.length === 0) {
    throw new Error('Entry path is empty');
  }

  const normalized = name.replace(/\\/g, '/');

  // Reject absolute paths
  if (normalized.startsWith('/')) {
    throw new Error(`Path traversal blocked: absolute path detected in entry "${name}"`);
  }

  // Reject parent directory traversal
  const parts = normalized.split('/');
  for (const part of parts) {
    if (part === '..') {
      throw new Error(`Path traversal blocked: ".." component detected in entry "${name}"`);
    }
    if (part === '.' && parts.length === 1) {
      throw new Error(`Path traversal blocked: entry path is "."`);
    }
  }

  return normalized;
}

/**
 * Validate archive entry limits against security thresholds.
 * Throws if any limit would be exceeded.
 */
export function validateArchiveLimits(
  entries: { name: string; data: Buffer }[],
  limits: ArchiveSecurityLimits,
): void {
  if (entries.length > limits.maxEntries) {
    throw new Error(
      `Too many entries: ${entries.length} exceeds limit of ${limits.maxEntries}`,
    );
  }

  let totalSize = 0;
  for (const entry of entries) {
    if (entry.data.length > limits.maxEntrySize) {
      throw new Error(
        `Entry "${entry.name}" exceeds max size: ${entry.data.length} > ${limits.maxEntrySize}`,
      );
    }
    totalSize += entry.data.length;
    if (totalSize > limits.maxTotalSize) {
      throw new Error(
        `Total archive size exceeds limit: ${totalSize} > ${limits.maxTotalSize}`,
      );
    }
  }
}

/**
 * Compatibility engine — validates format pair compatibility.
 */
export class CompatibilityEngine {
  private readonly rules = new Map<string, CompatibilityRule>();

  register(rule: CompatibilityRule): void {
    this.rules.set(`${rule.front}:${rule.back}`, rule);
  }

  get(front: string, back: string): CompatibilityRule | undefined {
    return this.rules.get(`${front}:${back}`);
  }

  /**
   * Check if a front/back combination is supported.
   * Returns false for missing rules (treated as unsupported).
   */
  isCompatible(front: string, back: string): boolean {
    const rule = this.rules.get(`${front}:${back}`);
    return rule?.supported ?? false;
  }

  /**
   * Get the compatibility mode for a given pair.
   * Defaults to 'unsupported' if no rule exists.
   */
  getMode(front: string, back: string): string {
    return this.rules.get(`${front}:${back}`)?.mode ?? 'unsupported';
  }

  getAllRules(): CompatibilityRule[] {
    return Array.from(this.rules.values());
  }
}
