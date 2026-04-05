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

Run `doc-sync-check` by pointing it to your source code directory and specifying your documentation folder.

```bash
npx doc-sync-check <source-dir> --docs <docs-dir>
```

### Options
- `<source-dir>`: The root directory containing your TypeScript files.
- `--docs, -d`: The path to the folder containing your Markdown documentation files. Defaults to `./docs`.

### Example
```bash
npx doc-sync-check src --docs docs
```

## 🧠 How it Works

1. **Extraction**: Parsers comb through your target TypeScript directory looking for exported functions.
2. **Analysis**: The script breaks apart definitions into precise semantic substrings (e.g. tracking `userAuth(uuid: string, options?: any): boolean | void`).
3. **Drift Detection**: Any Markdown file mentioning a detected function name by exact match must also include its corresponding up-to-date signature. If it doesn't, the CLI flags a drift warning and immediately fails the process (Exit Code 1).

## 🤝 Contributing

We welcome community contributions! Please check out our [Contributing Guide](CONTRIBUTING.md) to get started on setting up the repository, running tests, and understanding the architecture.

## 📄 License

This project is licensed under the [MIT License](LICENSE).
