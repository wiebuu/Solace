import { Router } from 'express';
import { z } from 'zod';
import { Activity, ACTIVITY_KINDS } from '../models/Activity.js';
import { Daily } from '../models/Daily.js';
import { uid } from '../middleware/auth.js';
import { localDay } from '../services/days.js';

export const activitiesRouter = Router();

const activitySchema = z.object({
  kind: z.enum(ACTIVITY_KINDS),
  minutes: z.number().min(0).max(240).default(0),
  meta: z.record(z.string(), z.unknown()).default({}),
});

activitiesRouter.post('/', async (req, res) => {
  const userId = uid(req);
  const body = activitySchema.parse(req.body);
  const day = localDay(req);
  const activity = await Activity.create({ ...body, user: userId, day });
  if (body.kind === 'challenge') await Daily.updateOne({ user: userId, day }, { challengeDone: true });
  res.status(201).json({ activity });
});
