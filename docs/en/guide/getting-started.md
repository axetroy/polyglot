# Getting Started

## What is a polyglot file?

A polyglot file **simultaneously satisfies two format specifications**: in this project, the output is a single file that looks like a valid **PNG or JPEG** image and also contains a valid **ZIP archive** inside.

- Image viewers parse until the PNG `IEND` chunk or JPEG `EOI` marker and stop — trailing bytes are ignored.
- ZIP parsers search backward from the file tail for the EOCD record and read forward from there.
- The two readers look in opposite directions, so they coexist without interference.

## Installation

```bash
npm install @polyglot/sdk
```

Or use the CLI directly:

```bash
npm install -g @polyglot/cli
```

## Quick start

### In code

```typescript
import { polyglot } from "@polyglot/sdk";

// Build: embed a ZIP archive inside a PNG image
const file = await polyglot.create({
  front: "./photo.png",
  back: {
    format: "zip",
    entries: [
      { name: "readme.txt", data: Buffer.from("Hello, world") },
      { name: "secret.json", data: Buffer.from('{"key":"value"}') },
    ],
  },
});

await file.write("output.png");
```

The generated `output.png` opens normally in any image viewer, and `unzip output.png` extracts both files.

### Inspect a file

```typescript
const info = await polyglot.inspect("output.png");

if (info.polyglot) {
  console.log("front:", info.front?.format, info.front?.size, "bytes");
  console.log("back:", info.back?.format, info.back?.entries, "entries");
}
```

### Extract the archive

```typescript
const back = await polyglot.openBack("output.png");
const names = await back.list();
// ['readme.txt', 'secret.json']

const content = await back.read("readme.txt");
console.log(content.toString()); // Hello, world
```

### Read only the image

```typescript
const front = await polyglot.openFront("output.png");
console.log(front.format); // 'png'
console.log(front.size); // bytes of the image portion only

for await (const chunk of front.stream()) {
  // stream the clean image data (archive excluded)
}
```

## Command-line usage

```bash
# Build
polyglot create -f photo.png -o output.png \
  -e readme.txt -e secret.json

# Inspect
polyglot inspect output.png

# List archive entries
polyglot list output.png

# Extract
polyglot extract output.png -d ./out
```

## Browser playground

No installation required — try everything in your browser. All processing happens locally; no files are uploaded to any server.

- **Create**: upload an image + add entries → generate a polyglot file → single-file download
- **Inspect**: upload a polyglot file → preview the image + list archive entries → download individual files or **package as a standard ZIP**

[Open Playground →](/en/playground)

## Next steps

- [How it works](/en/guide/how-it-works) — offset relocation and the compatibility matrix
- [API reference](/en/guide/api) — complete interface definitions
- [Security model](/en/guide/security) — extraction limits and path-traversal defense
