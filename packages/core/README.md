# @polyglot/core

Polyglot 引擎核心 — 格式注册表、兼容性路由、格式探测、以及编排前端与后端适配器的 `PolyglotEngine`。

## 安装

```json
{ "dependencies": { "@polyglot/core": "*" } }
```

通常不需要直接使用本包 — `@polyglot/sdk` 已预配置好 PNG/JPEG + ZIP。仅当需要注册自定义格式时直接依赖本包。

## `PolyglotEngine`

```typescript
import { PolyglotEngine } from '@polyglot/core';

const engine = new PolyglotEngine();

// 1. 注册适配器
engine.registerFront(pngAdapter);
engine.registerBack(zipAdapter);

// 2. 声明兼容规则（缺省视为不支持）
engine.registerCompatibility('png', 'zip', true, 'relocated');
```

### 方法一览

| 方法 | 说明 |
|---|---|
| `create(options)` | 合成 polyglot 文件，返回 `PolyglotFile` |
| `inspect(source)` | 返回 `PolyglotInfo`（前端尺寸/元数据 + 后端条目数） |
| `detect(source)` | 轻量探测，仅返回格式名，不解析元数据 |
| `openFront(source)` | 打开前端，返回可 `stream()` 的句柄 |
| `openBack(source)` | 打开后端归档，返回 `list()` / `read()` |
| `registerFront` / `registerBack` / `registerCompatibility` | 注册 |

### 创建文件

```typescript
const file = await engine.create({
  front: './image.png',          // string | Buffer | BinarySource
  back: {
    format: 'zip',
    entries: [{ name: 'readme.txt', data: Buffer.from('hello') }],
  },
});

await file.write('./polyglot.png');   // 写盘
file.getBuffer();                     // 或取内存 Buffer
await file.getInfo();                 // PolyglotInfo
```

### 读取文件

```typescript
const info = await engine.inspect('./polyglot.png');
// { polyglot: true, front: { format: 'png', size: 61, info: {...} },
//   back: { format: 'zip', size: 179, entries: 1 } }

const front = await engine.openFront('./polyglot.png');
for await (const chunk of front.stream()) { /* 流式读取图片字节 */ }

const archive = await engine.openBack('./polyglot.png');
const names = await archive.list();
const data = await archive.read('readme.txt');
```

> **关键实现细节**：`openBack()` 会按前端尺寸切片后再交给后端解析器，因此 ZIP 的 EOCD 能在 polyglot 文件中正确定位。

## `FormatRegistry`

引擎内部的格式表，按 `id` 索引，兼容性规则以 `front:back` 为键。

```typescript
import { FormatRegistry } from '@polyglot/core';

const registry = new FormatRegistry();
registry.registerFront(pngAdapter);
registry.registerBack(zipAdapter);
registry.registerCompatibility({ front: 'png', back: 'zip', supported: true, mode: 'relocated' });

registry.getFront('png');                    // FrontAdapter | undefined
registry.getBack('zip');                     // BackAdapter | undefined
registry.getCompatibility('png', 'zip');     // CompatibilityRule | undefined
registry.getAllFronts();                     // FrontAdapter[]
registry.getAllBacks();                      // BackAdapter[]
```

## `CompatibilityEngine`

独立于注册表的兼容性查询器，适合在不构造完整引擎时做预校验：

```typescript
import { CompatibilityEngine } from '@polyglot/core';

const compat = new CompatibilityEngine();
compat.register({ front: 'png', back: 'zip', supported: true, mode: 'relocated' });

compat.isCompatible('png', 'zip');   // true
compat.isCompatible('png', 'tar');   // false —— 未注册即不支持
compat.getMode('png', 'zip');        // 'relocated'
compat.getAllRules();                // CompatibilityRule[]
```

`FormatMode` 四种取值：

| mode | 含义 |
|---|---|
| `native` | 后端数据可原样嵌入，无需改动偏移 |
| `relocated` | 需要重定位内部偏移（当前 PNG/JPEG + ZIP 走的路径） |
| `experimental` | 允许但未验证 |
| `unsupported` | 拒绝，`detect()` 不会判定为 polyglot |

## `Detector`

负责「这是什么格式」以及「它是不是 polyglot」。遍历注册的前端适配器找到 `front`，按前端尺寸切片后遍历后端适配器找到 `back`，最后查兼容规则裁决。

## 安全限制

```typescript
import {
  DEFAULT_SECURITY_LIMITS,   // { maxEntries: 10_000, maxEntrySize: 1GB, maxTotalSize: 10GB }
  validateArchiveLimits,     // 按限额校验 entries，越界抛错
  sanitizeEntryPath,         // 拒绝 '..' 与绝对路径，统一分隔符为 '/'
  type ArchiveSecurityLimits,
} from '@polyglot/core';

sanitizeEntryPath('a/b.txt');        // 'a/b.txt'
sanitizeEntryPath('../../etc/passwd'); // throws
validateArchiveLimits(entries, DEFAULT_SECURITY_LIMITS);
```

## 错误类型

全部继承自 `PolyglotError`，便于统一 `catch`：

| 错误 | 触发场景 |
|---|---|
| `UnsupportedFormatError` | 前端格式未注册 |
| `IncompatibleFormatError` | 前后端组合无兼容规则或 `supported: false` |
| `InvalidFrontError` | 前端文件损坏 / 校验失败 |
| `InvalidArchiveError` | 后端归档无法解析 |
| `RelocationError` | 偏移重定位失败 |

```typescript
import { PolyglotError, UnsupportedFormatError } from '@polyglot/core';

try {
  await engine.create({ front: './x.webp', back: { format: 'zip', entries: [] } });
} catch (err) {
  if (err instanceof UnsupportedFormatError) { /* ... */ }
  if (err instanceof PolyglotError) { /* 兜底 */ }
}
```

## 开发

```bash
npm run build -w @polyglot/core
npm run typecheck -w @polyglot/core
npm test    # 覆盖 tests/compatibility/、tests/detector/、tests/integration/
```
