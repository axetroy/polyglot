# @polyglot/formats-png

PNG 前端格式适配器 — 检测、解析、校验与布局查询。

## 安装

```json
{ "dependencies": { "@polyglot/formats-png": "*" } }
```

## 导出

```typescript
import {
  PngAdapter, // 标准 FrontAdapter 实现
  pngAdapter, // 预实例化的单例
  PngChunk, // 类型定义
  PngInfo, // 类型定义
  PngLayout, // 类型定义
} from "@polyglot/formats-png";
```

## `PngAdapter`

实现 `@polyglot/binary.FrontAdapter`，`id` 为 `'png'`。

### `detect(source)` → `Promise<boolean>`

判定文件是否为有效 PNG。依据：文件头 8 字节签名 `89 50 4E 47 0D 0A 1A 0A`，并验证 IDAT 至少存在一块。

### `inspect(source)` → `Promise<PngInfo>`

完整解析 PNG，返回尺寸、色彩模式、位深度及所有 chunk 列表：

```typescript
interface PngInfo {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number; // 0=灰度 2=RGB 3=索引 4=灰度+alpha 6=RGBA
  compressionMethod: number;
  filterMethod: number;
  interlaceMethod: number;
  chunks: PngChunk[];
  size: number; // 最终合法 PNG 字节数（截断的 polyglot 文件会停在有效 chunk 边界）
}
```

### `validate(source)` → `Promise<{ valid, error? }>`

轻量合法性检查，适用于 fast-path 校验：

```typescript
const v = await adapter.validate(source);
if (!v.valid) throw new InvalidFrontError(v.error, "png");
```

### `getLayout(info)` → `Promise<PngLayout>`

把 `PngInfo` 压缩为 layout 元数据：

```typescript
interface PngLayout {
  format: "png";
  size: number;
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
}
```

## 在引擎中的使用

`PngAdapter` 通过 `engine.registerFront(adapter)` 注册后，`openFront()` 会调用 `inspect()` 获取前端尺寸作为偏移基准，用于 ZIP 段的重定位计算。

## 开发

```bash
npm run build -w @polyglot/formats-png
npm run typecheck -w @polyglot/formats-png
npm test
```
