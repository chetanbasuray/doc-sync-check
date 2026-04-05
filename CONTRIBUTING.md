# Contributing to doc-sync-check

First off, thank you for considering contributing to `doc-sync-check`! It's people like you that make open source such a great community.

## Local Setup

1. Fork and clone the repository.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the builds locally:
   ```bash
   npm run build
   ```

## Development Workflow

This repository enforces **Conventional Commits**. When you make a commit locally, Husky and Commitlint will automatically check your message format before letting the commit proceed.

### Example Commit Messages:
- `feat: added support for parsing interfaces`
- `fix: resolved issue with multi-line regex matching`
- `docs: updated readme with better examples`

## Pull Requests

1. Create a new branch matching your feature/bugfix (`feat/interface-parsing` or `fix/regex-bug`).
2. Include fixtures in `tests/fixtures/src` and `tests/fixtures/docs` that properly evaluate the edge case of your changes.
3. Test your changes manually (automated testing suite is coming soon):
   ```bash
   npm run build
   npx doc-sync-check tests/fixtures/src --docs tests/fixtures/docs
   ```
4. Open a Pull Request referencing any related issues.

## Testing
We are working on integrating a generic testing wrapper like Jest/Vitest soon. For now, rely on standard terminal verification over the fixtures directory.
