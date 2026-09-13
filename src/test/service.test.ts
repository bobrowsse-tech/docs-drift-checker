import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DocsDriftService, scanDocsDrift, appendSuppression } from '../service';

const repo = path.join(__dirname, 'fixtures', 'repo');

describe('scanDocsDrift', () => {
  it('finds clean match, renamed param, widened return, and honors suppressions', () => {
    const report = scanDocsDrift(repo);
    assert.ok(report.documentedFunctions >= 4);

    // clean add — no mismatches for add
    assert.ok(!report.mismatches.some((m) => m.functionName === 'add'));

    // renamed param
    assert.ok(
      report.mismatches.some((m) => m.functionName === 'greet' && m.kind === 'param-name')
    );

    // widened return
    assert.ok(
      report.mismatches.some((m) => m.functionName === 'parse' && m.kind === 'return-type')
    );

    // suppressed loose return-type
    assert.ok(!report.mismatches.some((m) => m.functionName === 'loose'));
    assert.ok(report.suppressed >= 1);

    assert.ok(report.notes.some((n) => /behavioral/i.test(n) || /v2/i.test(n)));
  });
});

describe('DocsDriftService', () => {
  it('formats a report and can append suppressions', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'docsdrift-'));
    try {
      fs.mkdirSync(path.join(dir, 'src'));
      fs.writeFileSync(
        path.join(dir, 'src', 'x.ts'),
        `/**
 * @param oldName
 * @returns string
 */
export function f(newName: number): boolean { return false; }
`
      );
      const service = new DocsDriftService(dir);
      const report = service.scan();
      assert.ok(report.mismatches.length >= 1);
      const id = report.mismatches[0].id;
      appendSuppression(dir, id);
      const again = service.scan();
      assert.ok(again.mismatches.every((m) => m.id !== id));
      assert.match(service.formatReport(report), /mismatch/i);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
