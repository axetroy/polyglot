import { alloc, allocFill, concat, copy } from "./bytes.js";

export interface BinarySource {
  size(): Promise<number>;
  read(offset: number, length: number): Promise<Uint8Array>;
  stream?(start?: number, end?: number): AsyncIterable<Uint8Array>;
}

export interface FrontAdapter {
  id: string;
  detect(source: BinarySource): Promise<boolean>;
  inspect(source: BinarySource): Promise<unknown>;
  validate(source: BinarySource): Promise<{ valid: boolean; error?: string }>;
  getLayout(info: unknown): Promise<unknown>;
  toSource(buffer: Uint8Array): BinarySource;
  toPathSource(path: string): BinarySource;
}

export interface BackAdapter {
  id: string;
  create(entries: ArchiveEntry[]): Promise<Uint8Array>;
  inspect(source: BinarySource): Promise<unknown>;
  parse(source: BinarySource): Promise<unknown>;
  getLayout(buffer: Uint8Array): Promise<unknown>;
  relocate(buffer: Uint8Array, prefixSize: number): Uint8Array;
  toSource(buffer: Uint8Array): BinarySource;
  toPathSource(path: string): BinarySource;
}

export interface ArchiveEntry {
  name: string;
  data: Uint8Array;
  compressionMethod?: number;
}

/**
 * Reads a local file as a BinarySource. Uses Node's `fs/promises` because
 * file I/O is inherently a Node feature; the rest of the pipeline stays pure.
 */
export class PathSource implements BinarySource {
  constructor(private readonly path: string) {}

  async size(): Promise<number> {
    const fs = await import("fs/promises");
    const stat = await fs.stat(this.path);
    return stat.size;
  }

  async read(offset: number, length: number): Promise<Uint8Array> {
    const fs = await import("fs/promises");
    const fd = await fs.open(this.path, "r");
    try {
      const buffer = alloc(length);
      const { bytesRead } = await fd.read(buffer, 0, length, offset);
      return buffer.subarray(0, bytesRead);
    } finally {
      await fd.close();
    }
  }

  async *stream(start = 0, end?: number): AsyncIterable<Uint8Array> {
    const fs = await import("fs/promises");
    const size = await this.size();
    const sliceEnd = end ?? size;
    const fd = await fs.open(this.path, "r");
    try {
      const chunkSize = 64 * 1024;
      let pos = start;
      while (pos < sliceEnd) {
        const readLen = Math.min(chunkSize, sliceEnd - pos);
        const buffer = alloc(readLen);
        const { bytesRead } = await fd.read(buffer, 0, readLen, pos);
        if (bytesRead === 0) break;
        yield buffer.subarray(0, bytesRead);
        pos += bytesRead;
      }
    } finally {
      await fd.close();
    }
  }
}

/**
 * Wraps a plain Uint8Array (or a Node Buffer, which is a Uint8Array subclass)
 * as a BinarySource. Both are accepted for backward compatibility.
 */
export class BufferSource implements BinarySource {
  constructor(private readonly buffer: Uint8Array) {}

  async size(): Promise<number> {
    return this.buffer.length;
  }

  async read(offset: number, length: number): Promise<Uint8Array> {
    return this.buffer.subarray(offset, offset + length);
  }

  async *stream(start = 0, end?: number): AsyncIterable<Uint8Array> {
    const sliceEnd = end ?? this.buffer.length;
    const chunkSize = 64 * 1024;
    let pos = start;
    while (pos < sliceEnd) {
      const readLen = Math.min(chunkSize, sliceEnd - pos);
      yield this.buffer.subarray(pos, pos + readLen);
      pos += readLen;
    }
  }
}

/**
 * Buffers an async iterable of Uint8Array chunks in memory.
 */
export class StreamSource implements BinarySource {
  private _size?: number;
  private readonly chunks: Uint8Array[] = [];
  private readonly maxSize: number;

  constructor(
    private readonly readable: AsyncIterable<Uint8Array>,
    maxSize = 2 * 1024 * 1024 * 1024
  ) {
    this.maxSize = maxSize;
  }

  get sizeHint(): number | undefined {
    return this._size;
  }

  async size(): Promise<number> {
    if (this._size !== undefined) return this._size;
    let total = 0;
    for await (const chunk of this.readable) {
      total += chunk.length;
      if (total > this.maxSize) {
        throw new Error(`Stream exceeded max size limit of ${this.maxSize} bytes`);
      }
      this.chunks.push(chunk);
    }
    this._size = total;
    return total;
  }

  async read(offset: number, length: number): Promise<Uint8Array> {
    await this.size();
    const full = concat(...this.chunks);
    return full.subarray(offset, offset + length);
  }

  async *stream(start = 0, end?: number): AsyncIterable<Uint8Array> {
    await this.size();
    const full = concat(...this.chunks);
    const sliceEnd = end ?? full.length;
    const chunkSize = 64 * 1024;
    let pos = start;
    while (pos < sliceEnd) {
      const readLen = Math.min(chunkSize, sliceEnd - pos);
      yield full.subarray(pos, pos + readLen);
      pos += readLen;
    }
  }
}

/** Read every byte from a BinarySource into a single Uint8Array. */
export async function readAll(source: BinarySource): Promise<Uint8Array> {
  const size = await source.size();
  const buffer = allocFill(size);
  let offset = 0;
  if (source.stream) {
    for await (const chunk of source.stream()) {
      copy(chunk, buffer, offset);
      offset += chunk.length;
    }
  }
  return buffer;
}

/**
 * Accept a string path, a Uint8Array (or Node Buffer for backward compat),
 * or an existing BinarySource and return a BinarySource wrapper.
 */
export function toSource(data: string | Uint8Array | BinarySource): BinarySource {
  if (typeof data === "string") {
    return new PathSource(data);
  }
  // Buffer is a Uint8Array subclass — accept both transparently.
  if (data instanceof Uint8Array) {
    return new BufferSource(data);
  }
  return data;
}
