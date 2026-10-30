import type { IssueUrgency } from './enums';

/**
 * Department labels the vision model is allowed to emit. "Gas Pipeline" is
 * included on top of the five requested because the database (seed) has a GAS
 * department and an active gas leak is an explicit CRITICAL case.
 */
export const DETECTED_DEPARTMENTS = ['Electricity', 'Roads/PWD', 'Sanitation', 'Water/Drainage', 'Police', 'Gas Pipeline'] as const;
export type DetectedDepartment = (typeof DETECTED_DEPARTMENTS)[number];

/** Routing is by Department.code (stable), never by display name. */
export const DEPARTMENT_CODE_BY_NAME: Record<DetectedDepartment, string> = {
  Electricity: 'ELEC',
  'Roads/PWD': 'PWD',
  Sanitation: 'SAN',
  'Water/Drainage': 'WATER',
  Police: 'POLICE',
  'Gas Pipeline': 'GAS',
};

export const DEPARTMENT_NAME_BY_CODE: Record<string, DetectedDepartment> = Object.fromEntries(
  Object.entries(DEPARTMENT_CODE_BY_NAME).map(([name, code]) => [code, name as DetectedDepartment]),
);

export interface MediaInput {
  data: Buffer;
  mimeType: string;
}

/** Result of inspecting a photo/video. Always returned - the service never throws on AI failure. */
export interface MediaAnalysis {
  /** null only when AI was unavailable AND the text heuristics found no match. */
  detectedDepartment: DetectedDepartment | null;
  detectedDepartmentCode: string | null;
  urgencyLevel: IssueUrgency;
  isSpamOrIrrelevant: boolean;
  /** One plain-text sentence, sanitised (no @, #, URLs); safe to publish. */
  autoSummary: string;
  /** 0..1. Always 0 for fallback results. */
  confidence: number;
  source: 'gemini' | 'fallback';
  model?: string;
  /** Why we fell back (logged, and surfaced so clients can show "AI check skipped"). */
  fallbackReason?: string;
}
