import { equalsBytes, readU32BE, toAscii } from './bytes.js';

export const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export interface PngChunk {
  type: string;
  length: number;
  offset: number;
}

export interface PngInfo {
  format: 'png';
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  chunks: PngChunk[];
  /** Byte length of the complete PNG stream, i.e. the offset just past IEND. */
  size: number;
  valid: boolean;
}

export function isPng(data: Uint8Array): boolean {
  return data.length >= 8 && equalsBytes(data.subarray(0, 8), PNG_SIGNATURE);
}

/**
 * Walk PNG chunks from the signature to the IEND chunk.
 *
 * Trailing bytes after IEND are ignored on purpose: in a polyglot file the
 * appended ZIP archive lives exactly there.
 */
export function parsePng(data: Uint8Array): PngInfo {
  if (!isPng(data)) throw new Error('Not a valid PNG: signature mismatch');

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let sawIend = false;
  const chunks: PngChunk[] = [];

  while (offset + 8 <= data.length) {
    const chunkStart = offset;
    const length = readU32BE(data, offset);
    const type = toAscii(data, offset + 4, offset + 8);
    offset += 8;

    // A truncated chunk means IEND was never reached: stop and report invalid.
    if (offset + length + 4 > data.length) break;

    if (type === 'IHDR' && length >= 13) {
      width = readU32BE(data, offset);
      height = readU32BE(data, offset + 4);
      bitDepth = data[offset + 8]!;
      colorType = data[offset + 9]!;
    }

    chunks.push({ type, length, offset: chunkStart });
    offset += length + 4; // skip payload + CRC

    if (type === 'IEND') {
      sawIend = true;
      break;
    }
  }

  if (!sawIend) throw new Error('Invalid PNG: missing IEND chunk');

  return {
    format: 'png',
    width,
    height,
    bitDepth,
    colorType,
    chunks,
    size: offset,
    valid: true,
  };
}

export function validatePng(data: Uint8Array): { valid: boolean; error?: string } {
  try {
    parsePng(data);
    return { valid: true };
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}
