import { describe, it, expect, beforeAll } from 'vitest';
import {
  PolyglotEngine,
  IncompatibleFormatError,
  InvalidFrontError,
  InvalidArchiveError,
} from '@polyglot/core';
import { pngAdapter } from '@polyglot/formats-png';
import { jpegAdapter } from '@polyglot/formats-jpeg';
import { zipAdapter } from '@polyglot/formats-zip';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const TEST_DIR = join(import.meta.dirname, 'tmp-errors');

function makeEngine() {
  const engine = new PolyglotEngine();
  engine.registerFront(pngAdapter);
  engine.registerFront(jpegAdapter);
  engine.registerBack(zipAdapter);
  engine.registerCompatibility('png', 'zip', true, 'relocated');
  engine.registerCompatibility('jpeg', 'zip', true, 'relocated');
  return engine;
}

function makeMinimalPNG(): Buffer {
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(1, 0);
  ihdrData.writeUInt32BE(1, 4);
  ihdrData.writeUInt8(8, 8);
  ihdrData.writeUInt8(2, 9);
  ihdrData.writeUInt8(0, 10);
  ihdrData.writeUInt8(0, 11);
  ihdrData.writeUInt8(0, 12);
  const ihdr = createChunk('IHDR', ihdrData);
  const idat = createChunk('IDAT', Buffer.from([0, 255, 0, 0]));
  const iend = createChunk('IEND', Buffer.alloc(0));
  return Buffer.concat([sig, ihdr, idat, iend]);
}

function makeMinimalJPEG(): Buffer {
  return Buffer.from([
    0xFF, 0xD8,
    0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
    0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00,
    0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3F, 0x00,
    0x00, 0x00,
    0xFF, 0xD9,
  ]);
}

function createChunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = computeCrc32(Buffer.concat([typeBuf, data]));
  const header = Buffer.alloc(8);
  header.writeUInt32BE(data.length, 0);
  typeBuf.copy(header, 4);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32LE(crc, 0);
  return Buffer.concat([header, data, crcBuf]);
}

function computeCrc32(data: Buffer): number {
  let crc = 0xffffffff;
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  for (let i = 0; i < data.length; i++) crc = table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// No top-level hooks — each describe block manages its own lifecycle.

describe('Engine error paths', () => {
  beforeAll(() => {
    mkdirSync(TEST_DIR, { recursive: true });
  });

  const engine = makeEngine();

  it('create() throws UnsupportedFormatError when back format has no adapter', async () => {
    const png = makeMinimalPNG();
    writeFileSync(join(TEST_DIR, 'test.png'), png);

    // tar has no registered back adapter
    await expect(engine.create({
      front: join(TEST_DIR, 'test.png'),
      back: { format: 'tar', entries: [] },
    })).rejects.toThrow(/Unsupported back format/);
  });

  it('create() throws IncompatibleFormatError for unsupported but registered pair', async () => {
    const png = makeMinimalPNG();
    writeFileSync(join(TEST_DIR, 'test.png'), png);

    // Register a fake back adapter for 'foo' but no compatibility rule
    engine.registry.registerBack({
      id: 'foo',
      async create() { return Buffer.from([]); },
      async inspect() { return { format: 'foo' }; },
      async parse() { return { entries: [], centralDir: [], eocd: {} as unknown, raw: Buffer.from([]) }; },
      getLayout() { return Promise.resolve({ format: 'foo' as const, size: 0 }); },
      relocate(buf: Buffer) { return buf; },
      toSource() { return { size: () => Promise.resolve(0), read: () => Promise.resolve(Buffer.from([])) }; },
      toPathSource() { return { size: () => Promise.resolve(0), read: () => Promise.resolve(Buffer.from([])) }; },
    });

    // 'png' + 'foo' has no compatibility rule → IncompatibleFormatError
    await expect(engine.create({
      front: join(TEST_DIR, 'test.png'),
      back: { format: 'foo', entries: [] },
    })).rejects.toThrow(IncompatibleFormatError);
  });

  it('create() throws when back adapter is unknown', async () => {
    const png = makeMinimalPNG();
    writeFileSync(join(TEST_DIR, 'test.png'), png);

    await expect(engine.create({
      front: join(TEST_DIR, 'test.png'),
      back: { format: 'unknown', entries: [] },
    })).rejects.toThrow(/Unsupported back format/);
  });

  it('openFront() throws on non-polyglot file', async () => {
    const png = makeMinimalPNG();
    writeFileSync(join(TEST_DIR, 'plain.png'), png);

    await expect(engine.openFront(join(TEST_DIR, 'plain.png')))
      .rejects.toThrow(InvalidFrontError);
  });

  it('openBack() throws on non-polyglot file', async () => {
    const png = makeMinimalPNG();
    writeFileSync(join(TEST_DIR, 'plain.png'), png);

    await expect(engine.openBack(join(TEST_DIR, 'plain.png')))
      .rejects.toThrow(InvalidArchiveError);
  });

  it('archive.read() throws when entry not found', async () => {
    const png = makeMinimalPNG();
    writeFileSync(join(TEST_DIR, 'test.png'), png);

    const { buildZip, relocateZipOffsets } = await import('@polyglot/formats-zip');
    const zip = buildZip([{ name: 'a.txt', data: Buffer.from('a') }]);
    const relocated = relocateZipOffsets(zip, png.length);
    const polyglot = Buffer.concat([png, relocated]);
    const path = join(TEST_DIR, 'poly.png');
    writeFileSync(path, polyglot);

    const archive = await engine.openBack(path);
    await expect(archive.read('nonexistent.txt'))
      .rejects.toThrow(/not found/);
  });
});

describe('PNG validate edge cases', () => {
  it('validate() returns false when IEND chunk is missing', async () => {
    const { PngAdapter } = await import('@polyglot/formats-png');
    const adapter = new PngAdapter();

    // PNG with IHDR + IDAT but no IEND
    const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    const ihdr = createChunk('IHDR', Buffer.alloc(13));
    const idat = createChunk('IDAT', Buffer.from([0]));
    const buf = Buffer.concat([sig, ihdr, idat]); // no IEND

    const result = await adapter.validate({
      size: () => Promise.resolve(buf.length),
      read: (o, l) => Promise.resolve(buf.subarray(o, o + l)),
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('IEND');
  });

  it('validate() returns true for valid minimal PNG', async () => {
    const { PngAdapter } = await import('@polyglot/formats-png');
    const adapter = new PngAdapter();
    const png = makeMinimalPNG();

    const result = await adapter.validate({
      size: () => Promise.resolve(png.length),
      read: (o, l) => Promise.resolve(png.subarray(o, o + l)),
    });
    expect(result.valid).toBe(true);
  });
});

describe('JPEG validate edge cases', () => {
  it('validate() returns false when EOI is missing', async () => {
    const { JpegAdapter } = await import('@polyglot/formats-jpeg');
    const adapter = new JpegAdapter();

    // JPEG with SOI + SOF but no EOI
    const buf = Buffer.from([
      0xFF, 0xD8,
      0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00,
      0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3F, 0x00,
      0x00, 0x00,
      // NO 0xFFD9
    ]);

    const result = await adapter.validate({
      size: () => Promise.resolve(buf.length),
      read: (o, l) => Promise.resolve(buf.subarray(o, o + l)),
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('EOI');
  });

  it('validate() returns false for non-JPEG data', async () => {
    const { JpegAdapter } = await import('@polyglot/formats-jpeg');
    const adapter = new JpegAdapter();

    const result = await adapter.validate({
      size: () => Promise.resolve(3),
      read: () => Promise.resolve(Buffer.from([0x00, 0x01, 0x02])),
    });
    expect(result.valid).toBe(false);
  });

  it('detect() returns false for non-JPEG data', async () => {
    const { JpegAdapter } = await import('@polyglot/formats-jpeg');
    const adapter = new JpegAdapter();

    const detected = await adapter.detect({
      size: () => Promise.resolve(3),
      read: () => Promise.resolve(Buffer.from([0x00, 0x01, 0x02])),
    });
    expect(detected).toBe(false);
  });
});

describe('Detector inspect on plain JPEG', () => {
  it('inspect() returns polyglot=false for plain JPEG', async () => {
    const engine = makeEngine();
    const jpeg = makeMinimalJPEG();

    const info = await engine.inspect(jpeg);
    expect(info.polyglot).toBe(false);
  });

  it('detect() identifies plain JPEG as non-polyglot', async () => {
    const engine = makeEngine();
    const jpeg = makeMinimalJPEG();

    const result = await engine.detect(jpeg);
    expect(result.isPolyglot).toBe(false);
    expect(result.front?.format).toBe('jpeg');
  });
});

describe('ZIP relocate edge cases', () => {
  it('relocateZipOffsets returns unchanged buffer when adjustment is 0', async () => {
    const { buildZip, relocateZipOffsets } = await import('@polyglot/formats-zip');
    const zip = buildZip([{ name: 'a.txt', data: Buffer.from('a') }]);
    const result = relocateZipOffsets(zip, 0);
    expect(result).toBe(zip); // same reference (early return)
  });

  it('relocateZipOffsets throws on invalid ZIP without EOCD', async () => {
    const { relocateZipOffsets } = await import('@polyglot/formats-zip');
    expect(() => relocateZipOffsets(Buffer.from([0x00, 0x01, 0x02]), 10))
      .toThrow(/End of Central Directory/);
  });
});
