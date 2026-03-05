# Changelog

All notable changes to this project are documented in this file.

This project follows Semantic Versioning.

## [Unreleased]

- Repository reorganization for canonical `src/` development + generated `.opencode/` runtime.
- Release packaging scripts and release documentation.

## [0.1.0] - 2026-02-15

- Initial standalone extraction of OpenCode `codebase_search` implementation.
- Tri-mode indexing support: `disabled`, `query`, `background`.
- Roo parity updates:
  - tree-sitter chunking support
  - dimension mismatch recreate behavior
  - `.ignore` directory slash semantics
  - lightweight query-intent reranking (code-first/docs-first)
- Live validation evidence captured under `docs/plans/artifacts/test-evidence/`.
