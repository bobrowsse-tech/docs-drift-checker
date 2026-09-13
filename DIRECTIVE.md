
# Build Directive — Docs-to-Code Drift Checker

> Rank **#7** in the Unbuilt VS Code Tools roadmap. This directive is written for an AI coding agent (Claude Code, Copilot agent mode, or a human following along) to execute directly. The `docs-drift-checker/` folder next to this file already contains a working scaffold — activation, side-panel dashboard, command registration, and a Language Model Tool stub — generated per the shared conventions in `../AGENTS.md`. Everything marked `TODO` below is the real remaining work.

## 1. Objective

Diff the structured fields of a function's doc comment (params, return type, declared thrown errors) against its actual TypeScript signature, catching the reliable, mechanical half of documentation drift as a v1, with deeper behavioral drift explicitly scoped as a higher-risk v2.

## 2. Why this doesn't already exist

Doc linters (ESLint's jsdoc plugin and similar) check comment syntax — a missing @param tag — not whether the documented contract still matches the real one after a refactor.

## 3. VS Code surfaces this extension uses

- **Activity bar view container**: `docs-drift-checkerContainer` (icon: `book`)
- **Side panel dashboard**: `docs-drift-checkerView`, a `WebviewViewProvider` — see `src/dashboardProvider.ts`
- **Commands**: `docsDrift.scan`, `docsDrift.viewMismatches`, `docsDrift.suppress`
- **Language Model Tool**: `check_docs_drift` — see `src/lmTool.ts` and `contributes.languageModelTools` in `package.json`. This is what lets Copilot Chat, Claude Code, or any other MCP/agent-aware surface invoke this extension's core action conversationally instead of the user hunting for the right command.

## 4. Dashboard (side panel) spec

The sidebar webview is the primary UI. It must show, at minimum, the buttons below plus a status/summary area above them (current scan state, last-run timestamp, or a short result summary — specifics depend on the feature, see phase notes).

| Button | Command | Behavior |
|---|---|---|
| **Scan Doc Comments** | `docsDrift.scan` | Walks the workspace extracting every JSDoc-documented function and comparing its documented params/return type against the real signature. |
| **View Mismatches** | `docsDrift.viewMismatches` | Lists every drifted doc comment with a side-by-side of documented vs. actual, and a jump-to-source link. |
| **Suppress** | `docsDrift.suppress` | Marks a specific mismatch as intentional (e.g. a deliberately loose public-facing type) so it stops being reported. |

Buttons call `vscode.commands.executeCommand`, not the tool logic directly — keep exactly one implementation of the core logic (a plain TypeScript service module with no VS Code imports) called from three places: the command handler, the dashboard's message handler, and the Language Model Tool's `invoke`. Do not fork the logic across these three entry points.

## 5. Implementation phases

1. **Doc comment extraction** — Use the TypeScript Compiler API's `ts.getJSDocTags`/`ts.getJSDocParameterTags` (or `comment-parser` for non-TS JSDoc-style comments) to pull structured fields per documented function: `{params: [{name, type}], returns: {type}, throws: [string]}`.
2. **Signature extraction** — For the same function, get its real signature via `TypeChecker.getSignatureFromDeclaration` and `typeToString` for each parameter and the return type.
3. **Structural diff** — Compare param names in order (catches reordering/renaming without doc updates), param types (catches a widened/narrowed type left undocumented), and return type. Emit a diagnostic via `vscode.languages.createDiagnosticCollection` at the doc comment's location, not the function body, so it reads naturally in the Problems panel.
4. **Behavioral drift (v2, scoped explicitly)** — Comparing documented *behavior* (e.g. 'throws on invalid input' vs. what the function actually does) requires semantic understanding beyond structural diffing — treat this as a distinct, LLM-assisted follow-on capability with its own false-positive budget, not part of the v1 diagnostic engine, and say so in the UI so users trust the structural findings fully.
5. **Dashboard wiring** — WebviewView list of mismatches: function name, file, a compact documented-vs-actual diff, jump link, and a 'suppress' action; a scan button and last-scanned timestamp.
6. **Language Model Tool** — Register `check_docs_drift` so an agent doing a documentation pass gets a concrete, evidence-backed list instead of having to re-read every file.
7. **Tests** — Fixture functions covering: a clean match, a renamed param left undocumented, a widened return type, and a suppressed case, asserting exactly the expected diagnostics remain.

## 6. Suggested dependencies

`typescript`, `comment-parser`

Install as regular `dependencies` (already stubbed into `package.json` — replace the `"latest"` version pins with the actual resolved versions once installed, per the pinning convention in `AGENTS.md`).

## 7. Edge cases & safety notes

- Generic types and overloaded functions need their own comparison branch — a naive string comparison of `typeToString` output will false-positive on cosmetically different but equivalent generic instantiations; normalize before comparing.
- Auto-generated doc comments (from an api-extractor or typedoc pass) should be excluded by default via a configurable glob, since they're derived from the signature and can't drift from it.

## 8. Definition of done

- [ ] Core logic lives in a VS Code-free service module, unit-tested against fixtures (see phase notes above for what fixtures to build).
- [ ] All buttons in the dashboard spec are wired to real behavior, not the placeholder `showInformationMessage` stub.
- [ ] The Language Model Tool calls the same service module and returns a concise, agent-readable text result (not raw JSON dumped as text).
- [ ] No destructive or external-write action (file rewrite, PR post, process kill) runs without an explicit user-initiated click — the LM tool path in particular must stay read/report-only unless the directive above says otherwise.
- [ ] `npm run package` produces a `dist/extension.js` with no bundling warnings; `vsce package` produces a `.vsix` that installs cleanly via `code --install-extension`.
- [ ] README.md (user-facing, not this directive) documents what the extension does in plain language, per `AGENTS.md`'s copy conventions.
    