# Release Guide

This document explains how to publish `@polyglot-img/*` packages to npm. The entire flow is CI-driven — developers only need to create a PR.

## Publishable packages

| Package                   | Published? | Description              |
| ------------------------- | ---------- | ------------------------ |
| `@polyglot-img/sdk`       | ✅         | Main SDK                 |
| `@polyglot-img/cli`       | ✅         | CLI tool                 |
| `@polyglot-img/browser`   | ✅         | Browser bundle           |
| `@polyglot-img/binary`    | ❌         | Internal utility         |
| `@polyglot-img/core`      | ❌         | Internal engine          |
| `@polyglot-img/formats-*` | ❌         | Internal format adapters |

Only 3 user-facing packages are published; the rest are internal dependencies managed alongside the SDK version.

## Prerequisites (one-time setup)

### 1. npm login

```bash
npm login --registry=https://registry.npmjs.org
```

Must be run interactively (with a TTY). This writes your auth token to `~/.npmrc`.

### 2. Configure Trusted Publisher on npmjs.com

The CI publishes with **npm Trusted Publishing (OIDC)** — no npm token or GitHub secret is used. For each of the three publishable packages, add this repo as a trusted publisher on npmjs.com:

> **npmjs.com → package → Settings → Trusted Publisher → Add new**
>
> - Provider: `GitHub Actions`
> - Organization/User: `axetroy`
> - Repository: `polyglot`
> - Workflow filename: `release.yml`

All fields are case-sensitive and must match exactly (including the `.yml` extension).

### 3. Verify configuration

```bash
npx changeset status
```

Should show the list of packages to publish (not "No versionable packages found").

## Regular release flow

### Step 1: Create a changeset

After developing your feature branch, before merging to `main`:

```bash
npx changeset
```

The interactive wizard asks:

- **Which packages changed?** (space to select `@polyglot-img/sdk`, `@polyglot-img/cli`, `@polyglot-img/browser`)
- **What kind of change?** (`patch` fix / `minor` feature / `major` breaking change)
- **Changelog description**

A `.changeset/xxxx-slug.md` file is created. Commit it with your feature changes.

### Step 2: Merge to main

Submit a PR with the changeset, get it reviewed and merged. CI runs all tests.

### Step 3: Auto-created version PR

After merge, the **Release** workflow runs automatically:

1. Detects unprocessed changesets
2. Runs `changeset version` to bump all package versions
3. Generates the changelog automatically
4. Creates and pushes a version bump PR

Check the GitHub Actions page to confirm the workflow completed successfully.

### Step 4: Merge version PR → auto-publish

Merge the Changeset-created version bump PR into `main`. This triggers publication:

1. CI builds all packages
2. Publishes `@polyglot-img/sdk`, `@polyglot-img/cli`, `@polyglot-img/browser` to npm (with provenance signing)
3. Creates a Git tag `vX.Y.Z`

**No manual intervention required.**

## Verification

```bash
# View version history
npm view @polyglot-img/sdk versions

# Confirm latest tag
npm view @polyglot-img/sdk dist-tags

# Check CI run
gh run list --limit 3
```

## About Provenance

The `--provenance` flag generates a sigstore attestation that binds the npm package to the GitHub Actions run. The CI authenticates via npm Trusted Publishing (OIDC): the GitHub Actions runner provides an OIDC token automatically (the workflow needs `permissions: id-token: write`), and the npm CLI reads it — no extra secrets required. Prerequisite: each package must have a Trusted Publisher configured on npmjs.com (see above).

On the npm package page you'll see a "Provenance" badge that verifies the build source.

## Troubleshooting

### `changeset status` shows "No versionable packages found"

One of the publishable packages is marked `private: true`. Confirm there's no `"private": true` in `packages/{sdk,cli,browser}/package.json`.

### `changeset add` interactive wizard won't start

Make sure you're running in a TTY environment (not a pipe or script):

```bash
npx changeset add
```

### Release workflow creates empty PR ("No commits between branches")

`commit` in `.changeset/config.json` must be `true`:

```json
{
  "commit": true,
  ...
}
```

### npm publish fails with "You must sign your package(s) with a provenance"

First-time publishers need to complete npm login to establish trust. Run `npm login` and retry.

### Want to publish only some packages

Add packages to the `ignore` list in `.changeset/config.json`:

```json
{
  "ignore": ["@polyglot-img/cli"]
}
```
