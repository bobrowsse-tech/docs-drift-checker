import * as vscode from 'vscode';
import { DashboardProvider } from './dashboardProvider';
import { registerCheckDocsDriftTool } from './lmTool';
import { DocsDriftService, type DocMismatch, type DocsDriftReport } from './service';

const LAST_REPORT_KEY = 'docsDrift.lastReport';
const SELECTED_KEY = 'docsDrift.selectedId';

function workspaceRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

function createService(): DocsDriftService | undefined {
  const root = workspaceRoot();
  if (!root) {
    vscode.window.showErrorMessage('Docs Drift Checker needs an open workspace folder.');
    return undefined;
  }
  return new DocsDriftService(root);
}

export function activate(context: vscode.ExtensionContext) {
  const dashboard = new DashboardProvider(context.extensionUri);
  const diagnostics = vscode.languages.createDiagnosticCollection('docsDrift');
  context.subscriptions.push(diagnostics);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('docs-drift-checkerView', dashboard)
  );

  const applyDiagnostics = (report: DocsDriftReport) => {
    diagnostics.clear();
    const byFile = new Map<string, vscode.Diagnostic[]>();
    const root = workspaceRoot();
    if (!root) {
      return;
    }
    for (const m of report.mismatches) {
      const range = new vscode.Range(
        Math.max(0, m.line - 1),
        m.column,
        Math.max(0, m.line - 1),
        m.column + 2
      );
      const diag = new vscode.Diagnostic(
        range,
        `${m.message} (doc: ${m.documented} | code: ${m.actual})`,
        vscode.DiagnosticSeverity.Warning
      );
      diag.source = 'docs-drift';
      diag.code = m.kind;
      const uri = vscode.Uri.file(`${root}/${m.file}`);
      const list = byFile.get(uri.toString()) ?? [];
      list.push(diag);
      byFile.set(uri.toString(), list);
    }
    for (const [uriStr, diags] of byFile) {
      diagnostics.set(vscode.Uri.parse(uriStr), diags);
    }
  };

  const setReport = (report: DocsDriftReport) => {
    void context.workspaceState.update(LAST_REPORT_KEY, report);
    applyDiagnostics(report);
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('docsDrift.scan', async (payload?: { scope?: string }) => {
      const service = createService();
      if (!service) {
        return undefined;
      }
      dashboard.setSummary('Scanning doc comments…');
      try {
        const report = service.scan({ scopeGlob: payload?.scope });
        setReport(report);
        dashboard.showReport(report);
        dashboard.setSummary(
          `${report.mismatches.length} mismatch(es) · ${report.documentedFunctions} documented · suppressed ${report.suppressed}`
        );
        return report;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        dashboard.setSummary(`Scan failed: ${msg}`);
        vscode.window.showErrorMessage(msg);
        return undefined;
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('docsDrift.viewMismatches', async () => {
      let report = context.workspaceState.get<DocsDriftReport>(LAST_REPORT_KEY);
      if (!report) {
        report = await vscode.commands.executeCommand<DocsDriftReport | undefined>('docsDrift.scan');
      }
      if (!report) {
        return;
      }
      dashboard.showReport(report);
      await vscode.commands.executeCommand('docs-drift-checkerView.focus');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('docsDrift.suppress', async (payload?: { id?: string }) => {
      const service = createService();
      const report = context.workspaceState.get<DocsDriftReport>(LAST_REPORT_KEY);
      if (!service) {
        return;
      }
      let id = payload?.id ?? context.workspaceState.get<string>(SELECTED_KEY);
      if (!id) {
        const pick = await vscode.window.showQuickPick(
          (report?.mismatches ?? []).map((m) => ({
            label: m.functionName,
            description: m.kind,
            detail: `${m.file}:${m.line} — ${m.message}`,
            id: m.id,
          })),
          { title: 'Suppress which mismatch?' }
        );
        if (!pick) {
          return;
        }
        id = pick.id;
      }
      const file = service.suppress(id);
      vscode.window.showInformationMessage(`Suppressed in ${file}`);
      const refreshed = service.scan();
      setReport(refreshed);
      dashboard.showReport(refreshed);
      dashboard.setSummary(
        `${refreshed.mismatches.length} mismatch(es) remaining · suppressed ${refreshed.suppressed}`
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('docsDrift.jumpTo', async (payload?: DocMismatch) => {
      const root = workspaceRoot();
      const m =
        payload ??
        context.workspaceState
          .get<DocsDriftReport>(LAST_REPORT_KEY)
          ?.mismatches.find((x) => x.id === context.workspaceState.get<string>(SELECTED_KEY));
      if (!root || !m) {
        return;
      }
      const uri = vscode.Uri.file(`${root}/${m.file}`);
      const doc = await vscode.workspace.openTextDocument(uri);
      const editor = await vscode.window.showTextDocument(doc);
      const pos = new vscode.Position(Math.max(0, m.line - 1), m.column);
      editor.selection = new vscode.Selection(pos, pos);
      editor.revealRange(new vscode.Range(pos, pos));
    })
  );

  dashboard.onSelect((id) => {
    void context.workspaceState.update(SELECTED_KEY, id);
  });

  registerCheckDocsDriftTool(context, () => createService(), setReport, dashboard);
}

export function deactivate() {}
