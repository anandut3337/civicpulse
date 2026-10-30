/**
 * Single source of truth for enums: Prisma generates them from schema.prisma.
 * Re-exporting here keeps the rest of the codebase decoupled from the
 * `@prisma/client` import path (and gives us one place to add helpers).
 */
import { IssueStatus, IssueUrgency, Role } from '@prisma/client';

export { IssueStatus, IssueUrgency, Role };

/** Ordering used to compare urgencies numerically (higher = more urgent). */
export const URGENCY_RANK: Record<IssueUrgency, number> = {
  [IssueUrgency.LOW]: 0,
  [IssueUrgency.MEDIUM]: 1,
  [IssueUrgency.HIGH]: 2,
  [IssueUrgency.CRITICAL]: 3,
};

/**
 * Allowed status transitions. RESOLVED and REJECTED are terminal; re-opening
 * should be a deliberate admin workflow, not a casual status flip.
 */
export const STATUS_TRANSITIONS: Record<IssueStatus, IssueStatus[]> = {
  [IssueStatus.PENDING]: [IssueStatus.IN_PROGRESS, IssueStatus.REJECTED],
  [IssueStatus.IN_PROGRESS]: [IssueStatus.RESOLVED, IssueStatus.REJECTED],
  [IssueStatus.RESOLVED]: [],
  [IssueStatus.REJECTED]: [],
};
