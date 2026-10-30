import { z } from 'zod';

export const listLocationsQuerySchema = z.object({
  state: z.string().trim().optional(),
  district: z.string().trim().optional(),
  city: z.string().trim().optional(),
  wardNumber: z.string().trim().optional(),
  /** `ward` => only ward-level rows, `colony` => only colony-level rows. */
  level: z.enum(['ward', 'colony']).optional(),
  zipCode: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

export const resolveLocationQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

export const locationIdParamSchema = z.object({ id: z.string().uuid() });

export type ListLocationsQuery = z.infer<typeof listLocationsQuerySchema>;
