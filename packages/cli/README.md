# @polyglot/cli

Polyglot 文件引擎的命令行入口，基于 [Commander.js](https://github.com/tj/commander.js)。

## 安装

```bash
# 本包是 monorepo 内部包；运行需安装 workspace 依赖
npm install
```

## 命令

```bash
polyglot --help
```

### `create`

合成前端（PNG/JPEG）+ 后端（ZIP）文件。

```bash
polyglot create \
  --front ./photo.jpg \
  --back zip \
  --add readme.txt:"Hello Polyglot" \
  --add config.json '{"key":1}' \
  --add empty.dat \
  --output image.zip
```

选项：

| 选项 | 必填 | 说明 |
|---|---|---|
| `--front <path>` | ✅ | 前端图片路径 |
| `--back <format>` | | 后端格式，默认 `zip` |
| `--add <name:data>` | | 归档条目，可重复（`data` 省略时写入空 Buffer） |
| `--output <path>` | ✅ | 输出文件路径 |

> **安全**：extract 命令会过滤掉 `..` 与绝对路径条目，避免 Zip Slip 攻击。

### `inspect`

轻量检查文件是否 polyglot 并打印元数据。

```bash
polyglot inspect image.zip
# Polyglot: true
# Front: JPEG
# Front size: 23456 bytes
# Back: ZIP
# Back entries: 3
```

### `list`

列出归档内所有条目名。

```bash
polyglot list image.zip
# readme.txt
# config.json
# empty.dat
```

### `extract`

把归档内容解压到目录（自动跳过可疑条目名）。

```bash
polyglot extract image.zip ./output/
# Extracted: readme.txt
# Extracted: config.json
# Extracted: empty.dat
```

参数：

| 位置 | 说明 |
|---|---|
| `<path>` | 源 polyglot 文件 |
| `<output-dir>` | 目标目录（不存在会自动创建） |

## CLI 内部实现注意

`@polyglot/cli` 直接 require 了 `@polyglot/sdk` 单例，所有命令共用同一份引擎状态。如需独立引擎，改用 `@polyglot/core` 自行构建。

## 开发

```bash
npm run build -w @polyglot/cli
npm run typecheck -w @polyglot/cli
npm test
```
