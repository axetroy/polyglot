import { crc32 } from './crc32.js';
import { concatBytes, readU16LE, readU32LE, toAscii, writeU16LE, writeU32LE } from './bytes.js';

export const ZIP_LOCAL_FILE_HEADER_SIG = 0x04034b50;
export const ZIP_CENTRAL_DIR_SIG = 0x02014b50;
export const ZIP_EOCD_SIG = 0x06054b50;

const METHOD_STORED = 0;
const METHOD_DEFLATE = 8;
const DEFAULT_VERSION_NEEDED = 20;
/** General purpose bit 11: filename/comment are UTF-8 encoded. */
const FLAG_UTF8 = 0x0800;

export interface ZipEntryInput {
  name: string;
  data: Uint8Array;
}

export interface ZipEntryMeta {
  name: string;
  compressedSize: number;
  uncompressedSize: number;
  crc32: number;
  compressionMethod: number;
  localHeaderOffset: number;
}

export interface BuildZipOptions {
  /** Pre-shift every stored offset — used when the archive is written behind a prefix. */
  offsetAdjustment?: number;
}

function encodeName(name: string): { bytes: Uint8Array; utf8: boolean } {
  const bytes = new TextEncoder().encode(name);
  let ascii = true;
  for (const byte of bytes) {
    if (byte > 0x7f) {
      ascii = false;
      break;
    }
  }
  return { bytes, utf8: !ascii };
}

/**
 * Serialise entries into a ZIP archive using STORED (uncompressed) entries.
 *
 * Layout: [local header + name + data]… [central directory]… [EOCD]
 */
export function buildZip(entries: ZipEntryInput[], options: BuildZipOptions = {}): Uint8Array {
  const { offsetAdjustment = 0 } = options;

  // Phase 1 — size up the local section so offsets are known up front.
  interface EntryInfo {
    name: Uint8Array;
    data: Uint8Array;
    localHeaderOffset: number;
    size: number;
    crc: number;
    utf8: boolean;
  }

  const infos: EntryInfo[] = [];
  let cursor = 0;
  for (const entry of entries) {
    const { bytes: name, utf8 } = encodeName(entry.name);
    infos.push({
      name,
      data: entry.data,
      localHeaderOffset: cursor,
      size: entry.data.length,
      crc: crc32(entry.data),
      utf8,
    });
    cursor += 30 + name.length + entry.data.length;
  }
  const localSectionEnd = cursor;

  // Phase 2 — central directory.
  const cdParts: Uint8Array[] = [];
  for (const info of infos) {
    const cd = new Uint8Array(46);
    writeU32LE(cd, 0, ZIP_CENTRAL_DIR_SIG);
    writeU16LE(cd, 4, 3000); // version made by (Unix, 3.0)
    writeU16LE(cd, 6, DEFAULT_VERSION_NEEDED);
    writeU16LE(cd, 8, info.utf8 ? FLAG_UTF8 : 0);
    writeU16LE(cd, 10, METHOD_STORED);
    writeU16LE(cd, 12, 0); // mod time
    writeU16LE(cd, 14, 0); // mod date
    writeU32LE(cd, 16, info.crc);
    writeU32LE(cd, 20, info.size); // compressed size
    writeU32LE(cd, 24, info.size); // uncompressed size
    writeU16LE(cd, 28, info.name.length);
    writeU16LE(cd, 30, 0); // extra field length
    writeU16LE(cd, 32, 0); // comment length
    writeU16LE(cd, 34, 0); // disk number start
    writeU16LE(cd, 36, 0); // internal attributes
    writeU32LE(cd, 38, 0o100644 << 16); // external attributes (rw-r--r--)
    writeU32LE(cd, 42, info.localHeaderOffset + offsetAdjustment);
    cdParts.push(cd, info.name);
  }
  const centralDir = concatBytes(...cdParts);

  // Phase 3 — end of central directory.
  const eocd = new Uint8Array(22);
  writeU32LE(eocd, 0, ZIP_EOCD_SIG);
  writeU16LE(eocd, 4, 0); // this disk
  writeU16LE(eocd, 6, 0); // disk with central directory
  writeU16LE(eocd, 8, infos.length);
  writeU16LE(eocd, 10, infos.length);
  writeU32LE(eocd, 12, centralDir.length);
  writeU32LE(eocd, 16, localSectionEnd + offsetAdjustment);
  writeU16LE(eocd, 20, 0); // comment length

  // Phase 4 — local headers, emitted after the offsets were computed.
  const localParts: Uint8Array[] = [];
  for (const info of infos) {
    const header = new Uint8Array(30);
    writeU32LE(header, 0, ZIP_LOCAL_FILE_HEADER_SIG);
    writeU16LE(header, 4, DEFAULT_VERSION_NEEDED);
    writeU16LE(header, 6, info.utf8 ? FLAG_UTF8 : 0);
    writeU16LE(header, 8, METHOD_STORED);
    writeU16LE(header, 10, 0); // mod time
    writeU16LE(header, 12, 0); // mod date
    writeU32LE(header, 14, info.crc);
    writeU32LE(header, 18, info.size);
    writeU32LE(header, 22, info.size);
    writeU16LE(header, 26, info.name.length);
    writeU16LE(header, 28, 0); // extra field length
    localParts.push(header, info.name, info.data);
  }

  return concatBytes(...localParts, centralDir, eocd);
}

/** Locate the End Of Central Directory record, scanning backwards for its signature. */
export function findEocd(buffer: Uint8Array): number {
  const minOffset = Math.max(0, buffer.length - 22 - 0xffff);
  for (let i = buffer.length - 22; i >= minOffset; i--) {
    if (readU32LE(buffer, i) !== ZIP_EOCD_SIG) continue;
    const commentLength = readU16LE(buffer, i + 20);
    if (i + 22 + commentLength === buffer.length) return i;
  }
  return -1;
}

/**
 * Shift every absolute offset in a ZIP archive forward by `adjustment`.
 *
 * Only the EOCD central-directory pointer and each central-directory entry's
 * local-header pointer are absolute; everything else is relative, so those are
 * the only two fields that need rewriting.
 */
export function relocateZipOffsets(buffer: Uint8Array, adjustment: number): Uint8Array {
  if (adjustment <= 0) return buffer;

  const eocdOffset = findEocd(buffer);
  if (eocdOffset === -1) throw new Error('Invalid ZIP: End of Central Directory not found');

  const centralDirOffset = readU32LE(buffer, eocdOffset + 16);
  const centralDirSize = readU32LE(buffer, eocdOffset + 12);

  // Rewrite the pointers in a same-length copy: the archive keeps its own bytes
  // and position, only the absolute offsets grow by the prefix length.  Padding
  // the archive to make the offsets "physically" correct would work too, but it
  // doubles the file size and defeats offset-compensating readers (unzip).
  const relocated = new Uint8Array(buffer.length);
  relocated.set(buffer);

  writeU32LE(relocated, eocdOffset + 16, centralDirOffset + adjustment);

  let cursor = centralDirOffset;
  const cdEnd = centralDirOffset + centralDirSize;

  while (cursor + 46 <= cdEnd) {
    if (readU32LE(relocated, cursor) !== ZIP_CENTRAL_DIR_SIG) break;
    const localOffset = readU32LE(relocated, cursor + 42);
    writeU32LE(relocated, cursor + 42, localOffset + adjustment);

    const nameLength = readU16LE(relocated, cursor + 28);
    const extraLength = readU16LE(relocated, cursor + 30);
    const commentLength = readU16LE(relocated, cursor + 32);

    cursor += 46 + nameLength + extraLength + commentLength;
  }

  return relocated;
}

/**
 * Recover the number of bytes prepended to an archive.
 *
 * ZIP stores offsets relative to the archive's own origin, but the EOCD records
 * its own absolute position. When a polyglot image is prepended, that position
 * reveals the prefix length — the same correction `unzip` and Python's
 * `zipfile` derive ("N extra bytes at beginning or within zipfile"). Adding it
 * back to every stored offset yields true absolute positions, so the archive
 * stays readable whether it is parsed on its own or inside the polyglot file.
 */
export function computeConcatOffset(buffer: Uint8Array, eocdOffset: number): number {
  const centralDirSize = readU32LE(buffer, eocdOffset + 12);
  const centralDirOffset = readU32LE(buffer, eocdOffset + 16);
  return eocdOffset - centralDirSize - centralDirOffset;
}

/** Read the central directory and return entry metadata in archive order. */
export function listZipEntries(buffer: Uint8Array): ZipEntryMeta[] {
  const eocdOffset = findEocd(buffer);
  if (eocdOffset === -1) throw new Error('Invalid ZIP: End of Central Directory not found');

  const concat = computeConcatOffset(buffer, eocdOffset);
  const entryCount = readU16LE(buffer, eocdOffset + 10);
  const centralDirOffset = readU32LE(buffer, eocdOffset + 16) + concat;
  const centralDirSize = readU32LE(buffer, eocdOffset + 12);

  const entries: ZipEntryMeta[] = [];
  let cursor = centralDirOffset;
  const cdEnd = centralDirOffset + centralDirSize;

  while (cursor + 46 <= cdEnd && entries.length < entryCount) {
    if (readU32LE(buffer, cursor) !== ZIP_CENTRAL_DIR_SIG) break;

    const flags = readU16LE(buffer, cursor + 8);
    const nameLength = readU16LE(buffer, cursor + 28);
    const extraLength = readU16LE(buffer, cursor + 30);
    const commentLength = readU16LE(buffer, cursor + 32);
    const nameStart = cursor + 46;
    const raw = buffer.subarray(nameStart, nameStart + nameLength);
    const name = flags & FLAG_UTF8 ? new TextDecoder().decode(raw) : toAscii(raw, 0, raw.length);

    entries.push({
      name,
      compressedSize: readU32LE(buffer, cursor + 20),
      uncompressedSize: readU32LE(buffer, cursor + 24),
      crc32: readU32LE(buffer, cursor + 16),
      compressionMethod: readU16LE(buffer, cursor + 10),
      localHeaderOffset: readU32LE(buffer, cursor + 42) + concat,
    });

    cursor += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

/** Decompress a raw DEFLATE stream using the platform `DecompressionStream`. */
async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('DEFLATE entries require DecompressionStream, which this browser does not provide');
  }
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Extract every entry. STORED entries are read directly; DEFLATE entries go
 * through the platform `DecompressionStream`.
 */
export async function extractZipEntries(buffer: Uint8Array): Promise<ZipEntryInput[]> {
  // localHeaderOffset already carries the concat correction from listZipEntries.
  const metas = listZipEntries(buffer);
  const out: ZipEntryInput[] = [];

  for (const meta of metas) {
    const local = meta.localHeaderOffset;
    if (readU32LE(buffer, local) !== ZIP_LOCAL_FILE_HEADER_SIG) {
      throw new Error(`Corrupt ZIP: bad local file header for "${meta.name}"`);
    }
    const nameLength = readU16LE(buffer, local + 26);
    const extraLength = readU16LE(buffer, local + 28);
    const dataStart = local + 30 + nameLength + extraLength;
    const raw = buffer.subarray(dataStart, dataStart + meta.compressedSize);

    let data: Uint8Array;
    if (meta.compressionMethod === METHOD_STORED) {
      data = raw.slice();
    } else if (meta.compressionMethod === METHOD_DEFLATE) {
      data = await inflateRaw(raw);
    } else {
      throw new Error(`Unsupported compression method ${meta.compressionMethod} for "${meta.name}"`);
    }

    out.push({ name: meta.name, data });
  }

  return out;
}
