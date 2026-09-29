<p align="center">
  <img src="./docs/public/logo.svg" alt="Polyglot File Engine" width="160" height="160" />
</p>

# Polyglot File Engine

**A local dual-format file engine** — merges an image and a ZIP archive into a single file that both kinds of parsers can still read.

```
image.png      → [ PNG ] + [ ZIP ]     (PNG viewers render it, ZIP tools extract it)
image.zip      → [ JPEG ] + [ ZIP ]    (JPG viewers render it, ZIP tools extract it)
```

**🌐 Documentation site:** <https://axetroy.github.io/polyglot>  
**🎮 Playground (in-browser synthesis):** [docs/playground.md](./docs/playground.md) — runs entirely in the browser, nothing is uploaded

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         SDK / CLI                           │
├──────────────┬──────────────────────────────────────────────┤
│  PolyglotEngine │  Core  ·  Registry  ·  Detector           │
├──────────────┬──────────────┬───────────────────────────────┤
│  Front Adapters  │  Back Adapters  │  Compatibility Engine  │
│  PNG  ·  JPEG    │  ZIP              │  (security limits)   │
├──────────────────┴──────────────────┴───────────────────────┤
│  Binary Source (Path / Buffer / Stream)                     │
└─────────────────────────────────────────────────────────────┘

  packages/
    browser/    ⚡ Pure browser implementation (Uint8Array, no Node Buffer)
    binary/     BinarySource · BinaryReader/Writer
    core/       PolyglotEngine · Detector · CompatibilityEngine
    sdk/        SDK facade (create engine + register adapters)
    cli/        Commander CLI (create / inspect / list / extract)
    formats/
      png/      PNG front adapter (validation · parsing · size computation)
      jpeg/     JPEG front adapter
      zip/      ZIP back adapter (security limits · offset relocation)
  tests/
    browser/    @polyglot-img/browser cross-validation tests (vs Node parser)
    binary/     BinarySource unit tests
    zip/        ZIP security tests (Zip Bomb · Path Traversal · maxEntries)
    compatibility/  compatibility unit tests + real third-party extraction
    detector/   Detector integration tests
    integration/ PolyglotFile end-to-end tests
```

## Tech Stack

- **Node.js** 20+ · **TypeScript** 5.4+ · **ESM**
- **tsup** build (ESM + DTS)
- **Vitest** testing (globals mode, node env)
- **VitePress** static docs site + Playground component
- **ESLint 8.57** + **Prettier 3.2** (lint-staged + husky)
- **GitHub Actions** CI (typecheck / lint / test × Node 20+22 / build)

## Repository Layout

| Package                 | Purpose                                                          |
| ----------------------- | ---------------------------------------------------------------- |
| `packages/binary`       | `BinarySource` abstraction with read/write streams               |
| `packages/core`         | Engine core, registry, detector                                  |
| `packages/sdk`          | SDK facade with pre-registered adapters                          |
| `packages/cli`          | CLI (create / inspect / list / extract)                          |
| `packages/formats/png`  | PNG front adapter                                                |
| `packages/formats/jpeg` | JPEG front adapter                                               |
| `packages/formats/zip`  | ZIP back adapter (security caps + path sanitization)             |
| `packages/browser`      | Browser-only `Uint8Array` implementation (drives the Playground) |
| `docs/`                 | VitePress site source (Chinese & English)                        |
| `tests/browser/`        | Browser package tests (cross-validated against Node)             |

## Getting Started

```bash
npm install
npm run build
npm test
```

## Run the Docs Site

```bash
npm run docs:dev          # local dev mode
npm run docs:build        # build static site to docs/.vitepress/dist
npm run docs:preview      # preview the built site locally
```

## CLI

```bash
# Create a polyglot file (--add inlines text; use the SDK for binary content)
polyglot create --front image.png --back zip \
  --add readme.txt:hello \
  --output polyglot.png.zip
# Inspect a file
polyglot inspect polyglot.png.zip

# List archive contents
polyglot list polyglot.png.zip

# Extract archive contents
polyglot extract polyglot.png.zip ./output/
```

## SDK API

```typescript
import * as polyglot from "@polyglot-img/sdk";

// Create
const file = await polyglot.polyglot.create({
  front: "./image.png", // path | Buffer | BinarySource
  back: {
    format: "zip",
    entries: [{ name: "readme.txt", data: Buffer.from("hello") }],
  },
});
await file.write("polyglot.png"); // stream the file to disk
console.log(file.getInfo()); // metadata

// Inspect
const info = await polyglot.polyglot.inspect("polyglot.png");

// Open the image
const front = await polyglot.polyglot.openFront("polyglot.png");
for await (const chunk of front.stream()) {
  /* ... */
}

// Open the archive
const archive = await polyglot.polyglot.openBack("polyglot.png");
const names = await archive.list();
const data = await archive.read("readme.txt");
```

## Compatibility (verified)

The produced files can be extracted losslessly by the tools below — byte-for-byte identical content (see the [compatibility report](https://axetroy.github.io/polyglot/guide/compatibility), or run `npm test -- tests/compatibility/third-party.test.ts`):

| Tool                           | Listing | Extraction                  |
| ------------------------------ | ------- | --------------------------- |
| `unzip` / `zipinfo` (Info-ZIP) | ✅      | ✅ no `extra bytes` warning |
| `bsdtar` / `tar` (libarchive)  | ✅      | ✅                          |
| Python `zipfile`               | ✅      | ✅ CRC all passed           |
| 7-Zip                          | ✅      | ✅ recognized as SFX prefix |

Known limitation: implementations that require the first byte of the file to be a ZIP signature (e.g. Apple `ditto`) cannot open image-fronted files — that is a format-level incompatibility, not a defect.

## Security Features

| Protection         | Description                                                      |
| ------------------ | ---------------------------------------------------------------- |
| **Zip Bomb**       | `maxEntries: 10000`, `maxEntrySize: 1GB`, `maxTotalSize: 10GB`   |
| **Path Traversal** | `sanitizeEntryPath()` rejects `..` and absolute paths            |
| **Error Handling** | Graceful degradation on truncated JPEG, never throws             |
| **CLI Safety**     | `extract` command automatically filters dangerous paths          |
| **Browser**        | `@polyglot-img/browser` enforces the same three-tier safety caps |

## Running Tests

```bash
npm run test          # run all tests
npm run typecheck     # TypeScript type checking
npm run lint          # ESLint + Prettier
npm run lint:fix      # auto-fix
npm run build         # full build
```

## CI

```yaml
jobs: typecheck  - tsc --noEmit
  lint       - eslint . --ext .ts
  test-node20 - vitest run (Node 20)
  test-node22 - vitest run (Node 22)
  build      - npm run build
  docs       - npm run docs:build
```
