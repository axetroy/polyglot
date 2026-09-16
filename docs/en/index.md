---
layout: home

hero:
  name: Polyglot
  text: One file, two formats
  tagline: Embed a ZIP archive inside a PNG or JPEG — image viewers show the picture, archive tools read the payload.
  actions:
    - theme: brand
      text: Getting Started
      link: /en/guide/getting-started
    - theme: alt
      text: Playground
      link: /en/playground
    - theme: alt
      text: GitHub
      link: https://github.com/axetroy/polyglot

features:
  - icon: 🖼️
    title: Byte-perfect front image
    details: The image bytes are preserved verbatim — no re-encoding, no metadata loss, no color-space changes.
  - icon: 📦
    title: Valid ZIP archive
    details: Standard STORED entries that unzip, Python zipfile, and 7-Zip can read out of the box.
  - icon: 🔐
    title: Built-in safeguards
    details: Entry-count, per-entry-size, and total-size caps, plus path-traversal protection to prevent zip-slip attacks.
  - icon: 🌐
    title: Browser-capable
    details: Pure Uint8Array implementation with no Node Buffer dependency; the playground runs entirely client-side.
  - icon: 🧩
    title: Pluggable adapters
    details: Front and back formats register independently — add a new format without touching the engine core.
  - icon: 📘
    title: TypeScript-first
    details: Full type definitions, native ESM, compatible with tree-shaking bundlers and Node 20+.
---
