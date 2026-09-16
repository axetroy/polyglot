# @polyglot/formats-zip

ZIP 后端格式适配器 — 解析、构建、偏移重定位，以及安全校验。

## 安装

```json
{ "dependencies": { "@polyglot/formats-zip": "*" } }
```

## 导出

```typescript
import {
  ZipAdapter,       // 标准 BackAdapter 实现（id: 'zip'）
  zipAdapter,       // 预实例化的单例
  parseZip,         // 核心解析函数
  buildZip,         // 核心构建函数
  relocateZipOffsets, // 偏移重定位工具（供手动组合场景）
  computeCrc32,     // ZIP CRC-32 计算工具
  type ZipEntry,
  type ZipArchive,
  type ZipParseOptions,
  type ZipEntryData,
  type ZipBuildOptions,
} from '@polyglot/formats-zip';
```

## 安全限制（默认开启）

`parseZip()` 内置 Zip Bomb 防护：

```typescript
interface ZipParseOptions {
  maxEntries?: number;       // 默认 10_000
  maxEntrySize?: number;     // 默认 1 GB
  maxTotalSize?: number;     // 默认 10 GB
  sanitizePaths?: boolean;   // 默认 true —— 拒绝 '..' 与绝对路径
}
```

越界时抛错并明确说明原因（条目超限 / 单条过大 / 总大小超限 / 路径穿越）。

## `ZipAdapter`

实现 `@polyglot/binary.BackAdapter`，`id` 为 `'zip'`。

```typescript
interface BackAdapter {
  create(entries): Promise<Buffer>;
  inspect(source): Promise<{ format, size, entries }>;
  parse(source): Promise<ZipArchive>;
  getLayout(archive): Promise<ZipLayout>;
  relocate(buffer, prefixSize): Buffer;
  toSource(buffer): BinarySource;
  toPathSource(path): BinarySource;
}
```

- `create()` 调用 `buildZip()`；
- `parse()` 调用 `parseZip()`（传入默认安全限制）；
- `relocate()` 调用 `relocateZipOffsets()`；
- `toSource()` / `toPathSource()` 是 BinarySource 便捷构造器。

## 低阶函数

### `buildZip(entries, options?)`

从零构建 ZIP buffer（压缩方法固定为 deflate stored / 0，无加密）：

```typescript
const buf = buildZip([
  { name: 'a.txt', data: Buffer.from('hello') },
  { name: 'dir/b.bin', data: someBuffer },
]);
```

### `relocateZipOffsets(zip, adjustment)`

把 ZIP 的所有内部偏移（local header、central directory、EOCD）整体加上 `adjustment`，**不填充前置空格**——只修改字节偏移量。返回新 buffer。

用法：

```typescript
const zip = buildZip([{ name: 'f.txt', data: buf }]);
const relocated = relocateZipOffsets(zip, 61);  // 预留 61 字节前缀
const polyglot = Buffer.concat([pngHeader, relocated]);
```

### `parseZip(source, options?)`

解析 ZIP buffer（或任何 `BinarySource`），返回 `ZipArchive`：

```typescript
interface ZipArchive {
  entries: ZipEntry[];          // 已按 central dir 顺序排列
  centralDir: ZipCentralDirEntry[];
  eocd: ZipEndOfCentralDir;
  raw: Buffer;                  // 原始 ZIP 字节（不含前缀）
}

interface ZipEntry {
  name: string;
  data: Buffer;
  compressedSize: number;
  uncompressedSize: number;
  crc32: number;
  compressionMethod: number;
  localHeader: ZipLocalHeader;
  centralDirEntry: ZipCentralDirEntry;
}
```

## ZIP 格式内部约定

本包遵循以下偏移约定（小端 LE）：

| 字段 | Local File Header 偏移 | Central Dir 偏移 | EOCD 偏移 |
|---|---|---|---|
| signature | 0 | 0 | 0 |
| crc32 | 14 | 16 | — |
| compressed size | 18 | 20 | — |
| uncompressed size | 22 | 24 | — |
| file name length | 26 | 28 | — |
| extra field length | 28 | 30 | — |
| comment length | — | 32 | 20 |
| central dir offset | — | — | 16 |

## 开发

```bash
npm run build -w @polyglot/formats-zip
npm run typecheck -w @polyglot/formats-zip
npm test
```
