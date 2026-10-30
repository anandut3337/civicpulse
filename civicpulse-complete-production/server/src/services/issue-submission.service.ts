import { promises as fs } from 'node:fs';
import { prisma } from '../config/database';
import { env } from '../config/env';
import type { MediaAnalysis } from '../models/ai.types';
import { IssueUrgency, URGENCY_RANK } from '../models/enums';
import type { CreateIssueWithMediaInput } from '../models/issue.schema';
import type { AuthUser } from '../models/types';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';
import { analyzeMediaBuffer, fallbackAnalysis } from './ai-vision.service';
import { classifyIssue } from './categorization.service';
import { ISSUE_INCLUDE, type IssueWithRelations } from './issue.service';
import { locationService } from './location.service';
import { getStorage, type StoredMedia, type UploadedFile } from './storage.service';
import { getDraftForIssue, type TwitterDraft } from './twitter.service';

/**
 * Orchestrates the full "citizen uploads a photo" workflow:
 *   validate -> resolve location -> (store media || Gemini inspection) -> spam gate
 *   -> route department/urgency -> save PENDING issue -> build Twitter escalation draft.
 */

const IMAGE_MAX_BYTES = 10 * 1024 * 1024;

type RoutedBy = 'user' | 'ai' | 'text' | 'default';

export interface SubmissionResult {
  issue: IssueWithRelations;
  ai: {
    source: MediaAnalysis['source'];
    model?: string;
    confidence: number;
    detectedDepartment: MediaAnalysis['detectedDepartment'];
    urgencyLevel: IssueUrgency;
    summary: string;
    flaggedIrrelevant: boolean;
    /** True when Gemini was unavailable/unclear and heuristics decided instead. */
    degraded: boolean;
    fallbackReason?: string;
    departmentRoutedBy: RoutedBy;
  };
  /** null only if the draft itself failed; the issue is saved regardless. */
  twitter: TwitterDraft | null;
}

// ---- file safety -----------------------------------------------------------
async function readHead(filePath: string, n = 16): Promise<Buffer> {
  const fh = await fs.open(filePath, 'r');
  try {
    const buf = Buffer.alloc(n);
    const { bytesRead } = await fh.read(buf, 0, n, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    await fh.close();
  }
}

/** Declared MIME types are client-controlled; confirm the file's magic bytes agree. */
function signatureMatches(head: Buffer, mime: string): boolean {
  const hex = (start: number, len: number) => head.subarray(start, start + len).toString('hex');
  switch (mime) {
    case 'image/jpeg': return hex(0, 3) === 'ffd8ff';
    case 'image/png': return hex(0, 4) === '89504e47';
    case 'image/webp': return hex(0, 4) === '52494646' && head.subarray(8, 12).toString('ascii') === 'WEBP';
    case 'video/webm': return hex(0, 4) === '1a45dfa3';
    default: return head.subarray(4, 8).toString('ascii') === 'ftyp'; // mp4 / mov / heic / heif
  }
}

async function validateFiles(files: UploadedFile[]): Promise<void> {
  if (files.length === 0) throw AppError.badRequest('Attach at least one photo or video');
  for (const f of files) {
    if (f.mimeType.startsWith('image/') && f.size > IMAGE_MAX_BYTES) throw new AppError(413, 'FILE_TOO_LARGE', `"${f.originalName}" is larger than 10 MB`);
    if (!signatureMatches(await readHead(f.path), f.mimeType)) throw new AppError(415, 'MEDIA_TYPE_MISMATCH', `"${f.originalName}" is not a valid ${f.mimeType} file`);
  }
}

// ---- routing helpers -------------------------------------------------------
const maxUrgency = (...levels: Array<IssueUrgency | undefined>): IssueUrgency =>
  levels.filter((l): l is IssueUrgency => !!l).reduce((a, b) => (URGENCY_RANK[b] > URGENCY_RANK[a] ? b : a), IssueUrgency.LOW);

async function resolveDepartment(candidates: Array<{ code: string | null | undefined; by: RoutedBy }>) {
  for (const c of candidates) {
    if (!c.code) continue;
    const department = await prisma.department.findUnique({ where: { code: c.code.toUpperCase() } });
    if (department) return { department, by: c.by };
    logger.warn('Routing candidate has no matching department row', { code: c.code, by: c.by });
  }
  throw new AppError(500, 'ROUTING_MISCONFIGURED', 'No department could be resolved; check DEFAULT_DEPARTMENT_CODE and seeded departments');
}

async function removeStored(items: StoredMedia[]): Promise<void> {
  const storage = getStorage();
  await Promise.allSettled(items.map((s) => storage.remove(s.key)));
}

// ---- main flow -------------------------------------------------------------
export async function submitIssueWithMedia(user: AuthUser, input: CreateIssueWithMediaInput, files: UploadedFile[]): Promise<SubmissionResult> {
  await validateFiles(files);

  // 1. Fail fast on location, before spending money on storage and AI.
  const location = input.locationId
    ? await locationService.getById(input.locationId)
    : await locationService.resolveByCoordinates(input.latitude as number, input.longitude as number);

  // 2. Upload everything and inspect the primary media concurrently (prefer a photo over a video).
  const primary = files.find((f) => f.mimeType.startsWith('image/')) ?? files[0];
  const storage = getStorage();

  const [uploads, analysis] = await Promise.all([
    Promise.allSettled(files.map((f) => storage.save(f))),
    fs
      .readFile(primary.path)
      .then((data) => analyzeMediaBuffer({ data, mimeType: primary.mimeType }, `${input.title}. ${input.description}`))
      // Must never reject here: the uploads above are in flight and would be orphaned.
      .catch(() => fallbackAnalysis(`${input.title}. ${input.description}`, 'could not read uploaded file')),
  ]);

  const stored = uploads.filter((u): u is PromiseFulfilledResult<StoredMedia> => u.status === 'fulfilled').map((u) => u.value);
  if (stored.length !== files.length) {
    await removeStored(stored);
    logger.error('Media upload failed', { failures: uploads.filter((u) => u.status === 'rejected').length });
    throw new AppError(502, 'STORAGE_FAILED', 'We could not store your media. Please try again.');
  }

  try {
    // 3. Spam / irrelevance gate. Only a confident Gemini verdict blocks; the citizen can override.
    const confidentSpam = analysis.source === 'gemini' && analysis.isSpamOrIrrelevant && analysis.confidence >= env.AI_MIN_CONFIDENCE;
    if (confidentSpam && !input.overrideIrrelevant) {
      throw new AppError(422, 'MEDIA_NOT_CIVIC_ISSUE', 'This does not look like a public civic issue. If you are sure it is, resubmit with overrideIrrelevant=true.', {
        aiSummary: analysis.autoSummary,
        confidence: analysis.confidence,
      });
    }

    // 4. Department: citizen's explicit choice > confident AI > text heuristics > configured default.
    const text = classifyIssue(`${input.title} ${input.description}`);
    const aiTrusted = analysis.source === 'gemini' && analysis.confidence >= env.AI_MIN_CONFIDENCE && !analysis.isSpamOrIrrelevant;
    const { department, by } = await resolveDepartment([
      { code: input.departmentCode, by: 'user' },
      { code: aiTrusted ? analysis.detectedDepartmentCode : null, by: 'ai' },
      { code: text.departmentCode, by: 'text' },
      { code: env.DEFAULT_DEPARTMENT_CODE, by: 'default' },
    ]);

    // 5. Urgency only ever goes UP. Even a low-confidence CRITICAL is honoured: a false alarm costs
    //    a glance, a missed live wire costs far more.
    //    The text classifier defaults to MEDIUM when it sees nothing, so only its escalations count as a vote.
    const textEscalation = URGENCY_RANK[text.urgency] > URGENCY_RANK[IssueUrgency.MEDIUM] ? text.urgency : undefined;
    const urgency = maxUrgency(input.urgency, analysis.urgencyLevel, textEscalation);

    // 6. Persist as PENDING (schema default).
    const issue = await prisma.issue.create({
      data: {
        title: input.title,
        description: input.description,
        mediaUrls: stored.map((s) => s.url),
        urgency,
        latitude: input.latitude,
        longitude: input.longitude,
        userId: user.id,
        locationId: location.id,
        departmentId: department.id,
        aiSummary: analysis.source === 'gemini' ? analysis.autoSummary : null,
        aiConfidence: analysis.source === 'gemini' ? analysis.confidence : null,
        aiFlaggedIrrelevant: analysis.source === 'gemini' && analysis.isSpamOrIrrelevant,
        aiModel: analysis.model ?? null,
      },
      include: ISSUE_INCLUDE,
    });

    // 7. Twitter escalation draft. Best-effort: a failure here must never lose the saved issue.
    let twitter: TwitterDraft | null = null;
    try {
      twitter = await getDraftForIssue(issue.id);
    } catch (err) {
      logger.error('Twitter draft generation failed', { issueId: issue.id, error: err instanceof Error ? err.message : err });
    }

    return {
      issue,
      twitter,
      ai: {
        source: analysis.source,
        model: analysis.model,
        confidence: analysis.confidence,
        detectedDepartment: analysis.detectedDepartment,
        urgencyLevel: analysis.urgencyLevel,
        summary: analysis.autoSummary,
        flaggedIrrelevant: analysis.isSpamOrIrrelevant,
        degraded: analysis.source === 'fallback' || analysis.confidence < env.AI_MIN_CONFIDENCE,
        fallbackReason: analysis.fallbackReason,
        departmentRoutedBy: by,
      },
    };
  } catch (err) {
    await removeStored(stored); // no orphaned objects when we reject or the DB write fails
    throw err;
  }
}
