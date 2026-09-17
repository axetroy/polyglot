import type { BinarySource } from "@polyglot/binary";
import { FormatRegistry } from "./registry.js";

import type { DetectionResult, PolyglotInfo } from "./types.js";

/**
 * Creates a BinarySource that reads from `source` starting at `offset`.
 */
function createBackSource(source: BinarySource, offset: number): BinarySource {
  return {
    size: async () => {
      const total = await source.size();
      return Math.max(0, total - offset);
    },
    read: async (pos: number, length: number) => {
      return source.read(offset + pos, length);
    },
  };
}

export class Detector {
  constructor(private readonly registry: FormatRegistry) {}

  async detect(source: BinarySource): Promise<DetectionResult> {
    let frontFormat: string | undefined;
    let backFormat: string | undefined;

    // Detect front format
    for (const adapter of this.registry.getAllFronts()) {
      if (await adapter.detect(source)) {
        frontFormat = adapter.id;
        break;
      }
    }

    if (!frontFormat) {
      return { isPolyglot: false };
    }

    // Detect back format by parsing as archive, starting after the front
    const frontSize = await this.getFrontSize(source, frontFormat);
    try {
      for (const adapter of this.registry.getAllBacks()) {
        // Create a source that skips the front prefix
        const backSource = createBackSource(source, frontSize);
        const info = await adapter.inspect(backSource);
        if (info && typeof info === "object" && "format" in info) {
          backFormat = (info as { format: string }).format;
          break;
        }
      }
    } catch {
      // Not a valid archive
    }

    if (!backFormat) {
      return { isPolyglot: false, front: { format: frontFormat } };
    }

    // Check compatibility
    const rule = this.registry.getCompatibility(frontFormat, backFormat);
    if (!rule?.supported && rule?.mode !== "experimental") {
      return { isPolyglot: false, front: { format: frontFormat } };
    }

    return {
      isPolyglot: true,
      front: { format: frontFormat },
      back: { format: backFormat },
    };
  }

  private async getFrontSize(source: BinarySource, frontFormat: string): Promise<number> {
    const adapter = this.registry.getFront(frontFormat);
    if (!adapter) return 0;
    try {
      const info = await adapter.inspect(source);
      return (info as { size: number }).size ?? 0;
    } catch {
      return 0;
    }
  }

  async inspect(source: BinarySource): Promise<PolyglotInfo> {
    const detection = await this.detect(source);

    if (!detection.isPolyglot) {
      return { polyglot: false };
    }

    if (!detection.front || !detection.back) {
      return { polyglot: false };
    }

    const frontAdapter = this.registry.getFront(detection.front.format);
    const backAdapter = this.registry.getBack(detection.back.format);

    if (!frontAdapter || !backAdapter) {
      return { polyglot: false };
    }

    const frontSize = await this.getFrontSize(source, detection.front.format);
    const backSource = createBackSource(source, frontSize);

    const frontInfo = await frontAdapter.inspect(source);
    const backInfo = await backAdapter.inspect(backSource);

    return {
      polyglot: true,
      front: {
        format: detection.front.format,
        size: (frontInfo as { size: number }).size,
        info: frontInfo,
      },
      back: {
        format: detection.back.format,
        size: (backInfo as { size: number }).size,
        entries: (backInfo as { entries: number }).entries,
      },
    };
  }
}
