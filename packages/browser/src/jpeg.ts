import { readU16BE } from "./bytes.js";

export const JPEG_SOI = new Uint8Array([0xff, 0xd8]);
export const JPEG_EOI = 0xd9;

/** Start-Of-Frame markers that carry the image dimensions. */
const SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

export interface JpegSegment {
  marker: number;
  length: number;
  offset: number;
}

export interface JpegInfo {
  format: "jpeg";
  width: number;
  height: number;
  bitDepth: number;
  numComponents: number;
  segments: JpegSegment[];
  /** Byte length of the complete JPEG stream, i.e. the offset just past EOI. */
  size: number;
  valid: boolean;
}

export function isJpeg(data: Uint8Array): boolean {
  return data.length >= 2 && data[0] === 0xff && data[1] === 0xd8;
}

/**
 * Walk JPEG markers from SOI to EOI.
 *
 * The scan stops at EOI, so bytes appended after it (a polyglot ZIP archive)
 * are never interpreted as image segments.
 */
export function parseJpeg(data: Uint8Array): JpegInfo {
  if (!isJpeg(data)) throw new Error("Not a valid JPEG: missing SOI marker");

  const segments: JpegSegment[] = [];
  let offset = 2;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let numComponents = 0;
  let sawEoi = false;

  while (offset < data.length) {
    if (data[offset] !== 0xff) {
      offset++;
      continue;
    }

    const segOffset = offset;
    let marker = data[offset + 1];
    if (marker === undefined) break;
    offset += 2;

    // Fill bytes: a run of 0xFF is padding before the real marker.
    while (marker === 0xff && offset < data.length) {
      marker = data[offset]!;
      offset++;
    }

    // Standalone markers carry no payload.
    if (marker === JPEG_EOI) {
      segments.push({ marker, length: 0, offset: segOffset });
      sawEoi = true;
      break;
    }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      segments.push({ marker, length: 0, offset: segOffset });
      continue;
    }

    if (offset + 2 > data.length) break;
    const segmentLength = readU16BE(data, offset);
    if (segmentLength < 2 || offset + segmentLength > data.length) break;

    const payloadStart = offset + 2;
    segments.push({ marker, length: segmentLength, offset: segOffset });

    if (SOF_MARKERS.has(marker) && segmentLength >= 8) {
      // SOF payload: [precision:1][height:2][width:2][components:1]
      bitDepth = data[payloadStart]!;
      height = readU16BE(data, payloadStart + 1);
      width = readU16BE(data, payloadStart + 3);
      numComponents = data[payloadStart + 5]!;
    }

    offset += segmentLength;
  }

  return {
    format: "jpeg",
    width,
    height,
    bitDepth,
    numComponents,
    segments,
    size: offset,
    valid: sawEoi,
  };
}

export function validateJpeg(data: Uint8Array): { valid: boolean; error?: string } {
  try {
    const info = parseJpeg(data);
    if (!info.valid) return { valid: false, error: "Missing EOI marker" };
    return { valid: true };
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}
