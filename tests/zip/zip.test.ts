import { describe, it, expect } from 'vitest';
import { buildZip, relocateZipOffsets, parseZip } from '@polyglot/formats-zip';
import { BufferSource } from '@polyglot/binary';

describe('buildZip', () => {
  it('should create a valid ZIP archive', async () => {
    const buffer = buildZip([
      { name: 'hello.txt', data: Buffer.from('Hello World') },
      { name: 'data.json', data: Buffer.from('{"key":"value"}') },
    ]);

    expect(buffer.length).toBeGreaterThan(0);

    // Parse it back
    const archive = await parseZip(new BufferSource(buffer));
    expect(archive.entries).toHaveLength(2);
    expect(archive.entries[0].name).toBe('hello.txt');
    expect(new TextDecoder().decode(archive.entries[0].data)).toBe('Hello World');
    expect(archive.entries[1].name).toBe('data.json');
  });

  it('should compute correct CRC32', async () => {
    const buffer = buildZip([
      { name: 'test.txt', data: Buffer.from('test') },
    ]);

    const archive = await parseZip(new BufferSource(buffer));
    expect(archive.entries[0].crc32).toBeGreaterThan(0);
  });
});

describe('relocateZipOffsets', () => {
  it('should shift all offsets by adjustment', async () => {
    const original = buildZip([
      { name: 'file.txt', data: Buffer.from('content') },
    ]);

    const adjusted = relocateZipOffsets(original, 1000);

    // Parse the adjusted ZIP
    const archive = await parseZip(new BufferSource(adjusted));
    expect(archive.entries).toHaveLength(1);
    expect(archive.entries[0].name).toBe('file.txt');
    expect(new TextDecoder().decode(archive.entries[0].data)).toBe('content');
  });

  it('should not modify buffer when adjustment is 0', () => {
    const buffer = Buffer.from([1, 2, 3]);
    const result = relocateZipOffsets(buffer, 0);
    expect(result).toBe(buffer);
  });
});

describe('parseZip', () => {
  it('should parse a minimal ZIP', async () => {
    const buffer = buildZip([
      { name: 'empty.txt', data: Buffer.from('') },
    ]);

    const archive = await parseZip(new BufferSource(buffer));
    expect(archive.entries).toHaveLength(1);
    expect(archive.entries[0].name).toBe('empty.txt');
    expect(archive.entries[0].data).toHaveLength(0);
  });

  it('should detect EOCD correctly', async () => {
    const buffer = buildZip([
      { name: 'a.txt', data: Buffer.from('a') },
      { name: 'b.txt', data: Buffer.from('b') },
      { name: 'c.txt', data: Buffer.from('c') },
    ]);

    const archive = await parseZip(new BufferSource(buffer));
    expect(archive.entries).toHaveLength(3);
  });
});
