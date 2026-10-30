import { prisma } from '../config/database';
import { env } from '../config/env';
import { IssueStatus } from '../models/enums';
import { AppError } from '../utils/AppError';
import { composeTweet, normalizeHandle } from '../utils/tweet';

/**
 * Twitter/X escalation: maps an issue to the officials accountable for its
 * ward + department and produces a ready-to-post draft plus a Web Intent link.
 * Nothing is posted server-side; the citizen publishes from their own account.
 */

export interface OfficialHandleInfo {
  handle: string; // without '@'
  title: string;
  departmentName: string | null;
  scope: 'department' | 'general' | 'fallback';
}

export interface TwitterDraft {
  text: string;
  intentUrl: string;
  characterCount: number;
  summaryTruncated: boolean;
  handles: OfficialHandleInfo[];
  /** false when no ward/department handle was mapped (draft then uses fallback accounts or no Attn line). */
  handlesFound: boolean;
  warnings: string[];
}

const MAX_HANDLES = 4;
/** Roles accountable for every department in their ward. */
const GENERAL_TITLE = /(councill?or|commissioner|mayor|\bmla\b|\bmp\b|collector)/i;
/** Lower index = tagged first (and dropped last when the 280 budget is tight). */
const TITLE_PRIORITY = [/councill?or/i, /commissioner/i, /mayor/i, /\bsp\b/i, /\bdsp\b/i, /\bmla\b/i];
const priorityOf = (title: string): number => {
  const i = TITLE_PRIORITY.findIndex((re) => re.test(title));
  return i === -1 ? TITLE_PRIORITY.length : i;
};

const STATUS_TEXT: Record<IssueStatus, string> = {
  PENDING: 'Pending Resolution',
  IN_PROGRESS: 'In Progress',
  RESOLVED: 'Resolved',
  REJECTED: 'Closed',
};

/**
 * Handles mapped to this ward for this department, plus the ward's
 * general-purpose officials (Councillor, Commissioner, MLA...).
 * IDs are UUID strings in this schema (the brief used numbers).
 */
export async function getOfficialHandlesForWard(wardId: string, departmentId: string): Promise<OfficialHandleInfo[]> {
  const rows = await prisma.officialHandle.findMany({
    where: { wardId },
    include: { department: { select: { name: true } } },
  });

  const seen = new Set<string>();
  const out: OfficialHandleInfo[] = [];

  const consider = (scope: 'department' | 'general', match: (r: (typeof rows)[number]) => boolean) => {
    rows
      .filter(match)
      .sort((a, b) => priorityOf(a.officialTitle) - priorityOf(b.officialTitle))
      .forEach((r) => {
        const handle = normalizeHandle(r.twitterHandle);
        if (!handle || seen.has(handle.toLowerCase())) return; // missing / invalid handle => skip, never fail
        seen.add(handle.toLowerCase());
        out.push({ handle, title: r.officialTitle, departmentName: r.department.name, scope });
      });
  };

  consider('department', (r) => r.departmentId === departmentId);
  consider('general', (r) => r.departmentId !== departmentId && GENERAL_TITLE.test(r.officialTitle));
  return out;
}

/** Ward handles first, then city-wide fallback accounts (e.g. the Municipal Corporation) from config. */
async function resolveHandles(wardId: string, departmentId: string): Promise<{ handles: OfficialHandleInfo[]; warnings: string[] }> {
  const warnings: string[] = [];
  const mapped = await getOfficialHandlesForWard(wardId, departmentId);
  const handles = mapped.slice(0, MAX_HANDLES - (env.fallbackTweetHandles.length ? 1 : 0));

  if (mapped.length === 0) warnings.push('No official handles are mapped for this ward and department.');

  for (const raw of env.fallbackTweetHandles) {
    const handle = normalizeHandle(raw);
    if (handle && !handles.some((h) => h.handle.toLowerCase() === handle.toLowerCase()) && handles.length < MAX_HANDLES) {
      handles.push({ handle, title: 'Municipal Corporation', departmentName: null, scope: 'fallback' });
    }
  }
  if (handles.length === 0) warnings.push('No accounts could be tagged; the draft has no "Attn" line.');
  return { handles, warnings };
}

export async function getDraftForIssue(issueId: string): Promise<TwitterDraft> {
  const issue = await prisma.issue.findUnique({
    where: { id: issueId },
    select: {
      id: true, title: true, status: true, aiSummary: true, departmentId: true,
      location: { select: { id: true, parentId: true, colonyName: true, wardName: true, city: true } },
    },
  });
  if (!issue) throw AppError.notFound('Issue not found');

  const wardId = issue.location.parentId ?? issue.location.id;
  const { handles, warnings } = await resolveHandles(wardId, issue.departmentId);

  const composition = composeTweet({
    summary: issue.aiSummary ?? issue.title, // AI summary when available, citizen's title otherwise
    colonyName: issue.location.colonyName,
    wardName: issue.location.wardName,
    city: issue.location.city,
    statusText: STATUS_TEXT[issue.status],
    handles: handles.map((h) => h.handle),
    url: env.PUBLIC_WEB_URL ? `${env.PUBLIC_WEB_URL.replace(/\/$/, '')}/feed?issue=${issue.id}` : null,
  });

  if (composition.handlesUsed.length < handles.length) warnings.push('Some handles were omitted to fit the 280-character limit.');

  return {
    text: composition.text,
    intentUrl: composition.intentUrl,
    characterCount: composition.characterCount,
    summaryTruncated: composition.summaryTruncated,
    handles: handles.filter((h) => composition.handlesUsed.includes(h.handle)),
    handlesFound: handles.some((h) => h.scope !== 'fallback'),
    warnings,
  };
}
