# Polyglot File Engine

**本地双格式文件引擎** — 将图片与压缩包合为一体，同时兼容两种解析器。

```
image.png      → [ PNG ] + [ ZIP ]     (PNG 查看器正常显示，ZIP 工具正常解压)
image.zip      → [ JPEG ] + [ ZIP ]    (JPG 查看器正常显示，ZIP 工具正常解压)
```

**🌐 文档站点 / Documentation site:** <https://axetroy.github.io/polyglot>  
**🎮 Playground（浏览器端合成）：** [docs/playground.md](./docs/playground.md) — 运行在浏览器本地，不上传任何文件

---

## 架构

```
┌─────────────────────────────────────────────────────────────┐
│                         SDK / CLI                          │
 ├──────────────┬──────────────────────────────────────────────┤
 │  PolyglotEngine │  Core  ·  Registry  ·  Detector          │
 ├──────────────┬──────────────┬───────────────────────────────┤
 │  Front Adapters  │  Back Adapters  │  Compatibility Engine   │
 │  PNG  ·  JPEG    │  ZIP              │  (security limits)     │
 ├──────────────────┴──────────────────┴─────────────────────────┤
 │  Binary Source (Path / Buffer / Stream)                        │
 └──────────────────────────────────────────────────────────────┘

  packages/
    browser/    ⚡ 纯浏览器端实现 (Uint8Array, 无 Node Buffer)
    binary/     BinarySource · BinaryReader/Writer
    core/       PolyglotEngine · Detector · CompatibilityEngine
    sdk/        SDK 门面 (create engine + register adapters)
    cli/        Commander CLI (create / inspect / list / extract)
    formats/
      png/      PNG 前端适配器 (校验 · 解析 · 大小计算)
      jpeg/     JPEG 前端适配器
      zip/      ZIP 后端适配器 (安全限制 · 偏移重定位)
  tests/
    browser/    @polyglot/browser 交叉验证测试 (与 Node parser 对照)
    binary/     BinarySource 单元测试
    zip/        ZIP 安全测试 (Zip Bomb · Path Traversal · maxEntries)
    compatibility/  兼容性单元测试 + 真实第三方工具解压验证
    detector/   Detector 集成测试
    integration/ PolyglotFile 端到端测试
```

## 技术栈

- **Node.js** 20+ · **TypeScript** 5.4+ · **ESM**
- **tsup** 构建 (ESM + DTS)
- **Vitest** 测试 (globals mode, node env)
- **VitePress** 静态文档站点 + Playground 组件
- **ESLint 8.57** + **Prettier 3.2** (lint-staged + husky)
- **GitHub Actions** CI (typecheck / lint / test × Node 20+22 / build)

## 仓库结构

| 包 | 职责 |
| --- | --- |
| `packages/binary` | `BinarySource` 抽象与读写流 |
| `packages/core` | 引擎核心、注册表、探测器 |
| `packages/sdk` | 预注册适配器的 SDK 门面 |
| `packages/cli` | 命令行接口 (create / inspect / list / extract) |
| `packages/formats/png` | PNG 前端适配器 |
| `packages/formats/jpeg` | JPEG 前端适配器 |
| `packages/formats/zip` | ZIP 后端适配器（含安全上限与路径清理） |
| `packages/browser` | 浏览器端纯 `Uint8Array` 实现（Playground 驱动） |
| `docs/` | VitePress 站点源码（中英双语） |
| `tests/browser/` | 浏览器包测试（与 Node 端交叉验证） |

## 快速开始

```bash
npm install
npm run build
npm test
```

## 运行文档站点

```bash
npm run docs:dev          # 本地开发模式
npm run docs:build        # 构建静态站点到 docs/.vitepress/dist
npm run docs:preview      # 本地预览构建结果
```

## CLI

```bash
# 创建 polyglot 文件（--add 内联文本；如需要二进制内容，请用 SDK）
polyglot create --front image.png --back zip \
  --add readme.txt:hello \
  --output polyglot.png.zip
# 检查文件
polyglot inspect polyglot.png.zip

# 列出归档内容
polyglot list polyglot.png.zip

# 解压归档内容
polyglot extract polyglot.png.zip ./output/
```

## SDK API

```typescript
import * as polyglot from '@polyglot/sdk';

// 创建
const file = await polyglot.polyglot.create({
  front: './image.png',       // 路径 | Buffer | BinarySource
  back: {
    format: 'zip',
    entries: [
      { name: 'readme.txt', data: Buffer.from('hello') },
    ],
  },
});
await file.write('polyglot.png');           // 流式写入文件
console.log(file.getInfo());                // 元数据

// 检查
const info = await polyglot.polyglot.inspect('polyglot.png');

// 打开图片
const front = await polyglot.polyglot.openFront('polyglot.png');
for await (const chunk of front.stream()) { /* ... */ }

// 打开归档
const archive = await polyglot.polyglot.openBack('polyglot.png');
const names = await archive.list();
const data = await archive.read('readme.txt');
```

## 兼容性（实测）

产出的文件可直接用下列工具正常解压，内容逐字节一致（详见[兼容性实测](https://axetroy.github.io/polyglot/guide/compatibility)，或直接跑 `npm test -- tests/compatibility/third-party.test.ts`）：

| 工具 | 列举 | 解压 |
|------|------|------|
| `unzip` / `zipinfo`（Info-ZIP） | ✅ | ✅ 无 `extra bytes` 警告 |
| `bsdtar` / `tar`（libarchive） | ✅ | ✅ |
| Python `zipfile` | ✅ | ✅ CRC 全部通过 |
| 7-Zip | ✅ | ✅ 识别为 SFX 前缀 |

已知边界：要求文件第 0 字节就是 ZIP 签名的实现（如 Apple `ditto`）无法打开图片前端的文件——这是格式层面的互斥，不是缺陷。

## 安全特性

| 防护项 | 说明 |
|--------|------|
| **Zip Bomb** | `maxEntries: 10000`、`maxEntrySize: 1GB`、`maxTotalSize: 10GB` |
| **路径穿越** | `sanitizeEntryPath()` 拒绝 `..` 和绝对路径 |
| **异常处理** | JPEG 截断时优雅降级，不抛出 |
| **CLI 安全** | extract 命令自动过滤危险路径 |
| **浏览器端** | `@polyglot/browser` 同样强制执行三档安全上限 |

## 运行测试

```bash
npm run test          # 全部测试
npm run typecheck     # TypeScript 类型检查
npm run lint          # ESLint + Prettier
npm run lint:fix      # 自动修复
npm run build         # 全量构建
```

## CI

```yaml
jobs:
  typecheck  - tsc --noEmit
  lint       - eslint . --ext .ts
  test-node20 - vitest run (Node 20)
  test-node22 - vitest run (Node 22)
  build      - npm run build
  docs       - npm run docs:build
```
