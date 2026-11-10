import { Schema, model } from 'mongoose';

export const MOODS = ['radiant', 'good', 'okay', 'low', 'struggling'] as const;
export type MoodLevel = (typeof MOODS)[number];
export const MOOD_SCORE: Record<MoodLevel, number> = { radiant: 5, good: 4, okay: 3, low: 2, struggling: 1 };

const moodSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    mood: { type: String, enum: MOODS, required: true },
    score: { type: Number, min: 1, max: 5, required: true },
    tags: { type: [String], default: [] },
    note: { type: String, default: '' },
    // Day key in the user's local time (YYYY-MM-DD) so streaks respect their timezone.
    day: { type: String, required: true },
  },
  { timestamps: true },
);

export const Mood = model('Mood', moodSchema);
