import { describe, it, expect } from "vitest";
import {
  BinaryReader,
  BinaryWriter,
  BufferSource,
  readU8,
  readU16LE,
  readU32LE,
} from "@polyglot/binary";

describe("BinaryReader", () => {
  it("should read primitives", async () => {
    const buf = Buffer.alloc(12);
    buf.writeUInt8(0xab, 0);
    buf.writeUInt16LE(0x1234, 1);
    buf.writeUInt32LE(0x12345678, 3);

    const reader = new BinaryReader(new BufferSource(buf));
    expect(await reader.readUInt8()).toBe(0xab);
    expect(await reader.readUInt16LE()).toBe(0x1234);
    expect(await reader.readUInt32LE()).toBe(0x12345678);
  });

  it("should read big-endian values", async () => {
    const buf = Buffer.alloc(6);
    buf.writeUInt16BE(0x1234, 0);
    buf.writeUInt32BE(0x12345678, 2);

    const reader = new BinaryReader(new BufferSource(buf));
    expect(await reader.readUInt16BE()).toBe(0x1234);
    expect(await reader.readUInt32BE()).toBe(0x12345678);
  });

  it("should seek and read", async () => {
    const buf = Buffer.from("HelloWorld");
    const reader = new BinaryReader(new BufferSource(buf));
    reader.seek(5);
    const result = await reader.readFixed(5);
    expect(Array.from(result)).toEqual([87, 111, 114, 108, 100]);
  });
});

describe("BinaryWriter", () => {
  it("should write primitives", () => {
    const writer = new BinaryWriter();
    writer.writeUInt8(0xab);
    writer.writeUInt16LE(0x1234);
    writer.writeUInt32LE(0x12345678);

    const buf = writer.getBuffer();
    expect(readU8(buf, 0)).toBe(0xab);
    expect(readU16LE(buf, 1)).toBe(0x1234);
    expect(readU32LE(buf, 3)).toBe(0x12345678);
  });

  it("should patch values", () => {
    const writer = new BinaryWriter();
    writer.writeUInt32LE(0);
    writer.writeUInt32LE(0);
    writer.patchUInt32LE(0, 0x12345678);

    const buf = writer.getBuffer();
    expect(readU32LE(buf, 0)).toBe(0x12345678);
    expect(readU32LE(buf, 4)).toBe(0);
  });
});
