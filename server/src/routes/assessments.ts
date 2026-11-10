import { Router } from 'express';
import { z } from 'zod';
import { Assessment } from '../models/Assessment.js';
import { uid } from '../middleware/auth.js';

export const assessmentsRouter = Router();

// Five statements about the last two weeks, each answered 0 (never) to 5 (all the time).
// Scored on a 0-100 scale; this is a reflection tool, not a clinical screening.
const schema = z.object({ answers: z.array(z.number().int().min(0).max(5)).length(5) });

function band(score: number) {
  if (score >= 72) return 'flourishing';
  if (score >= 52) return 'steady';
  if (score >= 32) return 'stretched';
  return 'depleted';
}

assessmentsRouter.post('/', async (req, res) => {
  const userId = uid(req);
  const { answers } = schema.parse(req.body);
  const score = Math.round((answers.reduce((a, b) => a + b, 0) / 25) * 100);
  const assessment = await Assessment.create({ user: userId, answers, score, band: band(score) });
  res.status(201).json({ assessment });
});

assessmentsRouter.get('/latest', async (req, res) => {
  const userId = uid(req);
  const assessment = await Assessment.findOne({ user: userId }).sort({ createdAt: -1 }).lean();
  res.json({ assessment });
});
