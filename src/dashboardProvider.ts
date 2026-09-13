import * as vscode from 'vscode';
import type { DocsDriftReport } from './service';

const BUTTONS: { label: string; command: string }[] = [
  { label: 'Scan Doc Comments', command: 'docsDrift.scan' },
  { label: 'View Mismatches', command: 'docsDrift.viewMismatches' },
  { label: 'Suppress', command: 'docsDrift.suppress' },
];

export class DashboardProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private summary = 'No scan run yet.';
  private report?: DocsDriftReport;
  private selectHandler?: (id: string) => void;

  constructor(private readonly extensionUri: vscode.Uri) {}

  onSelect(handler: (id: string) => void) {
    this.selectHandler = handler;
  }

  resolveWebviewView(webviewView: vscode.WebviewView) {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this.getHtml();
    webviewView.webview.onDidReceiveMessage((message) => {
      if (message.type === 'runCommand') {
        void vscode.commands.executeCommand(message.command, message.payload);
      } else if (message.type === 'select') {
        this.selectHandler?.(message.id);
      } else if (message.type === 'jump') {
        void vscode.commands.executeCommand('docsDrift.jumpTo', message.mismatch);
      } else if (message.type === 'suppress') {
        void vscode.commands.executeCommand('docsDrift.suppress', { id: message.id });
      }
    });
    if (this.report) {
      this.showReport(this.report);
    }
  }

  setSummary(text: string) {
    this.summary = text;
    this.post({ type: 'summary', text });
  }

  showReport(report: DocsDriftReport) {
    this.report = report;
    this.post({
      type: 'report',
      report: {
        scannedAt: report.scannedAt,
        notes: report.notes,
        mismatches: report.mismatches,
      },
    });
  }

  private post(message: unknown) {
    void this.view?.webview.postMessage(message);
  }

  private getHtml(): string {
    const buttonsHtml = BUTTONS.map(
      (b) => `<button data-command="${b.command}">${b.label}</button>`
    ).join('\n');
    const nonce = String(Date.now());
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 8px; font-size: var(--vscode-font-size); }
    button {
      display: block; width: 100%; margin-bottom: 6px; padding: 6px 10px;
      background: var(--vscode-button-background); color: var(--vscode-button-foreground);
      border: none; border-radius: 4px; cursor: pointer; text-align: left;
    }
    button:hover { background: var(--vscode-button-hoverBackground); }
    button.secondary {
      display: inline-block; width: auto; margin: 0 4px 0 0; padding: 2px 8px; font-size: 0.75em;
      background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground);
    }
    #summary { margin: 8px 0 12px; font-size: 0.85em; color: var(--vscode-descriptionForeground); }
    .row { border-bottom: 1px solid var(--vscode-widget-border, transparent); padding: 6px 0; }
    .row.selected { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
    .kind { text-transform: uppercase; font-size: 0.7em; color: var(--vscode-editorWarning-foreground); }
    .diff { font-size: 0.75em; font-family: var(--vscode-editor-font-family); color: var(--vscode-descriptionForeground); white-space: pre-wrap; }
    .hint { font-size: 0.75em; color: var(--vscode-descriptionForeground); margin-top: 8px; }
  </style>
</head>
<body>
  <div id="summary">${escapeHtml(this.summary)}</div>
  ${buttonsHtml}
  <div id="list"></div>
  <p class="hint">v1 is structural only (params / return). Behavioral docs drift is explicitly out of scope. Diagnostics appear in the Problems panel on the doc comment.</p>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const listEl = document.getElementById('list');
    const summaryEl = document.getElementById('summary');
    document.querySelectorAll('button[data-command]').forEach((btn) => {
      btn.addEventListener('click', () => vscode.postMessage({ type: 'runCommand', command: btn.dataset.command }));
    });
    function esc(s) {
      return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }
    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.type === 'summary') summaryEl.textContent = msg.text;
      if (msg.type === 'report') {
        listEl.innerHTML = '';
        for (const m of msg.report.mismatches) {
          const div = document.createElement('div');
          div.className = 'row';
          div.innerHTML =
            '<div><span class="kind">' + esc(m.kind) + '</span> <strong>' + esc(m.functionName) + '</strong> <span class="hint">' + esc(m.file) + ':' + m.line + '</span></div>' +
            '<div class="diff">doc:  ' + esc(m.documented) + '\\ncode: ' + esc(m.actual) + '</div>';
          const actions = document.createElement('div');
          const jump = document.createElement('button');
          jump.className = 'secondary';
          jump.textContent = 'Jump';
          jump.addEventListener('click', (e) => { e.stopPropagation(); vscode.postMessage({ type: 'jump', mismatch: m }); });
          const sup = document.createElement('button');
          sup.className = 'secondary';
          sup.textContent = 'Suppress';
          sup.addEventListener('click', (e) => { e.stopPropagation(); vscode.postMessage({ type: 'suppress', id: m.id }); });
          actions.appendChild(jump);
          actions.appendChild(sup);
          div.appendChild(actions);
          div.addEventListener('click', () => {
            listEl.querySelectorAll('.row').forEach((x) => x.classList.remove('selected'));
            div.classList.add('selected');
            vscode.postMessage({ type: 'select', id: m.id });
          });
          listEl.appendChild(div);
        }
      }
    });
  </script>
</body>
</html>`;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
