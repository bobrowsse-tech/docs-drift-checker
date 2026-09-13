import * as fs from 'fs';
import * as path from 'path';
import { IGNORE_FILENAME } from './types';

export function ignorePath(root: string): string {
  return path.join(root, IGNORE_FILENAME);
}

/** One id per line: file:function:kind or function:kind */
export function readSuppressions(root: string): Set<string> {
  const file = ignorePath(root);
  if (!fs.existsSync(file)) {
    return new Set();
  }
  return new Set(
    fs
      .readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'))
  );
}

export function appendSuppression(root: string, id: string): string {
  const file = ignorePath(root);
  const existing = readSuppressions(root);
  if (existing.has(id)) {
    return file;
  }
  const prefix =
    fs.existsSync(file) && !fs.readFileSync(file, 'utf8').endsWith('\n') ? '\n' : '';
  fs.appendFileSync(file, `${prefix}${id}\n`, 'utf8');
  return file;
}

export function isSuppressed(ids: Set<string>, mismatchId: string): boolean {
  if (ids.has(mismatchId)) {
    return true;
  }
  // Also allow suppressing by function name alone
  const parts = mismatchId.split(':');
  if (parts.length >= 2) {
    const fn = parts[parts.length - 2];
    const kind = parts[parts.length - 1];
    if (ids.has(`${fn}:${kind}`) || ids.has(fn)) {
      return true;
    }
  }
  return false;
}
