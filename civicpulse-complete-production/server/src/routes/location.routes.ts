import { Router } from 'express';
import { getLocation, listLocations, resolveLocation } from '../controllers/location.controller';
import { validate } from '../middleware/validate.middleware';
import {
  listLocationsQuerySchema, locationIdParamSchema, resolveLocationQuerySchema,
} from '../models/location.schema';

const router = Router();

// Reference data is public so the signup / report flow can populate pickers pre-login.
router.get('/', validate({ query: listLocationsQuerySchema }), listLocations);
router.get('/resolve', validate({ query: resolveLocationQuerySchema }), resolveLocation); // before /:id
router.get('/:id', validate({ params: locationIdParamSchema }), getLocation);

export default router;
