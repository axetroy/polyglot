import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { deflateSync } from 'zlib';

/**
 * CLI end-to-end tests.
 *
 * These drive the built CLI as a real subprocess (exactly how a user runs it)
 * rather than importing its internals, so argument parsing, output paths and
 * exit codes are all covered.
 */

const CLI = resolve(__dirname, '../../packages/cli/dist/index.js');

function makePng(width = 64, height = 64): Buffer {
  const crcTable: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c >>> 0;
  }
  const crc32 = (buf: Buffer): Buffer => {
    let crc = 0xffffffff;
    for (const b of buf) crc = (crcTable[(crc ^ b) & 0xff] ?? 0) ^ (crc >>> 8);
    const out = Buffer.alloc(4);
    out.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return out;
  };
  const chunk = (type: string, data: Buffer): Buffer => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    return Buffer.concat([len, body, crc32(body)]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = y * (1 + width * 3) + 1 + x * 3;
      raw[o] = (x * 7) & 0xff;
      raw[o + 1] = (y * 5) & 0xff;
      raw[o + 2] = (x * y) & 0xff;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

let dir: string;
let imagePath: string;
let polyPath: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'polyglot-cli-'));
  imagePath = join(dir, 'image.png');
  polyPath = join(dir, 'out.png.zip');
  writeFileSync(imagePath, makePng());

  execFileSync('node', [
    CLI,
    'create',
    '--front',
    imagePath,
    '--back',
    'zip',
    '--add',
    'readme.txt:hello',
    '--add',
    'docs/note.md:nested',
    '--add',
    '中文.txt:中文',
    '--output',
    polyPath,
  ]);
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('polyglot create', () => {
  it('writes a file that reports as polyglot', () => {
    expect(existsSync(polyPath)).toBe(true);
    const out = execFileSync('node', [CLI, 'inspect', polyPath], { encoding: 'utf8' });
    expect(out).toContain('Polyglot: true');
    expect(out).toContain('Front: PNG');
    expect(out).toContain('Back: ZIP');
  });

  it('lists every added entry', () => {
    const out = execFileSync('node', [CLI, 'list', polyPath], { encoding: 'utf8' });
    expect(out).toContain('readme.txt');
    expect(out).toContain('docs/note.md');
    expect(out).toContain('中文.txt');
  });
});

describe('polyglot extract', () => {
  it('creates parent directories for nested entries', () => {
    // Regression: extract used to mkdir the full file path instead of its
    // parent, so nested entries failed with ENOENT.
    const outDir = join(dir, 'extracted');
    execFileSync('node', [CLI, 'extract', polyPath, outDir], { encoding: 'utf8' });

    expect(readFileSync(join(outDir, 'readme.txt'), 'utf8')).toBe('hello');
    expect(readFileSync(join(outDir, 'docs', 'note.md'), 'utf8')).toBe('nested');
    expect(readFileSync(join(outDir, '中文.txt'), 'utf8')).toBe('中文');
  });

  it('accepts a trailing-slash output dir and does not create a stray directory', () => {
    const outDir = join(dir, 'trailing');
    execFileSync('node', [CLI, 'extract', polyPath, `${outDir}/`], { encoding: 'utf8' });
    expect(readFileSync(join(outDir, 'docs', 'note.md'), 'utf8')).toBe('nested');
    // The nested file's parent must exist as a real directory, not as a
    // directory literally named like the file.
    const names = readdirSync(outDir);
    expect(names).toContain('docs');
    expect(names).not.toContain('docs/note.md');
  });
});
