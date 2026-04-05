# doc-sync-check

A documentation drift detector. It uses AST parsing to verify that functions mentioned in your Markdown documentation have correct signatures that map up-to-date with your source code.

## Usage

```bash
npx doc-sync-check <source-dir> --docs <docs-dir>
```

Example:
```bash
npx doc-sync-check src --docs docs
```
