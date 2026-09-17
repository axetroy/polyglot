import { describe, it, expect } from "vitest";
import { buildZip, relocateZipOffsets, parseZip, findEocd } from "@polyglot/formats-zip";
import { BufferSource } from "@polyglot/binary";

describe("buildZip", () => {
  it("should create a valid ZIP archive", async () => {
    const buffer = buildZip([
      { name: "hello.txt", data: Buffer.from("Hello World") },
      { name: "data.json", data: Buffer.from('{"key":"value"}') },
    ]);

    expect(buffer.length).toBeGreaterThan(0);

    // Parse it back
    const archive = await parseZip(new BufferSource(buffer));
    expect(archive.entries).toHaveLength(2);
    expect(archive.entries[0].name).toBe("hello.txt");
    expect(new TextDecoder().decode(archive.entries[0].data)).toBe("Hello World");
    expect(archive.entries[1].name).toBe("data.json");
  });

  it("should compute correct CRC32", async () => {
    const buffer = buildZip([{ name: "test.txt", data: Buffer.from("test") }]);

    const archive = await parseZip(new BufferSource(buffer));
    expect(archive.entries[0].crc32).toBeGreaterThan(0);
  });
});

describe("relocateZipOffsets", () => {
  it("should shift all offsets by adjustment", async () => {
    const original = buildZip([{ name: "file.txt", data: Buffer.from("content") }]);

    const adjusted = relocateZipOffsets(original, 1000);

    // Relocation only rewrites offsets; the archive keeps its own size.
    expect(adjusted.length).toBe(original.length);

    // Parse the adjusted ZIP
    const archive = await parseZip(new BufferSource(adjusted));
    expect(archive.entries).toHaveLength(1);
    expect(archive.entries[0].name).toBe("file.txt");
    expect(new TextDecoder().decode(archive.entries[0].data)).toBe("content");
  });

  it("should not modify buffer when adjustment is 0", () => {
    const buffer = Buffer.from([1, 2, 3]);
    const result = relocateZipOffsets(buffer, 0);
    expect(result).toBe(buffer);
  });
});

describe("third-party layout contract", () => {
  it("recorded central-directory offset points at the CD signature (no padding)", async () => {
    const prefix = Buffer.alloc(461, 0xab); // stand-in for a front image
    const zip = buildZip([
      { name: "a.txt", data: Buffer.from("aaa") },
      { name: "b.txt", data: Buffer.from("bbb") },
    ]);
    const relocated = relocateZipOffsets(zip, prefix.length);
    const polyglot = Buffer.concat([prefix, relocated]);

    // A spec-literal reader seeks to the recorded CD offset and expects the
    // central-directory signature there. This is what Windows Explorer-style
    // readers do; a padded (double-prefix) archive fails this check.
    const eocd = findEocd(polyglot);
    expect(eocd).toBeGreaterThanOrEqual(0);
    const cdOffset = polyglot.readUInt32LE(eocd + 16);
    expect(polyglot.subarray(cdOffset, cdOffset + 4).toString("hex")).toBe("504b0102");
    // And the first local header sits exactly at the end of the prefix.
    const entries = await parseZip(new BufferSource(polyglot));
    expect(entries.entries.map((e) => e.name)).toEqual(["a.txt", "b.txt"]);
  });

  it("flags non-ASCII entry names as UTF-8 (general purpose bit 11)", async () => {
    const zip = buildZip([
      { name: "中文文档.txt", data: Buffer.from("内容") },
      { name: "plain.txt", data: Buffer.from("x") },
    ]);
    const parsed = await parseZip(new BufferSource(zip));
    expect(parsed.centralDir[0]!.flags & 0x0800).toBe(0x0800);
    expect(parsed.centralDir[1]!.flags & 0x0800).toBe(0);
    expect(parsed.entries[0]!.name).toBe("中文文档.txt");
  });
});

describe("parseZip", () => {
  it("should parse a minimal ZIP", async () => {
    const buffer = buildZip([{ name: "empty.txt", data: Buffer.from("") }]);

    const archive = await parseZip(new BufferSource(buffer));
    expect(archive.entries).toHaveLength(1);
    expect(archive.entries[0].name).toBe("empty.txt");
    expect(archive.entries[0].data).toHaveLength(0);
  });

  it("should detect EOCD correctly", async () => {
    const buffer = buildZip([
      { name: "a.txt", data: Buffer.from("a") },
      { name: "b.txt", data: Buffer.from("b") },
      { name: "c.txt", data: Buffer.from("c") },
    ]);

    const archive = await parseZip(new BufferSource(buffer));
    expect(archive.entries).toHaveLength(3);
  });
});
