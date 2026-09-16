# API 参考

## 包结构

| 包名 | 说明 |
| --- | --- |
| `@polyglot/sdk` | 预配置好适配器的开箱即用入口（推荐） |
| `@polyglot/core` | 引擎核心：注册表、兼容性规则、检测器 |
| `@polyglot/binary` | 二进制源抽象（路径 / Buffer / 流） |
| `@polyglot/formats-png` | PNG 前端适配器 |
| `@polyglot/formats-jpeg` | JPEG 前端适配器 |
| `@polyglot/formats-zip` | ZIP 后端适配器 |
| `@polyglot/cli` | 命令行工具 |
| `@polyglot/browser` | 浏览器端纯 `Uint8Array` 实现 |

## `@polyglot/sdk`

```typescript
import { polyglot } from '@polyglot/sdk';
```

`sdk` 导出一个已注册 PNG、JPEG 适配器与 ZIP 后端适配器的 `PolyglotEngine` 实例。

### `polyglot.create(options)`

将前端图像与后端归档合成为一个 polyglot 文件。

```typescript
const file = await polyglot.create({
  front: './photo.png',
  back: {
    format: 'zip',
    entries: [
      { name: 'readme.txt', data: Buffer.from('hello') },
      { name: 'blob.bin', data: someBuffer },
    ],
  },
});
```

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `front` | `string \| Buffer \| BinarySource` | 前端图像，可为路径、内存数据或二进制源 |
| `back.format` | `string` | 后端格式标识，目前为 `'zip'` |
| `back.entries` | `ArchiveEntry[]` | 归档条目，每项含 `name` 与 `data` |

返回 `PolyglotFile`：

| 方法 | 返回 | 说明 |
| --- | --- | --- |
| `write(path)` | `Promise<void>` | 写出到磁盘 |
| `getBuffer()` | `Buffer` | 获取内存中的完整字节 |
| `getInfo()` | `Promise<PolyglotInfo>` | 获取元信息 |

失败情形：前端格式不在注册表中时抛 `Unsupported front format`；后端格式未注册时抛 `Unsupported back format`；兼容规则为 `unsupported` 时抛对应错误。

### `polyglot.inspect(source)`

检查一个文件是否为 polyglot，并返回两侧信息。

```typescript
const info = await polyglot.inspect('output.png');

// {
//   polyglot: true,
//   front: { format: 'png', size: 66, info: {...} },
//   back:  { format: 'zip', size: 175, entries: 2 }
// }
```

| 参数 | 类型 |
| --- | --- |
| `source` | `string \| Buffer` |

返回 `PolyglotInfo`：`polyglot` 为布尔标志，`front` / `back` 在对应部分不存在时省略。

### `polyglot.detect(source)`

轻量检测，只返回格式标识而不解析细节。

```typescript
const result = await polyglot.detect('output.png');
// { isPolyglot: true, front: { format: 'png' }, back: { format: 'zip' } }
```

返回 `DetectionResult`。

### `polyglot.openFront(source)`

只打开前端图像，忽略归档部分。

```typescript
const front = await polyglot.openFront('output.png');
console.log(front.format); // 'png'
console.log(front.size);   // 纯图像字节数

for await (const chunk of front.stream()) {
  // 流式读取
}
```

返回 `OpenFrontResult`：`{ format, size, stream() }`。非 polyglot 文件会抛 `InvalidFrontError`。

### `polyglot.openBack(source)`

只打开后端归档。

```typescript
const back = await polyglot.openBack('output.png');
await back.list();              // ['readme.txt', 'blob.bin']
await back.read('readme.txt');  // Buffer
```

返回 `OpenBackResult`：`{ format, list(), read(name) }`。非 polyglot 文件会抛 `InvalidArchiveError`。

## `@polyglot/core`

需要自定义适配器时直接使用引擎：

```typescript
import { PolyglotEngine } from '@polyglot/core';
import { pngAdapter } from '@polyglot/formats-png';
import { zipAdapter } from '@polyglot/formats-zip';

const engine = new PolyglotEngine();

engine.registerFront(pngAdapter);   // 注册前端适配器
engine.registerBack(zipAdapter);    // 注册后端适配器
engine.registerCompatibility('png', 'zip', true, 'relocated');
```

| 方法 | 说明 |
| --- | --- |
| `registerFront(adapter)` | 注册前端（图像）适配器 |
| `registerBack(adapter)` | 注册后端（归档）适配器 |
| `registerCompatibility(front, back, supported, mode)` | 声明格式组合是否可用及其实现模式 |

`mode` 取值：`'native'`、`'relocated'`、`'experimental'`、`'unsupported'`。

## `@polyglot/browser`

浏览器端实现，纯 `Uint8Array`，无 Node 依赖。

```typescript
import { synthesize, inspect, extract } from '@polyglot/browser';

const result = synthesize(pngBytes, {
  entries: [{ name: 'a.txt', data: new TextEncoder().encode('hi') }],
});

result.data;        // Uint8Array —— 完整 polyglot 文件
result.frontSize;   // 图像部分长度
result.backSize;    // 归档部分长度
result.frontFormat; // 'png' | 'jpeg'
```

### `synthesize(image, options)`

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `image` | `Uint8Array` | 前端图像字节（PNG 或 JPEG） |
| `options.entries` | `ZipEntryInput[]` | 归档条目 |
| `options.limits` | `Partial<SecurityLimits>` | 覆盖默认安全上限 |

返回 `{ data, frontFormat, frontSize, backSize, totalSize, entryCount, width, height }`。

### `inspect(data)`

返回 `{ isPolyglot, front?, back?, error? }`。前端格式无法识别时在 `error` 中给出原因。

### `extract(data)`

拆回前端图像与归档条目：

```typescript
const { front, entries } = await extract(fileBytes);
// front: { format, data }
// entries: [{ name, data }]
```

> 读取 DEFLATE 压缩的条目依赖平台 `DecompressionStream`；本库自己生成的归档使用 STORED，无需该 API。

### 安全限制

```typescript
import { DEFAULT_SECURITY_LIMITS } from '@polyglot/browser';

DEFAULT_SECURITY_LIMITS.maxEntries;    // 10000
DEFAULT_SECURITY_LIMITS.maxEntrySize;  // 1 GiB
DEFAULT_SECURITY_LIMITS.maxTotalSize;  // 10 GiB
```

## CLI

```bash
polyglot create -f <front> -o <output> [-e <entry>...]
polyglot inspect <file>
polyglot list <file>
polyglot extract <file> [-d <dir>]
```

| 命令 | 说明 |
| --- | --- |
| `create` | 合成 polyglot 文件 |
| `inspect` | 检查文件并输出两侧信息 |
| `list` | 列出归档中的条目 |
| `extract` | 解压归档（含路径穿越防护） |

## 错误类型

| 错误 | 触发场景 |
| --- | --- |
| `Unsupported front format` | 前端格式未注册 |
| `Unsupported back format` | 后端格式未注册 |
| `IncompatibleFormatError` | 组合被显式标记为不支持 |
| `InvalidFrontError` | 无法解析出有效的前端图像 |
| `InvalidArchiveError` | 无法解析出有效的归档 |
| `PolyglotError` | 基类，其余错误均继承自它 |
