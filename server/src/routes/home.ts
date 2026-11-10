import { Router } from 'express';
import { Activity } from '../models/Activity.js';
import { Daily } from '../models/Daily.js';
import { Mood } from '../models/Mood.js';
import { Conversation } from '../models/Conversation.js';
import { uid } from '../middleware/auth.js';
import { buildContext } from '../services/context.js';
import { dailyContent } from '../services/ai.js';
import { computeStreak, localDay, shiftDay } from '../services/days.js';

export const homeRouter = Router();

async function getDaily(userId: string, day: string, hour: number) {
  const existing = await Daily.findOne({ user: userId, day }).lean();
  if (existing) return existing;
  const content = await dailyContent(await buildContext(userId, day, { hour }));
  // Upsert guards against two concurrent first-loads of the day.
  return Daily.findOneAndUpdate(
    { user: userId, day },
    { $setOnInsert: { ...content, user: userId, day } },
    { upsert: true, new: true, lean: true },
  );
}

homeRouter.get('/', async (req, res) => {
  const userId = uid(req);
  const today = localDay(req);
  const hour = Number(req.header('x-local-hour') ?? new Date().getHours());

  const [daily, todayMood, activityDays, weekActivities, lastConversation] = await Promise.all([
    getDaily(userId, today, hour),
    Mood.findOne({ user: userId, day: today }).sort({ createdAt: -1 }).lean(),
    Activity.distinct('day', { user: userId }),
    Activity.find({ user: userId, day: { $gte: shiftDay(today, -6) } }).lean(),
    Conversation.findOne({ user: userId }).sort({ updatedAt: -1 }).select('title updatedAt lastMood').lean(),
  ]);

  const days = new Set(activityDays as string[]);
  const week = Array.from({ length: 7 }, (_, i) => {
    const day = shiftDay(today, i - 6);
    return { day, active: days.has(day) };
  });

  res.json({
    today,
    daily,
    todayMood,
    streak: computeStreak(days, today),
    week,
    totals: {
      mindfulMinutes: Math.round(weekActivities.reduce((sum, a) => sum + (a.minutes ?? 0), 0)),
      checkins: weekActivities.filter((a) => a.kind === 'checkin').length,
      sessions: weekActivities.filter((a) => a.kind === 'breathing').length,
    },
    lastConversation,
  });
});
