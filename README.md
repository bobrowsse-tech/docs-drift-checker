# Docs-to-Code Drift Checker

Flags when a function’s JSDoc no longer matches its real TypeScript signature — renamed params, type drift, return-type changes.

1. **Scan Doc Comments** — structural compare of `@param` / `@returns` vs the live signature.
2. **View Mismatches** — documented vs actual side-by-side with jump-to-source.
3. **Suppress** — append to `.docsdrift-ignore` for intentional mismatches.

Diagnostics land on the doc comment in the Problems panel. Behavioral docs drift is explicitly **out of scope for v1**.

Agents can call `check_docs_drift` for a report-only list (suppress stays a human click).

## Development

```bash
npm install
npm run watch
npm run test:unit
```

Press `F5` in VS Code to launch an Extension Development Host.

## License

MIT
