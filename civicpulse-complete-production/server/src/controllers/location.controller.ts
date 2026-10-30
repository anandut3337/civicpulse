import type { ListLocationsQuery } from '../models/location.schema';
import { locationService } from '../services/location.service';
import { asyncHandler } from '../utils/asyncHandler';

export const listLocations = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await locationService.list(req.query as unknown as ListLocationsQuery) });
});

export const getLocation = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await locationService.getById(req.params.id as string) });
});

/** GET /locations/resolve?lat=..&lng=.. -> the colony/ward a GPS pin falls in. */
export const resolveLocation = asyncHandler(async (req, res) => {
  const { lat, lng } = req.query as unknown as { lat: number; lng: number };
  res.json({ success: true, data: await locationService.resolveByCoordinates(lat, lng) });
});
