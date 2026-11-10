import { Schema, model } from 'mongoose';

// Per-user, per-day generated content (affirmation, challenge) so it stays stable all day.
const dailySchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    day: { type: String, required: true },
    affirmation: { type: String, required: true },
    challenge: { type: String, required: true },
    challengeDone: { type: Boolean, default: false },
    insight: { type: String, default: '' },
  },
  { timestamps: true },
);
dailySchema.index({ user: 1, day: 1 }, { unique: true });

export const Daily = model('Daily', dailySchema);
