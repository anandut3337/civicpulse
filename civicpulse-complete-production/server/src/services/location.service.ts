import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { env } from '../config/env';
import type { ListLocationsQuery } from '../models/location.schema';
import type { ResolvedLocation } from '../models/types';
import { AppError } from '../utils/AppError';
import { boundingBox } from '../utils/geo';

export const locationService = {
  async list(q: ListLocationsQuery) {
    const where: Prisma.LocationWhereInput = {
      ...(q.state && { state: { equals: q.state, mode: 'insensitive' } }),
      ...(q.district && { district: { equals: q.district, mode: 'insensitive' } }),
      ...(q.city && { city: { equals: q.city, mode: 'insensitive' } }),
      ...(q.wardNumber && { wardNumber: q.wardNumber }),
      ...(q.zipCode && { zipCode: q.zipCode }),
      ...(q.level === 'ward' && { colonyName: null }),
      ...(q.level === 'colony' && { colonyName: { not: null } }),
    };
    return prisma.location.findMany({
      where,
      take: q.limit,
      orderBy: [{ state: 'asc' }, { district: 'asc' }, { city: 'asc' }, { wardNumber: 'asc' }, { colonyName: 'asc' }],
    });
  },

  async getById(id: string) {
    const location = await prisma.location.findUnique({ where: { id } });
    if (!location) throw AppError.notFound('Location not found');
    return location;
  },

  /**
   * Maps a GPS pin to the nearest COLONY-level row within GEO_MAX_RESOLVE_KM.
   * Strategy: bounding-box prefilter (uses the lat/lng index) + Haversine
   * ordering in SQL. Good enough for centroid data; when real boundary
   * polygons are loaded, replace with PostGIS `ST_Contains`.
   */
  async resolveByCoordinates(lat: number, lng: number): Promise<ResolvedLocation> {
    const box = boundingBox(lat, lng, env.GEO_MAX_RESOLVE_KM);

    const rows = await prisma.$queryRaw<ResolvedLocation[]>(Prisma.sql`
      SELECT id, state, district, city, "wardName", "wardNumber", "colonyName", "zipCode", "parentId",
             (6371 * acos(LEAST(1, GREATEST(-1,
                cos(radians(${lat})) * cos(radians(latitude)) * cos(radians(longitude) - radians(${lng}))
              + sin(radians(${lat})) * sin(radians(latitude))
             )))) AS "distanceKm"
      FROM locations
      WHERE "colonyName" IS NOT NULL
        AND latitude  BETWEEN ${box.minLat} AND ${box.maxLat}
        AND longitude BETWEEN ${box.minLng} AND ${box.maxLng}
      ORDER BY "distanceKm" ASC
      LIMIT 1
    `);

    const match = rows[0];
    if (!match || match.distanceKm > env.GEO_MAX_RESOLVE_KM) {
      throw AppError.unprocessable(
        'LOCATION_UNRESOLVED',
        `No mapped locality within ${env.GEO_MAX_RESOLVE_KM} km of the supplied coordinates`,
      );
    }
    return match;
  },
};
