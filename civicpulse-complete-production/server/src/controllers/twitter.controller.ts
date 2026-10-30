import { getDraftForIssue } from '../services/twitter.service';
import { asyncHandler } from '../utils/asyncHandler';

/** GET /api/v1/issues/:id/twitter-draft -> { text, intentUrl, handles, warnings, ... } */
export const getTwitterDraft = asyncHandler(async (req, res) => {
  const draft = await getDraftForIssue(req.params.id as string);
  res.json({ success: true, data: draft });
});
