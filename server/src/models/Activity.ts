import { Schema, model } from 'mongoose';

export const ACTIVITY_KINDS = ['breathing', 'reflection', 'affirmation', 'challenge', 'checkin', 'chat'] as const;

const activitySchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    kind: { type: String, enum: ACTIVITY_KINDS, required: true },
    minutes: { type: Number, default: 0 },
    meta: { type: Schema.Types.Mixed, default: {} },
    day: { type: String, required: true },
  },
  { timestamps: true },
);

export const Activity = model('Activity', activitySchema);
