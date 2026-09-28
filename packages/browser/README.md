# `@polyglot-img/browser`

Pure-browser polyglot implementation — zero Node `Buffer` dependency.

## Why a separate package?

The playground is a **Vue component inside a VitePress site** that must run entirely client-side. To keep it self-contained, `@polyglot-img/browser` ports the core polyglot algorithms from the Node packages into a single ESM bundle using only Web APIs (`Uint8Array`, `DataView`, `Blob`, `DecompressionStream`).

| Node package                 | Browser equivalent                                 |
| ---------------------------- | -------------------------------------------------- |
| `@polyglot-img/formats-png`  | `crc32` + `png` + `bytes`                          |
| `@polyglot-img/formats-jpeg` | `jpeg` (same SOF/EOI logic)                        |
| `@polyglot-img/formats-zip`  | `zip` (build / relocate / list / extract)          |
| `@polyglot-img/core/engine`  | `polyglot` module (synthesize / inspect / extract) |

## API

```typescript
import {
  synthesize,
  inspect,
  extract,
  buildZip,
  relocateZipOffsets,
  listZipEntries,
  crc32,
  isPng,
  isJpeg,
  parsePng,
  parseJpeg,
} from "@polyglot-img/browser";
```

See [API reference](/guide/api#polyglot-browser) for full signatures.

## Security limits

Same three caps as the Node engine:

```typescript
import { DEFAULT_SECURITY_LIMITS } from "@polyglot-img/browser";

// maxEntries: 10000
// maxEntrySize: 1 GiB
// maxTotalSize: 10 GiB
```

## Cross-validation

`tests/browser/browser.test.ts` runs 43 tests that verify the browser implementation against the Node parser — CRC-32 values, entry names, offsets, and round-trip behavior all match between the two stacks.
