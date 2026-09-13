import * as vscode from 'vscode';
import { DashboardProvider } from './dashboardProvider';
import { registerCheckDocsDriftTool } from './lmTool';

export function activate(context: vscode.ExtensionContext) {
  const dashboard = new DashboardProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("docs-drift-checkerView", dashboard)
  );

  context.subscriptions.push(vscode.commands.registerCommand("docsDrift.scan", () => {
    // TODO (Scan Doc Comments): Walks the workspace extracting every JSDoc-documented function and comparing its documented params/return type against the real signature.
    vscode.window.showInformationMessage("Scan Doc Comments \u2014 not yet implemented, see DIRECTIVE.md");
  }));

  context.subscriptions.push(vscode.commands.registerCommand("docsDrift.viewMismatches", () => {
    // TODO (View Mismatches): Lists every drifted doc comment with a side-by-side of documented vs. actual, and a jump-to-source link.
    vscode.window.showInformationMessage("View Mismatches \u2014 not yet implemented, see DIRECTIVE.md");
  }));

  context.subscriptions.push(vscode.commands.registerCommand("docsDrift.suppress", () => {
    // TODO (Suppress): Marks a specific mismatch as intentional (e.g. a deliberately loose public-facing type) so it stops being reported.
    vscode.window.showInformationMessage("Suppress \u2014 not yet implemented, see DIRECTIVE.md");
  }));

  // Exposes the same capability to Copilot Chat / Claude Code / any MCP-aware
  // agent via the Language Model Tool API — see contributes.languageModelTools
  // in package.json and DIRECTIVE.md, section "Language Model Tool".
  registerCheckDocsDriftTool(context);
}

export function deactivate() {}
