# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

## 1.1.0 (2026-04-11)

### Features

- add support for custom glob patterns for doc files (`--glob`) to cover flexible doc locations (#9)
- add `--strict` flag to fail the build when drift is detected (#8)
- integrate CI drift detection failure handling for GitHub Actions (#7)
- provide a pre-commit hook installer command for local drift checks (#55)
- add docker image packaging flow for CI use (#52)

### Bug Fixes

- ensure semantic-release has required `GITHUB_TOKEN` permissions in CI
- upgrade Node target in CI to match semantic-release requirements

### Documentation

- add docs for localized documentation folders (#57)
### [1.0.1](https://github.com/chetanbasuray/doc-sync-check/compare/v1.0.0...v1.0.1) (2026-04-05)

## 1.0.0 (2026-04-05)


### Features

* **core:** implement doc drift detector and reorganize CLI structure ([f4ac89a](https://github.com/chetanbasuray/doc-sync-check/commit/f4ac89a2eb2946e0dafb8d614911ab8a77584faa))
