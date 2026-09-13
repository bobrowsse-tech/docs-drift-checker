# Docs Drift Checker

Flags JSDoc that no longer matches the TypeScript signature — renamed `@param`s, missing params, widened/narrowed `@returns` — as Problems diagnostics on the doc comment.

## Install

```bash
git clone https://github.com/bobrowsse-tech/docs-drift-checker.git
cd docs-drift-checker
npm install
npm run package
npx @vscode/vsce package --no-dependencies
code --install-extension docs-drift-checker-0.1.0.vsix
```

Or press **F5** after `npm install`.

## Use

| Action | What it does |
|---|---|
| **Scan Docs Drift** | Walks documented functions under the workspace tsconfig |
| **Open Mismatch** | Jumps to the JSDoc / signature |
| **Suppress** | Appends an id to `.docsdrift-ignore` |

Behavioral/doc-body drift is out of scope (v2). Agents can call `docs_drift_scan` (report-only).

## How it’s built

TypeScript Compiler API + esbuild; diagnostics use VS Code’s Problems panel with `--vscode-*` themed dashboard CSS.

```bash
npm run watch
npm run test:unit
npm run package
```

## License

MIT

## Contributing

Changes to `main` must go through a pull request. See [CONTRIBUTING.md](./CONTRIBUTING.md).

### Extension Development Host

With the local suite umbrella checked out, press **F5** (**Extension + playground**) to load `../playgrounds/docs-drift-checker/` as the test workspace.
