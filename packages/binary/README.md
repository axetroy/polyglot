# @polyglot/binary

底层二进制 I/O 抽象层 — 统一的读取源、读写器，以及所有格式适配器共享的接口契约。

## 安装

本包是 monorepo 内部包（`private: true`），通过 npm workspaces 直接引用：

```json
{ "dependencies": { "@polyglot/binary": "*" } }
```

## 核心概念：`BinarySource`

引擎不关心数据来自磁盘、内存还是网络流，一切统一为 `BinarySource`：

```typescript
interface BinarySource {
  size(): Promise<number>;
  read(offset: number, length: number): Promise<Buffer>;
  stream?(start?: number, end?: number): AsyncIterable<Buffer>;
}
```

内置三种实现：

| 类             | 适用场景               | 是否惰性读取      |
| -------------- | ---------------------- | ----------------- |
| `PathSource`   | 磁盘文件（大文件首选） | ✅ 按需 `fs` 读取 |
| `BufferSource` | 已在内存中的数据       | ❌ 零拷贝切片     |
| `StreamSource` | 网络流 / `Readable`    | ⚠️ 首次读取时缓冲 |

```typescript
import { PathSource, BufferSource, StreamSource, toSource, readAll } from "@polyglot/binary";

const a = new PathSource("./image.png");
const b = new BufferSource(buf);
const c = new StreamSource(readableStream);

// 智能归一：string → PathSource，Buffer → BufferSource，其余原样返回
const src = toSource("./image.png");

// 一次性读全部内容
const all = await readAll(src);
```

## `BinaryReader` / `BinaryWriter`

游标式顺序读写，避免手工计算偏移：

```typescript
import { BinaryReader, BinaryWriter } from "@polyglot/binary";

const reader = new BinaryReader(source);
await reader.readUInt32LE(); // 读 4 字节小端，游标自动前进
await reader.readUInt16BE();
reader.seek(128); // 绝对定位
reader.skip(4); // 相对跳过
reader.tell(); // 当前游标
reader.position; // 同上（getter）

const writer = new BinaryWriter();
writer.writeUInt32LE(0x04034b50);
writer.writeBuffer(payload);
writer.writeString("name");
writer.writePaddingAligned(16); // 对齐填充，返回填充字节数
const out = writer.getBuffer();
```

## 适配器接口契约

`FrontAdapter` / `BackAdapter` / `ArchiveEntry` 均在此定义，供 `@polyglot/core` 与各格式包实现：

```typescript
interface FrontAdapter {
  id: string;
  detect(source: BinarySource): Promise<boolean>;
  inspect(source: BinarySource): Promise<unknown>;
  validate(source: BinarySource): Promise<{ valid: boolean; error?: string }>;
  getLayout(info: unknown): Promise<unknown>;
}

interface BackAdapter {
  id: string;
  create(entries: ArchiveEntry[]): Promise<Buffer>;
  inspect(source: BinarySource): Promise<unknown>;
  parse(source: BinarySource): Promise<unknown>;
}

interface ArchiveEntry {
  name: string;
  data: Buffer;
}
```

## 依赖关系

无外部依赖。位于依赖图最底层，被所有其它 `@polyglot/*` 包引用。

## 开发

```bash
npm run build -w @polyglot/binary    # tsup → dist (ESM + dts)
npm run typecheck -w @polyglot/binary
npm test                              # 根目录，覆盖 tests/binary/
```
