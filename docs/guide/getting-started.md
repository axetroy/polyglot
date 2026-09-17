# 快速开始

## 什么是 Polyglot 文件？

Polyglot 文件是**同时符合两种格式规范**的单个文件。本项目生成的 polyglot 文件：

- 前面是一张完整的 **PNG 或 JPEG** 图片
- 后面紧跟一个完整的 **ZIP 归档**

因为 PNG 解析器读到 `IEND` 块就停止、JPEG 解析器读到 `EOI` 标记就停止，它们会忽略后面的字节；而 ZIP 解析器从文件末尾向前查找 EOCD 记录，因此能定位到归档。两者的解析方向相反，所以可以共存于同一个文件。

## 安装

```bash
npm install @polyglot/sdk
```

或者使用 CLI：

```bash
npm install -g @polyglot/cli
```

## 快速上手

### 在代码中使用

```typescript
import { polyglot } from "@polyglot/sdk";

// 合成：把 ZIP 归档藏进 PNG 图片
const file = await polyglot.create({
  front: "./photo.png",
  back: {
    format: "zip",
    entries: [
      { name: "readme.txt", data: Buffer.from("你好，世界") },
      { name: "secret.json", data: Buffer.from('{"key":"value"}') },
    ],
  },
});

await file.write("output.png");
```

生成的 `output.png` 用任何图片查看器打开都是正常图片，用 `unzip output.png` 也能解压出两个文件。

### 检查文件

```typescript
const info = await polyglot.inspect("output.png");

if (info.polyglot) {
  console.log("前端:", info.front?.format, info.front?.size, "字节");
  console.log("后端:", info.back?.format, info.back?.entries, "个条目");
}
```

### 提取内容

```typescript
const back = await polyglot.openBack("output.png");
const names = await back.list();
// ['readme.txt', 'secret.json']

const content = await back.read("readme.txt");
console.log(content.toString()); // 你好，世界
```

### 只取出图片

```typescript
const front = await polyglot.openFront("output.png");
console.log(front.format); // 'png'
console.log(front.size); // 图片部分的字节长度

for await (const chunk of front.stream()) {
  // 流式读取纯净的图片数据（不含归档）
}
```

## 命令行用法

```bash
# 合成
polyglot create -f photo.png -o output.png \
  -e readme.txt -e secret.json

# 检查
polyglot inspect output.png

# 列出归档条目
polyglot list output.png

# 解压
polyglot extract output.png -d ./out
```

## 浏览器 Playground

无需安装即可在浏览器中试用 —— 所有处理都在本地完成，文件不会上传到任何服务器：

- **合成**：上传图片 + 添加条目 → 生成 polyglot 文件 → 单文件下载
- **解析**：上传 polyglot 文件 → 预览图片 + 列出归档条目 → 逐文件下载或**打包为标准 ZIP 下载**

[打开 Playground →](/playground)

## 下一步

- [工作原理](/guide/how-it-works) —— 偏移量重定位与格式兼容性矩阵
- [API 参考](/guide/api) —— 完整的接口定义
- [安全模型](/guide/security) —— 解压限制与路径穿越防护
