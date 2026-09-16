# @polyglot/formats-jpeg

JPEG 前端格式适配器 — SOI/EOI 定位、段解析、布局查询。

## 安装

```json
{ "dependencies": { "@polyglot/formats-jpeg": "*" } }
```

## 导出

```typescript
import {
  JpegAdapter,        // 标准 FrontAdapter 实现
  jpegAdapter,        // 预实例化的单例
  JpegSegment,        // 类型定义
  JpegInfo,           // 类型定义
  JpegLayout,         // 类型定义
} from '@polyglot/formats-jpeg';
```

## `JpegAdapter`

实现 `@polyglot/binary.FrontAdapter`，`id` 为 `'jpeg'`。

### `detect(source)` → `Promise<boolean>`

判定文件是否为有效 JPEG。依据：SOI 标记 `FFD8` + 至少包含一个有效段（含 EOI 存在性检查）。

### `inspect(source)` → `Promise<JpegInfo>`

解析所有段，返回尺寸、采样因子及段列表：

```typescript
interface JpegSegment {
  marker: number;       // 如 0xFFC0 (SOF0)
  length: number;
  payload: Buffer;
  offset: number;
}
interface JpegInfo {
  segments: JpegSegment[];
  width: number;
  height: number;
  components: number;
  size: number;         // 最终合法 JPEG 字节数（截断的 polyglot 文件会停在 EOI 处，而非 buffer 末尾）
}
```

### `validate(source)` → `Promise<{ valid, error? }>`

校验 SOI 存在且最后一个有效段以 EOI 结尾。对 polyglot 文件（尾段被 ZIP 数据覆盖）会返回 `valid: false`——这是预期行为，前端校验仅在纯文件场景使用。

### `getLayout(info)` → `Promise<JpegLayout>`

```typescript
interface JpegLayout {
  format: 'jpeg';
  size: number;
  width: number;
  height: number;
  components: number;
}
```

## 处理截断文件

当 JPEG 作为 polyglot 文件的前端时，字节流在 `EOI`（`FF D9`）处被 ZIP 数据截断，剩余字节不再是合法 JPEG 段。为避免解析器在此时报错，`parse()` 在到达 `size` 边界时会优雅退出而不是抛错——这也是 `JpegInfo.size` 与 `source.size()` 可能不同的原因。

## 开发

```bash
npm run build -w @polyglot/formats-jpeg
npm run typecheck -w @polyglot/formats-jpeg
npm test
```
