# Release Guide

## Overview

This project uses [Changesets](https://github.com/changesets/changesets) for version management and automated publishing. The entire flow is CI-driven — once the initial setup is done, releasing is just a PR.

## Packages

| Package                   | Published? | Scope                    |
| ------------------------- | ---------- | ------------------------ |
| `@polyglot-img/sdk`       | ✅ public  | Main SDK                 |
| `@polyglot-img/cli`       | ✅ public  | CLI tool                 |
| `@polyglot-img/browser`   | ✅ public  | Browser bundle           |
| `@polyglot-img/binary`    | ❌ private | Internal utility         |
| `@polyglot-img/core`      | ❌ private | Internal engine          |
| `@polyglot-img/formats-*` | ❌ private | Internal format adapters |

## First-time setup (one-time, requires human)

### 1. npm login

```bash
npm login --registry=https://registry.npmjs.org
```

This must be run **interactively** (with a TTY). It establishes your npm account trust and stores a token in `~/.npmrc`.

### 2. Configure Trusted Publishing on npmjs.com

The CI publishes with **npm Trusted Publishing (OIDC)** — no npm token or GitHub secret is used. For each of the three publishable packages, add this repo as a trusted publisher on npmjs.com:

> **npmjs.com → package → Settings → Trusted Publisher → Add new**
>
> - Provider: `GitHub Actions`
> - Organization/User: `axetroy`
> - Repository: `polyglot`
> - Workflow filename: `release.yml`

All fields are case-sensitive and must match exactly (including the `.yml` extension).

### 3. No secrets needed

`npm publish --provenance` reads the GitHub Actions OIDC token automatically — the workflow only needs `permissions: id-token: write`, which is already set in `.github/workflows/release.yml`. No `NPM_TOKEN` secret or any other env vars are required.

## Releasing a new version

### Step 1: Create a changeset

In your feature branch, before merging to `main`:

```bash
npx changeset
```

This launches an interactive wizard asking:

- Which packages changed?
- What kind of change? (`patch` / `minor` / `major`)
- A description for the changelog

The wizard creates a `.changeset/xxxx-slug.md` file. Commit it along with your feature changes.

### Step 2: Merge to main

Open a PR with the changeset, get it reviewed and merged. The CI runs full tests.

### Step 3: CI auto-publishes

When the version-bump commit lands on `main`, the **Release** workflow triggers:

1. Builds all packages
2. Publishes `@polyglot-img/sdk`, `@polyglot-img/cli`, `@polyglot-img/browser` to npm with `--provenance`
3. Creates a git tag `vX.Y.Z`

No manual intervention needed.

## Verification

After publish, verify:

```bash
npm view @polyglot-img/sdk versions        # should show the new version
npm view @polyglot-img/sdk dist-tags       # should show "latest"
gh run view $(gh run list --limit 1 --json databaseId --jq '.[0].databaseId')  # check CI
```

## Troubleshooting

### `npm ERR! You must sign your package(s) with a provenance...`

Your npm account hasn't been set up for provenance yet. Run `npm login` on a local machine with a TTY. The first successful publish from a new account enables provenance.

### `npm ERR! ENEEDAUTH: Unable to authenticate`

Publishing uses npm Trusted Publishing (OIDC), so there is no token to fix. Check that the trusted publisher is configured for each package on npmjs.com with the exact workflow filename `release.yml` (including the `.yml` extension — all fields are case-sensitive), and that the workflow has `id-token: write` permission.

### Changeset PR not created

Check that `.changeset/*.md` files exist and are valid:

```bash
npx changeset status
```

### CI runs publish on every commit

The `if:` condition checks for `"chore: version bump"` in the commit message. If it triggers unexpectedly, check the CI run logs.
