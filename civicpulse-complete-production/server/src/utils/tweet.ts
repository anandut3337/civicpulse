/**
 * Pure tweet-composition helpers (no env / DB imports, so they are trivially
 * unit-testable). Implements X's weighted character counting closely enough
 * to stay under 280: most Latin text = 1, emoji and many non-Latin chars = 2,
 * any URL = 23 (t.co).
 */
export const MAX_TWEET = 280;
const URL_COST = 24; // 23 for the t.co link + 1 for the separating space X adds
const MIN_SUMMARY_WEIGHT = 40;

export function weightedLength(text: string): number {
  let w = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0) as number;
    const light = cp <= 4351 || (cp >= 8192 && cp <= 8205) || (cp >= 8208 && cp <= 8223) || (cp >= 8242 && cp <= 8247);
    w += light ? 1 : 2;
  }
  return w;
}

export function truncateToWeight(text: string, max: number): string {
  if (weightedLength(text) <= max) return text;
  const ellipsis = '…';
  const reserve = weightedLength(ellipsis);
  let out = '';
  let w = 0;
  for (const ch of text) {
    const cw = weightedLength(ch);
    if (w + cw + reserve > max) break;
    out += ch;
    w += cw;
  }
  return out.trimEnd() + ellipsis;
}

/**
 * The summary can originate from an AI model that has read untrusted images
 * and citizen text, so it must never be able to inject mentions, hashtags,
 * links or invisible/bidi characters into a public post.
 */
export function sanitizeSummary(raw: string): string {
  return raw
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/[@#＠＃]/g, '')
    .replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "@Foo", "foo", "https://x.com/foo" -> "foo"; returns null if not a valid handle. */
export function normalizeHandle(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const h = raw.trim().replace(/^https?:\/\/(www\.)?(twitter|x)\.com\//i, '').replace(/^@/, '').split(/[/?#]/)[0] ?? '';
  return /^[A-Za-z0-9_]{1,15}$/.test(h) ? h : null;
}

export interface TweetInput {
  summary: string;
  colonyName: string | null;
  wardName: string;
  city: string;
  statusText: string;
  handles: string[];
  /** Public link to the issue; costs 24 characters of budget when present. */
  url?: string | null;
}

export interface TweetComposition {
  text: string;
  intentUrl: string;
  characterCount: number;
  summaryTruncated: boolean;
  handlesUsed: string[];
}

export function composeTweet(input: TweetInput): TweetComposition {
  const where = [input.colonyName, input.wardName, input.city].filter(Boolean).join(', ');
  const budget = MAX_TWEET - (input.url ? URL_COST : 0);

  const build = (summary: string, handles: string[]): string =>
    [
      `🚨 Civic Issue Reported: ${summary}`,
      `📍 Location: ${where}`,
      `Status: ${input.statusText}`,
      handles.length ? `Attn: ${handles.map((h) => `@${h}`).join(' ')}` : null,
      '#CivicPulse #LocalAccountability',
    ]
      .filter((l): l is string => l !== null)
      .join('\n');

  const clean = sanitizeSummary(input.summary) || 'Civic issue reported by a citizen.';
  const handles = [...input.handles];

  // Keep at least a meaningful summary: shed the lowest-priority handles first.
  let room = budget - weightedLength(build('', handles));
  while (room < MIN_SUMMARY_WEIGHT && handles.length > 0) {
    handles.pop();
    room = budget - weightedLength(build('', handles));
  }

  const summary = truncateToWeight(clean, Math.max(room, 10));
  let text = build(summary, handles);
  if (weightedLength(text) > budget) text = truncateToWeight(text, budget); // last-resort guard

  const intentUrl =
    `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}` + (input.url ? `&url=${encodeURIComponent(input.url)}` : '');

  return {
    text,
    intentUrl,
    characterCount: weightedLength(text) + (input.url ? URL_COST : 0),
    summaryTruncated: summary !== clean,
    handlesUsed: handles,
  };
}
