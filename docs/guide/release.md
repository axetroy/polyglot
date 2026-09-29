# 发布指南

本文档说明如何将 `@polyglot-img/*` 包发布到 npm。整个流程由 CI 驱动，开发者只需创建一个 PR。

## 可发布的包

| 包                        | 发布？ | 说明           |
| ------------------------- | ------ | -------------- |
| `@polyglot-img/sdk`       | ✅     | 主 SDK         |
| `@polyglot-img/cli`       | ✅     | CLI 工具       |
| `@polyglot-img/browser`   | ✅     | 浏览器 bundle  |
| `@polyglot-img/binary`    | ❌     | 内部工具包     |
| `@polyglot-img/core`      | ❌     | 内部引擎       |
| `@polyglot-img/formats-*` | ❌     | 内部格式适配器 |

只发布 3 个面向用户的包，其余作为内部依赖跟随 SDK 版本管理。

## 前置准备（仅需一次）

### 1. npm 登录

```bash
npm login --registry=https://registry.npmjs.org
```

必须在有 TTY 的终端中交互式运行。这会在 `~/.npmrc` 中写入你的认证 token。

### 2. 在 npmjs.com 配置 Trusted Publisher

CI 通过 **npm Trusted Publishing（OIDC）** 发布——不使用 npm token，也不需要任何 GitHub Secret。需要为 3 个可发布的包分别在 npmjs.com 上配置可信发布者：

> **npmjs.com → 包 → Settings → Trusted Publisher → Add new**
>
> - Provider: `GitHub Actions`
> - Organization/User: `axetroy`
> - Repository: `polyglot`
> - Workflow filename: `release.yml`

所有字段区分大小写，必须与仓库完全一致（包括 `.yml` 扩展名）。

### 3. 确认配置正确

```bash
npx changeset status
```

应显示待发布的包列表（而不是 "No versionable packages found"）。

## 日常发版流程

### 第 1 步：创建 changeset

在功能分支开发完成后、合并到 main 之前：

```bash
npx changeset
```

交互式向导会询问：

- **哪些包有变更？**（用空格选择 `@polyglot-img/sdk`、`@polyglot-img/cli`、`@polyglot-img/browser`）
- **变更类型？**（`patch` 修复 / `minor` 新功能 / `major` 不兼容变更）
- **changelog 描述**

生成一个 `.changeset/xxxx-slug.md` 文件，随代码一起提交。

### 第 2 步：合并到 main

提交 changeset 并开 PR，通过代码审查后合并到 `main`。CI 跑全部测试。

### 第 3 步：自动创建版本 PR

合并后，**Release** workflow 自动运行：

1. 检测到未处理的 changeset
2. 运行 `changeset version` 更新所有包的版本号
3. 自动生成 changelog
4. 创建并推送一个版本 bump PR

检查 GitHub Actions 页面确认 workflow 成功完成。

### 第 4 步：合并版本 PR → 自动发布

合并 Changesets 自动创建的版本 bump PR 到 `main`。触发发布：

1. CI 构建所有包
2. 发布 `@polyglot-img/sdk`、`@polyglot-img/cli`、`@polyglot-img/browser` 到 npm（带 provenance 签名）
3. 创建 Git tag `vX.Y.Z`

**全程无需人工干预。**

## 验证发布

```bash
# 查看版本历史
npm view @polyglot-img/sdk versions

# 确认 latest 标签
npm view @polyglot-img/sdk dist-tags

# 查看 CI 运行记录
gh run list --limit 3
```

## Provenance 说明

发布时使用的 `--provenance` 标志会生成 sigstore 证明，将 npm 包与 GitHub Actions 运行绑定。CI 使用 npm Trusted Publishing（OIDC）认证：GitHub Actions runner 自动提供 OIDC token（工作流需声明 `permissions: id-token: write`），npm CLI 自动读取，无需任何额外 secret。前提是各包已在 npmjs.com 配置 Trusted Publisher（见上文）。

在 npm 包页面可以看到 "Provenance" 徽章，点击可验证构建来源。

## 故障排查

### `changeset status` 显示 "No versionable packages found"

某个要发布的包被标记了 `private: true`。确认 `packages/{sdk,cli,browser}/package.json` 中没有 `"private": true` 字段。

### `changeset add` 交互式向导无法启动

确保在 TTY 环境中运行（不是管道或脚本）。可以在 IDE 终端中直接运行：

```bash
npx changeset add
```

### Release workflow 创建了空 PR（"No commits between branches"）

`.changeset/config.json` 中 `commit` 必须为 `true`。检查：

```json
{
  "commit": true,
  ...
}
```

### npm publish 报错 "You must sign your package(s) with a provenance"

首次从新账号发布时需要完成 npm login 建立信任。运行 `npm login` 后重试。

### 只想发布部分包

在 `.changeset/config.json` 的 `ignore` 列表中加上不想发布的包名：

```json
{
  "ignore": ["@polyglot-img/cli"]
}
```
