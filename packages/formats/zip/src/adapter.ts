import type { BackAdapter, BinarySource } from '@polyglot/binary';
import { BufferSource, PathSource } from '@polyglot/binary';
import { parseZip, type ZipArchive } from './parser.js';
import { buildZip, relocateZipOffsets, type ZipEntryData } from './writer.js';

export interface ZipLayout {
  format: 'zip';
  size: number;
  entries: number;
  centralDirOffset: number;
  centralDirSize: number;
}

export class ZipAdapter implements BackAdapter {
  readonly id = 'zip';

  async create(entries: ZipEntryData[]): Promise<Uint8Array> {
    return buildZip(entries);
  }

  async inspect(source: BinarySource): Promise<{ format: string; size: number; entries: number }> {
    const archive = await this.parse(source);
    return {
      format: 'zip',
      size: archive.raw.length,
      entries: archive.entries.length,
    };
  }

  async parse(source: BinarySource): Promise<ZipArchive> {
    return parseZip(source);
  }

  async getLayout(archive: Uint8Array): Promise<ZipLayout> {
    let eocdOffset = -1;
    for (let i = archive.length - 22; i >= 0; i--) {
      const sigBuf = archive.subarray(i, i + 4);
      const sig = (sigBuf[0]! | (sigBuf[1]! << 8) | (sigBuf[2]! << 16) | (sigBuf[3]! << 24)) >>> 0;
      if (sig === 0x06054b50) {
        const commentLength = sigBuf[20]! | (sigBuf[21]! << 8);
        if (i + 22 + commentLength === archive.length) {
          eocdOffset = i;
          break;
        }
      }
    }

    if (eocdOffset === -1) {
      throw new Error('Invalid ZIP: EOCD not found');
    }

    const cdSizeBuf = archive.subarray(eocdOffset + 12, eocdOffset + 16);
    const cdOffsetBuf = archive.subarray(eocdOffset + 16, eocdOffset + 20);
    const entriesBuf = archive.subarray(eocdOffset + 10, eocdOffset + 12);
    const centralDirSize = (cdSizeBuf[0]! | (cdSizeBuf[1]! << 8) | (cdSizeBuf[2]! << 16) | (cdSizeBuf[3]! << 24)) >>> 0;
    const centralDirOffset = (cdOffsetBuf[0]! | (cdOffsetBuf[1]! << 8) | (cdOffsetBuf[2]! << 16) | (cdOffsetBuf[3]! << 24)) >>> 0;
    const centralDirEntriesTotal = entriesBuf[0]! | (entriesBuf[1]! << 8);

    return {
      format: 'zip',
      size: archive.length,
      entries: centralDirEntriesTotal,
      centralDirOffset,
      centralDirSize,
    };
  }

  relocate(buffer: Uint8Array, prefixSize: number): Uint8Array {
    return relocateZipOffsets(buffer, prefixSize);
  }

  toSource(buffer: Uint8Array): BinarySource {
    return new BufferSource(buffer);
  }

  toPathSource(path: string): BinarySource {
    return new PathSource(path);
  }
}

export const zipAdapter = new ZipAdapter();
