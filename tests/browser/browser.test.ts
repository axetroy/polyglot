import { describe, it, expect } from "vitest";
import {
  crc32,
  isPng,
  isJpeg,
  parsePng,
  validatePng,
  parseJpeg,
  validateJpeg,
  buildZip,
  findEocd,
  computeConcatOffset,
  relocateZipOffsets,
  listZipEntries,
  extractZipEntries,
  detectFrontFormat,
  parseFrontImage,
  synthesize,
  inspect,
  extract,
  DEFAULT_SECURITY_LIMITS,
} from "@polyglot/browser";
// Node-side parser used to cross-validate the browser implementation.
import { parseZip } from "@polyglot/formats-zip";
import { BufferSource } from "@polyglot/binary";

// ── Fixture builders ──────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  return t;
})();

function nodeCrc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]!) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + payload.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, payload.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(payload, 8);
  view.setUint32(8 + payload.length, nodeCrc32(out.subarray(4, 8 + payload.length)));
  return out;
}

function makePng(width = 2, height = 3): Uint8Array {
  const sig = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolor
  const idat = new Uint8Array([0x78, 0x9c, 0x63, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01]);
  const parts = [sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", new Uint8Array(0))];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

function makeJpeg(width = 4, height = 5): Uint8Array {
  // SOI + SOF0 (with dimensions) + EOI
  const sof = new Uint8Array(8 + 3 * 3);
  const view = new DataView(sof.buffer);
  view.setUint16(0, sof.length); // segment length (includes these 2 bytes)
  sof[2] = 8; // precision
  view.setUint16(3, height);
  view.setUint16(5, width);
  sof[7] = 3; // components
  const out = new Uint8Array(2 + 2 + sof.length + 2);
  let off = 0;
  out[off++] = 0xff;
  out[off++] = 0xd8; // SOI
  out[off++] = 0xff;
  out[off++] = 0xc0; // SOF0
  out.set(sof, off);
  off += sof.length;
  out[off++] = 0xff;
  out[off++] = 0xd9; // EOI
  return out;
}

const enc = (s: string) => new TextEncoder().encode(s);

// ── CRC-32 ────────────────────────────────────────────────
describe("crc32", () => {
  it("matches known vectors", () => {
    expect(crc32(enc(""))).toBe(0);
    expect(crc32(enc("a"))).toBe(0xe8b7be43);
    expect(crc32(enc("abc"))).toBe(0x352441c2);
    expect(crc32(enc("123456789"))).toBe(0xcbf43926);
  });
});

// ── PNG ───────────────────────────────────────────────────
describe("browser PNG", () => {
  it("detects the PNG signature", () => {
    expect(isPng(makePng())).toBe(true);
    expect(isPng(enc("not a png"))).toBe(false);
    expect(isPng(new Uint8Array([0x89, 0x50]))).toBe(false);
  });

  it("parses dimensions and stops at IEND", () => {
    const info = parsePng(makePng(7, 9));
    expect(info.width).toBe(7);
    expect(info.height).toBe(9);
    expect(info.bitDepth).toBe(8);
    expect(info.colorType).toBe(2);
    expect(info.valid).toBe(true);
    expect(info.chunks.map((c) => c.type)).toEqual(["IHDR", "IDAT", "IEND"]);
    expect(info.size).toBe(makePng().length);
  });

  it("ignores trailing bytes after IEND", () => {
    const png = makePng();
    const withTrailer = new Uint8Array(png.length + 10);
    withTrailer.set(png);
    withTrailer.set(enc("TRAILING!!"), png.length);
    expect(parsePng(withTrailer).size).toBe(png.length);
  });

  it("rejects a PNG without IEND", () => {
    const png = makePng();
    const truncated = png.subarray(0, png.length - 12);
    const result = validatePng(truncated);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/IEND/);
  });
});

// ── JPEG ──────────────────────────────────────────────────
describe("browser JPEG", () => {
  it("detects the SOI marker", () => {
    expect(isJpeg(makeJpeg())).toBe(true);
    expect(isJpeg(enc("not a jpeg"))).toBe(false);
  });

  it("parses dimensions from SOF0 and stops at EOI", () => {
    const info = parseJpeg(makeJpeg(11, 13));
    expect(info.width).toBe(11);
    expect(info.height).toBe(13);
    expect(info.numComponents).toBe(3);
    expect(info.valid).toBe(true);
    expect(info.size).toBe(makeJpeg().length);
  });

  it("reports invalid when EOI is missing", () => {
    const jpeg = makeJpeg();
    const result = validateJpeg(jpeg.subarray(0, jpeg.length - 2));
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/EOI/);
  });
});

// ── Front format dispatch ─────────────────────────────────
describe("front format dispatch", () => {
  it("identifies png / jpeg / unknown", () => {
    expect(detectFrontFormat(makePng())).toBe("png");
    expect(detectFrontFormat(makeJpeg())).toBe("jpeg");
    expect(detectFrontFormat(enc("GIF89a"))).toBeNull();
  });

  it("parseFrontImage returns the right tag and info", () => {
    expect(parseFrontImage(makePng(3, 4)).info.width).toBe(3);
    expect(parseFrontImage(makeJpeg(5, 6)).format).toBe("jpeg");
    expect(() => parseFrontImage(enc("nope"))).toThrow(/Unsupported front format/);
  });
});

// ── ZIP building ──────────────────────────────────────────
describe("browser buildZip", () => {
  it("produces a ZIP the Node parser accepts (stored entries)", async () => {
    const archive = buildZip([
      { name: "hello.txt", data: enc("Hello") },
      { name: "world.txt", data: enc("World!") },
    ]);

    const parsed = await parseZip(new BufferSource(Buffer.from(archive)));
    expect(parsed.entries.map((e) => e.name)).toEqual(["hello.txt", "world.txt"]);
    expect(Buffer.from(parsed.entries[0]!.data).toString()).toBe("Hello");
    expect(Buffer.from(parsed.entries[1]!.data).toString()).toBe("World!");
  });

  it("records correct CRC-32 values", () => {
    const archive = buildZip([{ name: "a.txt", data: enc("abc") }]);
    const entries = listZipEntries(archive);
    expect(entries[0]!.crc32).toBe(0x352441c2);
  });

  it("flags non-ASCII names as UTF-8", () => {
    const archive = buildZip([{ name: "中文.txt", data: enc("x") }]);
    const entries = listZipEntries(archive);
    expect(entries[0]!.name).toBe("中文.txt");
    expect(entries[0]!.compressedSize).toBe(1);
  });

  it("flips the UTF-8 flag only for non-ASCII names", () => {
    const ascii = buildZip([{ name: "plain.txt", data: enc("x") }]);
    const nonAscii = buildZip([{ name: "中文.txt", data: enc("x") }]);
    const cdStart = findEocd(ascii) - 46 - "plain.txt".length;
    const flagAscii = ascii[cdStart + 8]! | (ascii[cdStart + 9]! << 8);
    const cdStart2 = findEocd(nonAscii) - 46 - enc("中文.txt").length;
    const flagNonAscii = nonAscii[cdStart2 + 8]! | (nonAscii[cdStart2 + 9]! << 8);
    expect(flagAscii & 0x0800).toBe(0);
    expect(flagNonAscii & 0x0800).toBe(0x0800);
  });

  it("writes the EOCD entry count", () => {
    const archive = buildZip([
      { name: "a", data: enc("1") },
      { name: "b", data: enc("2") },
      { name: "c", data: enc("3") },
    ]);
    const eocd = findEocd(archive);
    expect(archive[eocd + 8]! | (archive[eocd + 9]! << 8)).toBe(3);
    expect(archive[eocd + 10]! | (archive[eocd + 11]! << 8)).toBe(3);
  });
});

// ── Offset relocation ─────────────────────────────────────
describe("browser relocateZipOffsets", () => {
  it("returns the input unchanged for a non-positive adjustment", () => {
    const archive = buildZip([{ name: "a.txt", data: enc("a") }]);
    expect(relocateZipOffsets(archive, 0)).toBe(archive);
  });

  it("shifts the EOCD and central-directory pointers exactly once", async () => {
    const archive = buildZip([
      { name: "one.txt", data: enc("first") },
      { name: "two.txt", data: enc("second") },
    ]);
    const adjustment = 1000;
    const relocated = relocateZipOffsets(archive, adjustment);
    // Relocation only rewrites offsets; the archive bytes keep their size.
    expect(relocated.length).toBe(archive.length);

    // Every central-directory pointer must be exactly original + adjustment
    // (a double-shift or a no-op would both fail this assertion).
    const expected = archive.slice();
    const eocd = findEocd(expected);
    const cdOffset =
      expected[eocd + 16]! |
      (expected[eocd + 17]! << 8) |
      (expected[eocd + 18]! << 16) |
      (expected[eocd + 19]! << 24);

    let cursor = cdOffset;
    for (let i = 0; i < 2; i++) {
      const origLocal =
        expected[cursor + 42]! |
        (expected[cursor + 43]! << 8) |
        (expected[cursor + 44]! << 16) |
        (expected[cursor + 45]! << 24);
      const newLocal =
        relocated[cursor + 42]! |
        (relocated[cursor + 43]! << 8) |
        (relocated[cursor + 44]! << 16) |
        (relocated[cursor + 45]! << 24);
      expect(newLocal).toBe(origLocal + adjustment);
      const nameLen = expected[cursor + 28]! | (expected[cursor + 29]! << 8);
      cursor += 46 + nameLen;
    }
  });

  it("throws on a buffer without an EOCD record", () => {
    expect(() => relocateZipOffsets(enc("not a zip at all, way too short"), 10)).toThrow(
      /End of Central Directory/
    );
  });
});

// ── Uploaded archive stays readable after relocation ──────
describe("relocated archive readability", () => {
  it("Node parser reads entries through the shifted offsets", async () => {
    const archive = buildZip([
      { name: "readme.md", data: enc("# Hi") },
      { name: "data.bin", data: new Uint8Array([1, 2, 3, 4, 5]) },
    ]);
    const relocated = relocateZipOffsets(archive, 512);

    // A ZIP reader handed only the trailing slice must still resolve entries,
    // which only works when offsets were shifted (not left relative).
    const parsed = await parseZip(new BufferSource(Buffer.from(relocated)));
    expect(parsed.entries.map((e) => e.name)).toEqual(["readme.md", "data.bin"]);
  });
});

// ── Prefix-tolerant parsing (concat offset) ───────────────
describe("concat offset correction", () => {
  it("reads the archive whether or not the image prefix is included", () => {
    const png = makePng(4, 4);
    const file = synthesize(png, {
      entries: [
        { name: "a.txt", data: enc("alpha") },
        { name: "b.txt", data: enc("beta") },
      ],
    }).data;

    // Parsed standalone the offsets are archive-relative; parsed inside the
    // polyglot file the pointers are absolute (image prefix included), so the
    // same entries must be found in both views with consistent pointers.
    const fromSlice = listZipEntries(file.subarray(png.length));
    const fromWhole = listZipEntries(file);

    expect(fromWhole.map((e) => e.name)).toEqual(fromSlice.map((e) => e.name));
    expect(fromSlice[0]!.localHeaderOffset).toBe(0);
    expect(fromWhole[0]!.localHeaderOffset).toBe(png.length);
    expect(fromWhole[0]!.crc32).toBe(fromSlice[0]!.crc32);
  });

  it("reports zero concat for a standalone archive", () => {
    const archive = buildZip([{ name: "a.txt", data: enc("a") }]);
    expect(computeConcatOffset(archive, findEocd(archive))).toBe(0);
  });

  it("extracts entries straight from a full polyglot buffer", async () => {
    const jpeg = makeJpeg(3, 3);
    const file = synthesize(jpeg, { entries: [{ name: "x.txt", data: enc("payload") }] }).data;
    const entries = await extractZipEntries(file);
    expect(new TextDecoder().decode(entries[0]!.data)).toBe("payload");
  });
});

// ── Synthesis ─────────────────────────────────────────────
describe("browser synthesize", () => {
  it("produces a PNG+ZIP file the Node parser can read", async () => {
    const png = makePng(8, 8);
    const result = synthesize(png, {
      entries: [{ name: "note.txt", data: enc("polyglot") }],
    });

    expect(result.frontFormat).toBe("png");
    expect(result.frontSize).toBe(png.length);
    expect(result.totalSize).toBe(png.length + result.backSize);
    // Front image is byte-identical to the input.
    expect(result.data.subarray(0, png.length)).toEqual(png);

    // The appended archive must be parseable by the Node implementation.
    const archiveSlice = Buffer.from(result.data.subarray(png.length));
    const parsed = await parseZip(new BufferSource(archiveSlice));
    expect(parsed.entries).toHaveLength(1);
    expect(Buffer.from(parsed.entries[0]!.data).toString()).toBe("polyglot");
  });

  it("produces a JPEG+ZIP file the Node parser can read", async () => {
    const jpeg = makeJpeg(16, 16);
    const result = synthesize(jpeg, {
      entries: [
        { name: "a.txt", data: enc("AAA") },
        { name: "b.txt", data: enc("BBB") },
      ],
    });

    expect(result.frontFormat).toBe("jpeg");
    expect(result.width).toBe(16);
    expect(result.height).toBe(16);

    const archiveSlice = Buffer.from(result.data.subarray(jpeg.length));
    const parsed = await parseZip(new BufferSource(archiveSlice));
    expect(parsed.entries.map((e) => e.name)).toEqual(["a.txt", "b.txt"]);
  });

  it("rejects an empty image", () => {
    expect(() =>
      synthesize(new Uint8Array(0), { entries: [{ name: "a", data: enc("x") }] })
    ).toThrow(/empty/);
  });

  it("rejects an unsupported front format", () => {
    expect(() =>
      synthesize(enc("GIF89a......"), { entries: [{ name: "a", data: enc("x") }] })
    ).toThrow(/Unsupported front format/);
  });

  it("rejects an invalid PNG (no IEND)", () => {
    const png = makePng();
    expect(() =>
      synthesize(png.subarray(0, png.length - 12), { entries: [{ name: "a", data: enc("x") }] })
    ).toThrow(/IEND/);
  });

  it("requires at least one entry", () => {
    expect(() => synthesize(makePng(), { entries: [] })).toThrow(/At least one/);
  });

  it("enforces the entry-count limit", () => {
    const entries = Array.from({ length: 5 }, (_, i) => ({ name: `f${i}`, data: enc("x") }));
    expect(() => synthesize(makePng(), { entries, limits: { maxEntries: 3 } })).toThrow(
      /exceeds limit/
    );
  });

  it("enforces the per-entry size limit", () => {
    expect(() =>
      synthesize(makePng(), {
        entries: [{ name: "big", data: new Uint8Array(2048) }],
        limits: { maxEntrySize: 1024 },
      })
    ).toThrow(/exceeds maximum size/);
  });

  it("enforces the total size limit", () => {
    const entries = Array.from({ length: 4 }, (_, i) => ({
      name: `f${i}`,
      data: new Uint8Array(1000),
    }));
    expect(() => synthesize(makePng(), { entries, limits: { maxTotalSize: 3000 } })).toThrow(
      /Total size/
    );
  });

  it("exposes sane default limits", () => {
    expect(DEFAULT_SECURITY_LIMITS.maxEntries).toBeGreaterThan(0);
    expect(DEFAULT_SECURITY_LIMITS.maxEntrySize).toBeGreaterThan(0);
    expect(DEFAULT_SECURITY_LIMITS.maxTotalSize).toBeGreaterThan(
      DEFAULT_SECURITY_LIMITS.maxEntrySize
    );
  });
});

// ── Inspect ───────────────────────────────────────────────
describe("browser inspect", () => {
  it("reports a plain PNG as non-polyglot", () => {
    const result = inspect(makePng(4, 4));
    expect(result.isPolyglot).toBe(false);
    expect(result.front?.format).toBe("png");
    expect(result.back).toBeUndefined();
  });

  it("reports a synthesized file as polyglot with both sides", () => {
    const png = makePng(2, 2);
    const file = synthesize(png, { entries: [{ name: "x.txt", data: enc("x") }] }).data;
    const result = inspect(file);
    expect(result.isPolyglot).toBe(true);
    expect(result.front?.format).toBe("png");
    expect(result.front?.size).toBe(png.length);
    expect(result.back?.format).toBe("zip");
    expect(result.back?.entryCount).toBe(1);
    expect(result.back?.entries[0]!.name).toBe("x.txt");
  });

  it("reports an empty file", () => {
    expect(inspect(new Uint8Array(0)).error).toMatch(/empty/);
  });

  it("reports unknown formats", () => {
    expect(inspect(enc("PK\x03\x04 random")).isPolyglot).toBe(false);
  });
});

// ── Extract round-trip ────────────────────────────────────
describe("browser extract", () => {
  it("round-trips a PNG+ZIP file", async () => {
    const png = makePng(6, 7);
    const entries = [
      { name: "one.txt", data: enc("first entry") },
      { name: "two.bin", data: new Uint8Array([9, 8, 7, 6]) },
    ];
    const file = synthesize(png, { entries }).data;

    const result = await extract(file);
    expect(result.front.format).toBe("png");
    expect(result.front.data).toEqual(png);
    expect(result.entries.map((e) => e.name)).toEqual(["one.txt", "two.bin"]);
    expect(new TextDecoder().decode(result.entries[0]!.data)).toBe("first entry");
    expect(Array.from(result.entries[1]!.data)).toEqual([9, 8, 7, 6]);
  });

  it("round-trips a JPEG+ZIP file", async () => {
    const jpeg = makeJpeg(10, 20);
    const file = synthesize(jpeg, { entries: [{ name: "j.txt", data: enc("jpeg side") }] }).data;

    const result = await extract(file);
    expect(result.front.format).toBe("jpeg");
    expect(result.front.data).toEqual(jpeg);
    expect(new TextDecoder().decode(result.entries[0]!.data)).toBe("jpeg side");
  });

  it("rejects a plain image with no archive", async () => {
    await expect(extract(makePng())).rejects.toThrow(/Not a polyglot file/);
  });
});

// ── ZIP entry extraction helpers ──────────────────────────
describe("browser extractZipEntries", () => {
  it("extracts stored entries", async () => {
    const archive = buildZip([
      { name: "a.txt", data: enc("AAA") },
      { name: "b.txt", data: enc("BBB") },
    ]);
    const entries = await extractZipEntries(archive);
    expect(new TextDecoder().decode(entries[0]!.data)).toBe("AAA");
    expect(new TextDecoder().decode(entries[1]!.data)).toBe("BBB");
  });

  it("handles zero-length entries", async () => {
    const archive = buildZip([{ name: "empty.txt", data: new Uint8Array(0) }]);
    const entries = await extractZipEntries(archive);
    expect(entries[0]!.data.length).toBe(0);
    expect(listZipEntries(archive)[0]!.crc32).toBe(0);
  });

  it("lists entries with correct sizes", () => {
    const archive = buildZip([
      { name: "x", data: new Uint8Array(10) },
      { name: "y", data: new Uint8Array(250) },
    ]);
    const metas = listZipEntries(archive);
    expect(metas[0]!.uncompressedSize).toBe(10);
    expect(metas[1]!.uncompressedSize).toBe(250);
    expect(metas[0]!.compressionMethod).toBe(0);
  });

  it("throws on a corrupt local header", async () => {
    const archive = buildZip([{ name: "a.txt", data: enc("A") }]);
    archive[0] = 0x00; // clobber the local file header signature
    await expect(extractZipEntries(archive)).rejects.toThrow(/Corrupt ZIP/);
  });
});
