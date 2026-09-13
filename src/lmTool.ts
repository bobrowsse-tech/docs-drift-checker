import * as vscode from 'vscode';
import type { DocsDriftService, DocsDriftReport } from './service';
import type { DashboardProvider } from './dashboardProvider';

interface ToolInput {
  scope?: string;
}

/**
 * Report-only — suppress stays behind an explicit dashboard/command click.
 */
export function registerCheckDocsDriftTool(
  context: vscode.ExtensionContext,
  getService: () => DocsDriftService | undefined,
  setReport: (report: DocsDriftReport) => void,
  dashboard: DashboardProvider
) {
  context.subscriptions.push(
    vscode.lm.registerTool('check_docs_drift', {
      async invoke(
        options: vscode.LanguageModelToolInvocationOptions<ToolInput>,
        _token: vscode.CancellationToken
      ) {
        const service = getService();
        if (!service) {
          return textResult('No workspace folder is open.');
        }
        try {
          const report = service.scan({ scopeGlob: options.input?.scope });
          setReport(report);
          dashboard.showReport(report);
          dashboard.setSummary(`${report.mismatches.length} mismatch(es)`);
          return textResult(service.formatReport(report));
        } catch (err) {
          return textResult(err instanceof Error ? err.message : String(err));
        }
      },
    })
  );
}

function textResult(text: string): vscode.LanguageModelToolResult {
  return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(text)]);
}
