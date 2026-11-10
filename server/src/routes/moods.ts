import { Router } from 'express';
import { z } from 'zod';
import { Mood, MOODS, MOOD_SCORE } from '../models/Mood.js';
import { Activity } from '../models/Activity.js';
import { uid } from '../middleware/auth.js';
import { localDay, shiftDay } from '../services/days.js';

export const moodsRouter = Router();

const moodSchema = z.object({
  mood: z.enum(MOODS),
  tags: z.array(z.string().max(30)).max(8).default([]),
  note: z.string().max(500).default(''),
});

moodsRouter.post('/', async (req, res) => {
  const userId = uid(req);
  const body = moodSchema.parse(req.body);
  const day = localDay(req);
  const mood = await Mood.create({ ...body, user: userId, score: MOOD_SCORE[body.mood], day });
  await Activity.create({ user: userId, kind: 'checkin', day, meta: { mood: body.mood } });
  res.status(201).json({ mood });
});

moodsRouter.get('/', async (req, res) => {
  const userId = uid(req);
  const days = Math.min(Number(req.query.days ?? 30), 90);
  const since = shiftDay(localDay(req), -(days - 1));
  const moods = await Mood.find({ user: userId, day: { $gte: since } }).sort({ createdAt: -1 }).lean();
  res.json({ moods });
});

/** Aggregates for the Insights screen: daily averages, tag correlations and distribution. */
moodsRouter.get('/insights', async (req, res) => {
  const userId = uid(req);
  const today = localDay(req);
  const since = shiftDay(today, -29);
  const moods = await Mood.find({ user: userId, day: { $gte: since } }).lean();

  const byDay = new Map<string, number[]>();
  const tagScores = new Map<string, number[]>();
  const distribution: Record<string, number> = Object.fromEntries(MOODS.map((m) => [m, 0]));
  for (const m of moods) {
    byDay.set(m.day, [...(byDay.get(m.day) ?? []), m.score]);
    distribution[m.mood]++;
    for (const t of m.tags) tagScores.set(t, [...(tagScores.get(t) ?? []), m.score]);
  }
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

  const week = Array.from({ length: 7 }, (_, i) => {
    const day = shiftDay(today, i - 6);
    const scores = byDay.get(day);
    return { day, score: scores ? Number(avg(scores).toFixed(2)) : null };
  });
  const tags = [...tagScores.entries()]
    .map(([tag, scores]) => ({ tag, count: scores.length, avg: Number(avg(scores).toFixed(2)) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  res.json({
    week,
    distribution,
    tags,
    total: moods.length,
    average: moods.length ? Number(avg(moods.map((m) => m.score)).toFixed(2)) : null,
  });
});
