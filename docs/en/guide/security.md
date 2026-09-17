# Security Model

The engine applies limits at multiple layers when building and reading polyglot files to defend against **ZIP bombs**, **path traversal**, and other common attack surfaces.

## Three size caps

While parsing the archive, the engine checks three independent upper bounds in parallel:

| Limit          | Default | Meaning                                                    |
| -------------- | ------- | ---------------------------------------------------------- |
| `maxEntries`   | 10 000  | Maximum number of entries allowed in the central directory |
| `maxEntrySize` | 1 GiB   | Maximum decompressed size for a single entry               |
| `maxTotalSize` | 10 GiB  | Maximum total decompressed size across all entries         |

Crossing any of them aborts immediately — the parser does not continue decompressing:

```
ZIP archive exceeds maximum entry limit: 15000 >= 10000
ZIP entry "evil.txt" exceeds maximum size: 2147483648 > 1073741824
ZIP archive total size exceeds limit: 1152921504606846976 > 1099511627776
```

The browser-side `@polyglot/browser` enforces the same three caps during `synthesize()`, catching oversized payloads before the file is even built.

## Path-traversal defense

`sanitizePath()` runs on every entry name with these rules, rejecting invalid names outright:

1. **Normalize separators** — backslashes are converted to forward slashes, preventing Windows-style bypasses.
2. **Reject absolute paths** — names starting with `/` raise `absolute path in entry "..."`.
3. **Reject `..` components** — any `..` directory jump raises `".." component in entry "..."`, including `foo/../bar`.
4. **Reject root `.`** — a standalone `.` is treated as invalid and raises `entry path is "."`.
5. **Allow nested directories** — `a/b/c.txt` passes; only exact matches of `..` and `.` are blocked.

```typescript
// All blocked
sanitizePath("..//etc/passwd"); // ".." component
sanitizePath("/etc/passwd"); // absolute path
sanitizePath(".."); // ".." component
sanitizePath("."); // entry path is "."

// Allowed
sanitizePath("nested/dir.txt"); // ✅
sanitizePath("a..b.txt"); // ✅ (not an exact ".." match)
```

The CLI's `extract` command depends on the same validation layer.

## JPEG truncation tolerance

PNG requires an `IEND` chunk to be considered valid; JPEG tolerates missing `EOI`. This is intentional:

- A polyglot file is built by appending the archive after the JPEG's natural `EOI` (`0xFFD9`), so normally-constructed files always satisfy the marker requirement.
- Accepting truncated JPEGs accommodates scenarios where the front image itself is incomplete (e.g., an interrupted network transfer). The archive layer does not depend on the image being complete, so a usable polyglot file can still be produced from whatever bytes are available.

## Front-format whitelist

Only explicitly registered adapters are accepted. The defaults register:

| Front | Identifier |
| ----- | ---------- |
| PNG   | `'png'`    |
| JPEG  | `'jpeg'`   |

Unsupported formats (GIF, WebP, BMP, etc.) cause `create()` to throw `Unsupported front format: gif` **without producing any output file**. The same applies to unregistered back formats.

## Defense in depth

Each of the above layers operates independently — failure of one does not disable the others. To harden consumption of untrusted polyglot files further, also consider:

- Lower `maxEntries` / `maxTotalSize` for externally-supplied files (e.g. 100 entries, 10 MiB).
- Unzip into a sandboxed directory in containerized environments.
- Prefer `inspect()` or `detect()` for a lightweight first-pass check before invoking `openBack()` on untrusted input.
