import {
  readU16LE, readU32LE,
  writeU16LE, writeU32LE,
  alloc, allocFill, concat, fromString,
} from '@polyglot/binary';
import {
  ZIP_CENTRAL_DIR_SIG,
  ZIP_EOCD_SIG,
  ZIP_LOCAL_FILE_HEADER_SIG,
} from './constants.js';

export interface ZipEntryData {
  name: string;
  data: Uint8Array;
  compressionMethod?: number;
}

export interface ZipBuildOptions {
  offsetAdjustment?: number;
  versionNeeded?: number;
}

const DEFAULT_COMPRESSION_METHOD = 0; // STORED
const DEFAULT_VERSION_NEEDED = 20; // 2.0

export function buildZip(entries: ZipEntryData[], options: ZipBuildOptions = {}): Uint8Array {
  const { offsetAdjustment = 0, versionNeeded = DEFAULT_VERSION_NEEDED } = options;

  // Phase 1: compute layout
  interface EntryInfo {
    entry: ZipEntryData;
    localHeaderOffset: number;
    compressedSize: number;
    uncompressedSize: number;
    crc32: number;
  }

  const infos: EntryInfo[] = [];
  let currentOffset = 0;

  for (const entry of entries) {
    const nameBuf = fromString(entry.name);
    const localHeaderSize = 30 + nameBuf.length;
    const data = entry.data;

    infos.push({
      entry,
      localHeaderOffset: currentOffset,
      compressedSize: data.length,
      uncompressedSize: data.length,
      crc32: computeCrc32(data),
    });

    currentOffset += localHeaderSize + data.length;
  }

  const localHeadersEnd = currentOffset;

  // Phase 2: build central directory
  const cdChunks: Uint8Array[] = [];
  for (const info of infos) {
    const { entry, localHeaderOffset, compressedSize, uncompressedSize, crc32 } = info;
    const nameBuf = fromString(entry.name);
    const method = entry.compressionMethod ?? DEFAULT_COMPRESSION_METHOD;

    const cdEntry = alloc(46);
    writeU32LE(cdEntry, 0, ZIP_CENTRAL_DIR_SIG);
    writeU16LE(cdEntry, 4, 3000); // version made by (Unix)
    writeU16LE(cdEntry, 6, versionNeeded);
    writeU16LE(cdEntry, 8, 0); // flags
    writeU16LE(cdEntry, 10, method);
    writeU16LE(cdEntry, 12, 0); // mod time
    writeU16LE(cdEntry, 14, 0); // mod date
    writeU32LE(cdEntry, 16, crc32);
    writeU32LE(cdEntry, 20, compressedSize);
    writeU32LE(cdEntry, 24, uncompressedSize);
    writeU16LE(cdEntry, 28, nameBuf.length);
    writeU16LE(cdEntry, 30, 0); // extra field length
    writeU16LE(cdEntry, 32, 0); // comment length
    writeU16LE(cdEntry, 34, 0); // disk number start
    writeU16LE(cdEntry, 36, 0); // internal attributes
    writeU32LE(cdEntry, 38, ((0o100644 >>> 0) << 16) >>> 0); // external attributes (unix file mode)
    writeU32LE(cdEntry, 42, localHeaderOffset + offsetAdjustment);
    cdChunks.push(cdEntry, nameBuf);
  }

  const centralDirBytes = concat(...cdChunks);
  const centralDirOffset = localHeadersEnd + offsetAdjustment;

  // Phase 3: build EOCD
  const eocd = alloc(22);
  writeU32LE(eocd, 0, ZIP_EOCD_SIG);
  writeU16LE(eocd, 4, 0); // disk number
  writeU16LE(eocd, 6, 0); // disk with central dir
  writeU16LE(eocd, 8, entries.length);
  writeU16LE(eocd, 10, entries.length);
  writeU32LE(eocd, 12, centralDirBytes.length);
  writeU32LE(eocd, 16, centralDirOffset);
  writeU16LE(eocd, 20, 0); // comment length

  // Phase 4: assemble final buffer
  const parts: Uint8Array[] = [];

  // Local file headers + data
  for (const info of infos) {
    const { entry, compressedSize, uncompressedSize, crc32 } = info;
    const nameBuf = fromString(entry.name);
    const method = entry.compressionMethod ?? DEFAULT_COMPRESSION_METHOD;
    const data = entry.data;

    const header = alloc(30);
    writeU32LE(header, 0, ZIP_LOCAL_FILE_HEADER_SIG);
    writeU16LE(header, 4, versionNeeded);
    writeU16LE(header, 6, 0); // flags
    writeU16LE(header, 8, method);
    writeU16LE(header, 10, 0); // mod time
    writeU16LE(header, 12, 0); // mod date
    writeU32LE(header, 14, crc32);
    writeU32LE(header, 18, compressedSize);
    writeU32LE(header, 22, uncompressedSize);
    writeU16LE(header, 26, nameBuf.length);
    writeU16LE(header, 28, 0); // extra field length

    parts.push(header, nameBuf, data);
  }

  parts.push(centralDirBytes, eocd);
  return concat(...parts);
}

function computeCrc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  const table = computeCrc32Table();
  for (let i = 0; i < data.length; i++) {
    crc = table[(crc ^ data[i]) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function computeCrc32Table(): Uint32Array {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c;
  }
  return table;
}

/**
 * Relocate ZIP offsets by adding an offset adjustment.
 */
export function relocateZipOffsets(buffer: Uint8Array, adjustment: number): Uint8Array {
  if (adjustment <= 0) return buffer;

  // Find EOCD in original buffer
  let eocdOffset = -1;
  for (let i = buffer.length - 22; i >= 0; i--) {
    if (readU32LE(buffer, i) === ZIP_EOCD_SIG) {
      const commentLength = readU16LE(buffer, i + 20);
      if (i + 22 + commentLength === buffer.length) {
        eocdOffset = i;
        break;
      }
    }
  }

  if (eocdOffset === -1) {
    throw new Error('Invalid ZIP: End of Central Directory not found');
  }

  const centralDirOffset = readU32LE(buffer, eocdOffset + 16);
  const centralDirSize = readU32LE(buffer, eocdOffset + 12);

  // Create new buffer with extra space for the front prefix
  const newBufferSize = buffer.length + adjustment;
  const newBuffer = allocFill(newBufferSize);

  // Copy original data, shifted by adjustment
  newBuffer.set(buffer, adjustment);

  // Update EOCD central directory offset
  const newEocdOffset = eocdOffset + adjustment;
  writeU32LE(newBuffer, newEocdOffset + 16, centralDirOffset + adjustment);

  // Update central directory entries' local header offsets
  // Read from ORIGINAL buffer to get pre-relocation offsets, then write adjusted values
  let origCdOffset = centralDirOffset;
  let newCdOffset = centralDirOffset + adjustment;
  const cdEnd = centralDirOffset + centralDirSize;
  while (origCdOffset < cdEnd) {
    if (readU32LE(buffer, origCdOffset) !== ZIP_CENTRAL_DIR_SIG) {
      break;
    }
    // Read local header offset from ORIGINAL buffer (pre-relocation)
    const origLocalOffset = readU32LE(buffer, origCdOffset + 42);
    // Write adjusted offset to NEW buffer
    writeU32LE(newBuffer, newCdOffset + 42, origLocalOffset + adjustment);
    const fileNameLength = readU16LE(buffer, origCdOffset + 28);
    const extraFieldLength = readU16LE(buffer, origCdOffset + 30);
    const commentLength = readU16LE(buffer, origCdOffset + 32);
    origCdOffset += 46 + fileNameLength + extraFieldLength + commentLength;
    newCdOffset += 46 + fileNameLength + extraFieldLength + commentLength;
  }

  return newBuffer;
}
