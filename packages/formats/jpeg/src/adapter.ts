import type { BinarySource } from "@polyglot/binary";
import { BufferSource, PathSource, readU16BE } from "@polyglot/binary";

// JPEG SOI: FF D8
const JPEG_SOI = new Uint8Array([0xff, 0xd8]);

export interface JpegSegment {
  marker: number;
  length: number;
  data: Uint8Array;
  offset: number;
}

export interface JpegInfo {
  width?: number;
  height?: number;
  bitDepth: number;
  numComponents: number;
  segments: JpegSegment[];
  size: number;
}

export interface JpegLayout {
  format: "jpeg";
  size: number;
  width?: number;
  height?: number;
  bitDepth: number;
}

const SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

export class JpegAdapter {
  readonly id = "jpeg";

  async detect(source: BinarySource): Promise<boolean> {
    const header = await source.read(0, 2);
    return equalsBytes(header, JPEG_SOI);
  }

  async inspect(source: BinarySource): Promise<JpegInfo> {
    const buffer = await this.readFull(source);
    return this.parseJpeg(buffer);
  }

  async validate(source: BinarySource): Promise<{ valid: boolean; error?: string }> {
    try {
      const info = await this.inspect(source);
      const hasEoi = info.segments.some((s) => s.marker === 0xd9);
      if (!hasEoi) {
        return { valid: false, error: "Missing EOI marker" };
      }
      return { valid: true };
    } catch (err) {
      return { valid: false, error: err instanceof Error ? err.message : "Unknown error" };
    }
  }

  async getLayout(info: JpegInfo): Promise<JpegLayout> {
    return {
      format: "jpeg",
      size: info.size,
      width: info.width,
      height: info.height,
      bitDepth: info.bitDepth,
    };
  }

  parseJpeg(buffer: Uint8Array): JpegInfo {
    if (buffer.length < 2 || !equalsBytes(buffer.subarray(0, 2), JPEG_SOI)) {
      throw new Error("Not a valid JPEG file");
    }

    const segments: JpegSegment[] = [];
    let offset = 2;

    while (offset < buffer.length) {
      // Find marker
      while (offset < buffer.length && buffer[offset] === 0xff) {
        offset++;
      }
      if (offset >= buffer.length) break;

      const marker = buffer[offset]!;
      offset++;

      // Skip padding bytes
      if (marker === 0x00) {
        continue;
      }

      const segOffset = offset - 2; // include the 0xFF

      // Markers without payload
      if (marker === 0xd9 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) {
        segments.push({ marker, length: 0, data: new Uint8Array(0), offset: segOffset });
        if (marker === 0xd9) break; // EOI
        continue;
      }

      if (offset + 2 > buffer.length) {
        throw new Error("JPEG truncated: not enough data for segment length");
      }

      const length = readU16BE(buffer, offset);
      offset += 2;

      if (offset + length - 2 > buffer.length) {
        // Stop at boundary — this may be a polyglot file where ZIP bytes follow
        break;
      }

      const data = buffer.subarray(offset, offset + length - 2);
      segments.push({ marker, length, data, offset: segOffset });
      offset += length - 2;

      if (marker === 0xd9) break; // EOI
    }

    // Extract dimensions from SOF marker
    let width: number | undefined;
    let height: number | undefined;
    let bitDepth = 8;
    let numComponents = 3;

    for (const seg of segments) {
      if (SOF_MARKERS.has(seg.marker) && seg.data.length >= 7) {
        bitDepth = seg.data[0]!;
        height = readU16BE(seg.data, 1);
        width = readU16BE(seg.data, 3);
        numComponents = seg.data[5]!;
        break;
      }
    }

    return {
      width,
      height,
      bitDepth,
      numComponents,
      segments,
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

function equalsBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export const jpegAdapter = new JpegAdapter();
