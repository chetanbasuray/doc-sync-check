# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

## 1.6.0 (2026-07-16)

### Features

- load `.doc-sync-checkrc.json` automatically and add a `--config` flag for a custom path; command-line flags override the config file, which overrides the built-in defaults

### Bug Fixes

- exclude `return` statements inside nested function scopes when inferring a function's return type (follow-up to #35)
- match deprecated symbols documented without the `[deprecated]` marker, removing false drift and unused-doc-block reports (follow-up to #33)
- exit with a non-zero code when the CLI fails with an unexpected error

### Documentation

- document the configuration file and `--config` flag

## 1.5.0 (2026-06-21)

### Features

- improve npm and GitHub discoverability metadata (#117)

### Tests

- add regression tests for markdown signature normalization (#96, #118)

## 1.4.0 (2026-05-24)

### Features

- add JavaScript and JSDoc parsing support in the extractor pipeline (#51)
- export AST logic via the `src/ast/` entrypoint to decouple it from the CLI (#48)
- add Sonar and Cobertura coverage export formats (#47)
- add incremental scan caching via `.doc-sync-cache.json` (#46)
- add Slack and Discord webhook notifications on drift failures (#45)
- add the `--init` setup command for first-time users (#44)
- scan TS/JS trees and retain imported type names in signatures (#43)
- add `--fix-docs` auto-normalization for inline signature formatting (#42)
- add Docusaurus/VuePress markdown pattern defaults (#40)
- automate the README signature section via `--update-readme` markers (#39)
- add optional JSDoc description synchronization checks via `--check-descriptions` (#38)

### Documentation

- add a website scaffold with a GitHub Pages workflow (#54)
- add a VSCode extension scaffold (#41)

## 1.3.0 (2026-05-01)

### Features

- support namespace exports (#37)
- detect unused documentation blocks (#36)
- infer return types when no explicit annotation is present (#35)
- support enums and constant values (#34)
- detect and flag deprecated symbols (#33)
- generate a documentation coverage badge (#32)
- support union and intersection types (#31)
- handle rest parameters (#30)
- validate optional versus required parameters (#29)
- compare parameter default values (#28)

### Bug Fixes

- resolve duplicate function names across namespaces (#56)

### Performance

- switch to the SWC parser for faster execution (#53)

### Documentation

- add contribution guidelines for AST changes (#49)

## 1.2.0 (2026-04-22)

### Features

- expand AST extraction to include exported interfaces, classes, class methods, and type aliases
- support interface/class generics and class method overload declarations
- parse abstract class methods and decorator metadata in extracted signatures

### Bug Fixes

- prevent private class methods from being surfaced in documentation drift checks
- normalize multiline signatures to stable one-line comparison format

### Documentation

- refresh README usage and extraction details for the 1.2.0 symbol coverage

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
