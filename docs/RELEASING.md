# Releasing

This project publishes GitHub releases using semantic versioning.

## Versioning policy

- `MAJOR` - breaking changes in runtime behavior, tool contract, or required configuration
- `MINOR` - backward-compatible features or provider/runtime capability additions
- `PATCH` - backward-compatible bug fixes, docs, and packaging fixes

Tag format:

- `vX.Y.Z`

## Preconditions

- Working tree is clean.
- `CHANGELOG.md` has a new version section.
- Version in `package.json` matches intended release.

## Prepare release assets (local)

```bash
npm install --no-audit --no-fund
npm run release:prep
```

This generates:

- `dist/opencode-codebase-search-vX.Y.Z.tar.gz`

## Asset contents

Release tarball intentionally includes runtime/distribution files only:

- `.opencode/**`
- `README.md`
- `CHANGELOG.md`
- `codebase-search.settings.example.jsonc`

Excluded from release assets:

- `docs/plans/**`
- test fixtures and test evidence
- local/personal settings

## Current target

- First public tag target: `v0.1.0`
- This repository currently prepares artifacts and release notes only; release creation is manual.

## Publish (manual)

1. Create and push tag `vX.Y.Z`.
2. Create GitHub release from the tag.
3. Upload `dist/opencode-codebase-search-vX.Y.Z.tar.gz`.
4. Paste release notes from the matching `CHANGELOG.md` section.

Do not create releases from unverified or dirty trees.
