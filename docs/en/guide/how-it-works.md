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

| Location | Field | Meaning |
| --- | --- | --- |
| EOCD + 16 | central directory offset | Position of the CD relative to the archive origin |
| CD record + 42 | local file header offset | Position of each entry's local header relative to the archive origin |

All other fields (sizes, CRC, name lengths) are relative and stay unchanged.

When building the archive independently, offsets use the archive's own start as zero. After appending the archive after the image, these pointers must shift by the image length — otherwise the ZIP parser would look in the wrong place:

```
adjustment = length of image bytes

EOCD.centralDirOffset      += adjustment
CD[i].localHeaderOffset   += adjustment
```

In practice, `relocateZipOffsets` allocates a buffer that is `adjustment` bytes larger, copies the archive into the tail, and adds `adjustment` to both the EOCD and every CD record. The result:

- In the polyglot file, local headers sit at image-length + archive-relative offset.
- In the relocated archive read in isolation, offsets remain correct relative to the archive origin.

### The concat-offset correction

Because stored offsets are relative to the archive origin rather than the file origin, standard ZIP tools derive the prefix length themselves:

```
prefix = EOCD_absolute_position - centralDirSize - centralDirOffset
```

This is exactly what `unzip` emits as `N extra bytes at beginning or within zipfile`, and the same logic is used by Python's `zipfile` module and 7-Zip. Adding this prefix to every stored offset yields true file-level positions, so the archive parses correctly both standalone and embedded inside the polyglot file — the browser-side parser implements this correction too.

> Self-extracting SFX archives and `zip -A`-patched JAR files apply the same pattern, so the output remains compatible with third-party tools rather than requiring special handling.

## Compatibility matrix

The engine uses a **front × back** compatibility rule table to decide whether a pair is supported:

| Front | Back | Supported | Mode |
| --- | --- | --- | --- |
| PNG | ZIP | ✅ | `relocated` |
| JPEG | ZIP | ✅ | `relocated` |
| any other pair | — | ❌ | `unsupported` |

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
