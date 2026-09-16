import { describe, it, expect } from 'vitest';
import { Detector } from '@polyglot/core';
import { FormatRegistry } from '@polyglot/core';
import { pngAdapter } from '@polyglot/formats-png';
import { jpegAdapter } from '@polyglot/formats-jpeg';
import { zipAdapter } from '@polyglot/formats-zip';

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
  const chunks: Buffer[] = [Buffer.from([0xFF, 0xD8])];
  chunks.push(Buffer.from([0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]));
  chunks.push(Buffer.from([0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00]));
  chunks.push(Buffer.from([0xFF, 0xC4, 0x00, 0x1F, 0x00, 0x00, 0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0A, 0x0B, 0x00, 0x00]));
  chunks.push(Buffer.from([0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3F, 0x00]));
  chunks.push(Buffer.from([0x00, 0x00]));
  chunks.push(Buffer.from([0xFF, 0xD9]));
  return Buffer.concat(chunks);
}

function makeSource(buf: Buffer) {
  return {
    size: () => Promise.resolve(buf.length),
    read: (o: number, l: number) => Promise.resolve(buf.subarray(o, o + l)),
  };
}

function makeRegistry() {
  const registry = new FormatRegistry();
  registry.registerFront(pngAdapter);
  registry.registerFront(jpegAdapter);
  registry.registerBack(zipAdapter);
  registry.registerCompatibility({ front: 'png', back: 'zip', supported: true, mode: 'relocated' });
  registry.registerCompatibility({ front: 'jpeg', back: 'zip', supported: true, mode: 'relocated' });
  return registry;
}

describe('Detector', () => {
  const registry = makeRegistry();
  const detector = new Detector(registry);

  it('should detect PNG format', async () => {
    const src = makeSource(createMinimalPNG());
    const result = await detector.detect(src);
    expect(result.isPolyglot).toBe(false); // plain PNG is not polyglot
    expect(result.front?.format).toBe('png');
  });

  it('should detect JPEG format', async () => {
    const src = makeSource(createMinimalJPEG());
    const result = await detector.detect(src);
    expect(result.isPolyglot).toBe(false);
    expect(result.front?.format).toBe('jpeg');
  });

  it('should detect polyglot PNG+ZIP', async () => {
    const png = createMinimalPNG();
    const { buildZip, relocateZipOffsets } = await import('@polyglot/formats-zip');
    const zip = buildZip([{ name: 'test.txt', data: Buffer.from('test') }]);
    const relocated = relocateZipOffsets(zip, png.length);
    const polyglot = Buffer.concat([png, relocated]);

    const src = makeSource(polyglot);
    const result = await detector.detect(src);
    expect(result.isPolyglot).toBe(true);
    expect(result.front?.format).toBe('png');
    expect(result.back?.format).toBe('zip');
  });

  it('should detect polyglot JPEG+ZIP', async () => {
    const jpeg = createMinimalJPEG();
    const { buildZip, relocateZipOffsets } = await import('@polyglot/formats-zip');
    const zip = buildZip([{ name: 'test.txt', data: Buffer.from('test') }]);
    const relocated = relocateZipOffsets(zip, jpeg.length);
    const polyglot = Buffer.concat([jpeg, relocated]);

    const src = makeSource(polyglot);
    const result = await detector.detect(src);
    expect(result.isPolyglot).toBe(true);
    expect(result.front?.format).toBe('jpeg');
    expect(result.back?.format).toBe('zip');
  });

  it('should return isPolyglot=false for non-polyglot files', async () => {
    const png = createMinimalPNG();
    const src = makeSource(png);
    const result = await detector.detect(src);
    expect(result.isPolyglot).toBe(false);
    expect(result.front?.format).toBe('png');
    expect(result.back).toBeUndefined();
  });
});

describe('Detector inspect', () => {
  const registry = makeRegistry();
  const detector = new Detector(registry);

  it('should return PolyglotInfo for plain PNG', async () => {
    const png = createMinimalPNG();
    const src = makeSource(png);
    const info = await detector.inspect(src);
    // inspect() on non-polyglot returns { polyglot: false } with no front/back details
    expect(info.polyglot).toBe(false);
    // But detect() should still identify the front format
    const detectResult = await detector.detect(src);
    expect(detectResult.front?.format).toBe('png');
  });

  it('should return PolyglotInfo for polyglot file', async () => {
    const png = createMinimalPNG();
    const { buildZip, relocateZipOffsets } = await import('@polyglot/formats-zip');
    const zip = buildZip([{ name: 'a.txt', data: Buffer.from('aaa') }]);
    const relocated = relocateZipOffsets(zip, png.length);
    const polyglot = Buffer.concat([png, relocated]);

    const src = makeSource(polyglot);
    const info = await detector.inspect(src);
    expect(info.polyglot).toBe(true);
    expect(info.front?.format).toBe('png');
    expect(info.back?.format).toBe('zip');
    expect(info.back?.entries).toBe(1);
  });
});
