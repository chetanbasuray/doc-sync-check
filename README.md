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
- `--annotate`: Emits GitHub Actions annotations and a job summary. Auto-enabled when running under GitHub Actions; use `--no-annotate` to turn it off.
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

### GitHub Actions

Under GitHub Actions, drift, undocumented, and unused-block findings are emitted
as annotations that appear inline on the pull request diff, and a summary table
is written to the job summary. Annotations are on automatically when
`GITHUB_ACTIONS` is set; pass `--annotate`/`--no-annotate` to force it either way.

```yaml
name: docs
on: [pull_request]
jobs:
  drift:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - run: npx doc-sync-check src --include "docs/**/*.md" "README.md" --strict
```

When a documented signature is stale, the output also prints the exact
up-to-date signature to paste into the docs.

## JSON report schema

The default `--coverage-format json` output carries a `schemaVersion` so
consumers can detect the format. The current version is `1`:

```json
{
  "schemaVersion": 1,
  "hasDrift": true,
  "documentedSymbols": 8,
  "inSyncSymbols": 7,
  "driftedSymbols": 1,
  "undocumentedSymbols": 2,
  "unusedDocBlocks": ["removedFn(x: string): boolean"],
  "coveragePercent": 80,
  "descriptionDriftSymbols": [],
  "findings": [
    {
      "kind": "drift",
      "severity": "error",
      "symbol": "createUser",
      "file": "docs/api.md",
      "line": 14,
      "expected": "createUser(input: CreateUserInput): Promise<User>",
      "message": "'createUser' is mentioned in documentation, but its up-to-date signature was not found."
    }
  ]
}
```

`findings[]` entries have `kind` (`drift`, `undocumented`, `unused-doc-block`,
`description-drift`), `severity` (`error` or `warning`), and, where known,
`symbol`, `file`, `line`, and `expected`. The `sonar` format carries the same
`schemaVersion`. `schemaVersion` is bumped only when the shape changes.

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
