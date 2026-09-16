import {
  readU16LE, readU32LE,
  toString,
} from '@polyglot/binary';
import {
  ZIP_CENTRAL_DIR_SIG,
  ZIP_EOCD_SIG,
  ZIP_LOCAL_FILE_HEADER_SIG,
} from './constants.js';

export interface ZipLocalHeader {
  signature: number;
  versionNeeded: number;
  flags: number;
  compressionMethod: number;
  lastModFileTime: number;
  lastModFileDate: number;
  crc32: number;
  compressedSize: number;
  uncompressedSize: number;
  fileNameLength: number;
  extraFieldLength: number;
  fileName: string;
  extraField: Uint8Array;
  dataOffset: number;
  dataStart: number;
}

export interface ZipCentralDirEntry {
  signature: number;
  versionMadeBy: number;
  versionNeeded: number;
  flags: number;
  compressionMethod: number;
  lastModFileTime: number;
  lastModFileDate: number;
  crc32: number;
  compressedSize: number;
  uncompressedSize: number;
  fileNameLength: number;
  extraFieldLength: number;
  commentLength: number;
  localHeaderOffset: number;
  fileName: string;
  extraField: Uint8Array;
  comment: string;
  externalAttributes: number;
}

export interface ZipEndOfCentralDir {
  signature: number;
  diskNumber: number;
  diskWithCentralDir: number;
  centralDirEntriesOnDisk: number;
  centralDirEntriesTotal: number;
  centralDirSize: number;
  centralDirOffset: number;
  commentLength: number;
  comment: string;
}

export interface ZipArchive {
  entries: ZipEntry[];
  centralDir: ZipCentralDirEntry[];
  eocd: ZipEndOfCentralDir;
  raw: Uint8Array;
}

export interface ZipEntry {
  name: string;
  data: Uint8Array;
  compressedSize: number;
  uncompressedSize: number;
  crc32: number;
  compressionMethod: number;
  localHeader: ZipLocalHeader;
  centralDirEntry: ZipCentralDirEntry;
}

export interface ZipParseOptions {
  /** Maximum number of entries allowed. Default: 10000. */
  maxEntries?: number;
  /** Maximum size (bytes) for any single entry's data. Default: 1 GB. */
  maxEntrySize?: number;
  /** Maximum total uncompressed size. Default: 10 GB. */
  maxTotalSize?: number;
  /** Whether to sanitize entry paths. Default: true. */
  sanitizePaths?: boolean;
}

const DEFAULT_MAX_ENTRIES = 10_000;
const DEFAULT_MAX_ENTRY_SIZE = 1024 * 1024 * 1024; // 1 GB
const DEFAULT_MAX_TOTAL_SIZE = 10 * 1024 * 1024 * 1024; // 10 GB

export async function parseZip(
  source: { read(offset: number, length: number): Promise<Uint8Array>; size(): Promise<number> },
  options: ZipParseOptions = {},
): Promise<ZipArchive> {
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const maxEntrySize = options.maxEntrySize ?? DEFAULT_MAX_ENTRY_SIZE;
  const maxTotalSize = options.maxTotalSize ?? DEFAULT_MAX_TOTAL_SIZE;
  const sanitizePaths = options.sanitizePaths ?? true;

  const size = await source.size();
  const buffer = await source.read(0, size);

  // Find EOCD
  const eocdOffset = findEocd(buffer);
  if (eocdOffset === -1) {
    throw new Error('Invalid ZIP: End of Central Directory not found');
  }

  const eocd = parseEocd(buffer, eocdOffset);
  // When the ZIP is embedded in a polyglot file (preceded by an image prefix),
  // the EOCD stores offsets relative to the ZIP's own origin.  Compute the
  // prefix length from the EOCD itself — the same trick `unzip` and Python's
  // `zipfile` use — and add it to every absolute pointer.
  const concat = computeConcatOffset(buffer, eocdOffset);
  const centralDirStart = eocd.centralDirOffset + concat;
  const centralDirEnd = eocdOffset;

  // Parse central directory entries
  const centralDirEntries: ZipCentralDirEntry[] = [];
  let offset = centralDirStart;
  while (offset < centralDirEnd) {
    const sig = readU32LE(buffer, offset);
    if (sig !== ZIP_CENTRAL_DIR_SIG) {
      break;
    }
    const entry = parseCentralDirEntry(buffer, offset);

    // Security: check entry count
    if (centralDirEntries.length >= maxEntries) {
      throw new Error(
        `ZIP archive exceeds maximum entry limit: ${centralDirEntries.length} >= ${maxEntries}`,
      );
    }

    centralDirEntries.push(entry);
    offset += 46 + entry.fileNameLength + entry.extraFieldLength + entry.commentLength;
  }

  // Security: validate total entry count
  if (centralDirEntries.length > maxEntries) {
    throw new Error(
      `ZIP archive has too many entries: ${centralDirEntries.length} exceeds limit of ${maxEntries}`,
    );
  }

  // Build entries from central directory
  const entries: ZipEntry[] = [];
  let totalUncompressedSize = 0;
  for (const cdEntry of centralDirEntries) {
    // Sanitize entry path
    if (sanitizePaths) {
      const safeName = sanitizePath(cdEntry.fileName);
      if (safeName !== cdEntry.fileName) {
        cdEntry.fileName = safeName;
      }
    }

    const localHeader = await parseLocalHeader(source, cdEntry.localHeaderOffset + concat);
    const dataStart = localHeader.dataStart;
    const data = buffer.subarray(dataStart, dataStart + localHeader.compressedSize);

    // Security: check single entry size
    if (data.length > maxEntrySize) {
      throw new Error(
        `ZIP entry "${cdEntry.fileName}" exceeds maximum size: ${data.length} > ${maxEntrySize}`,
      );
    }

    totalUncompressedSize += localHeader.uncompressedSize;
    if (totalUncompressedSize > maxTotalSize) {
      throw new Error(
        `ZIP archive total size exceeds limit: ${totalUncompressedSize} > ${maxTotalSize}`,
      );
    }

    entries.push({
      name: cdEntry.fileName,
      data,
      compressedSize: localHeader.compressedSize,
      uncompressedSize: localHeader.uncompressedSize,
      crc32: localHeader.flags & 0x08 ? 0 : cdEntry.crc32,
      compressionMethod: localHeader.compressionMethod,
      localHeader,
      centralDirEntry: cdEntry,
    });
  }

  return {
    entries,
    centralDir: centralDirEntries,
    eocd,
    raw: buffer,
  };
}

/**
 * Sanitize a ZIP entry path to prevent path traversal attacks.
 */
function sanitizePath(name: string): string {
  if (!name || name.length === 0) {
    throw new Error('ZIP entry path is empty');
  }

  const normalized = name.replace(/\\/g, '/');

  // Reject absolute paths
  if (normalized.startsWith('/')) {
    throw new Error(`Path traversal blocked: absolute path in entry "${name}"`);
  }

  // Reject paths with '..' components
  const parts = normalized.split('/');
  for (const part of parts) {
    if (part === '..') {
      throw new Error(`Path traversal blocked: ".." component in entry "${name}"`);
    }
    if (part === '.' && parts.length === 1) {
      throw new Error(`Path traversal blocked: entry path is "."`);
    }
  }

  return normalized;
}

export async function parseLocalHeader(
  source: { read(offset: number, length: number): Promise<Uint8Array>; size(): Promise<number> },
  offset: number,
): Promise<ZipLocalHeader> {
  const buf = await source.read(offset, 30);
  const signature = readU32LE(buf, 0);
  if (signature !== ZIP_LOCAL_FILE_HEADER_SIG) {
    throw new Error(`Invalid ZIP local file header at offset ${offset}`);
  }

  const versionNeeded = readU16LE(buf, 4);
  const flags = readU16LE(buf, 6);
  const compressionMethod = readU16LE(buf, 8);
  const lastModFileTime = readU16LE(buf, 10);
  const lastModFileDate = readU16LE(buf, 12);
  const crc32 = readU32LE(buf, 14);
  const compressedSize = readU32LE(buf, 18);
  const uncompressedSize = readU32LE(buf, 22);
  const fileNameLength = readU16LE(buf, 26);
  const extraFieldLength = readU16LE(buf, 28);

  const fileNameBuf = await source.read(offset + 30, fileNameLength);
  const extraFieldBuf = await source.read(offset + 30 + fileNameLength, extraFieldLength);

  const fileName = toString(fileNameBuf);
  const dataStart = offset + 30 + fileNameLength + extraFieldLength;

  return {
    signature,
    versionNeeded,
    flags,
    compressionMethod,
    lastModFileTime,
    lastModFileDate,
    crc32,
    compressedSize,
    uncompressedSize,
    fileNameLength,
    extraFieldLength,
    fileName,
    extraField: extraFieldBuf,
    dataOffset: offset,
    dataStart,
  };
}

export function parseCentralDirEntry(buffer: Uint8Array, offset: number): ZipCentralDirEntry {
  const signature = readU32LE(buffer, offset);
  if (signature !== ZIP_CENTRAL_DIR_SIG) {
    throw new Error(`Invalid ZIP central directory entry at offset ${offset}`);
  }

  const versionMadeBy = readU16LE(buffer, offset + 4);
  const versionNeeded = readU16LE(buffer, offset + 6);
  const flags = readU16LE(buffer, offset + 8);
  const compressionMethod = readU16LE(buffer, offset + 10);
  const lastModFileTime = readU16LE(buffer, offset + 12);
  const lastModFileDate = readU16LE(buffer, offset + 14);
  const crc32 = readU32LE(buffer, offset + 16);
  const compressedSize = readU32LE(buffer, offset + 20);
  const uncompressedSize = readU32LE(buffer, offset + 24);
  const fileNameLength = readU16LE(buffer, offset + 28);
  const extraFieldLength = readU16LE(buffer, offset + 30);
  const commentLength = readU16LE(buffer, offset + 32);
  const _diskNumberStart = readU16LE(buffer, offset + 34);
  void _diskNumberStart;
  const _internalAttributes = readU16LE(buffer, offset + 36);
  void _internalAttributes;
  const externalAttributes = readU32LE(buffer, offset + 38);
  const localHeaderOffset = readU32LE(buffer, offset + 42);

  const fileNameBuf = buffer.subarray(offset + 46, offset + 46 + fileNameLength);
  const extraField = buffer.subarray(offset + 46 + fileNameLength, offset + 46 + fileNameLength + extraFieldLength);
  const commentBuf = buffer.subarray(
    offset + 46 + fileNameLength + extraFieldLength,
    offset + 46 + fileNameLength + extraFieldLength + commentLength,
  );

  return {
    signature,
    versionMadeBy,
    versionNeeded,
    flags,
    compressionMethod,
    lastModFileTime,
    lastModFileDate,
    crc32,
    compressedSize,
    uncompressedSize,
    fileNameLength,
    extraFieldLength,
    commentLength,
    localHeaderOffset,
    fileName: toString(fileNameBuf),
    extraField,
    comment: toString(commentBuf),
    externalAttributes,
  };
}

export function parseEocd(buffer: Uint8Array, offset: number): ZipEndOfCentralDir {
  const signature = readU32LE(buffer, offset);
  if (signature !== ZIP_EOCD_SIG) {
    throw new Error(`Invalid ZIP EOCD signature at offset ${offset}`);
  }

  const diskNumber = readU16LE(buffer, offset + 4);
  const diskWithCentralDir = readU16LE(buffer, offset + 6);
  const centralDirEntriesOnDisk = readU16LE(buffer, offset + 8);
  const centralDirEntriesTotal = readU16LE(buffer, offset + 10);
  const centralDirSize = readU32LE(buffer, offset + 12);
  const centralDirOffset = readU32LE(buffer, offset + 16);
  const commentLength = readU16LE(buffer, offset + 20);
  const commentBuf = buffer.subarray(offset + 22, offset + 22 + commentLength);

  return {
    signature,
    diskNumber,
    diskWithCentralDir,
    centralDirEntriesOnDisk,
    centralDirEntriesTotal,
    centralDirSize,
    centralDirOffset,
    commentLength,
    comment: toString(commentBuf),
  };
}

export function findEocd(buffer: Uint8Array): number {
  // Search backwards for EOCD signature
  // EOCD is at least 22 bytes, search from end
  const minLen = 22;
  if (buffer.length < minLen) return -1;

  for (let i = buffer.length - minLen; i >= 0; i--) {
    if (readU32LE(buffer, i) === ZIP_EOCD_SIG) {
      // Verify it's a real EOCD (comment length should make sense)
      const commentLength = readU16LE(buffer, i + 20);
      if (i + 22 + commentLength === buffer.length) {
        return i;
      }
    }
  }
  return -1;
}

/**
 * Given a buffer that may contain a polyglot file (image prefix + ZIP),
 * compute the byte length of the prefix by examining the EOCD structure.
 *
 * The EOCD stores `centralDirOffset` (absolute within the buffer) and
 * `centralDirSize`.  For a standalone ZIP the prefix is zero; for a
 * polyglot file it equals the image length.
 */
export function computeConcatOffset(buffer: Uint8Array, eocdOffset: number): number {
  const centralDirSize = readU32LE(buffer, eocdOffset + 12);
  const centralDirOffset = readU32LE(buffer, eocdOffset + 16);
  return eocdOffset - centralDirSize - centralDirOffset;
}
