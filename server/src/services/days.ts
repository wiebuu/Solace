// Clients send their local day key (YYYY-MM-DD) via the X-Local-Day header so that
// streaks and "today" match the user's timezone rather than the server's.
import type { Request } from 'express';

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function localDay(req: Request): string {
  const header = req.header('x-local-day');
  if (header && DAY_RE.test(header)) return header;
  return new Date().toISOString().slice(0, 10);
}

export function shiftDay(day: string, delta: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** Consecutive days ending today (or yesterday, so a streak isn't "lost" before today's check-in). */
export function computeStreak(days: Set<string>, today: string): number {
  let cursor = days.has(today) ? today : shiftDay(today, -1);
  let streak = 0;
  while (days.has(cursor)) {
    streak++;
    cursor = shiftDay(cursor, -1);
  }
  return streak;
}
