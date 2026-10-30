import { Router } from 'express';
import {
  createIssue, createIssueWithMedia, getIssue, getIssueHandles, listIssues, removeUpvote, updateIssueStatus, upvoteIssue,
} from '../controllers/issue.controller';
import { getTwitterDraft } from '../controllers/twitter.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { parseMedia, uploadLimiter } from '../middleware/upload.middleware';
import { validate } from '../middleware/validate.middleware';
import { Role } from '../models/enums';
import {
  createIssueSchema, createIssueWithMediaSchema, issueIdParamSchema, listIssuesQuerySchema, updateStatusSchema,
} from '../models/issue.schema';

const router = Router();

router.use(authenticate);

router.get('/', validate({ query: listIssuesQuerySchema }), listIssues);

// JSON flow: media already uploaded elsewhere, client sends URLs (text-based routing only).
router.post('/', authorize(Role.CITIZEN, Role.ADMIN), validate({ body: createIssueSchema }), createIssue);

/**
 * Full AI workflow (multipart/form-data, files in `media`):
 *   1. media is stored            (storage.service: local disk or S3-compatible)
 *   2. Gemini inspects the photo  (department, urgency, spam check, summary)
 *   3. issue saved as PENDING     (citizen choice > AI > text rules > default)
 *   4. response = issue + AI verdict + Twitter/X escalation draft & intent link
 * Order matters: auth -> role -> per-user throttle -> multipart parse -> field validation.
 * Registered before '/:id' routes so "with-media" is never read as an id.
 */
router.post(
  '/with-media',
  authorize(Role.CITIZEN, Role.ADMIN),
  uploadLimiter,
  parseMedia,
  validate({ body: createIssueWithMediaSchema }),
  createIssueWithMedia,
);

router.get('/:id', validate({ params: issueIdParamSchema }), getIssue);
router.get('/:id/handles', validate({ params: issueIdParamSchema }), getIssueHandles);
router.get('/:id/twitter-draft', validate({ params: issueIdParamSchema }), getTwitterDraft);

router.patch(
  '/:id/status',
  authorize(Role.OFFICIAL, Role.ADMIN),
  validate({ params: issueIdParamSchema, body: updateStatusSchema }),
  updateIssueStatus,
);

router.post('/:id/upvote', validate({ params: issueIdParamSchema }), upvoteIssue);
router.delete('/:id/upvote', validate({ params: issueIdParamSchema }), removeUpvote);

export default router;
