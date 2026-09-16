import { parsePng, isPng, validatePng, type PngInfo } from './png.js';
import { parseJpeg, isJpeg, validateJpeg, type JpegInfo } from './jpeg.js';
import { buildZip, relocateZipOffsets, listZipEntries, extractZipEntries, type ZipEntryInput, type ZipEntryMeta } from './zip.js';
import { concatBytes } from './bytes.js';

export type FrontFormat = 'png' | 'jpeg';

/** Mirror of the Node-side security limits so the playground enforces the same caps. */
export interface SecurityLimits {
  maxEntries: number;
  maxEntrySize: number;
  maxTotalSize: number;
}

export const DEFAULT_SECURITY_LIMITS: SecurityLimits = {
  maxEntries: 10_000,
  maxEntrySize: 1024 * 1024 * 1024, // 1 GiB
  maxTotalSize: 10 * 1024 * 1024 * 1024, // 10 GiB
};

export interface SynthesizeOptions {
  entries: ZipEntryInput[];
  limits?: Partial<SecurityLimits>;
}

export interface SynthesizeResult {
  data: Uint8Array;
  frontFormat: FrontFormat;
  /** Byte length of the untouched front image. */
  frontSize: number;
  /** Byte length of the relocated ZIP archive. */
  backSize: number;
  totalSize: number;
  entryCount: number;
  width: number;
  height: number;
}

export interface PolyglotInspection {
  isPolyglot: boolean;
  front?: { format: FrontFormat; size: number; width: number; height: number; valid: boolean };
  back?: { format: 'zip'; entryCount: number; size: number; entries: ZipEntryMeta[] };
  error?: string;
}

export function detectFrontFormat(data: Uint8Array): FrontFormat | null {
  if (isPng(data)) return 'png';
  if (isJpeg(data)) return 'jpeg';
  return null;
}

/** Parse a front image, returning both the typed info and the format tag. */
export function parseFrontImage(
  data: Uint8Array,
): { format: 'png'; info: PngInfo } | { format: 'jpeg'; info: JpegInfo } {
  if (isPng(data)) return { format: 'png', info: parsePng(data) };
  if (isJpeg(data)) {
    const info = parseJpeg(data);
    if (!info.valid) throw new Error('Invalid JPEG: missing EOI marker');
    return { format: 'jpeg', info };
  }
  throw new Error('Unsupported front format: expected PNG or JPEG');
}

function enforceLimits(entries: ZipEntryInput[], limits: SecurityLimits): void {
  if (entries.length > limits.maxEntries) {
    throw new Error(`Entry count ${entries.length} exceeds limit of ${limits.maxEntries}`);
  }
  let total = 0;
  for (const entry of entries) {
    if (entry.data.length > limits.maxEntrySize) {
      throw new Error(`Entry "${entry.name}" exceeds maximum size of ${limits.maxEntrySize} bytes`);
    }
    total += entry.data.length;
  }
  if (total > limits.maxTotalSize) {
    throw new Error(`Total size ${total} exceeds limit of ${limits.maxTotalSize} bytes`);
  }
}

/**
 * Combine a front image with ZIP entries into a single polyglot file.
 *
 * The image bytes are copied verbatim; the archive is built standalone and then
 * every absolute offset inside it is shifted by the image length, so a ZIP
 * reader locating the archive by its EOCD finds consistent pointers.
 */
export function synthesize(image: Uint8Array, options: SynthesizeOptions): SynthesizeResult {
  const { entries, limits: limitOverrides } = options;
  const limits = { ...DEFAULT_SECURITY_LIMITS, ...limitOverrides };

  if (image.length === 0) throw new Error('Front image is empty');
  if (entries.length === 0) throw new Error('At least one archive entry is required');

  const parsed = parseFrontImage(image);
  const validation = parsed.format === 'png' ? validatePng(image) : validateJpeg(image);
  if (!validation.valid) throw new Error(validation.error ?? 'Invalid front image');

  enforceLimits(entries, limits);

  const archive = buildZip(entries);
  const relocated = relocateZipOffsets(archive, parsed.info.size);
  const data = concatBytes(image, relocated);

  return {
    data,
    frontFormat: parsed.format,
    frontSize: parsed.info.size,
    backSize: relocated.length,
    totalSize: data.length,
    entryCount: entries.length,
    width: parsed.info.width,
    height: parsed.info.height,
  };
}

/**
 * Inspect a file: identify the front image, then look for a readable ZIP archive
 * in the bytes that follow it.
 */
export function inspect(data: Uint8Array): PolyglotInspection {
  if (data.length === 0) return { isPolyglot: false, error: 'File is empty' };

  let front: PolyglotInspection['front'];
  let frontSize = 0;

  try {
    const parsed = parseFrontImage(data);
    frontSize = parsed.info.size;
    front = {
      format: parsed.format,
      size: parsed.info.size,
      width: parsed.info.width,
      height: parsed.info.height,
      valid: parsed.info.valid,
    };
  } catch (err) {
    return { isPolyglot: false, error: err instanceof Error ? err.message : String(err) };
  }

  // No trailing bytes means it is just an image.
  if (frontSize >= data.length) return { isPolyglot: false, front };

  try {
    const entries = listZipEntries(data);
    return {
      isPolyglot: entries.length > 0,
      front,
      back: {
        format: 'zip',
        entryCount: entries.length,
        size: data.length - frontSize,
        entries,
      },
    };
  } catch {
    // Front parsed but no archive follows — a plain image with trailing bytes.
    return { isPolyglot: false, front };
  }
}

export interface ExtractResult {
  front: { format: FrontFormat; data: Uint8Array };
  entries: ZipEntryInput[];
}

/** Split a polyglot file back into its front image and archive entries. */
export async function extract(data: Uint8Array): Promise<ExtractResult> {
  const parsed = parseFrontImage(data);
  const frontData = data.subarray(0, parsed.info.size);

  if (parsed.info.size >= data.length) {
    throw new Error('Not a polyglot file: no archive data after the image');
  }

  const archiveView = data.subarray(parsed.info.size);
  const entries = await extractZipEntries(archiveView);

  return {
    front: { format: parsed.format, data: frontData },
    entries,
  };
}

export { buildZip, relocateZipOffsets, listZipEntries, extractZipEntries, parsePng, parseJpeg };
export { crc32 } from './crc32.js';
export type { ZipEntryInput, ZipEntryMeta, PngInfo, JpegInfo };
