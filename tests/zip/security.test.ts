import { describe, it, expect } from "vitest";
import { buildZip, relocateZipOffsets, parseZip } from "@polyglot/formats-zip";

function makeSource(buf: Uint8Array) {
  return {
    size: () => Promise.resolve(buf.length),
    read: (o: number, l: number) => Promise.resolve(buf.subarray(o, o + l)),
  };
}

describe("ZIP Security", () => {
  it("should reject ZIP with too many entries (maxEntries)", async () => {
    const entries = Array.from({ length: 10001 }, (_, i) => ({
      name: `file${i}.txt`,
      data: Buffer.from("x"),
    }));
    const zip = buildZip(entries);
    await expect(parseZip(makeSource(zip), { maxEntries: 10000 })).rejects.toThrow(
      /exceeds maximum entry limit/
    );
  });

  it("should reject ZIP with oversized entry (maxEntrySize)", async () => {
    const hugeData = Buffer.alloc(1024 * 1024 * 2); // 2 MB
    const zip = buildZip([{ name: "big.txt", data: hugeData }]);
    await expect(parseZip(makeSource(zip), { maxEntrySize: 1024 * 1024 })).rejects.toThrow(
      /exceeds maximum size/
    );
  });

  it("should reject ZIP with path traversal entries", async () => {
    const zip = buildZip([{ name: "evil/../../../etc/passwd", data: Buffer.from("pwned") }]);
    await expect(parseZip(makeSource(zip), { sanitizePaths: true })).rejects.toThrow(
      /Path traversal/
    );
  });

  it("should accept valid ZIP within limits", async () => {
    const zip = buildZip([
      { name: "a.txt", data: Buffer.from("hello") },
      { name: "b.txt", data: Buffer.from("world") },
    ]);
    const result = await parseZip(makeSource(zip), {
      maxEntries: 10000,
      maxEntrySize: 1024 * 1024,
    });
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0].name).toBe("a.txt");
  });

  it("should handle polyglot file correctly (PNG+ZIP)", async () => {
    // Create minimal PNG
    const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const ihdrData = Buffer.alloc(13);
    ihdrData.writeUInt32BE(1, 0);
    ihdrData.writeUInt32BE(1, 4);
    ihdrData.writeUInt8(8, 8);
    ihdrData.writeUInt8(2, 9);
    ihdrData.writeUInt8(0, 10);
    ihdrData.writeUInt8(0, 11);
    ihdrData.writeUInt8(0, 12);
    const ihdr = createChunk("IHDR", ihdrData);
    const idat = createChunk("IDAT", Buffer.from([0, 255, 0, 0]));
    const iend = createChunk("IEND", Buffer.alloc(0));
    const png = Buffer.concat([sig, ihdr, idat, iend]);

    const zip = buildZip([{ name: "test.txt", data: Buffer.from("test") }]);
    const relocated = relocateZipOffsets(zip, png.length);
    const polyglot = Buffer.concat([png, relocated]);

    const result = await parseZip(makeSource(polyglot.slice(png.length)));
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].name).toBe("test.txt");
  });
});

function createChunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, "ascii");
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
