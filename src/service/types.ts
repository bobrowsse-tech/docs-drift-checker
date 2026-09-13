export interface DocParam {
  name: string;
  type?: string;
}

export interface DocumentedContract {
  params: DocParam[];
  returns?: string;
  throws: string[];
}

export interface ActualContract {
  params: DocParam[];
  returns: string;
}

export type MismatchKind =
  | 'param-name'
  | 'param-type'
  | 'param-count'
  | 'return-type'
  | 'throws-undocumented';

export interface DocMismatch {
  id: string;
  functionName: string;
  file: string;
  /** 1-based line of the doc comment (or function if no range). */
  line: number;
  column: number;
  kind: MismatchKind;
  documented: string;
  actual: string;
  message: string;
}

export interface DocsDriftReport {
  scannedAt: string;
  scannedFiles: number;
  documentedFunctions: number;
  mismatches: DocMismatch[];
  suppressed: number;
  notes: string[];
}

export const IGNORE_FILENAME = '.docsdrift-ignore';
