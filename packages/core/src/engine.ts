import { PathSource, type BinarySource } from '@polyglot/binary';
import { FormatRegistry } from './registry.js';
import { Detector } from './detector.js';
import {
  UnsupportedFormatError,
  IncompatibleFormatError,
  InvalidFrontError,
  InvalidArchiveError,
  RelocationError,
} from './errors.js';
import type {
  CreateOptions,
  PolyglotFile,
  PolyglotInfo,
  DetectionResult,
  OpenFrontResult,
  OpenBackResult,
} from './types.js';

class DefaultPolyglotFile implements PolyglotFile {
  constructor(
    private readonly buffer: Uint8Array,
    private readonly info: PolyglotInfo,
  ) {}

  async write(path: string): Promise<void> {
    const fs = await import('fs/promises');
    const fileHandle = await fs.open(path, 'w');
    try {
      // Node's fd.write accepts Uint8Array natively (same as Buffer)
      await fileHandle.write(this.buffer as unknown as Buffer, 0, this.buffer.length, 0);
    } finally {
      await fileHandle.close();
    }
  }

  getBuffer(): Uint8Array {
    return this.buffer;
  }

  getInfo(): Promise<PolyglotInfo> {
    return Promise.resolve(this.info);
  }
}

function toBinarySource(data: string | Uint8Array | BinarySource): BinarySource {
  if (typeof data === 'string') {
    return new PathSource(data);
  }
  // Buffer is a Uint8Array subclass — accept both transparently.
  if (data instanceof Uint8Array) {
    return {
      size: () => Promise.resolve(data.length),
      read: (offset: number, length: number) => Promise.resolve(data.subarray(offset, offset + length)),
    };
  }
  return data;
}

export class PolyglotEngine {
  readonly registry: FormatRegistry;
  readonly detector: Detector;

  constructor() {
    this.registry = new FormatRegistry();
    this.detector = new Detector(this.registry);
  }

  registerFront(adapter: import('@polyglot/binary').FrontAdapter & { id: string }): void {
    this.registry.registerFront(adapter);
  }

  registerBack(adapter: import('@polyglot/binary').BackAdapter & { id: string }): void {
    this.registry.registerBack(adapter);
  }

  registerCompatibility(front: string, back: string, supported: boolean, mode: 'native' | 'relocated' | 'experimental' | 'unsupported' = 'unsupported'): void {
    this.registry.registerCompatibility({ front, back, supported, mode });
  }

  async create(options: CreateOptions): Promise<PolyglotFile> {
    const frontSource = toBinarySource(options.front);

    const frontAdapter = await this.findFrontAdapter(frontSource);
    if (!frontAdapter) {
      throw new UnsupportedFormatError('Unsupported front format');
    }

    const backAdapter = this.registry.getBack(options.back.format);
    if (!backAdapter) {
      throw new UnsupportedFormatError(`Unsupported back format: ${options.back.format}`);
    }

    const rule = this.registry.getCompatibility(frontAdapter.id, options.back.format);
    if (!rule?.supported && rule?.mode !== 'experimental') {
      throw new IncompatibleFormatError(
        `Format combination ${frontAdapter.id} + ${options.back.format} is not supported`,
      );
    }

    // Validate front
    const frontValidation = await frontAdapter.validate(frontSource);
    if (!frontValidation.valid) {
      throw new InvalidFrontError(`Invalid front file: ${frontValidation.error}`, frontAdapter.id);
    }

    // Get front size
    const frontSize = await frontSource.size();

    // Create back archive
    const backBuffer = await backAdapter.create(options.back.entries);

    // Relocate back offsets
    const relocatedBack = backAdapter.relocate(backBuffer, frontSize);

    // Verify relocated back is valid
    try {
      await backAdapter.parse(backAdapter.toSource(relocatedBack));
    } catch (err) {
      throw new RelocationError(
        `Failed to relocate back archive: ${err instanceof Error ? err.message : 'unknown error'}`,
        options.back.format,
        frontSize,
      );
    }

    // Build polyglot file — concat works on any Uint8Array
    const polyglotBuffer = new Uint8Array(frontSize + relocatedBack.length);
    const frontBytes = await frontSource.read(0, frontSize);
    polyglotBuffer.set(frontBytes, 0);
    polyglotBuffer.set(relocatedBack, frontSize);

    const info: PolyglotInfo = {
      polyglot: true,
      front: {
        format: frontAdapter.id,
        size: frontSize,
        info: null,
      },
      back: {
        format: options.back.format,
        size: relocatedBack.length,
        entries: options.back.entries.length,
      },
    };

    return new DefaultPolyglotFile(polyglotBuffer, info);
  }

  async inspect(source: string | Uint8Array): Promise<PolyglotInfo> {
    return this.detector.inspect(toBinarySource(source));
  }

  async detect(source: string | Uint8Array): Promise<DetectionResult> {
    return this.detector.detect(toBinarySource(source));
  }

  async openFront(source: string | Uint8Array): Promise<OpenFrontResult> {
    const src = toBinarySource(source);

    const info = await this.detector.inspect(src);
    if (!info.polyglot || !info.front) {
      throw new InvalidFrontError('Not a polyglot file or front format not detected', 'unknown');
    }

    const adapter = this.registry.getFront(info.front.format);
    if (!adapter) {
      throw new UnsupportedFormatError(`Unknown front format: ${info.front.format}`);
    }

    const frontInfo = await adapter.inspect(src);
    const frontSize = (frontInfo as { size: number }).size;
    const frontBuffer = await src.read(0, frontSize);

    return {
      format: info.front.format,
      size: frontSize,
      async *stream() {
        yield frontBuffer;
      },
    };
  }

  async openBack(source: string | Uint8Array): Promise<OpenBackResult> {
    const src = toBinarySource(source);

    const info = await this.detector.inspect(src);
    if (!info.polyglot || !info.back) {
      throw new InvalidArchiveError('Not a polyglot file or back format not detected', 'unknown');
    }

    const adapter = this.registry.getBack(info.back.format);
    if (!adapter) {
      throw new UnsupportedFormatError(`Unknown back format: ${info.back.format}`);
    }

    // For polyglot files, create a source that skips the front prefix
    let backSource = src;
    if (info.front) {
      const frontSize = info.front.size;
      const totalSize = await src.size();
      const zipSize = totalSize - frontSize;
      backSource = {
        size: () => Promise.resolve(zipSize),
        read: async (offset: number, length: number) => {
          return src.read(frontSize + offset, length);
        },
      };
    }

    const archive = await adapter.parse(backSource);
    const entries = (archive as { entries: { name: string; data: Uint8Array }[] }).entries;

    return {
      format: info.back.format,
      async list() {
        return entries.map((e) => e.name);
      },
      async read(name: string) {
        const entry = entries.find((e) => e.name === name);
        if (!entry) {
          throw new Error(`Entry "${name}" not found`);
        }
        return entry.data;
      },
    };
  }

  private async findFrontAdapter(source: BinarySource): Promise<import('@polyglot/binary').FrontAdapter | null> {
    for (const adapter of this.registry.getAllFronts()) {
      if (await adapter.detect(source)) {
        return adapter;
      }
    }
    return null;
  }
}
