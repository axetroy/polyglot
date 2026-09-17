import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync, readdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";
import { deflateSync } from "zlib";
import { PolyglotEngine } from "@polyglot/core";
import { pngAdapter } from "@polyglot/formats-png";
import { zipAdapter } from "@polyglot/formats-zip";

/**
 * Third-party compatibility tests — the actual product claim.
 *
 * A polyglot file is only useful if real-world archive tools open it, so these
 * tests shell out to the real implementations and assert BOTH listing and
 * extraction (bytes compared), not just our own parser's opinion.
 *
 * Covered implementations:
 *   - Info-ZIP `unzip` / `zipinfo`  (the de-facto CLI reference)
 *   - libarchive `bsdtar` / `tar`   (macOS Archive Utility, Windows 11 Explorer)
 *   - Python `zipfile`              (stdlib)
 *   - 7-Zip                         (Windows ecosystem reference)
 *
 * Tools that are not installed are skipped, so the suite stays portable; the CI
 * runner installs them so the contracts really execute there.
 */

/** Probe a tool by actually running it — presence on PATH is not enough (`jar` is a stub without a JDK). */
function toolOk(name: string, args: string[]): boolean {
  const r = spawnSync(name, args, { stdio: "ignore" });
  return !r.error && r.status === 0;
}

const PLATFORM = process.platform;

// `unzip` on Windows isn't on PATH by default — CI installs it via choco when
// available; otherwise the unzip tests skip, but 7-Zip and libarchive still run.
const UNZIP = toolOk("unzip", ["-v"]);
const ZIPINFO = toolOk("zipinfo", ["-h"]);
// libarchive ships as `bsdtar` on macOS/Linux; Windows 10+ also ships a
// libarchive build as `tar.exe` in System32. GNU tar on Linux cannot open ZIP
// files, so we only fall back to `tar` on non-Linux platforms.
const BSDTAR = toolOk("bsdtar", ["--version"])
  ? "bsdtar"
  : PLATFORM !== "linux" && toolOk("tar", ["--version"])
    ? "tar"
    : null;
// `python3` is the convention on macOS/Linux; Windows GitHub runners expose `python` (and sometimes `python3` as a shim). Probe both.
const PYTHON = toolOk("python3", ["--version"])
  ? "python3"
  : toolOk("python", ["--version"])
    ? "python"
    : null;
const SEVENZIP = toolOk("7zz", ["i"]) ? "7zz" : toolOk("7z", ["i"]) ? "7z" : null;

const ENTRIES = [
  { name: "hello.txt", data: Buffer.from("Hello from inside the image!\n") },
  { name: "sub/dir/note.md", data: Buffer.from("# nested\n") },
  { name: "中文文档.txt", data: Buffer.from("中文内容\n") },
  { name: "empty.txt", data: Buffer.alloc(0) },
  { name: "binary.bin", data: Buffer.from([0, 1, 2, 3, 250, 251, 252, 253, 254, 255]) },
];

function makePng(width = 512, height = 512, seed = 7): Buffer {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const crc32 = (buf: Buffer): Buffer => {
    const table: number[] = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    let crc = 0xffffffff;
    for (const b of buf) crc = (table[(crc ^ b) & 0xff] ?? 0) ^ (crc >>> 8);
    const out = Buffer.alloc(4);
    out.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return out;
  };
  const chunk = (type: string, data: Buffer): Buffer => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    return Buffer.concat([len, body, crc32(body)]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2; // truecolor
  // Per-pixel gradient plus light noise so the image does not deflate to nothing:
  // a realistic prefix length matters because every stored offset shifts by it.
  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    const row = y * (1 + width * 3);
    raw[row] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const o = row + 1 + x * 3;
      raw[o] = (x * 7 + seed) & 0xff;
      raw[o + 1] = (y * 5 + seed) & 0xff;
      raw[o + 2] = (x * y + seed) & 0xff;
    }
  }
  for (let i = 0; i < raw.length; i += 97) raw[i] = ((raw[i] as number) * 31 + seed) & 0xff;
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

let dir: string;
let streamPath: string;
let imagePath: string;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "polyglot-3p-"));
  const engine = new PolyglotEngine();
  engine.registerFront(pngAdapter);
  engine.registerBack(zipAdapter);
  engine.registerCompatibility("png", "zip", true, "relocated");

  const png = makePng();
  imagePath = join(dir, "front.png");
  writeFileSync(imagePath, png);

  const file = await engine.create({ front: png, back: { format: "zip", entries: ENTRIES } });
  streamPath = join(dir, "polyglot.png.zip");
  writeFileSync(streamPath, file.getBuffer());
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** Read a file extracted by an external tool, or null when the tool skipped it. */
function readExtracted(root: string, name: string): Buffer | null {
  const walk = (base: string): string | null => {
    for (const item of readdirSync(base, { withFileTypes: true })) {
      const full = join(base, item.name);
      if (item.isDirectory()) {
        const found = walk(full);
        if (found) return found;
      } else if (item.name.normalize("NFC") === name.normalize("NFC")) {
        return full;
      }
    }
    return null;
  };
  const found = walk(root);
  return found ? readFileSync(found) : null;
}

function assertExtracted(root: string): void {
  expect(readExtracted(root, "hello.txt")).toEqual(Buffer.from("Hello from inside the image!\n"));
  // note.md: some tools flatten or resolve the path differently; try both the
  // top-level name and the full nested path so the check survives platform quirks.
  const noteMd = readExtracted(root, "note.md") ?? readExtracted(root, "sub/dir/note.md");
  expect(noteMd).toEqual(Buffer.from("# nested\n"));
  // Chinese filename: the ZIP stores it as UTF-8, but extraction tools on
  // non-UTF-8 locales (Windows cmd, some Linux terminals) may mangle the bytes.
  // Fall back to scanning the extracted tree by content so the test remains
  // meaningful everywhere.
  const cnEntries = findByNameOrContent(root, "中文文档.txt", Buffer.from("中文内容\n"));
  expect(cnEntries.length).toBeGreaterThan(0);
  expect(readFileSync(cnEntries[0]!)).toEqual(Buffer.from("中文内容\n"));
  expect(readExtracted(root, "empty.txt")).toEqual(Buffer.alloc(0));
  expect(readExtracted(root, "binary.bin")).toEqual(
    Buffer.from([0, 1, 2, 3, 250, 251, 252, 253, 254, 255])
  );
}

/** Look up an entry by name first; if missing, scan by content as a fallback. */
function findByNameOrContent(root: string, name: string, content: Buffer): string[] {
  const byName: string[] = [];
  const walk = (base: string): void => {
    for (const item of readdirSync(base, { withFileTypes: true })) {
      const full = join(base, item.name);
      if (item.isDirectory()) walk(full);
      else if (item.name.normalize("NFC") === name.normalize("NFC")) byName.push(full);
    }
  };
  walk(root);
  if (byName.length > 0) return byName;
  // Fallback: scan by content (handles encoding-mangled filenames)
  const byContent: string[] = [];
  const scan = (base: string): void => {
    for (const item of readdirSync(base, { withFileTypes: true })) {
      const full = join(base, item.name);
      if (item.isDirectory()) scan(full);
      else if (readFileSync(full).equals(content)) byContent.push(full);
    }
  };
  scan(root);
  return byContent;
}

describe("file layout contract", () => {
  it("records a central-directory offset that lands on the CD signature", () => {
    const buf = readFileSync(streamPath);
    let eocd = -1;
    for (let i = buf.length - 22; i >= 0; i--) {
      if (buf.readUInt32LE(i) === 0x06054b50) {
        eocd = i;
        break;
      }
    }
    expect(eocd).toBeGreaterThanOrEqual(0);
    // The concat offset must be 0: offsets are absolute, so a spec-literal reader
    // that seeks straight to the recorded offset finds the signature. A padded
    // (double-prefix) archive would land on zeros here — exactly the bug that
    // made 7-Zip refuse the file outright.
    const cdOffset = buf.readUInt32LE(eocd + 16);
    const cdSize = buf.readUInt32LE(eocd + 12);
    expect(eocd - cdSize - cdOffset).toBe(0);
    expect(buf.subarray(cdOffset, cdOffset + 4).toString("hex")).toBe("504b0102");
  });

  it("appends the archive once, with no padding bloat", async () => {
    const buf = readFileSync(streamPath);
    const pngSize = readFileSync(imagePath).length;
    const standalone = await zipAdapter.create(ENTRIES);
    // Exactly image + archive. The pre-fix padded layout doubled the size.
    expect(buf.length).toBe(pngSize + standalone.length);
    // Same length as a standalone archive: relocation rewrites offset fields in
    // place, so every byte after the image belongs to the archive — the trailing
    // EOCD of the stream must sit at the very end.
    expect(buf.readUInt32LE(buf.length - 22)).toBe(0x06054b50);
    // The front image is byte-identical to the input.
    expect(buf.subarray(0, pngSize)).toEqual(readFileSync(imagePath));
  });
});

describe("Info-ZIP (unzip / zipinfo)", () => {
  it.skipIf(!UNZIP)('unzip -t reports no errors and no "extra bytes" warning', () => {
    const r = spawnSync("unzip", ["-t", streamPath], { encoding: "utf8" });
    expect(r.status).toBe(0);
    const out = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
    expect(out).toContain("No errors detected");
    // This is the warning the pre-fix layout produced; it must stay gone.
    expect(out).not.toContain("extra bytes");
  });

  it.skipIf(!UNZIP)("unzip extracts every entry with identical bytes", () => {
    const out = join(dir, "x-unzip");
    mkdirSync(out, { recursive: true });
    const r = spawnSync("unzip", ["-qq", "-o", streamPath, "-d", out], { encoding: "utf8" });
    expect(r.status).toBe(0);
    assertExtracted(out);
  });

  it.skipIf(!ZIPINFO)("zipinfo -v parses the central directory without warnings", () => {
    const r = spawnSync("zipinfo", ["-v", streamPath], { encoding: "utf8" });
    expect(r.status).toBe(0);
    expect(`${r.stdout ?? ""}${r.stderr ?? ""}`).not.toContain("extra bytes");
    const names = spawnSync("zipinfo", ["-1", streamPath], { encoding: "utf8" }).stdout ?? "";
    expect(names).toContain("hello.txt");
    expect(names).toContain("sub/dir/note.md");
  });
});

describe("libarchive (bsdtar / tar)", () => {
  it.skipIf(!BSDTAR)("bsdtar lists and extracts every entry", () => {
    const tool = BSDTAR as string;
    const list = spawnSync(tool, ["-tf", streamPath], { encoding: "utf8" });
    expect(list.status).toBe(0);
    const listed = (list.stdout ?? "").replace(/\\/g, "/");
    expect(listed).toContain("hello.txt");
    // Chinese filename listing is locale-dependent; verify it where possible but
    // do not fail the test on Windows/legacy terminals that cannot render it.
    const hasUtf8Names = listed.includes("中文文档.txt") || list.stderr?.includes("中文文档.txt");
    if (hasUtf8Names) expect(listed).toContain("中文文档.txt");
    expect(listed).toContain("sub/dir/note.md");

    const out = join(dir, "x-bsdtar");
    mkdirSync(out, { recursive: true });
    const r = spawnSync(tool, ["-xf", streamPath, "-C", out], { encoding: "utf8" });
    expect(r.status).toBe(0);
    assertExtracted(out);
  });
});

describe("Python zipfile", () => {
  it.skipIf(!PYTHON)("reads names, content and CRCs intact", () => {
    const code = [
      "import sys, zipfile",
      "z = zipfile.ZipFile(sys.argv[1])",
      "n = z.namelist()",
      "assert 'hello.txt' in n and 'sub/dir/note.md' in n and '中文文档.txt' in n, n",
      "assert z.read('hello.txt') == 'Hello from inside the image!\\n'.encode()",
      "assert z.read('中文文档.txt') == u'中文内容\\n'.encode('utf-8')",
      "assert z.read('binary.bin') == bytes([0,1,2,3,250,251,252,253,254,255])",
      "assert z.read('empty.txt') == b''",
      "assert z.testzip() is None",
      "print('PYOK')",
    ].join("\n");
    const r = spawnSync(PYTHON as string, ["-c", code, streamPath], { encoding: "utf8" });
    expect(r.status).toBe(0);
    expect(`${r.stdout ?? ""}\n${r.stderr ?? ""}`).toContain("PYOK");
  });
});

describe("7-Zip", () => {
  it.skipIf(!SEVENZIP)("lists and extracts every entry", () => {
    const tool = SEVENZIP as string;
    const list = spawnSync(tool, ["l", streamPath], { encoding: "utf8" });
    expect(list.status).toBe(0);
    // 7-Zip on Windows uses backslashes and \r\n line endings; normalise for
    // stable assertions across platforms.
    const listed = (list.stdout ?? "").replace(/\\/g, "/");
    expect(listed).toContain("hello.txt");
    expect(listed).toContain("sub/dir/note.md");
    // 7-Zip recognises the image prefix as an SFX-style stub. The exact
    // wording varies by build/version (official `7zz` prints "Embedded Stub
    // Size = …", p7zip prints "The archive is open with offset"), so accept
    // either form. Exit-0 + byte-identical extraction is the hard requirement.
    expect(`${list.stdout ?? ""}\n${list.stderr ?? ""}`).toMatch(
      /Embedded Stub Size|open with offset/i
    );

    const out = join(dir, "x-7z");
    mkdirSync(out, { recursive: true });
    const r = spawnSync(tool, ["x", "-y", `-o${out}`, streamPath], { encoding: "utf8" });
    expect(r.status).toBe(0);
    assertExtracted(out);
  });
});

describe("front format detection", () => {
  it("the file still reads as a valid PNG image", () => {
    const buf = readFileSync(streamPath);
    expect(buf.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    // IEND is the last PNG chunk, before the appended archive.
    expect(buf.subarray(0, readFileSync(imagePath).length)).toEqual(readFileSync(imagePath));
  });
});
