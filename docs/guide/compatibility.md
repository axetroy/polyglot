# 兼容性实测

本文列出**实际跑过**的第三方解压/读取工具及其结果，而不是「理论上兼容」。所有结论都来自 `tests/compatibility/third-party.test.ts` —— 该测试会真的调用这些工具并逐字节比对解压结果。

复现方式：

```bash
npm test -- tests/compatibility/third-party.test.ts
```

未安装的工具会自动跳过（不会失败）。CI 在 Linux / macOS / Windows 三个平台上都会安装对应工具（Linux 用 `unzip` + `libarchive-tools` + 官方 7-Zip tarball；macOS 用 Homebrew 装 `sevenzip`；Windows 用 chocolatey 装 7-Zip，内置 `tar`/`python` 已够用，`unzip` 尽力而为），因此这些契约在多平台上真实执行。

## 测试样本

每次测试使用同一组条目，覆盖容易被忽略的边界：

| 条目 | 覆盖点 |
| --- | --- |
| `hello.txt` | 普通文本内容 |
| `sub/dir/note.md` | 多级目录路径 |
| `中文文档.txt` | 非 ASCII 文件名（UTF-8 标志位） |
| `empty.txt` | 零字节条目 |
| `binary.bin` | 含 `0x00` / `0xFF` 的二进制内容、CRC 校验 |

前端图片为 512×512 PNG（约 390 KB），保证偏移量是一个真实且不小的数值。

## 实测结果

| 工具 | 实现 | 列举 | 解压 | 内容比对 | 备注 |
| --- | --- | --- | --- | --- | --- |
| `unzip` / `zipinfo` | Info-ZIP | ✅ | ✅ | ✅ 一致 | 无 `extra bytes` 警告；`unzip -t` 报 `No errors detected` |
| `bsdtar` / `tar` | libarchive | ✅ | ✅ | ✅ 一致 | macOS Archive Utility、Windows 11 资源管理器同源 |
| Python `zipfile` | CPython stdlib | ✅ | ✅ | ✅ 一致 | `testzip()` 返回 `None`（CRC 全部通过） |
| 7-Zip (`7zz`) | Igor Pavlov | ✅ | ✅ | ✅ 一致 | 输出 `Embedded Stub Size` 提示，属正常识别 SFX 前缀 |
| `ditto` | Apple | ❌ | ❌ | — | 报 `Couldn't read PKZip signature`，见下文「已知不支持」 |
| `jar` / `java.util.zip` | OpenJDK | 未测 | 未测 | — | 本机未安装 JDK；逻辑上与 Info-ZIP 同类 |

> 关于 7-Zip 的提示：它会打印 `Warning: The archive is open with offset` 并给出 `Embedded Stub Size = <图片字节数>`。这是 7-Zip **正确识别出**文件前部有一个自解压式前缀（SFX stub），随后 `Everything is Ok` 正常解压。这是信息性输出，不是错误。

## 两类解析器

兼容性差异的根因只有一条：**解析器是否相信 ZIP 记录里的绝对偏移量**。

### 第一类：按记录偏移定位 ✅

从文件尾部找到 EOCD，读出中央目录偏移，直接跳过去读取。

本实现把偏移量写成**相对整个文件的绝对位置**（等价于 Info-ZIP `zip -A` 对自解压归档的修正），所以这类解析器无需任何补偿就能正确定位。这也是为什么 `unzip` 不再输出 `N extra bytes at beginning or within zipfile`。

代表：`unzip`、`zipinfo`、libarchive（`bsdtar` / `tar` / macOS 归档实用工具 / Windows 11 资源管理器）、Python `zipfile`、7-Zip、WinRAR、WinZip。

### 第二类：要求第 0 字节是 `PK\x03\x04` ❌

部分实现不做 EOCD 回溯，直接检查文件开头是否为本地文件头签名，或者只在文件头部搜索中央目录。

代表：Apple `ditto`、Finder 的部分解压路径。

**这类工具永远无法打开图片前端的 polyglot 文件**：PNG/JPEG 的签名必须占据第 0 字节，ZIP 就不可能同时占据第 0 字节。这是格式层面的互斥，不是实现缺陷。任何声称「所有压缩软件都能打开」的 polyglot 方案都不成立。

> macOS 用户注意：双击用「归档实用工具」打开可能失败（它走 `ditto` 路径）。用 `unzip`、`bsdtar`、7-Zip 或 Python 均可正常解压。

## 已知取舍：把 ZIP 片段单独切出来

因为偏移量现在是相对**整个文件**记录的，如果手动把图片前缀丢掉、只保留后面的 ZIP 片段并另存为文件，偏移量会比片段自身大一个前缀长度：

| 工具 | 对「切出来的片段」的行为 |
| --- | --- |
| `unzip` | 报 `missing N bytes in zipfile`，但仍会 `attempting to process anyway` 并成功解压 |
| Python `zipfile` | ✅ 正常，CRC 通过 |
| `bsdtar` | ✅ 正常 |
| 7-Zip | ✅ 正常 |

这是本方案与「垫字节布局」之间的取舍：垫字节布局让「切出来的片段」完美，却让**主产物**（polyglot 文件本身）出现警告，且 7-Zip 直接拒绝打开、体积翻倍。主产物才是用户交给别人的东西，因此选择优化主产物，并用本测试套件把「切片段」的降级行为固定下来。

## 支持的组合

| 前端 | 后端 | 支持 | 模式 |
| --- | --- | --- | --- |
| PNG | ZIP | ✅ | `relocated` |
| JPEG | ZIP | ✅ | `relocated` |
| 其他组合 | — | ❌ | `unsupported` |

未注册的组合一律视为 `unsupported`，`create()` 会直接抛出 `Unsupported back format`，而不是产出损坏的文件。
