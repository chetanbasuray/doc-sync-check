# doc-sync-check

> **Stop documentation drift in its tracks.**

`doc-sync-check` is a fast, specialized CLI tool that statically analyzes your TypeScript and JavaScript (JSDoc) codebase using an Abstract Syntax Tree (AST). It scans your Markdown files for exported symbols and ensures that documented signatures match source code.

If you update a parameter or return type in your code but forget to update the documentation, `doc-sync-check` will catch it and fail your CI build, reminding your team to keep the docs in sync!

## 🚀 Installation

You can install `doc-sync-check` globally, but it is recommended to add it as a `devDependency` to your project and run it via an npm script or CI pipeline.

```bash
npm install -D doc-sync-check
```

## 🛠️ Usage

Run `doc-sync-check` by pointing it to your source code directory and specifying your documentation folder.

```bash
npx doc-sync-check <source-dir> --docs <docs-dir>
```

### Options
- `<source-dir>`: The root directory containing your TypeScript files.
- `--docs, -d`: The path to the folder containing your Markdown documentation files. Defaults to `./docs`.
- `--include, -i`: One or more glob patterns for documentation files. Overrides `--docs`.
- `--strict, -s`: If set, the CLI will exit with code 1 if any documentation drift is detected. Defaults to `false`.
- `--cache`: Enables incremental caching so unchanged files are skipped.
- `--coverage-out`: Writes coverage output to a file.
- `--coverage-format`: `json` (default), `sonar`, or `cobertura`.
- `--fix-docs`: Auto-trims inline markdown signature blocks.
- `--check-descriptions`: Compares JSDoc descriptions against markdown text.
- `--update-readme`: Updates function list between README markers.
- `--config`: Path to the config file (default: `.doc-sync-checkrc.json`).
- `--init`: Writes a starter `.doc-sync-checkrc.json`.
- `--slack-webhook` and `--discord-webhook`: Sends drift failure notifications.

### Configuration file

If a `.doc-sync-checkrc.json` file is present (or one is passed via `--config`), its
values are loaded automatically. Explicit command-line flags always take precedence
over the config file, which in turn takes precedence over the built-in defaults.

```json
{
  "include": ["docs/**/*.md", "README.md"],
  "strict": true,
  "cache": true,
  "coverageOut": "./coverage/doc-coverage.json",
  "coverageFormat": "json"
}
```

### Example
```bash
npx doc-sync-check src --docs docs
```

```bash
npx doc-sync-check src --include "docs/**/*.md" "README.md" --strict
```

## 🧠 How it Works

1. **Extraction**: The parser walks your source AST and extracts exported symbols:
   - exported functions
   - exported interfaces (including property/method types)
   - exported classes and class methods (excluding private methods)
   - exported type aliases
   - exported enums/constants
   - namespace exports
2. **Normalization**: Signatures are converted to single-line forms so multiline declarations still match docs reliably.
3. **Drift Detection**: Any Markdown file mentioning a detected symbol by exact name should include the up-to-date signature. Missing or stale signatures are flagged. With `--strict`, drift returns exit code `1`.

## Integrations

- Docusaurus/VuePress markdown patterns are supported by default.
- Coverage can be exported in Sonar/Cobertura-friendly formats.
- Drift failures can notify Slack/Discord webhooks.
- VSCode extension scaffold is available under `.vscode-extension/`.

## Website

A simple project website scaffold is available in `website/` for GitHub Pages.

## README Sync Section

You can auto-populate this section with `--update-readme`.

<!-- DOC_SYNC_FUNCTIONS_START -->
- `extractSignatures(code: string): FunctionSignature[]`
- `checkDrift(signatures: FunctionSignature[], docs: string | string[]): Promise<DriftResult>`
<!-- DOC_SYNC_FUNCTIONS_END -->

## 🤝 Contributing

We welcome community contributions! Please check out our [Contributing Guide](CONTRIBUTING.md) to get started on setting up the repository, running tests, and understanding the architecture.

## 📄 License

This project is licensed under the [MIT License](LICENSE).
