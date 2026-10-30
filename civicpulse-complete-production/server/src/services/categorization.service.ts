import { IssueUrgency, URGENCY_RANK } from '../models/enums';
import type { Classification } from '../models/types';

/**
 * Rule-based classifier: keyword scoring -> department + urgency.
 * Deliberately a pure function with no I/O so it is trivial to unit test and
 * can be swapped for an ML / LLM-backed classifier behind the same signature.
 *
 * Department codes MUST match `Department.code` values (see prisma/seed.ts).
 */
const DEPARTMENT_RULES: Array<{ code: string; keywords: string[] }> = [
  { code: 'PWD', keywords: ['pothole', 'road', 'crack', 'footpath', 'pavement', 'speed breaker', 'bridge', 'highway', 'manhole cover'] },
  { code: 'ELEC', keywords: ['wire', 'electric', 'pole', 'transformer', 'streetlight', 'street light', 'power cut', 'voltage', 'short circuit', 'cable'] },
  { code: 'WATER', keywords: ['drain', 'drainage', 'sewer', 'sewage', 'overflow', 'waterlogging', 'water supply', 'pipeline burst', 'tap', 'flood'] },
  { code: 'GAS', keywords: ['gas', 'lpg', 'png', 'gas pipeline', 'cylinder'] },
  { code: 'SAN', keywords: ['garbage', 'waste', 'trash', 'dustbin', 'sweeping', 'stray', 'dead animal', 'litter'] },
  { code: 'POLICE', keywords: ['theft', 'harassment', 'accident', 'illegal parking', 'violence', 'encroachment', 'traffic signal'] },
];

/** Phrases that indicate immediate danger to life -> force a minimum urgency. */
const URGENCY_RULES: Array<{ urgency: IssueUrgency; keywords: string[] }> = [
  { urgency: IssueUrgency.CRITICAL, keywords: ['gas leak', 'smell of gas', 'live wire', 'exposed wire', 'sparking', 'fire', 'electrocut', 'collapsed', 'explosion', 'open manhole'] },
  { urgency: IssueUrgency.HIGH, keywords: ['accident', 'broken pole', 'fallen pole', 'leaning pole', 'flood', 'sewage overflow', 'blocked road', 'sinkhole'] },
  { urgency: IssueUrgency.LOW, keywords: ['faded', 'cosmetic', 'paint', 'minor'] },
];

export function classifyIssue(text: string): Classification {
  const haystack = text.toLowerCase();

  // --- Department: highest keyword-hit count wins -------------------------
  let bestCode: string | null = null;
  let bestScore = 0;
  let totalScore = 0;
  for (const rule of DEPARTMENT_RULES) {
    const score = rule.keywords.reduce((n, kw) => n + (haystack.includes(kw) ? 1 : 0), 0);
    totalScore += score;
    if (score > bestScore) {
      bestScore = score;
      bestCode = rule.code;
    }
  }

  // --- Urgency: most severe matching tier wins; LOW only if nothing severe matched ---
  const matches = (kws: string[]) => kws.some((kw) => haystack.includes(kw));
  let urgency: IssueUrgency = IssueUrgency.MEDIUM;
  for (const rule of URGENCY_RULES) {
    if (rule.urgency !== IssueUrgency.LOW && matches(rule.keywords) && URGENCY_RANK[rule.urgency] > URGENCY_RANK[urgency]) {
      urgency = rule.urgency;
    }
  }
  if (urgency === IssueUrgency.MEDIUM) {
    const low = URGENCY_RULES.find((r) => r.urgency === IssueUrgency.LOW);
    if (low && matches(low.keywords)) urgency = IssueUrgency.LOW;
  }

  return {
    departmentCode: bestCode,
    urgency,
    confidence: totalScore === 0 ? 0 : Number((bestScore / totalScore).toFixed(2)),
  };
}
