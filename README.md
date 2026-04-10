# doc-sync-check

> **Stop documentation drift in its tracks.**

`doc-sync-check` is a fast, specialized CLI tool that statically analyzes your TypeScript codebase using an Abstract Syntax Tree (AST). It scans your Markdown files for function names and ensures that the documented function signatures match the actual source code perfectly. 

If you update a parameter or return type in your code but forget to update the documentation, `doc-sync-check` will catch it and fail your CI build, reminding your team to keep the docs in sync!

## 🚀 Installation

You can install `doc-sync-check` globally, but it is recommended to add it as a `devDependency` to your project and run it via an npm script or CI pipeline.

```bash
npm install -D doc-sync-check
```

## 🛠️ Usage

### Drift check

Run `doc-sync-check` by pointing it to your source code directory and specifying your documentation folder.

```bash
npx doc-sync-check <source-dir> --docs <docs-dir>
```

#### Options
- `<source-dir>`: The root directory containing your TypeScript files.
- `--docs, -d`: Path to the folder containing your Markdown documentation files. Defaults to `./docs`.
- `--include, -i`: One or more custom glob patterns for documentation files (overrides `--docs`).
- `--strict, -s`: Exit with code `1` if any documentation drift is detected. Defaults to `false`.

#### Examples
```bash
npx doc-sync-check src --docs docs
npx doc-sync-check src --include "docs/**/*.md" "README.md" --strict
```

---

### Install Git pre-commit hook

Automatically enforce drift checks before every commit by installing a Git pre-commit hook.

```bash
npx doc-sync-check install-hook
```

This writes `.git/hooks/pre-commit` with the following content:

```sh
#!/bin/sh
npx doc-sync-check src --strict
```

The hook is made executable (`chmod +x`) and `.gitignore` is updated to exclude any backup files.

#### Options
- `--force, -f`: Overwrite an existing pre-commit hook without prompting. Defaults to `false`.

#### Examples
```bash
# Install the hook (fails if one already exists)
npx doc-sync-check install-hook

# Overwrite an existing hook
npx doc-sync-check install-hook --force
```

#### What it does
1. Looks for `.git/` in the current working directory — exits with an error if not found.
2. Creates `.git/hooks/` if it doesn't exist.
3. Writes the pre-commit hook script and sets it executable.
4. Appends a `.git/hooks/pre-commit.bak` entry to `.gitignore` (creates the file if absent, never duplicates the entry).

## 🧠 How it Works

1. **Extraction**: Parsers comb through your target TypeScript directory looking for exported functions.
2. **Analysis**: The script breaks apart definitions into precise semantic substrings (e.g. tracking `userAuth(uuid: string, options?: any): boolean | void`).
3. **Drift Detection**: Any Markdown file mentioning a detected function name by exact match must also include its corresponding up-to-date signature. If it doesn't, the CLI flags a drift warning. If the `--strict` flag is used, it also fails the process (Exit Code 1).

## 🤝 Contributing

We welcome community contributions! Please check out our [Contributing Guide](CONTRIBUTING.md) to get started on setting up the repository, running tests, and understanding the architecture.

## 📄 License

This project is licensed under the [MIT License](LICENSE).
