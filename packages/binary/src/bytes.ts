/**
 * Pure-ESM byte utilities — no Node.js Buffer dependency.
 *
 * Every function accepts or returns plain Uint8Array so the @polyglot packages
 * can run in any ESM-compliant runtime (Deno, Bun, browser, edge workers…).
 *
 * Buffer from Node.js is a Uint8Array subclass, so existing callers that pass
 * a Buffer continue to work unchanged.
 */

// ── 8-bit ──────────────────────────────────────────────────
export function readU8(a: Uint8Array, i = 0): number {
  return a[i]!;
}

export function writeU8(a: Uint8Array, i: number, v: number): void {
  a[i] = v & 0xff;
}

// ── 16-bit LE / BE ─────────────────────────────────────────
export function readU16LE(a: Uint8Array, i = 0): number {
  return a[i]! | (a[i + 1]! << 8);
}

export function writeU16LE(a: Uint8Array, i: number, v: number): void {
  a[i] = v & 0xff;
  a[i + 1] = (v >>> 8) & 0xff;
}

export function readU16BE(a: Uint8Array, i = 0): number {
  return (a[i]! << 8) | a[i + 1]!;
}

export function writeU16BE(a: Uint8Array, i: number, v: number): void {
  a[i] = (v >>> 8) & 0xff;
  a[i + 1] = v & 0xff;
}

// ── 32-bit LE / BE ─────────────────────────────────────────
export function readU32LE(a: Uint8Array, i = 0): number {
  return (a[i]! | (a[i + 1]! << 8) | (a[i + 2]! << 16) | (a[i + 3]! << 24)) >>> 0;
}

export function writeU32LE(a: Uint8Array, i: number, v: number): void {
  a[i] = v & 0xff;
  a[i + 1] = (v >>> 8) & 0xff;
  a[i + 2] = (v >>> 16) & 0xff;
  a[i + 3] = (v >>> 24) & 0xff;
}

export function readU32BE(a: Uint8Array, i = 0): number {
  return ((a[i]! << 24) | (a[i + 1]! << 16) | (a[i + 2]! << 8) | a[i + 3]!) >>> 0;
}

export function writeU32BE(a: Uint8Array, i: number, v: number): void {
  a[i] = (v >>> 24) & 0xff;
  a[i + 1] = (v >>> 16) & 0xff;
  a[i + 2] = (v >>> 8) & 0xff;
  a[i + 3] = v & 0xff;
}

// ── Allocation helpers ─────────────────────────────────────
export function alloc(len: number): Uint8Array {
  return new Uint8Array(len);
}

/** Like Buffer.alloc(len, fill): fill every byte with `fill` (default 0). */
export function allocFill(len: number, fill = 0): Uint8Array {
  const a = new Uint8Array(len);
  a.fill(fill);
  return a;
}

// ── Concat ─────────────────────────────────────────────────
export function concat(...arrays: Uint8Array[]): Uint8Array {
  if (arrays.length === 0) return new Uint8Array(0);
  if (arrays.length === 1) return arrays[0]!;
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrays) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}

// ── String encoding ────────────────────────────────────────
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function fromString(s: string): Uint8Array {
  return encoder.encode(s);
}

export function toString(a: Uint8Array): string {
  return decoder.decode(a);
}

// ── Copy ───────────────────────────────────────────────────
/** Copy `src` bytes into `dst` starting at `dstOffset`. Mirrors `Buffer.copy`. */
export function copy(src: Uint8Array, dst: Uint8Array, dstOffset = 0): void {
  dst.set(src, dstOffset);
}

// ── Equality ───────────────────────────────────────────────
export function equals(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i]! !== b[i]!) return false;
  }
  return true;
}
