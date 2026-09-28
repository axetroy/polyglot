import {
  PolyglotEngine,
  type PolyglotFile,
  type PolyglotInfo,
  type DetectionResult,
  type OpenFrontResult,
  type OpenBackResult,
} from "@polyglot-img/core";
import { pngAdapter } from "@polyglot-img/formats-png";
import { jpegAdapter } from "@polyglot-img/formats-jpeg";
import { zipAdapter } from "@polyglot-img/formats-zip";

const engine = new PolyglotEngine();

// Register adapters
engine.registerFront(pngAdapter);
engine.registerFront(jpegAdapter);
engine.registerBack(zipAdapter);

// Register compatibility rules
engine.registerCompatibility("png", "zip", true, "relocated");
engine.registerCompatibility("jpeg", "zip", true, "relocated");

export const polyglot = engine;

export type { PolyglotFile, PolyglotInfo, DetectionResult, OpenFrontResult, OpenBackResult };
