import type { BinarySource, FrontAdapter, BackAdapter, ArchiveEntry } from "@polyglot/binary";

export type FormatMode = "native" | "relocated" | "experimental" | "unsupported";

export interface CompatibilityRule {
  front: string;
  back: string;
  supported: boolean;
  mode: FormatMode;
}

export type { FrontAdapter, BackAdapter, ArchiveEntry, BinarySource };

export interface PolyglotInfo {
  polyglot: boolean;
  front?: {
    format: string;
    size: number;
    info: unknown;
  };
  back?: {
    format: string;
    size: number;
    entries: number;
  };
}

export interface DetectionResult {
  isPolyglot: boolean;
  front?: {
    format: string;
  };
  back?: {
    format: string;
  };
}

export interface CreateOptions {
  front: string | Uint8Array | BinarySource;
  back: {
    format: string;
    entries: ArchiveEntry[];
  };
}

export interface PolyglotFile {
  write(path: string): Promise<void>;
  getBuffer(): Uint8Array;
  getInfo(): Promise<PolyglotInfo>;
}

export interface OpenFrontResult {
  format: string;
  size: number;
  stream(): AsyncIterable<Uint8Array>;
}

export interface OpenBackResult {
  format: string;
  list(): Promise<string[]>;
  read(name: string): Promise<Uint8Array>;
}
