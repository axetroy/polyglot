import { PolyglotEngine, type PolyglotFile, type PolyglotInfo, type DetectionResult, type OpenFrontResult, type OpenBackResult } from '@polyglot/core';
import { pngAdapter } from '@polyglot/formats-png';
import { jpegAdapter } from '@polyglot/formats-jpeg';
import { zipAdapter } from '@polyglot/formats-zip';

const engine = new PolyglotEngine();

// Register adapters
engine.registerFront(pngAdapter);
engine.registerFront(jpegAdapter);
engine.registerBack(zipAdapter);

// Register compatibility rules
engine.registerCompatibility('png', 'zip', true, 'relocated');
engine.registerCompatibility('jpeg', 'zip', true, 'relocated');

export const polyglot = engine;

export type { PolyglotFile, PolyglotInfo, DetectionResult, OpenFrontResult, OpenBackResult };
