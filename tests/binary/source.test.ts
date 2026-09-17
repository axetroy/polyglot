import { describe, it, expect } from "vitest";
import { PathSource, BufferSource, readAll } from "@polyglot/binary";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe("PathSource", () => {
  it("should read file contents", async () => {
    const src = new PathSource(join(__dirname, "source.test.ts"));
    const size = await src.size();
    expect(size).toBeGreaterThan(0);

    const chunk = await src.read(0, 10);
    expect(chunk.length).toBe(10);
  });
});

describe("BufferSource", () => {
  it("should read from buffer", async () => {
    const data = Buffer.from("hello world");
    const src = new BufferSource(data);
    expect(await src.size()).toBe(11);
    const chunk = await src.read(0, 5);
    expect(Array.from(chunk)).toEqual([104, 101, 108, 108, 111]);
  });
});

describe("readAll", () => {
  it("should read all bytes", async () => {
    const data = Buffer.from([1, 2, 3, 4, 5]);
    const src = new BufferSource(data);
    const result = await readAll(src);
    expect(Array.from(result)).toEqual([1, 2, 3, 4, 5]);
  });
});
