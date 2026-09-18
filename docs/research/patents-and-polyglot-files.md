# Polyglot 文件技术专利检索报告

> 本報告は AI エージェントが収集・統合した研究メモであり、法的助言ではない。特許範囲（クレーム）の解釈や権利の有効性については、必ず弁理士・弁護士に確認すること。

## 結論摘要

- **没有发现**直接主张「单个字节流同时作为两种独立文件格式有效（如既是 PNG 又是 ZIP）」的已授权专利或待审申请。
- **最接近的已授权专利均为「在图像文件末尾追加非图像数据」**（US8271544、US9009123/US10972746），其技术路线是"图像 EOF 标记后接音频/文本等"，依赖自定义解析器跳过 EOF 读取后面内容；标准 ZIP 解析器无法打开该合并文件，因此不构成问题所问的「真实 polyglot 文件」。
- **另一条近似的中国专利申请（CN116472526A，华为，2020-12-04 提交）** 是一种「多格式容器/去重」方案（通用数据存一份 + 各格式专有部分 + 元数据指针），目标是存储效率而非让同一字节流被两种标准解析器各自独立解析，不属于严格意义的 polyglot 文件。
- **所有相关专利的申请日（最早 US8271544: 2009-05-01）均晚于公开的 prior art**：2001-11 的 vuln-dev 邮件组已记录 `cat image.jpg x.zip > out.jpg` 技巧，2008 年 GIFAR 已在 Black Hat 演讲，2013-2015 年的 SSTIC/PoC||GTFO/ccs 论文大量公开了多格式合一字节流的构造方法。**若存在声称该技术的专利，其新颖性/创造性极可能被 prior art 摧毁。**
- **法律上，该技术在美/中/欧三地大概率不被有效专利覆盖**：美国《Alice/Mayo》框架下纯"文件格式拼接"属抽象思想；中国《专利法》第25条排除纯智力规则，但含技术特征的组合可授权（然而 prior art 仍可摧毁新颖性）；欧洲 EPO 要求技术方案具备"技术效果"（T 641/00 Comvik），单纯文件格式操纵通常被视为非技术。

## 检索范围与方法

### 可访问的数据库与引擎
| 来源 | 是否可访问 | 用途 |
|------|-----------|------|
| Exa Search API | ✅ | 跨搜索引擎检索 Google Patents、Exa.ai 专利索引、Justia、PatentsView、xjishu 等结果 |
| Tavily Search API | ✅ | 辅助检索（尤其中文关键词） |
| Google Scholar / ACM DL | ⚠️ 通过搜索索引间接 | 论文日期、DOI |
| USPTO Patent Public Search API | ❌ 返回 SPA 壳 | 无法直接查询 |
| PatentsView API (`search.patentsview.org`) | ❌ 301 重定向，无 JSON | |
| Google Patents XHR 端点 | ❌ 连接超时 | |
| Espacenet / EPO 全文 API | ❌ HTTP 403 / 500 | |
| USPTO 全文文本 HTML | ✅（仅首页框架） | PDF 端点可下载但为扫描版 CCITT 图像 |
| WIPO PatentScope | ⚠️ 仅首页，detail 需 JS | |
| Justia / PatentGuru / FreePatentsOnline / TREA / PatentsEncyclopedia | ⚠️ 多数 403 / 429（Cloudflare/反爬） | 少数 TREA 返回完整页面 |
| xjishu.com（中国专利镜像） | ✅ | 获取 CN 专利公开文本 |
| arXiv / Patsnap Eureka | ⚠️ 部分 | |

### 检索策略
使用 exa / tavily 组合以下关键词（中英文）：

- `"polyglot file" patent`
- `polyglot file format patent claim`
- `GIFAR patent Billy Rios Nate McFeters`
- `"multiple file formats" single file patent`
- `"file that is both" image archive patent`
- `image appended data ZIP archive patent`
- `self-extracting archive patent`
- `compound document patent format`
- `JPEG ZIP polyglot patent`
- `PDF ZIP polyglot patent`
- `双格式文件 专利` / `图片 压缩包 合一 专利`
- `polyglot 文件 专利` / `多种文件格式 单文件 专利`
- `CN116472526A 华为 专利`（通过反向发现）
- `US8271544` / `US10972746` / `US11386205`（通过直接编号验证）
- 各 prior art 事件（Black Hat 2008、PoC||GTFO 0x06/0x07、corkami/pocs、SSTIC 2013、ACM CCS 2013）

### 检索局限性
- **不能直接下载 USPTO 原始全文 PDF**（为 CCITT G4 扫描图像，OCR 未启用；pymupdf 安装失败因系统 Python 环境限制）。
- **无法绕过 Google Patents / Espacenet / Justia 的 Cloudflare 保护**，故无法读取专利完整权利要求书全文（仅能从搜索引擎摘要 + 部分镜像推断权利要求内容）。
- **未尝试付费数据库**（Darts-ip、Innography、Lens.org 注册墙后）、**未查阅 EPO Register / CNIPA 原始文献**。
- **美国联邦巡回法院判决** 对具体 patent eligibility 的案例研究仅基于搜索结果片段，未拉取完整 Opinion 原文。
- **中国专利审查实践** 的描述基于 CNIPA 英文官方介绍，未检索 CNIPA 审查指南 2023 版 pdf 原文。

---

## 直接相关的专利

目前未发现任何已授权专利的权利要求明确指向「一个字节流同时作为两种独立文件格式（例如既是有效 PNG 又是有效 ZIP）且两种标准解析器无需定制逻辑即可分别正确解析」的技术。下列专利是检索到的**最相关**条目，但均存在重要区别。

| 专利号 | 标题 | 申请人 | 申请日 | 公开日 | 状态 | 与 polyglot 文件的关联 |
|--------|------|--------|--------|--------|------|---------------------|
| US8271544B2 | Data file having more than one mode of operation | Creative Technology Ltd | 2009-05-01 | 2012-09-18 | 已授权 | 图像组件 + 追加数据组件（如 MP3）；依赖"图像 EOF 后再接数据"。不是真正的双格式文件——标准 ZIP 解析器不会打开它。[来源](https://exa.ai/library/legal/patent/kj2vzgr8mvw2g5d7bldckt) |
| US9009123B2 | Method of combining image files and other files | Shuttersong Incorporated | 2012-08-31 (优先权) | 2015-04-14 | 已授权 | JPEG EOF 标记后追加非图像数据（音频/文本等）。说明书明确提到"JPEG reader 在 EOF 处停止并忽略后面数据"，且数据容器可使用"标准归档技术"。未声称 ZIP+图像同时有效。[来源](https://trea.com/information/method-of-combining-image-files-and-other-files/patentgrant/0187060f-4496-4436-9e84-d65c381c7289) |
| US10972746B2 | Method of combining image files and other files | Shuttersong Incorporated | 2015-05-29 | 2021-04-06 | 已授权 | 同族延续；权利要求内容基本一致，仍是 EOF-marker-after 方案。[来源](https://trea.com/information/method-of-combining-image-files-and-other-files/patentgrant/0187060f-4496-4436-9e84-d65c381c7289) |
| US11386205B2 | Detection of malicious polyglot files | McAfee, LLC | 2019-01-14 | 2022-07-12 | 已授权 | **检测侧**，不涉及构造 polyglot 文件本身。[来源](https://exa.ai/library/legal/patent/v7zkzs63b3hgrm8jhy7gyh) |
| US10725745B2 | Systems and methods for polyglot analysis | Walmart Apollo, LLC | 2018-05-24 | 2020-07-28 | 已授权 | "Polyglot" 指**多语言计算环境**（跨多种编程语言/平台的编译、分析系统），与文件 polyglot 无关。[来源](https://exa.ai/library/legal/patent/9hgt054tf46wjjf5fkvm7q) |
| CN116472526A | 用于创建、读取和解码以可读取从而根据多种文件格式处理的格式编码的文件的装置和方法 | 华为技术有限公司 | 2020-12-04 (PCT national phase) | 2023-07-25 | **专利申请公开**（非授权） | 提出一种"多格式容器"：通用数据存一份，各格式专有数据分块 + 偏移指针。**目标是存储节省而非让两个独立解析器从同一字节流读出各自有效的文件**。与 true polyglot 不同。[来源](https://www.xjishu.com/zhuanli/55/202080107480.html) |
| CN105354219A | 一种文件编码方法及装置 | 努比亚技术有限公司 | 2015-04-22 | 2016-02-24 | 已授权？（文档未显示失效） | 图片+视频合并为同一文件，在预设文件中添加标识位实现双解析器识别。属于**多媒体捆绑**范畴，而非 image↔archive polyglot。[来源](https://www.xjishu.com/zhuanli/55/CN105354219.html) |

### 关键区别说明

问题所问的"polyglot 文件"的核心特征是：**同一字节序列，被两种各自独立的**标准解码器**同时解读为合法内容**（无需任何定制跳过/偏移逻辑）。典型例子：

- 标准 PNG 解码器读取前若干字节作为图像；
- 标准 ZIP 解码器从文件末尾寻找 EOCD 并正确解压出内部文件，且内部 offset 已根据前置图像字节重新计算。

这种"堆叠"（stack）模式的前提是：两种格式都必须允许在"正常"数据之前有**额外无关字节**。实际上 ZIP 规范本身就支持（PKWARE APPNOTE 6.3.10 第 4.1.9 节明确允许 self-extracting 前缀；ZIP 中央目录记录中的 offset 相对于 archive start 而非文件绝对起点）。PNG/JPEG 的 IDAT/IEND 或 SOFn/SOS 段也会让标准解码器在遇到 EOF 标记后停止，忽略尾部。

**没有任何检索到的专利权利要求覆盖这一特定字节布局构造**——US8271544 和 US9009123 都是"图像 + 后面接数据"的捆绑思路，但并未声称让 ZIP 解析器也能正确识别该文件为 ZIP。

---

## 最接近的现有技术 / 可能覆盖的宽泛专利

### 1. 追加数据型专利（US8271544、US9009123、US10972746）

Creative Technology 的 US8271544 是最早尝试"一个文件两种用途"方向的专利之一（申请于 2009-05-01，授权于 2012-09-18）。其独立权利要求 1 的大致内容是：

> 一种数据文件，具有多个操作模式，所述数据文件包括：图像组件，存储表示所述数据文件的图像；以及一个或多个数据组件，附加到所述图像组件……

说明书进一步描述附加的数据可以是音频（MP3）、视频、文本等。该专利的发明目的是"让移动设备（如 MP3 播放器）用一个文件同时存储图像和音乐"，**而不是**制造一个让图像查看器和归档工具各自独立识别为合法文件的"真 polyglot"。

Shuttersong 的 US9009123/US10972746（2012-08 优先权）则在 JPEG EOF 标记 `0xFFD9` 之后追加数据（音频或带加密的"数据文件容器"）。其权利要求明确写道：

> "a standard image file reader such as Preview®, Paint®, Microsoft® PowerPoint®, or a web browser, may read the attached file as if it were simply an image file. Once the EOF marker is reached, the image file reader stops, and ignores the non-image file data."

这同样不是 polyglot——标准 ZIP 解析器不会把整个文件当作 ZIP 打开。

### 2. 检测侧专利（US11386205）

McAfee 的 US11386205（申请 2019-01-14，授权 2022-07-12）的说明书摘要已明确定义：

> "Generally, a polyglot file is a computer file that conforms to more than one format specification at the same time."

这是**唯一一份明确使用 'polyglot file' 术语的已授权专利**。但它是**检测方法**专利（格式规格分析 + 沙箱测试组合判定），**不主张构造 polyglot 文件的方法或装置**。

### 3. 华为 CN116472526A（多格式容器）

华为于 2020-12-04 提交的专利申请（公开号 CN116472526A）标题字面包含"根据多种文件格式处理"，看起来最相关，但技术实质完全不同：

- 背景技术举的例子是**书籍**可以同时被解析为 PDF / HTML / EPUB / Word。
- 核心方案是：把**多格式通用的数据**（文字、图片）存一份，各格式特有的元数据按块存储，通过元数据部分的**指针**关联。
- 实施例提到基因组文件格式（FASTQ、FASTA、SAM）和文本格式。
- 目标是"不需要将多种文件格式中的任何一种转换为另一种"来**节省存储空间**。

这与 polyglot 文件（同一字节被两种独立解码器各自独立解读）相反——华为方案中每种格式需要**定制解析器**按指针找到对应块；单一字节流本身并不是两种格式的合法实例。

### 4. 其他可能相关的宽泛专利族

| 专利号 | 主题 | 与 polyglot 的相关度 |
|--------|------|---------------------|
| US8407266B1 | 自动将文档保存到多种格式 | 低——格式转换，非同一字节流 |
| US6085199A | 多格式分发文件 | 低——多份副本分发 |
| US11258922B2 | 图像文件 + 其他文件组合 | 中——与 US9009123 同族，但重点在图像+非图像合并 |
| US11330031B2 | 图像数据 + 其他数据类型编码 | 低——嵌入辅助信息，非双格式并行有效 |
| WO2021/xxxx | （待查） | — |

---

## 公开披露时间线 (Prior Art Timeline)

> 来源主要基于后台研究员通过 Exa/Tavily 索引检索所得，每条均有对应 URL。未获直接访问确认的条目已标注。

| 日期 | 公开披露内容 | 来源 |
|------|-------------|------|
| 1989-02-01 | PKZIP 0.90 发布，ZIP 格式诞生 | [fileformats.archiveteam.org](http://fileformats.archiveteam.org/wiki/PKZIP) |
| 1989-07-21 | PKZIP 1.01/1.02 引入 MAKESFX.COM → PKSFX.PRG 自解压 EXE（可执行 stub + ZIP overlay） | [justsolve.archiveteam.org](http://justsolve.archiveteam.org/wiki/Self-extracting_ZIP) |
| 1990-03-15 | PKZIP 1.10 新增 2934 字节 mini-PKSFX，不再需要 PKSFX.PRG | [files.mpoli.fi](https://files.mpoli.fi/unpacked/software/misc/pj2/pkz110.exe/whatsnew.110) |
| 1990-05 | Info-ZIP UnZip 3.0 首发，附 `unzipsfx`（自解压 stub for prepending to ZIP archives） | [infozip.sourceforge.net](https://infozip.sourceforge.net/Info-ZIP2.html), [man.archlinux.org](https://man.archlinux.org/man/unzipsfx.1.en.raw) |
| **2001-11-08/12** | **vuln-dev 邮件组线程 "Infected jpeg files?"**：Pete Simpson 发帖 `copy apic.jpg + bo2k.zip bo2k.jpg /b` —— JPEG 正常显示，WinZip 可打开附加的 ZIP；帖子称该技巧"已用于伪装盗版软件已久"。**这是能找到的最早书面公开记录**。 | [seclists.org/vuln-dev/2001/Nov/107](https://seclists.org/vuln-dev/2001/Nov/107) |
| 2006-10-16/17 | Terminally Incoherent "Poor Man's Steganography"；Lifehacker "Hide files in JPEG images"，大众化传播 `cat / copy /b` 技巧 | [terminally-incoherent.com](https://www.terminally-incoherent.com/blog/2006/10/16/poor-mans-steganography/), [lifehacker.com](https://lifehacker.com/hide-files-in-jpeg-images-207905) |
| 2007-11 | CERT VU#715737（Firefox `jar:` URI XSS）；gnucitizen (pdp) "Java JAR Attacks and Features" —— JAR 与图像的混合（"JPGAR"），先于 GIFAR | [gnucitizen.org](https://www.gnucitizen.org/blog/java-jar-attacks-and-features/), [kb.cert.org VU#715737](https://www.kb.cert.org/vuls/id/715737) |
| **2008-08-01/02** | **GIFAR 公开**：InfoWorld、Ars Technica 率先报道；John Heasman 博客"On GIFARs"详细解释；Billy Rios & Nate McFeters 构建 GIF+JAR 攻击 | [infoworld.com](https://www.infoworld.com/article/2653025/a-photo-that-can-steal-your-online-credentials.html), [arstechnica.com](https://arstechnica.com/information-technology/2008/08/newly-found-hybrid-attack-embeds-java-applet-in-gif-file/), [heasman.blogspot.com](http://heasman.blogspot.com/2008/08/on-gifars.html) |
| **2008-08-06/07** | **Black Hat USA 2008 Briefings**："Extreme Client-Side Exploitation"（McFeters, Carter, Heasman）正式演讲 GIFAR | [Black Hat schedule](https://blackhat.com/html/bh-usa-08/bh-usa-08-schedule.html), [slides PDF](https://blackhat.com/presentations/bh-usa-08/McFeters_Carter_Heasman/BH_US_08_Mcfeters_Carter_Heasman_Extreme_Client-Side_Exploitation.pdf) |
| 2008-12-03/05 | Sun Alert 244988 + CVE-2008-5343 修复 GIFAR | [Oracle Sun Alert 1019738.1](https://download.oracle.com/sunalerts/1019738.1.html), [NVD CVE-2008-5343](https://nvd.nist.gov/vuln/detail/CVE-2008-5343) |
| 2010 | Sundareswaran & Squicciarini, "Image repurposing for Gifar-based attacks"（CEAS 会议） | [CiteSeerX](http://citeseerx.ist.psu.edu/viewdoc/summary?doi=10.1.1.297.4607) |
| 2013-06-05 | **SSTIC 2013** Ange Albertini "Polyglottes binaires et implications"（PE/Java/HTML/PDF/ZIP） | [sstic.org](https://www.sstic.org/2013/presentation/polyglottes_binaires_et_implications/) |
| 2013-11 | **ACM CCS 2013** Magazinius, Rios, Sabelfeld "Polyglots: Crossing Origins by Crossing Formats"（首篇学术 polyglot 论文） | [ACM DL](https://dl.acm.org/doi/10.1145/2508859.2516685) |
| 2014-06 | PoC||GTFO 0x04 "How to Manually Attach a File to a PDF" | [mcfp.felk.cvut.cz](https://mcfp.felk.cvut.cz/publicDatasets/pocorgtfo/contents/articles/04-12.pdf) |
| 2014-11 | PoC||GTFO 0x06 "This TAR archive is a PDF! (as well as a ZIP…)" | [mcfp.felk.cvut.cz](https://mcfp.felk.cvut.cz/publicDatasets/pocorgtfo/contents/articles/06-04.pdf) |
| 2014-12-29 | **31C3** Ange Albertini "Funky File Formats" | [media.ccc.de](https://media.ccc.de/v/31c3_-_5930_-_en_-_saal_6_-_201412291400_-_funky_file_formats_-_ange_albertini) |
| **2015-03** | **PoC||GTFO 0x07** 第 6 篇文章 "Abusing file formats; or, Corkami, the Novella"（Ange Albertini）；README 称 truepolyglot 工具"See POC||GTFO 07"。**注意：0x07 中没有名为 "True Polyglot" 的文章，该名称不存在。** | [pocorgtfo.reilly.io](https://pocorgtfo.reilly.io/), [mcfp.felk.cvut.cz](https://mcfp.felk.cvut.cz/publicDatasets/pocorgtfo/contents/articles/07-06.pdf) |
| 2015-03-26 | GitHub 仓库 `corkami/pocs` 建立（含 `poly/` 目录下的多格式 PoC）；`corkami/polyglot` **不存在**（API 404） | [api.github.com/repos/corkami/pocs](https://api.github.com/repos/corkami/pocs) |
| 2016-12-01 | PortSwigger (Gareth Heyes) "Bypassing CSP using polyglot JPEGs" | [portswigger.net](https://portswigger.net/research/bypassing-csp-using-polyglot-jpegs) |
| 2019-07-10 | `ansemjo/truepolyglot` GitHub 仓库建立（PDF+ZIP polyglot 生成器） | [api.github.com/repos/ansemjo/truepolyglot](https://api.github.com/repos/ansemjo/truepolyglot) |
| 2022-03-15 / 2022-08-04 | Koch et al. arXiv 2203.07561 "Toward the Detection of Polyglot Files"（PNNL） | [arXiv](https://arxiv.org/abs/2203.07561), [doi.org](https://doi.org/10.1145/3546096.3546106) |
| 2024-05-27 | `gildas-lormeau/Polyglot-HTML-ZIP-PNG`（SingleFile 作者；HTML/ZIP/PNG 多格式教程+生成器） | [api.github.com/repos/gildas-lormeau/Polyglot-HTML-ZIP-PNG](https://api.github.com/repos/gildas-lormeau/Polyglot-HTML-ZIP-PNG) |
| 2024-07 | Koch et al. arXiv 2407.01529 "Where the Polyglots Are" | [arXiv](https://arxiv.org/abs/2407.01529) |

**结论**：最关键的 prior art 是 **2001-11 的 vuln-dev 邮件帖**（`copy apic.jpg + bo2k.zip bo2k.jpg /b`），距今已超过 20 年。所有已检索到的专利的申请日（2009、2012、2015、2018、2019、2020）均在该 prior art 之后。

---

## 各法域的专利适格性问题

> 以下为事实性概述，非法律意见。每个司法管辖区的具体适用需结合个案与最新判例。

### 🇺🇸 美国（USPTO / 联邦巡回法院）

- **法律依据**：35 U.S.C. § 101 + `Alice Corp. v. CLS Bank Int'l`, 573 U.S. 208 (2014) 两步法。
- **Step 2A**：若权利要求"Directed to an abstract idea"（如数学公式、组织人类活动、 mental process），则进入 Step 2B。
- **Step 2B**："Significantly more" than the abstract idea — 需要 "inventive concept"（ unconventional technology, improvement to computer functionality, etc.）。
- 对"文件追加/格式组合"这类权利要求，法院已有先例：
  - `Enfish, LLC v. Microsoft Corp.`, 822 F.3d 1327 (Fed. Cir. 2016)：改进数据库自引用表结构 → **eligible**（改善计算机自身功能）。
  - `McRO, Inc. v. Bandai Namco Games`, 837 F.3d 1299 (Fed. Cir. 2016)：特定规则改善动画 lip-sync → eligible。
  - `TLI Communications v. AV Automotive`, 823 F.3d 607 (Fed. Cir. 2016)：数字图像采集+存储 → **ineligible**（generic computer）。
  - `Intellectual Ventures I v. Capital One`, 792 F.3d 1363 (Fed. Cir. 2015)："sorting and hiding spam" → ineligible。
- **对本技术的判断**：单纯的"把 ZIP 数据拼到图像文件后面"属于通用计算机操作，缺少"改善计算机功能"的具体技术手段，大概率会在 Step 2A 被认定为抽象思想，Step 2B 也难通过。但若权利要求限定了一套**具体的偏移重定位算法、中央目录偏移修正机制、图像解码器跳过策略**，并有实验数据证明"标准解码器无需修改即可同时解读"，则有可能通过 Enfish/McRO 路径。

**参考**：
- [Alice Corp. v. CLS Bank](https://www.law.cornell.edu/supremecourt/text/13-298)
- [MPEP § 2106 (Nov 2024)](https://www.bitlaw.com/source/mpep/2106.html)

### 🇨🇳 中国（CNIPA）

- **法律依据**：《专利法》第 25 条第 1 款第（二）项（智力活动的规则和方法不授予专利权）+ 《专利审查指南》第二部分第九章（涉及计算机程序的发明）。
- 2023 年修订、2024-01-20 生效的新《审查指南》进一步明确：涉及算法/商业规则/方法的发明，**如果包含技术特征、解决技术问题、产生技术效果，可授予专利权**。
- 对"文件格式拼接"：
  - 若仅声称"把文件 A 和文件 B 合并成一个文件"，属于**纯数据组织规则** → 可能被认定为智力活动规则，驳回。
  - 若限定具体技术步骤（如 ZIP 中央目录 offset 偏移量计算、图像 EOF 扫描策略、特定字节位置对齐），并声称由此带来的技术效果（如**减少传输次数、绕过检测**），则可能满足"三要素"。
- **但 prior art 是更直接的问题**：CNIPA 审查中新颖性/创造性判断严格参照现有技术，2001 年的邮件组帖子、2008 年的 GIFAR 公开、2013-2015 年的学术论文都已构成充分的 prior art。即便权利要求措辞严谨，也极难通过创造性审查。

**参考**：
- [CNIPA 英文版《涉及计算机程序的发明专利申请审查指南》](https://english.cnipa.gov.cn/transfer/patentexamination/referencematerials/970008.htm)
- [CNIPA 2023 审查指南修改解读（2024-01-18）](https://www.cnipa.gov.cn/art/2024/1/18/art_2199_189877.html)

### 🇪🇺 欧洲（EPO）

- **法律依据**：《欧洲专利公约》（EPC）第 52 条：程序"as such"不专利化；但**技术发明**可专利。
- **Comvik 方法**（T 641/00, OJ 2003, 352）：权利要求同时包含技术特征和非技术特征时，**只有技术特征对创造性有贡献**；非技术特征（如商业方法、审美安排、游戏规则）被视已知。
- EPO Guidelines G-II, 3.6：计算机实现的发明要具备**技术效果**（technical effect）才可能授权。"数据格式本身"通常不被视为技术特征，除非带来"进一步的技术效果"（如压缩率提高、存储密度增加）。
- 对"polyglot 文件"：
  - 若权利要求仅是"一种方法，把图像字节和归档字节组合成单一字节流" → 大概率被视为**non-technical 数据组织规则** → 不满足 Art. 52(1) EPC。
  - 若权利要求限定具体的字节布局方案（如 ZIP EOCD 寻址方式、IDAT 跳过策略）并声称由此带来的**解码性能提升、检测规避、带宽节省**等技术效果，则可能具备技术性，仍须过 novelty/inventive step。
- **McAfee US11386205 的检测专利**（EPO 同族若存在）更可能通过，因为检测恶意文件属于明确的技术领域。

**参考**：
- EPO Guidelines G-II, 3.6 (via search index): [https://www.epo.org/en/legal/guidelines-epc/2025/g_ii_3_6_1.html](https://www.epo.org/en/legal/guidelines-epc/2025/g_ii_3_6_1.html)（403，仅索引命中）
- Comvik T 641/00 (via search index): [https://www.epo.org/en/legal/case-law/2025/clr_i_d_9_2_1.html](https://www.epo.org/en/legal/case-law/2025/clr_i_d_9_2_1.html)（403，仅索引命中）

---

## 检索的局限性

1. **不能直接访问 Google Patents / Espacenet / USPTO 原始文档服务器**：均返回 403 / 超时 / SPA，无法拉取完整说明书或 claims。本报告的专利描述均来自搜索引擎摘要与部分镜像站（Exa.ai、TREA、xjishu），无法替代官方原始文本。
2. **USPTO 全文 PDF 为 CCITT G4 扫描图像**：即使能下载到，本机也无 OCR 工具链（`pdftotext`/`mutool`/`pymupdf` 均不可用）。无法验证权利要求精确措辞。
3. **仅覆盖了英文/中文关键词**，未全面筛查日文/韩文/德文专利数据库（如 J-PlatPat、KIPRIS、EPO register）。因此**可能存在非英文语种下的相关专利未被发现**。
4. **未查阅 PCT 国际检索报告（ISR）或各国国家阶段审查意见通知书**：专利可能已被审查员引用 prior art 并限缩权利要求至窄范围，甚至被驳回。本搜索只拿到公开文本。
5. **未尝试 Lens.org、Darts-ip、IFI Claims、Derwent Innovation 等付费数据库**。
6. **法律部分**：依据搜索引擎返回的法条/指南摘要撰写，非经律师核验，可能已过时或断章取义。
7. **时间截止**：本报告覆盖的公开资料截止到 2026 年 9 月（基于模型知识截止日期与实际搜索时间），此后的新公开/授权未被纳入。

---

## 参考来源

### 专利
- [US8271544B2 — Data file having more than one mode of operation (Creative Technology)](https://exa.ai/library/legal/patent/kj2vzgr8mvw2g5d7bldckt)
- [US9009123B2 / US10972746B2 — Method of combining image files and other files (Shuttersong)](https://trea.com/information/method-of-combining-image-files-and-other-files/patentgrant/0187060f-4496-4436-9e84-d65c381c7289)
- [US11386205B2 — Detection of malicious polyglot files (McAfee)](https://exa.ai/library/legal/patent/v7zkzs63b3hgrm8jhy7gyh)
- [US10725745B2 — Systems and methods for polyglot analysis (Walmart Apollo)](https://exa.ai/library/legal/patent/9hgt054tf46wjjf5fkvm7q)
- [CN116472526A — 用于创建、读取和解码以可读取从而根据多种文件格式处理的格式编码的文件的装置和方法 (Huawei)](https://www.xjishu.com/zhuanli/55/202080107480.html)
- [CN105354219A — 一种文件编码方法及装置 (Nubia)](https://www.xjishu.com/zhuanli/55/CN105354219.html)

### 公开披露（Prior Art）
- [vuln-dev 2001-11 "Infected jpeg files?"](https://seclists.org/vuln-dev/2001/Nov/107) — 最早书面记录
- [Lifehacker 2006-10 "Hide files in JPEG images"](https://lifehacker.com/hide-files-in-jpeg-images-207905)
- [Terminally Incoherent 2006-10-16 "Poor Man's Steganography"](https://www.terminally-incoherent.com/blog/2006/10/16/poor-mans-steganography/)
- [gnucitizen 2007-11 "Java JAR Attacks and Features" (pdp)](https://www.gnucitizen.org/blog/java-jar-attacks-and-features/)
- [InfoWorld 2008-08-01 "A photo that can steal your online credentials"](https://www.infoworld.com/article/2653025/a-photo-that-can-steal-your-online-credentials.html)
- [Ars Technica 2008-08-01 "Newly-found hybrid attack embeds Java applet in GIF file"](https://arstechnica.com/information-technology/2008/08/newly-found-hybrid-attack-embeds-java-applet-in-gif-file/)
- [Black Hat USA 2008 schedule + slides (McFeters, Carter, Heasman)](https://blackhat.com/html/bh-usa-08/bh-usa-08-schedule.html) / [slides PDF](https://blackhat.com/presentations/bh-usa-08/McFeters_Carter_Heasman/BH_US_08_Mcfeters_Carter_Heasman_Extreme_Client-Side_Exploitation.pdf)
- [Sun Alert 244988 / CVE-2008-5343](https://download.oracle.com/sunalerts/1019738.1.html) / [NVD](https://nvd.nist.gov/vuln/detail/CVE-2008-5343)
- [SSTIC 2013 — Ange Albertini "Polyglottes binaires et implications"](https://www.sstic.org/2013/presentation/polyglottes_binaires_et_implications/)
- [ACM CCS 2013 — Magazinius, Rios, Sabelfeld "Polyglots: Crossing Origins by Crossing Formats"](https://dl.acm.org/doi/10.1145/2508859.2516685)
- [PoC||GTFO index](https://pocorgtfo.reilly.io/)（Issue 0x06 2014-11, Issue 0x07 2015-03）
- [corkami/pocs GitHub](https://api.github.com/repos/corkami/pocs)
- [PortSwigger 2016-12 "Bypassing CSP using polyglot JPEGs"](https://portswigger.net/research/bypassing-csp-using-polyglot-jpegs)
- [ansemjo/truepolyglot GitHub](https://api.github.com/repos/ansemjo/truepolyglot)
- [gildas-lormeau/Polyglot-HTML-ZIP-PNG GitHub](https://api.github.com/repos/gildas-lormeau/Polyglot-HTML-ZIP-PNG)
- [arXiv 2203.07561 / 2407.01529 (Koch et al.)](https://arxiv.org/abs/2407.01529)

### 法律与审查指南
- [Alice Corp. v. CLS Bank Int'l, 573 U.S. 208 (2014)](https://www.law.cornell.edu/supremecourt/text/13-298)
- [MPEP § 2106 (November 2024) — Patent Subject Matter Eligibility](https://www.bitlaw.com/source/mpep/2106.html)
- [CNIPA — Examination Practices on the Invention Applications Relating to Computer Programs (English)](https://english.cnipa.gov.cn/transfer/patentexamination/referencematerials/970008.htm)
- [CNIPA 2023 审查指南修改解读（第四部分）](https://www.cnipa.gov.cn/art/2024/1/18/art_2199_189877.html)
- [EPO Guidelines G-II, § 3.6 (via search index)](https://www.epo.org/en/legal/guidelines-epc/2025/g_ii_3_6_1.html)（403）
- [EPO Comvik T 641/00 (via search index)](https://www.epo.org/en/legal/case-law/2025/clr_i_d_9_2_1.html)（403）
- [PKZIP history (fileformats.archiveteam.org)](http://fileformats.archiveteam.org/wiki/PKZIP)
- [Just Solve — Self-extracting ZIP](http://justsolve.archiveteam.org/wiki/Self-extracting_ZIP)
- [Info-ZIP history](https://infozip.sourceforge.net/Info-ZIP2.html)
- [unzipsfx(1) man page (Venea)](https://www.venea.net/man/unzipsfx(1))

---

*本报告基于截至 2026 年 9 月的网络检索，不构成法律意见。专利权利要求的解释、有效性判断与侵权分析应由执业律师或专利代理师基于官方原始文本作出。*
