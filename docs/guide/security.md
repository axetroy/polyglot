# 安全模型

生成与读取 polyglot 文件时，引擎会在多个层级施加限制，防止**ZIP 解压炸弹**、**路径穿越**等常见攻击面。

## 三层尺寸限制

读取归档时，引擎并行检查三个上限：

| 限制 | 默认值 | 含义 |
| --- | --- | --- |
| `maxEntries` | 10,000 | 中央目录中允许的最大条目数 |
| `maxEntrySize` | 1 GiB | 单个条目的解压后大小上限 |
| `maxTotalSize` | 10 GiB | 所有条目解压后总大小上限 |

超过任一限制都会立即抛出错误，**不继续解压**：

```
ZIP archive exceeds maximum entry limit: 15000 >= 10000
ZIP entry "evil.txt" exceeds maximum size: 2147483648 > 1073741824
ZIP archive total size exceeds limit: 1152921504606846976 > 1099511627776
```

浏览器端的 `@polyglot/browser` 同样在 `synthesize()` 时校验这 3 个限制（通过 `enforceLimits`），合成大文件前就能发现超限而非等到读取。

## 路径穿越防护

`sanitizePath()` 对每个条目名执行以下转换与校验，并在发现问题时**直接拒绝**：

1. **规范化分隔符**：将反斜杠统一转为正斜杠，防止 Windows 风格的反斜杠绕过检查。
2. **拒绝绝对路径**：以 `/` 开头的路径会报错 `absolute path in entry "..."`。
3. **拒绝 `..` 组件**：任何 `..` 目录跳转都会报错 `".." component in entry "..."`，包括 `foo/../bar`。
4. **拒绝路径根 `.`**：单独的 `.` 被识别为无效路径而拒绝，报 `entry path is "."`。
5. **允许中间目录**：`a/b/c.txt`、`a..b/c.txt` 等合法路径均通过（仅检查精确匹配的 `..` 与 `.`）。

```typescript
// 全部会被拦截
sanitizePath('..//etc/passwd');    // ".." component
sanitizePath('/etc/passwd');       // absolute path
sanitizePath('..');                // ".." component
sanitizePath('.');                 // entry path is "."

// 可以通过
sanitizePath('foo/../bar');        // ".." component → 拒绝
sanitizePath('nested/dir.txt');    // ✅
sanitizePath('a..b.txt');          // ✅（不是精确匹配的 ".."）
```

CLI 的 `extract` 命令同样依赖这一层校验。

## JPEG 截断容忍

PNG 必须包含 `IEND` 块才能被判为合法图片；JPEG 缺少 `EOI` 时仍被视为可能有效的部分文件。这是**有意为之**：

- polyglot 文件是在 JPEG 字节流后面追加归档，而 JPEG 结尾处恰好是 `EOI`（`0xFFD9`），所以正常构建的文件都会满足 EOI 要求。
- 允许截断是为了兼容「图片本身就不完整」的场景（如网络传输中断），此时仍可按已有部分生成一个可用的 polyglot 文件，归档侧不依赖图片完整性。

## 前端格式白名单

只有显式注册的适配器才会被接受。默认注册的有：

| 前端 | 标识符 |
| --- | --- |
| PNG | `'png'` |
| JPEG | `'jpeg'` |

不支持的格式（如 GIF、WebP、BMP）在 `create()` 时会抛出 `Unsupported front format: gif`，**不会产出任何输出文件**。后端同理。

## 防御纵深

以上各项独立运作、互不依赖：即使某一层失效，其他层仍然提供保护。推荐在调用方额外做以下事情以进一步加强安全性：

- 对上传的可疑文件限制 `maxEntries` / `maxTotalSize` 为合理较小的值（例如 100 条、10 MiB）。
- 在容器化环境中使用 `zip -T` / 解压到沙箱目录。
- 对不可信来源的 polyglot 文件优先使用 `inspect()` 或 `detect()` 做轻量判定，避免直接 `openBack()`。
