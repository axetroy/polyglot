# Compatibility

This page lists third-party extraction and reading tools that have **actually been run** against polyglot output, rather than ones that are "theoretically compatible". Every result comes from `tests/compatibility/third-party.test.ts` — that test really invokes these tools and compares the extracted bytes one by one.

Reproduce it with:

```bash
npm test -- tests/compatibility/third-party.test.ts
```

Tools that are not installed are skipped automatically (they do not fail the suite). CI installs the appropriate tools across **Linux**, **macOS**, and **Windows**: on Linux it uses `unzip` / `libarchive-tools` plus the official 7-Zip tarball; on macOS it brews `sevenzip`; on Windows it installs 7-Zip via chocolatey (the built-in `tar.exe` and `python` cover libarchive and Python zipfile, and `unzip` is best-effort). So those contracts execute for real on all three platforms.

## Test sample

Every run uses the same set of entries, chosen to cover the boundaries that are easy to overlook:

| Entry             | What it covers                                             |
| ----------------- | ---------------------------------------------------------- |
| `hello.txt`       | Ordinary text content                                      |
| `sub/dir/note.md` | Multi-level directory path                                 |
| `中文文档.txt`    | Non-ASCII file name (UTF-8 flag bit 11)                    |
| `empty.txt`       | Zero-byte entry                                            |
| `binary.bin`      | Binary content with `0x00` / `0xFF`, plus CRC verification |

The front image is a 512×512 PNG (about 390 KB), so the offset is a real, non-trivial value.

## Measured results

| Tool                    | Implementation | List       | Extract    | Content comparison | Notes                                                                                                                                                                               |
| ----------------------- | -------------- | ---------- | ---------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `unzip` / `zipinfo`     | Info-ZIP       | ✅         | ✅         | ✅ identical       | Native on Linux/macOS; installed via chocolatey on Windows. **Chinese filenames may appear as `????.txt` in Windows console**, but extraction is correct. No `extra bytes` warning. |
| `bsdtar` / `tar`        | libarchive     | ✅         | ✅         | ✅ identical       | Native `bsdtar` on macOS; built-in `tar.exe` on Windows 10+ (same libarchive lineage). Same as macOS Archive Utility and Win11 Explorer                                             |
| Python `zipfile`        | CPython stdlib | ✅         | ✅         | ✅ identical       | Pre-installed on all three platforms; `testzip()` returns `None` (all CRCs pass)                                                                                                    |
| 7-Zip (`7zz` / `7z`)    | Igor Pavlov    | ✅         | ✅         | ✅ identical       | Linux uses official tarball (`7zz`); macOS uses Homebrew (`sevenzip`); Windows uses chocolatey (`7z`). **Windows output uses backslash paths**, normalised in tests                 |
| `ditto`                 | Apple          | ❌         | ❌         | —                  | Reports `Couldn't read PKZip signature`, see "Known limitations" below                                                                                                              |
| `jar` / `java.util.zip` | OpenJDK        | not tested | not tested | —                  | No JDK on any CI platform; logically the same class as Info-ZIP                                                                                                                     |

> About the 7-Zip notice: it prints `Warning: The archive is open with offset` and reports `Embedded Stub Size = <image byte count>`. This is 7-Zip **correctly recognising** that the file is fronted by a self-extracting-style prefix (an SFX stub); extraction then reports `Everything is Ok`. It is informational output, not an error. **Note: Windows 7-Zip uses backslash path separators in its listing output** (e.g. `sub\dir\note.md`); the test normalises these to forward slashes before matching.

## CI Multi-platform Test Results (2026-09)

The following results come from GitHub Actions automated CI, covering **3 OS × 2 Node versions = 6 matrix combinations**, each with all 126 test cases passing:

| Platform           | Node    | Tests Passed | Notes                                                                                                               |
| ------------------ | ------- | ------------ | ------------------------------------------------------------------------------------------------------------------- |
| **Ubuntu** (Linux) | 20 / 22 | 126 / 126 ✅ | `unzip` + `bsdtar` + `7zz` (official tarball) + `python3` all work correctly                                        |
| **macOS**          | 20 / 22 | 126 / 126 ✅ | `unzip` / `zipinfo` / `bsdtar` / `python3` are pre-installed; `sevenzip` installed via Homebrew                     |
| **Windows**        | 20 / 22 | 126 / 126 ✅ | 7-Zip installed via chocolatey; `tar` (built-in libarchive) and `python` used directly; `unzip` best-effort install |

### Windows Platform Notes

- **Path separators**: 7-Zip listing output uses `\` (backslash), e.g. `sub\dir\note.md`. Test code normalises these before matching.
- **UTF-8 filenames**: Some tools (e.g. Windows `unzip`, `tar`) may display `中文文档.txt` as `????.txt` in non-UTF-8 consoles. The test includes a content-based fallback lookup so checks remain meaningful across platforms.
- **Missing tools are skipped**: `unzip` on Windows may fail to install (chocolatey `continue-on-error: true`); the test skips gracefully and other tools are still verified.

### Test Coverage

Each platform verifies the following 9 third-party compatibility contracts:

| #   | Test                                                     | Tool            |
| --- | -------------------------------------------------------- | --------------- |
| 1   | Central directory offset lands on `PK\x01\x02` signature | Layout contract |
| 2   | No padding bloat; file size = image + archive            | Layout contract |
| 3   | `unzip -t` reports no errors, no `extra bytes` warning   | Info-ZIP        |
| 4   | `unzip` extracts all entries with identical bytes        | Info-ZIP        |
| 5   | `zipinfo -v` parses central directory without warnings   | Info-ZIP        |
| 6   | `bsdtar`/`tar` lists and extracts every entry            | libarchive      |
| 7   | Python `zipfile` reads names, content, and CRCs intact   | Python          |
| 8   | 7-Zip lists and extracts every entry                     | 7-Zip           |
| 9   | File still reads as a valid PNG image                    | Front format    |

## Two classes of parser

Every compatibility difference traces back to one question: **does the parser trust the absolute offsets recorded in the ZIP?**

### Class 1: locate via the recorded offsets ✅

The parser finds the EOCD at the tail of the file, reads the central directory offset, and jumps straight to it.

This implementation writes offsets as **absolute positions in the whole file** (equivalent to Info-ZIP `zip -A` on a self-extracting archive), so this class needs no compensation at all to locate entries. That is why `unzip` no longer prints `N extra bytes at beginning or within zipfile`.

Examples: `unzip`, `zipinfo`, libarchive (`bsdtar` / `tar` / macOS Archive Utility / Windows 11 File Explorer), Python `zipfile`, 7-Zip, WinRAR, WinZip.

### Class 2: require `PK\x03\x04` at byte 0 ❌

Some implementations skip the EOCD backward scan entirely and simply check whether the file starts with a local file header signature, or they only search for the central directory near the head of the file.

Examples: Apple `ditto`, and parts of Finder's extraction path.

**These tools can never open an image-fronted polyglot file**: the PNG/JPEG signature must occupy byte 0, so ZIP cannot occupy byte 0 as well. This is a format-level mutual exclusion, not an implementation defect. No polyglot scheme can honestly claim that "every archiver can open it".

> Note for macOS users: double-clicking to open with Archive Utility may fail (it goes through the `ditto` path). Extracting with `unzip`, `bsdtar`, 7-Zip or Python all work.

## Known trade-off: slicing the ZIP out on its own

Because offsets are now recorded relative to the **whole file**, if you manually drop the image prefix, keep only the trailing ZIP slice and save it as a standalone file, the offsets are larger than that fragment by the prefix length:

| Tool             | Behaviour on the "sliced-out fragment"                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------- |
| `unzip`          | Reports `missing N bytes in zipfile`, but still says `attempting to process anyway` and extracts successfully |
| Python `zipfile` | ✅ normal, CRCs pass                                                                                          |
| `bsdtar`         | ✅ normal                                                                                                     |
| 7-Zip            | ✅ normal                                                                                                     |

This is the trade-off against the "padded layout": padding made the sliced-out fragment perfect, but it broke the **primary artifact** (the polyglot file itself) with warnings, outright refusal by 7-Zip, and double the size. The primary artifact is what users hand to other people, so that is the one optimised here, and this test suite pins down the degraded behaviour of the fragment.

## Supported combinations

| Front          | Back | Supported | Mode          |
| -------------- | ---- | --------- | ------------- |
| PNG            | ZIP  | ✅        | `relocated`   |
| JPEG           | ZIP  | ✅        | `relocated`   |
| any other pair | —    | ❌        | `unsupported` |

Unregistered pairs are always treated as `unsupported`, and `create()` throws `Unsupported back format` instead of producing a corrupted file.
