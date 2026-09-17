# API Reference

## Package layout

| Package                  | Purpose                                              |
| ------------------------ | ---------------------------------------------------- |
| `@polyglot/sdk`          | Pre-registered adapter entry point (recommended)     |
| `@polyglot/core`         | Engine core: registry, compatibility rules, detector |
| `@polyglot/binary`       | Binary source abstraction (path / Buffer / stream)   |
| `@polyglot/formats-png`  | PNG front-end adapter                                |
| `@polyglot/formats-jpeg` | JPEG front-end adapter                               |
| `@polyglot/formats-zip`  | ZIP back-end adapter                                 |
| `@polyglot/cli`          | CLI tooling                                          |
| `@polyglot/browser`      | Browser-side pure Uint8Array implementation          |

## `@polyglot/sdk`

```typescript
import { polyglot } from "@polyglot/sdk";
```

`sdk` exports a `PolyglotEngine` instance pre-registered with PNG, JPEG, and ZIP adapters.

### `polyglot.create(options)`

Combine a front image with a back archive into one polyglot file.

```typescript
const file = await polyglot.create({
  front: "./photo.png",
  back: {
    format: "zip",
    entries: [
      { name: "readme.txt", data: Buffer.from("hello") },
      { name: "blob.bin", data: someBuffer },
    ],
  },
});
```

| Option         | Type                               | Description                                  |
| -------------- | ---------------------------------- | -------------------------------------------- |
| `front`        | `string \| Buffer \| BinarySource` | Front image — path, buffer, or binary source |
| `back.format`  | `string`                           | Archive format identifier; currently `'zip'` |
| `back.entries` | `ArchiveEntry[]`                   | Archive entries, each with `name` and `data` |

Returns a `PolyglotFile`:

| Method        | Return                  | Description                        |
| ------------- | ----------------------- | ---------------------------------- |
| `write(path)` | `Promise<void>`         | Write to disk                      |
| `getBuffer()` | `Buffer`                | Get the full byte buffer in memory |
| `getInfo()`   | `Promise<PolyglotInfo>` | Get metadata about both sides      |

Failure modes: `Unsupported front format` when the front is unregistered; `Unsupported back format` when the back is unregistered; `IncompatibleFormatError` when the pair is marked unsupported.

### `polyglot.inspect(source)`

Check whether a file is polyglot and read both sides.

```typescript
const info = await polyglot.inspect("output.png");

// {
//   polyglot: true,
//   front: { format: 'png', size: 66, info: {...} },
//   back:  { format: 'zip', size: 175, entries: 2 }
// }
```

| Parameter | Type               |
| --------- | ------------------ |
| `source`  | `string \| Buffer` |

Returns `PolyglotInfo`. The `front` / `back` keys are omitted when not present.

### `polyglot.detect(source)`

Lightweight detection — only reads signatures, no parsing.

```typescript
const result = await polyglot.detect("output.png");
// { isPolyglot: true, front: { format: 'png' }, back: { format: 'zip' } }
```

Returns `DetectionResult`.

### `polyglot.openFront(source)`

Open only the front image, ignoring the archive portion.

```typescript
const front = await polyglot.openFront("output.png");
console.log(front.format); // 'png'
console.log(front.size); // image bytes only

for await (const chunk of front.stream()) {
  // stream the image
}
```

Returns `OpenFrontResult`: `{ format, size, stream() }`. Throws `InvalidFrontError` for non-polyglot files.

### `polyglot.openBack(source)`

Open only the back archive.

```typescript
const back = await polyglot.openBack("output.png");
await back.list(); // ['readme.txt', 'blob.bin']
await back.read("readme.txt"); // Buffer
```

Returns `OpenBackResult`: `{ format, list(), read(name) }`. Throws `InvalidArchiveError` for non-polyglot files.

## `@polyglot/core`

Use the engine directly when custom adapters are needed:

```typescript
import { PolyglotEngine } from "@polyglot/core";
import { pngAdapter } from "@polyglot/formats-png";
import { zipAdapter } from "@polyglot/formats-zip";

const engine = new PolyglotEngine();

engine.registerFront(pngAdapter);
engine.registerBack(zipAdapter);
engine.registerCompatibility("png", "zip", true, "relocated");
```

| Method                                                | Description                                 |
| ----------------------------------------------------- | ------------------------------------------- |
| `registerFront(adapter)`                              | Register a front-end (image) adapter        |
| `registerBack(adapter)`                               | Register a back-end (archive) adapter       |
| `registerCompatibility(front, back, supported, mode)` | Declare whether a pair is supported and how |

`mode` values: `'native'`, `'relocated'`, `'experimental'`, `'unsupported'`.

## `@polyglot/browser`

Browser-side API — pure `Uint8Array`, no Node dependency.

```typescript
import { synthesize, inspect, extract } from "@polyglot/browser";

const result = synthesize(pngBytes, {
  entries: [{ name: "a.txt", data: new TextEncoder().encode("hi") }],
});

result.data; // Uint8Array — complete polyglot file
result.frontSize; // image portion length
result.backSize; // archive portion length
result.frontFormat; // 'png' | 'jpeg'
```

### `synthesize(image, options)`

| Parameter         | Type                      | Description                        |
| ----------------- | ------------------------- | ---------------------------------- |
| `image`           | `Uint8Array`              | Front image bytes (PNG or JPEG)    |
| `options.entries` | `ZipEntryInput[]`         | Archive entries                    |
| `options.limits`  | `Partial<SecurityLimits>` | Override the default security caps |

Returns `{ data, frontFormat, frontSize, backSize, totalSize, entryCount, width, height }`.

### `inspect(data)`

Returns `{ isPolyglot, front?, back?, error? }`. Unrecognized front formats surface in `error`.

### `extract(data)`

Split back into image and archive:

```typescript
const { front, entries } = await extract(fileBytes);
// front: { format, data }
// entries: [{ name, data }]
```

> Reading DEFLATE-compressed entries requires the platform `DecompressionStream`; this library only produces STORED entries, so that API is not needed for standard use.

### Security limits

```typescript
import { DEFAULT_SECURITY_LIMITS } from "@polyglot/browser";

DEFAULT_SECURITY_LIMITS.maxEntries; // 10000
DEFAULT_SECURITY_LIMITS.maxEntrySize; // 1 GiB
DEFAULT_SECURITY_LIMITS.maxTotalSize; // 10 GiB
```

## CLI

```bash
polyglot create -f <front> -o <output> [-e <entry>...]
polyglot inspect <file>
polyglot list <file>
polyglot extract <file> [-d <dir>]
```

| Command   | Description                                          |
| --------- | ---------------------------------------------------- |
| `create`  | Build a polyglot file                                |
| `inspect` | Inspect a file and print both sides                  |
| `list`    | List archive entries                                 |
| `extract` | Extract the archive (with path-traversal protection) |

## Error types

| Error                      | When thrown                        |
| -------------------------- | ---------------------------------- |
| `Unsupported front format` | Front format not registered        |
| `Unsupported back format`  | Back format not registered         |
| `IncompatibleFormatError`  | Pair explicitly marked unsupported |
| `InvalidFrontError`        | Cannot parse a valid front image   |
| `InvalidArchiveError`      | Cannot parse a valid archive       |
| `PolyglotError`            | Base class for all of the above    |
