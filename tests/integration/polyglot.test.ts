import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PolyglotEngine } from '@polyglot/core';
import { pngAdapter } from '@polyglot/formats-png';
import { jpegAdapter } from '@polyglot/formats-jpeg';
import { zipAdapter } from '@polyglot/formats-zip';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';

const TEST_DIR = join(import.meta.dirname, 'tmp');

function createMinimapPNG(): string {
  mkdirSync(TEST_DIR, { recursive: true });
  const png = createMinimalPNG();
  const path = join(TEST_DIR, 'test.png');
  writeFileSync(path, png);
  return path;
}

function createMinimalPNG(): Buffer {
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
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c;
  }
  for (let i = 0; i < data.length; i++) {
    crc = table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createMinimalJPEG(): Buffer {
  // Minimal valid JPEG: SOI + APP0 + SOF0 + DHT + SOS + scan data + EOI
  const chunks: Buffer[] = [Buffer.from([0xFF, 0xD8])]; // SOI

  // APP0 (JFIF) - 18 bytes total (2 marker + 2 length + 16 data)
  chunks.push(Buffer.from([
    0xFF, 0xE0, 0x00, 0x10,
    0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
  ]));

  // SOF0 (Start of Frame) - 13 bytes total
  chunks.push(Buffer.from([
    0xFF, 0xC0, 0x00, 0x0B, 0x08,
    0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00,
  ]));

  // DHT (Huffman Table) - 35 bytes total (marker + length + 31 data)
  chunks.push(Buffer.from([
    0xFF, 0xC4, 0x00, 0x1F, 0x00,
    0x00, 0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0A, 0x0B, 0x00, 0x00,
  ]));

  // SOS (Start of Scan) - 10 bytes total
  chunks.push(Buffer.from([
    0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3F, 0x00,
  ]));

  // Minimal compressed scan data
  chunks.push(Buffer.from([0x00, 0x00]));
  // EOI
  chunks.push(Buffer.from([0xFF, 0xD9]));
  return Buffer.concat(chunks);
}

describe('PNG + ZIP polyglot', () => {
  let engine: PolyglotEngine;

  beforeAll(() => {
    engine = new PolyglotEngine();
    engine.registerFront(pngAdapter);
    engine.registerBack(zipAdapter);
    engine.registerCompatibility('png', 'zip', true, 'relocated');
  });

  afterAll(() => {
    try { rmSync(TEST_DIR, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('should create a PNG+ZIP polyglot file', async () => {
    const pngPath = createMinimapPNG();
    const file = await engine.create({
      front: pngPath,
      back: {
        format: 'zip',
        entries: [{ name: 'hello.txt', data: Buffer.from('Hello World') }],
      },
    });

    const outputPath = join(TEST_DIR, 'output.png');
    await file.write(outputPath);

    const buffer = file.getBuffer();
    expect(buffer.length).toBeGreaterThan(0);

    const info = await engine.inspect(outputPath);
    expect(info.polyglot).toBe(true);
    expect(info.front?.format).toBe('png');
    expect(info.back?.format).toBe('zip');
  });

  it('should detect polyglot file', async () => {
    const pngPath = createMinimapPNG();
    const file = await engine.create({
      front: pngPath,
      back: {
        format: 'zip',
        entries: [{ name: 'test.txt', data: Buffer.from('test') }],
      },
    });

    const outputPath = join(TEST_DIR, 'detect.png');
    await file.write(outputPath);

    const detection = await engine.detect(outputPath);
    expect(detection.isPolyglot).toBe(true);
    expect(detection.front?.format).toBe('png');
    expect(detection.back?.format).toBe('zip');
  });

  it('should open front (PNG)', async () => {
    const pngPath = createMinimapPNG();
    const file = await engine.create({
      front: pngPath,
      back: {
        format: 'zip',
        entries: [{ name: 'test.txt', data: Buffer.from('test') }],
      },
    });

    const outputPath = join(TEST_DIR, 'front.png');
    await file.write(outputPath);

    const front = await engine.openFront(outputPath);
    expect(front.format).toBe('png');
    expect(front.size).toBeGreaterThan(0);
  });

  it('should open back (ZIP) and list entries', async () => {
    const pngPath = createMinimapPNG();
    const file = await engine.create({
      front: pngPath,
      back: {
        format: 'zip',
        entries: [
          { name: 'hello.txt', data: Buffer.from('Hello') },
          { name: 'world.txt', data: Buffer.from('World') },
        ],
      },
    });

    const outputPath = join(TEST_DIR, 'back.png');
    await file.write(outputPath);

    const archive = await engine.openBack(outputPath);
    expect(archive.format).toBe('zip');

    const entries = await archive.list();
    expect(entries).toContain('hello.txt');
    expect(entries).toContain('world.txt');

    const hello = await archive.read('hello.txt');
    expect(new TextDecoder().decode(hello)).toBe('Hello');
  });
});

describe('JPEG + ZIP polyglot', () => {
  let engine: PolyglotEngine;

  beforeAll(() => {
    engine = new PolyglotEngine();
    engine.registerFront(jpegAdapter);
    engine.registerBack(zipAdapter);
    engine.registerCompatibility('jpeg', 'zip', true, 'relocated');
  });

  afterAll(() => {
    try { rmSync(TEST_DIR, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('should create a JPEG+ZIP polyglot file', async () => {
    const jpegPath = join(TEST_DIR, 'test.jpg');
    mkdirSync(TEST_DIR, { recursive: true });
    writeFileSync(jpegPath, createMinimalJPEG());

    const file = await engine.create({
      front: jpegPath,
      back: {
        format: 'zip',
        entries: [{ name: 'data.bin', data: Buffer.from([1, 2, 3]) }],
      },
    });

    const outputPath = join(TEST_DIR, 'output.jpg');
    await file.write(outputPath);

    const info = await engine.inspect(outputPath);
    expect(info.polyglot).toBe(true);
    expect(info.front?.format).toBe('jpeg');
    expect(info.back?.format).toBe('zip');
  });
});
