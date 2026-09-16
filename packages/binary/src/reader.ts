import type { BinarySource } from './source.js';
import {
  readU8, readU16LE, readU16BE, readU32LE, readU32BE,
  writeU8, writeU16LE, writeU16BE, writeU32LE, writeU32BE,
  alloc, allocFill, concat, fromString, toString,
} from './bytes.js';

export class BinaryReader {
  private readonly source: BinarySource;
  private pos = 0;

  constructor(source: BinarySource) {
    this.source = source;
  }

  get position(): number {
    return this.pos;
  }

  async readUInt8(): Promise<number> {
    const buf = await this.source.read(this.pos, 1);
    this.pos += 1;
    return readU8(buf, 0);
  }

  async readUInt16LE(): Promise<number> {
    const buf = await this.source.read(this.pos, 2);
    this.pos += 2;
    return readU16LE(buf, 0);
  }

  async readUInt16BE(): Promise<number> {
    const buf = await this.source.read(this.pos, 2);
    this.pos += 2;
    return readU16BE(buf, 0);
  }

  async readUInt32LE(): Promise<number> {
    const buf = await this.source.read(this.pos, 4);
    this.pos += 4;
    return readU32LE(buf, 0);
  }

  async readUInt32BE(): Promise<number> {
    const buf = await this.source.read(this.pos, 4);
    this.pos += 4;
    return readU32BE(buf, 0);
  }

  async readFixed(length: number): Promise<Uint8Array> {
    const buf = await this.source.read(this.pos, length);
    this.pos += length;
    return buf;
  }

  async readNullTerminatedString(maxLength: number): Promise<string> {
    const bytes: Uint8Array = allocFill(maxLength);
    for (let i = 0; i < maxLength; i++) {
      const byte = await this.readUInt8();
      if (byte === 0) {
        return toString(bytes.subarray(0, i));
      }
      bytes[i] = byte;
    }
    return toString(bytes);
  }

  seek(offset: number): void {
    this.pos = offset;
  }

  skip(offset: number): void {
    this.pos += offset;
  }

  async readFile(offset: number, length: number): Promise<Uint8Array> {
    return this.source.read(offset, length);
  }

  tell(): number {
    return this.pos;
  }
}

export class BinaryWriter {
  private readonly chunks: Uint8Array[] = [];
  private pos = 0;

  get position(): number {
    return this.pos;
  }

  getBuffer(): Uint8Array {
    return concat(...this.chunks);
  }

  writeUInt8(value: number): void {
    const buf = alloc(1);
    writeU8(buf, 0, value);
    this.chunks.push(buf);
    this.pos += 1;
  }

  writeUInt16LE(value: number): void {
    const buf = alloc(2);
    writeU16LE(buf, 0, value);
    this.chunks.push(buf);
    this.pos += 2;
  }

  writeUInt16BE(value: number): void {
    const buf = alloc(2);
    writeU16BE(buf, 0, value);
    this.chunks.push(buf);
    this.pos += 2;
  }

  writeUInt32LE(value: number): void {
    const buf = alloc(4);
    writeU32LE(buf, 0, value);
    this.chunks.push(buf);
    this.pos += 4;
  }

  writeUInt32BE(value: number): void {
    const buf = alloc(4);
    writeU32BE(buf, 0, value);
    this.chunks.push(buf);
    this.pos += 4;
  }

  writeBuffer(buffer: Uint8Array): void {
    this.chunks.push(buffer);
    this.pos += buffer.length;
  }

  writeString(str: string): void {
    const buf = fromString(str);
    this.chunks.push(buf);
    this.pos += buf.length;
  }

  writePaddingAligned(alignment: number): number {
    const remainder = this.pos % alignment;
    if (remainder === 0) return 0;
    const padding = alignment - remainder;
    this.chunks.push(allocFill(padding));
    this.pos += padding;
    return padding;
  }

  patchUInt16LE(offset: number, value: number): void {
    const buf = alloc(2);
    writeU16LE(buf, 0, value);
    this.insertAt(offset, buf);
  }

  patchUInt32LE(offset: number, value: number): void {
    const buf = alloc(4);
    writeU32LE(buf, 0, value);
    this.insertAt(offset, buf);
  }

  private insertAt(offset: number, buf: Uint8Array): void {
    const all = concat(...this.chunks);
    const before = all.subarray(0, offset);
    const after = all.subarray(offset + buf.length);
    this.chunks.length = 0;
    this.chunks.push(before, buf, after);
    this.pos = before.length + buf.length + after.length;
  }
}
