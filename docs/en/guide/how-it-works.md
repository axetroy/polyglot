# How It Works

## The core idea

To make one file acceptable to two format parsers simultaneously, the trick is to let each parser read from the **opposite direction**:

```
┌─────────────────────────────────────────────────────────────┐
│  PNG / JPEG image bytes              │  ZIP archive bytes    │
│  ↓                                   │  ↓                    │
│  Parser reads forward to IEND / EOI  │  Parser scans back   │
│  (stops at the format terminator)    │  for the EOCD record  │
└─────────────────────────────────────────────────────────────┘
```

- **Image parsers** scan forward from the start; PNG stops at `IEND`, JPEG stops at `EOI` (`0xFFD9`). Extra bytes after that marker are simply ignored.
- **ZIP parsers** search backward from the end of the file for the EOCD record (`0x06054b50`), then follow the central directory forward.

Because the two readers target opposite ends of the same byte range, they never collide.

## Why neither side corrupts the other

### Image side

PNG requires an `IEND` chunk to be valid; the spec says parsers must stop there. JPEG requires `EOI` (`0xFFD9`); after that point, no further image data is expected. Appended archive bytes are invisible to image viewers and do not break rendering.

### Archive side

ZIP locating is self-contained:

1. Scan backward from the file end for the EOCD signature (at most 65557 bytes back to accommodate the longest allowed comment).
2. Read the central directory's size and offset from EOCD.
3. Walk the central directory to resolve every entry's local-header position.

Since the archive is appended whole after the image, the ZIP parser will always find it from the tail.

## Offset relocation

The most critical piece of the implementation.

ZIP carries two kinds of **absolute offsets**:

| Location       | Field                    | Meaning                                                           |
| -------------- | ------------------------ | ----------------------------------------------------------------- |
| EOCD + 16      | central directory offset | Position of the CD relative to the file origin                    |
| CD record + 42 | local file header offset | Position of each entry's local header relative to the file origin |

All other fields (sizes, CRC, name lengths) are relative and stay unchanged.

When building the archive independently, offsets use the archive's own start as zero. After appending the archive after the image, these pointers must shift by the image length — otherwise the ZIP parser would look in the wrong place:

```
adjustment = length of image bytes

EOCD.centralDirOffset      += adjustment
CD[i].localHeaderOffset   += adjustment
```

In practice, `relocateZipOffsets` rewrites only those two pointer fields in a **same-length copy** of the archive: the archive bytes themselves are never padded, moved or resized. The result:

- In the polyglot file, each local header sits at image length + archive-relative offset, so the archive follows the image immediately with **no padding in between**.
- The recorded offsets are absolute positions in the whole file, so a parser that trusts them locates every entry with no compensation whatsoever.

This is precisely what Info-ZIP `zip -A` does for self-extracting (SFX) archives: turn archive-relative offsets into file-absolute ones.

### The concat-offset correction

The ZIP spec allows an arbitrary prefix before the archive data (an SFX stub, for example), and standard tools derive that prefix's length from the EOCD:

```
prefix = EOCD_absolute_position - centralDirSize - centralDirOffset
```

Because this implementation stores **absolute** offsets, parsing the **whole file** makes that formula yield `prefix = 0`: tools simply follow the recorded offsets and print no warning at all. The readers in this project implement the same correction, so they handle both the whole polyglot file and a bare "archive-only" slice.

### Compatibility boundary (important)

Parsers split into roughly two classes:

| Class                                                            | Behaviour         | Examples                                                                                   |
| ---------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------ |
| Trust the recorded offsets (with the optional concat correction) | ✅ opens the file | `unzip` / `zipinfo`, Python `zipfile`, libarchive (`bsdtar`, macOS Archive Utility), 7-Zip |
| Require `PK\x03\x04` at byte 0                                   | ❌ refuses        | Apple `ditto` (and parts of Finder's extraction path), some strict GUI tools               |

The second class is a **format-level mutual exclusion**: the PNG/JPEG signature must occupy byte 0, so ZIP cannot occupy byte 0 at the same time. Any consumer that insists on seeing ZIP at byte 0 can therefore never open an image-fronted polyglot file — that is an inherent boundary of this file shape, not an implementation defect. **Never make "every archiver can open it" a goal**; [Compatibility](/en/guide/compatibility) and `tests/compatibility/third-party.test.ts` pin the first class down with real tools.

## Compatibility matrix

The engine uses a **front × back** compatibility rule table to decide whether a pair is supported:

| Front          | Back | Supported | Mode          |
| -------------- | ---- | --------- | ------------- |
| PNG            | ZIP  | ✅        | `relocated`   |
| JPEG           | ZIP  | ✅        | `relocated`   |
| any other pair | —    | ❌        | `unsupported` |

`relocated` means "implemented via offset relocation". Unregistered pairs are rejected with `unsupported`, and `create()` throws before producing a corrupted file.

## Security boundaries

The reader layer applies multiple caps to guard against malicious payloads — see [Security model](/en/guide/security) for details:

- Entry-count limit (default 10 000)
- Per-entry decompressed-size limit (default 1 GiB)
- Total decompressed-size limit (default 10 GiB)
- Path-traversal rejection (`..`, absolute paths, `.`)

## Browser-side implementation

`@polyglot/browser` ports the same algorithms to pure `Uint8Array` — no Node `Buffer` dependency:

- CRC-32 uses a table built once at module load time
- PNG / JPEG parsers operate directly on `Uint8Array` with `DataView`
- ZIP build and offset relocation logic matches the Node side

[Playground](/en/playground) is driven entirely by it, and all processing runs locally in the browser — **no files are uploaded**.
