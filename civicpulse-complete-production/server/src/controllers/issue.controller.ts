import { promises as fs } from 'node:fs';
import type { AuthUser } from '../models/types';
import type { CreateIssueWithMediaInput } from '../models/issue.schema';
import { submitIssueWithMedia } from '../services/issue-submission.service';
import type { UploadedFile } from '../services/storage.service';
import { issueService } from '../services/issue.service';
import { asyncHandler } from '../utils/asyncHandler';
import type { CreateIssueInput, ListIssuesQuery } from '../models/issue.schema';
import type { IssueStatus } from '../models/enums';

// Controllers stay thin: parse -> call service -> shape the HTTP response.

export const createIssue = asyncHandler(async (req, res) => {
  const issue = await issueService.create(req.user as AuthUser, req.body as CreateIssueInput);
  res.status(201).json({ success: true, data: issue });
});

export const listIssues = asyncHandler(async (req, res) => {
  const { items, meta } = await issueService.list(req.user as AuthUser, req.query as unknown as ListIssuesQuery);
  res.json({ success: true, data: items, meta });
});

export const getIssue = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await issueService.getById(req.params.id as string) });
});

export const updateIssueStatus = asyncHandler(async (req, res) => {
  const issue = await issueService.updateStatus(req.user as AuthUser, req.params.id as string, req.body.status as IssueStatus);
  res.json({ success: true, data: issue });
});

export const upvoteIssue = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await issueService.upvote((req.user as AuthUser).id, req.params.id as string) });
});

export const removeUpvote = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await issueService.removeUpvote((req.user as AuthUser).id, req.params.id as string) });
});

export const getIssueHandles = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await issueService.getAccountabilityHandles(req.params.id as string) });
});

/**
 * POST /issues/with-media (multipart). Uploads -> Gemini inspection -> PENDING issue -> Twitter draft.
 * Temp files written by multer are always removed, success or failure.
 */
export const createIssueWithMedia = asyncHandler(async (req, res) => {
  const multerFiles = (req.files ?? []) as Express.Multer.File[];
  const files: UploadedFile[] = multerFiles.map((f) => ({ path: f.path, originalName: f.originalname, mimeType: f.mimetype, size: f.size }));

  try {
    const result = await submitIssueWithMedia(req.user as AuthUser, req.body as CreateIssueWithMediaInput, files);
    res.status(201).json({ success: true, data: result });
  } finally {
    await Promise.allSettled(multerFiles.map((f) => fs.rm(f.path, { force: true })));
  }
});
