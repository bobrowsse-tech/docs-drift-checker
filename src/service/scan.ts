import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';
import type {
  ActualContract,
  DocMismatch,
  DocsDriftReport,
  DocumentedContract,
  DocParam,
} from './types';
import { isSuppressed, readSuppressions } from './suppress';

function normalizeType(t: string | undefined): string {
  if (!t) {
    return '';
  }
  return t
    .replace(/\s+/g, ' ')
    .replace(/import\("[^"]+"\)\./g, '')
    .trim();
}

function typesEqual(a?: string, b?: string): boolean {
  const na = normalizeType(a);
  const nb = normalizeType(b);
  if (!na || !nb) {
    // Missing documented type is not a hard failure for params if name matches
    return true;
  }
  return na === nb || na.replace(/\|/g, ' | ') === nb.replace(/\|/g, ' | ');
}

function extractDocContract(node: ts.Node): DocumentedContract | undefined {
  const params: DocParam[] = [];
  // Prefer attached jsDoc nodes on the declaration when present.
  const attached = (node as ts.FunctionLikeDeclaration & { jsDoc?: ts.JSDoc[] }).jsDoc;
  const tags: ts.JSDocTag[] = attached?.flatMap((j) => j.tags ?? []) ?? [...ts.getJSDocTags(node)];
  if (!tags.length) {
    return undefined;
  }

  for (const tag of tags) {
      const tagName = String(tag.tagName.escapedText ?? tag.tagName.getText());
    if (tagName === 'param' || tagName === 'arg' || tagName === 'argument') {
      if (ts.isJSDocParameterTag(tag)) {
        const name =
          tag.name && ts.isIdentifier(tag.name)
            ? tag.name.text
            : tag.name?.getText() ?? '';
        const type = tag.typeExpression?.type?.getText();
        if (name) {
          params.push({ name, type });
        }
      } else {
        const comment = typeof tag.comment === 'string' ? tag.comment : '';
        const m = comment.match(/^(\S+)/);
        if (m) {
          params.push({ name: m[1] });
        }
      }
    }
  }

  const returnTag =
    tags.find((t) => t.tagName.text === 'returns' || t.tagName.text === 'return') ??
    ts.getJSDocReturnTag(node);
  let returns: string | undefined;
  if (returnTag && ts.isJSDocReturnTag(returnTag)) {
    returns = returnTag.typeExpression?.type?.getText();
  } else if (returnTag && typeof returnTag.comment === 'string') {
    // `@returns string` without brace type — treat comment first token as type
    returns = returnTag.comment.split(/\s+/)[0];
  }

  const throws: string[] = [];
  for (const tag of tags) {
    if (tag.tagName.text === 'throws' || tag.tagName.text === 'exception') {
      throws.push(typeof tag.comment === 'string' ? tag.comment : tag.getText());
    }
  }

  if (!params.length && !returns && !throws.length) {
    return undefined;
  }
  return { params, returns, throws };
}

function extractActual(
  decl: ts.SignatureDeclaration,
  checker: ts.TypeChecker
): ActualContract {
  const sig = checker.getSignatureFromDeclaration(decl);
  const params: DocParam[] = [];
  for (const p of decl.parameters) {
    const name = p.name.getText();
    const type = checker.typeToString(
      checker.getTypeAtLocation(p),
      p,
      ts.TypeFormatFlags.NoTruncation
    );
    params.push({ name: name.replace(/^\.\.\./, ''), type });
  }
  let returns = 'void';
  if (sig) {
    returns = checker.typeToString(
      sig.getReturnType(),
      decl,
      ts.TypeFormatFlags.NoTruncation
    );
  } else if (decl.type) {
    returns = decl.type.getText();
  }
  return { params, returns };
}

function docCommentLine(node: ts.Node, sourceFile: ts.SourceFile): { line: number; column: number } {
  const ranges = ts.getLeadingCommentRanges(sourceFile.getFullText(), node.getFullStart());
  if (ranges?.length) {
    const start = ranges[ranges.length - 1].pos;
    const lc = sourceFile.getLineAndCharacterOfPosition(start);
    return { line: lc.line + 1, column: lc.character };
  }
  const lc = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile, true));
  return { line: lc.line + 1, column: lc.character };
}

function compareContracts(
  functionName: string,
  file: string,
  loc: { line: number; column: number },
  documented: DocumentedContract,
  actual: ActualContract
): DocMismatch[] {
  const mismatches: DocMismatch[] = [];
  const baseId = `${file}:${functionName}`;

  if (documented.params.length && documented.params.length !== actual.params.length) {
    mismatches.push({
      id: `${baseId}:param-count`,
      functionName,
      file,
      line: loc.line,
      column: loc.column,
      kind: 'param-count',
      documented: `${documented.params.length} params (${documented.params.map((p) => p.name).join(', ')})`,
      actual: `${actual.params.length} params (${actual.params.map((p) => p.name).join(', ')})`,
      message: `Param count differs for ${functionName}`,
    });
  }

  const len = Math.min(documented.params.length, actual.params.length);
  for (let i = 0; i < len; i++) {
    const d = documented.params[i];
    const a = actual.params[i];
    if (d.name !== a.name && d.name !== a.name.replace(/^_/, '')) {
      mismatches.push({
        id: `${baseId}:param-name:${i}`,
        functionName,
        file,
        line: loc.line,
        column: loc.column,
        kind: 'param-name',
        documented: d.name,
        actual: a.name,
        message: `Param ${i + 1} documented as "${d.name}" but signature has "${a.name}"`,
      });
    }
    if (d.type && !typesEqual(d.type, a.type)) {
      mismatches.push({
        id: `${baseId}:param-type:${i}`,
        functionName,
        file,
        line: loc.line,
        column: loc.column,
        kind: 'param-type',
        documented: `${d.name}: ${d.type}`,
        actual: `${a.name}: ${a.type}`,
        message: `Param "${a.name}" type drift for ${functionName}`,
      });
    }
  }

  if (documented.returns && !typesEqual(documented.returns, actual.returns)) {
    mismatches.push({
      id: `${baseId}:return-type`,
      functionName,
      file,
      line: loc.line,
      column: loc.column,
      kind: 'return-type',
      documented: documented.returns,
      actual: actual.returns,
      message: `Return type drift for ${functionName}`,
    });
  }

  return mismatches;
}

function shouldSkipFile(rel: string, excludeGlobs: string[]): boolean {
  if (
    rel.includes('node_modules/') ||
    rel.includes('/dist/') ||
    rel.startsWith('dist/') ||
    rel.includes('.git/')
  ) {
    return true;
  }
  for (const g of excludeGlobs) {
    // Simple substring / suffix checks for common generated-doc patterns
    const cleaned = g.replace(/\*\*/g, '').replace(/\*/g, '');
    if (cleaned && rel.includes(cleaned.replace(/^\//, ''))) {
      return true;
    }
    if (g.includes('generated') && rel.includes('generated')) {
      return true;
    }
    if (g.includes('.d.ts') && rel.endsWith('.d.ts')) {
      return true;
    }
  }
  return false;
}

export interface ScanOptions {
  scopeGlob?: string;
  /** Default excludes auto-generated docs. */
  excludeGlobs?: string[];
}

/**
 * Scan a workspace (or directory) for JSDoc structural drift vs TypeScript signatures.
 */
export function scanDocsDrift(root: string, options: ScanOptions = {}): DocsDriftReport {
  root = path.resolve(root);
  const excludeGlobs = options.excludeGlobs ?? [
    '**/generated/**',
    '**/*.d.ts',
    '**/dist/**',
  ];
  const notes = [
    'v1 checks structural JSDoc fields (params / return) only — behavioral drift is a separate v2 concern.',
  ];

  const configPath = ts.findConfigFile(root, ts.sys.fileExists, 'tsconfig.json');
  const configInsideRoot =
    configPath && !path.relative(root, configPath).startsWith('..') && !path.isAbsolute(path.relative(root, configPath));

  let fileNames: string[] = [];
  let compilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.CommonJS,
    strict: true,
    allowJs: true,
    checkJs: false,
  };

  if (configPath && configInsideRoot) {
    const parsed = ts.parseJsonConfigFileContent(
      ts.readConfigFile(configPath, ts.sys.readFile).config,
      ts.sys,
      path.dirname(configPath)
    );
    fileNames = parsed.fileNames;
    compilerOptions = parsed.options;
  } else {
    fileNames = walkTsFiles(root);
  }

  if (options.scopeGlob) {
    const scope = options.scopeGlob.replace(/\\/g, '/').replace(/\*\*/g, '').replace(/\*/g, '');
    fileNames = fileNames.filter((f) => {
      const rel = path.relative(root, f).replace(/\\/g, '/');
      return !scope || rel.includes(scope.replace(/\/$/, ''));
    });
  }

  fileNames = fileNames.filter((f) => {
    const rel = path.relative(root, f).replace(/\\/g, '/');
    return !shouldSkipFile(rel, excludeGlobs);
  });

  const program = ts.createProgram({ rootNames: fileNames, options: { ...compilerOptions, noEmit: true } });
  const checker = program.getTypeChecker();
  const suppressions = readSuppressions(root);

  const mismatches: DocMismatch[] = [];
  let documentedFunctions = 0;
  let suppressed = 0;

  for (const sf of program.getSourceFiles()) {
    if (sf.isDeclarationFile) {
      continue;
    }
    const rel = path.relative(root, sf.fileName).replace(/\\/g, '/');
    if (shouldSkipFile(rel, excludeGlobs) || rel.startsWith('..')) {
      continue;
    }

    const visit = (node: ts.Node) => {
      if (
        ts.isFunctionDeclaration(node) ||
        ts.isMethodDeclaration(node) ||
        ts.isFunctionExpression(node) ||
        ts.isArrowFunction(node)
      ) {
        const doc = extractDocContract(node);
        if (doc) {
          documentedFunctions++;
          const name =
            (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) && node.name
              ? node.name.getText()
              : ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name)
                ? node.parent.name.text
                : '<anonymous>';
          if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
            const actual = extractActual(node, checker);
            const loc = docCommentLine(node, sf);
            for (const m of compareContracts(name, rel, loc, doc, actual)) {
              if (isSuppressed(suppressions, m.id)) {
                suppressed++;
              } else {
                mismatches.push(m);
              }
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }

  return {
    scannedAt: new Date().toISOString(),
    scannedFiles: fileNames.length,
    documentedFunctions,
    mismatches,
    suppressed,
    notes,
  };
}

function walkTsFiles(root: string): string[] {
  const out: string[] = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (['node_modules', '.git', 'dist', 'out'].includes(e.name)) {
          continue;
        }
        stack.push(abs);
      } else if (/\.(ts|tsx|js|jsx)$/.test(e.name) && !e.name.endsWith('.d.ts')) {
        out.push(abs);
      }
    }
  }
  return out;
}
