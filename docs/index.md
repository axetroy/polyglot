---
layout: home

hero:
  name: Polyglot
  text: 一个文件，两种格式
  tagline: 将 PNG / JPEG 图片与 ZIP 压缩包合成为单个文件 —— 图片查看器显示图片，解压工具读取归档。
  actions:
    - theme: brand
      text: 快速开始
      link: /guide/getting-started
    - theme: alt
      text: 在线 Playground
      link: /playground
    - theme: alt
      text: GitHub
      link: https://github.com/axetroy/polyglot

features:
  - icon: 🖼️
    title: 字节级保真
    details: 前端图像字节原样保留，不重新编码。图片的像素、元数据、色彩空间完全不变。
  - icon: 📦
    title: 标准 ZIP 归档
    details: 后端是合法的 ZIP（STORED 存储方式），unzip、Python zipfile、7-Zip 均可直接读取。
  - icon: 🔐
    title: 默认安全
    details: 内置条目数量、单条目大小、总大小上限与路径穿越防护，防止解压炸弹攻击。
  - icon: 🌐
    title: 浏览器可用
    details: 纯 Uint8Array 实现，无 Node Buffer 依赖，Playground 完全在本地运行，文件不上传。
  - icon: 🧩
    title: 可扩展适配器
    details: 前端 / 后端格式以适配器注册，新增格式无需改动引擎核心。
  - icon: 📘
    title: TypeScript 优先
    details: 全量类型定义，ESM 原生，支持 Node 20+ 与打包器 tree-shaking。
---
