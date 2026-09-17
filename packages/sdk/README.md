# @polyglot/sdk

**推荐入口** — 开箱即用的预配置 Polyglot 引擎，已绑定 PNG / JPEG 前端与 ZIP 后端。

## 安装

```json
{ "dependencies": { "@polyglot/sdk": "*" } }
```

## 核心 API

```typescript
import * as polyglot from "@polyglot/sdk";
```

所有接口均指向同一个单例 `PolyglotEngine`，对外暴露的类型与 `@polyglot/core` 一致。

## 方法

### `polyglot.create(options)`

合成并写盘（或取 Buffer）：

```typescript
const file = await polyglot.create({
  front: "./photo.jpg", // 图片路径 / Buffer / BinarySource
  back: {
    format: "zip",
    entries: [
      { name: "data.bin", data: someBuffer },
      { name: "meta.json", data: Buffer.from('{"k":1}') },
    ],
  },
});

await file.write("./output.zip"); // 直接写盘
const buf = file.getBuffer(); // 或内存获取
const info = await file.getInfo(); // PolyglotInfo
```

### `polyglot.inspect(source)`

返回带前端元数据 + 后端条目数的完整信息。比 `detect()` 重但适合 UI 展示：

```typescript
const info = await polyglot.inspect("./output.png");
if (info.polyglot) {
  console.log(`Front: ${info.front.format} (${info.front.size} bytes)`);
  console.log(`Back: ${info.back.format} (${info.back.entries} entries)`);
}
```

### `polyglot.detect(source)`

轻量探测，仅判断是否 polyglot + 各格式名：

```typescript
const result = await polyglot.detect("./file");
// { isPolyglot: true, front: { format: 'png' }, back: { format: 'zip' } }
```

### `polyglot.openFront(source)`

提取图片字节，支持流式：

```typescript
const front = await polyglot.openFront("./polyglot.png");
console.log(`Front format: ${front.format}, size: ${front.size}`);
for await (const chunk of front.stream()) {
  process.stdout.write(chunk); // 直接传给 image-viewer 或管道
}
```

### `polyglot.openBack(source)`

打开归档，列出/读取条目：

```typescript
const archive = await polyglot.openBack("./polyglot.png");
const names = await archive.list(); // string[]
const data = await archive.read("readme.txt"); // Buffer
```

## 内置支持的组合

| 前端   | 后端  | 模式        |
| ------ | ----- | ----------- |
| `png`  | `zip` | `relocated` |
| `jpeg` | `zip` | `relocated` |

未来可继续注册更多适配器与规则。

## 自定义扩展

如果预配置的组合不够用，可导出底层引擎做扩展：

```typescript
import { PolyglotEngine } from "@polyglot/sdk";
// 注：当前 SDK 只导出 polyglot 单例；若要自定义引擎请改依赖 @polyglot/core。
```

> **提示**：当前版本 `@polyglot/sdk` 导出的是单例。若需多实例（隔离状态、不同兼容规则），请改用 `@polyglot/core` 自行实例化。

## 开发

```bash
npm run build -w @polyglot/sdk
npm run typecheck -w @polyglot/sdk
npm test
```
