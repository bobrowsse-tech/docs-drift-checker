export type {
  ActualContract,
  DocMismatch,
  DocsDriftReport,
  DocumentedContract,
  DocParam,
  MismatchKind,
} from './types';
export { IGNORE_FILENAME } from './types';

export { scanDocsDrift } from './scan';
export type { ScanOptions } from './scan';
export { appendSuppression, ignorePath, isSuppressed, readSuppressions } from './suppress';

import { scanDocsDrift, type ScanOptions } from './scan';
import { appendSuppression } from './suppress';
import type { DocsDriftReport, DocMismatch } from './types';

/**
 * VS Code–free docs drift service. Suppress writes are for the dashboard path;
 * the LM tool stays report-only.
 */
export class DocsDriftService {
  constructor(private readonly root: string) {}

  scan(options: ScanOptions = {}): DocsDriftReport {
    return scanDocsDrift(this.root, options);
  }

  suppress(mismatchId: string): string {
    return appendSuppression(this.root, mismatchId);
  }

  formatReport(report: DocsDriftReport): string {
    const lines = [
      `Docs drift scan at ${report.scannedAt}`,
      `Files: ${report.scannedFiles}, documented functions: ${report.documentedFunctions}`,
      `Mismatches: ${report.mismatches.length} (suppressed: ${report.suppressed})`,
      '',
    ];
    if (!report.mismatches.length) {
      lines.push('No structural docs drift found.');
    }
    for (const m of report.mismatches) {
      lines.push(`[${m.kind}] ${m.functionName} @ ${m.file}:${m.line}`);
      lines.push(`  documented: ${m.documented}`);
      lines.push(`  actual:     ${m.actual}`);
      lines.push(`  ${m.message}`);
    }
    if (report.notes.length) {
      lines.push('', 'Notes:', ...report.notes.map((n) => `- ${n}`));
    }
    return lines.join('\n');
  }

  formatMismatch(m: DocMismatch): string {
    return `${m.functionName} (${m.kind}): doc="${m.documented}" vs code="${m.actual}" @ ${m.file}:${m.line}`;
  }
}
