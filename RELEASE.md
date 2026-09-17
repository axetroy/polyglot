# Release Guide

## Overview

This project uses [Changesets](https://github.com/changesets/changesets) for version management and automated publishing. The entire flow is CI-driven — once the initial setup is done, releasing is just a PR.

## Packages

| Package               | Published? | Scope                    |
| --------------------- | ---------- | ------------------------ |
| `@polyglot/sdk`       | ✅ public  | Main SDK                 |
| `@polyglot/cli`       | ✅ public  | CLI tool                 |
| `@polyglot/browser`   | ✅ public  | Browser bundle           |
| `@polyglot/binary`    | ❌ private | Internal utility         |
| `@polyglot/core`      | ❌ private | Internal engine          |
| `@polyglot/formats-*` | ❌ private | Internal format adapters |

## First-time setup (one-time, requires human)

### 1. npm login

```bash
npm login --registry=https://registry.npmjs.org
```

This must be run **interactively** (with a TTY). It establishes your npm account trust and stores a token in `~/.npmrc`.

### 2. Create GitHub secret

Copy the token from `~/.npmrc` (`//registry.npmjs.org/:_authToken=...`) and add it to GitHub:

> **Repository Settings → Secrets and variables → Actions → New repository secret**
>
> - Name: `NPM_TOKEN`
> - Value: the `_authToken` value (without the `//registry.npmjs.org/:_authToken=` prefix)

### 3. No other env vars needed

The `--provenance` flag works out of the box in GitHub Actions: npm reads the OIDC token automatically from the runner environment. No extra secrets or configuration required.

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
2. Publishes `@polyglot/sdk`, `@polyglot/cli`, `@polyglot/browser` to npm with `--provenance`
3. Creates a git tag `vX.Y.Z`

No manual intervention needed.

## Verification

After publish, verify:

```bash
npm view @polyglot/sdk versions        # should show the new version
npm view @polyglot/sdk dist-tags       # should show "latest"
gh run view $(gh run list --limit 1 --json databaseId --jq '.[0].databaseId')  # check CI
```

## Troubleshooting

### `npm ERR! You must sign your package(s) with a provenance...`

Your npm account hasn't been set up for provenance yet. Run `npm login` on a local machine with a TTY. The first successful publish from a new account enables provenance.

### `npm ERR! Missing: NPM_TOKEN`

The `NPM_TOKEN` GitHub secret is not set or has expired. Regenerate a fine-grained PAT on npmjs.com with `Publish` scope and update the secret.

### Changeset PR not created

Check that `.changeset/*.md` files exist and are valid:

```bash
npx changeset status
```

### CI runs publish on every commit

The `if:` condition checks for `"chore: version bump"` in the commit message. If it triggers unexpectedly, check the CI run logs.
