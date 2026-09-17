# Polyglot File Engine

## 本地双格式文件引擎架构白皮书

**版本：1.0 Draft**

---

# 1. 项目概述

Polyglot File Engine 是一个基于 Node.js / TypeScript 的本地文件格式引擎。

项目目标非常单一：

> 将两个具有不同解析规则的文件格式组合到同一个物理文件中，使该文件能够分别被对应的解析器识别。

典型形式：

```text
┌──────────────────────────────┐
│                              │
│        Front Format          │
│        PNG / JPEG / ...      │
│                              │
├──────────────────────────────┤
│                              │
│        Back Format           │
│        ZIP / TAR / ...       │
│                              │
└──────────────────────────────┘
```

例如：

```text
image.png
```

物理文件实际为：

```text
[ PNG ][ ZIP ]
```

当作为 PNG 使用：

```text
image.png
    ↓
PNG Parser
    ↓
正常图片
```

当改名为：

```text
image.zip
```

则：

```text
ZIP Parser
    ↓
ZIP Archive
```

项目本身不提供在线服务。

---

# 2. 项目边界

## 2.1 包含

项目包含：

```text
Node.js Library
CLI
Format Adapter
Binary Parser
Binary Builder
Compatibility Engine
Polyglot Detector
```

提供：

```text
create()
inspect()
detect()
openFront()
openBack()
extract()
list()
```

---

## 2.2 不包含

项目不包含：

```text
HTTP Server
REST API
云端服务
数据库
用户系统
在线存储
SaaS
```

这里所说的 API 全部指：

> **Local Programming API**

例如：

```ts
polyglot.create(...)
```

而不是：

```http
POST /api/polyglot
```

---

# 3. 项目目标

第一阶段目标：

```text
PNG + ZIP
JPEG + ZIP
```

最终希望实现：

```text
PNG  + ZIP
JPEG + ZIP
GIF  + ZIP

PNG  + TAR
JPEG + TAR
GIF  + TAR
```

但不强制要求任意格式组合。

每一个组合都必须经过兼容性测试。

---

# 4. 核心概念

系统把文件拆成两个逻辑区域。

```text
             Polyglot File
                   │
          ┌────────┴────────┐
          │                 │
       Front               Back
          │                 │
     Image/File          Archive
          │                 │
   PNG / JPEG           ZIP / TAR
```

## Front

负责保持原始文件的使用方式。

例如：

```text
PNG
JPEG
GIF
PDF
```

## Back

负责提供第二种文件格式。

例如：

```text
ZIP
TAR
```

---

# 5. 总体架构

```text
                    ┌──────────────────┐
                    │      User        │
                    └────────┬─────────┘
                             │
                   ┌─────────┴─────────┐
                   │                   │
                  CLI             Local SDK
                   │                   │
                   └─────────┬─────────┘
                             │
                   ┌─────────▼─────────┐
                   │   Polyglot Core    │
                   └─────────┬─────────┘
                             │
       ┌─────────────────────┼─────────────────────┐
       │                     │                     │
┌──────▼───────┐     ┌───────▼────────┐    ┌──────▼───────┐
│   Detector   │     │ Compatibility  │    │   Builder    │
└──────┬───────┘     └───────┬────────┘    └──────┬───────┘
       │                     │                     │
       └─────────────────────┼─────────────────────┘
                             │
                    ┌────────▼────────┐
                    │ Format Registry │
                    └────────┬────────┘
                             │
             ┌───────────────┴───────────────┐
             │                               │
      ┌──────▼───────┐                ┌──────▼───────┐
      │ Front Adapter│                │ Back Adapter │
      ├──────────────┤                ├──────────────┤
      │ PNG          │                │ ZIP          │
      │ JPEG         │                │ TAR          │
      │ GIF          │                │ ...          │
      └──────────────┘                └──────────────┘
```

---

# 6. Core Engine

Core Engine 不直接理解 PNG、JPEG、ZIP。

它只负责：

```text
格式注册
格式检测
兼容性判断
布局计算
构建
解析
```

核心接口：

```ts
interface PolyglotEngine {
  create(options: CreateOptions): Promise<PolyglotFile>;

  inspect(source: BinarySource): Promise<PolyglotInfo>;

  detect(source: BinarySource): Promise<DetectionResult>;

  openFront(source: BinarySource): Promise<FrontFile>;

  openBack(source: BinarySource): Promise<Archive>;
}
```

---

# 7. Format Registry

所有格式通过 Registry 注册。

```ts
registry.registerFront(pngAdapter);
registry.registerFront(jpegAdapter);

registry.registerBack(zipAdapter);
registry.registerBack(tarAdapter);
```

内部：

```text
Registry
│
├── Front
│   ├── PNG
│   ├── JPEG
│   └── GIF
│
└── Back
    ├── ZIP
    └── TAR
```

---

# 8. Front Adapter

统一接口：

```ts
interface FrontAdapter {
  id: string;

  detect(source: BinarySource): Promise<boolean>;

  inspect(source: BinarySource): Promise<FrontInfo>;

  validate(source: BinarySource): Promise<ValidationResult>;

  getLayout(info: FrontInfo): Promise<FrontLayout>;
}
```

PNG Adapter：

```text
PNG
 ↓
读取 Signature
 ↓
解析 Chunk
 ↓
确认 IEND
 ↓
得到 Front Layout
```

JPEG Adapter：

```text
JPEG
 ↓
SOI
 ↓
Segment Parser
 ↓
确认 JPEG End
 ↓
得到 Front Layout
```

---

# 9. Back Adapter

统一接口：

```ts
interface BackAdapter {
  id: string;

  create(entries: ArchiveEntry[]): Promise<ArchiveBinary>;

  inspect(source: BinarySource): Promise<ArchiveInfo>;

  parse(source: BinarySource): Promise<Archive>;

  getLayout(archive: ArchiveBinary): Promise<ArchiveLayout>;
}
```

ZIP Adapter 负责：

```text
Local File Header
File Data
Central Directory
EOCD
```

TAR Adapter 负责：

```text
Header
File Data
Padding
EOF
```

---

# 10. Polyglot Builder

Builder 是核心。

输入：

```ts
{
  front: "image.png",

  back: {
    format: "zip",

    entries: [
      {
        name: "hello.txt",
        data: Buffer.from("Hello")
      }
    ]
  }
}
```

流程：

```text
Front
 │
 ▼
Parse
 │
 ▼
Front Layout
 │
 ├──────────────┐
 │              │
 ▼              ▼
Prefix Size    Back Builder
 │              │
 │              ▼
 │           ZIP Layout
 │              │
 └──────┬───────┘
        ▼
   Relocation
        │
        ▼
    Binary Merge
        │
        ▼
   Polyglot File
```

---

# 11. Binary Layout

最终文件：

```text
Offset 0
│
├──────────────────────────┐
│                          │
│      Front File          │
│                          │
├──────────────────────────┤
│      Back Archive        │
│                          │
│      ZIP/TAR             │
│                          │
└──────────────────────────┘
```

核心要求：

> Front 区域原则上保持原始字节不变。

因此：

```text
original[0:N]
```

必须与：

```text
polyglot[0:N]
```

完全一致。

---

# 12. ZIP Layout Relocation

这是第一阶段最大的技术难点。

ZIP 内部包含：

```text
Local Header
File Data
Central Directory
EOCD
```

Central Directory 中保存：

```text
Relative Offset of Local Header
```

因此：

```text
ZIP 原始 offset
```

与：

```text
Polyglot 文件中的实际 offset
```

可能不同。

例如：

```text
Front Size = 100000
```

ZIP：

```text
Local Header = 0
```

组合后：

```text
Actual Local Header = 100000
```

所以 Builder 必须具备：

```text
ZIP Layout Analyzer
        ↓
Offset Relocator
        ↓
ZIP Writer
```

而不是简单：

```ts
Buffer.concat([front, zip]);
```

---

# 13. 为什么不把 ZIP 直接当 Buffer 拼接

简单拼接：

```ts
Buffer.concat([front, zip]);
```

只能保证：

```text
[Front][ZIP bytes]
```

并不能保证：

```text
ZIP parser
```

一定能正确解释内部 offset。

因此 ZIP Adapter 必须知道：

```text
prefixSize
```

并根据具体 ZIP 结构处理必要的偏移关系。

---

# 14. Compatibility Engine

不是：

```text
Front × Back = Always Valid
```

而是：

```text
Front × Back = Compatibility Rule
```

定义：

```ts
interface CompatibilityRule {
  front: string;

  back: string;

  supported: boolean;

  mode: "native" | "relocated" | "experimental" | "unsupported";
}
```

例如：

```text
PNG + ZIP
    relocated

JPEG + ZIP
    relocated

PNG + TAR
    experimental
```

---

# 15. Detector

Detector 不依赖文件扩展名。

例如：

```text
unknown.bin
```

也应该能够检测：

```text
Front:
  PNG

Back:
  ZIP
```

流程：

```text
File
 │
 ├── Front Detection
 │
 ├── Back Detection
 │
 └── Structural Validation
```

结果：

```ts
{
  isPolyglot: true,

  front: {
    format: "png"
  },

  back: {
    format: "zip"
  }
}
```

---

# 16. Local SDK

最终用户 API 保持简单。

创建：

```ts
const result = await polyglot.create({
  front: "./image.png",

  back: {
    format: "zip",

    entries: [
      {
        name: "hello.txt",
        data: Buffer.from("hello"),
      },
    ],
  },
});

await result.write("./output.png");
```

---

# 17. Inspect API

```ts
const info = await polyglot.inspect("./output.png");
```

返回：

```ts
{
  polyglot: true,

  front: {
    format: "png",
    size: 102400
  },

  back: {
    format: "zip",
    entries: 1
  }
}
```

---

# 18. Open Front

```ts
const front = await polyglot.openFront("./output.png");
```

得到：

```ts
{
  format: "png",
  size: 102400,
  stream()
}
```

---

# 19. Open Back

```ts
const archive = await polyglot.openBack("./output.png");
```

然后：

```ts
const entries = await archive.list();
```

例如：

```text
hello.txt
data.json
thumbnail.jpg
```

读取：

```ts
const data = await archive.read("data.json");
```

---

# 20. CLI

CLI 只是 SDK 的一个薄封装。

创建：

```bash
polyglot create \
  --front image.png \
  --back zip \
  --add hello.txt \
  --output output.png
```

检测：

```bash
polyglot inspect output.png
```

输出：

```text
Polyglot: true

Front:
  PNG

Back:
  ZIP

Entries:
  1
```

列出：

```bash
polyglot list output.png
```

提取：

```bash
polyglot extract output.png ./output
```

---

# 21. Streaming Architecture

不要求整个文件进入内存。

例如：

```text
10 GB Front
+
100 MB ZIP
```

不能设计成：

```ts
const buffer = await readFile(...)
```

而应该：

```text
Readable
   │
   ▼
Front Stream
   │
   ▼
Archive Stream
   │
   ▼
Writable
```

API：

```ts
await polyglot.createStream({
  front: frontStream,
  back: archive,
});
```

---

# 22. 文件操作模型

建议所有文件操作支持：

```text
Path
FileHandle
Buffer
ReadableStream
```

统一为：

```ts
BinarySource;
```

这样 Core Engine 不关心数据来源。

---

# 23. 安全边界

虽然项目是本地工具，但 Archive 解析仍然需要安全限制。

特别是：

```text
Path Traversal
Zip Bomb
超大 Entry
超多 Entry
异常 Header
Malformed Archive
```

默认：

```ts
{
  maxEntries: 10000,
  maxEntrySize: 1 * 1024 * 1024 * 1024
}
```

提取路径必须规范化。

---

# 24. 错误模型

统一错误：

```ts
class PolyglotError extends Error {}

class UnsupportedFormatError extends PolyglotError {}

class IncompatibleFormatError extends PolyglotError {}

class InvalidFrontError extends PolyglotError {}

class InvalidArchiveError extends PolyglotError {}

class RelocationError extends PolyglotError {}
```

例如：

```ts
try {
  await polyglot.create(...);
} catch (error) {
  if (error instanceof IncompatibleFormatError) {
    // ...
  }
}
```

---

# 25. 项目目录

推荐：

```text
polyglot/
│
├── packages/
│
│   ├── core/
│   │   ├── engine.ts
│   │   ├── registry.ts
│   │   ├── detector.ts
│   │   ├── compatibility.ts
│   │   └── errors.ts
│   │
│   ├── binary/
│   │   ├── reader.ts
│   │   ├── writer.ts
│   │   ├── source.ts
│   │   └── stream.ts
│   │
│   ├── formats/
│   │   │
│   │   ├── png/
│   │   │   ├── detector.ts
│   │   │   ├── parser.ts
│   │   │   └── adapter.ts
│   │   │
│   │   ├── jpeg/
│   │   │
│   │   ├── zip/
│   │   │   ├── parser.ts
│   │   │   ├── writer.ts
│   │   │   ├── relocation.ts
│   │   │   └── adapter.ts
│   │   │
│   │   └── tar/
│   │
│   ├── sdk/
│   │   └── index.ts
│   │
│   └── cli/
│       └── index.ts
│
├── tests/
│   ├── png-zip/
│   ├── jpeg-zip/
│   ├── detector/
│   └── compatibility/
│
├── examples/
│
└── package.json
```

---

# 26. 技术栈

推荐：

```text
Runtime
Node.js 20+

Language
TypeScript

Package Manager
pnpm

Build
tsup

Test
Vitest

CLI
Commander

Lint
ESLint

Format
Prettier
```

核心二进制操作只依赖 Node.js：

```text
Buffer
fs/promises
FileHandle
Readable
Writable
```

---

# 27. 测试体系

Polyglot 文件最重要的是：

> **真实解析器兼容性。**

因此测试分三层。

## Unit Test

测试：

```text
PNG Parser
JPEG Parser
ZIP Parser
ZIP Relocation
Binary Reader
Binary Writer
```

---

## Integration Test

测试：

```text
PNG + ZIP
JPEG + ZIP
```

例如：

```text
Create
 ↓
Inspect
 ↓
Open Front
 ↓
Open Back
 ↓
List
 ↓
Extract
```

---

## External Compatibility Test

使用实际软件验证：

```text
生成 Polyglot
       │
       ├── 图片解析器
       │
       ├── ZIP 解析器
       │
       └── 常见归档工具
```

最终形成：

```text
Compatibility Matrix
```

而不是仅仅依赖自己的 Parser。

---

# 28. MVP

第一版严格限制范围：

```text
Front:
  PNG
  JPEG

Back:
  ZIP
```

只支持：

```text
PNG + ZIP
JPEG + ZIP
```

实现：

```text
create()
inspect()
detect()
openFront()
openBack()
list()
extract()
```

暂时不做：

```text
TAR
PDF
MP4
MP3
在线服务
数据库
GUI
```

---

# 29. 第二阶段

增加：

```text
GIF
TAR
```

得到：

```text
PNG  + ZIP
JPEG + ZIP
GIF  + ZIP

PNG  + TAR
JPEG + TAR
GIF  + TAR
```

但每个组合都进入 Compatibility Matrix。

---

# 30. 第三阶段

增加更多 Front Adapter：

```text
PDF
MP3
MP4
```

原则：

> 每增加一个格式，只增加 Adapter，不修改 Core Engine。

---

# 31. 核心架构原则

## 31.1 Core 不认识具体格式

错误：

```ts
if (format === "png") {
   ...
}
```

正确：

```ts
adapter.getLayout(...)
```

---

## 31.2 扩展格式必须插件化

增加：

```text
WEBP
```

不应该修改：

```text
Core Engine
```

而应该新增：

```text
formats/webp/
```

---

## 31.3 文件扩展名不是可信信息

永远：

```text
Magic
+
Parser
+
Structural Validation
```

---

## 31.4 不保证任意组合

明确：

```text
Supported
Experimental
Unsupported
```

---

## 31.5 Standard Back Format

后置格式尽量保持标准：

```text
ZIP
TAR
```

避免创造：

```text
自定义 Archive
```

这样才能最大化第三方工具兼容性。

---

# 32. 最终 API

最终希望用户只需要理解以下接口：

```ts
const file = await polyglot.create({
  front: "./image.png",

  back: {
    format: "zip",

    entries: [
      {
        name: "hello.txt",
        data: Buffer.from("Hello"),
      },
    ],
  },
});

await file.write("./output.png");
```

检查：

```ts
const info = await polyglot.inspect("./output.png");
```

读取 Front：

```ts
const front = await polyglot.openFront("./output.png");
```

读取 Back：

```ts
const archive = await polyglot.openBack("./output.png");
```

---

# 33. 最终定位

Polyglot File Engine 最终不是：

```text
Metadata Tool
```

也不是：

```text
Online File Service
```

而是：

```text
          Local Polyglot Engine

                 │
        ┌────────┴────────┐
        │                 │
      Front              Back
        │                 │
 PNG/JPEG/GIF          ZIP/TAR
        │                 │
        └────────┬────────┘
                 │
           Binary Builder
                 │
                 ▼
          Polyglot File
```

它的核心价值只有一个：

> **让两个独立的文件格式共存于一个物理文件中，并通过各自的解析规则分别获得有效结果。**

第一阶段应该把全部精力集中在：

```text
PNG + ZIP
JPEG + ZIP
       ↓
正确布局
       ↓
正确 ZIP 解析
       ↓
第三方软件兼容
       ↓
Node.js API
       ↓
CLI
```

完成这一闭环之后，再扩展其他格式。
