import { z } from 'zod';
import { IssueStatus, IssueUrgency } from './enums';

const lat = z.coerce.number().min(-90).max(90);
const lng = z.coerce.number().min(-180).max(180);

export const createIssueSchema = z
  .object({
    title: z.string().trim().min(5).max(150),
    description: z.string().trim().min(10).max(5000),
    mediaUrls: z.array(z.string().url()).max(10).default([]),
    /** Optional: if omitted, urgency is inferred from the text. */
    urgency: z.nativeEnum(IssueUrgency).optional(),
    /** Optional: if omitted, the department is inferred from the text. */
    departmentCode: z.string().trim().min(2).max(20).optional(),
    /** Provide EITHER a known locationId OR a GPS pin. */
    locationId: z.string().uuid().optional(),
    latitude: lat.optional(),
    longitude: lng.optional(),
  })
  .refine((v) => v.locationId || (v.latitude !== undefined && v.longitude !== undefined), {
    message: 'Provide either locationId or both latitude and longitude',
    path: ['locationId'],
  });

export const listIssuesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.nativeEnum(IssueStatus).optional(),
  urgency: z.nativeEnum(IssueUrgency).optional(),
  departmentId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  wardId: z.string().uuid().optional(),
  mine: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  sort: z.enum(['newest', 'upvotes', 'urgency']).default('newest'),
});

export const issueIdParamSchema = z.object({ id: z.string().uuid() });

export const updateStatusSchema = z.object({ status: z.nativeEnum(IssueStatus) });

export type CreateIssueInput = z.infer<typeof createIssueSchema>;
export type ListIssuesQuery = z.infer<typeof listIssuesQuerySchema>;

/** multipart text fields arrive as strings, and empty inputs arrive as "": treat "" as absent. */
const blankToUndefined = (v: unknown) => (v === '' || v === null ? undefined : v);
const opt = <T extends z.ZodTypeAny>(schema: T) => z.preprocess(blankToUndefined, schema.optional());

/** Body of POST /issues/with-media (files travel in the `media` field). */
export const createIssueWithMediaSchema = z
  .object({
    title: z.string().trim().min(5).max(150),
    description: z.string().trim().min(10).max(5000),
    departmentCode: opt(z.string().trim().min(2).max(20)),
    urgency: opt(z.nativeEnum(IssueUrgency)),
    locationId: opt(z.string().uuid()),
    latitude: opt(lat),
    longitude: opt(lng),
    /** Citizen insists the media is a real civic issue after an AI "irrelevant" rejection. */
    overrideIrrelevant: opt(z.enum(['true', 'false']).transform((v) => v === 'true')),
  })
  .refine((v) => v.locationId || (v.latitude !== undefined && v.longitude !== undefined), {
    message: 'Provide either locationId or both latitude and longitude',
    path: ['locationId'],
  });

export type CreateIssueWithMediaInput = z.infer<typeof createIssueWithMediaSchema>;
