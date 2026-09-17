import { describe, it, expect } from "vitest";
import { synthesize } from "@polyglot/browser";
import { parseZip } from "@polyglot/formats-zip";
import { BufferSource } from "@polyglot/binary";

const enc = (s: string) => new TextEncoder().encode(s);

function makePng() {
  const sig = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  function chunk(type: string, data: Uint8Array): Uint8Array {
    const t = new TextEncoder().encode(type);
    const out = new Uint8Array(4 + t.length + data.length + 4);
    new DataView(out.buffer).setUint32(0, data.length);
    out.set(t, 4);
    out.set(data, 4 + t.length);
    return out;
  }
  const ihdr = new Uint8Array(13);
  new DataView(ihdr.buffer).setUint32(0, 1);
  new DataView(ihdr.buffer).setUint32(4, 1);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const idat = new Uint8Array([0x78, 0x9c, 0x63, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01]);
  const png = new Uint8Array(
    sig.length +
      chunk("IHDR", ihdr).length +
      chunk("IDAT", idat).length +
      chunk("IEND", new Uint8Array(0)).length
  );
  let off = 0;
  png.set(sig, off);
  off += sig.length;
  png.set(chunk("IHDR", ihdr), off);
  off += chunk("IHDR", ihdr).length;
  png.set(chunk("IDAT", idat), off);
  off += chunk("IDAT", idat).length;
  png.set(chunk("IEND", new Uint8Array(0)), off);
  return png;
}

describe("polyglot ZIP parsing", () => {
  it("parseZip reads entries from the full polyglot buffer", async () => {
    const png = makePng();
    const result = synthesize(png, {
      entries: [
        { name: "hello.txt", data: enc("Hello") },
        { name: "world.txt", data: enc("World") },
      ],
    });
    const file = result.data;

    // Parsing the FULL file (as archive software would do after renaming to .zip)
    const parsed = await parseZip(new BufferSource(file));
    expect(parsed.entries).toHaveLength(2);
    expect(parsed.entries[0].name).toBe("hello.txt");
    expect(parsed.entries[1].name).toBe("world.txt");
    expect(new TextDecoder().decode(parsed.entries[0].data)).toBe("Hello");
    expect(new TextDecoder().decode(parsed.entries[1].data)).toBe("World");
  });

  it("parseZip still works on a standalone ZIP (no prefix)", async () => {
    const { buildZip } = await import("@polyglot/formats-zip");
    const archive = buildZip([{ name: "standalone.txt", data: enc("data") }]);
    const parsed = await parseZip(new BufferSource(archive));
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0].name).toBe("standalone.txt");
    expect(new TextDecoder().decode(parsed.entries[0].data)).toBe("data");
  });
});
