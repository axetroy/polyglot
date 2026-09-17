import type { BinarySource } from "@polyglot/binary";
import { BufferSource, PathSource, readU32BE } from "@polyglot/binary";

// PNG Signature: 89 50 4E 47 0D 0A 1A 0A
const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export interface PngChunk {
  type: string;
  length: number;
  data: Uint8Array;
  offset: number;
}

export interface PngInfo {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  compressionMethod: number;
  filterMethod: number;
  interlaceMethod: number;
  chunks: PngChunk[];
  size: number;
}

export interface PngLayout {
  format: "png";
  size: number;
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
}

export class PngAdapter {
  readonly id = "png";

  async detect(source: BinarySource): Promise<boolean> {
    const header = await source.read(0, 8);
    return equalsBytes(header, PNG_SIGNATURE);
  }

  async inspect(source: BinarySource): Promise<PngInfo> {
    const buffer = await this.readFull(source);
    return this.parsePng(buffer);
  }

  async validate(source: BinarySource): Promise<{ valid: boolean; error?: string }> {
    try {
      const info = await this.inspect(source);
      const hasIend = info.chunks.some((c) => c.type === "IEND");
      if (!hasIend) {
        return { valid: false, error: "Missing IEND chunk" };
      }
      return { valid: true };
    } catch (err) {
      return { valid: false, error: err instanceof Error ? err.message : "Unknown error" };
    }
  }

  async getLayout(info: PngInfo): Promise<PngLayout> {
    return {
      format: "png",
      size: info.size,
      width: info.width,
      height: info.height,
      bitDepth: info.bitDepth,
      colorType: info.colorType,
    };
  }

  parsePng(buffer: Uint8Array): PngInfo {
    if (buffer.length < 8 || !equalsBytes(buffer.subarray(0, 8), PNG_SIGNATURE)) {
      throw new Error("Not a valid PNG file");
    }

    const chunks: PngChunk[] = [];
    let offset = 8;

    while (offset < buffer.length) {
      if (offset + 8 > buffer.length) {
        throw new Error("PNG truncated: not enough data for chunk header");
      }

      const length = readU32BE(buffer, offset);
      const typeBuf = buffer.subarray(offset + 4, offset + 8);
      const type = toAscii(typeBuf);

      if (offset + 12 + length > buffer.length) {
        throw new Error(`PNG truncated: chunk ${type} extends beyond file`);
      }

      const data = buffer.subarray(offset + 8, offset + 12 + length);
      chunks.push({ type, length, data, offset: offset + 4 });

      offset += 12 + length;

      if (type === "IEND") break;
    }

    // Parse IHDR
    const ihdr = chunks.find((c) => c.type === "IHDR");
    if (!ihdr) {
      throw new Error("PNG missing IHDR chunk");
    }

    const width = readU32BE(ihdr.data, 0);
    const height = readU32BE(ihdr.data, 4);
    const bitDepth = ihdr.data[8]!;
    const colorType = ihdr.data[9]!;
    const compressionMethod = ihdr.data[10]!;
    const filterMethod = ihdr.data[11]!;
    const interlaceMethod = ihdr.data[12]!;

    return {
      width,
      height,
      bitDepth,
      colorType,
      compressionMethod,
      filterMethod,
      interlaceMethod,
      chunks,
      size: offset,
    };
  }

  private async readFull(source: BinarySource): Promise<Uint8Array> {
    const size = await source.size();
    return source.read(0, size);
  }

  toSource(buffer: Uint8Array): BinarySource {
    return new BufferSource(buffer);
  }

  toPathSource(path: string): BinarySource {
    return new PathSource(path);
  }
}

// ── tiny helpers (avoids pulling in full encoding deps) ───
function equalsBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function toAscii(buf: Uint8Array): string {
  let out = "";
  for (let i = 0; i < buf.length; i++) out += String.fromCharCode(buf[i]!);
  return out;
}

export const pngAdapter = new PngAdapter();
